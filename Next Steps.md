# Silicofeller Quantum Studio — Editor CAD Audit & Roadmap

A brutally honest EDA/CAD-grade audit of the existing drag-and-drop quantum chip editor, reconciled with prior work (CAD review, routing deep-analysis, and the shipped Phase A route-locking), delivering a maturity score, deep top-30 issues, a compact catalog to ~100, and a prioritized roadmap — all preserving the Qiskit Metal integration and current product workflow.

> Scope: analysis only. No code changes proposed for execution here. Builds on prior work; Phase A (route locking) is treated as partially-complete and reconciled below.

---

## 1. CAD Maturity Score

**Overall: 3.4 / 10** — a capable demo-grade schematic editor with a real Qiskit Metal geometry pipeline, but far below professional CAD on viewport, routing, performance, and data integrity.

| Axis | Score | One-line verdict |
|---|---|---|
| Viewport / navigation (zoom/pan/fit) | 1.5 | Controls exist but are **dead** — not wired to the SVG transform. |
| Routing | 2.5 | Server-owned geometry, re-solved globally; not editable in-canvas. |
| Data integrity / persistence | 2.0 | Conversation round-trip is **lossy** — silently destroys components/params/routes. |
| Performance / scalability | 2.0 | Full backend rebuild + full render on every micro-edit; single serialized worker. |
| Selection | 3.0 | Single-select only; no marquee, no multi, no group. |
| Undo / redo | 3.0 | Works, but snapshots every keystroke/drag tick; wipes selection. |
| Placement | 4.0 | Drag/drop + snap works; fixed extent, coord drift, no align/distribute. |
| Property editing | 4.0 | Bridge-driven fields are good; no validation, commits per keystroke. |
| Keyboard workflow | 5.0 | Decent after prior quick-wins (dup/nudge/rotate/escape). |
| Qiskit Metal compatibility | 6.0 | Solid: server-authoritative geometry; weakened by global rebuild. |

---

## 2. How The Editor Works (end-to-end trace)

```
Mouse / Keyboard
  → React handler (editor-canvas.tsx / schematic-editor.tsx)
    → dispatchActive(EditorAction)
      → workspaceReducer CANVAS_ACTION  → editorReducer (design-store.tsx)
          • bump(): push deep-cloned snapshot to history, rev++
          • new EditorState (placements/connections/selection)
        → WorkspaceState updated → tab.dirty=true
  → React re-render of EditorCanvas
    → renderQ = useQuery(key=["bridge","render", doc])     // doc = whole design
        → POST /design/render (render_service.call, serialized IPC)
          → worker.handle_full_design():
              DesignPlanar() built FROM SCRATCH every call
              instantiate ALL components + ALL routes
              design.rebuild()   ← re-solves EVERY route
            → returns full SVG + per-route SVG map
    → SVG injected via dangerouslySetInnerHTML (component body + per-route)
  ── separately ──
  rev change → debounced 200ms → toGenerateResponse(doc) → conversation.result
                                   (LOSSY: see Issue #1)
  workspace change → debounced 1s + 25s autosave → localStorage (history stripped)
```

Two independent persistence paths exist (conversation `GenerateResponse` and localStorage workspace), and they disagree about what the design *is*.

---

## 3. Root-Cause Analysis (the 6 systemic causes behind most issues)

Most of the 100 issues collapse into six roots:

- **R1 — Server owns ALL route geometry, rebuilt globally.** `worker.handle_full_design` (`@/Users/manannarang/Downloads/studio-main/backend/app/services/worker.py:251-301`) constructs a fresh `DesignPlanar` and calls `design.rebuild()` every request, re-solving every route. → routes move, renders are slow, nothing is incrementally stable. Phase A mitigates *only* explicitly-locked routes.
- **R2 — Render cache key is the entire document.** `renderQ` keyed on `doc` (`@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/editor-canvas.tsx:109-119`). Any field change on any object invalidates the whole render. The Phase A `/design/render-route` endpoint exists but is **not wired** into the canvas.
- **R3 — No transaction/commit model for continuous gestures.** Drag and property typing dispatch one mutating action per event (`@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/editor-canvas.tsx:168-181`, `@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/property-inspector.tsx:52-55`), each `bump()`-ing history and triggering a render.
- **R4 — Viewport state is decorative.** `state.zoom/pan` and `ZOOM/PAN` reducers exist (`@/Users/manannarang/Downloads/studio-main/frontend/src/lib/editor/design-store.tsx:241-244`) but `scale` is derived only from container size (`@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/editor-canvas.tsx:130-132`) and `fitToContent` is a no-op (`:270-272`). No CAD navigation exists.
- **R5 — Two lossy, divergent serialization models.** `toGenerateResponse`/`fromGenerateResponse` (`@/Users/manannarang/Downloads/studio-main/frontend/src/routes/_app/schematic-editor.tsx:62-206`) only understand transmon qubits + `ResonatorCoilRect`, hardcode params, and drop everything else; localStorage stores the full `EditorState` but strips history. The "source of truth" is ambiguous.
- **R6 — Frontend has no geometry/coordinate model of its own.** Components are drawn from per-placement preview SVGs centered at `(x,y)`, while routes are drawn from absolute backend chip coordinates placed at `w2s(0,0)` (`@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/editor-canvas.tsx:456-483`). The two bases can disagree; pins are fetched without params so they never move.

