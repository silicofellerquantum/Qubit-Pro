## 3. Epic (Create as Issue #1, then convert to Epic manually or label as epic)

```bash
gh issue create --repo silicofellerquantum/Qubit-Pro \
  --title "EPIC-LAYOUT-FOUNDATION: Phase 1 Auto Layout Engine" \
  --label "layout,epic,phase-1,backend" \
  --body "## Objective

Build the first production-grade automatic layout engine for Silicofeller Quantum Studio — a template-driven, CP-SAT-legalized, shapely-footprint placement system (backend/app/layout/) that eliminates component overlaps and produces symmetric, fabrication-ready layouts for all generated quantum chip components, integrated behind the layout_engine_v2 feature flag with the existing routing pipeline (route_design) left untouched.

## Scope

In scope (Phase 1):
- New backend/app/layout/ package (engine, floorplanner, legalizer, overlap resolver, scorer, footprints, models, adapters, 4 templates)
- Template system: IBM Heavy Hex, Quantware VIO, Square Lattice, Ring
- CP-SAT placement legalization (OR-tools) for secondary components
- Shapely footprint & obstacle map for all node kinds
- Tiered layout scoring (0–100) with hard overlap gate
- Feature-flagged integration into run_design_pipeline Step 4
- Full test suite: unit, golden designs, performance benchmarks

Out of scope (Phase 1):
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
| Footprint accuracy vs live Qiskit Metal geometry | Seed registry from catalog; validate against worker render |
| design_pipeline.py merge conflicts (3-team ownership) | LAYOUT-015 is single-owner, merges last after validation |

## Exit Criteria

- [ ] layout_engine_v2=True → zero pocket overlaps and all components on-chip for all golden designs
- [ ] 25Q IBM Heavy Hex layout: gate_passed=True, overall ≥ 80, symmetry ≥ 85
- [ ] All N tiers within performance targets (≤16Q < 0.5s, 17–49Q < 1.5s, 50–120Q < 3.0s, >120Q < 2.0s)
- [ ] layout_engine_v2=False → output byte-identical to legacy path
- [ ] Unit test coverage ≥ 85% on app/layout/
- [ ] CI green (lint + pytest + performance assertions)"
```

---

## 4. All GitHub Issues (LAYOUT-001..019)

Below are all 19 issues in GitHub issue markdown format. Run with `gh issue create --repo silicofellerquantum/Qubit-Pro --title "..." --label "..." --body "..."` or bulk-import.

---

### LAYOUT-001 · Layout Package Scaffold

**Title:** `LAYOUT-001: Layout Package Scaffold`

**Description:**
Create the `backend/app/layout/` package and core interfaces. Add the `layout_engine_v2` feature flag to `config.py`. This is the foundational PR that every subsequent layout issue branches from.

