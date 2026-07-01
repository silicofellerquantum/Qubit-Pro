"""AWS Batch execution backend for the Palace EM solver.

Implements the same public interface as :class:`PalaceRunner` so that
:class:`PipelineManager` can select between local and cloud execution via
``settings.compute_backend`` without branching inside the pipeline logic itself.

Environment / settings required:
    - ``AWS_BATCH_JOB_QUEUE``       – name of the target AWS Batch job queue.
    - ``AWS_BATCH_JOB_DEFINITION``  – ARN/name of the Batch job definition that
                                       includes the Palace container image.
    - ``AWS_DEFAULT_REGION``        – AWS region (standard boto3 env var).
    - ``AWS_ACCESS_KEY_ID`` /       – AWS credentials (standard boto3 env vars, or
      ``AWS_SECRET_ACCESS_KEY``       an attached IAM role is preferred in production).

Workspace contract:
    The Palace container in the job definition must mount the same workspace
    path (``workspace.config_path``) that the local runner uses.  In a
    production deployment this is typically backed by an EFS mount or an S3
    sync step that runs in the job's container init phase.

Progress callbacks:
    AWS Batch does not provide fine-grained real-time progress.  This
    implementation fires periodic coarse-grained progress updates while
    polling for job completion, preserving the ``on_progress`` contract so
    the pipeline layer and WebSocket push can continue to function.
"""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from app.simulation.workspace.workspace_manager import WorkspaceManager
from app.simulation.workspace.types import WorkspaceState

from app.simulation.runner.exceptions import (
    RunnerCancelledError,
    RunnerConfigurationError,
    RunnerExecutionError,
    RunnerTimeoutError,
)
from app.simulation.runner.constants import (
    DEFAULT_TIMEOUT_SECONDS,
    RUNNER_VERSION,
    METADATA_FILENAME,
)
from app.simulation.runner.runner_models import (
    RunnerMetadata,
    ProgressState,
    SimulationStage,
)
from app.simulation.runner.progress_tracker import ProgressTracker
from app.simulation.runner.log_manager import LogManager
from app.simulation.workspace.workspace_utils import write_json_atomic

logger = logging.getLogger(__name__)

# Poll interval while waiting for the Batch job to reach a terminal state.
_POLL_INTERVAL_SECONDS: float = 15.0
# Coarse progress increments sent while the job is running.
_PROGRESS_RUNNING_PCT: float = 50.0