---

## 4. Professional CAD Review (vs Virtuoso / KLayout / Altium / HFSS / Qiskit Metal GUI)

| Capability | This editor | Pro baseline | Gap |
|---|---|---|---|
| Zoom / pan / fit | None functional | Wheel-zoom-to-cursor, MMB-pan, zoom-to-fit/selection | **Critical** |
| Selection | Single click | Click, marquee, +Shift add, Tab-cycle, select-similar | High |
| Move | Drag, 0.05 snap | Drag w/ snap+guides, type exact delta, dynamic dims | High |
| Rotate | R key / 0-90-180-270 | Any angle, about pivot, live angle readout | High |
| Routing | Click pin→pin, server-solved | Interactive route w/ waypoints, width, fillet, push/shove | **Critical** |
| Property edit | Bridge fields | Same + validation, units, multi-edit, commit-on-blur | Med |
| Context menu | None | Right-click contextual actions | High |
| Grid / snap | Fixed 0.05 | Configurable grid, snap modes, snap-to-geometry | High |
| Layers / visibility | None | Layer panel, show/hide/lock per layer | Med |
| Grouping / hierarchy | None | Group, instance, hierarchy navigation | Med |
| Measure / inspect | None | Ruler/measure, coordinate readout at cursor | Med |
| Locking | Inspector toggle (Phase A) | Per-object lock w/ canvas affordance | Partial |

---

## 5. Top 30 Issues (ranked, fully detailed)

Format per issue: **rank. Name** `Priority` · `Effort` · `Risk` — then What / Root cause / Files+Components / Impact (user+eng) / Fix.

### Critical

**1. Lossy conversation round-trip silently destroys design data** `P0` · `M` · `High`
- **What**: Editing then a reload/external-update reduces the design to transmon qubits + resonators with hardcoded params; couplers, launchpads, other components, all params, `routeComponentId`, `routeOverrides`, and Phase-A `locked` flags vanish.
- **Root cause (R5)**: `fromGenerateResponse` hardcodes `componentId:"TransmonPocket"` and `pad_width/pad_height` (`@/Users/manannarang/Downloads/studio-main/frontend/src/routes/_app/schematic-editor.tsx:62-119`); `toGenerateResponse` only serializes transmons + `ResonatorCoilRect` and drops non-qubit connections (`:121-206`); pushed back on every `rev` change (`:309-325`).
- **Files/Components**: `schematic-editor.tsx` (adapters + sync effects); `GenerateResponse` type.
- **Impact**: Catastrophic data loss for users; engineering trust in persistence is zero. Blocks any multi-component design.
- **Fix**: Persist the full `DesignDocument` as the source of truth (store it on the conversation alongside `GenerateResponse`, or extend the response with a `design` blob). Make adapters total/round-trip-safe and add a round-trip test.

**2. Every render rebuilds the whole design and re-solves all routes** `P0` · `L` · `High`
- **What**: Adding/moving anything re-solves unrelated routes, so existing routes move — violating "existing routes must never change unless edited".
- **Root cause (R1)**: `handle_full_design` rebuilds `DesignPlanar` from scratch + `design.rebuild()` (`@/Users/manannarang/Downloads/studio-main/backend/app/services/worker.py:251-301`).
- **Files/Components**: `worker.py`, `render_service.py`.
- **Impact**: Routing instability; slow renders; user can't trust layout. Phase A only freezes *manually locked* routes.
- **Fix**: Persist route geometry per connection and default to cached SVG; only re-solve a route when its endpoints/overrides change (hash-gated). Extend Phase A so caching is automatic, not lock-only.