**Acceptance Criteria:**
- [ ] `backend/app/layout/` package created with all module stubs
- [ ] [__init__.py](cci:7://file:///Users/manannarang/Downloads/studio-main/backend/app/drc/__init__.py:0:0-0:0) exports `LayoutEngine`, `generate_layout()`
- [ ] `layout_engine_v2: bool = False` added to `app/config.py` (env-overridable)
- [ ] All modules import without error (no logic required yet)
- [ ] `backend/tests/layout/` directory created

**Definition of Done:**
- CI green (imports only)
- PR approved by Backend Engineer + CAD Engineer
- Merged to `main`

**Dependencies:** None

**Labels:** `layout`, `backend`, `phase-1`, `high-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-scaffold`

**Estimated Effort:** Small (1–2 days)

**Assigned Role:** Infrastructure Engineer

---

### LAYOUT-002 · Geometry Data Models

**Title:** `LAYOUT-002: Geometry Data Models`

**Description:**
Implement all dataclasses: `Footprint`, `Obstacle`, `PlacementConstraint`, `ScoreBreakdown`, `LayoutCandidate`, `Site`, `Corridor`, `Shell`, `Slot`, `Channel`, `Floorplan`. All fields per technical specification §3. Include [to_dict()](cci:1://file:///Users/manannarang/Downloads/studio-main/backend/app/core/design_graph/node.py:72:4-83:9) for serialization.

**Acceptance Criteria:**
- [ ] All dataclasses defined with correct field types
- [ ] Immutable where sensible (`frozen=True` or similar)
- [ ] Serialization round-trip tested
- [ ] No behavior logic (data only)

**Definition of Done:**
- All models pass unit tests
- PR approved by Backend Engineer
- Merged to `main`

**Dependencies:** LAYOUT-001

**Labels:** `layout`, `geometry`, `phase-1`, `high-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-models`

**Estimated Effort:** Small (2 days)

**Assigned Role:** Backend Engineer

---

### LAYOUT-003 · Footprint System + ObstacleMap

**Title:** `LAYOUT-003: Footprint System + ObstacleMap`

**Description:**
Build node-to-shapely polygon converters for all component kinds (qubit, coupler, resonator, feedline, launchpad). Implement keep-out buffering and the `ObstacleMap` using shapely STRtree for spatial queries.

**Acceptance Criteria:**
- [ ] Polygon extents match node fields (µm → mm conversion correct)
- [ ] Rotation via `shapely.affinity.rotate` verified
- [ ] Keep-out buffer = clearance_mm/2
- [ ] `ObstacleMap.collides()` and `.intersection_area()` correct
- [ ] Unit tests pass

**Definition of Done:**
- All footprint tests green
- PR approved by CAD Engineer + Backend Engineer
- Merged to `main`

**Dependencies:** LAYOUT-002

**Labels:** `layout`, `geometry`, `phase-1`, `high-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-footprint-system`

**Estimated Effort:** Medium (3–4 days)

**Assigned Role:** CAD Engineer

---

### LAYOUT-004 · Template Engine Core

**Title:** `LAYOUT-004: Template Engine Core`

**Description:**
Implement the `Template` ABC, `Site/Corridor/Shell/Slot/Channel` dataclasses, `TEMPLATE_REGISTRY`, and `select_template()` selection logic. Selection key: `(topology, n, intent_keywords, io_budget)`.

**Acceptance Criteria:**
- [ ] `Template` ABC with required methods defined
- [ ] `TEMPLATE_REGISTRY` populated
- [ ] `select_template()` maps topology/N/keywords/IO → template with fallback chain
- [ ] Selection unit-tested

**Definition of Done:**
- Template selection tests pass
- PR approved by Backend Engineer + Physics Engineer
- Merged to `main`

**Dependencies:** LAYOUT-002

**Labels:** `layout`, `template`, `phase-1`, `high-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-template-engine`

**Estimated Effort:** Medium (3 days)

**Assigned Role:** Backend Engineer

---

### LAYOUT-005 · Template: Square Lattice

**Title:** `LAYOUT-005: Template: Square Lattice`

**Description:**
Implement `SquareLatticeTemplate` — rows×cols site grid, H/V coupler corridors, launchpad slots, feedline channel, D4 symmetry.

**Acceptance Criteria:**
- [ ] `sites(n, pitch)` returns exactly `n` sites with row-major ordering
- [ ] Minimum pairwise site distance ≥ pitch
- [ ] Die size scales monotonically with N
- [ ] Symmetry residual ≈ 0 for bare lattice
- [ ] Unit tests pass

**Definition of Done:**
- Template tests green
- PR approved by CAD Engineer + Physics Engineer
- Merged to `main`

**Dependencies:** LAYOUT-004

**Labels:** `layout`, `template`, `phase-1`, `medium-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-template-square`

**Estimated Effort:** Medium (3–4 days)

**Assigned Role:** Physics Engineer

---

### LAYOUT-006 · Template: Ring

**Title:** `LAYOUT-006: Template: Ring`

**Description:**
Implement `RingTemplate` — N sites equally spaced on a circle, tangential orientation, ring corridors, cyclic symmetry.

**Acceptance Criteria:**
- [ ] Equal angular spacing: `2πi/n`
- [ ] Radius = `n·pitch/(2π)` (or equivalent)
- [ ] Zero overlap at target pitch
- [ ] Unit tests pass

**Definition of Done:**
- Template tests green
- PR approved by CAD Engineer
- Merged to `main`

**Dependencies:** LAYOUT-004

**Labels:** `layout`, `template`, `phase-1`, `medium-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-template-ring`

**Estimated Effort:** Small (2 days)

**Assigned Role:** Physics Engineer

---

### LAYOUT-007 · Template: IBM Heavy Hex

**Title:** `LAYOUT-007: Template: IBM Heavy Hex`

**Description:**
Implement `HeavyHexTemplate` — heavy-hexagon lattice with data qubits on vertices and ancilla on edges. Brick-wall row layout, hex-edge corridors, vertical reflection symmetry.

**Acceptance Criteria:**
- [ ] Valid heavy-hex coordinates for all N (including 25Q)
- [ ] Degree ≤ 3 corridor structure
- [ ] Zero overlap at target pitch
- [ ] Unit tests pass

**Definition of Done:**
- Template tests green including 25Q golden design
- PR approved by CAD Engineer + Physics Engineer
- Merged to `main`

**Dependencies:** LAYOUT-004

**Labels:** `layout`, `template`, `phase-1`, `high-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-template-heavyhex`

**Estimated Effort:** Large (5–7 days)

**Assigned Role:** Physics Engineer

---

### LAYOUT-008 · Template: Quantware VIO

**Title:** `LAYOUT-008: Template: Quantware VIO`

**Description:**
Implement `QuantwareVIOTemplate` — central compact qubit array + full-perimeter launchpad ring for flip-chip/vertical-IO designs. D4 symmetry.

**Acceptance Criteria:**
- [ ] Launchpads on all 4 edges of the die
- [ ] Core array zero-overlap at target pitch
- [ ] Unit tests pass

**Definition of Done:**
- Template tests green
- PR approved by CAD Engineer + Physics Engineer
- Merged to `main`

**Dependencies:** LAYOUT-004

**Labels:** `layout`, `template`, `phase-1`, `medium-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-template-vio`

**Estimated Effort:** Medium (3–4 days)

**Assigned Role:** Physics Engineer

---

### LAYOUT-009 · Floorplanner

**Title:** `LAYOUT-009: Floorplanner`

**Description:**
Implement `Floorplanner.plan()` — template selection, pitch + die sizing, site/shell/corridor/slot/channel generation, and `PlacementConstraint` emission for all secondary components.

**Acceptance Criteria:**
- [ ] `pitch ≥ max_footprint_extent + clearance`
- [ ] Die size grows with N (not fixed 9×6 mm)
- [ ] Constraints emitted for every secondary component
- [ ] Resonator shells feedline-facing
- [ ] Unit tests pass

**Definition of Done:**
- Floorplanner tests green
- PR approved by CAD Engineer + Backend Engineer
- Merged to `main`

**Dependencies:** LAYOUT-003, LAYOUT-004, LAYOUT-005 (at least one template)

**Labels:** `layout`, `placement`, `phase-1`, `high-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-floorplanner`

**Estimated Effort:** Large (5–6 days)

**Assigned Role:** CAD Engineer

---

### LAYOUT-010 · CP-SAT Constraint Model

**Title:** `LAYOUT-010: CP-SAT Constraint Model`

**Description:**
Implement `cpsat_model.py` — build integer variables, interval variables, `AddNoOverlap2D`, attachment/corridor/perimeter/feedline constraints, and linear objective using OR-tools CP-SAT.

**Acceptance Criteria:**
- [ ] Integer-µm variables for all movable components
- [ ] `AddNoOverlap2D` over all keep-out intervals
- [ ] Attachment, corridor, perimeter, feedline constraints per spec §6
- [ ] Linear objective: minimize attachment distance + corridor centering
- [ ] Solver params: max_time=2s, 8 workers, fixed seed
- [ ] Unit tests pass

**Definition of Done:**
- CP-SAT model builds and solves on sample inputs
- PR approved by Backend Engineer + CAD Engineer
- Merged to `main`

**Dependencies:** LAYOUT-003

**Labels:** `layout`, `cp-sat`, `phase-1`, `high-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-cpsat`

**Estimated Effort:** Large (5–7 days)

**Assigned Role:** Backend Engineer

---

### LAYOUT-011 · Placement Legalizer

**Title:** `LAYOUT-011: Placement Legalizer`

**Description:**
Implement `PlacementLegalizer.legalize()` — invoke CP-SAT model, decode solution to coords, applicability gate (`CPSAT_MAX_COMPONENTS`), and `LegalizationInfeasible` exception handling.

**Acceptance Criteria:**
- [ ] Zero-overlap legal coords on feasible small instances
- [ ] Attachment/corridor/perimeter constraints honored
- [ ] Raises `LegalizationInfeasible` on UNSAT/timeout
- [ ] `is_applicable()` gates by component count
- [ ] Deterministic with fixed seed
- [ ] Unit tests pass

**Definition of Done:**
- Legalizer tests green
- PR approved by Backend Engineer + CAD Engineer
- Merged to `main`

**Dependencies:** LAYOUT-010

**Labels:** `layout`, `cp-sat`, `phase-1`, `high-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-legalizer`

**Estimated Effort:** Medium (3–4 days)

**Assigned Role:** Backend Engineer

---

### LAYOUT-012 · Overlap Resolver

**Title:** `LAYOUT-012: Overlap Resolver`

**Description:**
Implement `OverlapResolver.resolve()` — shapely push-apart separation for all components, die clamping, large-N fallback, and mandatory final zero-overlap guarantee pass.

**Acceptance Criteria:**
- [ ] Zero intersection within `max_iters` on seeded colliding inputs
- [ ] All coords stay within die bounds
- [ ] Idempotent on already-legal input
- [ ] Unit tests pass

**Definition of Done:**
- Overlap resolver tests green
- PR approved by CAD Engineer + Backend Engineer
- Merged to `main`

**Dependencies:** LAYOUT-003

**Labels:** `layout`, `placement`, `phase-1`, `high-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-overlap-resolver`

**Estimated Effort:** Medium (3–4 days)

**Assigned Role:** CAD Engineer

---

### LAYOUT-013 · Layout Scoring Engine

**Title:** `LAYOUT-013: Layout Scoring Engine`

**Description:**
Implement `LayoutScorer.score()` and `.gate()` — tiered model (hard gate + weighted soft), 6 metrics (overlap, spacing, symmetry, compactness, edge_compliance, aesthetics), Phase-1 weights.

**Acceptance Criteria:**
- [ ] Gate fails on overlap/off-chip
- [ ] `overall` score in [0,100]
- [ ] Perfect lattice: symmetry ≈ 100, spacing ≈ 100
- [ ] Weights overridable via constructor
- [ ] Unit tests pass

**Definition of Done:**
- Scorer tests green
- PR approved by Backend Engineer + CAD Engineer
- Merged to `main`

**Dependencies:** LAYOUT-003

**Labels:** `layout`, `scoring`, `phase-1`, `high-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-scoring`

**Estimated Effort:** Medium (3–4 days)

**Assigned Role:** Backend Engineer

---

### LAYOUT-014 · Layout Engine Assembly + Adapters

**Title:** `LAYOUT-014: Layout Engine Assembly + Adapters`

**Description:**
Implement `LayoutEngine.generate()`, `.apply()`, `.to_placement_dict()` — orchestrate floorplan → assign → legalize → resolve → score. Also `adapters.py` for graph write-back and frontend placement_dict.

**Acceptance Criteria:**
- [ ] End-to-end `LayoutCandidate` produced from DesignGraph
- [ ] Coordinates written back to graph nodes
- [ ] `placement_dict` matches legacy shape `{solver, qubits[], edges[]}`
- [ ] Deterministic with fixed seed
- [ ] Unit tests pass

**Definition of Done:**
- Engine tests green
- PR approved by Backend Engineer + CAD Engineer + Physics Engineer
- Merged to `main`

**Dependencies:** LAYOUT-009, LAYOUT-011, LAYOUT-012, LAYOUT-013

**Labels:** `layout`, `backend`, `phase-1`, `high-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-engine`

**Estimated Effort:** Large (5–6 days)

**Assigned Role:** Backend Engineer

---

### LAYOUT-015 · DesignGraph Pipeline Integration

**Title:** `LAYOUT-015: DesignGraph Pipeline Integration`

**Description:**
Wire `LayoutEngine` into [run_design_pipeline](cci:1://file:///Users/manannarang/Downloads/studio-main/backend/app/services/design_pipeline.py:42:0-260:17) Step 4 behind `layout_engine_v2` flag. Skip legacy [place_qubits](cci:1://file:///Users/manannarang/Downloads/studio-main/backend/app/services/physics/topology_router.py:294:0-363:5) + [_assign_secondary_coords](cci:1://file:///Users/manannarang/Downloads/studio-main/backend/app/services/design_pipeline.py:363:0-460:47) when enabled. Attach `layout_quality` to result. Legacy path untouched.

**Acceptance Criteria:**
- [ ] Flag ON → new path, zero overlaps in `design` doc
- [ ] Flag OFF → byte-identical legacy output
- [ ] Routing (`route_design`), DRC, compiler untouched
- [ ] Integration test passes

**Definition of Done:**
- Integration tests green for both flag states
- PR approved by all CODEOWNERS teams (platform, design-synth, physics, qiskit-metal)
- Merged to `main`

**Dependencies:** LAYOUT-014

**Labels:** `layout`, `integration`, `backend`, `phase-1`, `high-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-integration`

**Estimated Effort:** Medium (3–4 days)

**Assigned Role:** Backend Engineer

---

### LAYOUT-016 · DRC Integration (Read-Only Gate Alignment)

**Title:** `LAYOUT-016: DRC Integration (Read-Only Gate Alignment)`

**Description:**
Ensure `LayoutScorer` gate thresholds reuse `app/drc/geometry_drc` rules so scorer verdicts match pipeline DRC. Add alignment test. No DRC files modified.

**Acceptance Criteria:**
- [ ] Scorer gate and [run_full_drc](cci:1://file:///Users/manannarang/Downloads/studio-main/backend/app/drc/runner.py:18:0-112:43) agree on overlap/spacing/off-chip for sample designs
- [ ] No edits to [app/drc/](cci:9://file:///Users/manannarang/Downloads/studio-main/backend/app/drc:0:0-0:0) files
- [ ] Alignment test passes

**Definition of Done:**
- Alignment tests green
- PR approved by Physics Engineer + Backend Engineer
- Merged to `main`

**Dependencies:** LAYOUT-013

**Labels:** `layout`, [drc](cci:9://file:///Users/manannarang/Downloads/studio-main/backend/app/drc:0:0-0:0), `phase-1`, `medium-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-drc-alignment`

**Estimated Effort:** Small (1–2 days)

**Assigned Role:** Physics Engineer

---

### LAYOUT-017 · Unit Test Suite

**Title:** `LAYOUT-017: Unit Test Suite`

**Description:**
Complete and raise coverage across all layout modules. Target ≥ 85% coverage on `app/layout/`.

**Acceptance Criteria:**
- [ ] Unit tests for templates, footprints, floorplanner, legalizer, overlap, scorer, engine
- [ ] ≥ 85% line coverage on `app/layout/`
- [ ] All tests green in CI

**Definition of Done:**
- Coverage report generated and verified
- PR approved by QA Engineer + Backend Engineer
- Merged to `main`

**Dependencies:** LAYOUT-014

**Labels:** `layout`, `testing`, `phase-1`, `medium-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-unit-tests`

**Estimated Effort:** Medium (3–4 days)

**Assigned Role:** QA Engineer

---

### LAYOUT-018 · Golden Design Tests

**Title:** `LAYOUT-018: Golden Design Tests`

**Description:**
Implement golden design matrix: 5Q line, 9Q square, 8Q ring, 25Q heavy-hex, 49Q square, 16Q VIO. Assert zero overlap, on-chip, gate pass, score thresholds.

**Acceptance Criteria:**
- [ ] All 6 golden designs pass invariants
- [ ] 25Q heavy-hex: overall ≥ 80, symmetry ≥ 85
- [ ] 49Q square: die scaled with N, zero overlap

**Definition of Done:**
- Golden tests green in CI
- PR approved by QA Engineer + Physics Engineer
- Merged to `main`

**Dependencies:** LAYOUT-014 (+ all templates)

**Labels:** `layout`, `testing`, `phase-1`, `high-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-golden-tests`

**Estimated Effort:** Medium (3–4 days)

**Assigned Role:** QA Engineer

---

### LAYOUT-019 · Performance Benchmarks

**Title:** `LAYOUT-019: Performance Benchmarks`

**Description:**
Benchmark fast-draft wall-times across N tiers. Assert CP-SAT cap + OverlapResolver fallback behavior.

**Acceptance Criteria:**
- [ ] ≤16Q < 0.5s
- [ ] 17–49Q < 1.5s
- [ ] 50–120Q < 3.0s
- [ ] >120Q < 2.0s
- [ ] Zero-overlap guarantee holds at every size
- [ ] Report emitted

**Definition of Done:**
- Benchmark report generated
- All tiers within targets
- PR approved by Backend Engineer + QA Engineer
- Merged to `main`

**Dependencies:** LAYOUT-014

**Labels:** `layout`, `performance`, `phase-1`, `medium-priority`

**Milestone:** Phase 1 – Auto Layout Foundation

**Suggested Branch:** `feature/layout-perf-benchmarks`

**Estimated Effort:** Small (2 days)

**Assigned Role:** QA Engineer

---

## 5. GitHub Project Board

**Columns:** Backlog | Ready | In Progress | Review | Testing | Done

**Initial Assignment:**

| Issue | Starting Column |
|---|---|
| LAYOUT-001 | In Progress |
| LAYOUT-002 | Ready |
| LAYOUT-003 | Ready |
| LAYOUT-004 | Ready |
| LAYOUT-005 | Backlog |
| LAYOUT-006 | Backlog |
| LAYOUT-007 | Backlog |
| LAYOUT-008 | Backlog |
| LAYOUT-009 | Backlog |
| LAYOUT-010 | Ready |
| LAYOUT-011 | Backlog |
| LAYOUT-012 | Ready |
| LAYOUT-013 | Ready |
| LAYOUT-014 | Backlog |
| LAYOUT-015 | Backlog |
| LAYOUT-016 | Backlog |
| LAYOUT-017 | Backlog |
| LAYOUT-018 | Backlog |
| LAYOUT-019 | Backlog |

---

## 6. Dependency Graph (Parallel Waves)

```
Wave 1 (sequential foundation)
├── LAYOUT-001: Scaffold + flag

Wave 2 (parallel, after 001)
├── LAYOUT-002: Geometry Models
├── (unblocks everything below)

Wave 3 (7 parallel tracks, after 002)
├── Track A: LAYOUT-003 (footprints) ─→ LAYOUT-010 (cpsat) ─→ LAYOUT-011 (legalizer)
├── Track B: LAYOUT-004 (template core) ─→ LAYOUT-005 (square) / LAYOUT-006 (ring)
├── Track C: LAYOUT-004 ─→ LAYOUT-007 (heavyhex)
├── Track D: LAYOUT-004 ─→ LAYOUT-008 (vio)
├── Track E: LAYOUT-003 ─→ LAYOUT-012 (overlap)
├── Track F: LAYOUT-003 ─→ LAYOUT-013 (scoring) ─→ LAYOUT-016 (drc alignment)
└── Track G: (idle, waiting for floorplanner)

Wave 4 (3 parallel, after 003+004+005)
├── LAYOUT-009: Floorplanner
├── (unblocks engine assembly)

Wave 5 (sequential assembly + parallel tests)
├── LAYOUT-014: Engine Assembly ─→ LAYOUT-015: Integration
│                                ├── LAYOUT-017: Unit Tests
│                                ├── LAYOUT-018: Golden Tests
│                                └── LAYOUT-019: Performance
```

**Maximum parallel agents:** 7 in Wave 3 (templates ×4, CP-SAT, overlap, scoring).

---

## 7. Role Assignments

| Issue | Role |
|---|---|
| LAYOUT-001 | Infrastructure Engineer |
| LAYOUT-002 | Backend Engineer |
| LAYOUT-003 | CAD Engineer |
| LAYOUT-004 | Backend Engineer |
| LAYOUT-005 | Physics Engineer |
| LAYOUT-006 | Physics Engineer |
| LAYOUT-007 | Physics Engineer |
| LAYOUT-008 | Physics Engineer |
| LAYOUT-009 | CAD Engineer |
| LAYOUT-010 | Backend Engineer |
| LAYOUT-011 | Backend Engineer |
| LAYOUT-012 | CAD Engineer |
| LAYOUT-013 | Backend Engineer |
| LAYOUT-014 | Backend Engineer |
| LAYOUT-015 | Backend Engineer |
| LAYOUT-016 | Physics Engineer |
| LAYOUT-017 | QA Engineer |
| LAYOUT-018 | QA Engineer |
| LAYOUT-019 | QA Engineer |

---

## 8. Branch Strategy

**Naming convention:** `feature/layout-<area>` off `main`

| Issue | Branch |
|---|---|
| LAYOUT-001 | `feature/layout-scaffold` |
| LAYOUT-002 | `feature/layout-models` |
| LAYOUT-003 | `feature/layout-footprint-system` |
| LAYOUT-004 | `feature/layout-template-engine` |
| LAYOUT-005 | `feature/layout-template-square` |
| LAYOUT-006 | `feature/layout-template-ring` |
| LAYOUT-007 | `feature/layout-template-heavyhex` |
| LAYOUT-008 | `feature/layout-template-vio` |
| LAYOUT-009 | `feature/layout-floorplanner` |
| LAYOUT-010 | `feature/layout-cpsat` |
| LAYOUT-011 | `feature/layout-legalizer` |
| LAYOUT-012 | `feature/layout-overlap-resolver` |
| LAYOUT-013 | `feature/layout-scoring` |
| LAYOUT-014 | `feature/layout-engine` |
| LAYOUT-015 | `feature/layout-integration` |
| LAYOUT-016 | `feature/layout-drc-alignment` |
| LAYOUT-017 | `feature/layout-unit-tests` |
| LAYOUT-018 | `feature/layout-golden-tests` |
| LAYOUT-019 | `feature/layout-perf-benchmarks` |

**Merge Order:**
1. `feature/layout-scaffold` → main
2. `feature/layout-models` → main
3. `feature/layout-footprint-system` + `feature/layout-template-engine` → main (independent)
4. `feature/layout-template-square`, `feature/layout-template-ring`, `feature/layout-template-heavyhex`, `feature/layout-template-vio` → main (independent)
5. `feature/layout-cpsat`, `feature/layout-overlap-resolver`, `feature/layout-scoring` → main (independent after #3)
6. `feature/layout-floorplanner` → main (after #4)
7. `feature/layout-legalizer` → main (after #5)
8. `feature/layout-engine` → main (after #6+#7)
9. `feature/layout-integration` → main (after #8, **requires CODEOWNERS review**)
10. `feature/layout-drc-alignment` → main (after scoring)
11. `feature/layout-unit-tests`, `feature/layout-golden-tests`, `feature/layout-perf-benchmarks` → main (after #8, parallel)

---

## 9. PR Templates

### Standard PR Template (for all layout issues)

**PR Title Format:** `LAYOUT-###: <Short Description>`

**PR Checklist:**
- [ ] Branch is up-to-date with `main`
- [ ] All new files have docstrings
- [ ] Unit tests added and passing
- [ ] No regressions in existing tests
- [ ] Feature flag unchanged (remains `False` unless explicitly authorized)
- [ ] Type hints present on all public methods
- [ ] No hardcoded magic numbers (use `constants.py`)
- [ ] `shapely` geometries use mm units consistently
- [ ] CP-SAT models use integer µm domains

**Review Checklist (for reviewer):**
- [ ] Code follows project style guide
- [ ] Public API methods documented
- [ ] Edge cases handled (empty graph, single qubit, max N)
- [ ] No overlap in generated test cases
- [ ] Determinism verified (same seed → same output)
- [ ] Performance acceptable (no O(N²) loops on large inputs)

**Merge Criteria:**
- [ ] CI green (see §10 automation)
- [ ] At least one approval from assigned role owner
- [ ] For LAYOUT-015: approvals from all CODEOWNERS teams (platform, design-synth, physics, qiskit-metal)
- [ ] No open review comments
- [ ] Squash-merge preferred

---

## 10. GitHub Automation Recommendations

### Required Status Checks (branch protection for `main`)
Configure in Settings → Branches → `main` → Add rule:

```
✓ Required: lint (ruff + mypy)
✓ Required: pytest (backend)
✓ Required: pytest-cov (coverage ≥ 85% on app/layout/)
✓ Required: golden-designs (LAYOUT-018 assertions)
✓ Required: performance-benchmarks (LAYOUT-019 assertions)
✓ Required: typescript build (frontend unchanged check)
```

### CI Workflow additions (`.github/workflows/ci.yml`)

```yaml
# Add to existing CI or new .github/workflows/layout-ci.yml
name: Layout Engine CI

on:
  push:
    branches: [main, feature/layout-*]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Ruff lint
        run: ruff check backend/app/layout/
      - name: MyPy type check
        run: mypy backend/app/layout/ --ignore-missing-imports

  pytest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Install deps
        run: pip install -r backend/requirements
