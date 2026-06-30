import pytest
import math
import time
from shapely.geometry import box

from app.layout.models import Footprint, Obstacle
from app.layout.cpsat_model import build_cpsat_model, solve_model, LegalizationInfeasible
from app.core.design_graph.graph import DesignGraph
from app.core.design_graph.node import QubitNode, CouplerNode, ResonatorNode, FeedlineNode, LaunchpadNode
from app.constraints.constraints import DesignConstraints, FabConstraints
from app.layout.floorplanner import Floorplanner
from app.layout.footprints import FootprintGenerator


class MockConstraint:
    def __init__(self, node_id, kind, x_mm, y_mm, meta=None):
        self.node_id = node_id
        self.kind = kind
        self.x_mm = x_mm
        self.y_mm = y_mm
        self.meta = meta or {}


def test_variable_creation():
    """Verify that coordinate variables are created correctly."""
    q0 = Footprint(
        node_id="q0",
        component_type="qubit",
        width_mm=0.6,
        height_mm=0.6,
        keepout_mm=0.1,
        polygon=None,
        keepout_polygon=None
    )
    
    model, variable_map = build_cpsat_model([q0], [], [], die_bounds=(5.0, 5.0))
    
    assert "q0" in variable_map
    assert "x" in variable_map["q0"]
    assert "y" in variable_map["q0"]


def test_no_overlap_2d():
    """Verify that overlapping components are pushed apart by NoOverlap2D."""
    q0 = Footprint(
        node_id="q0",
        component_type="qubit",
        width_mm=0.6,
        height_mm=0.6,
        keepout_mm=0.1,
        polygon=None,
        keepout_polygon=None
    )
    q1 = Footprint(
        node_id="q1",
        component_type="qubit",
        width_mm=0.6,
        height_mm=0.6,
        keepout_mm=0.1,
        polygon=None,
        keepout_polygon=None
    )

    # Place q0 at (2.0, 2.0) and q1 target at (2.8, 2.0) (overlap by 0.1mm with keepouts)
    # The solver must push them apart by at least 0.7mm total distance.
    c0 = MockConstraint("q0", "qubit_site", 2.0, 2.0)
    c1_soft = MockConstraint("q1", "coupler_corridor", 2.8, 2.0)

    model, variable_map = build_cpsat_model([q0, q1], [c0, c1_soft], [], die_bounds=(5.0, 5.0))
    placements = solve_model(model, variable_map)

    x0, y0 = placements["q0"]
    x1, y1 = placements["q1"]

    # Distance must be >= width + clearance = 0.6 + 0.1 = 0.7 mm
    dist = math.hypot(x0 - x1, y0 - y1)
    assert dist >= 0.7


def test_die_bounds():
    """Verify components stay inside die boundaries."""
    q0 = Footprint(
        node_id="q0",
        component_type="qubit",
        width_mm=0.6,
        height_mm=0.6,
        keepout_mm=0.1,
        polygon=None,
        keepout_polygon=None
    )

    # Pull component to (4.8, 4.8) which is too close to the (5.0, 5.0) boundary
    c0 = MockConstraint("q0", "coupler_corridor", 4.8, 4.8)

    model, variable_map = build_cpsat_model([q0], [c0], [], die_bounds=(5.0, 5.0))
    placements = solve_model(model, variable_map)

    x, y = placements["q0"]
    
    # 0.6 mm width -> center must be <= 5.0 - 0.3 = 4.7 mm and >= 0.3 mm
    assert 0.3 <= x <= 4.7
    assert 0.3 <= y <= 4.7


def test_attachment_constraint():
    """Verify resonator stays near its parent qubit."""
    q0 = Footprint(
        node_id="q0",
        component_type="qubit",
        width_mm=0.6,
        height_mm=0.6,
        keepout_mm=0.1,
        polygon=None,
        keepout_polygon=None
    )
    r0 = Footprint(
        node_id="r0",
        component_type="resonator",
        width_mm=0.2,
        height_mm=0.2,
        keepout_mm=0.05,
        polygon=None,
        keepout_polygon=None
    )

    # Qubit at (2.0, 2.0)
    c0 = MockConstraint("q0", "qubit_site", 2.0, 2.0)
    
    # Resonator attached to q0, placed below the qubit in the feedline direction
    cr = MockConstraint("r0", "resonator_shell", 2.0, 1.2, meta={"target_qubit": "q0", "qubit_y_mm": 2.0})

    model, variable_map = build_cpsat_model([q0, r0], [c0, cr], [], die_bounds=(5.0, 5.0))
    placements = solve_model(model, variable_map)

    qx, qy = placements["q0"]
    rx, ry = placements["r0"]

    assert qx == 2.0
    assert qy == 2.0
    
    # Resonator must remain close to (2.0, 2.0) (<= 1.2 mm) and be placed below the qubit
    assert math.hypot(rx - qx, ry - qy) <= 1.2
    assert ry < qy


