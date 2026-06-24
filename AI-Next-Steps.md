# Reliable NL → Schematic → Qiskit Metal Synthesis

Make AI-generated designs appear correctly in the schematic editor every time by replacing the lossy client-side guesser with a deterministic backend **Graph → DesignDocument compiler** that owns component selection, pin allocation, placement, naming, and units — so invalid pins, duplicate names, unit errors, and overlaps are impossible by construction.

## 1. Problem / root cause

The platform has two disconnected worlds:

- **Designer copilot** (`@/Users/manannarang/Downloads/studio-main/frontend/src/routes/_app/designer.tsx`) → `/api/generate` → `generate_chip()` returns an *abstract* qubit/edge model + QCLang + Qiskit Metal text. It renders its own read-only SVG, not the editor.
- **Schematic editor** operates on `DesignDocument { placements, connections }` where every `Placement.componentId` and `Connection.*.pinName` must reference the real bridge catalog (`@/Users/manannarang/Downloads/studio-main/backend/app/core/component_catalog.json`).

**The weak link** is `fromGenerateResponse` (`@/Users/manannarang/Downloads/studio-main/frontend/src/routes/_app/schematic-editor.tsx:68-133`), a client-side converter that:

- **Hardcodes** every qubit → `TransmonPocket`, every resonator → `ResonatorCoilRect`; has no mapping for couplers/launchpads/feedlines/terminations.
- **Guesses pins** (`"a"/"b"`, `"readout"/"in"`) that mostly **don't exist** on the catalog parts (TransmonPocket exposes `readout`, `bus_01`, `bus_02`) → routes error out.
- **Connects qubits directly** with no coupler component in between.
- **Places resonators by a radial offset** with no overlap check (the R6 coordinate-model gap).
- Performs **no validation, no repair, no unit normalization, no unique-name guard**.

Key leverage already in place:

- `fromGenerateResponse` already **prefers `result.design` if present** (`:73-78`) → if the backend returns a valid `DesignDocument`, it injects losslessly.
- Editor injection is already wired: `newCanvas(name, doc)` / `loadIntoCanvas(id, doc)` (`@/Users/manannarang/Downloads/studio-main/frontend/src/lib/editor/workspace-store.tsx:249-261`).
- A **logical IR already exists**: `design_graph` (`@/Users/manannarang/Downloads/studio-main/backend/app/core/design_graph/node.py`, `edge.py`, `serializer.py`, `validator.py`) + `build_graph_from_constraints` (`@/Users/manannarang/Downloads/studio-main/backend/app/constraints/builder.py`) already produces qubits + couplers + readouts + feedline/launchpads with edges.
- Qiskit Metal generation from a `DesignDocument` already works: `codegen_service.generate()` (`@/Users/manannarang/Downloads/studio-main/backend/app/services/codegen_service.py`).

**What is missing:** a `design_graph → DesignDocument` compiler, a catalog-aware ontology + pin allocator, and a validate/repair loop. That is the whole task.

## 2. Target architecture

```
NL prompt
  └─(Claude, constrained JSON)→ DesignIntent
        └─ deterministic build → DesignGraph (logical IR; reuse existing)
              └─ GraphValidator (structural)
                    └─ SchematicCompiler (NEW)  ── ontology map + pin allocator + placer
                          └─ DesignDocument (concrete editor IR: componentId + valid pins + mm coords)
                                └─ DocumentValidator (NEW) + DRC + repair loop
                                      ├─→ editor (result.design → existing inject path)
                                      └─→ Qiskit Metal (codegen_service, secondary)
```

**Two IRs, one bridge.** Keep `design_graph` as the *logical* IR (physics: qubits/couplers/resonators, topology, freqs). Keep `DesignDocument` as the *concrete* editor IR. The **new compiler** is the bridge. The AI only ever emits the logical layer (kinds, types, topology, params) — never componentIds, pins, coordinates, or names.

## 3. Why this hits >95% (impossible-by-construction)

The four named failure classes are eliminated because the AI never authors them — the deterministic compiler does:

- **Invalid pins** → pins are looked up from `pin_service.get_pins(componentId)` (`@/Users/manannarang/Downloads/studio-main/backend/app/services/pin_service.py`) and allocated by role; an edge can only use a pin that exists on the part.
- **Duplicate names** → compiler assigns unique ids/names from a monotonic allocator.
- **Unit errors** → params are merged from catalog `default_options` + metadata and normalized to unit strings (`455um`), never free-typed by the AI.
- **Overlaps** → coordinates come from the physics placer + a deterministic overlap-resolution pass on a chip-bounds grid.

