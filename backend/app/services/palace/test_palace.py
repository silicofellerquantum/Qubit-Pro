from __future__ import annotations
import json
import os
import sys
from pathlib import Path
import pytest

from app.core.design_graph.graph import DesignGraph
from app.core.design_graph.node import QubitNode, ResonatorNode, CouplerNode
from app.services.palace import (
    build_geometry,
    PalaceConfigGenerator,
    PalaceRunner,
    PalaceResultParser,
    build_em_results,
    build_design_spec,
    SolverType,
)

# Robust sys.path injection to import physics_engine models in test environment
# Now located at: backend/app/services/palace/test_palace.py
# parents[3] is: backend/
backend_dir = Path(__file__).resolve().parents[3]
physics_src = backend_dir / "physics_analysis" / "src"
if str(physics_src) not in sys.path:
    sys.path.insert(0, str(physics_src))

from physics_engine.models.em_results import EMResults
from physics_engine.models.design_spec import DesignSpec


@pytest.fixture
def sample_graph() -> DesignGraph:
    """Create a sample 2-qubit DesignGraph for testing."""
    g = DesignGraph(
        chip_name="TestChip",
        chip_width_mm=10.0,
        chip_height_mm=10.0,
        substrate="silicon",
        metal="aluminum",
    )
    
    q1 = QubitNode(id="Q1", frequency_ghz=5.0, ej_ghz=13.0, ec_ghz=0.28)
    q1.x_mm = -1.5
    q1.y_mm = 0.0
    q1.design_options = {"cross_length": "200um"}
    g.add_node(q1)
    
    q2 = QubitNode(id="Q2", frequency_ghz=5.5, ej_ghz=15.0, ec_ghz=0.28)
    q2.x_mm = 1.5
    q2.y_mm = 0.0
    q2.design_options = {"cross_length": "180um"}
    g.add_node(q2)
    
    r1 = ResonatorNode(id="R1", frequency_ghz=6.5, length_mm=7.2, target_qubit_id="Q1")
    r1.x_mm = -1.5
    r1.y_mm = 2.0
    g.add_node(r1)
    
    c12 = CouplerNode(id="C12", strength_mhz=12.0, qubit_a_id="Q1", qubit_b_id="Q2")
    c12.x_mm = 0.0
    c12.y_mm = 0.0
    g.add_node(c12)
    
    return g


@pytest.fixture
def sample_payload(sample_graph: DesignGraph) -> dict:
    """Create a sample design payload dict."""
    from app.core.design_graph.serializer import graph_to_dict
    return {
        "label": "TestChip",
        "material": {"substrate": "silicon", "metal": "aluminum"},
        "v2": {
            "graph": graph_to_dict(sample_graph)
        }
    }


def test_geometry_builder(sample_graph: DesignGraph, sample_payload: dict):
    """Test that geometry_builder correctly extracts layout features."""
    # Build from graph object
    geom_from_graph = build_geometry(sample_graph)
    assert geom_from_graph.chip_name == "TestChip"
    assert geom_from_graph.substrate == "silicon"
    assert len(geom_from_graph.qubits) == 2
    assert len(geom_from_graph.resonators) == 1
    assert len(geom_from_graph.couplers) == 1

    # Verify positions and properties
    q1_geom = next(q for q in geom_from_graph.qubits if q.id == "Q1")
    assert q1_geom.x_mm == -1.5
    assert q1_geom.frequency_ghz == 5.0
    assert q1_geom.design_options == {"cross_length": "200um"}

    # Build from payload dictionary
    geom_from_payload = build_geometry(sample_payload)
    assert geom_from_payload.chip_name == "TestChip"
    assert len(geom_from_payload.qubits) == 2


def test_config_generator(sample_graph: DesignGraph):
    """Test that config_generator produces compliant Palace configurations."""
    geom = build_geometry(sample_graph)
    gen = PalaceConfigGenerator(geom)

    # 1. Eigenmode Config
    eig_config = gen.generate(SolverType.EIGENMODE)
    assert eig_config["Problem"]["Type"] == "Eigenmode"
    assert eig_config["Model"]["Mesh"] == "mesh.msh"
    assert len(eig_config["Boundaries"]["LumpedPort"]) == 2  # 2 qubits
    assert eig_config["Boundaries"]["LumpedPort"][0]["Name"] == "JJ_Q1"
    assert eig_config["Solver"]["Eigenmode"]["Num"] == 4

    # 2. Electrostatic Config
    es_config = gen.generate(SolverType.ELECTROSTATIC)
    assert es_config["Problem"]["Type"] == "Electrostatic"
    # Q1_island, Q2_island, R1
    terminals = [t["Name"] for t in es_config["Boundaries"]["Terminal"]]
    assert "Q1_island" in terminals
    assert "R1" in terminals


