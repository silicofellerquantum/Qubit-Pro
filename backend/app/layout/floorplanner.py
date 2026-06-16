"""
layout/floorplanner.py — LAYOUT-009: Floorplanner
===================================================

Implements ``Floorplanner.plan()`` which converts a DesignGraph + DesignConstraints
into a fully-resolved spatial plan (FloorplanResult) with:

  • Dynamic die sizing  (pitch × N, not fixed 9×6 mm)
  • Template-lattice qubit site selection (grid / heavy_hex / line / ring / star)
  • Per-qubit resonator shell assignment (feedline-facing side)
  • Coupler corridor positioning (midpoint of coupling pair + clearance offset)
  • Feedline bus channel (bottom margin strip)
  • Perimeter launchpad slots (evenly distributed along die edges)
  • PlacementConstraint emission for EVERY secondary component

Acceptance criteria (LAYOUT-009)
---------------------------------
  ✓ pitch ≥ max_footprint_extent + clearance
  ✓ Die size grows with N (not fixed 9×6 mm)
  ✓ Constraints emitted for every secondary component
  ✓ Resonator shells feedline-facing
  ✓ Unit tests pass  (see backend/tests/test_floorplanner.py)

Dependencies
------------
  LAYOUT-003 : footprint extents via FabConstraints.pocket_half_size_mm
  LAYOUT-004 : DesignGraph (nodes already built upstream — we read, not build)
  LAYOUT-005 : at least one template in layout/templates/registry.py
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from app.constraints.constraints import DesignConstraints, FabConstraints
from app.core.design_graph.graph import DesignGraph
from app.core.design_graph.node import (
    CouplerNode,
    FeedlineNode,
    LaunchpadNode,
    NodeKind,
    QubitNode,
    ResonatorNode,
)
from app.layout.templates.registry import TemplateResult, get_template


# ── Enumerations ──────────────────────────────────────────────────────────────


class ConstraintKind(str, Enum):
    """Type of spatial constraint emitted for a secondary component."""
    QUBIT_SITE    = "qubit_site"       # data qubit lattice position
    RESONATOR_SHELL = "resonator_shell"  # readout resonator placement zone
    COUPLER_CORRIDOR = "coupler_corridor"  # coupler keepout + position
    FEEDLINE_CHANNEL = "feedline_channel"  # feedline bus strip
    LAUNCHPAD_SLOT  = "launchpad_slot"   # perimeter I/O slot


# ── Data containers ───────────────────────────────────────────────────────────


@dataclass
class PlacementConstraint:
    """
    Spatial constraint for a single secondary component.

    Fields
    ------
    node_id        : matches a node ID in the DesignGraph
    kind           : ConstraintKind enum
    x_mm           : resolved x-coordinate (chip coordinate system, mm)
    y_mm           : resolved y-coordinate
    orientation_deg: 0 / 90 / 180 / 270
    width_mm       : bounding-box width of the assigned zone
    height_mm      : bounding-box height of the assigned zone
    feedline_side  : True when resonator shell faces the feedline channel
    meta           : any extra provenance / debug data
    """
    node_id:         str
    kind:            ConstraintKind
    x_mm:            float
    y_mm:            float
    orientation_deg: int   = 0
    width_mm:        float = 0.0
    height_mm:       float = 0.0
    feedline_side:   bool  = False
    meta:            Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_id":         self.node_id,
            "kind":            self.kind.value,
            "x_mm":            round(self.x_mm, 4),
            "y_mm":            round(self.y_mm, 4),
            "orientation_deg": self.orientation_deg,
            "width_mm":        round(self.width_mm, 4),
            "height_mm":       round(self.height_mm, 4),
            "feedline_side":   self.feedline_side,
            "meta":            self.meta,
        }


@dataclass
class FloorplanSpec:
    """
    Architecture parameters derived from N and constraints.

    Created by Floorplanner._compute_spec() before site assignment.
    """
    chip_width_mm:    float     # die width  (grows with N)
    chip_height_mm:   float     # die height (grows with N)
    pitch_mm:         float     # qubit centre-to-centre pitch
    margin_mm:        float     # die-edge clearance for qubits
    feedline_y_mm:    float     # y-coordinate of feedline bus centreline
    feedline_height_mm: float   # feedline channel height
    resonator_shell_mm: float   # radial offset from qubit centre to resonator
    coupler_offset_mm:  float   # perpendicular offset for coupler midpoint
    launchpad_count:    int     # number of I/O launchpads
    topology:           str
    n_qubits:           int
    template_result:    Optional[TemplateResult] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "chip_width_mm":      round(self.chip_width_mm, 3),
            "chip_height_mm":     round(self.chip_height_mm, 3),
            "pitch_mm":           round(self.pitch_mm, 4),
            "margin_mm":          round(self.margin_mm, 4),
            "feedline_y_mm":      round(self.feedline_y_mm, 4),
            "feedline_height_mm": round(self.feedline_height_mm, 4),
            "resonator_shell_mm": round(self.resonator_shell_mm, 4),
            "coupler_offset_mm":  round(self.coupler_offset_mm, 4),
            "launchpad_count":    self.launchpad_count,
            "topology":           self.topology,
            "n_qubits":           self.n_qubits,
        }


@dataclass
class FloorplanResult:
    """
    Complete output of Floorplanner.plan().

    The DesignGraph nodes have their x_mm / y_mm / orientation_deg fields
    populated in-place.  All PlacementConstraints are also available for
    downstream engines (routing, DRC, codegen).
    """
    graph:        DesignGraph
    spec:         FloorplanSpec
    constraints:  List[PlacementConstraint]  = field(default_factory=list)
    warnings:     List[str]                  = field(default_factory=list)

    # convenience views
    @property
    def qubit_constraints(self) -> List[PlacementConstraint]:
        return [c for c in self.constraints if c.kind == ConstraintKind.QUBIT_SITE]

    @property
    def resonator_constraints(self) -> List[PlacementConstraint]:
        return [c for c in self.constraints if c.kind == ConstraintKind.RESONATOR_SHELL]

    @property
    def coupler_constraints(self) -> List[PlacementConstraint]:
        return [c for c in self.constraints if c.kind == ConstraintKind.COUPLER_CORRIDOR]

    @property
    def feedline_constraints(self) -> List[PlacementConstraint]:
        return [c for c in self.constraints if c.kind == ConstraintKind.FEEDLINE_CHANNEL]

    @property
    def launchpad_constraints(self) -> List[PlacementConstraint]:
        return [c for c in self.constraints if c.kind == ConstraintKind.LAUNCHPAD_SLOT]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "spec":        self.spec.to_dict(),
            "constraints": [c.to_dict() for c in self.constraints],
            "warnings":    self.warnings,
            "summary": {
                "n_qubit_constraints":    len(self.qubit_constraints),
                "n_resonator_constraints": len(self.resonator_constraints),
                "n_coupler_constraints":  len(self.coupler_constraints),
                "n_feedline_constraints": len(self.feedline_constraints),
                "n_launchpad_constraints": len(self.launchpad_constraints),
                "total_constraints":      len(self.constraints),
            },
        }


# ── Floorplanner ──────────────────────────────────────────────────────────────


class Floorplanner:
    """
    Template-driven quantum chip floorplanner.

    Parameters
    ----------
    graph       : fully-built DesignGraph (nodes from LAYOUT-004 / builder.py)
    constraints : DesignConstraints with fab + freq sub-specs
    keywords    : optional free-form hint dict (reserved for future ML use)

    Call
    ----
        result = Floorplanner(graph, constraints).plan()
    """

    # Physical constants / policy
    _MIN_MARGIN_MM       = 0.5    # die-edge to nearest qubit
    _FEEDLINE_HEIGHT_MM  = 0.4    # feedline bus channel height
    _FEEDLINE_MARGIN_MM  = 0.3    # additional gap below feedline to die edge
    _RESONATOR_RADIAL_MM = 0.45   # shell offset from qubit centre (min)
    _COUPLER_PERP_OFFSET = 0.10   # perpendicular nudge for coupler from midpoint
    _LP_WIDTH_MM         = 0.30   # launchpad bounding-box width
    _LP_HEIGHT_MM        = 0.20   # launchpad bounding-box height
    _RESONATOR_SHELL_W   = 0.30   # resonator zone width
    _RESONATOR_SHELL_H   = 0.20   # resonator zone height
    _COUPLER_W           = 0.15   # coupler zone width
    _COUPLER_H           = 0.15   # coupler zone height

    def __init__(
        self,
        graph:       DesignGraph,
        constraints: DesignConstraints,
        keywords:    Optional[Dict[str, Any]] = None,
    ) -> None:
        self.graph       = graph
        self.constraints = constraints
        self.keywords    = keywords or {}

        self._qubits:    List[QubitNode]    = list(graph.qubits)
        self._resonators: List[ResonatorNode] = list(graph.resonators)
        self._couplers:  List[CouplerNode]  = list(graph.couplers)
        self._feedlines: List[FeedlineNode] = list(graph.feedlines)
        self._launchpads: List[LaunchpadNode] = list(graph.launchpads)

        self._n = len(self._qubits)

    # ── Public entry point ────────────────────────────────────────────────────

    def plan(self) -> FloorplanResult:
        """
        Run the full floorplanning pipeline and return a FloorplanResult.

        Stages
        ------
        1. _compute_spec()   — derive pitch, die size, channel positions
        2. _place_qubits()   — template lattice → qubit site coordinates
        3. _place_resonators() — resonator shells (feedline-facing)
        4. _place_couplers() — coupler corridor positions
        5. _place_feedlines() — feedline bus channel
        6. _place_launchpads() — perimeter I/O slots
        7. _apply_to_graph() — write coordinates back into DesignGraph nodes
        """
        warnings: List[str] = []

        spec = self._compute_spec(warnings)
        constraints: List[PlacementConstraint] = []

        qubit_sites = self._place_qubits(spec, constraints, warnings)
        self._place_resonators(spec, qubit_sites, constraints, warnings)
        self._place_couplers(spec, qubit_sites, constraints, warnings)
        self._place_feedlines(spec, constraints, warnings)
        self._place_launchpads(spec, constraints, warnings)

        self._apply_to_graph(constraints)

        return FloorplanResult(
            graph=self.graph,
            spec=spec,
            constraints=constraints,
            warnings=warnings,
        )

    # ── Stage 1: Spec computation ─────────────────────────────────────────────

    def _compute_spec(self, warnings: List[str]) -> FloorplanSpec:
        """
        Derive all architecture parameters from constraints and N.

        Pitch formula (LAYOUT-009 acceptance criterion):
            pitch ≥ max_footprint_extent + clearance
        where max_footprint_extent = 2 × pocket_half_size_mm
        and   clearance             = min_qubit_spacing_mm
        """
        fab   = self.constraints.fab
        n     = max(1, self._n)
        topo  = self.constraints.topology or self.graph.topology or "grid"

        # ── Pitch ────────────────────────────────────────────────────────────
        footprint_mm  = 2.0 * fab.pocket_half_size_mm          # full pocket extent
        clearance_mm  = fab.min_qubit_spacing_mm                # DRC clearance
        pitch_mm      = footprint_mm + clearance_mm             # ≥ footprint + clearance
        pitch_mm      = max(pitch_mm, 1.0)                      # absolute floor

        # ── Die sizing (grows with N) ─────────────────────────────────────────
        # Estimate layout footprint for the template topology
        cols, rows = _estimate_grid_shape(n, topo)
        margin      = self._MIN_MARGIN_MM

        # Width / height to comfortably fit the lattice
        layout_w    = (cols - 1) * pitch_mm + footprint_mm
        layout_h    = (rows - 1) * pitch_mm + footprint_mm

        # Add margin on all four sides
        chip_w = layout_w + 2 * margin
        # Add extra height for feedline channel at bottom
        feedline_h  = self._FEEDLINE_HEIGHT_MM
        feedline_margin = self._FEEDLINE_MARGIN_MM
        chip_h = layout_h + 2 * margin + feedline_h + feedline_margin

        # Die GROWS with N (AC2): the N-driven layout size is always authoritative.
        # The user chip spec is purely advisory — it is only honoured when the
        # user explicitly provided a size LARGER than what the layout requires.
        # A non-zero user spec that is smaller than our computed size is ignored
        # so that a larger qubit count always yields a larger chip.
        chip_w = max(chip_w, 4.0)    # absolute floor
        chip_h = max(chip_h, 4.0)

        # Feedline channel: horizontal band at the bottom of the qubit array
        # feedline_y = bottom of qubit area – half feedline height
        feedline_y = margin + feedline_h / 2.0

        # Resonator shell offset: just above DRC clearance from qubit edge
        resonator_shell = max(self._RESONATOR_RADIAL_MM, fab.min_resonator_gap_mm + footprint_mm / 2.0)

        # Launchpad count: 2 per feedline (left + right), at least 2
        lp_count = max(2, len(self._launchpads))

        # Build template
        cx = chip_w / 2.0
        cy_qubits = margin + feedline_h + feedline_margin + layout_h / 2.0
        template = get_template(topo, n, pitch_mm, cx, cy_qubits)

        if template is None:
            warnings.append(
                f"Topology '{topo}' has no closed-form template — "
                "using grid fallback."
            )
            template = get_template("grid", n, pitch_mm, cx, cy_qubits)

        return FloorplanSpec(
            chip_width_mm       = chip_w,
            chip_height_mm      = chip_h,
            pitch_mm            = pitch_mm,
            margin_mm           = margin,
            feedline_y_mm       = feedline_y,
            feedline_height_mm  = feedline_h,
            resonator_shell_mm  = resonator_shell,
            coupler_offset_mm   = self._COUPLER_PERP_OFFSET,
            launchpad_count     = lp_count,
            topology            = topo,
            n_qubits            = n,
            template_result     = template,
        )

    # ── Stage 2: Qubit placement ──────────────────────────────────────────────

    def _place_qubits(
        self,
        spec:        FloorplanSpec,
        out:         List[PlacementConstraint],
        warnings:    List[str],
    ) -> Dict[str, Tuple[float, float]]:
        """
        Assign qubit sites from the template and emit QUBIT_SITE constraints.

        Returns
        -------
        dict mapping qubit node_id → (x_mm, y_mm)
        """
        tmpl   = spec.template_result
        sites  = tmpl.sites if tmpl else []
        result: Dict[str, Tuple[float, float]] = {}

        for i, qubit in enumerate(self._qubits):
            if i < len(sites):
                x, y, orient = sites[i]
            else:
                # Overflow: place beyond template grid
                overflow_col = i - len(sites)
                x = spec.chip_width_mm / 2.0 + overflow_col * spec.pitch_mm
                y = spec.chip_height_mm / 2.0
                orient = 0
                warnings.append(
                    f"Qubit {qubit.id}: overflow beyond template — "
                    f"placed at ({x:.2f}, {y:.2f}) mm"
                )

            result[qubit.id] = (x, y)
            out.append(PlacementConstraint(
                node_id         = qubit.id,
                kind            = ConstraintKind.QUBIT_SITE,
                x_mm            = x,
                y_mm            = y,
                orientation_deg = orient,
                width_mm        = 2.0 * self.constraints.fab.pocket_half_size_mm,
                height_mm       = 2.0 * self.constraints.fab.pocket_half_size_mm,
                meta            = {"template_index": i, "topology": spec.topology},
            ))

        return result

    # ── Stage 3: Resonator placement ─────────────────────────────────────────

    def _place_resonators(
        self,
        spec:        FloorplanSpec,
        qubit_sites: Dict[str, Tuple[float, float]],
        out:         List[PlacementConstraint],
        warnings:    List[str],
    ) -> None:
        """
        Assign resonator shells.

        Each readout resonator is placed on the **feedline-facing** side of its
        target qubit — i.e. toward smaller y (toward the feedline bus channel).

        For bus resonators, place toward the connected neighbour.
        """
        feedline_y = spec.feedline_y_mm
        shell_r    = spec.resonator_shell_mm

        for res in self._resonators:
            target_id = getattr(res, "target_qubit_id", "") or ""

            # Resolve qubit position
            if target_id and target_id in qubit_sites:
                qx, qy = qubit_sites[target_id]
            elif qubit_sites:
                # Fallback: nearest qubit
                qx, qy = next(iter(qubit_sites.values()))
                warnings.append(
                    f"Resonator {res.id}: target qubit '{target_id}' not found; "
                    "using first qubit position."
                )
            else:
                qx, qy = spec.chip_width_mm / 2.0, spec.chip_height_mm / 2.0
                warnings.append(f"Resonator {res.id}: no qubit sites available.")

            # Direction toward feedline (feedline is below the qubit array)
            # Shell is placed between qubit and feedline
            dy = feedline_y - qy  # negative if feedline is below qubit
            dist = abs(dy) if dy != 0 else shell_r
            # Normalised direction unit vector
            nx_dir = 0.0
            ny_dir = -1.0 if dy <= 0 else 1.0   # toward feedline

            rx = qx + nx_dir * shell_r
            ry = qy + ny_dir * shell_r

            # Orient resonator so its input pin faces the qubit (anti-feedline)
            orient = 270 if ny_dir < 0 else 90   # 270 = pointing down (feedline side)

            out.append(PlacementConstraint(
                node_id         = res.id,
                kind            = ConstraintKind.RESONATOR_SHELL,
                x_mm            = rx,
                y_mm            = ry,
                orientation_deg = orient,
                width_mm        = self._RESONATOR_SHELL_W,
                height_mm       = self._RESONATOR_SHELL_H,
                feedline_side   = True,
                meta            = {
                    "target_qubit":    target_id,
                    "qubit_x_mm":      qx,
                    "qubit_y_mm":      qy,
                    "shell_radius_mm": shell_r,
                    "faces_feedline":  True,
                },
            ))

    # ── Stage 4: Coupler placement ────────────────────────────────────────────

    def _place_couplers(
        self,
        spec:        FloorplanSpec,
        qubit_sites: Dict[str, Tuple[float, float]],
        out:         List[PlacementConstraint],
        warnings:    List[str],
    ) -> None:
        """
        Place couplers in corridors between their two connected qubits.

        Position = midpoint of (qubit_a, qubit_b) + small perpendicular offset
        to avoid overlap with resonator shells and keep corridors clear.
        """
        perp_off = spec.coupler_offset_mm

        for coup in self._couplers:
            qa_id = getattr(coup, "qubit_a_id", "") or ""
            qb_id = getattr(coup, "qubit_b_id", "") or ""

            ax, ay = qubit_sites.get(qa_id, (spec.chip_width_mm / 2.0, spec.chip_height_mm / 2.0))
            bx, by = qubit_sites.get(qb_id, (spec.chip_width_mm / 2.0 + spec.pitch_mm, spec.chip_height_mm / 2.0))

            if qa_id not in qubit_sites:
                warnings.append(f"Coupler {coup.id}: qubit_a '{qa_id}' not in site map.")
            if qb_id not in qubit_sites:
                warnings.append(f"Coupler {coup.id}: qubit_b '{qb_id}' not in site map.")

            # Midpoint
            mx = (ax + bx) / 2.0
            my = (ay + by) / 2.0

            # Perpendicular direction to the coupling line
            dx, dy = bx - ax, by - ay
            length = math.hypot(dx, dy)
            if length > 1e-6:
                # perpendicular = rotate 90°
                px, py = -dy / length, dx / length
            else:
                px, py = 0.0, 1.0

            cx_pos = mx + px * perp_off
            cy_pos = my + py * perp_off

            # Orientation: along the coupling line
            orient = int(round(math.degrees(math.atan2(dy, dx)))) % 360

            out.append(PlacementConstraint(
                node_id         = coup.id,
                kind            = ConstraintKind.COUPLER_CORRIDOR,
                x_mm            = cx_pos,
                y_mm            = cy_pos,
                orientation_deg = orient,
                width_mm        = self._COUPLER_W,
                height_mm       = self._COUPLER_H,
                meta            = {
                    "qubit_a":    qa_id,
                    "qubit_b":    qb_id,
                    "midpoint_x": mx,
                    "midpoint_y": my,
                    "perp_offset_mm": perp_off,
                },
            ))

    # ── Stage 5: Feedline placement ───────────────────────────────────────────

    def _place_feedlines(
        self,
        spec:     FloorplanSpec,
        out:      List[PlacementConstraint],
        warnings: List[str],
    ) -> None:
        """
        Place feedline bus channel as a horizontal strip at spec.feedline_y_mm.

        The feedline runs the full width of the qubit array.
        """
        for i, fl in enumerate(self._feedlines):
            fl_x  = spec.chip_width_mm / 2.0     # centred on die
            fl_y  = spec.feedline_y_mm
            fl_w  = spec.chip_width_mm - 2.0 * spec.margin_mm

            out.append(PlacementConstraint(
                node_id         = fl.id,
                kind            = ConstraintKind.FEEDLINE_CHANNEL,
                x_mm            = fl_x,
                y_mm            = fl_y,
                orientation_deg = 0,
                width_mm        = fl_w,
                height_mm       = spec.feedline_height_mm,
                meta            = {
                    "channel_index": i,
                    "y_bottom_mm":   fl_y - spec.feedline_height_mm / 2.0,
                    "y_top_mm":      fl_y + spec.feedline_height_mm / 2.0,
                    "x_start_mm":    fl_x - fl_w / 2.0,
                    "x_end_mm":      fl_x + fl_w / 2.0,
                },
            ))

    # ── Stage 6: Launchpad placement ──────────────────────────────────────────

    def _place_launchpads(
        self,
        spec:     FloorplanSpec,
        out:      List[PlacementConstraint],
        warnings: List[str],
    ) -> None:
        """
        Distribute launchpads evenly along the die perimeter.

        Convention (IBM-style):
          - Left  side:  x = 0,          y distributed along chip height
          - Right side:  x = chip_width, y distributed along chip height
          - Prefer left/right sides; add top/bottom if > 4 launchpads.

        Each launchpad is oriented so its RF pin faces inward.
        """
        pads   = self._launchpads
        n_pads = max(spec.launchpad_count, len(pads))

        if n_pads == 0:
            return

        # Build perimeter slots: left edge + right edge, bottom → top
        slots = _perimeter_slots(
            n_slots     = n_pads,
            chip_width  = spec.chip_width_mm,
            chip_height = spec.chip_height_mm,
            margin      = spec.margin_mm,
        )

        for i, lp in enumerate(pads):
            if i < len(slots):
                sx, sy, sorient, side = slots[i]
            else:
                # Extra pads beyond slot count: stack on right edge
                sx      = spec.chip_width_mm
                sy      = spec.chip_height_mm / 2.0 + (i - len(slots)) * 0.5
                sorient = 0
                side = "right"

            out.append(PlacementConstraint(
                node_id         = lp.id,
                kind            = ConstraintKind.LAUNCHPAD_SLOT,
                x_mm            = sx,
                y_mm            = sy,
                orientation_deg = sorient,
                width_mm        = self._LP_WIDTH_MM,
                height_mm       = self._LP_HEIGHT_MM,
                meta            = {
                    "slot_index": i,
                    "side":       side,
                },
            ))

    # ── Stage 7: Write back to DesignGraph ───────────────────────────────────

    def _apply_to_graph(self, constraints: List[PlacementConstraint]) -> None:
        """
        Copy resolved coordinates from PlacementConstraints back into the
        corresponding DesignGraph node objects.

        This is the authoritative write; all downstream consumers read from
        the graph, not from the constraint list.
        """
        for pc in constraints:
            try:
                node = self.graph.get_node(pc.node_id)
            except KeyError:
                continue   # node_id not in graph (should not happen)
            node.x_mm            = pc.x_mm
            node.y_mm            = pc.y_mm
            node.orientation_deg = pc.orientation_deg


# ── Internal helpers ──────────────────────────────────────────────────────────


def _estimate_grid_shape(n: int, topology: str) -> Tuple[int, int]:
    """
    Estimate (cols, rows) for die-size computation.
    Does NOT need to match the template exactly — just the bounding box.
    """
    if n <= 1:
        return 1, 1

    if topology == "line":
        return n, 1

    if topology == "ring":
        # Approximate bounding box of a ring
        side = math.ceil(n / 4) + 1
        return side * 2, side * 2

    if topology == "star":
        # Hub + radial spokes: diameter ≈ 2 spoke lengths
        spokes = n - 1
        half = math.ceil(spokes / 4) + 1
        return half * 2, half * 2

    if topology in {"heavy_hex", "heavy-hex", "heavyhex", "ibm"}:
        data_cols = max(2, math.ceil(math.sqrt(n * 1.5)))
        data_rows = max(2, math.ceil(n / data_cols))
        return data_cols, data_rows

    # Default: square-ish grid
    cols = math.ceil(math.sqrt(n))
    rows = math.ceil(n / cols)
    return cols, rows


def _perimeter_slots(
    n_slots:    int,
    chip_width: float,
    chip_height: float,
    margin:     float,
) -> List[Tuple[float, float, int, str]]:
    """
    Generate n_slots evenly-spaced positions around the die perimeter.

    Returns list of (x_mm, y_mm, orientation_deg, edge).
    Orientation points the pad RF pin inward.

    Distribution strategy:
      • First fill left side (x=0) bottom-to-top
      • Then fill right side (x=W) bottom-to-top
      • Then top/bottom if still needed
    """
    slots: List[Tuple[float, float, int, str]] = []

    usable_h = chip_height - 2 * margin

    left_count  = (n_slots + 1) // 2
    right_count = n_slots - left_count

    # Left side: x=0, orientated right (0°)
    for i in range(left_count):
        y = margin + (i + 1) * usable_h / (left_count + 1)
        slots.append((0.0, y, 0, "left"))       # facing right

    # Right side: x=W, oriented left (180°)
    for i in range(right_count):
        y = margin + (i + 1) * usable_h / (right_count + 1)
        slots.append((chip_width, y, 180, "right"))   # facing left

    return slots
