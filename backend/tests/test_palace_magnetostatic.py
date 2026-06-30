"""Unit and integration tests for Palace Magnetostatic solver, DRC validation, and background worker."""

from __future__ import annotations

import asyncio
import json
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from app.core.design_graph import DesignGraph, QubitNode, ResonatorNode, graph_to_dict
from app.services.palace.exceptions import ConfigGeneratorError, ResultParserError
from app.services.palace.geometry_builder import GeometryBuilder
from app.services.palace.config_generator import ConfigGenerator
from app.services.palace.result_parser import ResultParser
from app.services.palace.em_adapter import EMAdapter
from app.services.palace.models import PalaceSolverType, PalaceSimulationOutput, GeometryElementKind
from app.routers.simulations import run_simulation, RunSimulationRequest
from app.models import Simulation, Project, SimulationStatus


@pytest.fixture
def sample_v2_payload() -> dict:
    """Generate a valid design payload with V2 DesignGraph."""
    g = DesignGraph(
        chip_name="magnetostatic_chip",
        chip_width_mm=10.0,
        chip_height_mm=10.0,
        substrate="silicon",
        metal="aluminum",
    )
    
    # Qubit
    q1 = QubitNode(id="Q1", frequency_ghz=5.0)
    q1.x_mm = 1.0
    q1.y_mm = 1.0
    q1.orientation_deg = 0
    q1.ej_ghz = 20.0
    q1.ec_ghz = 0.28
    q1.anharmonicity_ghz = -0.25
    g.add_node(q1)
    
    # Resonator
    r1 = ResonatorNode(id="R1", frequency_ghz=7.0)
    r1.x_mm = 1.0
    r1.y_mm = 2.0
    r1.orientation_deg = 45
    r1.target_qubit_id = "Q1"
    g.add_node(r1)
    
    graph_dict = graph_to_dict(g)
    
    return {
        "project_name": "Magnetostatic Processor",
        "id": "design_mag_test",
        "v2": {
            "graph": graph_dict
        }
    }


def test_config_generator_magnetostatic(sample_v2_payload):
    """Test generating Palace configuration for the Magnetostatic solver."""
    geometry = GeometryBuilder.build_geometry(sample_v2_payload)
    config = ConfigGenerator.generate_config(geometry, PalaceSolverType.MAGNETOSTATIC)
    
    assert config["Problem"]["Type"] == "Magnetostatic"
    assert config["Model"]["Mesh"] == "mesh.msh"
    assert "LumpedPort" in config["Boundaries"]
    assert len(config["Boundaries"]["LumpedPort"]) == 2  # Q1 and R1 terminals
    
    port1 = config["Boundaries"]["LumpedPort"][0]
    assert port1["Index"] == 1
    assert port1["R"] == 1.0
    assert port1["L"] == 0.0
    
    assert "Magnetostatic" in config["Solver"]
    assert config["Solver"]["Magnetostatic"]["Save"] == 1


def test_result_parser_magnetostatic(tmp_path):
    """Test parsing inductance matrix from terminal-L.csv."""
    l_content = (
        "i, L[i][1] (H), L[i][2] (H)\n"
        "1.00e+00, +1.250000000000e-08, -3.400000000000e-10\n"
        "2.00e+00, -3.400000000000e-10, +8.750000000000e-09\n"
    )
    with open(tmp_path / "terminal-L.csv", "w") as f:
        f.write(l_content)
        
    parsed = ResultParser.parse_magnetostatic(tmp_path, terminal_names=["Q1_island", "R1"])
    assert len(parsed.inductance_data) == 2
    
    entry1 = parsed.inductance_data[0]
    assert entry1.element_id == "Q1_island"
    # 1.25e-08 Henries = 12.5 nH
    assert abs(entry1.inductance_nH - 12.5) < 1e-5
    
    entry2 = parsed.inductance_data[1]
    assert entry2.element_id == "R1"
    # 8.75e-09 Henries = 8.75 nH
    assert abs(entry2.inductance_nH - 8.75) < 1e-5


def test_em_adapter_magnetostatic(sample_v2_payload):
    """Test EMAdapter maps parsed magnetostatic results to EMResults correctly."""
    from app.services.palace.models import PalaceMagnetostaticOutput, PalaceInductanceEntry
    
    mag_output = PalaceMagnetostaticOutput(
        inductance_data=[
            PalaceInductanceEntry(element_id="Q1_island", inductance_nH=12.5),
            PalaceInductanceEntry(element_id="R1", inductance_nH=8.75)
        ]
    )
    
    raw_output = PalaceSimulationOutput(
        simulation_id="sim_mag_test",
        design_id="magnetostatic_chip",
        timestamp="2026-06-24T09:23:00Z",
        solver_type=PalaceSolverType.MAGNETOSTATIC,
        magnetostatic=mag_output,
        runtime_seconds=15.2
    )
    
    em_results = EMAdapter.to_em_results(raw_output)
    assert em_results.simulation_id == "sim_mag_test"
    assert em_results.design_id == "magnetostatic_chip"
    assert em_results.magnetostatic is not None
    assert len(em_results.magnetostatic.inductance_data) == 2
    
    inductance_q1 = em_results.get_inductance("Q1_island")
    assert inductance_q1 == 12.5
    
    inductance_r1 = em_results.get_inductance("R1")
    assert inductance_r1 == 8.75


