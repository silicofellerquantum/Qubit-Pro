# Quick Start Guide: Phase 1 Auto Layout Engine

## 🎯 Overview

All 16 layouts from `Plan_Tuesday_B_TEAM.md` are now complete, including:
- ✅ LAYOUT-015: Pipeline Integration (NEW)
- ✅ LAYOUT-016: DRC Alignment (NEW)

## 🚀 Enable the New Layout Engine

### Method 1: Environment Variable (Recommended)
```bash
# Windows (CMD)
set LAYOUT_ENGINE_V2=true

# Windows (PowerShell)
$env:LAYOUT_ENGINE_V2="true"

# Linux/Mac
export LAYOUT_ENGINE_V2=true
```

### Method 2: .env File
```ini
# backend/.env
LAYOUT_ENGINE_V2=true
```

### Method 3: Python Code
```python
from app.config import settings
settings.layout_engine_v2 = True
```

## 🧪 Testing

### 1. Verify Installation
```bash
cd backend
python -c "from app.layout import generate_layout; print('✅ Layout engine ready')"
```

### 2. Run DRC Alignment Tests
```bash
pytest tests/layout/test_drc_alignment.py -v
```

### 3. Run All Layout Tests
```bash
pytest tests/layout/ -v
```

### 4. Test with Feature Flag Enabled
```bash
# Windows PowerShell
$env:LAYOUT_ENGINE_V2="true"
pytest tests/layout/ -v

# Linux/Mac
LAYOUT_ENGINE_V2=true pytest tests/layout/ -v
```

## 📊 Usage Examples

### Example 1: Generate Layout for a 9-Qubit Grid
```python
from app.layout import generate_layout
from app.constraints.constraints import DesignConstraints
from app.constraints.builder import build_graph_from_constraints

# Create constraints
constraints = DesignConstraints(
    qubit_count=9,
    topology="grid",
    substrate="silicon",
    metal="niobium",
)

# Build design graph
graph = build_graph_from_constraints(constraints)

# Generate layout
layout_candidate = generate_layout(graph, constraints)

# Check results
print(f"✅ Layout generated using: {layout_candidate.template_name}")
print(f"📊 Overall score: {layout_candidate.score.overall_score:.1f}/100")
print(f"🚦 Gate passed: {layout_candidate.score.gate_passed}")
print(f"⏱️  Generation time: {layout_candidate.generation_time_sec:.3f}s")

# View score breakdown
score = layout_candidate.score
print(f"\n📈 Score Breakdown:")
print(f"  Overlap: {score.overlap_score:.1f}")
print(f"  Spacing: {score.spacing_score:.1f}")
print(f"  Symmetry: {score.symmetry_score:.1f}")
print(f"  Compactness: {score.compactness_score:.1f}")
print(f"  Edge compliance: {score.edge_compliance_score:.1f}")
print(f"  Aesthetics: {score.aesthetics_score:.1f}")
```

### Example 2: Check DRC Alignment
```python
from app.layout import check_graph_alignment

# Validate scorer/DRC alignment
result = check_graph_alignment(graph, constraints)

if result['aligned']:
    print("✅ Scorer and DRC agree")
    print(f"   Both verdict: {'PASS' if result['scorer_gate_passed'] else 'FAIL'}")
else:
    print("⚠️  Discrepancies detected:")
    for disc in result['discrepancies']:
        print(f"   - {disc}")

# View DRC violations (if any)
if result['drc_violation_rules']:
    print(f"\n🚨 DRC Violations: {', '.join(result['drc_violation_rules'])}")
```

### Example 3: Test All Templates
```python
from app.layout import generate_layout
from app.constraints.constraints import DesignConstraints
from app.constraints.builder import build_graph_from_constraints

topologies = ["grid", "line", "ring", "heavyhex"]

for topology in topologies:
    constraints = DesignConstraints(
        qubit_count=9,
        topology=topology,
        substrate="silicon",
        metal="niobium",
    )
    
    graph = build_graph_from_constraints(constraints)
    layout = generate_layout(graph, constraints)
    
    print(f"{topology:10s}: score={layout.score.overall_score:5.1f}, "
          f"gate={'✅' if layout.score.gate_passed else '❌'}, "
          f"template={layout.template_name}")
```

## 🔍 Verify Implementation Status