def test_result_parser(tmp_path: Path):
    """Test result_parser parsing eig.csv, epr.csv, and cap.csv files."""
    parser = PalaceResultParser()

    # 1. Write mock eig.csv and epr.csv
    eig_csv = tmp_path / "eig.csv"
    with open(eig_csv, "w", encoding="utf-8") as f:
        f.write("Mode, f (GHz), Q\n")
        f.write("1, 4.950000, 150000.0\n")
        f.write("2, 6.510000, 80000.0\n")

    epr_csv = tmp_path / "epr.csv"
    with open(epr_csv, "w", encoding="utf-8") as f:
        f.write("Mode, JJ_Q1, JJ_Q2\n")
        f.write("1, 0.96, 0.001\n")
        f.write("2, 0.005, 0.002\n")

    eigenmodes = parser.parse_eigenmodes(eig_csv, epr_csv)
    assert len(eigenmodes) == 2
    assert eigenmodes[0].mode_index == 1
    assert eigenmodes[0].frequency_ghz == 4.95
    assert eigenmodes[0].epr["JJ_Q1"] == 0.96

    # 2. Write mock cap.csv
    cap_csv = tmp_path / "cap.csv"
    with open(cap_csv, "w", encoding="utf-8") as f:
        f.write("Terminal, Q1_island, Q2_island, R1\n")
        f.write("Q1_island, 85.0000, -2.5000, -1.8000\n")
        f.write("Q2_island, -2.5000, 85.0000, -0.0500\n")
        f.write("R1, -1.8000, -0.0500, 45.0000\n")

    cap = parser.parse_capacitance(cap_csv)
    assert cap.terminal_ids == ["Q1_island", "Q2_island", "R1"]
    assert cap.matrix[0][1] == -2.5


def test_palace_runner_fallback(sample_graph: DesignGraph, tmp_path: Path):
    """Test that palace_runner correctly writes configurations and falls back on error."""
    geom = build_geometry(sample_graph)
    gen = PalaceConfigGenerator(geom)
    config = gen.generate(SolverType.EIGENMODE)

    runner = PalaceRunner()
    # Force run in a persistent work directory
    res_dir = runner.run(geom, config, SolverType.EIGENMODE, work_dir=str(tmp_path))

    # Verify that files are written
    assert (res_dir / "config.json").exists()
    assert (res_dir / "mesh.msh").exists()
    
    # Verify fallback written outputs because Docker isn't running in tests
    assert (res_dir / "postpro" / "eig.csv").exists()
    assert (res_dir / "postpro" / "epr.csv").exists()


def test_em_adapter(sample_graph: DesignGraph):
    """Test that em_adapter correctly maps outputs and layouts to target EMResults and DesignSpec."""
    from app.services.palace.result_parser import PalaceSimulationOutputs, ParsedCapacitance, ParsedEigenmode
    
    parsed = PalaceSimulationOutputs(
        eigenmodes=[
            ParsedEigenmode(mode_index=1, frequency_ghz=4.95, quality_factor=150000.0, epr={"JJ_Q1": 0.96})
        ],
        capacitance=ParsedCapacitance(
            terminal_ids=["Q1_island", "R1"],
            matrix=[[85.0, -1.8], [-1.8, 45.0]]
        ),
        inductances=[],
    )

    em_results = build_em_results("sim-abc", "proj-xyz", parsed)
    assert isinstance(em_results, EMResults)
    assert em_results.simulation_id == "sim-abc"
    assert em_results.eigenmode.modes[0].frequency_ghz == 4.95
    assert em_results.electrostatic.capacitance_matrix.matrix[0][1] == -1.8

    design_spec = build_design_spec("proj-xyz", "TestProject", sample_graph)
    assert isinstance(design_spec, DesignSpec)
    assert design_spec.design_id == "proj-xyz"
    assert design_spec.project_name == "TestProject"
    assert len(design_spec.qubits) == 2
    assert design_spec.qubits[0].qubit_id == "Q1"
    assert design_spec.resonators[0].resonator_id == "R1"
