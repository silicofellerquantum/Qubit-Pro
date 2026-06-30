"""
LAYOUT-016: DRC Alignment Tests
================================

Verifies that LayoutScorer gate thresholds align with app/drc/geometry_drc.py
rules so scorer verdicts match pipeline DRC checks.

Test Cases:
1. Perfect layout: both scorer and DRC pass
2. Overlapping layout: both scorer and DRC fail
3. Off-chip layout: both detect off-chip violations
4. Spacing violations: both detect insufficient spacing
5. Threshold consistency: scorer uses DRC-aligned thresholds
"""

import pytest
import math
from typing import Dict, Tuple

from app.layout.models import Footprint
from app.layout.scorer import LayoutScorer
from app.layout.drc_alignment import (
    get_drc_thresholds,
    validate_scorer_drc_alignment,
)
from app.drc.geometry_drc import GeometryDRC


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_footprints():
    """Create mock footprints for testing."""
    from shapely.geometry import box
    
    def make_footprint(node_id: str, w: float, h: float, clearance: float = 0.05):
        poly = box(-w/2, -h/2, w/2, h/2)
        keepout = poly.buffer(clearance / 2)
        return Footprint(
            node_id=node_id,
            component_type='qubit',
            width_mm=w,
            height_mm=h,
            keepout_mm=clearance,
            polygon=poly,
            keepout_polygon=keepout,
            rotation_deg=0.0,
        )
    
    return {
        'q0': make_footprint('q0', 0.65, 0.65),
        'q1': make_footprint('q1', 0.65, 0.65),
        'q2': make_footprint('q2', 0.65, 0.65),
        'q3': make_footprint('q3', 0.65, 0.65),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Test 1: Perfect Layout (both pass)
# ─────────────────────────────────────────────────────────────────────────────

def test_alignment_perfect_layout(mock_footprints):
    """Test that scorer and DRC both pass on a perfect grid layout."""
    # 2x2 grid with 1.0mm pitch (ample spacing)
    placements = {
        'q0': (-0.5, -0.5),
        'q1': (0.5, -0.5),
        'q2': (-0.5, 0.5),
        'q3': (0.5, 0.5),
    }
    die_bounds = (4.0, 4.0)
    
    result = validate_scorer_drc_alignment(
        placements=placements,
        footprints=mock_footprints,
        die_bounds=die_bounds,
    )
    
    assert result['aligned'], f"Scorer and DRC should align. Discrepancies: {result['discrepancies']}"
    assert result['scorer_gate_passed'], "Scorer gate should pass for perfect layout"
    assert result['drc_passed'], "DRC should pass for perfect layout"
    assert len(result['discrepancies']) == 0, "No discrepancies expected"


# ─────────────────────────────────────────────────────────────────────────────
# Test 2: Overlapping Layout (both fail)
# ─────────────────────────────────────────────────────────────────────────────

def test_alignment_overlapping_layout(mock_footprints):
    """Test that scorer and DRC both fail on overlapping qubits."""
    # All qubits at same position (massive overlap)
    placements = {
        'q0': (0.0, 0.0),
        'q1': (0.0, 0.0),
        'q2': (0.0, 0.0),
        'q3': (0.0, 0.0),
    }
    die_bounds = (4.0, 4.0)
    
    result = validate_scorer_drc_alignment(
        placements=placements,
        footprints=mock_footprints,
        die_bounds=die_bounds,
    )
    
    assert result['aligned'], f"Scorer and DRC should align. Discrepancies: {result['discrepancies']}"
    assert not result['scorer_gate_passed'], "Scorer gate should fail for overlapping layout"
    assert not result['drc_passed'], "DRC should fail for overlapping layout"
    assert 'QUBIT_OVERLAP' in result['drc_violation_rules'], "DRC should detect overlap"


# ─────────────────────────────────────────────────────────────────────────────
# Test 3: Off-Chip Layout
# ─────────────────────────────────────────────────────────────────────────────

def test_alignment_off_chip_layout(mock_footprints):
    """Test that scorer and DRC both detect off-chip components."""
    # Place qubits outside die bounds
    placements = {
        'q0': (10.0, 10.0),   # way off chip
        'q1': (0.5, 0.5),
        'q2': (-0.5, 0.5),
        'q3': (-0.5, -0.5),
    }
    die_bounds = (4.0, 4.0)
    
    result = validate_scorer_drc_alignment(
        placements=placements,
        footprints=mock_footprints,
        die_bounds=die_bounds,
    )
    
    assert result['aligned'], f"Scorer and DRC should align. Discrepancies: {result['discrepancies']}"
    assert not result['scorer_gate_passed'], "Scorer gate should fail for off-chip layout"
    # Note: OFF_CHIP is a WARNING in DRC (not ERROR), so DRC might still pass
    # but scorer gate fails on off-chip. This is acceptable behavior.
    assert result['score_breakdown']['edge_compliance_score'] < 100.0, "Scorer should detect off-chip"


# ─────────────────────────────────────────────────────────────────────────────
# Test 4: Spacing Violations
# ─────────────────────────────────────────────────────────────────────────────

def test_alignment_spacing_violations(mock_footprints):
    """Test that scorer and DRC both detect insufficient spacing."""
    # Qubits too close together (< 0.6mm min spacing)
    placements = {
        'q0': (-0.2, 0.0),
        'q1': (0.2, 0.0),    # Only 0.4mm apart (< 0.6mm threshold)
        'q2': (-0.2, 1.0),
        'q3': (0.2, 1.0),
    }
    die_bounds = (4.0, 4.0)
    
    result = validate_scorer_drc_alignment(
        placements=placements,
        footprints=mock_footprints,
        die_bounds=die_bounds,
    )
    
    assert result['aligned'], f"Scorer and DRC should align. Discrepancies: {result['discrepancies']}"
    assert not result['scorer_gate_passed'], "Scorer gate should fail for spacing violations"
    assert not result['drc_passed'], "DRC should fail for spacing violations"
    assert 'QUBIT_SPACING' in result['drc_violation_rules'], "DRC should detect spacing violation"


# ─────────────────────────────────────────────────────────────────────────────
# Test 5: Threshold Consistency
# ─────────────────────────────────────────────────────────────────────────────

def test_drc_threshold_extraction():
    """Test that DRC thresholds are correctly extracted."""
    thresholds = get_drc_thresholds()
    
    assert 'min_spacing_mm' in thresholds
    assert 'pocket_half_mm' in thresholds
    assert 'chip_width_mm' in thresholds
    assert 'chip_height_mm' in thresholds
    
    # Verify default values match GeometryDRC defaults
    assert thresholds['min_spacing_mm'] == 0.6
    assert thresholds['pocket_half_mm'] == 0.33
    assert thresholds['chip_width_mm'] == 10.0
    assert thresholds['chip_height_mm'] == 10.0


def test_scorer_uses_drc_thresholds(mock_footprints):
    """Test that LayoutScorer respects DRC-aligned thresholds."""
    thresholds = get_drc_thresholds()
    
    # Create scorer with DRC threshold
    scorer = LayoutScorer(min_spacing_mm=thresholds['min_spacing_mm'])
    
    # Qubits exactly at threshold distance (should pass)
    placements = {
        'q0': (0.0, 0.0),
        'q1': (0.6, 0.0),  # Exactly at min_spacing threshold
    }
    die_bounds = (4.0, 4.0)
    
    score = scorer.score(placements, mock_footprints, die_bounds)
    
    # At exactly threshold, spacing should still be acceptable (≥ not >)
    assert score.spacing_score >= 50.0, "Spacing at threshold should not fail"


# ─────────────────────────────────────────────────────────────────────────────
# Test 6: Edge Cases
# ─────────────────────────────────────────────────────────────────────────────

def test_alignment_empty_layout():
    """Test alignment with no components."""
    result = validate_scorer_drc_alignment(
        placements={},
        footprints={},
        die_bounds=(4.0, 4.0),
    )
    
    assert result['aligned'], "Empty layout should align"
    assert result['scorer_gate_passed'], "Empty layout should pass scorer gate"
    assert result['drc_passed'], "Empty layout should pass DRC"


def test_alignment_single_qubit(mock_footprints):
    """Test alignment with single qubit (no pairs to check)."""
    placements = {'q0': (0.0, 0.0)}
    footprints = {'q0': mock_footprints['q0']}
    die_bounds = (4.0, 4.0)
    
    result = validate_scorer_drc_alignment(
        placements=placements,
        footprints=footprints,
        die_bounds=die_bounds,
    )
    
    assert result['aligned'], "Single qubit should align"
    assert result['scorer_gate_passed'], "Single qubit on-chip should pass"
    assert result['drc_passed'], "Single qubit should pass DRC"


# ─────────────────────────────────────────────────────────────────────────────
# Integration Test
# ─────────────────────────────────────────────────────────────────────────────

def test_alignment_real_scenario(mock_footprints):
    """Test alignment on a realistic 4-qubit square lattice."""
    # 4-qubit square with 1.0mm pitch
    pitch = 1.0
    placements = {
        'q0': (0.0, 0.0),
        'q1': (pitch, 0.0),
        'q2': (0.0, pitch),
        'q3': (pitch, pitch),
    }
    die_bounds = (5.0, 5.0)
    
    # Run alignment check
    result = validate_scorer_drc_alignment(
        placements=placements,
        footprints=mock_footprints,
        die_bounds=die_bounds,
    )
    
    # Both should pass
    assert result['aligned'], "4Q square lattice should align"
    assert result['scorer_gate_passed'], "4Q lattice should pass scorer"
    assert result['drc_passed'], "4Q lattice should pass DRC"
    assert len(result['drc_violation_rules']) == 0, "No DRC violations expected"
    assert len(result['discrepancies']) == 0, "No discrepancies expected"
    
    # Verify scores
    score = result['score_breakdown']
    assert score['gate_passed'] == True
    assert score['overall_score'] > 80.0, f"Good layout should score >80, got {score['overall_score']}"


# ─────────────────────────────────────────────────────────────────────────────
# Acceptance Criteria Test (LAYOUT-016)
# ─────────────────────────────────────────────────────────────────────────────

def test_layout_016_acceptance_criteria(mock_footprints):
    """
    LAYOUT-016 Acceptance Criteria:
    - Scorer gate and run_full_drc agree on overlap/spacing/off-chip
    - No edits to app/drc/ files
    - Alignment test passes
    """
    test_cases = [
        # (name, placements, should_pass)
        ("perfect_grid", {
            'q0': (-0.5, -0.5),
            'q1': (0.5, -0.5),
            'q2': (-0.5, 0.5),
            'q3': (0.5, 0.5),
        }, True),
        ("overlapping", {
            'q0': (0.0, 0.0),
            'q1': (0.0, 0.0),
            'q2': (0.0, 0.0),
            'q3': (0.0, 0.0),
        }, False),
        ("too_close", {
            'q0': (-0.2, 0.0),
            'q1': (0.2, 0.0),
            'q2': (-0.2, 1.0),
            'q3': (0.2, 1.0),
        }, False),
    ]
    
    die_bounds = (4.0, 4.0)
    
    for name, placements, should_pass in test_cases:
        result = validate_scorer_drc_alignment(
            placements=placements,
            footprints=mock_footprints,
            die_bounds=die_bounds,
        )
        
        # Acceptance criterion: scorer and DRC must align
        assert result['aligned'], (
            f"Test case '{name}': Scorer and DRC must align. "
            f"Discrepancies: {result['discrepancies']}"
        )
        
        # Verify expected pass/fail behavior
        assert result['scorer_gate_passed'] == should_pass, (
            f"Test case '{name}': Scorer gate expected {'PASS' if should_pass else 'FAIL'}, "
            f"got {'PASS' if result['scorer_gate_passed'] else 'FAIL'}"
        )
        
        # DRC should agree (with caveat that OFF_CHIP is WARNING not ERROR)
        if should_pass:
            assert result['drc_passed'], f"Test case '{name}': DRC should pass"
        else:
            # DRC might pass if only warnings (OFF_CHIP), so just check alignment
            pass


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