The AI's only job is the *logical intent* (count, topology, type, materials, optional custom nodes/edges), which is then validated structurally and, on failure, repaired or re-prompted with structured errors.

## 4. Component ontology (full catalog, 45 parts)

New module `app/services/design_synth/ontology.py` (+ a generated `component_ontology.json`). For each logical `(NodeKind, subtype)` provide a **ranked list of candidate `componentId`s** from the catalog, with the first as default:

| Logical | Default componentId | Notes |
|---|---|---|
| qubit/transmon (grounded default) | `TransmonCross` + claw | **Primary AI/grounded candidate** (SQuADDS-covered). Claw = `connection_pads.readout` (`cross_length`/`claw_length`/`ground_spacing`). |
| qubit/transmon (legacy/manual) | `TransmonPocket` | Retained & supported; **not** the grounded default. |
| qubit/xmon | `TransmonCross` | |
| coupler/fixed | `CoupledLineTee` | also `LineTee`, `CapNInterdigitalTee` |
| coupler/tunable | `TunableCoupler01` | if present in catalog |
| resonator/readout | `ResonatorCoilRect` | also `ReadoutResFC` family |
| route (connection) | `RouteMeander` | category `routes` (6 parts) |
| launchpad | `LaunchpadWirebond` | lives in catalog category `terminations` (`LaunchpadWirebond`/`…Coupled`/`…Driven`) |
| termination | `OpenToGround` / `ShortToGround` | category `terminations` (5) |

Rules:
- Built by introspecting the catalog at load (categories: qubits 13, couplers 5, resonators 5, routes 6, terminations 5, other 11) so **all 45** are reachable; unmapped/`other` parts are selectable only via explicit AI override.
- **Grounded qubit default = `TransmonCross` + claw** (physics-grounded path, §16/§25); `TransmonPocket` remains a selectable legacy/manual component.
- The AI **may** override the default by emitting a concrete `componentId`, but it is validated against the catalog enum; invalid → fall back to default + warning.
- Each entry caches **required params + units** (from `metadata_service`) and the **role→pin map** (from `pin_service`).

## 5. Connection ontology + pin allocator

New `app/services/design_synth/pins.py`:

- For a componentId, fetch catalog pins; classify by role using pin metadata + naming conventions (qubit `readout` vs `bus_*`; coupler `prime_start/prime_end/second_end`; route `start/end`).
- `allocate(edge, src_comp, dst_comp)` returns valid `(pinName_src, pinName_dst)`, tracking already-used pins per placement to avoid double-booking.
- For the 18 pin-less catalog parts (dynamic `connection_pads`), reuse `_make_default_connection_pads` conventions already encoded in `pin_service.py` to synthesize stable pin names.
- Couplers are **inserted as real placements** between qubit pairs (qubit→coupler→qubit), matching the logical edges from `builder.py:60-74` — never qubit-to-qubit directly.

## 6. SchematicCompiler (the core, NEW)

`app/services/design_synth/compiler.py`: `compile_graph(graph, constraints) -> DesignDocument`.

1. **Coordinates** — qubits from `place_qubits()` (Kamada-Kawai, `@/Users/manannarang/Downloads/studio-main/backend/app/services/physics/topology_router.py`); couplers at qubit-pair midpoints; resonators offset from target qubit; feedline/launchpads at chip edges. All in mm, same world basis as the editor.
2. **Overlap resolver** — snap to chip-bounds grid, push colliding parts apart until clear (deterministic, bounded iterations); guarantees DRC spacing.
3. **Component selection** — logical type → componentId via ontology (§4).
4. **Pins** — per edge via allocator (§5).
5. **Names/ids** — unique allocator (`Q1`, `C1`, `RO_Q1`, `route_<n>`...).
6. **Params/units** — catalog defaults ⊕ node physics params, normalized to unit strings.
7. **Connections** — `routeComponentId` defaults to `RouteMeander`; `from`/`to` are catalog-valid `PinRef`s.

Emit the dict into the pipeline result as `result["design"]`.

## 7. Validation pipeline + repair loop

`app/services/design_synth/validate.py` runs layers and a bounded repair loop:

1. **Schema** — Pydantic on the AI's DesignIntent.
2. **Structural** — `GraphValidator` (`@/Users/manannarang/Downloads/studio-main/backend/app/core/design_graph/validator.py`): no-qubits, dup ids, dangling coupler/resonator refs, self-coupling, readout coverage, isolation, chip size.
3. **Document (NEW)** — extend `render_service.validate_design` (`@/Users/manannarang/Downloads/studio-main/backend/app/services/render_service.py:297-309`): componentId exists, pinName exists on that component, unique placement names/ids, params typed against metadata, on-chip bounds, no geometric overlap, no double-booked pin.
4. **DRC** — `run_full_drc` (`@/Users/manannarang/Downloads/studio-main/backend/app/drc/runner.py`).
5. **Repair** — deterministic fixes first (re-place to clear overlaps, reassign pins, dedupe names, inject missing readout). If still structurally wrong, re-prompt Claude with the structured issue list (max 2 retries). Output `DesignDocument` is always emittable; the four error classes can't survive.

## 8. AI NL → graph (Claude, constrained)

`app/services/design_synth/nl_to_graph.py`, upgrading `@/Users/manannarang/Downloads/studio-main/backend/app/routers/claude.py`:

- **Forced tool/JSON-schema output**: `DesignIntent` = either **parametric** (`qubit_count`, `topology` enum, `technology` enum, `substrate`, `metal`, `target_freq_ghz`) — covers the standard case via `build_graph_from_constraints` at ~100% — or **explicit** (`nodes[]` with kind/type/params + `edges[]`) for custom designs.
- System prompt embeds ontology **enums** (topologies, qubit types, materials, node kinds) so the model picks from a controlled vocabulary.
- **Fallback ladder** (guarantees offline robustness even though Claude is assumed): Claude → existing `ml_intent`/`parse_prompt` (`@/Users/manannarang/Downloads/studio-main/backend/app/services/chip_generator.py`) → constraints. Deterministic layer always produces a valid graph.

## 9. Qiskit Metal generation (secondary)

Already covered once a valid `DesignDocument` exists: `codegen_service.generate()` and bridge `POST /design/generate-code`. Optional correctness check via `POST /design/run-code` (code → DesignDocument round-trip, `@/Users/manannarang/Downloads/studio-main/backend/app/routers/bridge.py:158-167`). Keep `export_qclang` for the semantic view.

## 10. Frontend integration (minimal — not the focus)

- Point Designer `send()` (design branch) at the upgraded endpoint and ensure the response carries `design` (a `DesignDocument`).
- In `fromGenerateResponse`, keep the `result.design` lossless branch (`:73-78`) and **delete the lossy synthesis branch** (`:80-132`) — falling back to an empty doc when `design` is absent (legacy-safe).
- Injection already works through `newCanvas`/`loadIntoCanvas`.

## 11. Phased build plan

- **Phase 0 — Ontology & contracts:** build `ontology.py` (+ generated JSON) covering all 45 parts; `pins.py` allocator; extend `DocumentValidator`. No behavior change.
- **Phase 1 — Compiler:** `compiler.py` (`compile_graph`); wire into `design_pipeline.run_design_pipeline` so `/api/design/generate` and `/api/generate` return `result.design`.
- **Phase 2 — Validate + repair:** `validate.py` orchestrator + deterministic repair passes.
- **Phase 3 — AI NL→graph:** `nl_to_graph.py` with Claude constrained output + fallback ladder; endpoint `POST /api/design/from-prompt` returning `{ design, graph, freq_plan, drc, code, qclang, issues }`.
- **Phase 4 — Frontend wiring:** consume `result.design`; trim `fromGenerateResponse`.
- **Phase 5 — Hardening & tests:** golden-prompt matrix; property tests for the four invariants; route-render smoke test; codegen round-trip.

## 12. Testing & verification

- **Backend:** `pytest` — golden NL prompts across the topology matrix (line/ring/star/grid/heavy-hex) × qubit counts (1, 5, 16, 27, 64) asserting: every `componentId` in catalog, every `pinName` valid for its part, all names unique, all length params unit-suffixed, zero overlaps, DRC pass.
- **Worker smoke:** render the compiled `DesignDocument` via `render_service.render_design` and assert no route errors.
- **Codegen round-trip:** `/design/run-code` re-parses generated Metal back to a `DesignDocument`.
- **Frontend:** `npx tsc --noEmit` and `npx vite build`; manual NL→editor sanity in Designer→Schematic.

## 13. Risks / open questions

- **Pin truth for 18 pin-less parts** — catalog pins may be stale vs live Qiskit Metal; may need a one-time worker introspection pass to enrich `component_catalog.json`.
- **Claude latency/cost** — mitigated by caching parametric intents and the deterministic fallback.
- **R6 coordinate unification** — compiler standardizes mm world coords so qubit preview centers and route bases agree; confirm against `editor-canvas` `w2s`.
- **`other`-category parts** — reachable only via explicit AI override in v1; revisit if needed.