**3. Render query keyed on the entire document; per-route render unused** `P0` · `M` · `Med`
- **What**: One full `/design/render` round-trip per micro-edit; the incremental `/design/render-route` added in Phase A is never called by the canvas.
- **Root cause (R2)**: `queryKey:["bridge","render", doc]` (`@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/editor-canvas.tsx:109-119`).
- **Files/Components**: `editor-canvas.tsx`, `client.ts` (`renderRoute` exists, unused).
- **Impact**: Excessive renders, latency, worker saturation.
- **Fix**: Split into `useQueries` keyed per connection using `renderRoute`; cache locked routes client-side; render component bodies separately from routes.

**4. Drag mutates state every pointermove (history flood + render per tick)** `P0` · `M` · `Med`
- **What**: Dragging a part fires `MOVE_PLACEMENT` on every move → one undo entry per pixel and a full render attempt per tick.
- **Root cause (R3)**: `onPMove` dispatches immediately (`@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/editor-canvas.tsx:168-181`); `MOVE_PLACEMENT` calls `bump()` (`@/Users/manannarang/Downloads/studio-main/frontend/src/lib/editor/design-store.tsx:136-143`).
- **Files/Components**: `editor-canvas.tsx`, `design-store.tsx`.
- **Impact**: Janky drags; unusable undo; backend hammered.
- **Fix**: Introduce a transient/preview move (no history, no render) during drag; commit one `MOVE_PLACEMENT` (single history entry) on pointer-up; throttle/skip renders mid-gesture.

**5. Viewport zoom/pan/fit are non-functional** `P0` · `M` · `Med`
- **What**: Pan tool, zoom buttons, Fit View (and `F`) do nothing meaningful; scale is auto from container only.
- **Root cause (R4)**: `scale` ignores `state.zoom/pan` (`@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/editor-canvas.tsx:130-132`); `fitToContent` no-op (`:270-272`); `ZOOM/PAN` reducers unused (`@/Users/manannarang/Downloads/studio-main/frontend/src/lib/editor/design-store.tsx:241-244`).
- **Files/Components**: `editor-canvas.tsx`, `editor-toolbar.tsx`, `design-store.tsx`.
- **Impact**: No navigation — disqualifying for real CAD use on dense chips.
- **Fix**: Apply a single `<g transform="translate(pan) scale(zoom)">`; wire wheel-zoom-to-cursor, MMB/Space-drag pan, fit-to-content and zoom-to-selection.

**6. Single serialized IPC worker with 20 ms busy-poll** `P1` · `M` · `Med`
- **What**: All previews + design renders funnel through one subprocess; `call()` busy-waits; concurrent requests queue; no cancellation.
- **Root cause**: `_WorkerManager.call` polls `_pending_jobs` every 20 ms (`@/Users/manannarang/Downloads/studio-main/backend/app/services/render_service.py:124-153`).
- **Files/Components**: `render_service.py`, `worker.py`.
- **Impact**: Latency spikes; UI waits on stale work; CPU spin.
- **Fix**: Event-driven response (condition var/queue per job id); add request coalescing + cancellation of superseded renders; consider a small worker pool for previews vs design.

**7. Undo/redo snapshots every action and wipes selection** `P1` · `M` · `Med`
- **What**: Each keystroke and drag tick deep-clones the whole design into history; undo/redo clears the current selection.
- **Root cause (R3)**: `bump()` on every mutating case + deep `snapshot()` (`@/Users/manannarang/Downloads/studio-main/frontend/src/lib/editor/design-store.tsx:76-92`); undo/redo set `selection:null` (`:255-256, 269-270`).
- **Files/Components**: `design-store.tsx`.
- **Impact**: Memory churn; "undo" feels random (one char at a time); lost context.
- **Fix**: Coalesce continuous edits into one transaction; preserve/restore selection across undo where the object still exists.

### High

**8. No multi-select / marquee / group operations** `P1` · `L` · `Med`
- **What**: Only one object selectable; no box-select, Shift-add, or group move/delete.
- **Root cause**: `Selection` is a single `{kind,id}` (`@/Users/manannarang/Downloads/studio-main/frontend/src/lib/editor/design-store.tsx:25-28`).
- **Impact**: Tedious editing of arrays of qubits; no bulk ops. **Fix**: Generalize selection to a set; add rubber-band marquee + group transforms.

