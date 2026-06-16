"""
Layout Scoring Engine  —  LAYOUT-013
=====================================

Implements ``LayoutScorer`` with:

  Hard gate  (gate_passed = True/False):
    • Any keepout-polygon overlap              → FAIL
    • Any component centre outside die bounds  → FAIL

  Soft metrics  (each 0–100, weighted to produce ``overall`` 0–100):
    overlap_score       – 100 when zero overlap, decays with total overlap area
    spacing_score       – 100 when all pairs ≥ min_spacing; decays per violation
    symmetry_score      – geometric centre-of-mass deviation from die centre
    compactness_score   – ratio of bounding-box area to die area
    edge_compliance_score – fraction of components fully inside die bounds
    aesthetics_score    – uniformity of nearest-neighbour distances

Phase-1 default weights  (from constants.SCORE_WEIGHTS):
    spacing        0.25
    symmetry       0.25
    compactness    0.20
    edge_compliance 0.15
    aesthetics     0.15

Dependencies: LAYOUT-002 (models), LAYOUT-003 (footprints / ObstacleMap)
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Sequence, Tuple

from app.layout.models import Footprint, ScoreBreakdown
from app.layout.constants import (
    DEFAULT_CLEARANCE_MM,
    SCORE_WEIGHTS,
)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _clamp(value: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, value))


def _centres(
    placements: Dict[str, Tuple[float, float]],
    footprints: Dict[str, Footprint],
) -> Dict[str, Tuple[float, float]]:
    """
    Return centre positions from placements dict.

    ``placements`` already stores centre coordinates (x_mm, y_mm) so this is
    a thin pass-through; footprints are accepted for API symmetry.
    """
    return dict(placements)


def _pairwise_distances(
    centres: Dict[str, Tuple[float, float]],
) -> List[float]:
    """Return all pairwise centre-to-centre distances."""
    items = list(centres.values())
    dists: List[float] = []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            dx = items[i][0] - items[j][0]
            dy = items[i][1] - items[j][1]
            dists.append(math.hypot(dx, dy))
    return dists


# ─────────────────────────────────────────────────────────────────────────────
# LayoutScorer
# ─────────────────────────────────────────────────────────────────────────────

class LayoutScorer:
    """
    Multi-metric layout quality scorer.

    Parameters
    ----------
    weights : optional dict overriding Phase-1 SCORE_WEIGHTS.
        Keys: 'spacing', 'symmetry', 'compactness', 'edge_compliance', 'aesthetics'
        Values: relative weights (auto-normalised to sum=1).
    min_spacing_mm : minimum acceptable centre-to-centre distance.
        Defaults to DEFAULT_CLEARANCE_MM (from constants).
    overlap_decay : controls how quickly overlap_score drops with area;
        score = 100 * exp(-overlap_decay * total_overlap_area).

    Example::

        scorer = LayoutScorer()
        breakdown = scorer.score(placements, footprints, die_bounds=(10.0, 8.0))
        if breakdown.gate_passed:
            print(f"Overall: {breakdown.overall_score:.1f}/100")
    """

    def __init__(
        self,
        weights: Optional[Dict[str, float]] = None,
        min_spacing_mm: float = DEFAULT_CLEARANCE_MM,
        overlap_decay: float = 500.0,
    ) -> None:
        """
        Args:
            weights        : override Phase-1 scoring weights (auto-normalised).
            min_spacing_mm : DRC-aligned minimum spacing for spacing_score gate.
            overlap_decay  : sensitivity of overlap_score to total overlap area.
        """
        raw = weights if weights is not None else dict(SCORE_WEIGHTS)

        # Normalise weights to sum = 1.0
        total = sum(raw.values())
        if total <= 0:
            raise ValueError("Scoring weights must sum to a positive value.")
        self._weights = {k: v / total for k, v in raw.items()}

        self.min_spacing_mm = min_spacing_mm
        self.overlap_decay = overlap_decay

    # ── Public API ────────────────────────────────────────────────────────────

    def gate(
        self,
        placements: Dict[str, Tuple[float, float]],
        footprints: Dict[str, Footprint],
        die_bounds: Tuple[float, float],
    ) -> bool:
        """
        Hard gate: returns True only if the layout has zero overlaps and all
        components are on-chip.

        This mirrors the geometry_drc.py rules so scorer verdicts align with
        the DRC pipeline (LAYOUT-016 requirement — read-only alignment).

        Args:
            placements : ``{node_id: (x_mm, y_mm)}`` centre positions.
            footprints : ``{node_id: Footprint}`` with keepout polygons.
            die_bounds : ``(width_mm, height_mm)`` of the die.

        Returns:
            True if layout passes all hard checks.
        """
        # --- overlap check ---------------------------------------------------
        if self._has_overlaps(placements, footprints):
            return False

        # --- on-chip check ---------------------------------------------------
        die_w, die_h = die_bounds
        for node_id, (cx, cy) in placements.items():
            if node_id not in footprints:
                continue
            fp = footprints[node_id]
            hw = fp.width_mm / 2.0
            hh = fp.height_mm / 2.0
            # Component must be fully inside die (allow ±die_bounds/2 centred)
            if (cx - hw < -die_w / 2.0 or cx + hw > die_w / 2.0 or
                    cy - hh < -die_h / 2.0 or cy + hh > die_h / 2.0):
                return False

        return True

    def score(
        self,
        placements: Dict[str, Tuple[float, float]],
        footprints: Dict[str, Footprint],
        die_bounds: Tuple[float, float],
        template_info: Optional[Dict] = None,
    ) -> ScoreBreakdown:
        """
        Compute all layout quality metrics and return a ScoreBreakdown.

        Args:
            placements   : ``{node_id: (x_mm, y_mm)}`` centre positions.
            footprints   : ``{node_id: Footprint}`` with geometry.
            die_bounds   : ``(width_mm, height_mm)`` of the die.
            template_info: Optional template metadata (unused in Phase 1;
                           reserved for Phase-2 symmetry hints).

        Returns:
            ScoreBreakdown with gate_passed and all six soft metrics plus overall.
        """
        gate_passed = self.gate(placements, footprints, die_bounds)

        overlap_s       = self._score_overlap(placements, footprints)
        spacing_s       = self._score_spacing(placements)
        symmetry_s      = self._score_symmetry(placements, die_bounds)
        compactness_s   = self._score_compactness(placements, die_bounds)
        edge_s          = self._score_edge_compliance(placements, footprints, die_bounds)
        aesthetics_s    = self._score_aesthetics(placements)

        # Weighted aggregate over the five soft dimensions
        w = self._weights
        overall = (
            w.get("spacing",         0.25) * spacing_s +
            w.get("symmetry",        0.25) * symmetry_s +
            w.get("compactness",     0.20) * compactness_s +
            w.get("edge_compliance", 0.15) * edge_s +
            w.get("aesthetics",      0.15) * aesthetics_s
        )
        overall = _clamp(overall)

        # Hard gate: if gate fails clamp overall to ≤ 0 (non-passing)
        # so downstream callers know this layout needs rework.
        if not gate_passed:
            overall = min(overall, 0.0)

        return ScoreBreakdown(
            gate_passed           = gate_passed,
            overlap_score         = _clamp(overlap_s),
            spacing_score         = _clamp(spacing_s),
            symmetry_score        = _clamp(symmetry_s),
            compactness_score     = _clamp(compactness_s),
            edge_compliance_score = _clamp(edge_s),
            aesthetics_score      = _clamp(aesthetics_s),
            overall_score         = overall,
        )

    # ── Hard gate helpers ─────────────────────────────────────────────────────

    def _has_overlaps(
        self,
        placements: Dict[str, Tuple[float, float]],
        footprints: Dict[str, Footprint],
    ) -> bool:
        """
        Return True if any pair of keepout polygons intersect.

        Uses Shapely if the polygons are real Shapely objects; falls back to
        AABB comparison when polygons are None (stub footprints in tests).
        """
        items = [
            (nid, placements[nid], footprints[nid])
            for nid in placements
            if nid in footprints
        ]

        for i in range(len(items)):
            nid_a, pos_a, fp_a = items[i]
            for j in range(i + 1, len(items)):
                nid_b, pos_b, fp_b = items[j]

                poly_a = fp_a.keepout_polygon
                poly_b = fp_b.keepout_polygon

                if poly_a is not None and poly_b is not None:
                    # Real Shapely geometries
                    if poly_a.intersects(poly_b):
                        return True
                else:
                    # Fallback AABB when polygons are None
                    cx_a, cy_a = pos_a
                    cx_b, cy_b = pos_b
                    hw_a, hh_a = fp_a.width_mm / 2.0, fp_a.height_mm / 2.0
                    hw_b, hh_b = fp_b.width_mm / 2.0, fp_b.height_mm / 2.0
                    if (abs(cx_a - cx_b) < hw_a + hw_b and
                            abs(cy_a - cy_b) < hh_a + hh_b):
                        return True

        return False

    # ── Soft metric scorers ───────────────────────────────────────────────────

    def _score_overlap(
        self,
        placements: Dict[str, Tuple[float, float]],
        footprints: Dict[str, Footprint],
    ) -> float:
        """
        overlap_score = 100 * exp(-decay * total_keepout_overlap_area).

        Perfect (zero overlap) → 100.
        Returns 100 when polygons are None (stub mode).
        """
        total_area = 0.0
        items = [
            (placements[nid], footprints[nid])
            for nid in placements
            if nid in footprints
        ]

        for i in range(len(items)):
            pos_a, fp_a = items[i]
            poly_a = fp_a.keepout_polygon
            if poly_a is None:
                continue
            for j in range(i + 1, len(items)):
                pos_b, fp_b = items[j]
                poly_b = fp_b.keepout_polygon
                if poly_b is None:
                    continue
                inter = poly_a.intersection(poly_b)
                total_area += inter.area

        return 100.0 * math.exp(-self.overlap_decay * total_area)

    def _score_spacing(
        self,
        placements: Dict[str, Tuple[float, float]],
    ) -> float:
        """
        spacing_score: fraction of pairs that satisfy min_spacing_mm × 100.

        If no pairs → 100.
        """
        dists = _pairwise_distances(placements)
        if not dists:
            return 100.0

        passing = sum(1 for d in dists if d >= self.min_spacing_mm)
        fraction_ok = passing / len(dists)

        # Bonus: when all pass, reflect the average margin above threshold
        if fraction_ok == 1.0:
            excess = [d - self.min_spacing_mm for d in dists]
            avg_excess = sum(excess) / len(excess)
            # Saturates at 100 when excess ≥ 3× min_spacing
            bonus = min(avg_excess / (3.0 * self.min_spacing_mm), 1.0)
            return 50.0 + 50.0 * bonus

        return fraction_ok * 100.0

    def _score_symmetry(
        self,
        placements: Dict[str, Tuple[float, float]],
        die_bounds: Tuple[float, float],
    ) -> float:
        """
        symmetry_score: how centred the component cloud is on the die.

        Measured as 1 - normalised displacement of the centroid from die centre.
        Perfect → 100. Score decays linearly with centroid offset.
        """
        if not placements:
            return 100.0

        xs = [x for x, _ in placements.values()]
        ys = [y for _, y in placements.values()]
        cx = sum(xs) / len(xs)
        cy = sum(ys) / len(ys)

        die_w, die_h = die_bounds
        # Die centre (we use 0,0 — layouts are centred at origin)
        die_cx, die_cy = 0.0, 0.0

        # Normalise by half-diagonal
        half_diag = math.hypot(die_w / 2.0, die_h / 2.0)
        if half_diag == 0:
            return 100.0

        offset = math.hypot(cx - die_cx, cy - die_cy)
        score = 100.0 * max(0.0, 1.0 - offset / half_diag)
        return score

    def _score_compactness(
        self,
        placements: Dict[str, Tuple[float, float]],
        die_bounds: Tuple[float, float],
    ) -> float:
        """
        compactness_score: 100 when the component bounding box is small
        relative to the die area.

        score = 100 * (1 - component_bbox_area / die_area).
        Perfect → all components coincide at die centre (score → 100).
        Worst  → components span the entire die (score → 0).
        """
        if len(placements) < 2:
            return 100.0

        xs = [x for x, _ in placements.values()]
        ys = [y for _, y in placements.values()]

        bbox_w = max(xs) - min(xs)
        bbox_h = max(ys) - min(ys)
        bbox_area = bbox_w * bbox_h

        die_w, die_h = die_bounds
        die_area = die_w * die_h
        if die_area <= 0:
            return 100.0

        ratio = bbox_area / die_area
        return 100.0 * max(0.0, 1.0 - ratio)

    def _score_edge_compliance(
        self,
        placements: Dict[str, Tuple[float, float]],
        footprints: Dict[str, Footprint],
        die_bounds: Tuple[float, float],
    ) -> float:
        """
        edge_compliance_score: fraction of components fully inside die × 100.

        A component is compliant if its entire body polygon stays within die.
        Falls back to centre-inside check when polygons are None.
        """
        if not placements:
            return 100.0

        die_w, die_h = die_bounds
        x_min_die = -die_w / 2.0
        x_max_die =  die_w / 2.0
        y_min_die = -die_h / 2.0
        y_max_die =  die_h / 2.0

        n_compliant = 0
        n_total = 0

        for node_id, (cx, cy) in placements.items():
            n_total += 1
            fp = footprints.get(node_id)

            if fp is None:
                # No footprint info — just check centre
                if x_min_die <= cx <= x_max_die and y_min_die <= cy <= y_max_die:
                    n_compliant += 1
                continue

            poly = fp.polygon
            if poly is not None:
                # Check body polygon bounds
                min_x, min_y, max_x, max_y = poly.bounds
                if (min_x >= x_min_die and max_x <= x_max_die and
                        min_y >= y_min_die and max_y <= y_max_die):
                    n_compliant += 1
            else:
                # AABB fallback
                hw = fp.width_mm / 2.0
                hh = fp.height_mm / 2.0
                if (cx - hw >= x_min_die and cx + hw <= x_max_die and
                        cy - hh >= y_min_die and cy + hh <= y_max_die):
                    n_compliant += 1

        return (n_compliant / n_total) * 100.0 if n_total > 0 else 100.0

    def _score_aesthetics(
        self,
        placements: Dict[str, Tuple[float, float]],
    ) -> float:
        """
        aesthetics_score: uniformity of nearest-neighbour distances.

        Low coefficient-of-variation in NN distances → high score.
        Perfect regular lattice  → CV ≈ 0   → score = 100.
        Completely random layout → CV large  → score → 0.

        Returns 100 for 0 or 1 components (degenerate case).
        """
        n = len(placements)
        if n <= 1:
            return 100.0

        items = list(placements.values())

        # For each component, find its nearest-neighbour distance
        nn_dists: List[float] = []
        for i, (xi, yi) in enumerate(items):
            best = math.inf
            for j, (xj, yj) in enumerate(items):
                if i == j:
                    continue
                d = math.hypot(xi - xj, yi - yj)
                if d < best:
                    best = d
            if best < math.inf:
                nn_dists.append(best)

        if not nn_dists:
            return 100.0

        mean = sum(nn_dists) / len(nn_dists)
        if mean == 0:
            return 100.0

        variance = sum((d - mean) ** 2 for d in nn_dists) / len(nn_dists)
        std = math.sqrt(variance)
        cv = std / mean  # coefficient of variation (0 = perfectly uniform)

        # Map CV to [0, 100]: CV=0 → 100, CV=1 → ~37 (exp decay), CV≥2 → near 0
        score = 100.0 * math.exp(-cv)
        return _clamp(score)
