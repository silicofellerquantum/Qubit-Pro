# Layout Engine - Phase 1

Automatic component placement system for quantum chip design.

## Status: Complete (Issues LAYOUT-001 through LAYOUT-019)

All components of the Phase 1 Auto Layout Engine are fully implemented, integrated, and passing all unit/integration tests.

## Package Structure

```
layout/
├── __init__.py           # Main exports: LayoutEngine, generate_layout()
├── engine.py             # Layout orchestrator (LAYOUT-014)
├── floorplanner.py       # Template-driven site generation (LAYOUT-009)
├── legalizer.py          # CP-SAT placement solver (LAYOUT-011)
├── overlap_resolver.py   # Geometric fallback (LAYOUT-012)
├── scorer.py             # Quality assessment (LAYOUT-013)
├── footprints.py         # Component geometry (LAYOUT-003)
├── models.py             # Data structures (LAYOUT-002)
├── adapters.py           # Pipeline integration (LAYOUT-014)
├── cpsat_model.py        # OR-tools model builder (LAYOUT-010)
├── constants.py          # Configuration values
└── templates/
    ├── base.py           # ABC + registry (LAYOUT-004)
    ├── square.py         # Square lattice (LAYOUT-005)
    ├── ring.py           # Ring layout (LAYOUT-006)
    ├── heavyhex.py       # IBM Heavy Hex (LAYOUT-007)
    └── vio.py            # Quantware VIO (LAYOUT-008)
```

## Feature Flag

Controlled by `config.layout_engine_v2` (default: `False`)

```python
# In app/config.py
layout_engine_v2: bool = False  # Enable with LAYOUT_ENGINE_V2=true
```

## Implementation Status

| Issue | Component | Status | Description |
|-------|-----------|--------|-------------|
| LAYOUT-001 | Package scaffold | ✅ Complete | Created directory structure, stubs, and package architecture. |
| LAYOUT-002 | Data models | ✅ Complete | Created the 11 immutable dataclasses for layout geometry, scoring, and floorplanning. |
| LAYOUT-003 | Footprint system | ✅ Complete | Converts graph nodes to Shapely geometry & provides ObstacleMap STRtree index. |
| LAYOUT-004 | Template core | ✅ Complete | Abstract base class and template registry for selecting templates based on topology. |
| LAYOUT-005 | Square template | ✅ Complete | Lattice generation layout for square qubit networks. |
| LAYOUT-006 | Ring template | ✅ Complete | Layout algorithm for ring topologies. |
| LAYOUT-007 | Heavy Hex template | ✅ Complete | Layout matching IBM Heavy Hex coupling structures. |
| LAYOUT-008 | VIO template | ✅ Complete | Quantware VIO layout configurations. |
| LAYOUT-009 | Floorplanner | ✅ Complete | Selects template, plans site assignments, emits constraints for secondary components. |
| LAYOUT-010 | CP-SAT model | ✅ Complete | Builds constraints in integer-µm precision (overlaps, snapping, boundaries, snapping). |
| LAYOUT-011 | Legalizer | ✅ Complete | Legalization solver utilizing Google OR-Tools CP-SAT. |
| LAYOUT-012 | Overlap resolver | ✅ Complete | Geometric push-apart fallback system using Shapely. |
| LAYOUT-013 | Scorer | ✅ Complete | Comprehensive 6-dimension layout scoring and hard gate validation. |
| LAYOUT-014 | Engine assembly | ✅ Complete | Integrated pipeline connecting Floorplanner, Legalizer, OverlapResolver, Scorer, and Graph Adapters. |
| LAYOUT-015 | Pipeline integration | ✅ Complete | Wired the Auto Layout Engine into step 4 of the main design pipeline. |
| LAYOUT-016 | DRC alignment | ✅ Complete | Aligned engine clearance metrics with design rule check (DRC) parameters. |
| LAYOUT-017 | Unit tests | ✅ Complete | Full unit testing coverage for layout structures, templates, models, and scoring. |
| LAYOUT-018 | Golden tests | ✅ Complete | Verified layout engine against standard reference designs. |
| LAYOUT-019 | Performance benchmarks | ✅ Complete | Validated that execution times scale within acceptable ranges for different qubit count tiers. |

## LAYOUT-002 Data Models Summary

The package defines 11 immutable dataclasses representing chip layout data:

### Geometry Models
* **Footprint**: Component geometry bounds (`width_mm`, `height_mm`), rotation, and Shapely body and keepout polygons.
* **Obstacle**: Physical keepout obstacles where placement is forbidden.
* **PlacementConstraint**: Explicit rules matching components to specific layout locations (e.g. coordinates, side orientation).

### Scoring Models
* **ScoreBreakdown**: Captures individual quality metrics (spacing, symmetry, compactness, edge compliance, aesthetics) and an overall score.
* **LayoutCandidate**: A complete candidate placement layout solution mapping node IDs to centered coordinates, accompanied by scoring metadata.

### Floorplanning Models
* **Site**: Qubit placement site.
* **Corridor**: Coupler corridor region.
* **Shell**: Resonator placement zone surrounding a qubit.
* **Slot**: Perimeter launchpad slots.
* **Channel**: Feedline routing channels.
* **Floorplan**: Container of all planned sites, corridors, shells, slots, channels, and placement constraints.

## Usage

```python
from app.layout import generate_layout
from app.config import settings

# Enable feature flag
settings.layout_engine_v2 = True

# Generate layout and write coordinates back to design_graph
candidate = generate_layout(design_graph)
print(f"Layout score: {candidate.score.overall_score}/100")
print(f"Gate passed: {candidate.score.gate_passed}")
```

## Testing

```bash
# Run all layout tests
pytest tests/layout/ -v

# Run specific integration test
pytest tests/layout/test_engine.py -v
```

## Architecture Overview

```
User Request
    ↓
design_pipeline.py (Step 4)
    ↓
[layout_engine_v2 flag check]
    ↓
generate_layout()
    ↓
LayoutEngine
    ├─→ Floorplanner (template selection)
    ├─→ PlacementLegalizer (CP-SAT)
    ├─→ OverlapResolver (fallback)
    └─→ LayoutScorer (quality assessment)
    ↓
LayoutCandidate
    ↓
Apply to DesignGraph
    ↓
Continue to routing (route_design)
```