**9. No context (right-click) menus** `P1` · `M` · `Low`
- **What**: No contextual actions anywhere; everything is toolbar/inspector.
- **Root cause**: Not implemented; no `onContextMenu` on canvas/objects.
- **Impact**: Non-CAD feel; slow workflows. **Fix**: Object + canvas context menus (delete, duplicate, lock, rotate, route).

**10. Property edits commit on every keystroke** `P1` · `S` · `Med`
- **What**: Typing in a field dispatches `UPDATE_PLACEMENT`/`updateParam` per character → snapshot + full render per char; invalid intermediate values applied.
- **Root cause (R3)**: `onChange` → dispatch (`@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/property-inspector.tsx:52-55, 99-114, 168-172`).
- **Impact**: Lag, history spam, transient invalid geometry. **Fix**: Local field state, commit on blur/Enter; validate + units.

**11. Routes are not editable in-canvas** `P1` · `XL` · `High`
- **What**: Routing is click-pin→click-pin only; no waypoints, vertices, width handles, fillet, or rubber-band; geometry fully server-owned.
- **Root cause (R1/R6)**: No client route model; `PIN_CLICK` just creates a `Connection` (`@/Users/manannarang/Downloads/studio-main/frontend/src/lib/editor/design-store.tsx:166-193`).
- **Impact**: Cannot tune CPW routing — core EDA task. **Fix**: Phase B+ interactive routing (waypoints/width/fillet) persisted on `Connection` and passed as Qiskit Metal options.

**12. Pins are keyed by componentId only and fetched without params** `P1` · `S` · `Med`
- **What**: Pin markers don't move when params that change pin geometry are edited; pin hints may mismatch actual geometry.
- **Root cause (R6)**: `componentPinsQueryOptions(p.componentId)` (`@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/editor-canvas.tsx:125-127`); rendered at `pin.hint` (`:891-893`).
- **Impact**: Connections attach to wrong visual points. **Fix**: Key pins by `(componentId, params)` and request with params.

**13. Route SVG placed at world origin; components placed individually** `P1` · `M` · `High`
- **What**: Routes drawn from absolute chip coords at `w2s(0,0)`, components from per-placement centered previews → systematic misalignment possible.
- **Root cause (R6)**: `@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/editor-canvas.tsx:456-483` vs `:698-742`.
- **Impact**: Routes visually detached from pins/components. **Fix**: Unify on one coordinate basis (prefer absolute backend geometry for the whole board, or transform routes into placement space consistently).

**14. Hover hit-areas are absolute HTML divs over the SVG** `P2` · `S` · `Med`
- **What**: Fixed-square divs at `zIndex:15` track hover; they don't rotate/scale with glyphs and can intercept pointer events.
- **Root cause**: `@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/editor-canvas.tsx:631-644`.
- **Impact**: Wrong hover targets; blocked clicks on dense layouts. **Fix**: Do hover inside SVG via element `pointerenter/leave`.

**15. Chip extent hardcoded ±4.5/±3.0 mm in many places** `P2` · `S` · `Low`
- **What**: Drag clamp, drop clamp, rulers, and keyboard nudge all assume a 9×6 mm chip; HUD even prints "9.0 × 6.0 mm" literally.
- **Root cause**: Magic numbers (`@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/editor-canvas.tsx:177-178, 202-203, 264-266, 666-667`; nudge clamp `@/Users/manannarang/Downloads/studio-main/frontend/src/routes/_app/schematic-editor.tsx:399-401`).
- **Impact**: Wrong for any other chip size; duplicated constants drift. **Fix**: Single chip-size source; derive clamps/rulers from it.

**16. Object locking has no canvas affordance** `P2` · `S` · `Low`
- **What**: Phase A lock is inspector-only; locked routes look identical on canvas and placements can't be locked at all.
- **Root cause**: Phase A scoped to connections + inspector (`@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/property-inspector.tsx:243-261`).
- **Impact**: Users can't see/trust what's frozen. **Fix**: Lock badge/style on canvas; extend lock to placements; right-click lock.

**17. Snap is a single hardcoded 0.05 mm; no snap modes** `P2` · `M` · `Low`
- **What**: No grid toggle, no snap-to-pin/edge/object, no fine/coarse control beyond Shift-nudge.
- **Root cause**: `snap = 0.05` literals (`@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/editor-canvas.tsx:174-176, 199-201, 262-264`).
- **Impact**: Imprecise alignment; no pin snapping for routing. **Fix**: Configurable grid + snap-mode system.

