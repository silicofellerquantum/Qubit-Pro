"""Comprehensive tests for the Simulation Orchestrator subsystem."""

from __future__ import annotations

import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.simulation.config import PalaceConfig, PalaceConfigGenerator
from app.simulation.geometry import GeometryBuilder, GeometryMetadata
from app.simulation.mesh import MeshGenerator, MeshMetadata
from app.simulation.runner import PalaceRunner, RunnerMetadata
from app.simulation.service import (
    PipelineState,
    RollbackPolicy,
    SimulationRequest,
    SimulationService,
)
from app.simulation.service.exceptions import (
    OrchestratorCancellationError,
    OrchestratorError,
    PipelinePhaseError,
)
from app.simulation.workspace import WorkspaceManager, WorkspaceMetadata, WorkspaceState


@pytest.fixture
def mock_workspace() -> WorkspaceMetadata:
    """Provide a mock WorkspaceMetadata instance."""
    return WorkspaceMetadata(
        workspace_id="sim-workspace-123",
        simulation_id="sim-123",
        status=WorkspaceState.CREATED,
        created_at=datetime.utcnow().isoformat() + "Z",
        updated_at=datetime.utcnow().isoformat() + "Z",
        root_path="/tmp/sim-workspace-123",
        config_path="/tmp/sim-workspace-123/config",
        geometry_path="/tmp/sim-workspace-123/geometry",
        mesh_path="/tmp/sim-workspace-123/mesh",
        output_path="/tmp/sim-workspace-123/output",
        log_path="/tmp/sim-workspace-123/logs",
        visualization_path="/tmp/sim-workspace-123/visualization",
        temp_path="/tmp/sim-workspace-123/temp",
    )


@pytest.fixture
def mock_geometry_metadata() -> GeometryMetadata:
    """Provide a mock GeometryMetadata instance."""
    return GeometryMetadata(
        design_id="test_design",
        files=["design.step", "design.brep", "design.geo"],
        component_ids=["Q1", "Q2"],
        port_ids=["port1", "port2"],
        chip_width_mm=10.0,
        chip_height_mm=10.0,
        substrate_material="silicon",
        metal_material="aluminum",
        raw_payload={},
        component_count=2,
        bounding_box=(-5.0, -5.0, 5.0, 5.0),
        created_at=datetime.utcnow().isoformat() + "Z",
    )


@pytest.fixture
def mock_mesh_metadata() -> MeshMetadata:
    """Provide a mock MeshMetadata instance."""
    return MeshMetadata(
        mesh_id="mesh-123",
        workspace_id="sim-workspace-123",
        files=["mesh.msh"],
        physical_groups={},
        boundaries={},
        settings={},
        quality={},
        node_count=100,
        element_count=500,
        tet_count=300,
        triangle_count=150,
        line_count=50,
        bounding_box=(-5.0, -5.0, 0.0, 5.0, 5.0, 1.0),
        mesh_settings={},
        generation_time_seconds=1.2,
        created_at=datetime.utcnow().isoformat() + "Z",
    )


@pytest.fixture
def mock_runner_metadata() -> RunnerMetadata:
    """Provide a mock RunnerMetadata instance."""
    return RunnerMetadata(
        execution_id="exec-123",
        workspace_id="sim-123",
        runner_version="1.0.0",
        palace_version="0.5.0",
        start_time=datetime.utcnow().isoformat() + "Z",
        end_time=datetime.utcnow().isoformat() + "Z",
        duration_seconds=1.5,
        exit_code=0,
        termination_reason="completed",
        command=["palace"],
        environment={},
        processor_count=1,
    )