## Decisions captured

- Deliverable: **spec + phased build plan** (implement after approval).
- NL→graph assumes **Claude available** with constrained output; deterministic fallback retained for robustness.
- Ontology breadth: **full catalog (45 parts)**.

---

# Part II — Physics-Aware Extension: SQuADDS + ML_qubit_design

> This **extends** the approved plan above; nothing above is removed. It inserts one new pipeline stage — **Physics Grounding** — between `DesignGraph` and `SchematicCompiler`, and upgrades the copilot goal from *valid design* to *physically reasonable design*. SQuADDS and ML_qubit_design are treated as **first-class citizens**, not optional plugins: the compiler's component params come from a physics oracle, not heuristic defaults.

## 14. Repo analysis — what each solves

| Repo | Solves | Nature | Default deployment |
|---|---|---|---|
| **SQuADDS** (`LFL-Lab`) | Inverse design via **retrieval + interpolation** over a validated, pre-simulated DB: target Hamiltonian params → Qiskit Metal `design_options` (TransmonCross+claw, CPW λ/4 cavity, NCap coupler). | Retrieval system + interpolator (Qiskit-Metal-native). | **Embedded Python lib** (local HF dataset mirror) as source of truth **+ MCP server exposed to Claude**. |
| **ML_qubit_design** (`CosmiQuantum`/FNAL) | **Learned MLP inverse/surrogate** trained on SQuADDS+Ansys data: target Hamiltonian / cap-matrix / eigenmode → Qiskit Metal geometry; generalises beyond the DB and is optimisable. | Local model + optimization engine. | **Deferred to V2/V3**: local Keras inference microservice and/or SQuADDS hosted ML API; retrain loop later. |
| **scqubits** (already integrated, `physics_analysis/`) | **Forward** Hamiltonian solver: geometry/EJ-EC → f₀₁, α, T₁/T₂. | Local verifier. | In-process via `app/services/physics.py` + `physics_analysis` engine. |
| **AWS Palace** (placeholder in `simulations.py`) | **EM ground truth** (capacitance/eigenmode). | Async solver. | **V2 async verification worker**; V3 training-data generator. |

**Core insight:** SQuADDS and ML_qubit_design are *the same kind of thing* — inverse-design engines mapping **target physics → Qiskit Metal geometry**. Today that mapping is faked by `default_options` + `frequency_planner.py`/`simulation_corrector.py` (frequencies & λ/4 lengths only; no claw/pad/coupling geometry). They become the **GeometryOracle** behind the `SchematicCompiler` param step (plan §6.6 "Params/units").

## 15. Updated architecture diagram (Deliverable 1)

```
Prompt
 └─ Claude (constrained DesignIntent; MAY call SQuADDS MCP to check target feasibility)
     └─ DesignIntent ........ counts, topology, materials, TARGET f_q/α/f_r/κ/g
         └─ ★ PHYSICS GROUNDING — intent-level (NEW, PRE-GRAPH) ★
         │     ├─ ground topology / freq bands / couplings / resonator targets / constraints
         │     ├─ SQuADDS retrieve+interpolate → snap targets to realizable manifold [V1 always]
         │     │   (→ analytic fallback: FrequencyPlanner → catalog defaults: final)
         │     └─ emits PhysicsPlan (grounded targets + cached SQuADDS matches + provenance)
         └─ DesignGraph ...... built FROM PhysicsPlan; nodes carry grounded targets   ◀── Ontology
             └─ GraphValidator (structural)
                 └─ ★ GeometryOracle — node-level (pre-compiler) ★
                 │     ├─ per node: grounded targets → design_options geometry (reuse cached match)
                 │     ├─ PhysicsVerifier (scqubits): geometry → f₀₁/α/T vs targets
                 │     └─ (ML refine [V2] · Palace async verify [V2])
                 └─ SchematicCompiler ... Ontology map + Pin Allocation + Placement(+overlap) + units
                     └─ DesignDocument
                         └─ Validation = DocumentValidator + DRC + ★Physics-Reasonableness Gate★ + repair
                             ├─→ Qiskit Metal (codegen_service)
                             └─→ Editor (result.design inject)
```

