"""Simulation Service for orchestrating end-to-end simulations in a unified entrypoint."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional
from pydantic import BaseModel, Field

from app.simulation.config import PalaceConfigGenerator
from app.simulation.geometry import GeometryBuilder
from app.simulation.mesh import MeshGenerator
from app.simulation.runner import PalaceRunner
from app.simulation.service.constants import ORCHESTRATOR_VERSION
from app.simulation.service.exceptions import (
    OrchestratorCancellationError,
    OrchestratorError,
)
from app.simulation.service.execution_context import ExecutionContext, RollbackPolicy
from app.simulation.service.pipeline import PipelineManager
from app.simulation.service.state_manager import PipelineState
from app.simulation.workspace import WorkspaceManager

logger = logging.getLogger(__name__)


class SimulationRequest(BaseModel):
    """Pydantic model representing a request to run a complete simulation pipeline."""

    simulation_id: str = Field(
        ...,
        description="The unique UUID string associated with the simulation job."
    )
    design_payload: Dict[str, Any] = Field(
        ...,
        description="Layout geometries or V2 design graph dictionary."
    )
    solver_type: str = Field(
        ...,
        description="Palace solver type: eigenmode, electrostatic, magnetostatic, driven."
    )
    user_settings: Dict[str, Any] = Field(
        default_factory=dict,
        description="Optional solver settings, processor count (np), and binary overrides."
    )
    terminal_names: Optional[List[str]] = Field(
        default=None,
        description="Ordered list of terminal names for capacitance/inductance solvers."
    )
    qubits: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Optional list of qubit parameters for quantum energy derivations."
    )
    port_names: Optional[List[str]] = Field(
        default=None,
        description="Optional port names for EPR junctions mapping."
    )
    mesh_settings: Optional[Any] = Field(
        default=None,
        description="Custom settings to pass to the mesh generator."
    )
    coarse_mesh: bool = Field(
        default=False,
        description="True to generate a coarse testing mesh."
    )
    rollback_policy: RollbackPolicy = Field(
        default=RollbackPolicy.DELETE_ON_SUCCESS,
        description="The workspace cleanup policy to apply on completion."
    )


class SimulationExecutionSummary(BaseModel):
    """Pydantic model summarizing the metadata, timings, and files of an executed pipeline."""

    simulation_id: str
    status: PipelineState
    start_time: str
    end_time: Optional[str] = None
    total_runtime_seconds: float
    phase_timings: Dict[str, float]
    generated_files: List[str]
    warnings: List[str]
    errors: List[str]
    workspace_path: Optional[str] = None
    palace_version: Optional[str] = None
    orchestrator_version: str = ORCHESTRATOR_VERSION
    geometry_metadata: Optional[Dict[str, Any]] = None
    mesh_metadata: Optional[Dict[str, Any]] = None
    config_metadata: Optional[Dict[str, Any]] = None
    runner_metadata: Optional[Dict[str, Any]] = None
    artifacts_metadata: Dict[str, Dict[str, Any]] = Field(default_factory=dict)


class SimulationResponse(BaseModel):
    """Complete response model returning both parsed results and execution summary."""

    results: Dict[str, Any]
    summary: SimulationExecutionSummary


class SimulationService:
    """The central orchestrator service coordinating the complete simulation lifecycle."""

    def __init__(
        self,
        workspace_manager: Optional[WorkspaceManager] = None,
        geometry_builder: Optional[GeometryBuilder] = None,
        mesh_generator: Optional[MeshGenerator] = None,
        config_generator: Optional[PalaceConfigGenerator] = None,
        palace_runner: Optional[PalaceRunner] = None,
    ) -> None:
        """Initialize the Simulation Service and its underlying pipeline manager."""
        self.workspace_manager = workspace_manager or WorkspaceManager()
        self.geometry_builder = geometry_builder or GeometryBuilder(self.workspace_manager)
        self.mesh_generator = mesh_generator or MeshGenerator(self.workspace_manager)
        self.config_generator = config_generator or PalaceConfigGenerator(self.workspace_manager)
        self.palace_runner = palace_runner or PalaceRunner(self.workspace_manager)
        
        self.pipeline_manager = PipelineManager(
            workspace_manager=self.workspace_manager,
            geometry_builder=self.geometry_builder,
            mesh_generator=self.mesh_generator,
            config_generator=self.config_generator,
            palace_runner=self.palace_runner,
        )
        
        # Track running asyncio tasks to support robust live cancellation
        self._active_tasks: Dict[str, asyncio.Task[Any]] = {}
        # Track active execution contexts to support real-time progress polling
        self._active_contexts: Dict[str, ExecutionContext] = {}
        logger.info("SimulationService successfully initialized.")

    async def execute_simulation(
        self,
        request: SimulationRequest,
        session: Optional[AsyncSession] = None,
        project_id: Optional[str] = None,
        user_id: Optional[str] = None,
        on_progress: Optional[Callable[[Any], None]] = None,
    ) -> SimulationResponse:
        """Execute a complete simulation pipeline asynchronously.

        Args:
            request: The SimulationRequest parameters.
            session: Optional database session for persisting execution history.
            project_id: Optional project UUID for DB association.
            user_id: Optional user UUID for DB association.
            on_progress: Optional progress callback.

        Returns:
            A SimulationResponse containing parsed results and execution summary.

        Raises:
            OrchestratorError: If the pipeline fails.
        """
        sim_id = request.simulation_id
        
        if sim_id in self._active_tasks:
            raise OrchestratorError(f"Simulation job '{sim_id}' is already executing.")

        # 1. Initialize Context
        context = ExecutionContext(
            simulation_id=sim_id,
            rollback_policy=request.rollback_policy,
        )
        self._active_contexts[sim_id] = context

        # 2. Spawn task and register it
        loop = asyncio.get_running_loop()
        task = loop.create_task(
            self._run_pipeline(context, request, on_progress)
        )
        self._active_tasks[sim_id] = task

        response = None
        execution_err = None
        try:
            results = await task
            summary = self._compile_summary(context)
            response = SimulationResponse(results=results, summary=summary)
        except Exception as e:
            summary = self._compile_summary(context)
            execution_err = e
        finally:
            self._active_tasks.pop(sim_id, None)
            self._active_contexts.pop(sim_id, None)

            # Attempt database persistence if a session is provided
            if session is not None and project_id is not None and user_id is not None:
                try:
                    if response is None:
                        response = SimulationResponse(results={}, summary=summary)
                    
                    from app.simulation.database.persistence_service import SimulationPersistenceService
                    persist_service = SimulationPersistenceService()
                    await persist_service.save_simulation_run(
                        session=session,
                        request=request,
                        response=response,
                        project_id=project_id,
                        user_id=user_id,
                    )
                except Exception as db_err:
                    logger.error("Failed to persist simulation run to database: %s", db_err)
                    if execution_err is None:
                        execution_err = db_err

            if execution_err is not None:
                if isinstance(execution_err, OrchestratorCancellationError):
                    raise execution_err
                raise OrchestratorError(f"Simulation execution failed: {execution_err}") from execution_err

        return response

    async def cancel_simulation(self, simulation_id: str) -> None:
        """Cancel a currently running simulation pipeline.

        Args:
            simulation_id: The UUID string of the simulation job.
        """
        task = self._active_tasks.get(simulation_id)
        if not task:
            logger.warning("No active simulation task found to cancel for ID: %s", simulation_id)
            return

        logger.info("Requesting cancellation for simulation task: %s", simulation_id)
        task.cancel()

        # Await the task to ensure graceful cancellation completes and resources clean up
        try:
            await task
        except asyncio.CancelledError:
            logger.info("Simulation task '%s' successfully cancelled.", simulation_id)
        except Exception as e:
            logger.error("Error during task cancellation wait for '%s': %s", simulation_id, e)

    def get_active_context(self, simulation_id: str) -> Optional[ExecutionContext]:
        """Retrieve the active execution context for a running simulation, if it exists."""
        return self._active_contexts.get(simulation_id)

    async def _run_pipeline(
        self,
        context: ExecutionContext,
        request: SimulationRequest,
        on_progress: Optional[Callable[[Any], None]] = None,
    ) -> Dict[str, Any]:
        """Internal helper to execute the pipeline manager."""
        return await self.pipeline_manager.execute(
            context=context,
            design_payload=request.design_payload,
            solver_type=request.solver_type,
            user_settings=request.user_settings,
            terminal_names=request.terminal_names,
            qubits=request.qubits,
            port_names=request.port_names,
            mesh_settings=request.mesh_settings,
            coarse_mesh=request.coarse_mesh,
            on_progress=on_progress,
        )

    def _compile_summary(self, context: ExecutionContext) -> SimulationExecutionSummary:
        """Compile timing, status, and artifact details into a clean summary."""
        end_time_str = context.end_time.isoformat() + "Z" if context.end_time else None
        
        # Calculate total duration in seconds
        end_dt = context.end_time or datetime.utcnow()
        total_seconds = (end_dt - context.start_time).total_seconds()

        workspace_path = context.workspace.root_path if context.workspace else None

        return SimulationExecutionSummary(
            simulation_id=context.simulation_id,
            status=context.status,
            start_time=context.start_time.isoformat() + "Z",
            end_time=end_time_str,
            total_runtime_seconds=round(total_seconds, 4),
            phase_timings={k: round(v, 4) for k, v in context.timing.items()},
            generated_files=list(context.generated_artifacts),
            warnings=list(context.warnings),
            errors=list(context.errors),
            workspace_path=workspace_path,
            palace_version=context.execution_metadata.get("palace_version"),
            geometry_metadata=context.geometry_metadata,
            mesh_metadata=context.mesh_metadata,
            config_metadata=context.config_metadata,
            runner_metadata=context.runner_metadata,
            artifacts_metadata=context.artifacts_metadata,
        )