@pytest.fixture
def mock_pipeline_components(
    mock_workspace: WorkspaceMetadata,
    mock_geometry_metadata: GeometryMetadata,
    mock_mesh_metadata: MeshMetadata,
    mock_runner_metadata: RunnerMetadata,
) -> dict[str, MagicMock]:
    """Provide mocked pipeline dependencies."""
    workspace_mgr = MagicMock(spec=WorkspaceManager)
    workspace_mgr.create_workspace.return_value = mock_workspace
    workspace_mgr.get_workspace.return_value = mock_workspace

    geom_builder = MagicMock(spec=GeometryBuilder)
    geom_builder.build_geometry.return_value = mock_geometry_metadata

    mesh_gen = MagicMock(spec=MeshGenerator)
    mesh_gen.generate_mesh.return_value = mock_mesh_metadata

    config_gen = MagicMock(spec=PalaceConfigGenerator)
    mock_config = MagicMock(spec=PalaceConfig)
    config_gen.generate_config.return_value = (mock_config, {})

    runner = MagicMock(spec=PalaceRunner)
    runner.run_simulation = AsyncMock(return_value=mock_runner_metadata)
    runner.cancel_simulation = AsyncMock()

    return {
        "workspace_manager": workspace_mgr,
        "geometry_builder": geom_builder,
        "mesh_generator": mesh_gen,
        "config_generator": config_gen,
        "palace_runner": runner,
    }


# --- SUCCESS PATH TEST ---

@pytest.mark.asyncio
@patch("app.simulation.service.pipeline.ResultParser")
async def test_execute_simulation_success(
    mock_parser_class: MagicMock,
    mock_pipeline_components: dict[str, MagicMock],
):
    """Verify the end-to-end success path of the simulation orchestrator."""
    # Setup mock parser return
    mock_parser_class.parse_results.return_value = {"capacitance": "parsed_data"}

    # Initialize service with mock components
    service = SimulationService(**mock_pipeline_components)

    request = SimulationRequest(
        simulation_id="sim-123",
        design_payload={"design": "test_data"},
        solver_type="electrostatic",
        user_settings={"np": 2},
        terminal_names=["t1", "t2"],
        rollback_policy=RollbackPolicy.KEEP_ALL,
    )

    response = await service.execute_simulation(request)

    # Assertions
    assert response.results == {"capacitance": "parsed_data"}
    assert response.summary.status == PipelineState.COMPLETED
    assert response.summary.simulation_id == "sim-123"
    assert response.summary.palace_version == "0.5.0"
    assert response.summary.total_runtime_seconds > 0.0

    # Verify each phase was called in sequence
    mock_pipeline_components["workspace_manager"].create_workspace.assert_called_once_with(simulation_id="sim-123")
    mock_pipeline_components["geometry_builder"].build_geometry.assert_called_once()
    mock_pipeline_components["mesh_generator"].generate_mesh.assert_called_once()
    mock_pipeline_components["config_generator"].generate_config.assert_called_once()
    mock_pipeline_components["palace_runner"].run_simulation.assert_called_once()
    mock_parser_class.parse_results.assert_called_once()

    # Timings should be recorded for all phases
    timings = response.summary.phase_timings
    assert "workspace" in timings
    assert "geometry" in timings
    assert "mesh" in timings
    assert "config" in timings
    assert "runner" in timings
    assert "parser" in timings

    # Workspace should be preserved per policy RollbackPolicy.KEEP_ALL
    mock_pipeline_components["workspace_manager"].delete_workspace.assert_not_called()


# --- PHASE FAILURE TESTS ---

@pytest.mark.asyncio
async def test_execute_simulation_geometry_failure(
    mock_pipeline_components: dict[str, MagicMock],
):
    """Verify that a failure in the geometry phase halts the pipeline immediately and triggers rollback."""
    # Set geometry builder to fail
    mock_pipeline_components["geometry_builder"].build_geometry.side_effect = ValueError("Geometry overlapping error")

    service = SimulationService(**mock_pipeline_components)

    request = SimulationRequest(
        simulation_id="sim-123",
        design_payload={"design": "test_data"},
        solver_type="electrostatic",
        rollback_policy=RollbackPolicy.DELETE_ON_SUCCESS,  # Should keep workspace on failure for debugging
    )

    with pytest.raises(OrchestratorError) as exc_info:
        await service.execute_simulation(request)

    assert "Geometry overlapping error" in str(exc_info.value)

    # Workspace manager should have created the workspace, but subsequent phases must never run
    mock_pipeline_components["workspace_manager"].create_workspace.assert_called_once()
    mock_pipeline_components["mesh_generator"].generate_mesh.assert_not_called()
    mock_pipeline_components["palace_runner"].run_simulation.assert_not_called()

    # Per policy DELETE_ON_SUCCESS, the workspace is preserved on failure (not deleted)
    mock_pipeline_components["workspace_manager"].delete_workspace.assert_not_called()


