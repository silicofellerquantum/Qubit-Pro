"""Core Palace simulation runner service orchestrating execution, logs, and process lifecycle."""

from __future__ import annotations

import asyncio
import logging
import os
import platform
import shutil
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Tuple

from app.simulation.workspace.workspace_manager import WorkspaceManager
from app.simulation.workspace.types import WorkspaceState
from app.simulation.workspace.workspace_utils import write_json_atomic

from app.simulation.runner.exceptions import (
    PalaceExecutableNotFoundError,
    MPIUnavailableError,
    RunnerTimeoutError,
    RunnerCancelledError,
    RunnerExecutionError,
    RunnerConfigurationError,
    RunnerEnvironmentError,
    ProcessLaunchError,
)
from app.simulation.runner.constants import (
    DEFAULT_TIMEOUT_SECONDS,
    DEFAULT_CANCEL_GRACE_PERIOD,
    DEFAULT_MPI_LAUNCHER,
    RUNNER_VERSION,
    METADATA_FILENAME,
)
from app.simulation.runner.runner_models import (
    RunnerMetadata,
    ProgressState,
    SimulationStage,
)
from app.simulation.runner.process_manager import ProcessManager
from app.simulation.runner.progress_tracker import ProgressTracker
from app.simulation.runner.log_manager import LogManager
from app.simulation.runner.timeout_manager import TimeoutManager

logger = logging.getLogger(__name__)


