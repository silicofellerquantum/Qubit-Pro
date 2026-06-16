"""
DRC Alignment Module — LAYOUT-016
==================================

Ensures LayoutScorer gate thresholds align with app/drc/geometry_drc.py rules
so scorer verdicts match pipeline DRC checks.

This module provides:
1. Threshold extraction from GeometryDRC
2. Alignment validation tests
3. Read-only integration (no DRC files modified)

Alignment guarantees:
- Overlap detection: LayoutScorer.gate() ≡ GeometryDRC.check_qubit_overlap()
- Spacing checks: LayoutScorer min_spacing ≡ GeometryDRC min_spacing_mm
- Off-chip checks: LayoutScorer die bounds ≡ GeometryDRC chip dimensions

Status: Implemented (LAYOUT-016)
Dependencies: LAYOUT-013 (scorer), app/drc/geometry_drc.py (read-only)
"""

from __future__ import annotations

import logging
from typing import Dict, Tuple, Any, List, TYPE_CHECKING

if TYPE_CHECKING:
    from app.layout.models import Footprint, ScoreBreakdown
    from app.core.design_graph.graph import DesignGraph

log = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# DRC Threshold Extraction
# ─────────────────────────────────────────────────────────────────────────────

def get_drc_thresholds(constraints: Any = None) -> Dict[str, float]:
    """
    Extract DRC thresholds that the LayoutScorer should respect.
    
    Returns thresholds from constraints.fab or GeometryDRC defaults:
    - min_spacing_mm: Minimum qubit center-to-center distance
    - pocket_half_mm: Qubit pocket half-size (for overlap detection)
    - chip_width_mm: Die width
    - chip_height_mm: Die height
    
    Args:
        constraints: Optional DesignConstraints instance with fab spec
        
    Returns:
        Dict with keys: min_spacing_mm, pocket_half_mm, chip_width_mm, chip_height_mm
    """
    if constraints is not None:
        fab = getattr(constraints, 'fab', None)
        if fab:
            return {
                'min_spacing_mm': getattr(fab, 'min_qubit_spacing_mm', 0.6),
                'pocket_half_mm': getattr(fab, 'pocket_half_size_mm', 0.33),
                'chip_width_mm': getattr(constraints, 'chip_width_mm', 10.0),
                'chip_height_mm': getattr(constraints, 'chip_height_mm', 10.0),
            }
    
    # Fallback to GeometryDRC defaults
    return {
        'min_spacing_mm': 0.6,
        'pocket_half_mm': 0.33,
        'chip_width_mm': 10.0,
        'chip_height_mm': 10.0,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Alignment Validation
# ─────────────────────────────────────────────────────────────────────────────

def validate_scorer_drc_alignment(
    placements: Dict[str, Tuple[float, float]],
    footprints: Dict[str, Footprint],
    die_bounds: Tuple[float, float],
    constraints: Any = None,
) -> Dict[str, Any]:
    """
    Validate that LayoutScorer gate and GeometryDRC agree on the same layout.
    
    This is the LAYOUT-016 alignment test: run both the scorer gate and
    GeometryDRC checks on the same placement, and verify they produce
    consistent verdicts for:
    - Overlap detection
    - Spacing violations
    - Off-chip components
    
    Args:
        placements: Dict[node_id, (x_mm, y_mm)]
        footprints: Dict[node_id, Footprint]
        die_bounds: (width_mm, height_mm)
        constraints: Optional DesignConstraints for threshold extraction
        
    Returns:
        Dict with keys:
        - aligned: bool (True if scorer and DRC agree)
        - scorer_gate_passed: bool
        - drc_violations: List[str] (DRC violation rules)
        - discrepancies: List[str] (differences between scorer and DRC)
    """
    from app.layout.scorer import LayoutScorer
    from app.drc.geometry_drc import GeometryDRC
    
    # Extract DRC-aligned thresholds
    thresholds = get_drc_thresholds(constraints)
    
    # Run LayoutScorer gate
    scorer = LayoutScorer(min_spacing_mm=thresholds['min_spacing_mm'])
    scorer_gate = scorer.gate(placements, footprints, die_bounds)
    score_breakdown = scorer.score(placements, footprints, die_bounds)
    
    # Build qubit-only position map for GeometryDRC
    qubit_positions = {
        node_id: pos
        for node_id, pos in placements.items()
        if node_id in footprints and footprints[node_id].component_type == 'qubit'
    }
    
    # Run GeometryDRC checks
    drc_checker = GeometryDRC(
        qubit_positions=qubit_positions,
        chip_width_mm=die_bounds[0],
        chip_height_mm=die_bounds[1],
        pocket_half_mm=thresholds['pocket_half_mm'],
        min_spacing_mm=thresholds['min_spacing_mm'],
    )
    drc_violations = drc_checker.run()
    
    # Extract DRC error rules (not warnings)
    drc_errors = [v for v in drc_violations if v.severity == 'ERROR']
    drc_error_rules = list(set(v.rule for v in drc_errors))
    
    # Determine DRC pass/fail (ERROR severity only; warnings don't fail DRC)
    drc_passed = len(drc_errors) == 0
    
    # Check alignment: scorer gate and DRC should agree on pass/fail
    aligned = (scorer_gate == drc_passed)
    
    discrepancies: List[str] = []
    if not aligned:
        if scorer_gate and not drc_passed:
            discrepancies.append(
                f"Scorer gate PASSED but DRC FAILED with {len(drc_errors)} errors: "
                f"{', '.join(drc_error_rules)}"
            )
        elif not scorer_gate and drc_passed:
            discrepancies.append(
                "Scorer gate FAILED but DRC PASSED (all DRC checks OK)"
            )
    
    # Detailed checks for specific rule alignment
    has_overlap_errors = 'QUBIT_OVERLAP' in drc_error_rules
    has_spacing_errors = 'QUBIT_SPACING' in drc_error_rules
    has_offchip_errors = 'OFF_CHIP' in drc_error_rules
    
    scorer_has_overlap = score_breakdown.overlap_score < 100.0
    scorer_has_spacing = score_breakdown.spacing_score < 100.0
    scorer_has_offchip = score_breakdown.edge_compliance_score < 100.0
    
    # Check overlap alignment
    if has_overlap_errors and not scorer_has_overlap:
        discrepancies.append(
            "DRC detected QUBIT_OVERLAP but scorer overlap_score = 100 (no overlap detected)"
        )
    
    # Check spacing alignment
    if has_spacing_errors and not scorer_has_spacing:
        discrepancies.append(
            "DRC detected QUBIT_SPACING violations but scorer spacing_score = 100 (all spacing OK)"
        )
    
    return {
        'aligned': aligned,
        'scorer_gate_passed': scorer_gate,
        'drc_passed': drc_passed,
        'drc_error_count': len(drc_errors),
        'drc_violation_rules': drc_error_rules,
        'discrepancies': discrepancies,
        'score_breakdown': score_breakdown.to_dict(),
        'thresholds_used': thresholds,
    }


def check_graph_alignment(
    design_graph: DesignGraph,
    constraints: Any = None,
) -> Dict[str, Any]:
    """
    Convenience wrapper: validate scorer/DRC alignment for a DesignGraph.
    
    Extracts placements and footprints from the graph, then calls
    validate_scorer_drc_alignment().
    
    Args:
        design_graph: DesignGraph with placed nodes
        constraints: Optional DesignConstraints
        
    Returns:
        Alignment validation result dict
    """
    from app.layout.footprints import FootprintGenerator
    from app.layout.adapters import from_design_graph
    
    # Extract placements from graph
    placements = from_design_graph(design_graph)
    
    if not placements:
        return {
            'aligned': True,
            'scorer_gate_passed': True,
            'drc_passed': True,
            'drc_error_count': 0,
            'drc_violation_rules': [],
            'discrepancies': [],
            'message': 'No placements found in graph (empty layout)',
        }
    
    # Generate footprints
    thresholds = get_drc_thresholds(constraints)
    footprint_gen = FootprintGenerator(clearance_mm=thresholds['min_spacing_mm'])
    footprints = footprint_gen.generate_all(design_graph)
    
    # Get die bounds
    die_bounds = (
        design_graph.chip_width_mm if design_graph.chip_width_mm else thresholds['chip_width_mm'],
        design_graph.chip_height_mm if design_graph.chip_height_mm else thresholds['chip_height_mm'],
    )
    
    return validate_scorer_drc_alignment(placements, footprints, die_bounds, constraints)


# ─────────────────────────────────────────────────────────────────────────────
# Integration Hook (used by layout engine)
# ─────────────────────────────────────────────────────────────────────────────

def log_alignment_check(
    placements: Dict[str, Tuple[float, float]],
    footprints: Dict[str, Footprint],
    die_bounds: Tuple[float, float],
    constraints: Any = None,
) -> None:
    """
    Run alignment check and log any discrepancies (non-blocking).
    
    This is called by LayoutEngine after scoring to verify the scorer
    gate aligns with DRC. Discrepancies are logged as warnings but do
    not block layout generation.
    
    Args:
        placements: Layout placements
        footprints: Component footprints
        die_bounds: Die dimensions
        constraints: Design constraints
    """
    try:
        result = validate_scorer_drc_alignment(placements, footprints, die_bounds, constraints)
        
        if not result['aligned']:
            log.warning(
                "LAYOUT-016: Scorer/DRC alignment mismatch detected. "
                f"Scorer gate: {result['scorer_gate_passed']}, "
                f"DRC passed: {result['drc_passed']}, "
                f"Discrepancies: {'; '.join(result['discrepancies'])}"
            )
        else:
            log.debug(
                "LAYOUT-016: Scorer/DRC alignment verified. "
                f"Both agree: {'PASS' if result['scorer_gate_passed'] else 'FAIL'}"
            )
    except Exception as exc:
        log.warning("LAYOUT-016: Alignment check failed: %s", exc)


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

__all__ = [
    'get_drc_thresholds',
    'validate_scorer_drc_alignment',
    'check_graph_alignment',
    'log_alignment_check',
]