**18. Connection fallback drawn center-to-center, not pin-to-pin** `P2` · `S` · `Low`
- **What**: Before route SVG arrives, connection is a straight dashed line between component centers.
- **Root cause**: `@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/editor-canvas.tsx:484-521` uses `a.x,a.y`/`b.x,b.y`.
- **Impact**: Misleading preview; jumps when real route loads. **Fix**: Draw fallback between actual pin positions.

**19. Rename uses blocking `window.prompt`** `P2` · `S` · `Low`
- **What**: Double-click label opens a browser prompt; no inline edit; no uniqueness/validation.
- **Root cause**: `@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/editor-canvas.tsx:881-887`.
- **Impact**: Jarring, non-CAD. **Fix**: Inline `<input>` overlay with validation.

**20. Rotation limited to 0/90/180/270 in UI** `P2` · `S` · `Low`
- **What**: Inspector offers only 4 angles; no arbitrary rotation though backend accepts `orientation`.
- **Root cause**: `@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/property-inspector.tsx:117-133`.
- **Impact**: Can't match angled layouts. **Fix**: Numeric angle input + rotate handle.

### Medium

**21. Phase A cache is never auto-populated; no geometry hash** `P2` · `M` · `Med`
- **What**: Locking a route that has no `cachedSvg` yields a blank route; `cachedGeometryHash` is defined but never computed, so stale caches can't be detected.
- **Root cause**: `SET_CONNECTION_GEOMETRY` exists but is never dispatched; `render_design` serves `cachedSvg` only if present (`@/Users/manannarang/Downloads/studio-main/backend/app/services/render_service.py:279-281`).
- **Impact**: Lock feature is partially inert. **Fix**: Populate cache on every successful route render; compute + check hash on endpoint/override change.

**22. No render cancellation; superseded renders still complete** `P2` · `M` · `Med`
- **What**: Rapid edits leave stale renders running; `placeholderData` hides it but the worker still does the work.
- **Root cause**: serialized `call()` ignores Abort; `@/Users/manannarang/Downloads/studio-main/backend/app/services/render_service.py:124-153`.
- **Impact**: Wasted compute, latency. **Fix**: Abort/skip superseded jobs; honor `AbortSignal` through to the worker queue.

**23. History deep-clones the full design (memory/GC)** `P2` · `S` · `Med`
- **What**: 50 snapshots × full placements+connections clones; large designs churn memory.
- **Root cause**: `snapshot()` maps + spreads everything (`@/Users/manannarang/Downloads/studio-main/frontend/src/lib/editor/design-store.tsx:76-84`).
- **Impact**: Scales poorly. **Fix**: Structural sharing / patch-based (immer) history.

**24. localStorage save can silently fail on quota** `P3` · `S` · `Low`
- **What**: `persistWorkspace` swallows quota errors; large designs just don't save, no user signal.
- **Root cause**: `@/Users/manannarang/Downloads/studio-main/frontend/src/lib/editor/workspace-store.tsx:113-118`.
- **Impact**: Silent data loss. **Fix**: Detect failure, surface a warning, consider IndexedDB.

**25. Selection not reconciled against external doc updates** `P2` · `S` · `Med`
- **What**: External conversation update can replace objects while a now-missing id stays selected; inspector shows "no longer exists".
- **Root cause**: `LOAD` clears selection only on explicit load; external sync path may not (`@/Users/manannarang/Downloads/studio-main/frontend/src/routes/_app/schematic-editor.tsx:249-296`).
- **Impact**: Stale UI. **Fix**: Validate/clear selection after any doc replacement.

**26. Keyboard model incomplete** `P3` · `S` · `Low`
- **What**: Arrow-nudge/duplicate only for placements (not connections); no Tab-cycle, no zoom keys, no shortcut help.
- **Root cause**: `@/Users/manannarang/Downloads/studio-main/frontend/src/routes/_app/schematic-editor.tsx:327-440`.
- **Impact**: Power-user friction. **Fix**: Extend shortcuts; add a help overlay.

**27. No live drag guides / dimension readout** `P3` · `M` · `Low`
- **What**: HUD shows X/Y/Rot only after selection; no during-drag dims, alignment guides, or cursor coordinate readout.
- **Root cause**: HUD is post-select static (`@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/editor-canvas.tsx:646-669`).
- **Impact**: Imprecise placement. **Fix**: Live dims + snap guides + cursor coords.