**Two grounding touchpoints (per the approved reorder):** *intent-level* grounding runs **before `DesignGraph`** so topology, frequencies, couplings, and resonator targets are grounded *before* graph construction (not patched after); *node-level* `GeometryOracle` runs **before `SchematicCompiler`** to resolve concrete geometry, reusing the SQuADDS matches cached during intent grounding.

**Where each piece belongs:**

- **Claude** — NL → `DesignIntent` (front of pipeline); optional SQuADDS-MCP client for feasibility reasoning.
- **DesignGraph** — logical IR holding *target* params; unchanged location.
- **Ontology / Pin Allocation** — inside `SchematicCompiler` (plan §4–5), now aligned to SQuADDS-covered families.
- **SQuADDS** — primary provider at **both** touchpoints: intent-level grounding **before `DesignGraph`** and node-level `GeometryOracle` **before `SchematicCompiler`**.
- **ML_qubit_design** — Physics Grounding (GeometryOracle alt provider) **and** repair-loop refiner (V2).
- **scqubits** — forward `PhysicsVerifier`, used in grounding and in the reasonableness gate.
- **AWS Palace** — async EM verification (V2), out of the interactive loop.
- **Qiskit Metal** — codegen output; also the *format* SQuADDS/ML emit (`design_options`).

## 16. SQuADDS integration (answers to the brief)

1. **Where it sits (two touchpoints):** (a) **intent-level Physics Grounding** *before* `DesignGraph` — grounds topology, frequency bands, couplings, resonator targets, and constraints, emitting a `PhysicsPlan`; (b) **node-level `GeometryOracle`** *before* `SchematicCompiler` — resolves per-node `design_options` geometry (reusing cached matches). SQuADDS is the primary provider at both.
2. **Before DesignGraph or before Qiskit Metal synthesis?** **Targets-first:** intent-level grounding runs **before `DesignGraph`** (topology/frequencies/couplings grounded *before* graph construction, not patched after); geometry grounding runs **before `SchematicCompiler`**. Claude *may* also consult the SQuADDS **MCP** while forming `DesignIntent`.
3. **What it influences:** **geometry** for given targets — transmon geometry (`cross_length`, claw), **readout design** (`claw_length`, `ground_spacing` → g, κ), **resonator geometry** (λ/4 length, coupling), **coupler geometry** (NCap). It also **realises/snaps** requested **frequencies & couplings** to the nearest experimentally-achievable point (it does not invent targets; it grounds them).
4. **Indexing & querying:** mirror the HF dataset locally; build a normalized **param-vector nearest-neighbour index** per component family (keys: `qubit_frequency_GHz`, `anharmonicity_MHz`, `cavity_frequency_GHz`, `kappa_kHz`, `g_MHz`). Query = `find_closest_designs` → `interpolate_design`; cache by rounded target vector. Use `get_hamiltonian_param_keys` to validate inputs. Embedded lib is the source of truth; MCP is for Claude exploration.
5. **Reliability gain:** replaces guessed `default_options` with **validated, physically-consistent geometry**, so designs are not just structurally valid (Part I guarantee) but resonate near the requested frequencies, hold the dispersive regime, and render/route cleanly. Out-of-range asks are **corrected** (snapped) instead of producing nonsense.

## 17. ML_qubit_design integration (answers to the brief)

1. **DesignGraph nodes?** It reads per-node **target params** off `DesignGraph` nodes → it is an **alternate `GeometryOracle` provider** (same contract as SQuADDS).
2. **Qiskit Metal parameters?** Yes — its **output** is Qiskit Metal `design_options` (TransmonCross, claw+RouteMeander cavity, NCap coupler), written back to nodes/placements.
3. **Before or after placement?** **Before** placement — geometry sets each component's footprint, which the overlap resolver and routing need.
4. **Repair loop?** **Yes** (V2): when `PhysicsVerifier`/Palace shows a target miss, or SQuADDS nearest-neighbour distance exceeds threshold (poor coverage / extrapolation), the ML inverse proposes refined geometry and acts as a **fast forward surrogate** so the loop avoids slow Palace runs.
5. **On-demand or always?** **On-demand.** SQuADDS grounding runs **always** (fast, cached, default). ML triggers only when: (a) SQuADDS coverage is poor, (b) the user requests optimization, or (c) the physics repair loop needs continuous refinement. Palace is async-only.

## 18. New services required (Deliverable 3)

