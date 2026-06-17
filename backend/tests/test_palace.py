"""Unit and integration tests for the AWS Palace EM simulation backend integration."""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.design_graph import DesignGraph, QubitNode, ResonatorNode, CouplerNode, graph_to_dict
from app.services.palace.exceptions import GeometryError, ResultParserError
from app.services.palace.geometry_builder import GeometryBuilder
from app.services.palace.config_generator import ConfigGenerator
from app.services.palace.palace_runner import PalaceRunner
from app.services.palace.result_parser import ResultParser
from app.services.palace.em_adapter import EMAdapter
from app.services.palace.models import PalaceSolverType, PalaceSimulationOutput, GeometryElementKind
from app.routers.simulations import run_simulation, RunSimulationRequest
from app.models import Simulation, Project, SimulationStatus


@pytest.fixture
def sample_v2_payload() -> dict:
    """Fixture to generate a valid design payload with V2 DesignGraph."""
    g = DesignGraph(
        chip_name="test_qubit_chip",
        chip_width_mm=10.0,
        chip_height_mm=10.0,
        substrate="silicon",
        metal="aluminum",
    )
    
    # Qubit 1
    q1 = QubitNode(id="Q1", frequency_ghz=5.0)
    q1.x_mm = 1.0
    q1.y_mm = 1.0
    q1.orientation_deg = 0
    q1.ej_ghz = 20.0
    q1.ec_ghz = 0.28
    q1.anharmonicity_ghz = -0.25
    g.add_node(q1)

    # Qubit 2
    q2 = QubitNode(id="Q2", frequency_ghz=5.4)
    q2.x_mm = 3.0
    q2.y_mm = 1.0
    q2.orientation_deg = 90
    q2.ej_ghz = 22.0
    q2.ec_ghz = 0.29
    q2.anharmonicity_ghz = -0.24
    g.add_node(q2)
    
    # Resonator
    r1 = ResonatorNode(id="R1", frequency_ghz=7.0)
    r1.x_mm = 1.0
    r1.y_mm = 2.0
    r1.orientation_deg = 45
    r1.target_qubit_id = "Q1"
    g.add_node(r1)
    
    # Coupler
    c12 = CouplerNode(id="C12")
    c12.x_mm = 2.0
    c12.y_mm = 1.0
    c12.orientation_deg = 0
    c12.qubit_a_id = "Q1"
    c12.qubit_b_id = "Q2"
    c12.strength_mhz = 5.0
    g.add_node(c12)
    
    graph_dict = graph_to_dict(g)
    
    return {
        "project_name": "Test Palace Processor",
        "id": "design_test_v2",
        "v2": {
            "graph": graph_dict
        }
    }


def test_geometry_builder_v2(sample_v2_payload):
    """Test GeometryBuilder parses V2 graph node properties correctly."""
    geometry = GeometryBuilder.build_geometry(sample_v2_payload)
    
    assert geometry.design_id == "test_qubit_chip"
    assert geometry.chip_width_mm == 10.0
    assert geometry.substrate == "silicon"
    assert geometry.metal == "aluminum"
    
    assert len(geometry.qubits) == 2
    assert len(geometry.resonators) == 1
    assert len(geometry.couplers) == 1
    
    # Verify properties
    q1 = next(q for q in geometry.qubits if q.id == "Q1")
    assert q1.x_mm == 1.0
    assert q1.orientation_deg == 0.0
    assert q1.params["frequency_ghz"] == 5.0
    assert q1.params["ej_ghz"] == 20.0
    assert q1.params["ec_ghz"] == 0.28