# --- ROLLBACK POLICY TESTS ---

@pytest.mark.asyncio
@patch("app.simulation.service.pipeline.ResultParser")
async def test_rollback_policy_delete_all_on_success(
    mock_parser_class: MagicMock,
    mock_pipeline_components: dict[str, MagicMock],
):
    """Verify that RollbackPolicy.DELETE_ALL cleans up the workspace on success."""
    mock_parser_class.parse_results.return_value = {}
    service = SimulationService(**mock_pipeline_components)

    request = SimulationRequest(
        simulation_id="sim-123",
        design_payload={"design": "test"},
        solver_type="electrostatic",
        rollback_policy=RollbackPolicy.DELETE_ALL,
    )

    response = await service.execute_simulation(request)
    assert response.summary.status == PipelineState.COMPLETED
    
    # Workspace should be deleted
    mock_pipeline_components["workspace_manager"].delete_workspace.assert_called_once_with("sim-123")


@pytest.mark.asyncio
async def test_rollback_policy_delete_all_on_failure(
    mock_pipeline_components: dict[str, MagicMock],
):
    """Verify that RollbackPolicy.DELETE_ALL cleans up the workspace even on failure."""
    mock_pipeline_components["mesh_generator"].generate_mesh.side_effect = RuntimeError("GMSH crash")
    service = SimulationService(**mock_pipeline_components)

    request = SimulationRequest(
        simulation_id="sim-123",
        design_payload={"design": "test"},
        solver_type="electrostatic",
        rollback_policy=RollbackPolicy.DELETE_ALL,
    )

    with pytest.raises(OrchestratorError):
        await service.execute_simulation(request)

    # Workspace should still be deleted on failure
    mock_pipeline_components["workspace_manager"].delete_workspace.assert_called_once_with("sim-123")


@pytest.mark.asyncio
@patch("app.simulation.service.pipeline.ResultParser")
async def test_rollback_policy_delete_on_success_deletes(
    mock_parser_class: MagicMock,
    mock_pipeline_components: dict[str, MagicMock],
):
    """Verify that RollbackPolicy.DELETE_ON_SUCCESS deletes the workspace upon successful completion."""
    mock_parser_class.parse_results.return_value = {}
    service = SimulationService(**mock_pipeline_components)

    request = SimulationRequest(
        simulation_id="sim-123",
        design_payload={"design": "test"},
        solver_type="electrostatic",
        rollback_policy=RollbackPolicy.DELETE_ON_SUCCESS,
    )

    response = await service.execute_simulation(request)
    assert response.summary.status == PipelineState.COMPLETED
    
    # Workspace should be deleted
    mock_pipeline_components["workspace_manager"].delete_workspace.assert_called_once_with("sim-123")


# --- CANCELLATION TESTS ---

@pytest.mark.asyncio
async def test_simulation_cancellation(
    mock_pipeline_components: dict[str, MagicMock],
):
    """Verify that cancelling a running simulation halts the pipeline and delegates cancellation to the runner."""
    # Set runner to block until cancelled
    async def blocking_run(*args, **kwargs):
        try:
            await asyncio.sleep(10.0)
        except asyncio.CancelledError:
            # Re-raise to match python asyncio cancellation behavior
            raise

    mock_pipeline_components["palace_runner"].run_simulation.side_effect = blocking_run

    service = SimulationService(**mock_pipeline_components)

    request = SimulationRequest(
        simulation_id="sim-123",
        design_payload={"design": "test"},
        solver_type="electrostatic",
        rollback_policy=RollbackPolicy.DELETE_ON_SUCCESS,
    )

    # Run the simulation in a background task
    loop = asyncio.get_running_loop()
    task = loop.create_task(service.execute_simulation(request))

    # Let the pipeline start and get blocked in runner phase
    await asyncio.sleep(0.05)

    # Cancel the simulation through the service API
    await service.cancel_simulation("sim-123")

    # Assert that task propagates OrchestratorCancellationError
    with pytest.raises(OrchestratorCancellationError):
        await task

    # Assert that PalaceRunner.cancel_simulation was called
    mock_pipeline_components["palace_runner"].cancel_simulation.assert_called_once_with("sim-123")
