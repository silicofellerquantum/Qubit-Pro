# Silicofeller Automatic Quantum Chip Layout Engine

Design a standalone backend `layout/` package that turns a prompt-derived architecture into a clean, symmetric, overlap-free, Qiskit-Metal-compatible `DesignDocument` automatically — via an 8-stage floorplan→place→route→optimize→DRC→score→select pipeline running in a hybrid "fast draft + background refine" model.

> Decisions captured (from clarifying questions): **execution = hybrid (instant deterministic draft, then background multi-candidate refine)**; **integration = new standalone `backend/app/layout/` package** called by `design_pipeline`, deprecating the old placement/routing incrementally; **dependencies allowed = `scipy` + OR-tools `CP-SAT` + `shapely`** (plus `networkx`, already present).
> Scope: architecture + algorithms + roadmap only. **No code in this document.**

---

## 0. Where today's pipeline breaks (grounding)

Current generation order (`backend/app/services/design_pipeline.py::run_design_pipeline`):

```
nl_to_graph → ground_intent → build_graph_from_constraints → GraphValidator
   → resolve_geometry → FrequencyPlanner → place_qubits → _assign_secondary_coords
   → route_design → run_full_drc → schematic_compiler.compile → exports
```

The layout-quality failures originate in four places, all downstream of a *correct* logical graph:

- **`physics/topology_router.py::place_qubits`** — Kamada-Kawai on an abstract point graph.
- **`design_pipeline.py::_assign_secondary_coords`** — heuristic offsets for couplers/resonators/feedline/launchpads.
- **`routing/{cpw,resonator,feedline}_router.py`** — independent geometric *estimators*.
- **`drc/runner.py`** — report-only; no feedback into placement.

---

## 1. Root Cause Analysis

### 1.1 Why components overlap
- **Fixed die, unbounded density.** Qubits are normalized into a fixed `60% × scale` of `_CHIP_HALF_W=4.5 / _CHIP_HALF_H=3.0` (`topology_router._solve_placement_graph`). The die never grows with N, so for large N centre-to-centre spacing falls below the `TransmonPocket` size → guaranteed pocket overlap. The frontend die is likewise fixed at 9×6 mm (`use-canvas-viewport.ts`).
- **No footprints in the solver.** Kamada-Kawai treats every qubit as a dimensionless point; it has no concept of pocket size, resonator extent, or keep-out. There is no minimum-pitch constraint.
- **Secondary parts placed blind** (`_assign_secondary_coords`): resonators at a fixed `0.55 mm` radial offset (rotating 45°), couplers at midpoint + 15% jitter, feedline as one bar at `y=+0.80·half_h`, launchpads clamped to `y=+0.92·half_h`. None test against any other component → overlaps by construction.
- **No legalization pass.** `AI-Next-Steps.md §6.2` specified an "overlap resolver"; `schematic_compiler.compile` ships none — it passes mm coordinates straight through. DRC sees the overlaps but never corrects them.

### 1.2 Why placement quality is poor
- **Wrong objective.** KK minimizes graph-theoretic distance deviation → organic "ball-and-stick" layouts. Professional chips are **rigid lattices** (grid/heavy-hex). There is no symmetry term, no grid snap, no alignment/distribute.
- **Aspect-ratio distortion.** KK output is normalized **independently in x and y** (`max_x`, `max_y`), squashing symmetric topologies into asymmetric blobs.
- **Two divergent connectivity models.** `topology_router._build_logical_graph` builds its *own* networkx graph; `constraints/builder.py::_topology_pairs` builds a *different* edge set (notably `heavy_hex`). Placement therefore minimizes crossings on a graph that is **not** the one built, routed, or DRC'd.

### 1.3 Why routing quality is poor
- **`cpw_router._l_route` returns a single midpoint** (a bare L); length is just `straight × 1.2`. No obstacle map, no pocket avoidance, no crossing test.
- **`resonator_router` uses `arm_mm = 1.5`** (enormous on a 9×6 mm die) and never verifies the meander stays in free space; "best direction" considers only qubit *centres*, not resonator/coupler/feedline geometry.
- **`feedline_router`** assumes all resonator endpoints sit below one horizontal line; with scattered KK endpoints the vertical taps cross qubits and each other.
- **No shared obstacle map, no net ordering, no rip-up/reroute, no crossing minimization.** The three routers run independently and cannot see each other's geometry.

