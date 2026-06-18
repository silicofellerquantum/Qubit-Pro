#!/usr/bin/env bash
# create-layout-issues.sh
# One-shot script to create all GitHub artifacts for Phase 1 Layout Foundation.
# Run: chmod +x scripts/create-layout-issues.sh && ./scripts/create-layout-issues.sh
# Requires: gh CLI authenticated with repo write access.

set -euo pipefail

REPO="silicofellerquantum/Qubit-Pro"
echo "=== Creating GitHub artifacts for Phase 1 Layout Foundation ==="
echo "Repo: $REPO"
echo ""

# ── 1. Labels ───────────────────────────────────────────────────────────────
echo "[1/23] Creating labels..."

gh label create layout        --repo "$REPO" --color "5319E7" --description "Auto-layout engine work" 2>/dev/null || true
gh label create placement     --repo "$REPO" --color "0E8A16" --description "Component placement and floorplanning" 2>/dev/null || true
gh label create routing       --repo "$REPO" --color "B60205" --description "CPW/resonator/feedline routing" 2>/dev/null || true
gh label create template      --repo "$REPO" --color "FEF2C0" --description "Chip architecture templates" 2>/dev/null || true
gh label create physics       --repo "$REPO" --color "1D76DB" --description "Physics grounding and validation" 2>/dev/null || true
gh label create cp-sat        --repo "$REPO" --color "5319E7" --description "OR-tools CP-SAT solver integration" 2>/dev/null || true
gh label create scoring       --repo "$REPO" --color "FF7619" --description "Layout quality scoring" 2>/dev/null || true
gh label create testing       --repo "$REPO" --color "0E8A16" --description "Test suite and validation" 2>/dev/null || true
gh label create performance   --repo "$REPO" --color "B60205" --description "Performance benchmarks" 2>/dev/null || true
gh label create backend       --repo "$REPO" --color "0052CC" --description "Backend Python services" 2>/dev/null || true
gh label create frontend      --repo "$REPO" --color "5319E7" --description "Frontend React/TypeScript" 2>/dev/null || true
gh label create infra         --repo "$REPO" --color "666666" --description "Infrastructure CI/CD DevOps" 2>/dev/null || true
gh label create high-priority --repo "$REPO" --color "B60205" --description "P0 blocking" 2>/dev/null || true
gh label create medium-priority --repo "$REPO" --color "FBCA04" --description "P1 important" 2>/dev/null || true
gh label create blocked       --repo "$REPO" --color "000000" --description "Waiting on dependencies" 2>/dev/null || true
gh label create ready         --repo "$REPO" --color "0E8A16" --description "Ready for development" 2>/dev/null || true
gh label create review        --repo "$REPO" --color "5319E7" --description "In code review" 2>/dev/null || true
gh label create epic          --repo "$REPO" --color "C2E0C6" --description "Epic tracking issue" 2>/dev/null || true
gh label create phase-1       --repo "$REPO" --color "D4C5F9" --description "Phase 1 deliverable" 2>/dev/null || true

echo "Labels created."

# ── 2. Milestone ────────────────────────────────────────────────────────────
echo "[2/23] Creating milestone..."

MILESTONE_TITLE="Phase 1 – Auto Layout Foundation"

# Create milestone if it doesn't exist
gh api repos/$REPO/milestones \
  -f title="$MILESTONE_TITLE" \
  -f state=open \
  -f description="Deliver template-driven, CP-SAT-legalized, shapely-footprint placement engine. Target: zero overlaps, template-driven placement, design quality scoring, integration behind layout_engine_v2 flag." \
  -f due_on="2026-07-31T23:59:59Z" 2>/dev/null || true

echo "Milestone: $MILESTONE_TITLE"

# ── 3. Epic ─────────────────────────────────────────────────────────────────
echo "[3/23] Creating Epic issue..."

EPIC_BODY='## Objective

