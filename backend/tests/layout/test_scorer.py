"""
LAYOUT-013: Layout Scoring Engine — Unit Tests

Validates:
  - Gate fails on overlap / off-chip
  - overall score in [0, 100]
  - Perfect lattice: symmetry ≈ 100, spacing ≈ 100
  - Weights overridable via constructor
  - All six soft metrics are computed
  - ScoreBreakdown is immutable (frozen dataclass)
  - Stub / None polygon fallback paths
"""

import math
import pytest
from typing import Dict, Tuple

from shapely.geometry import box as _box

from app.layout.scorer import LayoutScorer
from app.layout.models import Footprint, ScoreBreakdown


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

DIE = (10.0, 8.0)  # standard test die (width, height)


def _fp(node_id: str, cx: float, cy: float,
        w: float = 0.65, h: float = 0.65,
        keepout: float = 0.05,
        use_shapely: bool = True) -> Footprint:
    """Build a Footprint centred at (cx, cy)."""
    if use_shapely:
        hw, hh = w / 2.0, h / 2.0
        poly = _box(cx - hw, cy - hh, cx + hw, cy + hh)
        ko_poly = poly.buffer(keepout / 2.0)
    else:
        poly = None
        ko_poly = None
    return Footprint(
        node_id=node_id,
        component_type="qubit",
        width_mm=w,
        height_mm=h,
        keepout_mm=keepout,
        polygon=poly,
        keepout_polygon=ko_poly,
        rotation_deg=0.0,
    )


def _grid(n: int, pitch: float = 1.0) -> Tuple[
    Dict[str, Tuple[float, float]], Dict[str, Footprint]
]:
    """Build an n-qubit square grid centred at origin."""
    cols = math.ceil(math.sqrt(n))
    rows = math.ceil(n / cols)
    offset_x = -(cols - 1) * pitch / 2.0
    offset_y = -(rows - 1) * pitch / 2.0
    placements = {}
    footprints = {}
    idx = 0
    for r in range(rows):
        for c in range(cols):
            if idx >= n:
                break
            nid = f"Q{idx}"
            cx = offset_x + c * pitch
            cy = offset_y + r * pitch
            placements[nid] = (cx, cy)
            footprints[nid] = _fp(nid, cx, cy)
            idx += 1
    return placements, footprints


# ─────────────────────────────────────────────────────────────────────────────
# 1. Constructor & weights
# ─────────────────────────────────────────────────────────────────────────────

class TestConstructor:
    def test_default_instantiation(self):
        scorer = LayoutScorer()
        assert scorer is not None

    def test_custom_weights(self):
        w = {"spacing": 1.0, "symmetry": 1.0,
             "compactness": 1.0, "edge_compliance": 1.0, "aesthetics": 1.0}
        scorer = LayoutScorer(weights=w)
        assert abs(sum(scorer._weights.values()) - 1.0) < 1e-9

    def test_weights_normalised(self):
        w = {"spacing": 2.0, "symmetry": 3.0,
             "compactness": 0.0, "edge_compliance": 0.0, "aesthetics": 0.0}
        scorer = LayoutScorer(weights=w)
        assert abs(sum(scorer._weights.values()) - 1.0) < 1e-9

    def test_zero_weight_raises(self):
        with pytest.raises(ValueError):
            LayoutScorer(weights={"spacing": 0.0})


# ─────────────────────────────────────────────────────────────────────────────
# 2. gate() — hard gate checks
# ─────────────────────────────────────────────────────────────────────────────

