"""
LAYOUT-003: Footprint System + ObstacleMap Unit Tests

Validates:
  - Polygon extents match node fields (µm → mm conversion)
  - Rotation via shapely.affinity.rotate
  - Keep-out buffer = clearance_mm / 2
  - ObstacleMap.collides() and .intersection_area() correctness
  - ObstacleMap.from_footprints() factory
  - all_pairs_overlap enumeration
  - Edge cases: unplaced nodes (no x_mm/y_mm), zero-clearance
"""

import math

import pytest
from shapely.geometry import Point

from app.layout.footprints import FootprintGenerator, ObstacleMap
from app.layout.models import Footprint, Obstacle
from app.core.design_graph.node import (
    QubitNode,
    CouplerNode,
    ResonatorNode,
    FeedlineNode,
    LaunchpadNode,
    NodeKind,
)


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture()
def gen() -> FootprintGenerator:
    """Default generator with 0.05 mm clearance."""
    return FootprintGenerator(clearance_mm=0.05)


def _qubit(qid="Q0", x=0.0, y=0.0, angle=0, pw=650.0, ph=650.0) -> QubitNode:
    node = QubitNode(qid, pocket_width_um=pw, pocket_height_um=ph)
    node.x_mm = x
    node.y_mm = y
    node.orientation_deg = angle
    return node


def _coupler(cid="C0", x=0.5, y=0.0, cpw_width=10.0) -> CouplerNode:
    node = CouplerNode(cid, cpw_width_um=cpw_width)
    node.x_mm = x
    node.y_mm = y
    return node


def _resonator(rid="R0", x=0.0, y=0.7, length=7.5, cpw_width=10.0) -> ResonatorNode:
    node = ResonatorNode(rid, length_mm=length, cpw_width_um=cpw_width)
    node.x_mm = x
    node.y_mm = y
    return node


def _feedline(fid="F0", x=0.0, y=-1.0, length=10.0, cpw_width=10.0) -> FeedlineNode:
    node = FeedlineNode(fid, length_mm=length, cpw_width_um=cpw_width)
    node.x_mm = x
    node.y_mm = y
    return node


def _launchpad(lid="L0", x=5.0, y=0.0, pad_width=300.0) -> LaunchpadNode:
    node = LaunchpadNode(lid, pad_width_um=pad_width)
    node.x_mm = x
    node.y_mm = y
    return node


# ─────────────────────────────────────────────────────────────────────────────
# 1. Polygon extents
# ─────────────────────────────────────────────────────────────────────────────

class TestPolygonExtents:
    def test_qubit_width_height_from_pocket_fields(self, gen):
        fp = gen.generate(_qubit(pw=650.0, ph=600.0))
        # pocket dims in µm → mm
        assert abs(fp.width_mm - 0.65) < 1e-9
        assert abs(fp.height_mm - 0.60) < 1e-9
        assert fp.component_type == "qubit"

    def test_qubit_default_pocket_fallback(self):
        """QubitNode with default 650×650 µm pockets."""
        gen = FootprintGenerator()
        fp = gen.generate(_qubit())
        assert abs(fp.width_mm - 0.65) < 1e-9
        assert abs(fp.height_mm - 0.65) < 1e-9

    def test_coupler_width_from_cpw_field(self, gen):
        fp = gen.generate(_coupler(cpw_width=10.0))
        assert abs(fp.width_mm - 0.01) < 1e-9   # 10 µm → 0.01 mm
        assert fp.component_type == "coupler"

    def test_resonator_extent(self, gen):
        fp = gen.generate(_resonator(length=7.5, cpw_width=10.0))
        assert abs(fp.width_mm - 0.01) < 1e-9
        assert abs(fp.height_mm - 7.5) < 1e-9
        assert fp.component_type == "resonator"

    def test_feedline_extent(self, gen):
        fp = gen.generate(_feedline(length=10.0, cpw_width=10.0))
        assert abs(fp.width_mm - 0.01) < 1e-9
        assert abs(fp.height_mm - 10.0) < 1e-9
        assert fp.component_type == "feedline"

    def test_launchpad_extent(self, gen):
        fp = gen.generate(_launchpad(pad_width=300.0))
        assert abs(fp.width_mm - 0.30) < 1e-9
        assert abs(fp.height_mm - 0.30) < 1e-9
        assert fp.component_type == "launchpad"


# ─────────────────────────────────────────────────────────────────────────────
# 2. Polygon centroid at node position
# ─────────────────────────────────────────────────────────────────────────────

