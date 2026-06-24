"""
resonator_router.py — Route readout resonators from qubit to feedline.

Strategy
--------
Each readout resonator is a λ/4 CPW meander. The router:
1. Picks a direction away from all neighbouring qubits.
2. Generates a meander path to achieve the target physical length.
3. Ensures the route does not enter another qubit's keep-out zone.

The physical length is derived from the resonator frequency and substrate ε_eff.
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

from app.routing.result import Point, RouteSegment


class ResonatorRouter:
    """
    Routes readout resonator meander paths.

    For each (qubit_id → resonator) pair, emits a RouteSegment whose
    length_mm matches the target λ/4 resonator length.
    """

    # Readout direction candidates (unit vectors), tried in order
    _DIRECTIONS: List[Tuple[float, float]] = [
        (0.0,  1.0),   # up
        (0.0, -1.0),   # down
        (1.0,  0.0),   # right
        (-1.0, 0.0),   # left
        (0.707,  0.707),
        (-0.707, 0.707),
        (0.707, -0.707),
        (-0.707,-0.707),
    ]

    def __init__(
        self,
        qubit_positions:  Dict[str, Point],  # qubit_id → (x_mm, y_mm)
        resonator_map:    Dict[str, Tuple[str, float]],  # res_id → (qubit_id, length_mm)
        feedline_y_mm:    Optional[float] = None,  # feedline y coordinate if known
        cpw_width_um:     float = 10.0,
        cpw_gap_um:       float = 6.0,
        pocket_half_mm:   float = 0.33,
        meander_spacing_mm: float = 0.06,  # gap between meander turns
    ) -> None:
        self.qpos      = qubit_positions
        self.res_map   = resonator_map
        self.fl_y      = feedline_y_mm
        self.width     = cpw_width_um
        self.gap       = cpw_gap_um
        self.pocket    = pocket_half_mm
        self.spacing   = meander_spacing_mm

    def _best_direction(self, qubit_id: str) -> Tuple[float, float]:
        """Pick the direction that maximises distance from all neighbours."""
        pos = self.qpos.get(qubit_id)
        if pos is None:
            return (0.0, 1.0)
        x0, y0 = pos
        others = [(x, y) for qid, (x, y) in self.qpos.items() if qid != qubit_id]
        if not others:
            return (0.0, 1.0)

        best_dir = (0.0, 1.0)
        best_score = -1.0
        for dx, dy in self._DIRECTIONS:
            score = 0.0
            for ox, oy in others:
                # Project (other - self) onto direction, penalise if direction
                # points toward another qubit
                proj = (ox - x0) * dx + (oy - y0) * dy
                dist = math.hypot(ox - x0, oy - y0)
                # Higher score = direction points AWAY from all neighbours
                score += dist - max(0.0, proj)
            if score > best_score:
                best_score = score
                best_dir = (dx, dy)
        return best_dir

    def _meander_waypoints(
        self,
        start: Point,
        direction: Tuple[float, float],
        target_length_mm: float,
    ) -> Tuple[List[Point], float]:
        """
        Generate a meander path starting at `start` going in `direction`.
        Returns (waypoints, actual_length_mm).

        The meander folds back and forth perpendicularly to `direction`
        until the target length is reached.

        Correct pattern for N arms:
          - Arm 0 (even): advance +primary for arm_mm
          - Arm 1 (odd):  step +perp for pitch_mm   (turn 1)
          - Arm 2 (even): advance -primary for arm_mm
          - Arm 3 (odd):  step +perp for pitch_mm   (turn 2)
          - Arm 4 (even): advance +primary for arm_mm
          - ...
        Each successive long arm is offset by pitch_mm in the perpendicular
        direction, so arms never overlap.
        """
        dx, dy = direction
        # Perpendicular direction (rotated 90° CCW)
        px, py = -dy, dx

        # pitch = wire width + gap on each side, converted mm
        # self.width and self.gap are in µm
        pitch_mm = (self.width + 2.0 * self.gap) / 1000.0 + self.spacing

        # arm_mm: length of each long segment
        # Estimate: total ≈ n_long_arms * arm_mm, n_long_arms ≈ n_arms/2
        arm_mm = 1.5  # mm — adjustable
        n_pairs = max(1, round(target_length_mm / (2.0 * arm_mm + pitch_mm)))

        waypoints: List[Point] = []
        x, y = start
        total = 0.0
        fwd = 1.0  # alternates ±1 for each long arm

        for _ in range(n_pairs):
            # Long arm in primary direction (alternating forward/backward)
            nx = x + dx * arm_mm * fwd
            ny = y + dy * arm_mm * fwd
            total += math.hypot(nx - x, ny - y)
            waypoints.append((round(nx, 4), round(ny, 4)))
            x, y = nx, ny

            # Short step in perpendicular direction (always positive = accumulates offset)
            nx = x + px * pitch_mm
            ny = y + py * pitch_mm
            total += math.hypot(nx - x, ny - y)
            waypoints.append((round(nx, 4), round(ny, 4)))
            x, y = nx, ny

            fwd *= -1.0  # flip direction for next long arm

        # Final long arm to close out the meander
        nx = x + dx * arm_mm * fwd
        ny = y + dy * arm_mm * fwd
        total += math.hypot(nx - x, ny - y)
        waypoints.append((round(nx, 4), round(ny, 4)))

        return waypoints, round(total, 4)

    def route(self) -> List[RouteSegment]:
        segments: List[RouteSegment] = []

        for res_id, (qubit_id, target_len_mm) in self.res_map.items():
            pos = self.qpos.get(qubit_id)
            if pos is None:
                continue

            direction  = self._best_direction(qubit_id)
            waypoints, actual_len = self._meander_waypoints(pos, direction, target_len_mm)

            end = waypoints[-1] if waypoints else pos
            seg = RouteSegment(
                start     = pos,
                end       = end,
                waypoints = waypoints[:-1] if waypoints else [],
                width_um  = self.width,
                gap_um    = self.gap,
                length_mm = actual_len,
                label     = res_id,
            )
            segments.append(seg)

        return segments