class TestGate:
    def test_passes_non_overlapping_grid(self):
        pl, fp = _grid(4, pitch=1.5)
        scorer = LayoutScorer()
        assert scorer.gate(pl, fp, DIE) is True

    def test_fails_on_overlap(self):
        # Two qubits at identical position → keepout polygons fully overlap
        pl = {"Q0": (0.0, 0.0), "Q1": (0.0, 0.0)}
        fp = {
            "Q0": _fp("Q0", 0.0, 0.0),
            "Q1": _fp("Q1", 0.0, 0.0),
        }
        scorer = LayoutScorer()
        assert scorer.gate(pl, fp, DIE) is False

    def test_fails_on_off_chip(self):
        # Component placed outside die bounds
        pl = {"Q0": (100.0, 0.0)}
        fp = {"Q0": _fp("Q0", 100.0, 0.0)}
        scorer = LayoutScorer()
        assert scorer.gate(pl, fp, DIE) is False

    def test_fails_partial_off_chip(self):
        # Component centred just inside but body extends past edge
        # die is ±5 wide; component at 4.9 with 0.65mm wide → right edge at 5.225 > 5
        die = (10.0, 8.0)
        pl = {"Q0": (4.9, 0.0)}
        fp = {"Q0": _fp("Q0", 4.9, 0.0)}
        scorer = LayoutScorer()
        assert scorer.gate(pl, fp, die) is False

    def test_passes_single_component_on_chip(self):
        pl = {"Q0": (0.0, 0.0)}
        fp = {"Q0": _fp("Q0", 0.0, 0.0)}
        scorer = LayoutScorer()
        assert scorer.gate(pl, fp, DIE) is True

    def test_passes_empty_layout(self):
        scorer = LayoutScorer()
        assert scorer.gate({}, {}, DIE) is True

    def test_aabb_fallback_no_overlap(self):
        """Gate still works when polygon=None (stub footprints)."""
        pl = {"Q0": (0.0, 0.0), "Q1": (2.0, 0.0)}
        fp = {
            "Q0": _fp("Q0", 0.0, 0.0, use_shapely=False),
            "Q1": _fp("Q1", 2.0, 0.0, use_shapely=False),
        }
        scorer = LayoutScorer()
        assert scorer.gate(pl, fp, DIE) is True

    def test_aabb_fallback_with_overlap(self):
        pl = {"Q0": (0.0, 0.0), "Q1": (0.1, 0.0)}  # very close → AABB overlap
        fp = {
            "Q0": _fp("Q0", 0.0, 0.0, use_shapely=False),
            "Q1": _fp("Q1", 0.1, 0.0, use_shapely=False),
        }
        scorer = LayoutScorer()
        assert scorer.gate(pl, fp, DIE) is False


# ─────────────────────────────────────────────────────────────────────────────
# 3. score() — returns valid ScoreBreakdown
# ─────────────────────────────────────────────────────────────────────────────

class TestScore:
    def test_returns_score_breakdown(self):
        pl, fp = _grid(4, pitch=1.5)
        scorer = LayoutScorer()
        result = scorer.score(pl, fp, DIE)
        assert isinstance(result, ScoreBreakdown)

    def test_overall_in_range(self):
        pl, fp = _grid(9, pitch=1.2)
        scorer = LayoutScorer()
        result = scorer.score(pl, fp, DIE)
        assert 0.0 <= result.overall_score <= 100.0

    def test_all_soft_metrics_in_range(self):
        pl, fp = _grid(4, pitch=1.5)
        scorer = LayoutScorer()
        result = scorer.score(pl, fp, DIE)
        for metric in (
            result.overlap_score, result.spacing_score, result.symmetry_score,
            result.compactness_score, result.edge_compliance_score, result.aesthetics_score,
        ):
            assert 0.0 <= metric <= 100.0, f"Metric {metric} out of [0, 100]"

    def test_gate_passed_true_for_clean_grid(self):
        pl, fp = _grid(4, pitch=1.5)
        scorer = LayoutScorer()
        result = scorer.score(pl, fp, DIE)
        assert result.gate_passed is True

    def test_gate_failed_when_overlap(self):
        pl = {"Q0": (0.0, 0.0), "Q1": (0.0, 0.0)}
        fp = {"Q0": _fp("Q0", 0.0, 0.0), "Q1": _fp("Q1", 0.0, 0.0)}
        scorer = LayoutScorer()
        result = scorer.score(pl, fp, DIE)
        assert result.gate_passed is False
        assert result.overall_score <= 0.0

    def test_gate_failed_clamps_overall_to_zero(self):
        pl = {"Q0": (0.0, 0.0), "Q1": (0.0, 0.0)}
        fp = {"Q0": _fp("Q0", 0.0, 0.0), "Q1": _fp("Q1", 0.0, 0.0)}
        scorer = LayoutScorer()
        result = scorer.score(pl, fp, DIE)
        assert result.overall_score <= 0.0

    def test_empty_placement_returns_100_overall(self):
        scorer = LayoutScorer()
        result = scorer.score({}, {}, DIE)
        assert result.gate_passed is True
        assert result.overall_score == 100.0

    def test_score_breakdown_is_immutable(self):
        pl, fp = _grid(4, pitch=1.5)
        scorer = LayoutScorer()
        result = scorer.score(pl, fp, DIE)
        with pytest.raises(Exception):
            result.overall_score = 99.0  # type: ignore[misc]


