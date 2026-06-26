"""
readout_res_fc.py — Custom ReadoutResFC QComponent.

A folded coplanar-waveguide readout resonator with correct Qiskit Metal
pos_x / pos_y / orientation transform support.

The coupling port ("readout" pin) is built at local origin (0, 0) facing
+x.  The meander runs to the right.  After building in local coordinates
the geometry and pin points are rotated by p.orientation and translated by
(p.pos_x, p.pos_y) — exactly matching the pattern of all built-in
QComponents such as TransmonPocket.

This ensures that when the worker sets orientation= the pin location and
geometry both rotate correctly, so routes always attach to the right place.
"""

from __future__ import annotations

import logging
import math

import numpy as np
from qiskit_metal import draw, Dict
from qiskit_metal.qlibrary.core import QComponent

log = logging.getLogger(__name__)


class ReadoutResFC(QComponent):
    """Folded CPW readout resonator (custom, with proper rotation support).

    Pin "readout" is at pos_x/pos_y after rotation by orientation.
    The coupling end faces outward (−x in local frame → rotated by orientation
    in world frame).

    Default options match the catalog entry in component_catalog.json.
    """

    default_options = Dict(
        pos_x                  = "0um",
        pos_y                  = "0um",
        readout_cpw_width      = "10um",
        readout_cpw_gap        = "6um",
        readout_cpw_turnradius = "100um",
        readout_l1             = "400um",
        readout_l2             = "600um",
        readout_l3             = "600um",
        readout_l4             = "600um",
        readout_l5             = "400um",
        orientation            = "0",
        layer                  = "1",
        chip                   = "main",
    )

    component_metadata = Dict(
        short_name              = "ReadoutResFC",
        _qgeometry_table_poly   = "True",
        _qgeometry_table_path   = "False",
        _qgeometry_table_junction = "False",
    )

    # No connection-pad overlays — pin registered manually.
    _default_connection_pads = dict()

    # ── Build ─────────────────────────────────────────────────────────────────

    def make(self) -> None:  # noqa: D102
        p = self.p  # parsed options; all lengths in mm (Qiskit Metal design units)

        w  = p.readout_cpw_width        # mm
        g  = p.readout_cpw_gap          # mm
        tr = p.readout_cpw_turnradius   # mm
        l1 = p.readout_l1
        l2 = p.readout_l2
        l3 = p.readout_l3
        l4 = p.readout_l4
        l5 = p.readout_l5

        # ── Build centreline in local coords ──────────────────────────────────
        # Coupling port at local (0, 0); meander extends in +x direction.
        pts: list[tuple[float, float]] = [(0.0, 0.0)]

        def _arm(cur, dx, dy, length):
            nx, ny = cur[0] + dx * length, cur[1] + dy * length
            pts.append((nx, ny))
            return (nx, ny)

        def _turn(cur, dx, dy, sign, n_steps=24):
            """180° semicircular arc. sign=+1 → CCW, sign=−1 → CW."""
            cx_off = -sign * dy * tr
            cy_off =  sign * dx * tr
            cx, cy = cur[0] + cx_off, cur[1] + cy_off
            start_angle = math.atan2(cur[1] - cy, cur[0] - cx)
            angles = np.linspace(start_angle, start_angle + sign * math.pi, n_steps + 1)
            for a in angles[1:]:
                pts.append((cx + tr * math.cos(a), cy + tr * math.sin(a)))
            return pts[-1], -dx, -dy

        cur = (0.0, 0.0)
        dx, dy = 1.0, 0.0  # start direction: 

        cur         = _arm(cur, dx, dy, l1)
        cur, dx, dy = _turn(cur, dx, dy, sign=+1)
        cur         = _arm(cur, dx, dy, l2)
        cur, dx, dy = _turn(cur, dx, dy, sign=-1)
        cur         = _arm(cur, dx, dy, l3)
        cur, dx, dy = _turn(cur, dx, dy, sign=+1)
        cur         = _arm(cur, dx, dy, l4)
        cur, dx, dy = _turn(cur, dx, dy, sign=-1)
        cur         = _arm(cur, dx, dy, l5)

        # ── Build Shapely CPW polygons in local coords ────────────────────────
        from shapely.geometry import LineString

        line      = LineString(pts)
        conductor = line.buffer(w / 2.0, cap_style=2)
        trench    = line.buffer(w / 2.0 + g, cap_style=2)
        gap_poly  = trench.difference(conductor)

        # ── Pin points in local coords ────────────────────────────────────────
        # Coupling port at origin; route approaches from -x side.
        # [outer_pt, inner_pt] with input_as_norm=True →
        #   outer = where the route terminates (external)
        #   inner = entry into the component
        # Normal (outward) direction will be: outer → inner normalised → reversed = inner→outer.
        # We want the outward normal pointing AWAY from the component, i.e. in -x direction.
        pin_inner = np.array([0.0,  0.0])   # at component origin
        pin_outer = np.array([-w,   0.0])   # one width back in -x

        # ── Apply orientation rotation + pos transla ──────────────────────
        # This is the standard Qiskit Metal pattern (see transmon_pocket.py):
        #   1. draw.rotate(shapes, angle, origin=(0,0))
        #   2. draw.translate(shapes, pos_x, pos_y)
        polys = [conductor, gap_poly]
        polys = draw.rotate(polys, p.orientation, origin=(0, 0))
        polys = draw.translate(polys, p.pos_x, p.pos_y)
        conductor, gap_poly = polys

        # Rotate + translate pin points using the same transform
        angle_rad = math.radians(float(p.orientation))
        cos_a, sin_a = math.cos(angle_rad), math.sin(angle_rad)

        def _rot_pt(pt):
            x, y = pt
            return np.array([x * cos_a - y * sin_a + p.pos_x,
                              x * sin_a + y * cos_a + p.pos_y])

        pin_inner_w = _rot_pt(pin_inner)
        pin_outer_w = _rot_pt(pin_outer)

        log.debug(
            "ReadoutResFC '%s' pin 'readout' (world): "
            "outer=(%.4f,%.4f) mm  inner=(%.4f,%.4f) mm  orientation=%.1f°",
            self.name,
            pin_outer_w[0], pin_outer_w[1],
            pin_inner_w[0], pin_inner_w[1],
            float(p.orientation),
        )

        # ── Register geometry ─────────────────────────────────────────────────
        self.add_qgeometry("poly", {"conductor": conductor},
                           layer=int(p.layer), subtract=False)
        self.add_qgeometry("poly", {"gap": gap_poly},
                           layer=int(p.layer), subtract=True)

        # ── Register pin ──────────────────────────────────────────────────────
        self.add_pin(
            "readout",
            points=np.array([pin_outer_w, pin_inner_w]),
            width=w,
            input_as_norm=True,
        )

        # ── Open end pin — at the far end of the meander ──────────────────────
        # The last point of the meander is the open (unterminated) end.
        # It faces outward in the direction the last arm was travelling (+x in local).
        open_inner = np.array(list(cur))          # end of last arm (local)
        open_dx, open_dy = float(dx), float(dy)   # direction at end of last arm
        open_outer = np.array([cur[0] + open_dx * w, cur[1] + open_dy * w])  # one width outward

        open_inner_w = _rot_pt(open_inner)
        open_outer_w = _rot_pt(open_outer)

        self.add_pin(
            "open_end",
            points=np.array([open_outer_w, open_inner_w]),
            width=w,
            input_as_norm=True,
        )
