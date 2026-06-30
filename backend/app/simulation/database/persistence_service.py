"""Persistence service for coordinating transaction-safe simulation database writes."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Simulation, SimulationStatus
from app.simulation.database.models import (
    SimulationArtifact,
    SimulationExecution,
    SimulationLog,
    SimulationMetric,
    SimulationParameter,
    SimulationResult,
    WorkspaceSnapshot,
)
from app.simulation.database.repository import (
    ArtifactRepository,
    SimulationExecutionRepository,
    SimulationRepository,
)
from app.simulation.service.simulation_service import SimulationResponse, SimulationRequest
from app.simulation.service.state_manager import PipelineState

logger = logging.getLogger(__name__)


class SimulationPersistenceService:
    """Orchestrates high-level, atomic database persistence for simulation runs."""

    def __init__(self) -> None:
        pass

    async def save_simulation_run(
        self,
        session: AsyncSession,
        request: SimulationRequest,
        response: SimulationResponse,
        project_id: str,
        user_id: str,
    ) -> SimulationExecution:
        """Atomically persist a complete simulation run including all execution metadata,

        timings, metrics, logs, parameters, and generated file artifacts.

        Args:
            session: The active SQLAlchemy AsyncSession.
            request: The SimulationRequest parameters.
            response: The SimulationResponse containing results and execution summary.
            project_id: The UUID of the project.
            user_id: The UUID of the user.

        Returns:
            The created and persisted SimulationExecution instance.

        Raises:
            Exception: If any database write fails, triggering an automatic rollback.
        """
        summary = response.summary
        sim_id = request.simulation_id

        # Eagerly map dates
        start_dt = datetime.fromisoformat(summary.start_time.rstrip("Z"))
        end_dt = datetime.fromisoformat(summary.end_time.rstrip("Z")) if summary.end_time else datetime.utcnow()

        # Map PipelineState to SimulationStatus
        if summary.status == PipelineState.COMPLETED:
            db_status = SimulationStatus.completed
        elif summary.status in (PipelineState.FAILED, PipelineState.CANCELLED):
            db_status = SimulationStatus.failed
        else:
            db_status = SimulationStatus.running

        # Wrap in a nested transaction (Savepoint) to guarantee atomicity
        async with session.begin_nested():
            logger.info("Beginning database transaction for simulation run '%s'...", sim_id)

            # 1. Resolve or Create Simulation Root
            sim_repo = SimulationRepository(session)
            db_sim = await sim_repo.get_by_id(sim_id)

            error_msg = summary.errors[0] if summary.errors else None

            if db_sim:
                logger.info("Updating existing Simulation record: %s", sim_id)
                db_sim.status = db_status
                db_sim.results = response.results
                db_sim.error_message = error_msg
                db_sim.runtime_seconds = summary.total_runtime_seconds
                db_sim.finished_at = end_dt
                db_sim.artifact_path = summary.workspace_path
                # Check if workspace was retained
                db_sim.artifact_retained = (
                    summary.workspace_path is not None 
                    and request.rollback_policy.value != "DELETE_ALL" 
                    and not (request.rollback_policy.value == "DELETE_ON_SUCCESS" and summary.status == PipelineState.COMPLETED)
                )
                await sim_repo.update(db_sim)
            else:
                logger.info("Creating new Simulation record: %s", sim_id)
                db_sim = Simulation(
                    id=sim_id,
                    project_id=project_id,
                    solver=request.solver_type,
                    status=db_status,
                    config=request.user_settings,
                    results=response.results,
                    error_message=error_msg,
                    runtime_seconds=summary.total_runtime_seconds,
                    started_at=start_dt,
                    finished_at=end_dt,
                    artifact_path=summary.workspace_path,
                    artifact_retained=(
                        summary.workspace_path is not None 
                        and request.rollback_policy.value != "DELETE_ALL" 
                        and not (request.rollback_policy.value == "DELETE_ON_SUCCESS" and summary.status == PipelineState.COMPLETED)
                    ),
                    created_at=start_dt,
                )
                await sim_repo.create(db_sim)

            # 2. Save Simulation Parameters (For reproducibility)
            # Store design_payload, settings, terminal names, qubits, etc.
            params = [
                SimulationParameter(simulation_id=sim_id, parameter_key="design_payload", parameter_value=request.design_payload),
                SimulationParameter(simulation_id=sim_id, parameter_key="user_settings", parameter_value=request.user_settings),
            ]
            if request.terminal_names is not None:
                params.append(SimulationParameter(simulation_id=sim_id, parameter_key="terminal_names", parameter_value={"names": request.terminal_names}))
            if request.qubits is not None:
                params.append(SimulationParameter(simulation_id=sim_id, parameter_key="qubits", parameter_value={"qubits": request.qubits}))
            if request.port_names is not None:
                params.append(SimulationParameter(simulation_id=sim_id, parameter_key="port_names", parameter_value={"ports": request.port_names}))

            session.add_all(params)

            # 3. Create Simulation Execution
            # Extract metadata from summary
            geometry_meta = getattr(summary, "geometry_metadata", None)
            mesh_meta = getattr(summary, "mesh_metadata", None)
            config_meta = getattr(summary, "config_metadata", None)
            runner_meta = getattr(summary, "runner_metadata", None)
            artifacts_meta = getattr(summary, "artifacts_metadata", {})

            # Resolve mpi_version and config_checksum if available in metadata
            mpi_version = None
            config_checksum = None
            if config_meta and isinstance(config_meta, dict):
                config_checksum = config_meta.get("checksum")

            execution = SimulationExecution(
                simulation_id=sim_id,
                workspace_id=summary.workspace_path or "N/A",
                status=summary.status.value,
                palace_version=summary.palace_version,
                mpi_version=mpi_version,
                configuration_checksum=config_checksum,
                started_at=start_dt,
                ended_at=end_dt,
                duration_seconds=summary.total_runtime_seconds,
                geometry_metadata=geometry_meta,
                mesh_metadata=mesh_meta,
                config_metadata=config_meta,
                runner_metadata=runner_meta,
                execution_summary=summary.model_dump(),
                warnings=summary.warnings,
                errors=summary.errors,
            )
            
            exec_repo = SimulationExecutionRepository(session)
            await exec_repo.create(execution)

            # 4. Save Parsed Results linked to the Execution
            db_result = SimulationResult(
                execution_id=execution.id,
                simulation_id=sim_id,
                solver_type=request.solver_type,
                parsed_results=response.results,
            )
            session.add(db_result)

            # 5. Index File Artifacts
            if artifacts_meta:
                for file_key, meta in artifacts_meta.items():
                    db_artifact = SimulationArtifact(
                        execution_id=execution.id,
                        file_name=meta["file_name"],
                        path=meta["path"],
                        size=meta["size"],
                        checksum=meta["checksum"],
                        artifact_type=meta["artifact_type"],
                        retention_status="active",
                        created_at=datetime.fromisoformat(meta["created_at"].rstrip("Z")),
                    )
                    session.add(db_artifact)
            else:
                # Fallback: Index from generated_files list if metadata is empty (zero-size, empty checksum)
                for filepath in summary.generated_files:
                    from pathlib import Path
                    p = Path(filepath)
                    db_artifact = SimulationArtifact(
                        execution_id=execution.id,
                        file_name=p.name,
                        path=str(p),
                        size=0,
                        checksum="N/A",
                        artifact_type=self._resolve_artifact_type(p.name),
                        retention_status="active",
                    )
                    session.add(db_artifact)

            # 6. Save Timings & Metrics
            metrics = [
                SimulationMetric(execution_id=execution.id, metric_key="total_runtime", metric_value=summary.total_runtime_seconds)
            ]
            for phase_name, duration in summary.phase_timings.items():
                metrics.append(
                    SimulationMetric(
                        execution_id=execution.id,
                        metric_key=f"{phase_name}_duration",
                        metric_value=duration,
                    )
                )
            
            # Eagerly capture memory usage or other runner metrics if present
            if runner_meta and isinstance(runner_meta, dict):
                cpu_time = runner_meta.get("cpu_time_seconds")
                if cpu_time is not None:
                    metrics.append(SimulationMetric(execution_id=execution.id, metric_key="cpu_time", metric_value=float(cpu_time)))

            session.add_all(metrics)

            # 7. Write Logs
            # Create a comprehensive orchestrator log entry
            log_lines = [
                f"=== Simulation Execution Run {execution.id} ===",
                f"Status: {summary.status.value}",
                f"Start Time: {summary.start_time}",
                f"End Time: {summary.end_time}",
                f"Total Runtime: {summary.total_runtime_seconds} seconds",
                f"Palace Version: {summary.palace_version or 'N/A'}",
                "Phase Timings:",
            ]
            for phase_name, duration in summary.phase_timings.items():
                log_lines.append(f" - {phase_name}: {duration}s")
            
            if summary.warnings:
                log_lines.append("Warnings Captured:")
                for w in summary.warnings:
                    log_lines.append(f" [WARNING] {w}")
            
            if summary.errors:
                log_lines.append("Errors Captured:")
                for e in summary.errors:
                    log_lines.append(f" [ERROR] {e}")

            orchestrator_log = SimulationLog(
                execution_id=execution.id,
                log_type="orchestrator",
                content="\n".join(log_lines),
            )
            session.add(orchestrator_log)

            # 8. Create Workspace Snapshot
            snapshot = WorkspaceSnapshot(
                execution_id=execution.id,
                snapshot_metadata={
                    "root_path": summary.workspace_path,
                    "rollback_policy": request.rollback_policy.value,
                    "generated_files_count": len(summary.generated_files),
                },
            )
            session.add(snapshot)

            logger.info("Successfully persisted all records for simulation execution '%s'.", execution.id)
            return execution

    def _resolve_artifact_type(self, filename: str) -> str:
        """Resolve artifact type based on file extension and name."""
        fn = filename.lower()
        if fn.endswith(".msh"):
            return "mesh"
        elif fn.endswith(".step") or fn.endswith(".brep") or fn.endswith(".geo"):
            return "geometry"
        elif fn.endswith("config.json"):
            return "config"
        elif fn.endswith(".csv"):
            return "csv"
        elif fn.endswith(".log") or fn.endswith(".txt"):
            return "log"
        elif fn.endswith(".vtu") or fn.endswith(".pvd"):
            return "plot"
        else:
            return "other"