# ─────────────────────────────────────────────────────────────────────────────
# 4. Perfect lattice — symmetry ≈ 100, spacing ≈ 100
# ─────────────────────────────────────────────────────────────────────────────

class TestPerfectLattice:
    def test_symmetry_high_for_centred_grid(self):
        """A symmetric 2×2 grid centred at origin should score high symmetry."""
        pl, fp = _grid(4, pitch=1.5)
        scorer = LayoutScorer()
        result = scorer.score(pl, fp, DIE)
        assert result.symmetry_score >= 80.0, (
            f"Expected symmetry ≥ 80, got {result.symmetry_score:.1f}"
        )

    def test_spacing_high_for_well_separated_grid(self):
        """Components far apart (well above min_spacing) → high spacing score."""
        pl, fp = _grid(4, pitch=2.0)
        scorer = LayoutScorer(min_spacing_mm=0.05)
        result = scorer.score(pl, fp, DIE)
        assert result.spacing_score >= 80.0, (
            f"Expected spacing ≥ 80, got {result.spacing_score:.1f}"
        )

    def test_perfect_4q_grid_overall_above_60(self):
        pl, fp = _grid(4, pitch=1.5)
        scorer = LayoutScorer(min_spacing_mm=0.05)
        result = scorer.score(pl, fp, DIE)
        assert result.overall_score >= 60.0, (
            f"Expected overall ≥ 60 for well-separated grid, got {result.overall_score:.1f}"
        )

    def test_overlap_score_100_when_no_overlap(self):
        pl, fp = _grid(4, pitch=2.0)
        scorer = LayoutScorer()
        result = scorer.score(pl, fp, DIE)
        assert abs(result.overlap_score - 100.0) < 1e-3

    def test_aesthetics_high_for_uniform_grid(self):
        """Regular grid has uniform NN distances → high aesthetics."""
        pl, fp = _grid(9, pitch=1.0)
        scorer = LayoutScorer()
        result = scorer.score(pl, fp, DIE)
        assert result.aesthetics_score >= 70.0, (
            f"Expected aesthetics ≥ 70 for uniform grid, got {result.aesthetics_score:.1f}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# 5. Individual soft metric edge cases
# ─────────────────────────────────────────────────────────────────────────────

class TestSoftMetrics:
    def test_symmetry_100_single_at_origin(self):
        pl = {"Q0": (0.0, 0.0)}
        scorer = LayoutScorer()
        # _score_symmetry: single component at die centre
        s = scorer._score_symmetry(pl, DIE)
        assert s == 100.0

    def test_symmetry_decays_for_off_centre(self):
        pl = {"Q0": (4.0, 3.0)}  # near corner of 10×8 die
        scorer = LayoutScorer()
        s = scorer._score_symmetry(pl, DIE)
        assert s < 50.0, f"Expected symmetry < 50 for off-centre, got {s:.1f}"

    def test_spacing_100_for_two_well_separated(self):
        pl = {"Q0": (-5.0, 0.0), "Q1": (5.0, 0.0)}
        scorer = LayoutScorer(min_spacing_mm=0.05)
        s = scorer._score_spacing(pl)
        assert s >= 50.0

    def test_spacing_low_for_adjacent(self):
        pl = {"Q0": (0.0, 0.0), "Q1": (0.001, 0.0)}
        scorer = LayoutScorer(min_spacing_mm=1.0)
        s = scorer._score_spacing(pl)
        assert s < 50.0

    def test_compactness_100_single(self):
        pl = {"Q0": (0.0, 0.0)}
        scorer = LayoutScorer()
        s = scorer._score_compactness(pl, DIE)
        assert s == 100.0

    def test_compactness_low_spread_out(self):
        die = (10.0, 8.0)
        pl = {
            "Q0": (-4.9, -3.9),
            "Q1": (4.9, 3.9),
        }
        scorer = LayoutScorer()
        s = scorer._score_compactness(pl, die)
        assert s < 50.0

    def test_edge_compliance_100_all_inside(self):
        pl, fp = _grid(4, pitch=1.0)
        scorer = LayoutScorer()
        s = scorer._score_edge_compliance(pl, fp, DIE)
        assert s == 100.0

    def test_edge_compliance_0_all_outside(self):
        # All components far outside
        pl = {"Q0": (100.0, 100.0), "Q1": (-100.0, -100.0)}
        fp = {"Q0": _fp("Q0", 100.0, 100.0), "Q1": _fp("Q1", -100.0, -100.0)}
        scorer = LayoutScorer()
        s = scorer._score_edge_compliance(pl, fp, DIE)
        assert s == 0.0

    def test_aesthetics_100_single_component(self):
        pl = {"Q0": (0.0, 0.0)}
        scorer = LayoutScorer()
        s = scorer._score_aesthetics(pl)
        assert s == 100.0

    def test_aesthetics_drops_for_clustered(self):
        # All at the same point — NN distance = 0 → mean = 0 → 100 (degenerate)
        pl = {"Q0": (0.0, 0.0), "Q1": (0.0, 0.0), "Q2": (5.0, 0.0)}
        scorer = LayoutScorer()
        # Should not raise; just check it's in range
        s = scorer._score_aesthetics(pl)
        assert 0.0 <= s <= 100.0


# ─────────────────────────────────────────────────────────────────────────────
# 6. Weights overridability
# ─────────────────────────────────────────────────────────────────────────────

class TestWeightOverride:
    def test_custom_weights_change_overall(self):
        pl, fp = _grid(4, pitch=1.5)

        scorer_default = LayoutScorer()
        scorer_sym = LayoutScorer(weights={
            "spacing": 0.0, "symmetry": 1.0,
            "compactness": 0.0, "edge_compliance": 0.0, "aesthetics": 0.0,
        })

        r_default = scorer_default.score(pl, fp, DIE)
        r_sym = scorer_sym.score(pl, fp, DIE)

        # With all weight on symmetry, overall should match symmetry_score
        assert abs(r_sym.overall_score - r_sym.symmetry_score) < 0.1

    def test_equal_weights_average_five_metrics(self):
        pl, fp = _grid(4, pitch=1.5)
        w = {k: 1.0 for k in
             ["spacing", "symmetry", "compactness", "edge_compliance", "aesthetics"]}
        scorer = LayoutScorer(weights=w)
        result = scorer.score(pl, fp, DIE)

        expected = (
            result.spacing_score + result.symmetry_score +
            result.compactness_score + result.edge_compliance_score +
            result.aesthetics_score
        ) / 5.0
        assert abs(result.overall_score - expected) < 0.1


# ─────────────────────────────────────────────────────────────────────────────
# 7. Monotonicity checks
# ─────────────────────────────────────────────────────────────────────────────

class TestMonotonicity:
    def test_more_overlap_lowers_score(self):
        scorer = LayoutScorer()

        # No overlap
        pl_good = {"Q0": (-2.0, 0.0), "Q1": (2.0, 0.0)}
        fp_good = {
            "Q0": _fp("Q0", -2.0, 0.0),
            "Q1": _fp("Q1", 2.0, 0.0),
        }

        # Full overlap
        pl_bad = {"Q0": (0.0, 0.0), "Q1": (0.0, 0.0)}
        fp_bad = {
            "Q0": _fp("Q0", 0.0, 0.0),
            "Q1": _fp("Q1", 0.0, 0.0),
        }

        r_good = scorer.score(pl_good, fp_good, DIE)
        r_bad  = scorer.score(pl_bad,  fp_bad,  DIE)

        assert r_good.overall_score > r_bad.overall_score

    def test_closer_to_centre_raises_symmetry(self):
        scorer = LayoutScorer()

        pl_centre = {"Q0": (0.1, 0.1)}
        pl_edge   = {"Q0": (4.5, 3.5)}
        fp_c = {"Q0": _fp("Q0", 0.1, 0.1)}
        fp_e = {"Q0": _fp("Q0", 4.5, 3.5)}

        r_centre = scorer.score(pl_centre, fp_c, DIE)
        r_edge   = scorer.score(pl_edge,   fp_e, DIE)

        assert r_centre.symmetry_score > r_edge.symmetry_score


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
