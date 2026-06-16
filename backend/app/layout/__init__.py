"""
Phase 1 Auto Layout Engine for Quantum Chip Design

This package provides automatic component placement for superconducting
quantum chips, eliminating overlaps and producing fabrication-ready layouts.

Main Components:
    - LayoutEngine: Orchestrates template selection, placement, legalization
    - Floorplanner: Template-driven site/corridor/shell generation
    - PlacementLegalizer: CP-SAT-based constraint solving
    - OverlapResolver: Geometric push-apart fallback
    - LayoutScorer: Multi-metric quality assessment

Feature Flag:
    Controlled by config.layout_engine_v2 (default: False)
    When enabled, replaces legacy placement in design_pipeline Step 4

Phase 1 Scope:
    - Template-driven placement (4 templates: Square, Ring, Heavy Hex, VIO)
    - Zero-overlap guarantee
    - Symmetric, fabrication-ready layouts
    - Integration with existing routing pipeline

Author: Silicofeller Quantum Studio Team
Version: 1.0.0-alpha (Phase 1)
"""

from typing import Dict, Any, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.design_graph.graph import DesignGraph

from .models import (
    Footprint,
    Obstacle,
    PlacementConstraint,
    ScoreBreakdown,
    LayoutCandidate,
    Site,
    Corridor,
    Shell,
    Slot,
    Channel,
    Floorplan,
)

from .engine import LayoutEngineImpl as LayoutEngine

# LAYOUT-016: DRC Alignment
from .drc_alignment import (
    get_drc_thresholds,
    validate_scorer_drc_alignment,
    check_graph_alignment,
    log_alignment_check,
)


def generate_layout(
    design_graph: "DesignGraph",
    constraints: Optional[Any] = None,
    config: Optional[Dict[str, Any]] = None
) -> "LayoutCandidate":
    """
    Convenience function to generate and apply layout in one call.
    
    This is the main entry point for the layout system, intended for
    use in design_pipeline.py Step 4 behind the layout_engine_v2 flag.
    
    Args:
        design_graph: DesignGraph instance to layout
        constraints: Optional placement constraints
        config: Optional engine configuration
        
    Returns:
        LayoutCandidate with placement and scores
    """
    engine = LayoutEngine(config)
    candidate = engine.generate(design_graph, constraints)
    engine.apply(candidate, design_graph)
    return candidate


# Public API
__all__ = [
    "LayoutEngine",
    "generate_layout",
    "Footprint",
    "Obstacle",
    "PlacementConstraint",
    "ScoreBreakdown",
    "LayoutCandidate",
    "Site",
    "Corridor",
    "Shell",
    "Slot",
    "Channel",
    "Floorplan",
    # LAYOUT-016: DRC Alignment
    "get_drc_thresholds",
    "validate_scorer_drc_alignment",
    "check_graph_alignment",
    "log_alignment_check",
]

# Version info
__version__ = "1.0.0-alpha"
__phase__ = "Phase 1: Foundation Scaffold"
