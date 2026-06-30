"""FastAPI Router for Simulation Management.

Exposes the production-grade Simulation Orchestrator and Repository layers.
This router is thin and contains no business logic.
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
import shutil
import zipfile
import io
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query, status
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.config import settings
from app.database import get_db, AsyncSessionLocal
from app.models import Project, Simulation, SimulationStatus, User
from app.simulation.service.simulation_service import (
    SimulationService,
    SimulationRequest,
    RollbackPolicy,
)
from app.simulation.service.state_manager import PipelineState
from app.simulation.database import (
    SimulationArtifact,
    SimulationExecution,
    SimulationLog,
    SimulationMetric,
    SimulationParameter,
    SimulationResult,
    WorkspaceSnapshot,
    SimulationRepository,
    SimulationExecutionRepository,
)
from app.simulation.queue import global_queue
from app.simulation.queue.models import SimulationJob, JobState
from app.core.logging import correlation_id_ctx

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/simulations", tags=["simulations"])

# Instantiate the thin orchestrator service
simulation_service = SimulationService()


# ── Request Models ────────────────────────────────────────────────────────────

class RunSimulationRequest(BaseModel):
    """Pydantic model representing a request to start a simulation."""
    project_id: str = Field(..., description="The unique UUID string associated with the project.")
    solver_type: str = Field("eigenmode", description="Solver type: eigenmode | electrostatic | magnetostatic | driven")
    user_settings: Dict[str, Any] = Field(default_factory=dict, description="Optional solver settings, np, etc.")
    terminal_names: Optional[List[str]] = Field(default=None, description="Capacitance/inductance terminal names.")
    qubits: Optional[List[Dict[str, Any]]] = Field(default=None, description="Qubit parameters for energy derivations.")
    port_names: Optional[List[str]] = Field(default=None, description="Port names for EPR junctions.")
    mesh_settings: Optional[Dict[str, Any]] = Field(default=None, description="Custom GMSH meshing parameters.")
    coarse_mesh: bool = Field(default=False, description="True for rapid coarse meshing.")
    rollback_policy: RollbackPolicy = Field(
        default=RollbackPolicy.DELETE_ON_SUCCESS,
        description="Workspace cleanup policy: DELETE_ALL | KEEP_ALL | DELETE_ON_SUCCESS"
    )


class RetrySimulationRequest(BaseModel):
    """Pydantic model representing a request to retry a simulation."""
    coarse_mesh: Optional[bool] = Field(default=None, description="Override coarse meshing setting.")
    rollback_policy: Optional[RollbackPolicy] = Field(default=None, description="Override rollback policy.")


# ── Response Models ───────────────────────────────────────────────────────────

class SimulationResponse(BaseModel):
    """Structured response model representing a simulation run."""
    id: str
    project_id: str
    solver: str
    status: str
    config: Dict[str, Any]
    results: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    runtime_seconds: Optional[float] = None
    memory_gb: Optional[float] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SimulationStatusResponse(BaseModel):
    """Model tracking the real-time status, phase, progress, and warnings of a run."""
    simulation_id: str
    status: str
    current_phase: Optional[str] = None
    progress: float
    runtime: float
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)


class SimulationHistoryResponse(BaseModel):
    """Paginated simulation history list with metadata."""
    total_count: int
    page: int
    page_size: int
    total_pages: int
    items: List[SimulationResponse]


class ArtifactResponse(BaseModel):
    """Details of a generated file artifact."""
    id: str
    file_name: str
    size: int
    checksum: str
    artifact_type: str
    created_at: datetime

    class Config:
        from_attributes = True


class LogResponse(BaseModel):
    """Structured simulation log entry."""
    id: str
    log_type: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class MetricResponse(BaseModel):
    """Timings and performance metrics."""
    metrics: Dict[str, float]


class WorkspaceResponse(BaseModel):
    """Workspace metadata scrubbed of sensitive filesystem paths."""
    workspace_id: str
    files_count: int
    total_size_bytes: int
    rollback_policy: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_sim_response(sim: Simulation) -> SimulationResponse:
    """Helper mapping database Simulation model to SimulationResponse Pydantic schema."""
    return SimulationResponse(
        id=sim.id,
        project_id=sim.project_id,
        solver=sim.solver,
        status=sim.status.value,
        config=sim.config,
        results=sim.results,
        error_message=sim.error_message,
        runtime_seconds=sim.runtime_seconds,
        memory_gb=sim.memory_gb,
        started_at=sim.started_at,
        finished_at=sim.finished_at,
        created_at=sim.created_at,
    )


async def _authorize_simulation(db: AsyncSession, simulation_id: str, user_id: str) -> Simulation:
    """Helper verifying that the simulation exists and belongs to a project owned by the user."""
    stmt = (
        select(Simulation)
        .join(Project, Simulation.project_id == Project.id)
        .where(Simulation.id == simulation_id, Project.owner_id == user_id)
    )
    result = await db.execute(stmt)
    sim = result.scalar_one_or_none()
    if not sim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Simulation not found or access unauthorized."
        )
    return sim


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/run", status_code=status.HTTP_201_CREATED, response_model=SimulationResponse)
async def run_simulation(
    body: RunSimulationRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SimulationResponse:
    """Starts a simulation run asynchronously by enqueuing a background job."""
    # 1. Authorize project ownership
    project = await db.scalar(
        select(Project).where(Project.id == body.project_id, Project.owner_id == user.id)
    )
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # 2. Geometry Validation: Do not run on empty designs
    payload = project.design_payload or {}
    if payload.get("design") and "placements" in payload["design"]:
        from app.services.design_synth.compiler import compile_schematic_to_v2_graph
        try:
            logger.info("Compiling schematic design document to V2 design graph for project %s...", project.id)
            payload = compile_schematic_to_v2_graph(payload)
            project.design_payload = payload
            db.add(project)
            await db.flush()
        except Exception as exc:
            logger.exception("Failed to compile schematic design to V2 design graph: %s", exc)

    placement = payload.get("placement", {})
    design = payload.get("design", {})
    freq_plan = payload.get("frequency_plan", {})
    v2_graph = payload.get("v2", {}).get("graph")

    has_components = bool(
        placement.get("qubits")
        or placement.get("resonators")
        or design.get("placements")
        or freq_plan.get("qubit_frequencies_GHz")
        or v2_graph
    )
    if not has_components:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot run simulation on an empty design. Please add qubits or resonators to your design first."
        )

    # 3. Create Simulation Record showing 'queued'
    sim_id = str(uuid.uuid4())
    sim = Simulation(
        id=sim_id,
        project_id=body.project_id,
        solver=body.solver_type,
        status=SimulationStatus.queued,
        config=body.user_settings,
        created_at=datetime.utcnow(),
    )
    db.add(sim)
    await db.commit()
    await db.refresh(sim)

    # 4. Enqueue Job in Background Queue
    job = SimulationJob(
        job_id=str(uuid.uuid4()),
        simulation_id=sim_id,
        project_id=body.project_id,
        user_id=user.id,
        solver_type=body.solver_type,
        design_payload=payload,
        user_settings=body.user_settings,
        terminal_names=body.terminal_names,
        qubits=body.qubits,
        port_names=body.port_names,
        mesh_settings=body.mesh_settings,
        coarse_mesh=body.coarse_mesh,
        rollback_policy=body.rollback_policy.value,
        priority=5,  # default priority
        correlation_id=correlation_id_ctx.get(),
    )
    await global_queue.enqueue(job)
    logger.info("Simulation enqueued successfully. Simulation ID: %s, Job ID: %s", sim_id, job.job_id)

    return _to_sim_response(sim)


@router.get("/{simulation_id}/status", response_model=SimulationStatusResponse)
async def get_simulation_status(
    simulation_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SimulationStatusResponse:
    """Returns the current phase, progress percentage, runtime, warnings, and errors of a run.

    Inspects both the active queue state and the database, falling back to history.
    """
    # Verify authorization
    await _authorize_simulation(db, simulation_id, user.id)

    # Check background queue first
    job = await global_queue.get_job(simulation_id)
    if job:
        # If job is in queue and active
        if job.state in (JobState.QUEUED, JobState.STARTING, JobState.RETRYING, JobState.RUNNING):
            progress_map = {
                JobState.QUEUED: 5.0,
                JobState.STARTING: 10.0,
                JobState.RETRYING: 15.0,
                JobState.RUNNING: job.progress if job.progress > 0 else 20.0,
            }
            progress = progress_map.get(job.state, 5.0)
            
            # Check local simulation service as a fallback for high-fidelity progress
            active_ctx = simulation_service.get_active_context(simulation_id)
            current_phase = job.current_phase or job.state.value
            warnings = job.warnings
            errors = [job.error_message] if job.error_message else []
            
            if active_ctx:
                phase_progress_map = {
                    PipelineState.REQUEST_RECEIVED: 10.0,
                    PipelineState.WORKSPACE_READY: 20.0,
                    PipelineState.GEOMETRY_READY: 40.0,
                    PipelineState.MESH_READY: 60.0,
                    PipelineState.CONFIG_READY: 70.0,
                    PipelineState.RUNNING: 80.0,
                    PipelineState.RESULTS_READY: 90.0,
                    PipelineState.COMPLETED: 100.0,
                    PipelineState.FAILED: 100.0,
                    PipelineState.CANCELLED: 100.0,
                }
                progress = phase_progress_map.get(active_ctx.status, progress)
                current_phase = active_ctx.current_phase or active_ctx.status.value
                warnings = active_ctx.warnings
                errors = active_ctx.errors

            runtime = 0.0
            if job.started_at:
                runtime = (datetime.utcnow() - job.started_at).total_seconds()
            elif job.enqueued_at:
                runtime = (datetime.utcnow() - job.enqueued_at).total_seconds()

            return SimulationStatusResponse(
                simulation_id=simulation_id,
                status=job.state.value,
                current_phase=current_phase,
                progress=progress,
                runtime=round(runtime, 2),
                warnings=warnings,
                errors=errors,
            )

    # Fallback to Database
    exec_repo = SimulationExecutionRepository(db)
    # Fetch the latest execution
    stmt = (
        select(SimulationExecution)
        .where(SimulationExecution.simulation_id == simulation_id)
        .order_by(SimulationExecution.started_at.desc())
        .limit(1)
    )
    res = await db.execute(stmt)
    execution = res.scalar_one_or_none()

    if execution:
        return SimulationStatusResponse(
            simulation_id=simulation_id,
            status=execution.status,
            current_phase="COMPLETED" if execution.status == "COMPLETED" else "FAILED",
            progress=100.0,
            runtime=execution.duration_seconds or 0.0,
            warnings=execution.warnings or [],
            errors=execution.errors or [],
        )

    # If no execution record exists yet, return the root record details
    sim = await db.get(Simulation, simulation_id)
    return SimulationStatusResponse(
        simulation_id=simulation_id,
        status=sim.status.value,
        current_phase=sim.status.value,
        progress=0.0,
        runtime=0.0,
        warnings=[],
        errors=[sim.error_message] if sim.error_message else [],
    )


@router.get("/{simulation_id}", response_model=SimulationResponse)
async def get_simulation_details(
    simulation_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SimulationResponse:
    """Returns complete details of a simulation run."""
    sim = await _authorize_simulation(db, simulation_id, user.id)
    return _to_sim_response(sim)


@router.get("/{simulation_id}/results", response_model=Dict[str, Any])
async def get_simulation_results(
    simulation_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Returns the parsed results (capacitance matrix, eigenfrequencies, etc.) from the run."""
    sim = await _authorize_simulation(db, simulation_id, user.id)
    if sim.status != SimulationStatus.completed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Simulation is in status '{sim.status.value}'. Results are only available for completed runs."
        )
    return sim.results or {}


