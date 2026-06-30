import pytest
from app.core.design_graph.graph import DesignGraph
from app.core.design_graph.node import (
    QubitNode,
    ResonatorNode,
    CouplerNode,
    FeedlineNode,
    LaunchpadNode,
)
from app.constraints.constraints import DesignConstraints, FabConstraints
from app.layout.floorplanner import Floorplanner, ConstraintKind


def test_floorplanner_square_grid():
    """Verify floorplanning for a 4-qubit square grid lattice topology."""
    g = DesignGraph()
    qubits = [QubitNode(id=f"q{i}") for i in range(4)]
    for q in qubits:
        g.add_node(q)

    # 2 couplers
    c1 = CouplerNode(id="c0", qubit_a_id="q0", qubit_b_id="q1")
    c2 = CouplerNode(id="c1", qubit_a_id="q2", qubit_b_id="q3")
    g.add_node(c1)
    g.add_node(c2)

    # 4 resonators
    for i in range(4):
        g.add_node(ResonatorNode(id=f"r{i}", target_qubit_id=f"q{i}"))

    # 1 feedline
    g.add_node(FeedlineNode(id="fl0"))

    # 2 launchpads
    g.add_node(LaunchpadNode(id="lp0"))
    g.add_node(LaunchpadNode(id="lp1"))

    # Generate plan
    constraints = DesignConstraints(qubit_count=4)
    constraints.topology = "square"
    constraints.fab = FabConstraints(pocket_half_size_mm=0.2, min_qubit_spacing_mm=0.1)

    fp = Floorplanner(g, constraints)
    result = fp.plan()

    # Assertions
    assert result is not None
    assert len(result.warnings) == 0
    assert result.spec.topology == "square"
    
    # Check that coordinate values are written back to the graph nodes
    for q in qubits:
        node = g.get_node(q.id)
        assert node.x_mm is not None
        assert node.y_mm is not None

    # Check constraint categories
    assert len(result.qubit_constraints) == 4
    assert len(result.resonator_constraints) == 4
    assert len(result.coupler_constraints) == 2
    assert len(result.feedline_constraints) == 1
    assert len(result.launchpad_constraints) == 2

    # Check serialization
    data = result.to_dict()
    assert data["summary"]["total_constraints"] == 13


def test_floorplanner_ring():
    """Verify floorplanning for a circular ring topology."""
    g = DesignGraph()
    qubits = [QubitNode(id=f"q{i}") for i in range(4)]
    for q in qubits:
        g.add_node(q)

    # Ring couplers
    g.add_node(CouplerNode(id="c0", qubit_a_id="q0", qubit_b_id="q1"))
    g.add_node(CouplerNode(id="c1", qubit_a_id="q1", qubit_b_id="q2"))
    g.add_node(CouplerNode(id="c2", qubit_a_id="q2", qubit_b_id="q3"))
    g.add_node(CouplerNode(id="c3", qubit_a_id="q3", qubit_b_id="q0"))

    constraints = DesignConstraints(qubit_count=4)
    constraints.topology = "ring"
    constraints.fab = FabConstraints(pocket_half_size_mm=0.2, min_qubit_spacing_mm=0.1)

    fp = Floorplanner(g, constraints)
    result = fp.plan()

    assert result is not None
    assert result.spec.topology == "ring"
    assert len(result.qubit_constraints) == 4
    assert len(result.coupler_constraints) == 4


def test_floorplanner_heavyhex():
    """Verify floorplanning for an IBM-style HeavyHex topology."""
    g = DesignGraph()
    # 5 qubit HeavyHex (sub-lattice)
    qubits = [QubitNode(id=f"q{i}") for i in range(5)]
    for q in qubits:
        g.add_node(q)

    g.add_node(CouplerNode(id="c0", qubit_a_id="q0", qubit_b_id="q1"))
    g.add_node(CouplerNode(id="c1", qubit_a_id="q1", qubit_b_id="q2"))
    g.add_node(CouplerNode(id="c2", qubit_a_id="q2", qubit_b_id="q3"))
    g.add_node(CouplerNode(id="c3", qubit_a_id="q3", qubit_b_id="q4"))

    constraints = DesignConstraints(qubit_count=5)
    constraints.topology = "heavyhex"
    constraints.fab = FabConstraints(pocket_half_size_mm=0.2, min_qubit_spacing_mm=0.1)

    fp = Floorplanner(g, constraints)
    result = fp.plan()

    assert result is not None
    assert result.spec.topology == "heavyhex"
    assert len(result.qubit_constraints) == 5
    assert len(result.coupler_constraints) == 4