class TestPolygonCentroid:
    @pytest.mark.parametrize("x,y", [(0.0, 0.0), (1.5, -0.3), (-2.0, 4.1)])
    def test_qubit_centroid(self, gen, x, y):
        fp = gen.generate(_qubit(x=x, y=y))
        c = fp.polygon.centroid
        assert abs(c.x - x) < 1e-9
        assert abs(c.y - y) < 1e-9

    @pytest.mark.parametrize("x,y", [(3.0, 1.0), (-1.0, 0.5)])
    def test_resonator_centroid(self, gen, x, y):
        fp = gen.generate(_resonator(x=x, y=y))
        c = fp.polygon.centroid
        assert abs(c.x - x) < 1e-9
        assert abs(c.y - y) < 1e-9

    def test_unplaced_node_defaults_to_origin(self, gen):
        node = QubitNode("Q_unplaced")
        # x_mm / y_mm are None
        fp = gen.generate(node)
        c = fp.polygon.centroid
        assert abs(c.x) < 1e-9
        assert abs(c.y) < 1e-9


# ─────────────────────────────────────────────────────────────────────────────
# 3. Keep-out buffer
# ─────────────────────────────────────────────────────────────────────────────

class TestKeeputBuffer:
    def test_keepout_larger_than_polygon(self, gen):
        fp = gen.generate(_qubit())
        assert fp.keepout_polygon.area > fp.polygon.area

    def test_keepout_buffer_equals_half_clearance(self):
        clearance = 0.06
        gen = FootprintGenerator(clearance_mm=clearance)
        fp = gen.generate(_qubit())
        expected_buffer = clearance / 2.0
        # The keepout polygon should contain a point just inside the buffer
        cx, cy = fp.polygon.centroid.x, fp.polygon.centroid.y
        hw = fp.width_mm / 2.0
        # Point at exactly half the clearance outside the right edge
        probe_inside = Point(cx + hw + expected_buffer * 0.99, cy)
        probe_outside = Point(cx + hw + expected_buffer * 1.01, cy)
        assert fp.keepout_polygon.contains(probe_inside)
        assert not fp.keepout_polygon.contains(probe_outside)

    def test_zero_clearance_keepout_equals_polygon(self):
        gen = FootprintGenerator(clearance_mm=0.0)
        fp = gen.generate(_qubit())
        # With zero buffer the keepout area should equal body area (within fp precision)
        assert abs(fp.keepout_polygon.area - fp.polygon.area) < 1e-6

    def test_keepout_field_recorded(self, gen):
        fp = gen.generate(_qubit())
        assert fp.keepout_mm == gen.clearance_mm


# ─────────────────────────────────────────────────────────────────────────────
# 4. Rotation
# ─────────────────────────────────────────────────────────────────────────────

class TestRotation:
    def test_zero_rotation_is_axis_aligned(self, gen):
        fp = gen.generate(_qubit(angle=0))
        bounds = fp.polygon.bounds  # (minx, miny, maxx, maxy)
        # An axis-aligned rectangle has exactly 5 coords (closed ring)
        coords = list(fp.polygon.exterior.coords)
        assert len(coords) == 5

    def test_90_degree_rotation_swaps_axes(self, gen):
        # 650×600 µm qubit: w=0.65, h=0.60 → after 90° rotation w↔h
        fp_0 = gen.generate(_qubit(pw=650.0, ph=600.0, angle=0))
        fp_90 = gen.generate(_qubit(pw=650.0, ph=600.0, angle=90))
        b0 = fp_0.polygon.bounds   # (minx, miny, maxx, maxy)
        b90 = fp_90.polygon.bounds
        w0 = b0[2] - b0[0]
        h0 = b0[3] - b0[1]
        w90 = b90[2] - b90[0]
        h90 = b90[3] - b90[1]
        # Width and height should swap (within floating point tolerance)
        assert abs(w90 - h0) < 1e-9
        assert abs(h90 - w0) < 1e-9

    def test_rotation_preserves_area(self, gen):
        fp_0 = gen.generate(_qubit(angle=0))
        fp_45 = gen.generate(_qubit(angle=45))
        assert abs(fp_0.polygon.area - fp_45.polygon.area) < 1e-9

    def test_rotation_deg_stored(self, gen):
        fp = gen.generate(_qubit(angle=45))
        assert fp.rotation_deg == 45.0


# ─────────────────────────────────────────────────────────────────────────────
# 5. generate_all via mock DesignGraph
# ─────────────────────────────────────────────────────────────────────────────

class _MockGraph:
    """Minimal DesignGraph stand-in."""
    def __init__(self, *nodes):
        self.nodes = {n.id: n for n in nodes}