@router.get("", response_model=SimulationHistoryResponse)
async def list_simulations(
    page: int = Query(1, ge=1, description="Page number."),
    page_size: int = Query(20, ge=1, le=100, description="Page size."),
    limit: Optional[int] = Query(None, ge=1, description="Override limit."),
    offset: Optional[int] = Query(None, ge=0, description="Override offset."),
    project_id: Optional[str] = Query(None, description="Filter by project ID."),
    status: Optional[str] = Query(None, description="Filter by status."),
    solver: Optional[str] = Query(None, description="Filter by solver type."),
    sort_by: str = Query("created_at", description="Field to sort by."),
    sort_dir: str = Query("desc", description="Sort direction: asc | desc"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SimulationHistoryResponse:
    """Lists simulation runs, supporting filtering, sorting, and pagination.

    Strictly scoped to projects owned by the authenticated user to prevent BOLA/ID enumeration.
    """
    stmt = (
        select(Simulation)
        .join(Project, Simulation.project_id == Project.id)
        .where(Project.owner_id == user.id)
    )

    # Filters
    if project_id:
        stmt = stmt.where(Simulation.project_id == project_id)
    if status:
        try:
            from app.models import SimulationStatus
            stmt = stmt.where(Simulation.status == SimulationStatus[status.lower()])
        except (KeyError, ValueError):
            stmt = stmt.where(Simulation.status == status)
    if solver:
        stmt = stmt.where(Simulation.solver == solver)

    # Calculate total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total_count = await db.scalar(count_stmt) or 0

    # Sort
    sort_column = getattr(Simulation, sort_by, Simulation.created_at)
    if sort_dir.lower() == "asc":
        stmt = stmt.order_by(sort_column.asc())
    else:
        stmt = stmt.order_by(sort_column.desc())

    # Pagination
    if limit is not None:
        stmt = stmt.limit(limit)
        if offset is not None:
            stmt = stmt.offset(offset)
        page_num = (offset // limit) + 1 if offset else 1
        page_sz = limit
    else:
        page_num = page
        page_sz = page_size
        offset = (page - 1) * page_size
        stmt = stmt.limit(page_size).offset(offset)

    result = await db.execute(stmt)
    sims = result.scalars().all()

    total_pages = (total_count + page_sz - 1) // page_sz if page_sz > 0 else 0

    return SimulationHistoryResponse(
        total_count=total_count,
        page=page_num,
        page_size=page_sz,
        total_pages=total_pages,
        items=[_to_sim_response(s) for s in sims],
    )


@router.post("/{simulation_id}/cancel", status_code=status.HTTP_200_OK)
async def cancel_simulation(
    simulation_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dict[str, str]:
    """Cancels a currently executing simulation job."""
    # Verify authorization
    await _authorize_simulation(db, simulation_id, user.id)

    # Issue cancellation command
    await simulation_service.cancel_simulation(simulation_id)
    return {"message": f"Cancellation request for simulation '{simulation_id}' successfully dispatched."}


@router.post("/{simulation_id}/retry", response_model=SimulationResponse)
async def retry_simulation(
    simulation_id: str,
    background_tasks: BackgroundTasks,
    body: RetrySimulationRequest = RetrySimulationRequest(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SimulationResponse:
    """Clones the configuration of a previous simulation run and triggers a new background queue run."""
    # Verify authorization of source run
    old_sim = await _authorize_simulation(db, simulation_id, user.id)

    # Fetch associated project
    project = await db.get(Project, old_sim.project_id)
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Associated project not found")

    # Fetch the simulation parameters from parameters table for exact config reproduction
    stmt = (
        select(SimulationParameter)
        .where(SimulationParameter.simulation_id == simulation_id)
    )
    result = await db.execute(stmt)
    params = result.scalars().all()
    
    design_payload = project.design_payload or {}
    user_settings = old_sim.config or {}
    terminal_names = None
    qubits = None
    port_names = None
    
    for p in params:
        if p.parameter_key == "design_payload":
            design_payload = p.parameter_value
        elif p.parameter_key == "user_settings":
            user_settings = p.parameter_value
        elif p.parameter_key == "terminal_names":
            terminal_names = p.parameter_value.get("names")
        elif p.parameter_key == "qubits":
            qubits = p.parameter_value.get("qubits")
        elif p.parameter_key == "port_names":
            port_names = p.parameter_value.get("ports")

    # Create new queued record
    new_sim_id = str(uuid.uuid4())
    new_sim = Simulation(
        id=new_sim_id,
        project_id=old_sim.project_id,
        solver=old_sim.solver,
        status=SimulationStatus.queued,
        config=user_settings,
        created_at=datetime.utcnow(),
    )
    db.add(new_sim)
    await db.commit()
    await db.refresh(new_sim)

    # Setup the new request
    rb_policy = body.rollback_policy if body.rollback_policy is not None else RollbackPolicy.DELETE_ON_SUCCESS

    # Enqueue Job in Background Queue
    job = SimulationJob(
        job_id=str(uuid.uuid4()),
        simulation_id=new_sim_id,
        project_id=old_sim.project_id,
        user_id=user.id,
        solver_type=old_sim.solver,
        design_payload=design_payload,
        user_settings=user_settings,
        terminal_names=terminal_names,
        qubits=qubits,
        port_names=port_names,
        coarse_mesh=body.coarse_mesh if body.coarse_mesh is not None else False,
        rollback_policy=rb_policy.value,
        priority=5,  # default priority
        correlation_id=correlation_id_ctx.get(),
    )
    await global_queue.enqueue(job)
    logger.info("Retried simulation enqueued successfully. Old ID: %s, New ID: %s, Job ID: %s", simulation_id, new_sim_id, job.job_id)

    return _to_sim_response(new_sim)


@router.delete("/{simulation_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_simulation(
    simulation_id: str,
    hard_delete: bool = Query(True, description="Enforce hard deletion from database."),
    cleanup_workspace: bool = Query(True, description="Enforce removal of workspace files on disk."),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    """Deletes a simulation run, cleans up disk files, and cascades to all execution details."""
    sim = await _authorize_simulation(db, simulation_id, user.id)

    # 1. Workspace Files Cleanup
    if cleanup_workspace and sim.artifact_path:
        project_root = Path(__file__).resolve().parents[3]
        artifact_dir = project_root / sim.artifact_path
        if artifact_dir.exists() and artifact_dir.is_dir():
            try:
                shutil.rmtree(artifact_dir, ignore_errors=True)
                logger.info("Successfully deleted workspace files on disk at: %s", artifact_dir)
            except Exception as e:
                logger.warning("Failed to clean up workspace directory on disk: %s", e)

    # 2. DB Deletion (Cascades to executions, results, artifacts, logs, metrics)
    if hard_delete:
        await db.delete(sim)
        await db.commit()
        logger.info("Successfully deleted simulation %s from database on cascade.", simulation_id)
    else:
        # Soft delete
        sim.status = SimulationStatus.failed
        sim.error_message = "Simulation record soft-deleted."
        await db.commit()


@router.get("/{simulation_id}/artifacts", response_model=List[ArtifactResponse])
async def list_simulation_artifacts(
    simulation_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> List[ArtifactResponse]:
    """Lists all database-indexed file artifacts generated by the simulation."""
    await _authorize_simulation(db, simulation_id, user.id)

    stmt = (
        select(SimulationArtifact)
        .join(SimulationExecution, SimulationArtifact.execution_id == SimulationExecution.id)
        .where(SimulationExecution.simulation_id == simulation_id)
        .order_by(SimulationArtifact.created_at.desc())
    )
    result = await db.execute(stmt)
    artifacts = result.scalars().all()
    return artifacts


@router.get("/{simulation_id}/artifacts/{artifact_id}")
async def download_simulation_artifact(
    simulation_id: str,
    artifact_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FileResponse:
    """Downloads a specific file artifact by ID.

    Supports range requests and sets proper MIME types natively using FastAPI FileResponse.
    """
    # Verify authorization
    await _authorize_simulation(db, simulation_id, user.id)

    # Fetch artifact and verify ownership
    stmt = (
        select(SimulationArtifact)
        .join(SimulationExecution, SimulationArtifact.execution_id == SimulationExecution.id)
        .where(
            SimulationArtifact.id == artifact_id,
            SimulationExecution.simulation_id == simulation_id
        )
    )
    result = await db.execute(stmt)
    artifact = result.scalar_one_or_none()
    if not artifact:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found")

    filepath = Path(artifact.path)
    if not filepath.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Artifact file missing on disk (it may have been cleaned up based on retention policies)."
        )

    return FileResponse(
        path=filepath,
        filename=artifact.file_name,
        media_type=None,  # Automatically inferred from file extension
    )


@router.get("/{simulation_id}/logs", response_model=List[LogResponse])
async def get_simulation_logs(
    simulation_id: str,
    log_type: Optional[str] = Query(None, description="Filter by log type: orchestrator | runner | gmsh | etc."),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> List[LogResponse]:
    """Retrieves execution and solver logs."""
    await _authorize_simulation(db, simulation_id, user.id)

    stmt = (
        select(SimulationLog)
        .join(SimulationExecution, SimulationLog.execution_id == SimulationExecution.id)
        .where(SimulationExecution.simulation_id == simulation_id)
        .order_by(SimulationLog.created_at.desc())
    )
    if log_type:
        stmt = stmt.where(SimulationLog.log_type == log_type)
    result = await db.execute(stmt)
    logs = result.scalars().all()
    return logs


@router.get("/{simulation_id}/metrics", response_model=MetricResponse)
async def get_simulation_metrics(
    simulation_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MetricResponse:
    """Retrieves phase timings and execution metrics."""
    await _authorize_simulation(db, simulation_id, user.id)

    stmt = (
        select(SimulationMetric)
        .join(SimulationExecution, SimulationMetric.execution_id == SimulationExecution.id)
        .where(SimulationExecution.simulation_id == simulation_id)
    )
    result = await db.execute(stmt)
    metrics = result.scalars().all()
    
    return MetricResponse(metrics={m.metric_key: m.metric_value for m in metrics})


@router.get("/{simulation_id}/workspace", response_model=WorkspaceResponse)
async def get_simulation_workspace_info(
    simulation_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> WorkspaceResponse:
    """Returns workspace snapshot metadata, scrubbed of absolute file paths to protect security."""
    await _authorize_simulation(db, simulation_id, user.id)

    stmt = (
        select(WorkspaceSnapshot)
        .join(SimulationExecution, WorkspaceSnapshot.execution_id == SimulationExecution.id)
        .where(SimulationExecution.simulation_id == simulation_id)
    )
    result = await db.execute(stmt)
    snapshot = result.scalar_one_or_none()

    if not snapshot:
        # Check if currently executing
        active_ctx = simulation_service.get_active_context(simulation_id)
        if active_ctx and active_ctx.workspace:
            return WorkspaceResponse(
                workspace_id=active_ctx.workspace.workspace_id,
                files_count=0,
                total_size_bytes=0,
                rollback_policy=active_ctx.rollback_policy.value,
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace metadata not found or workspace was cleaned up."
        )

    meta = snapshot.snapshot_metadata
    path_val = meta.get("root_path", "N/A")
    workspace_id = path_val.split("/")[-1] if "/" in path_val else path_val

    return WorkspaceResponse(
        workspace_id=workspace_id,
        files_count=meta.get("generated_files_count", 0),
        total_size_bytes=0,  # Scrub absolute sizes/paths
        rollback_policy=meta.get("rollback_policy", "N/A"),
    )


# ── Render & Legacy Compatibility Endpoints ─────────────────────────────────

@router.get("/{sim_id}/render")
async def render_simulation_snapshot(
    sim_id: str,
    variant: str = "e",
    mode: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Legacy compatibility endpoint returning flat 2D chip design field overlay overlays or 3D field renders."""
    # Verify authorization
    sim = await _authorize_simulation(db, sim_id, user.id)

    if not sim.artifact_retained or not sim.artifact_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No field renders — Palace Paraview output not yet available"
        )
        
    project_root = Path(__file__).resolve().parents[3]
    artifact_dir = project_root / sim.artifact_path
    if not artifact_dir.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact directory missing on disk")
    
    images_dir = artifact_dir / "images"
    if images_dir.exists():
        mode_suffix = f"_{mode}" if mode is not None else ""
        
        # 1. Flat 2D chip design overlay (*_chip_e_{mode}.png)
        target_chip = list(images_dir.glob(f"*_chip_{variant.lower()}{mode_suffix}.png"))
        if target_chip:
            return FileResponse(target_chip[0], media_type="image/png")
            
        # Fallback to Mode 1 (unsuffixed) flat chip overlay
        if mode is not None:
            target_chip_fallback = list(images_dir.glob(f"*_chip_{variant.lower()}.png"))
            if target_chip_fallback:
                return FileResponse(target_chip_fallback[0], media_type="image/png")

        # 2. 3D volumetric field renders (*_field_e_{mode}.png)
        target_field = list(images_dir.glob(f"*_field_{variant.lower()}{mode_suffix}.png"))
        if target_field:
            return FileResponse(target_field[0], media_type="image/png")
            
        # Fallback to Mode 1 (unsuffixed) 3D field
        if mode is not None:
            target_field_fallback = list(images_dir.glob(f"*_field_{variant.lower()}.png"))
            if target_field_fallback:
                return FileResponse(target_field_fallback[0], media_type="image/png")

        # 3. Fall back to any chip overlay image
        pre_rendered_chips = sorted(list(images_dir.glob("*_chip_*.png")))
        if pre_rendered_chips:
            return FileResponse(pre_rendered_chips[0], media_type="image/png")
            
        # 4. Fall back to any field visualization image
        pre_rendered_fields = sorted(list(images_dir.glob("*_field_*.png")))
        if pre_rendered_fields:
            return FileResponse(pre_rendered_fields[0], media_type="image/png")

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No Palace field renders available yet. Run a simulation with Paraview output enabled."
    )


@router.get("/{sim_id}/mesh")
async def get_simulation_mesh(
    sim_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Extracts and returns the 3D volume tetrahedral mesh for rendering.

    This data is formatted specifically for line wireframe rendering in a Three.js scene.
    """
    sim = await _authorize_simulation(db, sim_id, user.id)

    if not sim.artifact_retained or not sim.artifact_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No artifacts available for this simulation. Ensure artifact_retained=True.",
        )

    project_root = Path(__file__).resolve().parents[3]
    artifact_dir = project_root / sim.artifact_path
    if not artifact_dir.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Artifact directory does not exist on disk: {sim.artifact_path}",
        )

    try:
        from app.services.palace_mesh_parser import parse_palace_mesh
        data = parse_palace_mesh(
            artifact_dir=artifact_dir,
            sim_solver=sim.solver,
            sim_results=sim.results,
        )
        if sim.runtime_seconds:
            data["metadata"]["runtime_seconds"] = int(sim.runtime_seconds)
        return data
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to parse volume mesh")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal mesh parsing error: {str(exc)}",
        )


@router.get("/{simulation_id}/download")
async def download_all_simulation_artifacts(
    simulation_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Legacy compatibility endpoint downloading all simulation workspace artifacts in a zip file."""
    # Verify authorization
    sim = await _authorize_simulation(db, simulation_id, user.id)

    if not sim.artifact_retained or not sim.artifact_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifacts not found or not retained")
        
    project_root = Path(__file__).resolve().parents[3]
    artifact_dir = project_root / sim.artifact_path
    if not artifact_dir.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Artifact directory missing on disk")
        
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zipf:
        for root, _, filenames in os.walk(artifact_dir):
            for name in filenames:
                file_path = Path(root) / name
                archive_name = file_path.relative_to(artifact_dir)
                zipf.write(file_path, arcname=str(archive_name))
                
    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer, 
        media_type="application/zip", 
        headers={"Content-Disposition": f"attachment; filename=simulation_{simulation_id}_artifacts.zip"}
    )