def test_geometry_builder_legacy():
    """Test GeometryBuilder fallback to legacy flat payload structure."""
    payload = {
        "id": "legacy_design_id",
        "design": {
            "placements": [
                {"instanceId": "Q1", "location": {"x": 1.5, "y": 2.5}, "rotation": 45.0},
                {"instanceId": "R1", "location": {"x": 2.5, "y": 3.5}, "rotation": 0.0},
            ]
        },
        "frequency_plan": {
            "substrate": "sapphire",
            "metal": "niobium"
        }
    }
    
    geometry = GeometryBuilder.build_geometry(payload)
    assert geometry.design_id == "legacy_design_id"
    assert geometry.substrate == "sapphire"
    assert geometry.metal == "niobium"
    assert len(geometry.elements) == 2
    
    q1 = next(el for el in geometry.elements if el.id == "Q1")
    assert q1.kind == GeometryElementKind.QUBIT
    assert q1.x_mm == 1.5
    assert q1.y_mm == 2.5
    assert q1.orientation_deg == 45.0


def test_geometry_builder_empty():
    """Test GeometryBuilder raises GeometryError on empty payload."""
    with pytest.raises(GeometryError):
        GeometryBuilder.build_geometry({})


def test_config_generator(sample_v2_payload):
    """Test generating Palace configurations for both eigenmode and electrostatic solvers."""
    geometry = GeometryBuilder.build_geometry(sample_v2_payload)
    
    # 1. Eigenmode Config
    eig_config = ConfigGenerator.generate_config(geometry, PalaceSolverType.EIGENMODE)
    assert eig_config["Problem"]["Type"] == "Eigenmode"
    assert eig_config["Model"]["Mesh"] == "mesh.msh"
    assert eig_config["Domains"]["Materials"][1]["Permittivity"] == 11.7  # Silicon
    assert len(eig_config["Boundaries"]["LumpedPort"]) == 2  # Two qubit ports
    assert eig_config["Boundaries"]["LumpedPort"][0]["Index"] == 1
    assert eig_config["Boundaries"]["LumpedPort"][0]["L"] == 10.0
    assert "Eigenmode" in eig_config["Solver"]
    assert eig_config["Solver"]["Eigenmode"]["N"] == 5  # len(Q) + len(R) + 2

    # 2. Electrostatic Config
    el_config = ConfigGenerator.generate_config(geometry, PalaceSolverType.ELECTROSTATIC)
    assert el_config["Problem"]["Type"] == "Electrostatic"
    assert len(el_config["Boundaries"]["Terminal"]) == 3  # Two qubits + one resonator
    assert el_config["Boundaries"]["Terminal"][0]["Index"] == 1
    assert "Electrostatic" in el_config["Solver"]


@pytest.mark.asyncio
async def test_palace_runner_mock(sample_v2_payload):
    """Test Palace runner mock mode generates valid output files and executes."""
    geometry = GeometryBuilder.build_geometry(sample_v2_payload)
    eig_config = ConfigGenerator.generate_config(geometry, PalaceSolverType.EIGENMODE)
    
    runner = PalaceRunner(mock_mode=True)
    res = await runner.run_simulation(eig_config)
    
    assert "output_dir" in res
    assert "stdout" in res
    assert res["runtime_seconds"] > 0
    
    out_dir = Path(res["output_dir"])
    assert (out_dir / "eig.csv").exists()
    assert (out_dir / "port-EPR.csv").exists()
    
    # Verify cleanup works
    temp_dir_obj = res["temp_dir_obj"]
    temp_dir_path = Path(temp_dir_obj.name)
    assert temp_dir_path.exists()
    
    temp_dir_obj.cleanup()
    assert not temp_dir_path.exists()


