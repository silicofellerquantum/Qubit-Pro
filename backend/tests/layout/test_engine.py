import pytest
import math
from unittest.mock import MagicMock

from app.core.design_graph.graph import DesignGraph
from app.core.design_graph.node import QubitNode, CouplerNode, ResonatorNode, FeedlineNode, LaunchpadNode
from app.constraints.constraints import DesignConstraints, FabConstraints
from app.layout import LayoutEngine, generate_layout
from app.layout.adapters import to_placement_dict, from_design_graph
from app.layout.constants import CPSAT_MAX_COMPONENTS
from app.layout.legalizer import PlacementLegalizer, LegalizationInfeasible


def _create_small_design() -> DesignGraph:
    """Helper to create a small 4-qubit layout design graph."""
    g = DesignGraph()
    # Add 4 qubits
    for i in range(4):
        g.add_node(QubitNode(id=f"q{i}"))
    # Add 2 couplers
    g.add_node(CouplerNode(id="c0", qubit_a_id="q0", qubit_b_id="q1"))
    g.add_node(CouplerNode(id="c1", qubit_a_id="q2", qubit_b_id="q3"))
    # Add 4 resonators
    for i in range(4):
        g.add_node(ResonatorNode(id=f"r{i}", target_qubit_id=f"q{i}"))
    # Add 1 feedline
    g.add_node(FeedlineNode(id="fl0"))
    # Add 2 launchpads
    g.add_node(LaunchpadNode(id="lp0"))
    g.add_node(LaunchpadNode(id="lp1"))
    return g


def test_engine_generate_success():
    """Verify that LayoutEngine.generate() runs successfully and returns a candidate."""
    g = _create_small_design()
    constraints = DesignConstraints(qubit_count=4)
    constraints.topology = "square"
    constraints.fab = FabConstraints(pocket_half_size_mm=0.2, min_qubit_spacing_mm=0.1)

    engine = LayoutEngine()
    candidate = engine.generate(g, constraints)

    # Verify candidate structure
    assert candidate is not None
    assert candidate.placements is not None
    assert candidate.score is not None
    assert candidate.template_name == "square"
    assert candidate.generation_time_sec > 0.0
    
    # Coordinates must be centered around (0,0) and within bounds
    die_w = candidate.metadata["chip_width_mm"]
    die_h = candidate.metadata["chip_height_mm"]
    for node_id, (cx, cy) in candidate.placements.items():
        assert -die_w / 2.0 <= cx <= die_w / 2.0
        assert -die_h / 2.0 <= cy <= die_h / 2.0

    # Score checks
    assert candidate.score.gate_passed is True
    assert candidate.score.overall_score > 0.0
    assert candidate.score.overlap_score == 100.0  # Should be overlap-free


def test_engine_apply_success():
    """Verify that apply() correctly writes coordinates back to DesignGraph nodes."""
    g = _create_small_design()
    constraints = DesignConstraints(qubit_count=4)
    constraints.topology = "square"
    constraints.fab = FabConstraints(pocket_half_size_mm=0.2, min_qubit_spacing_mm=0.1)

    engine = LayoutEngine()
    candidate = engine.generate(g, constraints)
    
    # Apply placements to the graph
    engine.apply(candidate, g)

    # Check that coordinates are correctly written back in centered format
    for node_id, (cx, cy) in candidate.placements.items():
        node = g.get_node(node_id)
        assert node.x_mm == cx
        assert node.y_mm == cy
        
    assert g.chip_width_mm == candidate.metadata["chip_width_mm"]
    assert g.chip_height_mm == candidate.metadata["chip_height_mm"]