def test_floorplanner_vio():
    """Verify floorplanning for a Vertical-I/O/flip-chip layout."""
    g = DesignGraph()
    qubits = [QubitNode(id=f"q{i}") for i in range(4)]
    for q in qubits:
        g.add_node(q)

    constraints = DesignConstraints(qubit_count=4)
    constraints.topology = "vio"
    constraints.fab = FabConstraints(pocket_half_size_mm=0.2, min_qubit_spacing_mm=0.1)

    fp = Floorplanner(g, constraints)
    result = fp.plan()

    assert result is not None
    assert result.spec.topology == "vio"
    assert len(result.qubit_constraints) == 4


def test_floorplanner_fallback_topology():
    """Verify that an unknown or custom topology safely falls back to a registered template."""
    g = DesignGraph()
    qubits = [QubitNode(id=f"q{i}") for i in range(3)]
    for q in qubits:
        g.add_node(q)

    constraints = DesignConstraints(qubit_count=3)
    constraints.topology = "non_existent_topology"
    constraints.fab = FabConstraints(pocket_half_size_mm=0.25, min_qubit_spacing_mm=0.05)

    fp = Floorplanner(g, constraints)
    result = fp.plan()

    assert result is not None
    assert result.spec.topology == "non_existent_topology"
    # Fallback template selected is heavyhex from TEMPLATE_PRIORITY
    assert result.spec.template_result is not None
    assert result.spec.template_result.name == "heavyhex"
    assert len(result.qubit_constraints) == 3


def test_floorplanner_pitch_formula():
    """Verify pitch matches pitch >= footprint + clearance."""
    g = DesignGraph()
    g.add_node(QubitNode(id="q0"))

    # Test case 1: pitch > 1.0 mm
    constraints = DesignConstraints(qubit_count=1)
    constraints.fab = FabConstraints(pocket_half_size_mm=0.5, min_qubit_spacing_mm=0.2)
    fp = Floorplanner(g, constraints)
    result = fp.plan()
    
    # 2 * 0.5 + 0.2 = 1.2 mm
    assert pytest.approx(result.spec.pitch_mm) == 1.2

    # Test case 2: ensures absolute floor of 1.0 mm is respected if computed is smaller
    constraints2 = DesignConstraints(qubit_count=1)
    constraints2.fab = FabConstraints(pocket_half_size_mm=0.1, min_qubit_spacing_mm=0.05)
    fp2 = Floorplanner(g, constraints2)
    result2 = fp2.plan()
    
    # 2 * 0.1 + 0.05 = 0.25 mm -> absolute floor 1.0 mm should be active
    assert result2.spec.pitch_mm == 1.0


def test_floorplanner_die_sizing():
    """Verify that the chip die size scales up as N increases."""
    # N = 4 Qubits
    g4 = DesignGraph()
    for i in range(4):
        g4.add_node(QubitNode(id=f"q{i}"))
    c4 = DesignConstraints(qubit_count=4)
    c4.fab = FabConstraints(pocket_half_size_mm=0.2, min_qubit_spacing_mm=0.1)
    result4 = Floorplanner(g4, c4).plan()

    # N = 16 Qubits
    g16 = DesignGraph()
    for i in range(16):
        g16.add_node(QubitNode(id=f"q{i}"))
    c16 = DesignConstraints(qubit_count=16)
    c16.fab = FabConstraints(pocket_half_size_mm=0.2, min_qubit_spacing_mm=0.1)
    result16 = Floorplanner(g16, c16).plan()

    assert result16.spec.chip_width_mm > result4.spec.chip_width_mm
    assert result16.spec.chip_height_mm > result4.spec.chip_height_mm