class TestGenerateAll:
    def test_returns_all_node_ids(self, gen):
        q0, q1 = _qubit("Q0"), _qubit("Q1", x=1.0)
        graph = _MockGraph(q0, q1)
        fps = gen.generate_all(graph)
        assert set(fps.keys()) == {"Q0", "Q1"}

    def test_each_footprint_has_polygon(self, gen):
        graph = _MockGraph(_qubit("Q0"), _resonator("R0"))
        fps = gen.generate_all(graph)
        for fp in fps.values():
            assert fp.polygon is not None
            assert fp.keepout_polygon is not None

    def test_mixed_node_kinds(self, gen):
        graph = _MockGraph(
            _qubit("Q0", x=0.0, y=0.0),
            _coupler("C0", x=0.5, y=0.0),
            _resonator("R0", x=0.0, y=0.8),
            _feedline("F0", x=0.0, y=-1.5),
            _launchpad("L0", x=5.0, y=0.0),
        )
        fps = gen.generate_all(graph)
        assert len(fps) == 5
        assert fps["Q0"].component_type == "qubit"
        assert fps["C0"].component_type == "coupler"
        assert fps["R0"].component_type == "resonator"
        assert fps["F0"].component_type == "feedline"
        assert fps["L0"].component_type == "launchpad"


# ─────────────────────────────────────────────────────────────────────────────
# 6. ObstacleMap construction
# ─────────────────────────────────────────────────────────────────────────────

def _make_obstacle(oid, cx, cy, half=0.2):
    poly = _shapely_box_helper(cx - half, cy - half, cx + half, cy + half)
    return Obstacle(obstacle_id=oid, polygon=poly, obstacle_type="keepout")


def _shapely_box_helper(x0, y0, x1, y1):
    from shapely.geometry import box
    return box(x0, y0, x1, y1)


class TestObstacleMapConstruction:
    def test_empty_map(self):
        obs_map = ObstacleMap()
        assert len(obs_map) == 0

    def test_init_with_obstacles(self):
        obs = [_make_obstacle("O0", 0.0, 0.0)]
        obs_map = ObstacleMap(obs)
        assert len(obs_map) == 1

    def test_add_increases_count(self):
        obs_map = ObstacleMap()
        obs_map.add(_make_obstacle("O0", 0.0, 0.0))
        assert len(obs_map) == 1

    def test_reset_clears(self):
        obs_map = ObstacleMap([_make_obstacle("O0", 0.0, 0.0)])
        obs_map.reset()
        assert len(obs_map) == 0

    def test_from_footprints_factory(self):
        gen = FootprintGenerator(clearance_mm=0.05)
        graph = _MockGraph(_qubit("Q0", x=0.0), _qubit("Q1", x=1.0))
        fps = gen.generate_all(graph)
        obs_map = ObstacleMap.from_footprints(fps)
        assert len(obs_map) == 2

    def test_from_footprints_excludes_ids(self):
        gen = FootprintGenerator(clearance_mm=0.05)
        graph = _MockGraph(_qubit("Q0"), _qubit("Q1", x=1.0))
        fps = gen.generate_all(graph)
        obs_map = ObstacleMap.from_footprints(fps, exclude_ids=["Q0"])
        assert len(obs_map) == 1


# ─────────────────────────────────────────────────────────────────────────────
# 7. ObstacleMap.collides()
# ─────────────────────────────────────────────────────────────────────────────

class TestObstacleMapCollides:
    def test_no_collision_distant_components(self):
        gen = FootprintGenerator(clearance_mm=0.05)
        # Place Q0 at origin, obstacle far away
        fp = gen.generate(_qubit("Q0", x=0.0, y=0.0))
        obs = _make_obstacle("O_far", cx=10.0, cy=10.0, half=0.1)
        obs_map = ObstacleMap([obs])
        assert obs_map.collides(fp) is False

    def test_collision_overlapping_components(self):
        gen = FootprintGenerator(clearance_mm=0.05)
        # Place Q0 at origin; obstacle right on top of it
        fp = gen.generate(_qubit("Q0", x=0.0, y=0.0))
        obs = _make_obstacle("O_overlap", cx=0.0, cy=0.0, half=0.5)
        obs_map = ObstacleMap([obs])
        assert obs_map.collides(fp) is True

    def test_collision_within_keepout_zone(self):
        """Object inside keepout buffer but outside tight body → still a collision."""
        gen = FootprintGenerator(clearance_mm=0.10)
        fp = gen.generate(_qubit("Q0", x=0.0, y=0.0))
        # body half-width = 0.325 mm; keepout = body + 0.05 buffer
        # place obstacle at 0.345 mm from centre — inside keepout, outside body
        obs = _make_obstacle("O_ko", cx=0.345, cy=0.0, half=0.01)
        obs_map = ObstacleMap([obs])
        assert obs_map.collides(fp) is True

    def test_no_collision_empty_map(self):
        gen = FootprintGenerator()
        fp = gen.generate(_qubit("Q0"))
        obs_map = ObstacleMap()
        assert obs_map.collides(fp) is False

    def test_idempotent_multiple_calls(self):
        gen = FootprintGenerator(clearance_mm=0.05)
        fp = gen.generate(_qubit("Q0", x=0.0, y=0.0))
        obs = _make_obstacle("O_overlap", cx=0.0, cy=0.0, half=0.5)
        obs_map = ObstacleMap([obs])
        # Calling twice must give same answer (tree is not corrupted)
        assert obs_map.collides(fp) is True
        assert obs_map.collides(fp) is True