| Service | File | Responsibility | Phase |
|---|---|---|---|
| `GeometryOracle` | `app/services/physics_grounding/oracle.py` | Provider-chain: SQuADDS → (ML) → analytic fallback; returns `design_options` + provenance per node. | V1 |
| `SquaddsClient` | `.../squadds_client.py` | Wrap embedded SQuADDS lib; local dataset mirror; NN index + interpolation + cache. | V1 |
| `SquaddsMcpBridge` | config + `.../mcp.py` | Register SQuADDS MCP for Claude (feasibility tools). | V1 |
| `PhysicsVerifier` | `.../verifier.py` | scqubits forward check (reuse `physics_analysis` + `app/services/physics.py`). | V1 |
| `PhysicsReasonablenessGate` | extend `design_synth/validate.py` | Enforce §21 constraints before editor inject. | V1 |
| `ParameterCache` | reuse `core/registry_cache.py` | target-vector → geometry memoization. | V1 |
| `MlInverseClient` | `.../ml_inverse.py` | Local CosmiQuantum Keras service and/or SQuADDS hosted ML REST. | V2 |
| `PalaceClient` + worker | `.../palace.py` + job queue (extend `simulations.py`) | Async EM verify/calibrate; write-back corrections. | V2 |
| `TrainingDataCollector` | `.../training.py` | Persist (targets, geometry, EM/measured) tuples for retrain + SQuADDS contribution. | V3 |

**DesignGraph node extension:** add `target_params` (already partially present: `frequency_ghz`, `anharmonicity_ghz`), `design_options: dict` (grounded geometry), and `geometry_source: "squadds"|"ml"|"analytic"` provenance. Round-trips via `serializer.py`.

## 19. Data flow diagram (Deliverable 4)

```
NL ──► DesignIntent(targets)
          │
          ▼
   ┌── Physics Grounding (intent-level, PRE-GRAPH) ──┐
   │ SQuADDS retrieve+interpolate (cache)            │ snap freq/coupling/topology → realizable
   │ → analytic fallback → catalog default (final)   │
   └─────────────────────────────────────────────────┘
          │ PhysicsPlan (grounded targets + cached matches + provenance)
          ▼
   DesignGraph(nodes w/ grounded target_params)
          │
          ▼
   ┌── GeometryOracle (node-level) ───┐
   │ reuse cached SQuADDS match       │──► design_options ─┐
   │ ML inverse (V2) · analytic (fb)  │                    │
   └──────────────────────────────────┘                    ▼
          │                                      DesignGraph.nodes.design_options
   scqubits ◄┘ verify · Palace (V2 async) ◄── verify/calibrate
                                                            │
                                                            ▼
                                                   SchematicCompiler (ontology+pins+place+units)
                                                            │
                                                            ▼
                              DesignDocument ──► Validation+ReasonablenessGate+repair
                                                     │            │
                                           Qiskit Metal        Editor (result.design)
```

## 20. Physics-aware copilot architecture (Deliverable 5)

- **Grounded generation:** the copilot never emits geometry; it emits *targets*, which the `GeometryOracle` resolves to validated geometry. "Generate informed by existing quantum design knowledge" = SQuADDS DB + (V2) learned inverse.
- **Tool-augmented reasoning:** Claude can call SQuADDS MCP (`find_closest_designs`, `interpolate_design`, `get_hamiltonian_param_keys`) to answer "is 4.2 GHz / −180 MHz realizable?" and adjust `DesignIntent` before compilation.
- **Verify-then-show:** every grounded design passes scqubits forward verification + the reasonableness gate before injection; provenance (`squadds`/`ml`/`analytic`) and a confidence (NN distance / verifier residual) are attached and surfaced in the editor.
- **Deterministic guarantee preserved:** if SQuADDS/ML are unavailable, the analytic fallback still produces a valid `DesignDocument` (Part I invariants hold); it is merely flagged "physically unverified."

## 21. New copilot goal — Prompt → *Physically Reasonable Design* (Deliverable: goal definition)

**Physically reasonable** = a design whose components, under Hamiltonian/EM simulation, would exhibit parameters within tolerance of the requested targets, in valid operating regimes, using experimentally-grounded geometry.

**Constraints enforced (reasonableness gate):**
- `f_q ∈ 3–8 GHz`; `α ∈ −500…−50 MHz` (transmon); EJ/EC in transmon regime (ratio ≳ 20).
- Dispersive readout: `|f_r − f_q| ≥ 1.0–1.5 GHz`, `g/Δ ≪ 1`; `g ∈ 10–200 MHz`; `κ ∈ 10–1000 kHz` (SQuADDS ranges).
- No nearest-neighbour qubit frequency collision (`≥ ~100–120 MHz`, reuse `frequency_planner` thresholds).
- Geometry realizable: SQuADDS NN distance < threshold **or** scqubits residual < tolerance; else flag.
- Existing DRC (geometry/overlap/on-chip) + fabrication (min linewidth/gap) from `drc/runner.py`.