Build the first production-grade automatic layout engine for Silicofeller Quantum Studio — a template-driven, CP-SAT-legalized, shapely-footprint placement system (backend/app/layout/) that eliminates component overlaps and produces symmetric, fabrication-ready layouts, integrated behind the layout_engine_v2 feature flag.

## Scope

**In scope (Phase 1):**
- New backend/app/layout/ package
- Template system: IBM Heavy Hex, Quantware VIO, Square Lattice, Ring
- CP-SAT placement legalization (OR-tools)
- Shapely footprint & obstacle map
- Tiered layout scoring (0–100) with hard overlap gate
- Feature-flagged integration into run_design_pipeline Step 4
- Full test suite: unit, golden designs, performance benchmarks

**Out of scope (Phase 1):**
- Routing engine (Phase 2)
- Multi-candidate background refinement (Phase 2)
- Async job infrastructure
- Frontend layout viewer changes

## Deliverables

| # | Deliverable | Issue |
|---|---|---|
| 1 | Layout package scaffold + feature flag | LAYOUT-001 |
| 2 | Geometry data models | LAYOUT-002 |
| 3 | Footprint system + ObstacleMap | LAYOUT-003 |
| 4 | Template engine core (ABC + registry) | LAYOUT-004 |
| 5 | Square Lattice template | LAYOUT-005 |
| 6 | Ring template | LAYOUT-006 |
| 7 | IBM Heavy Hex template | LAYOUT-007 |
| 8 | Quantware VIO template | LAYOUT-008 |
| 9 | Floorplanner | LAYOUT-009 |
| 10 | CP-SAT constraint model | LAYOUT-010 |
| 11 | Placement legalizer | LAYOUT-011 |
| 12 | Overlap resolver | LAYOUT-012 |
| 13 | Layout scoring engine | LAYOUT-013 |
| 14 | Layout engine assembly + adapters | LAYOUT-014 |
| 15 | DesignGraph pipeline integration | LAYOUT-015 |
| 16 | DRC alignment | LAYOUT-016 |
| 17 | Unit test suite | LAYOUT-017 |
| 18 | Golden design tests | LAYOUT-018 |
| 19 | Performance benchmarks | LAYOUT-019 |

## Risks

| Risk | Mitigation |
|---|---|
| CP-SAT infeasible at large N | Cap at CPSAT_MAX_COMPONENTS=120; fall back to OverlapResolver |
| Background-refine race vs user edits | Feature flag stays False until golden + perf suites pass |
| Footprint accuracy vs live Qiskit Metal | Seed registry from catalog; validate against worker render |
| design_pipeline.py merge conflicts | LAYOUT-015 single-owner, merges last |

## Exit Criteria

- [ ] layout_engine_v2=True → zero pocket overlaps for all golden designs
- [ ] 25Q IBM Heavy Hex: gate_passed=True, overall ≥ 80, symmetry ≥ 85
- [ ] All N tiers within performance targets (≤16Q < 0.5s, 17–49Q < 1.5s, 50–120Q < 3.0s, >120Q < 2.0s)
- [ ] layout_engine_v2=False → byte-identical legacy output
- [ ] Unit test coverage ≥ 85% on app/layout/
- [ ] CI green'

EPIC_URL=$(gh issue create --repo "$REPO" \
  --title "EPIC-LAYOUT-FOUNDATION: Phase 1 Auto Layout Engine" \
  --label "layout,epic,phase-1,backend" \
  --body "$EPIC_BODY" 2>/dev/null || echo "")

echo "Epic created: $EPIC_URL"

# ── 4. Issues LAYOUT-001 .. LAYOUT-007 ──────────────────────────────────────
echo ""
echo "[SKIP] LAYOUT-001 already exists"
# echo "[4/23 Creating LAYOUT-001: Layout Package Scaffold..."
gh issue create --repo "$REPO" --title "LAYOUT-001: Layout Package Scaffold" \
  --label "layout,backend,phase-1,high-priority" \
  --milestone "$MILESTONE_TITLE" \
  --body "## Description
