# Layout Engine - Phase 1

Automatic component placement system for quantum chip design.

## Status: Phase 1 Scaffold (Issues LAYOUT-001 through LAYOUT-019)

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

All modules are currently **stubs** that raise `NotImplementedError`.

| Issue | Component | Status |
|-------|-----------|--------|
| LAYOUT-001 | Package scaffold | ✅ Complete |
| LAYOUT-002 | Data models | 🔲 Pending |
| LAYOUT-003 | Footprint system | 🔲 Pending |
| LAYOUT-004 | Template core | 🔲 Pending |
| LAYOUT-005 | Square template | 🔲 Pending |
| LAYOUT-006 | Ring template | 🔲 Pending |
| LAYOUT-007 | Heavy Hex template | 🔲 Pending |
| LAYOUT-008 | VIO template | 🔲 Pending |
| LAYOUT-009 | Floorplanner | 🔲 Pending |
| LAYOUT-010 | CP-SAT model | 🔲 Pending |
| LAYOUT-011 | Legalizer | 🔲 Pending |
| LAYOUT-012 | Overlap resolver | 🔲 Pending |
| LAYOUT-013 | Scorer | 🔲 Pending |
| LAYOUT-014 | Engine assembly | 🔲 Pending |
| LAYOUT-015 | Pipeline integration | 🔲 Pending |
| LAYOUT-016 | DRC alignment | 🔲 Pending |
| LAYOUT-017 | Unit tests | 🔲 Pending |
| LAYOUT-018 | Golden tests | 🔲 Pending |
| LAYOUT-019 | Performance benchmarks | 🔲 Pending |

## Dependencies

### Phase 1 Required Dependencies
- `shapely>=2.0.0` - Geometric operations (LAYOUT-003)
- `ortools>=9.0.0` - CP-SAT solver (LAYOUT-010)

### Already Available
- `networkx` - Graph algorithms
- `numpy` - Numerical operations

## Usage (Post-Implementation)

```python
from app.layout import generate_layout
from app.config import settings

# Enable feature flag
settings.layout_engine_v2 = True

# Generate layout
candidate = generate_layout(design_graph)
print(f"Layout score: {candidate.score.overall}/100")
print(f"Gate passed: {candidate.score.gate_passed}")
```

## Testing

```bash
# Run all layout tests
pytest tests/layout/ -v

# Run with coverage
pytest tests/layout/ --cov=app/layout --cov-report=term-missing

# Run specific test module
pytest tests/layout/test_imports.py -v
```

## Development Workflow

1. **Branch from main**: `git checkout -b feature/layout-<issue>`
2. **Implement**: Follow technical spec in Plan_Tuesday_B_TEAM.md
3. **Test**: Write unit tests, ensure coverage ≥ 85%
4. **Review**: Get approval from assigned role owner
5. **Merge**: Squash-merge to main after CI green

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

## Configuration Constants

See `constants.py` for:
- CP-SAT solver parameters (timeout, workers, seed)
- Performance targets by N tier
- Default geometric values (pitch, clearance, margin)
- Scoring weights (Phase 1)
- Template priority order

## Exit Criteria (Phase 1)

- [ ] Zero overlaps for all golden designs with flag=True
- [ ] 25Q Heavy Hex: gate_passed=True, overall≥80, symmetry≥85
- [ ] Performance targets met for all N tiers
- [ ] Legacy path (flag=False) produces identical output
- [ ] Unit test coverage ≥85%
- [ ] CI green (lint + pytest + performance)

## Next Steps

See [Plan_Tuesday_B_TEAM.md](../../../Plan_Tuesday_B_TEAM.md) for:
- Detailed technical specifications
- Dependency graph
- Issue breakdown
- Acceptance criteria per issue

## Notes

- All stubs reference pending issue numbers for traceability
- Feature flag defaults to False for safe rollout
- No breaking changes to existing design pipeline
- Routing engine (route_design) remains untouched