### 1.4 Why chips aren't fabrication-ready
- **DRC is open-loop.** `run_full_drc` produces violations; nothing consumes them. No design-rule-driven spacing during placement, no die-size planning, no perimeter-launchpad rule, no feedline-as-bus topology.
- **No templates.** "heavy-hex" yields a 2-row line (both `topology_router` and `builder` approximate it), so `"25-qubit heavy-hex"` does **not** produce a heavy-hex lattice.
- **Large designs become unusable** because die + fill % are fixed while KK is `O(N²–N³)` and unstable for large/disconnected graphs.

### 1.5 Responsible-stage map

| Symptom | Root cause | Stage responsible (target) |
|---|---|---|
| Components overlap | Fixed die + footprint-blind KK + blind secondary offsets + no legalization | Floorplanning (3) + Placement (4) + Optimization (6) |
| Resonators overlap qubits | Fixed 0.55 mm offset, no collision check | Floorplanning (3) + Placement (4) |
| Couplers intersect structures | Midpoint+jitter, no corridor model | Floorplanning (3) + Routing (5) |
| Routes cross unnecessarily | No obstacle map / net order / crossing min | Routing (5) |
| Feedlines poorly placed | Single hard-coded bar | Floorplanning (3) + Routing (5) |
| Launchpads invalid | Clamped to top edge | Floorplanning (3) |
| Messy / asymmetric | KK objective, independent x/y scaling, no symmetry term | Placement (4) + Optimization (6) |
| Large designs unusable | Fixed die, `O(N²)` heuristics | Architecture Planning (1) + Floorplanning (3) |
| Not like Metal/IBM/Google | No templates, no lattice generation | Templates (Stage 1) |

---

## 2. Professional Layout Pipeline (8 stages)

New package **`backend/app/layout/`**, orchestrated from `design_pipeline.run_design_pipeline`, replacing `place_qubits` + `_assign_secondary_coords` + `routing/*`. Reuses the existing `DesignGraph`, `drc/runner`, reasonableness gate, and `schematic_compiler`.

```
DesignGraph (canonical, single source of truth)
  │
  ▼ Stage 1  Architecture Planning ── die size, pitch, template family, IO budget
  ▼ Stage 2  Topology Generation  ── one canonical net list (kill divergent model)
  ▼ Stage 3  Floorplanning        ── sites, regions, channels, obstacle/keep-out map
  ▼ Stage 4  Placement            ── concrete legal coords (overlap-free by construction)
  ▼ Stage 5  Routing              ── obstacle-aware, prioritized, rip-up/reroute → RouteMeander
  ▼ Stage 6  Optimization         ── multi-candidate + simulated annealing on cost fn
  ▼ Stage 7  DRC                  ── 4-domain + geometric crossing checks as HARD gate
  ▼ Stage 8  Physics Validation   ── scqubits reasonableness + frequency DRC
  │
  ▼ best candidate → DesignDocument (mm, Qiskit-Metal-native)
```

| Stage | Purpose | Input → Output |
|---|---|---|
| **1 Architecture Planning** | Decide die WxH, qubit pitch, margins, IO count, and which **template family** to use. Pitch = `max(footprint) + DRC min_spacing`; die grows with N. | Constraints + PhysicsPlan → `FloorplanSpec` |
| **2 Topology Generation** | Emit **one** canonical connectivity graph (qubits, couplers, resonators, feedline, launchpads + edges); make placement consume the *same* graph. | Constraints → canonical `DesignGraph` + net list |
| **3 Floorplanning** | Coarse spatial plan: qubit **sites** (lattice), per-qubit resonator **shell** zones, coupler **corridors**, feedline **bus channel**, perimeter launchpad **slots**; build keep-out/obstacle map. | `FloorplanSpec` + graph → slot grid + obstacle map |
| **4 Placement** | Assign concrete mm coords: qubits→sites, resonators→shells (feedline-facing side), couplers→corridors, launchpads→perimeter, feedline→channel; legalize to zero overlap. | slot grid → legal `Placement[]` |
| **5 Routing** | Build shared obstacle map; route nets by priority with A*/maze + crossing penalties; meander resonators to physical λ/4; rip-up/reroute conflicts; emit Qiskit Metal route options. | placement → `Connection[]` + route geometry |
| **6 Optimization** | Generate candidates A–E; anneal placement perturbations against the cost function; re-route; keep the best. | candidate seeds → ranked candidates |
| **7 DRC** | Run `drc/runner` (geometry/frequency/fabrication/connectivity) **+** new route-crossing/route-pocket checks; errors are gates. | candidate → DRC report (pass/fail) |
| **8 Physics Validation** | Existing scqubits reasonableness gate + frequency DRC; attach provenance/confidence. | candidate → physics report |

