"""
readout_res_fc.py — Custom ReadoutResFC QComponent.

A folded coplanar-waveguide readout resonator.  The resonator starts at
a coupling port ("readout"), runs a series of straight segments separated
by 180° U-turns (meander), and terminates at an open end.

Parameters match the catalog entry in component_catalog.json.
"""

from __future__ import annotations

import numpy as np
from qiskit_metal import draw
from qiskit_metal.qlibrary.core import QComponent


class ReadoutResFC(QComponent):
    """Folded CPW readout resonator.

    Produces a meandered CPW resonator suitable for dispersive readout of a
    superconducting qubit.  The geometry is a series of straight arms
    (l1 … l5) connected by 180° semicircular turns of radius
    ``readout_cpw_turnradius``.

    Default Options
    ---------------
    readout_radius         : 50  (µm) — inner turn radius of the meander bends
    readout_cpw_width      : 5   (µm) — centre-conductor width
    readout_cpw_gap        : 5   (µm) — gap width
    readout_cpw_turnradius : 50  (µm) — same as readout_radius (alias kept for compat)
    readout_l1 … l5        : arm lengths in µm
    orientation            : 0   (deg) — rotation of entire component
    """

    default_options = dict(
        readout_radius          = "50um",
        readout_cpw_width       = "5um",
        readout_cpw_gap         = "5um",
        readout_cpw_turnradius  = "50um",
        total_length            = "6mm",
        resonator_width         = "300um",
        lead_length             = "150um",
        readout_l1              = "150um",
        readout_l2              = "300um",
        readout_l3              = "300um",
        readout_l4              = "300um",
        readout_l5              = "150um",
        arc_step                = "5um",
        orientation             = "0",
        layer                   = "1",
        layer_subtract          = "2",
        subtract                = "False",
        chip                    = "main",
    )

    component_metadata = dict(short_name="ReadoutResFC")

    # ── Connection pads ───────────────────────────────────────────────────────
    _default_connection_pads = dict(
        readout=dict(loc_W=0, loc_H=-1, width="5um", gap="5um"),
    )

    # ── Build ─────────────────────────────────────────────────────────────────

    def make(self) -> None:
        p = self.p          # parsed options (numbers in design units, typically mm)

        # All lengths arrive in mm from Qiskit Metal's unit parser.
        # We work in mm and convert to µm only for the geometry coordinates.
        def _mm(val: float) -> float:
            return val  # already in mm

        w    = p.readout_cpw_width       # mm
        g    = p.readout_cpw_gap         # mm
        tr   = p.readout_cpw_turnradius  # mm  (turn radius to conductor centre)
        total_len = p.total_length
        res_width = p.resonator_width
        lead_len  = p.lead_length

        # Build the centreline as a sequence of (x, y) points.
        # Start at the coupling port (0, 0), travel in +x direction.
        pts: list[tuple[float, float]] = [(0.0, 0.0)]

        def _arm(cur: tuple, dx: float, dy: float, length: float) -> tuple:
            """Extend by a straight arm."""
            nx, ny = cur[0] + dx * length, cur[1] + dy * length
            pts.append((nx, ny))
            return (nx, ny)

        def _turn(cur: tuple, dx: float, dy: float, sign: int, n_steps: int = 20
                  ) -> tuple[tuple, float, float]:
            """Append a 180° semicircular turn.

            sign=+1 : turn counter-clockwise (left)
            sign=-1 : turn clockwise (right)
            Returns new position and new (dx, dy) direction.
            """
            cx_off = -sign * dy * tr   # perpendicular offset to arc centre
            cy_off =  sign * dx * tr
            cx, cy = cur[0] + cx_off, cur[1] + cy_off
            # Start angle: from centre → cur
            start_angle = np.arctan2(cur[1] - cy, cur[0] - cx)
            # Sweep π radians
            angles = np.linspace(start_angle, start_angle + sign * np.pi, n_steps + 1)
            for a in angles[1:]:
                pts.append((cx + tr * np.cos(a), cy + tr * np.sin(a)))
            end_pt = pts[-1]
            # New direction: reversed original direction
            return end_pt, -dx, -dy

        # ── Centreline path ──────────────────────────────────────────────────
        cur  = (0.0, 0.0)
        dx, dy = 1.0, 0.0   # initial direction: rightward

        if total_len > 0 and res_width > 0:
            body_len = total_len - 2 * lead_len
            if body_len <= 0:
                cur = _arm(cur, dx, dy, total_len)
            else:
                turn_unit_len = res_width + np.pi * tr
                N_ideal = (body_len + res_width) / turn_unit_len
                N = max(2, int(np.round(N_ideal)))
                
                adj_width = (total_len - 2 * lead_len - N * np.pi * tr) / (N - 1)
                if adj_width < tr:
                    adj_width = tr
                
                cur = _arm(cur, dx, dy, lead_len)
                for i in range(1, N + 1):
                    sign = 1 if (i % 2 == 1) else -1
                    cur, dx, dy = _turn(cur, dx, dy, sign=sign)
                    if i < N:
                        cur = _arm(cur, dx, dy, adj_width)
                    else:
                        cur = _arm(cur, dx, dy, lead_len)
        else:
            # Fallback to original hardcoded 5 arms and 4 U-turns
            l1   = p.readout_l1
            l2   = p.readout_l2
            l3   = p.readout_l3
            l4   = p.readout_l4
            l5   = p.readout_l5

            cur = _arm(cur, dx, dy, l1)
            cur, dx, dy = _turn(cur, dx, dy, sign=+1)   # turn up-left
            cur = _arm(cur, dx, dy, l2)
            cur, dx, dy = _turn(cur, dx, dy, sign=-1)   # turn back right
            cur = _arm(cur, dx, dy, l3)
            cur, dx, dy = _turn(cur, dx, dy, sign=+1)
            cur = _arm(cur, dx, dy, l4)
            cur, dx, dy = _turn(cur, dx, dy, sign=-1)
            cur = _arm(cur, dx, dy, l5)

        # ── Convert centreline to shapely LineString ─────────────────────────
        from shapely.geometry import LineString
        line = LineString(pts)

        # ── Build CPW geometry (conductor + gap) ─────────────────────────────
        total_w   = w + 2 * g   # total trench width
        conductor = line.buffer(w / 2, cap_style=2)          # flat caps
        trench    = line.buffer(total_w / 2, cap_style=2)
        gap_poly  = trench.difference(conductor)

        # Centre the geometry on (0, 0) — shift by -half of bounding box
        from shapely.affinity import translate
        minx, miny, maxx, maxy = trench.bounds
        cx_shift = -(minx + maxx) / 2
        cy_shift = -(miny + maxy) / 2

        conductor = translate(conductor, cx_shift, cy_shift)
        gap_poly  = translate(gap_poly,  cx_shift, cy_shift)

        # ── Register geometry ─────────────────────────────────────────────────
        self.add_qgeometry("poly", {"conductor": conductor}, layer=p.layer)
        self.add_qgeometry("poly", {"gap": gap_poly},
                           subtract=True, layer=p.layer)

        # ── Register pin ──────────────────────────────────────────────────────
        # The coupling point is the start of the centreline (before centring).
        # After centring: absolute position = (pts[0] + shift) in mm.
        pin_x = pts[0][0] + cx_shift   # mm
        pin_y = pts[0][1] + cy_shift   # mm
        # The pin entry direction: the centreline leaves to the right (+x),
        # so the external connection arrives from the left (−x direction).
        pin_end_x = pin_x - w          # mm (inner endpoint along −x)
        self.add_pin(
            "readout",
            points=np.array([[pin_x, pin_y], [pin_end_x, pin_y]]),
            width=w,
            input_as_norm=True,
        )