Create the backend/app/layout/ package and core interfaces. Add the layout_engine_v2 feature flag to config.py. This is the foundational PR that every subsequent layout issue branches from.

## Acceptance Criteria
- [ ] backend/app/layout/ package created with all module stubs
- [ ] __init__.py exports LayoutEngine, generate_layout()
- [ ] layout_engine_v2: bool = False added to app/config.py (env-overridable)
- [ ] All modules import without error (no logic required yet)
- [ ] backend/tests/layout/ directory created

## Definition of Done
- CI green (imports only)
- PR approved by Infrastructure Engineer + Backend Engineer
- Merged to main

## Dependencies
None

## Suggested Branch
feature/layout-scaffold

## Estimated Effort
Small (1–2 days)

## Assigned Role
Infrastructure Engineer"

echo "[5/23] Creating LAYOUT-002: Geometry Data Models..."
gh issue create --repo "$REPO" --title "LAYOUT-002: Geometry Data Models" \
  --label "layout,geometry,phase-1,high-priority" \
  --milestone "$MILESTONE_TITLE" \
  --body "## Description
Implement all dataclasses: Footprint, Obstacle, PlacementConstraint, ScoreBreakdown, LayoutCandidate, Site, Corridor, Shell, Slot, Channel, Floorplan. All fields per technical specification. Include to_dict() for serialization.

## Acceptance Criteria
- [ ] All dataclasses defined with correct field types
- [ ] Immutable where sensible (frozen=True or similar)
- [ ] Serialization round-trip tested
- [ ] No behavior logic (data only)

## Definition of Done
- All models pass unit tests
- PR approved by Backend Engineer
- Merged to main

## Dependencies
LAYOUT-001

## Suggested Branch
feature/layout-models

## Estimated Effort
Small (2 days)

## Assigned Role
Backend Engineer"

echo "[6/23] Creating LAYOUT-003: Footprint System + ObstacleMap..."
gh issue create --repo "$REPO" --title "LAYOUT-003: Footprint System + ObstacleMap" \
  --label "layout,geometry,phase-1,high-priority" \
  --milestone "$MILESTONE_TITLE" \
  --body "## Description
Build node-to-shapely polygon converters for all component kinds (qubit, coupler, resonator, feedline, launchpad). Implement keep-out buffering and the ObstacleMap using shapely STRtree for spatial queries.

## Acceptance Criteria
- [ ] Polygon extents match node fields (µm → mm conversion correct)
- [ ] Rotation via shapely.affinity.rotate verified
- [ ] Keep-out buffer = clearance_mm/2
- [ ] ObstacleMap.collides() and .intersection_area() correct
- [ ] Unit tests pass

## Definition of Done
- All footprint tests green
- PR approved by CAD Engineer + Backend Engineer
- Merged to main

## Dependencies
LAYOUT-002

## Suggested Branch
feature/layout-footprint-system

## Estimated Effort
Medium (3–4 days)

## Assigned Role
CAD Engineer"

echo "[7/23] Creating LAYOUT-004: Template Engine Core..."
gh issue create --repo "$REPO" --title "LAYOUT-004: Template Engine Core" \
  --label "layout,template,phase-1,high-priority" \
  --milestone "$MILESTONE_TITLE" \
  --body "## Description
Implement the Template ABC, Site/Corridor/Shell/Slot/Channel dataclasses, TEMPLATE_REGISTRY, and select_template() selection logic. Selection key: (topology, n, intent_keywords, io_budget).

## Acceptance Criteria
- [ ] Template ABC with required methods defined
- [ ] TEMPLATE_REGISTRY populated
- [ ] select_template() maps topology/N/keywords/IO → template with fallback chain
- [ ] Selection unit-tested

## Definition of Done
- Template selection tests pass
- PR approved by Backend Engineer + Physics Engineer
- Merged to main

## Dependencies
LAYOUT-002

## Suggested Branch
feature/layout-template-engine

## Estimated Effort
Medium (3 days)