**Hybrid split:** Stages **1–5** form the synchronous **fast draft** (deterministic, overlap-free, <~1 s) returned as `result.design` so the editor opens clean. Stages **6 + re-5/7/8 per candidate** form the **background refine** that swaps in the best candidate.

---

## 3. Quantum Chip Floorplanner

**Input:** counts {qubits, resonators, couplers, launchpads, feedlines}, topology, per-component **footprints**, DRC spacing.
**Output:** die size + **site grid** + region zones (resonator shells, coupler corridors, feedline channel, perimeter launchpad slots) + **obstacle map** → from which the Placement engine produces final coordinates.

### 3.1 Algorithm options (analysis)

| Approach | Strength | Weakness | Role here |
|---|---|---|---|
| **Template lattice (analytic)** | Exact, instant, perfectly symmetric, zero overlap; matches real chips | Only for known architectures | **Primary** for grid/heavy-hex/ring/line/star + IBM/Google/etc. |
| **Force-directed (Fruchterman–Reingold)** | Good organic relative arrangement; fast | Not grid-aligned; overlaps remain | Seed for **custom/arbitrary** graphs |
| **Kamada–Kawai** | Respects graph distances | `O(N²–N³)`, distorts under independent x/y scaling, unstable disconnected | Seed only (custom), then legalize |
| **Simulated annealing** | Global, escapes local minima; arbitrary cost fn | Slow; needs good cooling schedule | **Refine** pass (background) |
| **Constraint solving (OR-tools CP-SAT)** | Hard no-overlap + adjacency, optimal slot assignment | Discrete only; modeling effort | **Legalization** / slot assignment |
| **Graph optimization (spectral/min-crossing)** | Reduces edge crossings | Indirect on geometry | Ordering within rows |
| **Placement cost functions** | Single objective to optimize | Needs careful weighting/normalization | Drives SA + candidate ranking (§6) |