### Check Feature Flag
```python
from app.config import settings
print(f"Layout engine v2: {settings.layout_engine_v2}")
```

### Check Available Templates
```python
from app.layout.templates.registry import get_available_templates
templates = get_available_templates()
print(f"Available templates: {templates}")
```

### Check DRC Thresholds
```python
from app.layout import get_drc_thresholds

thresholds = get_drc_thresholds()
print(f"Min spacing: {thresholds['min_spacing_mm']} mm")
print(f"Pocket half-size: {thresholds['pocket_half_mm']} mm")
print(f"Die size: {thresholds['chip_width_mm']} x {thresholds['chip_height_mm']} mm")
```

## 📁 File Locations

### Implementation Files
```
backend/app/layout/
├── drc_alignment.py          # LAYOUT-016 (NEW)
├── engine.py                 # LAYOUT-014 (Modified for LAYOUT-016)
├── __init__.py               # Exports (Updated)
└── ... (other layout files)

backend/app/services/
└── design_pipeline.py        # LAYOUT-015 (Modified)

backend/tests/layout/
└── test_drc_alignment.py     # LAYOUT-016 tests (NEW)
```

### Documentation
```
LAYOUT_VERIFICATION_REPORT.md      # Detailed verification (16/16 complete)
LAYOUT_IMPLEMENTATION_SUMMARY.md   # Implementation summary
QUICK_START_LAYOUT.md              # This file
Plan_Tuesday_B_TEAM.md             # Original specification
```

## 🎯 Feature Flag Behavior

### When `LAYOUT_ENGINE_V2=true` (New Path)
- Uses template-driven placement
- CP-SAT legalization with OverlapResolver fallback
- Multi-metric quality scoring
- DRC alignment validation
- Attaches `layout_quality` to result

### When `LAYOUT_ENGINE_V2=false` (Legacy Path)
- Uses original Kamada-Kawai placement
- Legacy coordinate assignment
- No layout scoring
- Byte-identical to pre-Phase-1 output

### Fallback Behavior
If the new engine fails (exception), automatically falls back to legacy path with warning log.

## 📊 Score Interpretation

### Overall Score (0-100)
- **90-100:** Excellent layout, production-ready
- **80-89:** Good layout, minor improvements possible
- **70-79:** Acceptable layout, some optimization needed
- **60-69:** Fair layout, significant improvements recommended
- **< 60:** Poor layout, regenerate or adjust constraints

### Gate Status
- **✅ Passed:** No overlaps, all components on-chip
- **❌ Failed:** Has overlaps or off-chip components (not fabrication-ready)

## 🐛 Troubleshooting

### Import Error: `ModuleNotFoundError: No module named 'app.layout'`
```bash
# Ensure you're in the backend directory
cd backend
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
```

### OR-tools Not Installed
```bash
pip install ortools
```

### Shapely Not Installed
```bash
pip install shapely
```

### Feature Flag Not Working
```python
# Verify flag is set
from app.config import settings
print(settings.layout_engine_v2)  # Should be True

# Force enable in code
settings.layout_engine_v2 = True
```

### DRC Alignment Warnings in Logs
```
⚠️  LAYOUT-016: Scorer/DRC alignment mismatch detected...
```
This is informational only (non-blocking). Review discrepancies and verify layout meets requirements.

## 📚 Further Reading

- **Full Specification:** `Plan_Tuesday_B_TEAM.md`
- **Verification Report:** `LAYOUT_VERIFICATION_REPORT.md`
- **Implementation Details:** `LAYOUT_IMPLEMENTATION_SUMMARY.md`
- **Layout README:** `backend/app/layout/README.md`

## ✅ Verification Checklist

Before deploying to production:

- [ ] All imports work: `python -c "from app.layout import generate_layout"`
- [ ] Tests pass: `pytest tests/layout/test_drc_alignment.py -v`
- [ ] Feature flag works: Test both `True` and `False` states
- [ ] DRC alignment verified: No persistent warnings
- [ ] Golden designs tested: 5Q line, 9Q grid, 25Q heavy-hex
- [ ] Performance targets met: See `LAYOUT_IMPLEMENTATION_SUMMARY.md`

---

**Status:** ✅ Phase 1 Complete (16/16 deliverables)  
**Version:** 1.0.0-alpha  
**Date:** June 16, 2026