def test_result_parser_eigenmode(tmp_path):
    """Test parsing eigenmode CSV outputs."""
    # Write mock eig.csv
    eig_content = "m, Re{f} (GHz), Im{f} (GHz), Q, Error (Bkwd.), Error (Abs.)\n1.00e+00, +5.120000000000e+09, +1.000000000000e-05, +1.200000000000e+06, +1.0e-12, +1.0e-10\n"
    with open(tmp_path / "eig.csv", "w") as f:
        f.write(eig_content)
        
    # Write mock port-EPR.csv
    epr_content = "m, EPR[1], EPR[2]\n1.00e+00, +9.200000000000e-01, +1.000000000000e-02\n"
    with open(tmp_path / "port-EPR.csv", "w") as f:
        f.write(epr_content)
        
    parsed = ResultParser.parse_eigenmode(tmp_path, port_names=["JJ_Q1", "JJ_Q2"])
    assert len(parsed.modes) == 1
    mode = parsed.modes[0]
    assert mode.mode_index == 1
    assert mode.frequency_ghz == 5.12
    assert mode.quality_factor == 1200000.0
    assert mode.epr["JJ_Q1"] == 0.92
    assert mode.epr["JJ_Q2"] == 0.01


def test_result_parser_electrostatic(tmp_path):
    """Test parsing capacitance matrix from CSV output."""
    c_content = (
        "i, C[i][1] (F), C[i][2] (F), C[i][3] (F)\n"
        "1.00e+00, +6.520000000000e-14, -3.400000000000e-15, -8.500000000000e-15\n"
        "2.00e+00, -3.400000000000e-15, +5.870000000000e-14, -8.000000000000e-17\n"
        "3.00e+00, -8.500000000000e-15, -8.000000000000e-17, +4.210000000000e-14\n"
    )
    with open(tmp_path / "terminal-C.csv", "w") as f:
        f.write(c_content)
        
    parsed = ResultParser.parse_electrostatic(tmp_path, terminal_names=["Q1_island", "Q2_island", "R1"])
    assert len(parsed.terminal_ids) == 3
    assert parsed.terminal_ids == ["Q1_island", "Q2_island", "R1"]
    # Verify conversion to fF (Farad * 1e15)
    assert abs(parsed.matrix[0][0] - 65.20) < 1e-5
    assert abs(parsed.matrix[0][1] - (-3.40)) < 1e-5
    assert abs(parsed.matrix[2][2] - 42.10) < 1e-5


def test_em_adapter(sample_v2_payload):
    """Test EMAdapter maps parsed results to EMResults and compiles DesignSpec correctly."""
    # 1. Test DesignSpec compilation
    design_spec = EMAdapter.build_design_spec_from_payload(sample_v2_payload)
    assert design_spec.design_id == "test_qubit_chip"
    assert len(design_spec.qubits) == 2
    assert design_spec.qubits[0].qubit_id == "Q1"
    assert design_spec.qubits[0].targets.frequency_ghz == 5.0
    assert design_spec.qubits[0].targets.anharmonicity_mhz == -250.0
    
    # 2. Test EMResults conversion
    raw_output = PalaceSimulationOutput(
        simulation_id="sim_test",
        design_id="test_qubit_chip",
        timestamp="2026-06-04T18:00:00Z",
        solver_type=PalaceSolverType.EIGENMODE,
        runtime_seconds=10.0
    )
    em_results = EMAdapter.to_em_results(raw_output)
    assert em_results.simulation_id == "sim_test"
    assert em_results.design_id == "test_qubit_chip"


@pytest.mark.asyncio
async def test_simulations_router_run_palace(sample_v2_payload):
    """Integration test verifying simulations API route triggers Palace engine workflow."""
    # Create mock database dependencies
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
    
    # Mock database queries
    mock_sim_result = MagicMock()
    mock_sim_result.scalar_one_or_none.return_value = mock_sim
    
    mock_proj_result = MagicMock()
    mock_proj_result.scalar_one_or_none.return_value = mock_project
    
    mock_db.execute.side_effect = [
        mock_sim_result,   # First query: Simulation lookup
        mock_proj_result   # Second query: Project lookup
    ]
    
    # Run simulation with engine="palace" (via patching settings.palace_mock_mode)
    with patch("app.routers.simulations.settings.palace_mock_mode", True):
        result = await run_simulation(
            sim_id="sim_789",
            body=RunSimulationRequest(engine="palace"),
            db=mock_db,
            user=mock_user
        )
        
        # Verify simulation status updated
        assert result.get("error_message") is None, f"Simulation failed with error: {result.get('error_message')}"
        assert result["status"] == "completed"
        assert result["results"] is not None
        assert "physics_score" in result["results"]
        assert "qubit_results" in result["results"]
        assert mock_sim.status == SimulationStatus.completed
        assert mock_sim.runtime_seconds > 0


