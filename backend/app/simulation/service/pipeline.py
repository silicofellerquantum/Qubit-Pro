"""Pipeline coordinator for executing and managing the simulation phases."""

from __future__ import annotations

import asyncio
import inspect
import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from app.simulation.config import PalaceConfigGenerator
from app.simulation.geometry import GeometryBuilder
from app.simulation.mesh import MeshGenerator
from app.simulation.parser import ResultParser
from app.simulation.runner import PalaceRunner
from app.simulation.runner.aws_batch_runner import AWSBatchRunner
from app.simulation.service.exceptions import (
    OrchestratorCancellationError,
    PipelinePhaseError,
)
from app.simulation.service.execution_context import ExecutionContext, RollbackPolicy
from app.simulation.service.state_manager import PipelineState, StateManager
from app.simulation.workspace import WorkspaceManager

logger = logging.getLogger(__name__)


class PipelineManager:
    """Coordinates the execution of all simulation phases in a state-safe manner."""

    def __init__(
        self,
        workspace_manager: WorkspaceManager,
        geometry_builder: GeometryBuilder,
        mesh_generator: MeshGenerator,
        config_generator: PalaceConfigGenerator,
        palace_runner: PalaceRunner,
    ) -> None:
        self.workspace_manager = workspace_manager
        self.geometry_builder = geometry_builder
        self.mesh_generator = mesh_generator
        self.config_generator = config_generator

        # Select the compute backend at construction time based on settings.
        # This avoids any branching inside execute() — the pipeline itself is backend-agnostic.
        from app.config import settings
        if settings.compute_backend == "aws_batch":
            logger.info(
                "PipelineManager: using AWSBatchRunner (compute_backend=aws_batch)"
            )
            self.palace_runner: PalaceRunner | AWSBatchRunner = AWSBatchRunner(
                workspace_manager=workspace_manager,
            )
        else:
            logger.info(
                "PipelineManager: using PalaceRunner (compute_backend=local)"
            )
            self.palace_runner = palace_runner

    async def execute(
        self,
        context: ExecutionContext,
        design_payload: Dict[str, Any],
        solver_type: str,
        user_settings: Optional[Dict[str, Any]] = None,
        terminal_names: Optional[List[str]] = None,
        qubits: Optional[List[Dict[str, Any]]] = None,
        port_names: Optional[List[str]] = None,
        mesh_settings: Optional[Any] = None,
        coarse_mesh: bool = False,
        on_progress: Optional[Callable[[Any], None]] = None,
    ) -> Dict[str, Any]:
        """Execute the complete simulation pipeline.

        Args:
            context: The ExecutionContext of the run.
            design_payload: Layout geometries/V2 design graph.
            solver_type: Palace solver type ('eigenmode', 'electrostatic', etc.).
            user_settings: Dict containing solver/launcher overrides.
            terminal_names: Ordered list of terminal names.
            qubits: List of qubit specs for physics calculations.
            port_names: List of port names for EPR mapping.
            mesh_settings: Custom GMSH mesh settings.
            coarse_mesh: True to generate a coarse testing mesh.
            on_progress: Progress callback.

        Returns:
            The parsed simulation results.

        Raises:
            PipelinePhaseError: If any phase fails.
            OrchestratorCancellationError: If execution is cancelled.
        """
        sim_id = context.simulation_id
        user_settings = user_settings or {}
        state_manager = StateManager()
        
        # Track MPI processor count in execution metadata
        np = int(user_settings.get("np", 1))
        context.execution_metadata["np"] = np

        logger.info("PipelineManager starting execution for simulation %s...", sim_id)

        try:
            # --- PHASE 1: CREATE WORKSPACE ---
            workspace = await self._run_phase(
                phase_name="workspace",
                state_to=PipelineState.WORKSPACE_READY,
                context=context,
                state_manager=state_manager,
                func=lambda: self.workspace_manager.create_workspace(simulation_id=sim_id),
            )
            context.workspace = workspace
            self._register_artifact(context, str(Path(workspace.root_path) / "workspace.json"), "config")

            # --- PHASE 2: BUILD GEOMETRY ---
            geom_metadata = await self._run_phase(
                phase_name="geometry",
                state_to=PipelineState.GEOMETRY_READY,
                context=context,
                state_manager=state_manager,
                func=lambda: self.geometry_builder.build_geometry(
                    simulation_id=sim_id,
                    design_payload=design_payload,
                ),
            )
            context.geometry_metadata = geom_metadata.model_dump()
            for f in geom_metadata.generated_files:
                self._register_artifact(context, str(Path(workspace.geometry_path) / f), "geometry")

            # --- PHASE 3: GENERATE MESH ---
            mesh_metadata = await self._run_phase(
                phase_name="mesh",
                state_to=PipelineState.MESH_READY,
                context=context,
                state_manager=state_manager,
                func=lambda: self.mesh_generator.generate_mesh(
                    simulation_id=sim_id,
                    settings=mesh_settings,
                    coarse=coarse_mesh,
                ),
            )
            context.mesh_metadata = mesh_metadata.model_dump()
            self._register_artifact(context, str(Path(workspace.mesh_path) / "mesh.msh"), "mesh")
            self._register_artifact(context, str(Path(workspace.mesh_path) / "mesh_metadata.json"), "config")
            self._register_artifact(context, str(Path(workspace.mesh_path) / "mesh_quality.json"), "config")
            self._register_artifact(context, str(Path(workspace.mesh_path) / "mesh.log"), "log")

            # --- PHASE 4: GENERATE PALACE CONFIG ---
            config, config_meta = await self._run_phase(
                phase_name="config",
                state_to=PipelineState.CONFIG_READY,
                context=context,
                state_manager=state_manager,
                func=lambda: self.config_generator.generate_config(
                    simulation_id=sim_id,
                    solver_type=solver_type,
                    user_settings=user_settings,
                ),
            )
            context.config_metadata = config_meta
            self._register_artifact(context, str(Path(workspace.config_path) / "config.json"), "config")

            # --- PHASE 5: EXECUTE PALACE ---
            runner_metadata = await self._run_phase(
                phase_name="runner",
                state_to=PipelineState.RUNNING,
                context=context,
                state_manager=state_manager,
                func=lambda: self.palace_runner.run_simulation(
                    simulation_id=sim_id,
                    np=np,
                    user_settings=user_settings,
                    on_progress=on_progress,
                ),
            )
            context.runner_metadata = runner_metadata.model_dump()
            context.execution_metadata["palace_version"] = runner_metadata.palace_version
            self._register_artifact(context, str(Path(workspace.log_path) / "runner_metadata.json"), "config")
            # Register optional solver outputs if they exist
            self._register_artifact(context, str(Path(workspace.log_path) / "palace.log"), "log")

            # --- PHASE 6: PARSE RESULTS ---
            # Output is written in 'out/' directory inside the working directory config_path
            output_dir = Path(workspace.config_path) / "out"
            parsed_results = await self._run_phase(
                phase_name="parser",
                state_to=PipelineState.RESULTS_READY,
                context=context,
                state_manager=state_manager,
                func=lambda: ResultParser.parse_results(
                    output_dir=output_dir,
                    solver_type=solver_type,
                    terminal_names=terminal_names,
                    qubits=qubits,
                    port_names=port_names,
                ),
            )
            # Register output files in 'out/' directory in real-time before cleanup
            if output_dir.exists():
                for p in output_dir.glob("**/*"):
                    if p.is_file():
                        self._register_artifact(
                            context,
                            str(p),
                            "plot" if (p.suffix in ('.vtu', '.pvd')) else ('csv' if p.suffix == '.csv' else 'other')
                        )

            # --- PIPELINE SUCCESS ---
            state_manager.transition_to(PipelineState.COMPLETED, sim_id)
            context.status = state_manager.state
            context.end_time = datetime.utcnow()
            
            return parsed_results

        except asyncio.CancelledError:
            logger.warning("Pipeline execution cancelled for simulation %s.", sim_id)
            state_manager.transition_to(PipelineState.CANCELLED, sim_id)
            context.status = state_manager.state
            context.end_time = datetime.utcnow()
            context.errors.append("Simulation execution was cancelled.")
            
            # Delegate cancellation to Palace Runner
            try:
                await self.palace_runner.cancel_simulation(sim_id)
            except Exception as ce:
                logger.error("Error during Palace runner cancellation: %s", ce)
                
            raise OrchestratorCancellationError("Simulation execution was cancelled.")

        except Exception as ex:
            logger.error("Pipeline failure in phase '%s' for simulation %s: %s", context.current_phase, sim_id, ex)
            state_manager.transition_to(PipelineState.FAILED, sim_id)
            context.status = state_manager.state
            context.end_time = datetime.utcnow()
            context.errors.append(str(ex))
            
            raise

    async def _run_phase(
        self,
        phase_name: str,
        state_to: PipelineState,
        context: ExecutionContext,
        state_manager: StateManager,
        func: Callable[[], Any],
    ) -> Any:
        """Execute a single phase of the pipeline, recording its duration and managing state transitions."""
        context.current_phase = phase_name
        logger.info("Executing phase '%s' for simulation %s...", phase_name, context.simulation_id)
        start_time = time.perf_counter()

        try:
            # Resolve synchronous callables vs coroutines dynamically
            if asyncio.iscoroutinefunction(func):
                res = await func()
            elif callable(func):
                res = func()
                if inspect.iscoroutine(res):
                    res = await res
            else:
                res = await func

            duration = time.perf_counter() - start_time
            context.timing[phase_name] = duration
            state_manager.transition_to(state_to, context.simulation_id)
            context.status = state_manager.state
            logger.info("Phase '%s' completed in %.4f seconds.", phase_name, duration)
            return res

        except Exception as e:
            duration = time.perf_counter() - start_time
            context.timing[phase_name] = duration
            if isinstance(e, PipelinePhaseError):
                raise e
            raise PipelinePhaseError(phase_name, str(e)) from e

    def _apply_rollback_policy(self, context: ExecutionContext, success: bool) -> None:
        """Enforce workspace rollback and cleanup policies depending on execution outcome."""
        if not context.workspace:
            return

        sim_id = context.simulation_id
        policy = context.rollback_policy

        should_delete = False
        if policy == RollbackPolicy.DELETE_ALL:
            should_delete = True
        elif policy == RollbackPolicy.DELETE_ON_SUCCESS:
            if success:
                should_delete = True
            else:
                logger.info(
                    "Preserving workspace '%s' on failure for debugging (RollbackPolicy: %s).",
                    sim_id,
                    policy.value,
                )

        if should_delete:
            logger.info("Cleaning up workspace '%s' per rollback policy %s...", sim_id, policy.value)
            try:
                self.workspace_manager.delete_workspace(sim_id)
                logger.info("Workspace '%s' successfully cleaned up.", sim_id)
            except Exception as e:
                logger.error("Failed to delete workspace '%s': %s", sim_id, e)
                context.warnings.append(f"Workspace cleanup failed: {e}")

    def _register_artifact(
        self,
        context: ExecutionContext,
        filepath: str,
        artifact_type: str,
    ) -> None:
        """Calculate size and SHA256 checksum of a file in real-time, registering it in the context."""
        import hashlib
        from pathlib import Path
        
        p = Path(filepath)
        if not p.exists():
            return

        try:
            size_bytes = p.stat().st_size
            
            sha256_hash = hashlib.sha256()
            with open(p, "rb") as f:
                for byte_block in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(byte_block)
            checksum = sha256_hash.hexdigest()
            
            context.artifacts_metadata[p.name] = {
                "file_name": p.name,
                "path": str(p),
                "size": size_bytes,
                "checksum": checksum,
                "artifact_type": artifact_type,
                "created_at": datetime.utcnow().isoformat() + "Z",
            }
            if str(p) not in context.generated_artifacts:
                context.generated_artifacts.append(str(p))
            logger.info(
                "Registered artifact '%s' (type: %s, size: %d bytes, sha256: %s)",
                p.name,
                artifact_type,
                size_bytes,
                checksum[:8],
            )
        except Exception as e:
            logger.error("Failed to compute metadata for artifact '%s': %s", filepath, e)
            if str(p) not in context.generated_artifacts:
                context.generated_artifacts.append(str(p))