**28. Component preview refetched per placement** `P3` · `S` · `Low`
- **What**: `useQueries` fetches a preview per placement even when `(componentId, params)` are identical.
- **Root cause**: per-placement preview queries (`@/Users/manannarang/Downloads/studio-main/frontend/src/components/quantum-editor/editor-canvas.tsx:698-742, 125-127`).
- **Impact**: Redundant worker/network load. **Fix**: Dedupe by `(componentId, params)` key (React Query already helps if keys match — ensure they do).

**29. DRC/validation not surfaced in the editor** `P2` · `M` · `Low`
- **What**: `validate_design` exists server-side but no canvas/inspector surface for violations.
- **Root cause**: endpoint unused by editor (`@/Users/manannarang/Downloads/studio-main/backend/app/services/render_service.py:285-...`).
- **Impact**: Users ship invalid geometry blind. **Fix**: Wire validation; show markers/list.

**30. Route↔component matching by Qiskit component number is fragile** `P3` · `M` · `Med`
- **What**: Routes are mapped to SVG by matching `row.component == route id`; rebuild reordering or id reuse could mis-attribute geometry.
- **Root cause**: `@/Users/manannarang/Downloads/studio-main/backend/app/services/worker.py:311-326`.
- **Impact**: Wrong route highlight/extraction. **Fix**: Tag geometry by stable connection id; verify mapping.

---

## 6. Issue Catalog #31–100 (compact)

Ranked-but-grouped; `Pri`/`Eff` shown. Each is a real, distinct gap observed in the code/UX.

### Viewport & Navigation
- 31. No zoom-to-selection — P2/S
- 32. No wheel-zoom at all — P1/S
- 33. No keyboard zoom (+/-/0) — P3/S
- 34. No mini-map/overview for dense chips — P3/M
- 35. Rulers don't track a cursor crosshair — P3/S
- 36. No "actual size"/scale indicator — P3/S
- 37. Pan tool selected but cursor/behavior unchanged — P2/S
- 38. No momentum/space-drag pan — P3/S

### Selection & Manipulation
- 39. Deleting via inspector leaves focus state stale — P3/S
- 40. No "select all / none / invert" — P2/S
- 41. No select-similar (by component type) — P3/S
- 42. No alignment (left/right/top/center) — P2/M
- 43. No distribute spacing — P3/M
- 44. No nudge for connections — P3/S
- 45. No drag handles for rotate/scale on canvas — P2/M
- 46. Drag has no escape-to-cancel (revert) — P2/S
- 47. Click-empty clears selection but not pendingPin reliably in all paths — P3/S
- 48. No hover tooltip with component/param summary — P3/S

### Routing
- 49. No route width/gap editing in inspector — P1/M
- 50. No fillet control in UI (backend supports it) — P1/M
- 51. No manual waypoints/vertices — P1/XL
- 52. No CPW-specific net/length readout — P2/M
- 53. No route DRC (spacing/min-width) feedback — P2/M
- 54. Can create duplicate connection between same pins — P3/S
- 55. Self-loop guard only in backend validate, not in UI — P3/S
- 56. No visual direction/flow on routes — P3/S
- 57. Route label always shows "CPW"/component id, not net — P3/S
- 58. No push/shove or obstacle avoidance — P3/XL
- 59. Locked route still re-extracted server-side (excluded from rebuild but recomputed each call) — P3/M
- 60. No per-route override validation against Qiskit option schema — P2/M

### Placement
- 61. Objects can overlap with no warning — P2/M
- 62. No collision/overlap detection — P2/M
- 63. Coord drift: `toFixed(3)` on add vs raw snap on move — P3/S
- 64. Duplicate offset fixed at +0.2/−0.2, can exceed chip bounds — P3/S
- 65. `_uiScale` private param leaks into params map — P3/S
- 66. No flip/mirror — P3/S
- 67. No paste-in-place / cross-tab copy — P2/M
- 68. Default `connection_pads` injected heuristically server-side — P3/M
- 69. Drop position ignores component footprint (centers on cursor) — P3/S