@pytest.mark.asyncio
async def test_palace_runner_docker_daemon_missing():
    """Verify PalaceRunner raises PalaceRunnerError if Docker daemon is not running."""
    runner = PalaceRunner(mock_mode=False)
    
    # Mock create_subprocess_exec to simulate docker info returning exit code 1
    mock_proc = AsyncMock()
    mock_proc.communicate.return_value = (b"", b"Cannot connect to the Docker daemon")
    mock_proc.returncode = 1
    
    with patch("asyncio.create_subprocess_exec", return_value=mock_proc) as mock_exec:
        from app.services.palace.exceptions import PalaceRunnerError
        with pytest.raises(PalaceRunnerError) as exc_info:
            await runner.run_simulation(config_data={"Problem": {"Type": "Eigenmode"}})
        assert "Docker daemon is unavailable" in str(exc_info.value)
        mock_exec.assert_any_call("docker", "info", stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)


@pytest.mark.asyncio
async def test_palace_runner_docker_image_missing():
    """Verify PalaceRunner raises PalaceRunnerError if the required Docker image is missing."""
    runner = PalaceRunner(mock_mode=False, docker_image="palace-sim:latest")
    
    # First mock proc for docker info (success)
    mock_proc_info = AsyncMock()
    mock_proc_info.communicate.return_value = (b"docker info output", b"")
    mock_proc_info.returncode = 0
    
    # Second mock proc for docker image inspect (failure)
    mock_proc_inspect = AsyncMock()
    mock_proc_inspect.communicate.return_value = (b"", b"Error: No such image")
    mock_proc_inspect.returncode = 1
    
    with patch("asyncio.create_subprocess_exec", side_effect=[mock_proc_info, mock_proc_inspect]):
        from app.services.palace.exceptions import PalaceRunnerError
        with pytest.raises(PalaceRunnerError) as exc_info:
            await runner.run_simulation(config_data={"Problem": {"Type": "Eigenmode"}})
        assert "is missing or not built locally" in str(exc_info.value)


@pytest.mark.asyncio
async def test_palace_runner_missing_output_files():
    """Verify PalaceRunner raises PalaceRunnerError if output files are missing after a real run."""
    runner = PalaceRunner(mock_mode=False, docker_image="palace-sim:latest")
    
    # 1. docker info (success)
    mock_proc_info = AsyncMock()
    mock_proc_info.communicate.return_value = (b"", b"")
    mock_proc_info.returncode = 0
    
    # 2. docker image inspect (success)
    mock_proc_inspect = AsyncMock()
    mock_proc_inspect.communicate.return_value = (b"", b"")
    mock_proc_inspect.returncode = 0
    
    # 3. docker run (success, exit code 0, but doesn't write eig.csv)
    mock_proc_run = AsyncMock()
    mock_proc_run.communicate.return_value = (b"Simulation completed", b"")
    mock_proc_run.returncode = 0
    
    with patch("asyncio.create_subprocess_exec", side_effect=[mock_proc_info, mock_proc_inspect, mock_proc_run]):
        from app.services.palace.exceptions import PalaceRunnerError
        with pytest.raises(PalaceRunnerError) as exc_info:
            await runner.run_simulation(
                config_data={"Problem": {"Type": "Eigenmode"}},
                mesh_content=b"dummy mesh content"
            )
        assert "expected output file 'eig.csv' is missing" in str(exc_info.value)