## Assigned Role
Backend Engineer"

echo "[8/23] Creating LAYOUT-005: Template: Square Lattice..."
gh issue create --repo "$REPO" --title "LAYOUT-005: Template: Square Lattice" \
  --label "layout,template,phase-1,medium-priority" \
  --milestone "$MILESTONE_TITLE" \
  --body "## Description
Implement SquareLatticeTemplate — rows×cols site grid, H/V coupler corridors, launchpad slots, feedline channel, D4 symmetry.

## Acceptance Criteria
- [ ] sites(n, pitch) returns exactly n sites with row-major ordering
- [ ] Minimum pairwise site distance ≥ pitch
- [ ] Die size scales monotonically with N
- [ ] Symmetry residual ≈ 0 for bare lattice
- [ ] Unit tests pass

## Definition of Done
- Template tests green
- PR approved by CAD Engineer + Physics Engineer
- Merged to main

## Dependencies
LAYOUT-004

## Suggested Branch
feature/layout-template-square

## Estimated Effort
Medium (3–4 days)

## Assigned Role
Physics Engineer"

echo "[9/23] Creating LAYOUT-006: Template: Ring..."
gh issue create --repo "$REPO" --title "LAYOUT-006: Template: Ring" \
  --label "layout,template,phase-1,medium-priority" \
  --milestone "$MILESTONE_TITLE" \
  --body "## Description
Implement RingTemplate — N sites equally spaced on a circle, tangential orientation, ring corridors, cyclic symmetry.

## Acceptance Criteria
- [ ] Equal angular spacing: 2πi/n
- [ ] Radius = n·pitch/(2π) (or equivalent)
- [ ] Zero overlap at target pitch
- [ ] Unit tests pass

## Definition of Done
- Template tests green
- PR approved by CAD Engineer
- Merged to main

## Dependencies
LAYOUT-004

## Suggested Branch
feature/layout-template-ring

## Estimated Effort
Small (2 days)

## Assigned Role
Physics Engineer"

echo "[11/23] Creating LAYOUT-008: Template: Quantware VIO..."
gh issue create --repo "$REPO" --title "LAYOUT-008: Template: Quantware VIO" \
  --label "layout,template,phase-1,medium-priority" \
  --milestone "$MILESTONE_TITLE" \
  --body "## Description
Implement QuantwareVIOTemplate — central compact qubit array + full-perimeter launchpad ring for flip-chip/vertical-IO designs. D4 symmetry.

## Acceptance Criteria
- [ ] Launchpads on all 4 edges of the die
- [ ] Core array zero-overlap at target pitch
- [ ] Unit tests pass

## Definition of Done
- Template tests green
- PR approved by CAD Engineer + Physics Engineer
- Merged to main

## Dependencies
LAYOUT-004

## Suggested Branch
feature/layout-template-vio

## Estimated Effort
Medium (3–4 days)

## Assigned Role
Physics Engineer"

echo "[12/23] Creating LAYOUT-009: Floorplanner..."
gh issue create --repo "$REPO" --title "LAYOUT-009: Floorplanner" \
  --label "layout,placement,phase-1,high-priority" \
  --milestone "$MILESTONE_TITLE" \
  --body "## Description
Implement Floorplanner.plan() — template selection, pitch + die sizing, site/shell/corridor/slot/channel generation, and PlacementConstraint emission for all secondary components.

## Acceptance Criteria
- [ ] pitch ≥ max_footprint_extent + clearance
- [ ] Die size grows with N (not fixed 9×6 mm)
- [ ] Constraints emitted for every secondary component
- [ ] Resonator shells feedline-facing
- [ ] Unit tests pass

## Definition of Done
- Floorplanner tests green
- PR approved by CAD Engineer + Backend Engineer
- Merged to main

## Dependencies
LAYOUT-003, LAYOUT-004, LAYOUT-005

## Suggested Branch
feature/layout-floorplanner

## Estimated Effort
Large (5–6 days)

## Assigned Role
CAD Engineer"

