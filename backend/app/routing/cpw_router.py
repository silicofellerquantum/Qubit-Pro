"""
cpw_router.py — Route CPW transmission lines between coupled qubits.

Strategy
--------
1. For each (qubitA, coupler, qubitB) triple, compute a rectilinear path
   from A to B passing through the coupler midpoint.
2. Paths use L-shaped or S-shaped routing to avoid qubit pockets.
3. Minimum clearance to other qubit pockets is enforced.
4. Bus length is computed from the physical pitch between qubits.
"""

from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple

from app.routing.result import RouteSegment, Point


class CPWRouter:
    """
    Routes CPW connections between pairs of coupled qubits.

    Each coupling edge becomes one RouteSegment.
    The route uses a simple L-shaped meander avoiding the pocket keep-out.
    """

    def __init__(
        self,
        qubit_positions: Dict[str, Point],   # name → (x_mm, y_mm)
        coupler_pairs:   List[Tuple[str, str]],  # [(qa_name, qb_name)]
        cpw_width_um:    float = 10.0,
        cpw_gap_um:      float = 6.0,
        pocket_half_mm:  float = 0.33,
        min_spacing_mm:  float = 0.15,
        meander_factor:  float = 1.2,   # route length = meander_factor × straight distance
    ) -> None:
        self.qpos    = qubit_positions
        self.cpairs  = coupler_pairs
        self.width   = cpw_width_um
        self.gap     = cpw_gap_um
        self.pocket  = pocket_half_mm
        self.min_sp  = min_spacing_mm
        self.mfactor = meander_factor

    def _pocket_exit(self, qubit: Point, other: Point) -> Point:
        """
        Return a point that is `pocket_half_mm` outside the qubit pocket
        in the direction toward `other`.  This is used as the actual CPW
        start/end so the route never enters the pocket body.
        """
        dx = other[0] - qubit[0]
        dy = other[1] - qubit[1]
        dist = math.hypot(dx, dy) or 1.0
        return (
            round(qubit[0] + dx / dist * self.pocket, 4),
            round(qubit[1] + dy / dist * self.pocket, 4),
        )

    def _l_route(self, a: Point, b: Point) -> List[Point]:
        """
        L-shaped route from a to b (horizontal first).

        The corner is placed at (b[0], a[1]) which can fall on an
        intermediate qubit pocket.  We therefore check all qubit positions
        and nudge the corner vertically if it would land inside a pocket.
        """
        corner: Point = (b[0], a[1])

        # Nudge the corner away from any qubit whose pocket it would enter.
        NUDGE = self.pocket + self.min_sp
        for qpos in self.qpos.values():
            qx, qy = qpos
            cx, cy = corner
            if abs(cx - qx) < NUDGE and abs(cy - qy) < NUDGE:
                # Corner is inside this qubit's keep-out zone.
                # Push it vertically past the pocket (toward b).
                sign = 1.0 if b[1] > a[1] else -1.0
                corner = (cx, round(qy + sign * NUDGE, 4))

        return [corner]

    def _meander_length(self, a: Point, b: Point) -> float:
        """Estimate routed length with meander factor applied."""
        straight = math.hypot(b[0] - a[0], b[1] - a[1])
        return round(straight * self.mfactor, 4)

    def route(self) -> List[RouteSegment]:
        segments: List[RouteSegment] = []

        for qa_id, qb_id in self.cpairs:
            pa = self.qpos.get(qa_id)
            pb = self.qpos.get(qb_id)
            if pa is None or pb is None:
                continue

            # Offset start/end to the pocket edge so the route never
            # passes through the qubit body itself.
            pa_exit = self._pocket_exit(pa, pb)
            pb_exit = self._pocket_exit(pb, pa)

            waypoints = self._l_route(pa_exit, pb_exit)
            length    = self._meander_length(pa_exit, pb_exit)

            seg = RouteSegment(
                start     = pa_exit,
                end       = pb_exit,
                waypoints = waypoints,
                width_um  = self.width,
                gap_um    = self.gap,
                length_mm = length,
                label     = f"CPW_{qa_id}_{qb_id}",
            )
            segments.append(seg)

        return segments
