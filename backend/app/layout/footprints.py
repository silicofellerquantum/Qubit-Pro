"""
Footprint System + ObstacleMap

Converts DesignGraph nodes to Shapely polygons for spatial reasoning.

Responsibilities:
  - FootprintGenerator: node → Footprint (bounding polygon + keep-out ring)
  - ObstacleMap: STRtree-backed spatial index for collision queries

Component extents (all sizes in mm, converted from µm where needed):

  qubit     : pocket_width_um × pocket_height_um  (default 650×650 µm)
  coupler   : cpw_width_um wide × derived length   (default 10 µm wide,
              100 µm long estimated from pitch)
  resonator : cpw_width_um wide × length_mm long
  feedline  : cpw_width_um wide × length_mm long
  launchpad : pad_width_um × pad_width_um          (square)

Rotation via shapely.affinity.rotate (degrees, origin=centre).
Keep-out buffer = clearance_mm / 2 around each polygon.

Units:
  All output coordinates and sizes are in mm.

LAYOUT-003 implementation.
Dependencies: LAYOUT-002 (models)
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Sequence

from shapely.affinity import rotate as _shapely_rotate
from shapely.geometry import box as _shapely_box
from shapely.strtree import STRtree

from app.layout.constants import DEFAULT_CLEARANCE_MM
from app.layout.models import Footprint, Obstacle
from app.core.design_graph.node import (
    DesignNode,
    NodeKind,
    QubitNode,
    CouplerNode,
    ResonatorNode,
    FeedlineNode,
    LaunchpadNode,
)


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

_UM_TO_MM = 1e-3  # 1 µm = 0.001 mm

# Fallback sizes when node fields are missing (mm)
_FALLBACK_QUBIT_W_MM = 0.65
_FALLBACK_QUBIT_H_MM = 0.65
_FALLBACK_CPW_W_MM = 0.01       # 10 µm
_FALLBACK_COUPLER_LEN_MM = 0.10  # 100 µm
_FALLBACK_LAUNCHPAD_MM = 0.30    # 300 µm


def _make_rect_polygon(cx: float, cy: float, w: float, h: float, angle_deg: float):
    """
    Create an axis-aligned rectangle centred at (cx, cy) then rotate.

    Args:
        cx, cy   : centre position (mm)
        w, h     : width and height (mm)
        angle_deg: counter-clockwise rotation in degrees

    Returns:
        shapely.geometry.Polygon
    """
    hw, hh = w / 2.0, h / 2.0
    poly = _shapely_box(cx - hw, cy - hh, cx + hw, cy + hh)
    if angle_deg % 360.0 != 0.0:
        poly = _shapely_rotate(poly, angle_deg, origin=(cx, cy), use_radians=False)
    return poly


# ─────────────────────────────────────────────────────────────────────────────
# Per-kind geometry extractors
# ─────────────────────────────────────────────────────────────────────────────

def _qubit_extent(node: QubitNode):
    """Return (width_mm, height_mm) for a qubit pocket."""
    w = getattr(node, "pocket_width_um", None)
    h = getattr(node, "pocket_height_um", None)
    w_mm = (w * _UM_TO_MM) if w else _FALLBACK_QUBIT_W_MM
    h_mm = (h * _UM_TO_MM) if h else _FALLBACK_QUBIT_H_MM
    return w_mm, h_mm


def _coupler_extent(node: CouplerNode, pitch_hint_mm: float = _FALLBACK_COUPLER_LEN_MM):
    """
    Return (width_mm, length_mm) for a coupler.

    Couplers are CPW stubs whose length is typically ~half the qubit pitch.
    We use the cpw_width_um for the narrow dimension and pitch_hint_mm for
    the long dimension when no geometry is grounded.
    """
    cpw_w = getattr(node, "cpw_width_um", None)
    w_mm = (cpw_w * _UM_TO_MM) if cpw_w else _FALLBACK_CPW_W_MM
    return w_mm, pitch_hint_mm


def _resonator_extent(node: ResonatorNode):
    """Return (width_mm, length_mm) for a resonator."""
    cpw_w = getattr(node, "cpw_width_um", None)
    w_mm = (cpw_w * _UM_TO_MM) if cpw_w else _FALLBACK_CPW_W_MM
    length_mm = getattr(node, "length_mm", 7.5)
    return w_mm, length_mm


def _feedline_extent(node: FeedlineNode):
    """Return (width_mm, length_mm) for a feedline."""
    cpw_w = getattr(node, "cpw_width_um", None)
    w_mm = (cpw_w * _UM_TO_MM) if cpw_w else _FALLBACK_CPW_W_MM
    length_mm = getattr(node, "length_mm", 10.0)
    return w_mm, length_mm


def _launchpad_extent(node: LaunchpadNode):
    """Return (side_mm, side_mm) — launchpads are modelled as squares."""
    pad_w = getattr(node, "pad_width_um", None)
    side_mm = (pad_w * _UM_TO_MM) if pad_w else _FALLBACK_LAUNCHPAD_MM
    return side_mm, side_mm


# ─────────────────────────────────────────────────────────────────────────────
# FootprintGenerator
# ─────────────────────────────────────────────────────────────────────────────

class FootprintGenerator:
    """
    Converts DesignGraph nodes to Shapely-backed Footprint objects.

    Each Footprint contains:
      - ``polygon``         : tight bounding polygon at node position (mm)
      - ``keepout_polygon`` : polygon buffered by ``clearance_mm / 2``

    The generator is stateless; call ``generate()`` per node or
    ``generate_all()`` for the full graph.

    Example::

        gen = FootprintGenerator(clearance_mm=0.05)
        fp  = gen.generate(qubit_node)
        print(fp.width_mm, fp.keepout_polygon.area)
    """

    def __init__(
        self,
        clearance_mm: float = DEFAULT_CLEARANCE_MM,
        coupler_length_hint_mm: float = _FALLBACK_COUPLER_LEN_MM,
    ) -> None:
        """
        Args:
            clearance_mm           : Keep-out buffer distance = clearance / 2
                                     applied around each polygon.
            coupler_length_hint_mm : Fallback coupler length when no grounded
                                     geometry is available. Typically set to
                                     pitch/2 by the floorplanner.
        """
        self.clearance_mm = clearance_mm
        self.coupler_length_hint_mm = coupler_length_hint_mm

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate(self, node: DesignNode) -> Footprint:
        """
        Generate a Footprint for a single DesignGraph node.

        The node must have ``x_mm`` and ``y_mm`` set; if not, (0, 0) is used
        as a fallback so the footprint shape is still valid for sizing queries.

        Args:
            node: Any DesignNode subclass.

        Returns:
            Footprint with shapely polygon fields populated.

        Raises:
            ValueError: If node.kind is unrecognised.
        """
        cx = node.x_mm if node.x_mm is not None else 0.0
        cy = node.y_mm if node.y_mm is not None else 0.0
        angle = getattr(node, "orientation_deg", 0) or 0

        kind = node.kind

        if kind == NodeKind.QUBIT:
            w_mm, h_mm = _qubit_extent(node)  # type: ignore[arg-type]
            component_type = "qubit"
        elif kind == NodeKind.COUPLER:
            w_mm, h_mm = _coupler_extent(node, self.coupler_length_hint_mm)  # type: ignore[arg-type]
            component_type = "coupler"
        elif kind == NodeKind.RESONATOR:
            w_mm, h_mm = _resonator_extent(node)  # type: ignore[arg-type]
            component_type = "resonator"
        elif kind == NodeKind.FEEDLINE:
            w_mm, h_mm = _feedline_extent(node)  # type: ignore[arg-type]
            component_type = "feedline"
        elif kind == NodeKind.LAUNCHPAD:
            w_mm, h_mm = _launchpad_extent(node)  # type: ignore[arg-type]
            component_type = "launchpad"
        else:
            raise ValueError(f"Unrecognised NodeKind: {kind!r}")

        polygon = _make_rect_polygon(cx, cy, w_mm, h_mm, angle)
        keepout_buffer = self.clearance_mm / 2.0
        keepout_polygon = polygon.buffer(keepout_buffer)

        return Footprint(
            node_id=node.id,
            component_type=component_type,
            width_mm=w_mm,
            height_mm=h_mm,
            keepout_mm=self.clearance_mm,
            polygon=polygon,
            keepout_polygon=keepout_polygon,
            rotation_deg=float(angle),
            metadata={
                "x_mm": cx,
                "y_mm": cy,
                "node_kind": kind.value,
            },
        )

    def generate_all(self, design_graph) -> Dict[str, Footprint]:
        """
        Generate footprints for all nodes in a DesignGraph.

        Args:
            design_graph: DesignGraph instance exposing a ``nodes`` attribute
                          that is a ``dict[str, DesignNode]``.

        Returns:
            ``{node_id: Footprint}`` mapping.
        """
        return {
            node_id: self.generate(node)
            for node_id, node in design_graph.nodes.items()
        }


# ─────────────────────────────────────────────────────────────────────────────
# ObstacleMap
# ─────────────────────────────────────────────────────────────────────────────

class ObstacleMap:
    """
    Spatial index for fast collision detection using a Shapely STRtree.

    Stores a collection of :class:`~app.layout.models.Obstacle` objects
    and provides two query methods:

    * ``collides(footprint)``         → ``bool``
    * ``intersection_area(footprint)`` → ``float`` (mm²)

    The tree is rebuilt lazily whenever the obstacle list changes via
    ``add()`` or ``reset()``. Use ``from_footprints()`` to seed it from
    an existing footprint registry.

    Example::

        obs_map = ObstacleMap(obstacles)
        if obs_map.collides(my_footprint):
            area = obs_map.intersection_area(my_footprint)
    """

    def __init__(self, obstacles: Optional[Sequence[Obstacle]] = None) -> None:
        """
        Args:
            obstacles: Initial list of Obstacle objects. May be empty or None.
        """
        self._obstacles: List[Obstacle] = list(obstacles) if obstacles else []
        self._tree: Optional[STRtree] = None  # built on first query

    # ------------------------------------------------------------------
    # Construction helpers
    # ------------------------------------------------------------------

    @classmethod
    def from_footprints(
        cls,
        footprints: Dict[str, Footprint],
        exclude_ids: Optional[Sequence[str]] = None,
        use_keepout: bool = True,
    ) -> "ObstacleMap":
        """
        Build an ObstacleMap from a footprint registry.

        Args:
            footprints  : ``{node_id: Footprint}`` mapping.
            exclude_ids : Node IDs to omit (e.g., the component being placed).
            use_keepout : If True, use the keepout polygon; else use the tight
                          body polygon.

        Returns:
            ObstacleMap populated with one Obstacle per footprint.
        """
        skip = set(exclude_ids) if exclude_ids else set()
        obstacles: List[Obstacle] = []
        for node_id, fp in footprints.items():
            if node_id in skip:
                continue
            poly = fp.keepout_polygon if use_keepout else fp.polygon
            obstacles.append(
                Obstacle(
                    obstacle_id=node_id,
                    polygon=poly,
                    obstacle_type=fp.component_type,
                    metadata={"source_footprint": node_id},
                )
            )
        return cls(obstacles)

    def add(self, obstacle: Obstacle) -> None:
        """
        Add a single obstacle and invalidate the spatial index.

        Args:
            obstacle: Obstacle to add.
        """
        self._obstacles.append(obstacle)
        self._tree = None  # force rebuild on next query

    def reset(self, obstacles: Optional[Sequence[Obstacle]] = None) -> None:
        """
        Replace all obstacles and invalidate the spatial index.

        Args:
            obstacles: New obstacle list (defaults to empty).
        """
        self._obstacles = list(obstacles) if obstacles else []
        self._tree = None

    # ------------------------------------------------------------------
    # Internal index management
    # ------------------------------------------------------------------

    def _ensure_tree(self) -> STRtree:
        """Build the STRtree if it has not been built yet."""
        if self._tree is None:
            geoms = [obs.polygon for obs in self._obstacles]
            self._tree = STRtree(geoms)
        return self._tree

    # ------------------------------------------------------------------
    # Query API
    # ------------------------------------------------------------------

    def collides(self, footprint: Footprint) -> bool:
        """
        Return True if the footprint's keepout polygon intersects any obstacle.

        Uses the STRtree for a fast bounding-box pre-filter followed by an
        exact Shapely intersection test.

        Args:
            footprint: Footprint whose keepout_polygon is tested.

        Returns:
            True if at least one obstacle overlaps the keepout region.
        """
        if not self._obstacles:
            return False

        tree = self._ensure_tree()
        query_poly = footprint.keepout_polygon
        candidate_indices = tree.query(query_poly)

        for idx in candidate_indices:
            if query_poly.intersects(self._obstacles[idx].polygon):
                return True
        return False

    def intersection_area(self, footprint: Footprint) -> float:
        """
        Return total intersection area (mm²) between the footprint keepout
        polygon and all overlapping obstacles.

        Args:
            footprint: Footprint whose keepout_polygon is tested.

        Returns:
            Sum of intersection areas in mm². Zero if no overlaps.
        """
        if not self._obstacles:
            return 0.0

        tree = self._ensure_tree()
        query_poly = footprint.keepout_polygon
        candidate_indices = tree.query(query_poly)

        total_area = 0.0
        for idx in candidate_indices:
            intersection = query_poly.intersection(self._obstacles[idx].polygon)
            total_area += intersection.area
        return total_area

    def all_pairs_overlap(
        self, footprints: Dict[str, Footprint]
    ) -> List[tuple[str, str, float]]:
        """
        Enumerate all overlapping footprint pairs.

        Useful for the scorer and overlap resolver.

        Args:
            footprints: ``{node_id: Footprint}`` mapping.

        Returns:
            List of ``(id_a, id_b, overlap_area_mm2)`` tuples where
            ``overlap_area_mm2 > 0``.
        """
        items = list(footprints.items())
        results: List[tuple[str, str, float]] = []
        for i, (id_a, fp_a) in enumerate(items):
            for j in range(i + 1, len(items)):
                id_b, fp_b = items[j]
                inter = fp_a.keepout_polygon.intersection(fp_b.keepout_polygon)
                if inter.area > 0.0:
                    results.append((id_a, id_b, inter.area))
        return results

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def obstacle_count(self) -> int:
        """Number of obstacles in the map."""
        return len(self._obstacles)

    def __len__(self) -> int:
        return self.obstacle_count

    def __repr__(self) -> str:
        return f"ObstacleMap(n_obstacles={self.obstacle_count})"