class AWSBatchRunner:
    """Submits Palace simulations to AWS Batch and polls for completion.

    Exposes exactly the same ``run_simulation`` / ``cancel_simulation``
    signatures as :class:`PalaceRunner` so that :class:`PipelineManager` can
    swap between the two without any pipeline-level changes.
    """

    def __init__(
        self,
        workspace_manager: Optional[WorkspaceManager] = None,
        timeout_seconds: Optional[float] = None,
    ) -> None:
        self.workspace_manager = workspace_manager or WorkspaceManager()
        self.timeout_seconds = timeout_seconds
        # Maps simulation_id -> AWS Batch job ID (for cancellation support)
        self._active_batch_jobs: Dict[str, str] = {}

    # ------------------------------------------------------------------
    # Public interface — mirrors PalaceRunner
    # ------------------------------------------------------------------

    async def run_simulation(
        self,
        simulation_id: str,
        np: int = 1,
        user_settings: Optional[Dict[str, Any]] = None,
        on_progress: Optional[Callable[[ProgressState], None]] = None,
    ) -> RunnerMetadata:
        """Submit a Palace simulation to AWS Batch and wait for it to finish.

        Args:
            simulation_id: UUID of the target simulation workspace.
            np: Number of MPI processes (mapped to ``vcpus`` in the Batch
                job override, if the job definition supports it).
            user_settings: Optional dict with overrides (e.g.
                ``job_queue``, ``job_definition``, ``timeout_seconds``).
            on_progress: Optional progress callback.

        Returns:
            Populated :class:`RunnerMetadata`.

        Raises:
            RunnerConfigurationError: Missing workspace or config files.
            RunnerExecutionError: Batch job failed or was not submitted.
            RunnerTimeoutError: Job did not complete within the timeout.
            RunnerCancelledError: Job was explicitly cancelled.
        """
        user_settings = user_settings or {}
        start_dt = datetime.utcnow()
        start_str = start_dt.isoformat() + "Z"

        # 1. Validate workspace
        try:
            workspace = self.workspace_manager.get_workspace(simulation_id)
        except Exception as e:
            raise RunnerConfigurationError(
                f"Workspace not found for simulation '{simulation_id}': {e}"
            ) from e

        config_dir = Path(workspace.config_path)
        mesh_dir = Path(workspace.mesh_path)
        logs_dir = Path(workspace.log_path)

        if not (config_dir / "config.json").exists():
            raise RunnerConfigurationError(
                f"Required configuration file missing: '{config_dir / 'config.json'}'"
            )
        if not (mesh_dir / "mesh.msh").exists():
            raise RunnerConfigurationError(
                f"Required mesh file missing: '{mesh_dir / 'mesh.msh'}'"
            )

        log_manager = LogManager(logs_dir)
        log_manager.log_runner(
            f"AWSBatchRunner: submitting simulation {simulation_id} to AWS Batch..."
        )

        # 2. Resolve configuration
        timeout_val = float(
            user_settings.get("timeout_seconds")
            or self.timeout_seconds
            or DEFAULT_TIMEOUT_SECONDS
        )

        job_queue = user_settings.get("job_queue") or self._get_setting(
            "AWS_BATCH_JOB_QUEUE", "palace-job-queue"
        )
        job_definition = user_settings.get("job_definition") or self._get_setting(
            "AWS_BATCH_JOB_DEFINITION", "palace-job-definition"
        )

        tracker = ProgressTracker(on_progress)
        tracker.update_state(
            SimulationStage.LAUNCHING_PALACE, 5.0, "Submitting job to AWS Batch..."
        )

        self.workspace_manager.update_workspace_status(simulation_id, WorkspaceState.IN_USE)

        # 3. Submit the Batch job
        batch_job_id: Optional[str] = None
        try:
            batch_job_id = await self._submit_batch_job(
                simulation_id=simulation_id,
                job_queue=job_queue,
                job_definition=job_definition,
                np=np,
                workspace_config_path=str(config_dir),
                log_manager=log_manager,
            )
        except Exception as e:
            err = f"Failed to submit AWS Batch job: {e}"
            log_manager.log_runner(err, "ERROR")
            self.workspace_manager.update_workspace_status(
                simulation_id, WorkspaceState.FAILED, err
            )
            raise RunnerExecutionError(err) from e

        self._active_batch_jobs[simulation_id] = batch_job_id
        log_manager.log_runner(f"AWS Batch job submitted: {batch_job_id}")
        tracker.update_state(
            SimulationStage.LAUNCHING_PALACE,
            10.0,
            f"Batch job {batch_job_id} queued.",
        )

        # 4. Poll until terminal state
        termination_reason = "completed"
        exit_code = 0
        try:
            status, exit_code = await self._poll_until_done(
                batch_job_id=batch_job_id,
                simulation_id=simulation_id,
                timeout_val=timeout_val,
                tracker=tracker,
                log_manager=log_manager,
            )
        except RunnerTimeoutError:
            termination_reason = "timeout"
            exit_code = -1
            await self._cancel_batch_job(batch_job_id, log_manager)
            tracker.update_state(SimulationStage.FAILED, 100.0, "AWS Batch job timed out.")
            self.workspace_manager.update_workspace_status(
                simulation_id,
                WorkspaceState.FAILED,
                f"AWS Batch job timed out after {timeout_val}s.",
            )
        except RunnerCancelledError:
            termination_reason = "cancelled"
            exit_code = -1
            tracker.update_state(SimulationStage.CANCELLED, 100.0, "Job cancelled.")
            self.workspace_manager.update_workspace_status(
                simulation_id, WorkspaceState.FAILED, "Simulation cancelled by user."
            )
        except Exception as e:
            termination_reason = "failed"
            exit_code = -2
            log_manager.log_runner(f"Batch polling failed unexpectedly: {e}", "ERROR")
            tracker.update_state(SimulationStage.FAILED, 100.0, f"Batch error: {e}")
            self.workspace_manager.update_workspace_status(
                simulation_id, WorkspaceState.FAILED, str(e)
            )
        else:
            if exit_code == 0:
                termination_reason = "completed"
                tracker.update_state(
                    SimulationStage.COMPLETED, 100.0, "AWS Batch job completed."
                )
                self.workspace_manager.update_workspace_status(
                    simulation_id, WorkspaceState.COMPLETED
                )
            else:
                termination_reason = "failed"
                tracker.update_state(
                    SimulationStage.FAILED,
                    100.0,
                    f"Batch job exited with status {status} (exit={exit_code}).",
                )
                self.workspace_manager.update_workspace_status(
                    simulation_id,
                    WorkspaceState.FAILED,
                    f"Batch job failed: status={status}",
                )
        finally:
            self._active_batch_jobs.pop(simulation_id, None)

        end_dt = datetime.utcnow()
        end_str = end_dt.isoformat() + "Z"
        duration = (end_dt - start_dt).total_seconds()

        metadata = RunnerMetadata(
            execution_id=batch_job_id or str(uuid.uuid4()),
            workspace_id=simulation_id,
            runner_version=RUNNER_VERSION,
            palace_version="aws_batch",
            mpi_version=None,
            start_time=start_str,
            end_time=end_str,
            duration_seconds=duration,
            exit_code=exit_code,
            termination_reason=termination_reason,
            command=[f"aws_batch:{job_queue}/{job_definition}"],
            environment={"compute_backend": "aws_batch"},
            processor_count=np,
        )

        metadata_file = logs_dir / METADATA_FILENAME
        try:
            write_json_atomic(metadata_file, metadata.model_dump())
        except Exception as me:
            log_manager.log_runner(f"Failed to write metadata file: {me}", "WARNING")

        if termination_reason == "timeout":
            raise RunnerTimeoutError(
                f"AWS Batch simulation timed out after {timeout_val} seconds."
            )
        if termination_reason == "cancelled":
            raise RunnerCancelledError("AWS Batch simulation was cancelled.")
        if termination_reason == "failed":
            raise RunnerExecutionError(
                f"AWS Batch simulation failed (exit={exit_code}). "
                f"Check CloudWatch logs for job {batch_job_id}."
            )

        return metadata

    async def cancel_simulation(self, simulation_id: str) -> None:
        """Cancel an active AWS Batch job by its simulation ID.

        Args:
            simulation_id: UUID of the simulation to cancel.
        """
        batch_job_id = self._active_batch_jobs.get(simulation_id)
        if not batch_job_id:
            logger.warning(
                "No active Batch job found for simulation '%s'.", simulation_id
            )
            return
        logger.warning(
            "Cancelling AWS Batch job %s for simulation %s.", batch_job_id, simulation_id
        )
        await self._cancel_batch_job(batch_job_id, log_manager=None)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _get_setting(env_var: str, default: str) -> str:
        import os
        return os.environ.get(env_var, default)

    async def _submit_batch_job(
        self,
        simulation_id: str,
        job_queue: str,
        job_definition: str,
        np: int,
        workspace_config_path: str,
        log_manager: LogManager,
    ) -> str:
        """Submit a job to AWS Batch and return the assigned Batch job ID.

        The container entry point in the job definition must accept
        ``--simulation-id <id>`` and ``--np <n>`` arguments (or equivalent
        environment variable overrides), and must have network / EFS access to
        the workspace path.
        """
        import boto3  # type: ignore[import]

        loop = asyncio.get_event_loop()

        def _submit() -> str:
            client = boto3.client("batch")
            resp = client.submit_job(
                jobName=f"palace-{simulation_id[:8]}",
                jobQueue=job_queue,
                jobDefinition=job_definition,
                containerOverrides={
                    "command": [
                        "--simulation-id", simulation_id,
                        "--np", str(np),
                    ],
                    "environment": [
                        {"name": "SIMULATION_ID", "value": simulation_id},
                        {"name": "NP", "value": str(np)},
                        {"name": "WORKSPACE_CONFIG_PATH", "value": workspace_config_path},
                    ],
                    # Scale vCPUs with MPI rank count
                    "vcpus": max(1, np),
                },
            )
            return resp["jobId"]

        job_id: str = await loop.run_in_executor(None, _submit)
        log_manager.log_runner(f"Batch submit_job succeeded: jobId={job_id}")
        return job_id

    async def _poll_until_done(
        self,
        batch_job_id: str,
        simulation_id: str,
        timeout_val: float,
        tracker: ProgressTracker,
        log_manager: LogManager,
    ) -> tuple[str, int]:
        """Poll AWS Batch until the job reaches a terminal state.

        Returns:
            (status_string, exit_code) tuple.

        Raises:
            RunnerTimeoutError: Timeout exceeded.
            RunnerCancelledError: External cancellation detected.
        """
        import boto3  # type: ignore[import]

        deadline = time.monotonic() + timeout_val
        loop = asyncio.get_event_loop()
        prev_status = ""
        progress_pct = _PROGRESS_RUNNING_PCT

        TERMINAL = {"SUCCEEDED", "FAILED"}

        while True:
            if time.monotonic() > deadline:
                raise RunnerTimeoutError("Deadline exceeded.")

            def _describe() -> dict:
                client = boto3.client("batch")
                resp = client.describe_jobs(jobs=[batch_job_id])
                jobs = resp.get("jobs", [])
                return jobs[0] if jobs else {}

            try:
                job_info = await loop.run_in_executor(None, _describe)
            except Exception as e:
                log_manager.log_runner(f"describe_jobs failed: {e} (will retry)", "WARNING")
                await asyncio.sleep(_POLL_INTERVAL_SECONDS)
                continue

            status = job_info.get("status", "UNKNOWN")
            if status != prev_status:
                log_manager.log_runner(f"Batch job {batch_job_id}: status={status}")
                prev_status = status

            if status in TERMINAL:
                exit_code = 0
                if status == "FAILED":
                    attempts = job_info.get("attempts", [])
                    if attempts:
                        exit_code = attempts[-1].get("container", {}).get("exitCode", 1) or 1
                    else:
                        exit_code = 1
                return status, exit_code

            # Coarse progress update while running
            if status == "RUNNING":
                tracker.update_state(
                    SimulationStage.RUNNING_PALACE,
                    min(progress_pct, 90.0),
                    f"AWS Batch job running ({batch_job_id})...",
                )
                progress_pct = min(progress_pct + 5.0, 90.0)

            await asyncio.sleep(_POLL_INTERVAL_SECONDS)

    async def _cancel_batch_job(
        self, batch_job_id: str, log_manager: Optional[LogManager]
    ) -> None:
        """Terminate a running / queued AWS Batch job."""
        try:
            import boto3  # type: ignore[import]
            import asyncio as _asyncio

            loop = _asyncio.get_event_loop()

            def _terminate() -> None:
                client = boto3.client("batch")
                client.terminate_job(
                    jobId=batch_job_id,
                    reason="Simulation cancelled by PipelineManager.",
                )

            await loop.run_in_executor(None, _terminate)
            if log_manager:
                log_manager.log_runner(f"Batch job {batch_job_id} termination requested.")
        except Exception as e:
            logger.error("Failed to cancel Batch job %s: %s", batch_job_id, e)