echo "[13/23] Creating LAYOUT-010: CP-SAT Constraint Model..."
gh issue create --repo "$REPO" --title "LAYOUT-010: CP-SAT Constraint Model" \
  --label "layout,cp-sat,phase-1,high-priority" \
  --milestone "$MILESTONE_TITLE" \
  --body "## Description
Implement cpsat_model.py — build integer variables, interval variables, AddNoOverlap2D, attachment/corridor/perimeter/feedline constraints, and linear objective using OR-tools CP-SAT.

## Acceptance Criteria
- [ ] Integer-µm variables for all movable components
- [ ] AddNoOverlap2D over all keep-out intervals
- [ ] Attachment, corridor, perimeter, feedline constraints per spec
- [ ] Linear objective: minimize attachment distance + corridor centering
- [ ] Solver params: max_time=2s, 8 workers, fixed seed
- [ ] Unit tests pass

## Definition of Done
- CP-SAT model builds and solves on sample inputs
- PR approved by Backend Engineer + CAD Engineer
- Merged to main

## Dependencies
LAYOUT-003

## Suggested Branch
feature/layout-cpsat

## Estimated Effort
Large (5–7 days)

## Assigned Role
Backend Engineer"

echo "[14/23] Creating LAYOUT-011: Placement Legalizer..."
gh issue create --repo "$REPO" --title "LAYOUT-011: Placement Legalizer" \
  --label "layout,cp-sat,phase-1,high-priority" \
  --milestone "$MILESTONE_TITLE" \
  --body "## Description
Implement PlacementLegalizer.legalize() — invoke CP-SAT model, decode solution to coords, applicability gate (CPSAT_MAX_COMPONENTS), and LegalizationInfeasible exception handling.

## Acceptance Criteria
- [ ] Zero-overlap legal coords on feasible small instances
- [ ] Attachment/corridor/perimeter constraints honored
- [ ] Raises LegalizationInfeasible on UNSAT/timeout
- [ ] is_applicable() gates by component count
- [ ] Deterministic with fixed seed
- [ ] Unit tests pass

## Definition of Done
- Legalizer tests green
- PR approved by Backend Engineer + CAD Engineer
- Merged to main

## Dependencies
LAYOUT-010

## Suggested Branch
feature/layout-legalizer

## Estimated Effort
Medium (3–4 days)

## Assigned Role
Backend Engineer"

echo "[15/23] Creating LAYOUT-012: Overlap Resolver..."
gh issue create --repo "$REPO" --title "LAYOUT-012: Overlap Resolver" \
  --label "layout,placement,phase-1,high-priority" \
  --milestone "$MILESTONE_TITLE" \
  --body "## Description
Implement OverlapResolver.resolve() — shapely push-apart separation for all components, die clamping, large-N fallback, and mandatory final zero-overlap guarantee pass.

## Acceptance Criteria
- [ ] Zero intersection within max_iters on seeded colliding inputs
- [ ] All coords stay within die bounds
- [ ] Idempotent on already-legal input
- [ ] Unit tests pass

## Definition of Done
- Overlap resolver tests green
- PR approved by CAD Engineer + Backend Engineer
- Merged to main

## Dependencies
LAYOUT-003

## Suggested Branch
feature/layout-overlap-resolver

## Estimated Effort
Medium (3–4 days)

## Assigned Role
CAD Engineer"

echo "[16/23] Creating LAYOUT-013: Layout Scoring Engine..."
gh issue create --repo "$REPO" --title "LAYOUT-013: Layout Scoring Engine" \
  --label "layout,scoring,phase-1,high-priority" \
  --milestone "$MILESTONE_TITLE" \
  --body "## Description
Implement LayoutScorer.score() and .gate() — tiered model (hard gate + weighted soft), 6 metrics (overlap, spacing, symmetry, compactness, edge_compliance, aesthetics), Phase-1 weights.