@pytest.mark.skip(reason="Obsolete: simulations are now enqueued asynchronously by the Phase 13 thin router and executed by the BackgroundWorker. DRC is run via the /api/verification endpoint.")
@pytest.mark.asyncio
async def test_simulations_router_drc_failure(sample_v2_payload):
    """Verify simulations API route rejects runs that fail DRC with HTTP 400."""
    from fastapi import HTTPException
    
    # Mock database and user
    mock_db = AsyncMock()
    mock_user = MagicMock()
    mock_user.id = "user_123"
    
    mock_project = Project(
        id="project_456",
        owner_id="user_123",
        design_payload=sample_v2_payload
    )
    
    from datetime import datetime
    mock_sim = Simulation(
        id="sim_789",
        project_id="project_456",
        solver="eigenmode",
        status=SimulationStatus.queued,
        created_at=datetime.utcnow()
    )
    
    mock_sim_result = MagicMock()
    mock_sim_result.scalar_one_or_none.return_value = mock_sim
    mock_proj_result = MagicMock()
    mock_proj_result.scalar_one_or_none.return_value = mock_project
    
    mock_db.execute.side_effect = [mock_sim_result, mock_proj_result]
    
    # Mock DRC runner to return a failed report
    from app.drc.report import DRCReport, DRCViolation
    mock_report = DRCReport(
        violations=[
            DRCViolation(
                rule="out_of_bounds",
                domain="geometry",
                severity="ERROR",
                message="Q1 island is located outside chip boundaries"
            )
        ]
    )
    
    with patch("app.routers.simulations.run_drc_from_payload", return_value=mock_report):
        with pytest.raises(HTTPException) as exc_info:
            await run_simulation(
                sim_id="sim_789",
                body=RunSimulationRequest(engine="palace"),
                db=mock_db,
                user=mock_user
            )
        assert exc_info.value.status_code == 400
        assert "Design Rule Check (DRC) failed with errors" in exc_info.value.detail
        assert "[GEOMETRY]" in exc_info.value.detail


@pytest.mark.skip(reason="Obsolete: simulations are now enqueued asynchronously by the Phase 13 thin router and executed by the BackgroundWorker. Modern router integration tests are in test_simulation_router.py.")
@pytest.mark.asyncio
async def test_simulations_router_background_execution(sample_v2_payload):
    """Verify simulations API route initiates background task and returns immediately."""
    # Mock database, user, and background tasks container
    mock_db = AsyncMock()
    mock_user = MagicMock()
    mock_user.id = "user_123"
    mock_background_tasks = MagicMock()
    
    mock_project = Project(
        id="project_456",
        owner_id="user_123",
        design_payload=sample_v2_payload
    )
    
    from datetime import datetime
    mock_sim = Simulation(
        id="sim_789",
        project_id="project_456",
        solver="eigenmode",
        status=SimulationStatus.queued,
        created_at=datetime.utcnow()
    )
    
    mock_sim_result = MagicMock()
    mock_sim_result.scalar_one_or_none.return_value = mock_sim
    mock_proj_result = MagicMock()
    mock_proj_result.scalar_one_or_none.return_value = mock_project
    
    mock_db.execute.side_effect = [mock_sim_result, mock_proj_result]
    
    from app.drc.report import DRCReport
    mock_report = DRCReport(violations=[])
    
    with patch("app.routers.simulations.run_drc_from_payload", return_value=mock_report):
        result = await run_simulation(
            sim_id="sim_789",
            body=RunSimulationRequest(engine="palace"),
            db=mock_db,
            user=mock_user,
            background_tasks=mock_background_tasks
        )
        
        # Verify state transitioned to running
        assert result["status"] == "running"
        assert mock_sim.status == SimulationStatus.running
        assert mock_sim.artifact_path is not None
        assert mock_sim.artifact_retained is True
        
        # Verify database changes were committed
        mock_db.commit.assert_called_once()
        
        # Verify background task was queued
        mock_background_tasks.add_task.assert_called_once()
        call_args = mock_background_tasks.add_task.call_args
        assert call_args.args[0].__name__ == "_run_simulation_background_task"
        assert call_args.kwargs["sim_id"] == "sim_789"
        assert call_args.kwargs["project_id"] == "project_456"
        assert call_args.kwargs["engine"] == "palace"