def test_corridor_centering():
    """Verify coupler stays centered in corridor."""
    c0 = Footprint(
        node_id="c0",
        component_type="coupler",
        width_mm=0.2,
        height_mm=0.1,
        keepout_mm=0.05,
        polygon=None,
        keepout_polygon=None
    )

    # Target corridor center at (3.0, 3.0)
    cc = MockConstraint("c0", "coupler_corridor", 3.0, 3.0)

    model, variable_map = build_cpsat_model([c0], [cc], [], die_bounds=(5.0, 5.0))
    placements = solve_model(model, variable_map)

    cx, cy = placements["c0"]
    assert abs(cx - 3.0) <= 0.2
    assert abs(cy - 3.0) <= 0.2


def test_solver_determinism():
    """Verify that solver solutions are 100% deterministic."""
    q0 = Footprint(node_id="q0", component_type="qubit", width_mm=0.6, height_mm=0.6, keepout_mm=0.1, polygon=None, keepout_polygon=None)
    q1 = Footprint(node_id="q1", component_type="qubit", width_mm=0.6, height_mm=0.6, keepout_mm=0.1, polygon=None, keepout_polygon=None)
    c0 = Footprint(node_id="c0", component_type="coupler", width_mm=0.2, height_mm=0.1, keepout_mm=0.05, polygon=None, keepout_polygon=None)
    r0 = Footprint(node_id="r0", component_type="resonator", width_mm=0.2, height_mm=0.2, keepout_mm=0.05, polygon=None, keepout_polygon=None)

    constraints = [
        MockConstraint("q0", "qubit_site", 1.5, 1.5),
        MockConstraint("q1", "qubit_site", 3.0, 3.0),
        MockConstraint("c0", "coupler_corridor", 2.25, 2.25),
        MockConstraint("r0", "resonator_shell", 1.5, 0.8, meta={"target_qubit": "q0", "qubit_y_mm": 1.5})
    ]

    first_result = None
    
    for _ in range(10):
        model, variable_map = build_cpsat_model([q0, q1, c0, r0], constraints, [], die_bounds=(5.0, 5.0))
        placements = solve_model(model, variable_map)
        
        if first_result is None:
            first_result = placements
        else:
            assert placements == first_result


def test_heavyhex_25q_solve_time():
    """Verify that a 25-qubit HeavyHex design compiles and legalizes in < 2.0s."""
    g = DesignGraph()
    # 25 Qubits with pocket size matching the fab constraints (400 µm)
    qubits = [QubitNode(id=f"q{i}", pocket_width_um=400, pocket_height_um=400) for i in range(25)]
    for q in qubits:
        g.add_node(q)

    # Generate couplers using HeavyHex template edges to match physical adjacency
    # Filter out next-nearest neighbor edges (distance >= 1.8 mm) that cross other qubits
    from app.layout.templates.heavyhex import HeavyHexTemplate
    t = HeavyHexTemplate()
    sites = t.sites(25, 1.0)
    all_edges = t._generate_heavyhex_edges(sites)
    edges = [
        (i, j) for (i, j) in all_edges
        if math.hypot(sites[i].x_mm - sites[j].x_mm, sites[i].y_mm - sites[j].y_mm) < 1.8
    ]

    for idx, (i, j) in enumerate(edges):
        g.add_node(CouplerNode(id=f"c{idx}", qubit_a_id=f"q{i}", qubit_b_id=f"q{j}"))

    # 25 Resonators
    for i in range(25):
        g.add_node(ResonatorNode(id=f"r{i}", target_qubit_id=f"q{i}"))

    # 1 Feedline
    g.add_node(FeedlineNode(id="fl0"))

    # 12 Launchpads
    for i in range(12):
        g.add_node(LaunchpadNode(id=f"lp{i}"))

    constraints = DesignConstraints(qubit_count=25)
    constraints.topology = "heavyhex"
    constraints.fab = FabConstraints(pocket_half_size_mm=0.2, min_qubit_spacing_mm=0.1)

    # 1. Floorplan
    fp = Floorplanner(g, constraints)
    fp_result = fp.plan()

    # 2. Footprint generation
    fg = FootprintGenerator(clearance_mm=0.1)
    footprints = list(fg.generate_all(g).values())

    # 3. Model construction and solve time check
    start_time = time.time()
    
    model, variable_map = build_cpsat_model(
        footprints, 
        fp_result.constraints, 
        [], 
        die_bounds=(fp_result.spec.chip_width_mm, fp_result.spec.chip_height_mm)
    )
    
    placements = solve_model(model, variable_map, timeout_s=1.5)
    solve_duration = time.time() - start_time

    assert placements is not None
    assert len(placements) == len(footprints)
    assert solve_duration < 2.0