def test_engine_fallback_on_infeasible(monkeypatch):
    """Verify that when CP-SAT fails, LayoutEngine falls back to OverlapResolver."""
    g = _create_small_design()
    constraints = DesignConstraints(qubit_count=4)
    constraints.topology = "square"
    constraints.fab = FabConstraints(pocket_half_size_mm=0.2, min_qubit_spacing_mm=0.1)

    # Force legalization to raise LegalizationInfeasible
    def mock_legalize(self, components, constraints, obstacles, die_bounds=None):
        raise LegalizationInfeasible("Simulated CP-SAT UNSAT failure")

    monkeypatch.setattr(PlacementLegalizer, "legalize", mock_legalize)

    engine = LayoutEngine()
    candidate = engine.generate(g, constraints)

    # Verify that it fell back to overlap resolver
    assert candidate.metadata["solver"] == "overlap_resolver"
    assert candidate.score.gate_passed is True
    assert candidate.score.overlap_score == 100.0


def test_engine_fallback_on_max_components():
    """Verify that OverlapResolver is used directly if component count exceeds CP-SAT limits."""
    g = _create_small_design()
    constraints = DesignConstraints(qubit_count=4)
    constraints.topology = "square"
    constraints.fab = FabConstraints(pocket_half_size_mm=0.2, min_qubit_spacing_mm=0.1)

    # Temporarily set max components to 2 to trigger limit check
    import app.layout.engine as engine_module
    old_max = engine_module.CPSAT_MAX_COMPONENTS
    engine_module.CPSAT_MAX_COMPONENTS = 2

    try:
        engine = LayoutEngine()
        candidate = engine.generate(g, constraints)
        assert candidate.metadata["solver"] == "overlap_resolver"
    finally:
        engine_module.CPSAT_MAX_COMPONENTS = old_max


def test_convenience_wrapper():
    """Verify that the generate_layout() convenience wrapper works end-to-end."""
    g = _create_small_design()
    constraints = DesignConstraints(qubit_count=4)
    constraints.topology = "square"
    constraints.fab = FabConstraints(pocket_half_size_mm=0.2, min_qubit_spacing_mm=0.1)

    candidate = generate_layout(g, constraints)
    
    assert candidate is not None
    assert candidate.score.gate_passed is True

    # Node coordinates must be written in-place on the input graph
    for node_id, (cx, cy) in candidate.placements.items():
        node = g.get_node(node_id)
        assert node.x_mm == cx
        assert node.y_mm == cy


def test_legacy_adapter_conversion():
    """Verify that to_placement_dict converts candidate to the correct legacy schema."""
    g = _create_small_design()
    constraints = DesignConstraints(qubit_count=4)
    constraints.topology = "square"
    constraints.fab = FabConstraints(pocket_half_size_mm=0.2, min_qubit_spacing_mm=0.1)

    engine = LayoutEngine()
    candidate = engine.generate(g, constraints)

    placement_dict = to_placement_dict(candidate)

    assert placement_dict["solver"] == "cpsat"
    assert "qubits" in placement_dict
    assert "edges" in placement_dict
    assert placement_dict["topology"] == "square"
    assert placement_dict["pitch_mm"] == candidate.metadata["pitch_mm"]
    assert placement_dict["overall_score"] == candidate.score.overall_score

    # Check qubits schema
    assert len(placement_dict["qubits"]) == 4
    for q in placement_dict["qubits"]:
        assert "id" in q
        assert "name" in q
        assert "x" in q
        assert "y" in q
        assert "orientation_deg" in q

    # Check edges schema
    assert len(placement_dict["edges"]) == 2
    for e in placement_dict["edges"]:
        assert "qubit_a" in e
        assert "qubit_b" in e
        assert "pin_a" in e
        assert "pin_b" in e
        assert "label" in e


def test_from_design_graph():
    """Verify that from_design_graph extracts placements from design graph."""
    g = _create_small_design()
    q0 = g.get_node("q0")
    q0.x_mm = 1.5
    q0.y_mm = -2.5

    placements = from_design_graph(g)
    assert len(placements) == 1
    assert placements["q0"] == (1.5, -2.5)