### Property System
- 70. No units enforcement/parsing (`455um` is a raw string) — P2/M
- 71. No min/max/range validation — P2/M
- 72. Invalid value can throw in Qiskit (caught, route/comp silently dropped) — P2/M
- 73. No multi-object property edit — P2/M
- 74. No "reset to default" per field — P3/S
- 75. Param edits not debounced (see #10) — P1/S
- 76. No indication which params affect geometry vs metadata — P3/S
- 77. Pins table "Net" only shows connected/open, no net name — P3/S

### Rendering & Performance
- 78. Full SVG re-injected via `dangerouslySetInnerHTML` each render — P2/M
- 79. No virtualization for many components — P3/L
- 80. `placeholderData:(prev)=>prev` can show stale geometry after deletes — P3/S
- 81. Route map retains stale entries when connections removed — P3/S
- 82. No loading skeleton per-route (global "rendering" only) — P3/S
- 83. Preview cache keyed default-only server-side; user-param previews skip cache — P3/S
- 84. No FPS/throttle guard on ResizeObserver-driven re-render — P3/S
- 85. Large SVG strings stored in React Query cache (memory) — P3/M

### Data, Sync & Persistence
- 86. Two sources of truth (conversation vs localStorage) can diverge — P1/M
- 87. 200 ms push + 1 s persist + 25 s autosave timers can interleave/race — P2/M
- 88. History stripped before persist (undo lost on reload) — P3/S (by design, but undocumented)
- 89. No schema/version migration for persisted `EditorState` — P2/M
- 90. `rev`-based dirty detection can miss no-op loads — P3/S
- 91. No export of `DesignDocument` (only SVG/PNG/JPG + generated code) — P2/S
- 92. No import of a saved design file — P2/M

### Interaction polish / CAD-feel
- 93. No status bar with tool + coords + grid + zoom — P2/M
- 94. No command palette — P3/M
- 95. No onboarding/empty-state beyond one hint line — P3/S
- 96. No keyboard-shortcut discoverability — P3/S
- 97. Toasts used for destructive confirms inconsistently — P3/S
- 98. No "unsaved changes" guard on navigation/close — P2/S
- 99. No accessibility (focus order, ARIA on canvas controls) — P3/M
- 100. No telemetry/error reporting for failed renders beyond a small banner — P3/S

---

## 7. Focused Reviews

**Performance.** The dominant costs are R1+R2+R3: full backend rebuild × full-doc cache key × per-event mutation. A single drag of one qubit across a 10-component chip can trigger dozens of full `DesignPlanar` rebuilds. The serialized worker (#6) and SVG re-injection (#78) compound it. Biggest wins: per-route incremental render (wire Phase A), commit-on-pointer-up, event-driven worker.

**Routing.** Geometry is correct (Qiskit Metal) but globally unstable (#2) and uneditable (#11, #49–51). Phase A added locking + a render-route endpoint and a `cachedSvg` field, but caching is inert (#21) and the canvas still uses the whole-doc render (#3). The honest state: *the mechanism to stop routes moving exists but isn't fully wired*.

**Placement.** Drag/drop + 0.05 snap works and feels okay, but fixed extent (#15), overlap (#61–62), coord drift (#63), and no align/distribute (#42–43) keep it below pro grade.

**Interaction.** Keyboard is respectable post quick-wins; the glaring holes are dead viewport (#5, #31–38), no multi-select (#8), no context menus (#9), and `window.prompt` rename (#19) — all of which read as "web app", not "CAD".

**Qiskit Metal compatibility.** Strong and worth protecting: server-authoritative geometry, options passed through (`routeOverrides`, `connection_pads`, `orientation`). Risks are (a) no validation of user params against the option schema (#70–72), (b) fragile route↔geometry matching (#30/#59), and (c) the lossy adapter (#1) which is a *frontend* problem, not a Qiskit one.

---

## 8. Roadmap (prioritized, reconciled with prior work)

**Quick wins (≤1 day each)**
- Wire wheel-zoom + pan + fit/zoom-to-selection (#5, #32, #31).
- Commit-on-pointer-up for drag; transient preview move (#4).
- Debounce property edits, commit on blur (#10, #75).
- Inline rename replacing `window.prompt` (#19).
- Replace hover divs with in-SVG hover (#14).
- Single chip-size constant (#15).

**Critical (stability + data integrity)**
- Make the conversation round-trip lossless / store full `DesignDocument` (#1, #86, #91–92, #89).
- Auto-populate route geometry cache + hash; default to cached, re-solve only on change; finish wiring Phase A per-route render (#21, #2, #3).

**High (CAD interaction)**
- Multi-select + marquee + group ops (#8, #40, #42–43).
- Context menus (#9).
- Route width/gap/fillet editing in inspector (#49–50, #60).

**Performance**
- Event-driven worker + cancellation + coalescing (#6, #22).
- Per-route incremental render in canvas (#3); separate component vs route queries.
- Patch-based history (#23, #7).

**Routing (Phase B+ as previously framed)**
- Interactive waypoints/vertices/width handles persisted on `Connection` → Qiskit options (#11, #51).
- Route DRC + length/net readouts (#52–53).

**Placement / Property / Viewport (Medium)**
- Overlap detection, align/distribute, flip/mirror (#61–66).
- Units + range validation, multi-edit (#70–73).
- Status bar, mini-map, crosshair, grid/snap modes (#93, #34–35, #17).

---

## 9. Recommended Refactoring Plan (surgical, preserves architecture + Qiskit Metal)

1. **Introduce a transaction boundary in the reducer.** Add `BEGIN_TRANSIENT` / `COMMIT` (or a `transient` flag on move/update) so continuous gestures mutate without `bump()` and produce exactly one history entry on commit. Fixes #4, #7, #10 at the root.
2. **Promote `DesignDocument` to the persistence source of truth.** Keep `GenerateResponse` as a derived view; store the full document on the conversation and in localStorage with a version field + migration. Fixes #1, #86, #89.
3. **Split rendering into component-body vs per-route queries.** Use the Phase A `/design/render-route` for connection geometry keyed by `(connectionId, endpointHash, overridesHash)`; cache + auto-populate `cachedSvg`. Fixes #2, #3, #21.
4. **Make the worker event-driven + cancellable.** Replace busy-poll with a per-job future and support abort of superseded jobs. Fixes #6, #22.
5. **Add a viewport transform layer.** One pan/zoom `<g>` wrapper + input handlers; derive rulers/clamps from a single chip-size config. Fixes #5, #15, #31–38.
6. **Generalize selection to a set** and render hover/selection inside SVG. Fixes #8, #14.

None of these change the Qiskit Metal contract; they change *when* and *how much* of it we invoke.

---

## 10. 30-Day Editor Improvement Plan

**Week 1 — Stability & data integrity**
- Lossless `DesignDocument` persistence + migration (#1, #86, #89).
- Reducer transaction model; commit-on-up; debounced property edits (#4, #7, #10).
- Finish Phase A: auto-cache route geometry + hash, default-to-cached (#21, #2).

**Week 2 — Performance & rendering**
- Wire per-route incremental render in canvas (#3); separate component/route queries.
- Event-driven worker + cancellation/coalescing (#6, #22).
- Patch-based history (#23).

**Week 3 — CAD navigation & selection**
- Functional zoom/pan/fit/zoom-to-selection + status bar + crosshair (#5, #31–38, #93).
- Multi-select + marquee + group move/delete + align/distribute (#8, #40, #42–43).
- In-SVG hover; inline rename; context menus (#14, #19, #9).

**Week 4 — Routing & properties**
- Route width/gap/fillet editing + override validation (#49–50, #60, #70–72).
- Route DRC + length/net readouts; surface design validation (#52–53, #29).
- Overlap detection + snap-mode/grid config (#61–62, #17).

**Exit criteria:** maturity ≥ 6/10 — functional viewport, stable routes by default, lossless persistence, multi-select, in-canvas route tuning, and no full-design rebuild on routine edits.

---

## Risk Register
- **Persistence migration (#1/#89)** — must stay backward-compatible with existing conversations; gate behind a version field + round-trip tests. *High.*
- **Per-route render wiring (#3)** — touches coordinate math + query keys + worker contract; land behind visual-regression checks. *Med.*
- **Worker concurrency change (#6)** — risk of deadlock/ordering bugs; add timeouts + tests. *Med.*
- **Coordinate unification (#13/#6)** — route/component alignment regressions; validate against known-good designs. *Med.*
- **Transaction model (#4/#7)** — ensure no dropped commits on rapid gestures; cover with tests. *Med.*

---

*Honest bottom line: the Qiskit Metal core is solid and worth protecting, but the editor around it is demo-grade. The two highest-leverage fixes are (1) lossless persistence and (2) finishing the per-route incremental/cached rendering that Phase A started — together they remove most data-loss and route-instability complaints. Functional viewport, multi-select, and in-canvas route tuning are what move this from "web demo" to "CAD tool".*