### 3.2 Recommended approach — hierarchical hybrid
1. **Template lattice first.** For any recognized architecture, emit closed-form site coordinates → symmetric, overlap-free, instant. *(You don't "optimize" a heavy-hex into existence; you instantiate it.)*
2. **CP-SAT legalization.** Assign components to discrete grid slots with hard no-overlap + adjacency/orientation constraints (qubit↔site, resonator↔shell, coupler↔corridor). Fast and optimal for structured grids.
3. **Force-directed/KK seed → spreading legalization** only for **non-templated custom** graphs: seed with FR/KK, snap to grid, then `shapely`-based push-apart until clear.
4. **SA refine** (background) over discrete moves (swap symmetric qubits, mirror, rotate, shift) using the §6 cost function.

**Footprints & collisions:** model every part as a `shapely` polygon (pocket + claw + resonator bbox + launchpad pad) in mm; index with an STRtree obstacle map shared by floorplanner, placer, router, and DRC.

---

## 4. Automatic Placement Optimization

**Objectives:** no overlap · minimum spacing · balanced · symmetric · shortest connections · routing-friendly.

### 4.1 Placement flow
- **Qubits → lattice sites** (template) or legalized seed (custom).
- **Resonators → shell** on the qubit side facing the **feedline channel**, never toward a neighbour site; readout pin oriented at the feedline.
- **Couplers → corridors** reserved between adjacent sites (kept clear for CPW).
- **Launchpads → perimeter slots** (die edge), evenly distributed, paired with IO.
- **Feedline → bus channel** (row gap or perimeter ring), not across qubits.
- **Legalize** with CP-SAT / spreading → overlap-free guarantee.

### 4.2 Scoring (cost) function — recommendation
The user's split (40% overlap / 25% routing / 20% symmetry / 10% spacing / 5% aesthetics) is a good *soft* weighting, but **overlap and off-chip must be hard gates, not weights** — a design with any pocket overlap is unusable regardless of other scores. Recommended **tiered (lexicographic) model**:

```
Tier 0 — HARD GATE (pass/fail): zero pocket overlap · all on-chip · DRC errors == 0
Tier 1 — SOFT SCORE (only for gate-passing candidates), each sub-metric normalized to [0,1]:
   Score = 100 · ( w_route·route + w_sym·symmetry + w_space·spacing
                 + w_wire·wirelength + w_aes·aesthetics )
   defaults: w_route=0.35, w_sym=0.25, w_space=0.15, w_wire=0.15, w_aes=0.10
```

Sub-metrics (size-normalized so scores compare across N):
- **route** = `1 − crossings/crossing_budget`, blended with routed-length / lower-bound.
- **symmetry** = `1 − reflection/rotation residual` about the die axes.
- **spacing** = `1 − CV(nearest-neighbour spacing)` (uniformity).
- **wirelength** = `HPWL_lower_bound / actual_HPWL`.
- **aesthetics** = grid-alignment + density-balance quadrant evenness.

**Why tiered beats a flat weighted sum:** a flat sum lets a beautiful-but-overlapping layout outscore a plain legal one. Gating guarantees every *selectable* candidate is fabricable; weights then choose the *nicest* legal one.

---

## 5. Automatic Routing Engine

**Current problem:** routes are independent estimators that disturb each other. Target: **obstacle-aware, net-prioritized, rip-up/reroute** router emitting Qiskit Metal options.

### 5.1 Technique analysis

| Technique | Verdict | Use |
|---|---|---|
| **Manhattan (rectilinear)** | Natural for CPW + feedline bus | Base geometry style for couplers/feedline |
| **A\*** | Shortest path on a routing grid with obstacle costs | **Primary** per-net path finder |
| **Maze (Lee)** | Guarantees a path if one exists | Fallback when A\* blocked (dense/escape) |
| **River routing** | Parallel, crossing-free bus | **Feedline taps + launchpad fan-in** |
| **PCB push/shove** | Rip-up & reroute on conflict | Conflict resolution in refine pass |
| **Qiskit Metal RouteMeander optimization** | Native output; hits physical λ/4 length | **Emission format** for resonators/couplers |

### 5.2 Recommended architecture — grid-based, obstacle-aware, prioritized router
1. **Shared obstacle map** (`shapely` STRtree) from all placed footprints + keep-outs + already-routed nets.
2. **Net ordering by criticality:** readout resonators (fixed λ/4 length, hardest) → feedline bus (river route) → qubit–qubit couplers (A*/Manhattan) → IO→launchpads.
3. **A\*** per net on a routing grid with obstacle + observed-crossing penalties; **maze** fallback.
4. **Meander to physical length** within the resonator's shell (RouteMeander lead-in/out, fillet, asymmetry) so resonators hit their target λ/4 — replacing the `arm_mm=1.5` estimator.
5. **Rip-up & reroute:** if a net can't route, rip the cheapest blocking net and retry (bounded iterations).
6. **Emit Qiskit Metal route options** so existing `render_service`/codegen and the editor work unchanged.

### 5.3 Route preservation / locking / "reroute only affected nets"
This maps **directly** onto infrastructure that already exists in the editor and is currently unused by the generator:
- `Connection.locked` + `cachedSvg` + `cachedGeometryHash` + `SET_CONNECTION_GEOMETRY` (`lib/editor/design-store.tsx`); `Placement.locked`.
- **Locked routes/placements become hard obstacles** and are never re-solved.
- **Incremental routing keyed by net-hash** (`endpointHash + overridesHash + obstacleHash`): re-route a net only when its hash changes — the fix for `Next Steps.md` R1/#2/#3 (global rebuild moves every route). This is what lets the **background refine swap in a better layout without destroying the user's manual edits.**

---

## 6. Optimization Engine + Multi-Candidate Generation

### 6.1 Candidate generators (Layout A–E)
| Candidate | Strategy |
|---|---|
| **A** | Primary template lattice (deterministic) — also the **fast-draft** result |
| **B** | Template + mirror/rotate variant (alternate feedline side / IO placement) |
| **C** | Alternate template metric (compact vs spread pitch) or sibling family |
| **D** | Force-directed / KK seed → CP-SAT legalized (organic) |
| **E** | SA-refined best-of from a seeded random restart |

### 6.2 How selection works
- Each candidate is generated with a **fixed seed** (reproducible), routed (Stage 5), DRC'd (Stage 7), physics-checked (Stage 8), and scored by the **Design Quality Engine** (§7).
- **Hard gate first:** discard any candidate with overlap / off-chip / DRC errors.
- **argmax soft score** among survivors; tie-break by higher symmetry, then lower wirelength.
- **Parallel evaluation** in the background job; **hybrid handoff:** fast draft = A; refine swaps in best(A–E) only if it **strictly beats A by a margin** and the swap respects user locks.

### 6.3 Optimizer
- **Simulated annealing** (`scipy` or custom Metropolis) over discrete moves {swap symmetric qubits, mirror region, rotate qubit, shift within slot}; geometric cooling schedule; re-route incrementally after each accepted move; accept by Δcost (§4.2).

---

## 7. Design Quality Engine (0–100)

A single rating attached to every generated design and surfaced in the `v2` payload + an editor badge.

| Metric (0–100) | Computed from |
|---|---|
| **Overlap** | DRC `QUBIT_OVERLAP`/spacing + `shapely` footprint intersection area ratio |
| **Route quality** | Router stats: crossing count vs budget, routed length / lower bound, unrouted nets |
| **Symmetry** | Reflection/rotation residual about die axes |
| **Spacing** | Coefficient of variation of nearest-neighbour spacing vs DRC minimum |
| **Fabrication** | `fabrication_drc` (min linewidth/gap/bend) + on-chip + keep-out compliance |
| **Readability** | Grid alignment, label/route legibility, density balance across quadrants |

**Design Quality Rating** = the tiered model of §4.2 (gate → weighted soft score), reported as `0–100` with the per-metric breakdown so the user sees *why*. Overlap/fabrication failures cap the rating (gate), guaranteeing any high-rated design is fabricable.

---

## 8. Professional Chip Templates

A **template registry**: each template is a parametric generator `template(N) → {sites, coupler_corridors, resonator_shells, feedline_channel(s), launchpad_slots, die_WxH, symmetry_group}`. Templates drive **all** of floorplanning (die+grid), placement (snap), and routing (predefined channels).

| Template | Geometry | When to use | How it guides placement |
|---|---|---|---|
| **IBM heavy-hex** | Degree-≤3 hex lattice (low crosstalk, surface-code-friendly) | `heavy_hex`; "Eagle/Falcon/Heron/Hummingbird"; transmon processors ≳16Q | Exact hex-site coords + fixed coupler corridors + bus channels between hex rows |
| **Google Sycamore** | Square/diagonal grid, tunable couplers | `grid`; "surface code"; "Sycamore" | Square lattice + diagonal coupler corridors; readout shells on outward faces |
| **Quantware VIO** | Flip-chip / vertical-IO, perimeter launchpads | High IO density / flip-chip asks ("Soprano/Contralto/Tesseract") | Launchpad ring + radial/vertical feedlines; central qubit array |
| **Academic transmon** | Small linear/ring/star, edge launchpads | 1–8Q, custom, demos | Simple row/ring placement; per-qubit readout to shared or individual feedline |

**Selection logic:** `(topology, N, intent keywords, IO budget)` → template. Default fallbacks: `heavy_hex`→IBM, `grid`→Sycamore, small `line/ring/star`→academic, high-IO→Quantware. Custom graphs with no template → force-directed seed (§3.2). This replaces today's heavy-hex-as-2-row-line approximation and makes outputs resemble real IBM/Google/Quantware/academic chips.

---

## 9. Recommended Algorithms (consolidated)

| Stage | Recommended algorithm | Library |
|---|---|---|
| Architecture planning | Footprint+DRC-derived die/pitch sizing; template selection | pure-python |
| Topology generation | Canonical graph builder (single source) | `networkx` |
| Floorplanning | **Template lattice (primary)**; FR/KK seed (custom) | `networkx` |
| Legalization | **CP-SAT slot assignment**; `shapely` spreading (continuous) | **OR-tools**, **shapely** |
| Placement refine | **Simulated annealing** on cost fn | **scipy** / custom |
| Obstacle map / collision | Polygon footprints + STRtree | **shapely** |
| Routing | **A\*** (primary) + **maze** fallback + **river** (feedline) + rip-up/reroute | custom on grid; `networkx` graph search |
| Resonator geometry | RouteMeander to physical λ/4 within shell | Qiskit Metal options |
| Quality scoring | Tiered gate + normalized weighted soft score | pure-python / `numpy` |
| Candidate selection | Seeded multi-candidate + argmax under gate | parallel job |
| DRC | 4-domain + geometric crossing/pocket checks | reuse `drc/runner` + `shapely` |
| Physics validation | scqubits reasonableness + frequency DRC | reuse existing |

---

## 10. Implementation Roadmap

New package **`backend/app/layout/`** (`spec.py`, `templates/`, `floorplan.py`, `placer.py`, `legalizer.py`, `obstacles.py`, `router.py`, `optimizer.py`, `candidates.py`, `quality.py`, `engine.py`). `design_pipeline` calls `layout.engine` instead of `place_qubits` + `_assign_secondary_coords` + `route_design`. DRC, reasonableness gate, and `schematic_compiler` are reused.

### Phase 0 — Scaffolding & contracts (no behavior change)
- Create `app/layout/` with `FloorplanSpec`, `LayoutResult`, `Footprint` dataclasses.
- Build a **footprint registry** (`shapely`) from `component_catalog.json` / metadata (pocket, claw, resonator bbox, launchpad pad).
- Add a feature-flagged `engine.layout(graph, spec)` call in `design_pipeline` behind the fast-draft path.

### Phase 1 — Template floorplanner + analytic placement (the fast draft) ★ kills most overlaps
- Template registry for `line/ring/star/grid/heavy_hex` with **exact site coordinates**; die-size + pitch derived from footprints + DRC `min_qubit_spacing_mm`.
- Resonator shells, coupler corridors, feedline channel, perimeter launchpad slots.
- **CP-SAT legalization** → overlap-free guarantee. Replaces `place_qubits` + `_assign_secondary_coords`.
- Unify connectivity on the **canonical `DesignGraph`** (remove `topology_router`'s divergent model).

### Phase 2 — Obstacle-aware router
- `shapely` obstacle map; net-prioritized **A\*/maze**; **river-route** feedline taps; RouteMeander emission to physical length. Replaces `routing/*` estimators.
- **Incremental/locked-net routing** (net-hash) reusing editor `locked`/`cachedSvg`/`cachedGeometryHash`.

### Phase 3 — Quality engine + DRC gate
- Scoring (`0–100`, tiered §7); wire `drc/runner` + new geometric crossing/pocket checks as **hard gates**; surface rating + breakdown in `v2` and an editor badge.

### Phase 4 — Multi-candidate + SA refine (background, completes the hybrid)
- Candidate generators **A–E**; **SA** optimizer; parallel scoring; select best.
- Async job + **editor swap-in** that respects user locks (fast draft → refined best when it strictly wins).

### Phase 5 — Professional templates + hardening
- **IBM heavy-hex / Google Sycamore / Quantware VIO / academic** templates.
- Golden-prompt tests (`25Q heavy-hex`, `49Q grid`, `27Q Falcon`, ring/line/star) asserting: **zero overlap · all on-chip · DRC pass · crossings ≤ budget · symmetry ≥ threshold · rating ≥ target**; performance tests for large N.

### Integration points (file-level)
- `services/design_pipeline.py` — call `layout.engine` (replaces Steps 4–5); keep DRC/exports/compile.
- `services/physics/topology_router.py`, `design_pipeline._assign_secondary_coords`, `routing/*` — deprecated as `layout/` lands.
- `drc/runner.py`, `physics_grounding` reasonableness gate, `design_synth/compiler.py` — reused.
- Frontend: reuse existing `locked`/`cachedSvg` lock+cache; add a Design-Quality badge (no new editor architecture required).

### Acceptance (Final Goal)
`"Generate a 25-qubit heavy-hex transmon processor"` →
- **No overlaps** (Tier-0 gate) · **no invalid routes** (router + crossing budget) · **clean, symmetric** placement (template lattice) · **fabrication-friendly** (DRC pass) · **Qiskit Metal compatible** (RouteMeander + valid pins) · **editor-ready `DesignDocument`** injected with a Design Quality Rating — **with zero manual movement.**

### Risks
- **CP-SAT scaling** at large N → fall back to greedy slot fill + spreading above a size threshold.
- **Background-refine race vs user edits** → gate swap-in on locks + a strict score margin; never overwrite locked items.
- **Footprint accuracy** vs live Qiskit Metal → seed registry from catalog, validate against worker render.
- **Latency budget (hybrid)** → cap fast-draft at template+legalize only; push SA/candidates fully async.