class PalaceRunner:
    """Orchestrates parallel and serial execution of the AWS Palace EM solver."""

    def __init__(
        self,
        workspace_manager: Optional[WorkspaceManager] = None,
        palace_path: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
    ) -> None:
        """Initialize the PalaceRunner.

        Args:
            workspace_manager: Optional WorkspaceManager. Defaults to a new instance.
            palace_path: Optional explicit path to the Palace executable.
            timeout_seconds: Optional default timeout duration in seconds.
        """
        self.workspace_manager = workspace_manager or WorkspaceManager()
        self.palace_path = palace_path
        self.timeout_seconds = timeout_seconds
        
        # Maps simulation_id -> (ProcessManager, TimeoutManager) to support multi-concurrency and cancellation
        self.active_runs: Dict[str, Tuple[ProcessManager, TimeoutManager]] = {}

    async def run_simulation(
        self,
        simulation_id: str,
        np: int = 1,
        user_settings: Optional[Dict[str, Any]] = None,
        on_progress: Optional[Callable[[ProgressState], None]] = None,
    ) -> RunnerMetadata:
        """Execute a Palace simulation asynchronously in the workspace.

        Args:
            simulation_id: The UUID string of the target simulation.
            np: Number of MPI processes to request (default 1).
            user_settings: Optional solver options or overrides.
            on_progress: Optional callback function triggered on simulation progress updates.

        Returns:
            The populated RunnerMetadata model.

        Raises:
            RunnerConfigurationError: If workspace config/mesh files are missing.
            PalaceExecutableNotFoundError: If Palace cannot be located.
            MPIUnavailableError: If parallel execution is requested but MPI launcher is missing.
            RunnerTimeoutError: If execution exceeds timeout duration.
            RunnerCancelledError: If execution is cancelled.
            RunnerExecutionError: If Palace crashes or exits with a non-zero code.
        """
        user_settings = user_settings or {}
        start_time_dt = datetime.utcnow()
        start_time_str = start_time_dt.isoformat() + "Z"

        # 1. Resolve and validate workspace directories
        try:
            workspace = self.workspace_manager.get_workspace(simulation_id)
        except Exception as e:
            raise RunnerConfigurationError(f"Workspace not found for simulation '{simulation_id}': {e}") from e

        config_dir = Path(workspace.config_path)
        mesh_dir = Path(workspace.mesh_path)
        logs_dir = Path(workspace.log_path)

        config_file = config_dir / "config.json"
        mesh_file = mesh_dir / "mesh.msh"

        if not config_file.exists():
            raise RunnerConfigurationError(f"Required configuration file missing: '{config_file}'")
        if not mesh_file.exists():
            raise RunnerConfigurationError(f"Required mesh file missing: '{mesh_file}'")

        # 2. Setup Logging
        log_manager = LogManager(logs_dir)
        log_manager.log_runner(f"Starting execution lifecycle for simulation {simulation_id}...")
        log_manager.log_runner(f"Processor count: {np}")

        # 3. Locate and validate Palace executable
        try:
            palace_exec = self._detect_palace_executable(user_settings)
            log_manager.log_runner(f"Located Palace executable: {palace_exec}")
        except PalaceExecutableNotFoundError as e:
            log_manager.log_runner(f"Palace location failure: {e}", "ERROR")
            self.workspace_manager.update_workspace_status(
                simulation_id, WorkspaceState.FAILED, str(e)
            )
            raise e

        palace_ver = self._get_palace_version(palace_exec)
        log_manager.log_runner(f"Detected Palace version: {palace_ver}")

        # 4. Resolve MPI launcher if running in parallel
        mpi_launcher = user_settings.get("launcher", DEFAULT_MPI_LAUNCHER)
        mpi_ver = None
        if np > 1:
            if not shutil.which(mpi_launcher):
                err_msg = f"Parallel execution requested with {np} procs, but launcher '{mpi_launcher}' is not in PATH."
                log_manager.log_runner(err_msg, "ERROR")
                self.workspace_manager.update_workspace_status(
                    simulation_id, WorkspaceState.FAILED, err_msg
                )
                raise MPIUnavailableError(err_msg)
            mpi_ver = self._get_mpi_version(mpi_launcher)
            log_manager.log_runner(f"Detected MPI launcher version: {mpi_ver}")

        # 5. Resolve Timeout
        timeout_val = user_settings.get("timeout_seconds")
        if timeout_val is None:
            timeout_val = self.timeout_seconds
        if timeout_val is None:
            try:
                timeout_val = float(os.getenv("PALACE_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS)))
            except ValueError:
                timeout_val = DEFAULT_TIMEOUT_SECONDS
        timeout_val = float(timeout_val)

        log_manager.log_runner(f"Configured execution timeout: {timeout_val} seconds")

        # 6. Build execution command
        # Palace launcher arguments syntax:
        # palace [OPTIONS] CONFIG_FILE
        cmd = [palace_exec]
        if np > 1:
            cmd.extend(["-np", str(np)])
            # Apply custom launcher arguments if provided
            launcher_args = user_settings.get("launcher_args")
            if launcher_args:
                cmd.extend(["-launcher-args", launcher_args])
        else:
            cmd.append("-serial")

        # Config file is in current directory inside cwd (config_dir)
        cmd.append("config.json")

        # Capture environment
        captured_env = self._capture_environment()
        run_env = dict(os.environ)

        # 7. Initialize Subprocess and Timeout Managers
        process_manager = ProcessManager()
        timeout_manager = TimeoutManager()
        self.active_runs[simulation_id] = (process_manager, timeout_manager)

        # Initialize Progress
        tracker = ProgressTracker(on_progress)
        tracker.update_state(SimulationStage.LAUNCHING_PALACE, 5.0, "Spawning solver process...")

        self.workspace_manager.update_workspace_status(simulation_id, WorkspaceState.IN_USE)

        termination_reason = "completed"
        exit_code = 0

        # Define internal timeout callback
        async def on_timeout_triggered():
            log_manager.log_runner("Simulation execution timed out!", "ERROR")
            await process_manager.terminate(DEFAULT_CANCEL_GRACE_PERIOD)

        try:
            # Spawn process inside config_dir
            await process_manager.spawn(cmd, env=run_env, cwd=config_dir)
            log_manager.log_runner(f"Solver process spawned with PID {process_manager.pid}")

            # Start asynchronous timeout timer
            timeout_manager.start(timeout_val, on_timeout_triggered)

            # Read stream pipelines asynchronously
            await process_manager.read_streams(
                on_stdout=lambda line: (log_manager.log_stdout(line), tracker.parse_line(line)),
                on_stderr=lambda line: (log_manager.log_stderr(line), log_manager.log_runner(line, "WARNING")),
            )

            # Wait for exit code
            exit_code = await process_manager.wait()
            log_manager.log_runner(f"Solver process completed with exit code {exit_code}")

        except asyncio.CancelledError:
            # Triggered if task is cancelled externally
            termination_reason = "cancelled"
            log_manager.log_runner("Simulation task cancelled externally.", "WARNING")
            await process_manager.terminate(DEFAULT_CANCEL_GRACE_PERIOD)
            exit_code = -1
        except Exception as ex:
            termination_reason = "failed"
            log_manager.log_runner(f"Subprocess launch or execution failed: {ex}", "ERROR")
            exit_code = -2
        finally:
            # Ensure timer is cancelled immediately
            timeout_manager.cancel()
            self.active_runs.pop(simulation_id, None)

        # 8. Check termination state and finalize metadata
        end_time_dt = datetime.utcnow()
        end_time_str = end_time_dt.isoformat() + "Z"
        duration = (end_time_dt - start_time_dt).total_seconds()

        # Assess why the run terminated
        if process_manager._terminated_or_killed:
            if duration >= timeout_val - 2.0:  # Allow small margin for timer delay
                termination_reason = "timeout"
                tracker.update_state(SimulationStage.FAILED, 100.0, "Simulation timed out.")
                self.workspace_manager.update_workspace_status(
                    simulation_id, WorkspaceState.FAILED, f"Simulation timed out after {timeout_val}s."
                )
            else:
                termination_reason = "cancelled"
                tracker.update_state(SimulationStage.CANCELLED, 100.0, "Simulation cancelled by user.")
                self.workspace_manager.update_workspace_status(
                    simulation_id, WorkspaceState.FAILED, "Simulation cancelled by user."
                )
        elif exit_code != 0:
            termination_reason = "failed"
            tracker.update_state(SimulationStage.FAILED, 100.0, f"Solver exited with code {exit_code}.")
            self.workspace_manager.update_workspace_status(
                simulation_id, WorkspaceState.FAILED, f"Solver exited with non-zero code {exit_code}."
            )
        else:
            termination_reason = "completed"
            tracker.update_state(SimulationStage.COMPLETED, 100.0, "Simulation completed successfully.")
            self.workspace_manager.update_workspace_status(simulation_id, WorkspaceState.COMPLETED)

        # Construct metadata Pydantic model
        metadata = RunnerMetadata(
            execution_id=str(uuid.uuid4()) if termination_reason != "failed" else "failed",
            workspace_id=simulation_id,
            runner_version=RUNNER_VERSION,
            palace_version=palace_ver,
            mpi_version=mpi_ver,
            start_time=start_time_str,
            end_time=end_time_str,
            duration_seconds=duration,
            exit_code=exit_code,
            termination_reason=termination_reason,
            command=cmd,
            environment=captured_env,
            processor_count=np,
        )

        # Write runner_metadata.json to workspace logs directory
        metadata_file = logs_dir / METADATA_FILENAME
        try:
            write_json_atomic(metadata_file, metadata.model_dump())
            log_manager.log_runner(f"Execution metadata successfully written to {metadata_file}")
        except Exception as me:
            log_manager.log_runner(f"Failed to write metadata file: {me}", "WARNING")

        # Raise appropriate exception to caller if execution was not successful
        if termination_reason == "timeout":
            raise RunnerTimeoutError(f"Palace simulation timed out after {timeout_val} seconds.")
        elif termination_reason == "cancelled":
            raise RunnerCancelledError("Palace simulation run was explicitly cancelled.")
        elif termination_reason == "failed":
            raise RunnerExecutionError(
                f"Palace simulation execution failed with exit code {exit_code}. "
                f"Check logs under {logs_dir} for details."
            )

        return metadata

    async def cancel_simulation(self, simulation_id: str) -> None:
        """Cancel an active simulation by its simulation ID.

        Args:
            simulation_id: The UUID of the running simulation.
        """
        run = self.active_runs.get(simulation_id)
        if not run:
            logger.warning("No active running simulation found for ID '%s' to cancel.", simulation_id)
            return

        process_manager, timeout_manager = run
        logger.warning("External cancellation requested for simulation '%s'", simulation_id)
        
        # Trigger process termination. This causes wait() to exit and the main runner block to finalize
        await process_manager.terminate(DEFAULT_CANCEL_GRACE_PERIOD)

    def _detect_palace_executable(self, user_settings: Dict[str, Any]) -> str:
        """Dynamically detect the Palace executable path.

        Priority:
        1. User overrides in settings
        2. System PATH lookup
        3. Spack installation directory
        4. Standard fallback locations

        Returns:
            Absolute path string to the executable.
        """
        # 1. Check user override
        override_path = user_settings.get("palace_path") or self.palace_path
        if override_path:
            if os.path.exists(override_path) and os.access(override_path, os.X_OK):
                return str(Path(override_path).resolve())
            raise PalaceExecutableNotFoundError(
                f"Configured Palace path '{override_path}' does not exist or lacks execute permissions."
            )

        # 2. Check system PATH
        system_path = shutil.which("palace")
        if system_path:
            return str(Path(system_path).resolve())

        # 3. Check Spack installation
        spack_path = shutil.which("spack")
        if spack_path:
            try:
                proc = subprocess.run(
                    ["spack", "location", "-i", "palace"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    check=False,
                )
                if proc.returncode == 0:
                    prefix = proc.stdout.strip()
                    binary_path = Path(prefix) / "bin" / "palace"
                    if binary_path.exists() and os.access(binary_path, os.X_OK):
                        return str(binary_path.resolve())
            except Exception:
                pass

        # 4. Fallback search in standard directories
        standard_spack_roots = [
            Path.home() / "spack" / "opt" / "spack",
            Path("/opt/spack"),
        ]
        for root in standard_spack_roots:
            if root.exists():
                for p in root.glob("**/bin/palace"):
                    if os.access(p, os.X_OK):
                        return str(p.resolve())

        raise PalaceExecutableNotFoundError(
            "Palace executable could not be located. Please configure it explicitly or ensure Spack/PATH is set up."
        )

    def _get_palace_version(self, path: str) -> str:
        """Query the Palace binary to extract its version hash or tag.

        Args:
            path: Path to the palace launcher script.

        Returns:
            Version string.
        """
        binary_dir = Path(path).parent
        # Look for the compiled binary sibling (e.g., palace-x86_64.bin)
        compiled_bins = list(binary_dir.glob("palace-*.bin"))
        if compiled_bins:
            try:
                proc = subprocess.run(
                    [str(compiled_bins[0]), "--version"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=2.0,
                )
                if proc.returncode == 0:
                    return proc.stdout.strip().replace("Palace version: ", "")
            except Exception:
                pass

        # Fallback: parse version from the Spack prefix path
        # e.g., /opt/spack/.../palace-0.16.0-hash
        for part in Path(path).parts:
            if part.startswith("palace-") and len(part.split("-")) >= 2:
                return part.split("-")[1]

        return "unknown"

    def _get_mpi_version(self, launcher: str) -> Optional[str]:
        """Query the MPI launcher to extract its version.

        Args:
            launcher: Name or path of the launcher (e.g. mpirun).

        Returns:
            MPI version string or None.
        """
        launcher_path = shutil.which(launcher)
        if launcher_path:
            try:
                proc = subprocess.run(
                    [launcher_path, "--version"],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True,
                    timeout=2.0,
                )
                if proc.returncode == 0:
                    lines = proc.stdout.splitlines()
                    if lines:
                        return lines[0].strip()
            except Exception:
                pass
        return None

    def _capture_environment(self) -> Dict[str, str]:
        """Capture OS, architecture, and core environment variables for reproducibility."""
        env = {}
        # Core variables
        for var in ["PATH", "LD_LIBRARY_PATH", "SPACK_ROOT", "OMP_NUM_THREADS"]:
            val = os.getenv(var)
            if val is not None:
                env[var] = val
        
        # MPI specific variables
        for k, v in os.environ.items():
            if k.startswith("OMPI_") or k.startswith("PMI_") or k.startswith("MPI_"):
                env[k] = v

        # System details
        env["PYTHON_VERSION"] = sys.version.split()[0]
        env["OS_SYSTEM"] = platform.system()
        env["OS_RELEASE"] = platform.release()
        env["OS_VERSION"] = platform.version()
        env["ARCHITECTURE"] = platform.machine()
        return env