## Acceptance Criteria
- [ ] Gate fails on overlap/off-chip
- [ ] overall score in [0,100]
- [ ] Perfect lattice: symmetry ≈ 100, spacing ≈ 100
- [ ] Weights overridable via constructor
- [ ] Unit tests pass

## Definition of Done
- Scorer tests green
- PR approved by Backend Engineer + CAD Engineer
- Merged to main

## Dependencies
LAYOUT-003

## Suggested Branch
feature/layout-scoring

## Estimated Effort
Medium (3–4 days)

## Assigned Role
Backend Engineer"

echo "[17/23] Creating LAYOUT-014: Layout Engine Assembly + Adapters..."
gh issue create --repo "$REPO" --title "LAYOUT-014: Layout Engine Assembly + Adapters" \
  --label "layout,backend,phase-1,high-priority" \
  --milestone "$MILESTONE_TITLE" \
  --body "## Description
Implement LayoutEngine.generate(), .apply(), .to_placement_dict() — orchestrate floorplan → assign → legalize → resolve → score. Also adapters.py for graph write-back and frontend placement_dict.

## Acceptance Criteria
- [ ] End-to-end LayoutCandidate produced from DesignGraph
- [ ] Coordinates written back to graph nodes
- [ ] placement_dict matches legacy shape {solver, qubits[], edges[]}
- [ ] Deterministic with fixed seed
- [ ] Unit tests pass

## Definition of Done
- Engine tests green
- PR approved by Backend Engineer + CAD Engineer + Physics Engineer
- Merged to main

## Dependencies
LAYOUT-009, LAYOUT-011, LAYOUT-012, LAYOUT-013

## Suggested Branch
feature/layout-engine

## Estimated Effort
Large (5–6 days)

## Assigned Role
Backend Engineer"

echo "[18/23] Creating LAYOUT-015: DesignGraph Pipeline Integration..."
gh issue create --repo "$REPO" --title "LAYOUT-015: DesignGraph Pipeline Integration" \
  --label "layout,integration,backend,phase-1,high-priority" \
  --milestone "$MILESTONE_TITLE" \
  --body "## Description
Wire LayoutEngine into run_design_pipeline Step 4 behind layout_engine_v2 flag. Skip legacy place_qubits + _assign_secondary_coords when enabled. Attach layout_quality to result. Legacy path untouched.

## Acceptance Criteria
- [ ] Flag ON → new path, zero overlaps in design doc
- [ ] Flag OFF → byte-identical legacy output
- [ ] Routing (route_design), DRC, compiler untouched
- [ ] Integration test passes

## Definition of Done
- Integration tests green for both flag states
- PR approved by all CODEOWNERS teams (platform, design-synth, physics, qiskit-metal)
- Merged to main

## Dependencies
LAYOUT-014

## Suggested Branch
feature/layout-integration

## Estimated Effort
Medium (3–4 days)

## Assigned Role
Backend Engineer"

echo "[19/23] Creating LAYOUT-016: DRC Integration (Read-Only Gate Alignment)..."
gh issue create --repo "$REPO" --title "LAYOUT-016: DRC Integration (Read-Only Gate Alignment)" \
  --label "layout,drc,phase-1,medium-priority" \
  --milestone "$MILESTONE_TITLE" \
  --body "## Description
Ensure LayoutScorer gate thresholds reuse app/drc/geometry_drc rules so scorer verdicts match pipeline DRC. Add alignment test. No DRC files modified.

## Acceptance Criteria
- [ ] Scorer gate and run_full_drc agree on overlap/spacing/off-chip for sample designs
- [ ] No edits to app/drc/ files
- [ ] Alignment test passes

## Definition of Done
- Alignment tests green
- PR approved by Physics Engineer + Backend Engineer
- Merged to main

## Dependencies
LAYOUT-013

## Suggested Branch
feature/layout-drc-alignment

## Estimated Effort
Small (1–2 days)

## Assigned Role
Physics Engineer"