**Checks before a design reaches the editor:** Part I structural (componentId/pins/names/units/overlap) **→** grounded `design_options` present **→** scqubits forward check within tolerance **→** reasonableness constraints **→** DRC. Failures that the repair loop can't fix are surfaced as **warnings** on the (still-injected) design rather than blocking it — UX stays fluid; physics rigor is visible.

## 22. Updated phase plan + V1/V2/V3 (Deliverables 2, 6, 7, 8)

Extends Part I Phases 0–5 (which remain V1 prerequisites):

- **Phase 6 — Physics Grounding scaffold + ontology integration (V1, Increment 1, no external deps):** create `physics_grounding/` (intent-level `ground_intent`→`PhysicsPlan`) + node-level `GeometryOracle` with **analytic providers only**; create `design_synth/ontology.py` with **`TransmonCross`+claw as the grounded qubit default** (`TransmonPocket` retained legacy); extend `DesignGraph` nodes with `design_options`/`geometry_source`; reorder `design_pipeline` to **ground intent → build graph → resolve geometry → compile**. Analytic path reproduces current behavior → safe. (Detailed in §25.)
- **Phase 7 — SQuADDS provider (V1, Increment 2):** embed SQuADDS lib; **mirror HF dataset locally as source of truth (periodic refresh, no remote calls at generation time)**; NN index + interpolation + cache as the primary provider at both touchpoints; `PhysicsVerifier` (scqubits); `PhysicsReasonablenessGate`; wire SQuADDS MCP to Claude.
- **Phase 8 — ML inverse + repair (V2):** `MlInverseClient` (local CosmiQuantum service and/or SQuADDS hosted API); trigger rules (poor coverage / optimization / repair); ML as in-loop surrogate + refiner.
- **Phase 9 — Palace async verification (V2):** Palace worker behind `simulations.py`; background verify/calibrate selected designs; write-back; "EM-verified" badge.
- **Phase 10 — Closed-loop flywheel (V3):** `TrainingDataCollector`; retrain ML on Palace-verified data; contribute validated designs back to SQuADDS; active-learning EM scheduling; multi-objective inverse-design optimization (fidelity/yield/footprint); optional in-loop Palace for premium designs.

**V1 (now):** SQuADDS retrieval/interpolation grounding + scqubits verification + reasonableness gate (Phases 6–7). **V2:** ML inverse/optimizer in the repair loop + Palace async verification (Phases 8–9). **V3:** self-improving data flywheel (Phase 10).

## 23. Future moat analysis (Deliverable)

- **vs Qiskit Metal / KQCircuits:** geometry libraries that *draw* but don't *know which geometry yields target physics*. Silicofeller adds the inverse-design layer (NL → validated geometry) they lack.
- **vs AWS Palace / FEM stacks:** Palace *solves* (slow, expensive). Silicofeller **avoids solving** for most requests via retrieval/surrogate, using Palace only to verify/expand — cheaper and faster per design.
- **vs internal quantum-CAD stacks:** they lack a knowledge-grounded NL copilot; ours is grounded in a validated DB + (V2) learned inverse + EM verification → defensible accuracy, not hallucination.
- **The flywheel (durable moat):** every Palace/measured outcome (V2/V3) → training data → better ML inverse → contributed back to SQuADDS → broader coverage → fewer EM runs → faster/cheaper/more accurate over time. The proprietary accumulation of **(NL intent → grounded design → verified outcome)** tuples compounds and is hard to replicate.

## 24. New decisions captured / open questions

- **SQuADDS:** hybrid — embedded lib (local dataset mirror, deterministic) **+ MCP to Claude**.
- **ML_qubit_design:** **deferred to V2/V3**; V1 grounds with SQuADDS + scqubits only.
- **Palace:** **async verification (V2)**; not in the interactive loop.
- **RESOLVED — qubit family default:** grounded/AI qubits default to **`TransmonCross` + claw** (claw = `connection_pads.readout`: `cross_length`/`claw_length`/`ground_spacing`, matching SQuADDS `transmon_cross_hamiltonian_inverse`). **`TransmonPocket` retained** as supported legacy/manual. Ontology ranking updated (§4).
- **RESOLVED — dataset strategy:** **mirror SQuADDS locally = source of truth**; periodic upstream refresh; **no remote retrieval during generation**.
- **RESOLVED — grounding posture:** **always enabled, no user toggle**; order = retrieve/interpolate → analytic fallback → catalog defaults (final).
- **RESOLVED — architecture order:** Physics Grounding (intent-level) runs **before `DesignGraph`**; node-level `GeometryOracle` runs before `SchematicCompiler` (diagrams §15/§19 updated).