# ─────────────────────────────────────────────────────────────────────────────
# 8. ObstacleMap.intersection_area()
# ─────────────────────────────────────────────────────────────────────────────

class TestObstacleMapIntersectionArea:
    def test_zero_area_no_overlap(self):
        gen = FootprintGenerator(clearance_mm=0.05)
        fp = gen.generate(_qubit("Q0", x=0.0, y=0.0))
        obs = _make_obstacle("O_far", cx=10.0, cy=10.0, half=0.1)
        obs_map = ObstacleMap([obs])
        assert obs_map.intersection_area(fp) == 0.0

    def test_positive_area_overlap(self):
        gen = FootprintGenerator(clearance_mm=0.05)
        fp = gen.generate(_qubit("Q0", x=0.0, y=0.0))
        # Obstacle covers all of centre
        obs = _make_obstacle("O_overlap", cx=0.0, cy=0.0, half=0.5)
        obs_map = ObstacleMap([obs])
        area = obs_map.intersection_area(fp)
        assert area > 0.0

    def test_area_additive_two_obstacles(self):
        gen = FootprintGenerator(clearance_mm=0.05)
        fp = gen.generate(_qubit("Q0", x=0.0, y=0.0))
        # Two small obstacles both overlapping the qubit centroid
        obs1 = _make_obstacle("O1", cx=0.0, cy=0.0, half=0.1)
        obs2 = _make_obstacle("O2", cx=0.05, cy=0.0, half=0.1)
        obs_map_single = ObstacleMap([obs1])
        obs_map_double = ObstacleMap([obs1, obs2])
        area_single = obs_map_single.intersection_area(fp)
        area_double = obs_map_double.intersection_area(fp)
        # Double must be at least as large as single
        assert area_double >= area_single

    def test_empty_map_returns_zero(self):
        gen = FootprintGenerator()
        fp = gen.generate(_qubit("Q0"))
        obs_map = ObstacleMap()
        assert obs_map.intersection_area(fp) == 0.0


# ─────────────────────────────────────────────────────────────────────────────
# 9. all_pairs_overlap
# ─────────────────────────────────────────────────────────────────────────────

class TestAllPairsOverlap:
    def test_no_overlaps_spaced_grid(self):
        gen = FootprintGenerator(clearance_mm=0.05)
        # 4 qubits on 1 mm grid — well separated
        fps = {
            f"Q{i}": gen.generate(_qubit(f"Q{i}", x=float(i), y=0.0))
            for i in range(4)
        }
        obs_map = ObstacleMap()
        pairs = obs_map.all_pairs_overlap(fps)
        assert pairs == []

    def test_detects_overlap_coincident(self):
        gen = FootprintGenerator(clearance_mm=0.05)
        # Two qubits at the same position
        fps = {
            "Q0": gen.generate(_qubit("Q0", x=0.0, y=0.0)),
            "Q1": gen.generate(_qubit("Q1", x=0.0, y=0.0)),
        }
        obs_map = ObstacleMap()
        pairs = obs_map.all_pairs_overlap(fps)
        assert len(pairs) == 1
        ids = {pairs[0][0], pairs[0][1]}
        assert ids == {"Q0", "Q1"}
        assert pairs[0][2] > 0.0


# ─────────────────────────────────────────────────────────────────────────────
# 10. Footprint immutability (frozen dataclass)
# ─────────────────────────────────────────────────────────────────────────────

class TestFootprintImmutability:
    def test_footprint_is_frozen(self, gen):
        fp = gen.generate(_qubit())
        with pytest.raises(Exception):
            fp.width_mm = 99.0  # type: ignore[misc]

    def test_footprint_node_id_immutable(self, gen):
        fp = gen.generate(_qubit("Q0"))
        assert fp.node_id == "Q0"
        with pytest.raises(Exception):
            fp.node_id = "Q_other"  # type: ignore[misc]


# ─────────────────────────────────────────────────────────────────────────────
# 11. Repr smoke test
# ─────────────────────────────────────────────────────────────────────────────

def test_obstacle_map_repr():
    obs_map = ObstacleMap([_make_obstacle("O0", 0.0, 0.0)])
    assert "1" in repr(obs_map)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