echo "[20/23] Creating LAYOUT-017: Unit Test Suite..."
gh issue create --repo "$REPO" --title "LAYOUT-017: Unit Test Suite" \
  --label "layout,testing,phase-1,medium-priority" \
  --milestone "$MILESTONE_TITLE" \
  --body "## Description
Complete and raise coverage across all layout modules. Target ≥ 85% coverage on app/layout/.

## Acceptance Criteria
- [ ] Unit tests for templates, footprints, floorplanner, legalizer, overlap, scorer, engine
- [ ] ≥ 85% line coverage on app/layout/
- [ ] All tests green in CI

## Definition of Done
- Coverage report generated and verified
- PR approved by QA Engineer + Backend Engineer
- Merged to main

## Dependencies
LAYOUT-014

## Suggested Branch
feature/layout-unit-tests

## Estimated Effort
Medium (3–4 days)

## Assigned Role
QA Engineer"

echo "[21/23] Creating LAYOUT-018: Golden Design Tests..."
gh issue create --repo "$REPO" --title "LAYOUT-018: Golden Design Tests" \
  --label "layout,testing,phase-1,high-priority" \
  --milestone "$MILESTONE_TITLE" \
  --body "## Description
Implement golden design matrix: 5Q line, 9Q square, 8Q ring, 25Q heavy-hex, 49Q square, 16Q VIO. Assert zero overlap, on-chip, gate pass, score thresholds.

## Acceptance Criteria
- [ ] All 6 golden designs pass invariants
- [ ] 25Q heavy-hex: overall ≥ 80, symmetry ≥ 85
- [ ] 49Q square: die scaled with N, zero overlap

## Definition of Done
- Golden tests green in CI
- PR approved by QA Engineer + Physics Engineer
- Merged to main

## Dependencies
LAYOUT-014

## Suggested Branch
feature/layout-golden-tests

## Estimated Effort
Medium (3–4 days)

## Assigned Role
QA Engineer"

echo "[22/23] Creating LAYOUT-019: Performance Benchmarks..."
gh issue create --repo "$REPO" --title "LAYOUT-019: Performance Benchmarks" \
  --label "layout,performance,phase-1,medium-priority" \
  --milestone "$MILESTONE_TITLE" \
  --body "## Description
Benchmark fast-draft wall-times across N tiers. Assert CP-SAT cap + OverlapResolver fallback behavior.

## Acceptance Criteria
- [ ] ≤16Q < 0.5s
- [ ] 17–49Q < 1.5s
- [ ] 50–120Q < 3.0s
- [ ] >120Q < 2.0s
- [ ] Zero-overlap guarantee holds at every size
- [ ] Report emitted

## Definition of Done
- Benchmark report generated
- All tiers within targets
- PR approved by Backend Engineer + QA Engineer
- Merged to main

## Dependencies
LAYOUT-014

## Suggested Branch
feature/layout-perf-benchmarks

## Estimated Effort
Small (2 days)

## Assigned Role
QA Engineer"

echo ""
echo "=== All 23 GitHub artifacts created ==="
echo ""
echo "Next steps for your team:"
echo "  1. Run: chmod +x scripts/create-layout-issues.sh && ./scripts/create-layout-issues.sh"
echo "  2. Verify all issues appear under milestone 'Phase 1 – Auto Layout Foundation'"
echo "  3. Set up GitHub Project board with columns: Backlog | Ready | In Progress | Review | Testing | Done"
echo "  4. Assign issues to developers based on role assignments above"
echo "  5. Wave 1-3 can start immediately (parallel tracks)"
echo ""
echo "Parallelization summary:"
echo "  Wave 1: LAYOUT-001 (scaffold)"
echo "  Wave 2: LAYOUT-002 (models)"
echo "  Wave 3: LAYOUT-003, 004, 005, 006, 007, 008, 010, 012, 013 (7 parallel agents max)"
echo "  Wave 4: LAYOUT-009, 011, 016"
echo "  Wave 5: LAYOUT-014 → 015, 017, 018, 019"
echo ""
echo "Done."