## 25. Implementation spec — Phase 6 (scaffold) + ontology integration (Increment 1)

**Goal:** stand up the Physics-Grounding stage and the `TransmonCross`-default ontology with **no external dependencies** (analytic providers only), reordering the pipeline to ground intent *before* graph construction. Behavior is preserved (analytic == today's heuristics) while seams for SQuADDS (Increment 2) are created.

**New package `backend/app/services/physics_grounding/`:**
- `targets.py` — `TargetVector(f_q_ghz, alpha_mhz, f_r_ghz, kappa_khz, g_mhz)`, `RoleTargets` (per group/role), `PhysicsPlan(constraints, role_targets, design_options_by_role, provenance, warnings)`.
- `grounding.py` — `ground_intent(intent|DesignConstraints) -> PhysicsPlan`: intent-level stage. V1 analytic = derive bands/targets from `FreqConstraints` + `frequency_planner` thresholds; `SquaddsClient` hook (Increment 2) snaps to realizable. Always-on; analytic fallback; catalog defaults final.
- `oracle.py` — `GeometryOracle.resolve(role, targets, family) -> GroundedGeometry(design_options, source, confidence)` via a `GeometryProvider` chain.
- `providers/base.py`, `providers/analytic.py` (wraps `frequency_planner` + catalog `default_options`), `providers/squadds.py` (**stub** raising `NotAvailable` until Increment 2).
- `verifier.py` — `PhysicsVerifier.verify(design_options, targets)` → residuals (V1 uses `app/services/physics.transmon_properties`; scqubits engine in Increment 2).

**Ontology layer `backend/app/services/design_synth/ontology.py` (new; Part I Phase 0 seed):**
- Build the logical-role → ranked `componentId` map by introspecting `component_catalog.json`.
- **Grounded qubit ranking: `["TransmonCross", "TransmonPocket", "TransmonCrossFL", …]`** (TransmonCross primary). Expose `grounded_default(role)` and `is_grounded_family(componentId)`.
- Claw mapping helper: SQuADDS/analytic outputs → `TransmonCross.design_options` = `cross_length` + `connection_pads.readout.{claw_length, ground_spacing, claw_width, claw_gap, …}` (unit-normalized µm).

**DesignGraph changes (`core/design_graph/`):**
- `node.py` — add `design_options: dict` and `geometry_source: str = "analytic"` to `DesignNode`; surface in `_extra_fields`/`to_dict`.
- `serializer.py` — round-trip the two new fields in `_node_from_dict`.

**Pipeline wiring:**
- `constraints/builder.py` — `build_graph_from_constraints(c, plan: PhysicsPlan | None = None)`: when `plan` given, set node targets from `plan` and qubit family default → `TransmonCross`; else current behavior.
- `services/design_pipeline.py` — reorder `run_design_pipeline`: **`ground_intent()` → `build_graph_from_constraints(plan)` → GraphValidator → per-node `GeometryOracle.resolve()` (write `design_options`/`geometry_source`) → (existing freq/place/route/DRC) → codegen/exports**. Analytic providers keep output identical to today.
- `config.py` — `physics_grounding_enabled: bool = True` (no toggle surfaced) + Increment-2 placeholders `squadds_dataset_dir`, `squadds_refresh_hours`.

**Tests:**
- ontology: `grounded_default("qubit") == "TransmonCross"`; `TransmonPocket` still resolvable.
- grounding: analytic `PhysicsPlan` matches `frequency_planner` bands; always-on; fallback order.
- oracle: chain falls back to analytic when `squadds` stub unavailable; `design_options` unit-normalized.
- serializer: node round-trip preserves `design_options`/`geometry_source`.
- pipeline: 5Q-grid `run_design_pipeline` output unchanged vs baseline except new grounded fields present + qubit family `TransmonCross`.

**Increment boundary:** Increment 1 = everything above (dependency-free). **Increment 2 (Phase 7)** = `SquaddsClient` + local dataset mirror + NN/interp + scqubits verifier + reasonableness gate + MCP wiring.

**Verification:** `pytest` (backend); import smoke for `design_pipeline`; confirm `/api/design/generate` still returns and now includes `geometry_source`.
