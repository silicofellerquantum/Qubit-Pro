# Implementation Plan: Magic Pencil Tool

## Overview

Add a `"pencil"` draw-to-connect mode to the schematic editor. The work flows
top-down through the data layer, then the canvas, then the overlay, then the
toolbar and keyboard shortcuts, and finally the test suite. Each task is
independently compilable and wires cleanly into the previous step.

---

## Tasks

- [ ] 1. Extend state types and the reducer in `design-store.tsx`
  - In `frontend/src/lib/editor/design-store.tsx`:
    - Change `export type Tool = "select" | "pan" | "route"` →
      `"select" | "pan" | "pencil"` (the existing `"route"` literal is the old
      name shown in the file; align it with how the toolbar/canvas already use it,
      then add `"pencil"`)
    - Add `PencilDragState` interface (fields: `sourcePlacementId`, `sourcePinName`,
      `cursorWorld: { x; y }`, `snapTarget: { placementId; pinName } | null`)
    - Add `pencilDrag: PencilDragState | null` to `EditorState`; initialise to
      `null` in `initialEditorState`
    - Extend `EditorAction` union with four new variants:
      `PENCIL_DRAG_START`, `PENCIL_DRAG_MOVE`, `PENCIL_DRAG_END`,
      `PENCIL_DRAG_CANCEL`
    - Export constant `export const PENCIL_SNAP_RADIUS_PX = 24`
    - Add reducer cases:
      - `PENCIL_DRAG_START` — reject occupied source pin (set `lastBlockReason`,
        return unchanged), otherwise set `pencilDrag`; no `bump()`
      - `PENCIL_DRAG_MOVE` — update `pencilDrag.cursorWorld` and
        `pencilDrag.snapTarget`; no `bump()`
      - `PENCIL_DRAG_END` — run full validation (self-pin, self-loop,
        duplicate edge, source capacity, target capacity); on failure clear
        `pencilDrag` + set `lastBlockReason`; on success call `bump()`, append
        `Connection` with `routeComponentId: "RouteMeander"`, update `selection`,
        clear `pencilDrag`
      - `PENCIL_DRAG_CANCEL` — set `pencilDrag: null`, clear `lastBlockReason`
    - Export pure helper `findNearestPin(placements, pinMap, cursorScreen, w2s,
      sourcePlacementId, sourcePinName, snapRadiusPx?)` — O(P × pins) scan,
      skips source pin, returns first candidate within `PENCIL_SNAP_RADIUS_PX`
      or `null`
  - _Requirements: 1.2, 1.4, 2.1–2.4, 3.1–3.5, 4.1–4.4, 5.1–5.6, 6.1–6.3,
    7.1–7.4_

- [ ] 2. Toolbar button — add Pencil to `editor-toolbar.tsx`
  - In `frontend/src/components/quantum-editor/editor-toolbar.tsx`:
    - Add `import { Pencil } from "lucide-react"` alongside the existing
      `MousePointer2` and `Hand` imports
    - Insert a `<TB>` button for the pencil tool between the Pan button and the
      first `<Separator>`:
      ```tsx
      <TB icon={Pencil} label="Pencil (P)" active={state.tool === "pencil"}
          onClick={() => setTool("pencil")} />
      ```
    - No other toolbar changes required
  - _Requirements: 1.1, 1.2, 1.3_

  - [ ]* 2.1 Write unit tests for toolbar pencil button
    - File: `frontend/src/components/quantum-editor/__tests__/editor-toolbar.test.tsx`
    - Test: renders a button whose accessible label includes "Pencil"
    - Test: clicking it dispatches `SET_TOOL "pencil"`
    - Test: button has active CSS class when `state.tool === "pencil"`
    - Test: button has no active CSS class when `state.tool !== "pencil"`
    - _Requirements: 1.1, 1.2, 1.3_

- [ ] 3. Canvas event routing and component-move suppression in `editor-canvas.tsx`
  - In `frontend/src/components/quantum-editor/editor-canvas.tsx`:
    - **`onPDown`** — add pencil branch (runs before the existing pan/bg checks):
      1. If `state.tool !== "pencil"` fall through to existing logic
      2. Convert client coords to screen-space px via SVG `getBoundingClientRect`
      3. Call `findNearestPin`; if null dispatch `SELECT({ selection: [] })`
         and return
      4. Dispatch `PENCIL_DRAG_START` with snapped source pin + initial
         `cursorWorld` (convert screen px → world mm via `s2w`)
      5. Call `svgRef.current.setPointerCapture(e.pointerId)`
      6. `e.stopPropagation()` to prevent component-drag handler from firing
    - **`onPMove`** — add pencil branch (runs when `state.pencilDrag !== null`):
      1. Compute `cursorWorld` via existing `s2w` logic
      2. Compute screen-space px from `getBoundingClientRect`
      3. Call `findNearestPin` (excluding source pin) → `snapTarget`
      4. Dispatch `PENCIL_DRAG_MOVE({ cursorWorld, snapTarget })`
      5. Early-return to skip component-drag move logic
    - **`onPUp`** — add pencil branch (runs when `state.pencilDrag !== null`):
      1. Release pointer capture via `releasePointerCapture`
      2. If `state.pencilDrag.snapTarget !== null` dispatch `PENCIL_DRAG_END`
      3. Else dispatch `PENCIL_DRAG_CANCEL`
      4. Early-return
    - **`onPointerCancel`** — already routed to `onPUp`; no extra change needed
    - **`makePlacementHandlers` → `onPointerDown`** — add guard after the
      existing `if (state.tool === "pan") return` check:
      ```typescript
      if (state.tool === "pencil") return;
      ```
    - Wire `<PencilPreviewOverlay>` inside the `<g clipPath="...">` block,
      after all other layers (see Task 4)
  - _Requirements: 2.1–2.4, 3.5, 5.1, 6.3_

- [ ] 4. `PencilPreviewOverlay` component inside `editor-canvas.tsx`
  - Define a local (non-exported) component `PencilPreviewOverlay` in
    `frontend/src/components/quantum-editor/editor-canvas.tsx`:
    - Props: `pencilDrag: PencilDragState`, `placements: Placement[]`,
      `pinMap: Map<string, PinSpec[]>`, `connections: Connection[]`,
      `w2s: (x, y) => { px, py }`
    - Rendering logic:
      - Resolve source pin screen position via `pinWorldPos` + `w2s`
      - If `snapTarget` non-null: resolve target pin screen position; check
        `isTargetInvalid` (self-loop, duplicate edge, over-capacity)
      - Else: fall back to `w2s(cursorWorld.x, cursorWorld.y)`
      - `lineColor = isInvalid ? "#ef4444" : "var(--primary)"`
    - SVG output (all with `pointerEvents="none"`):
      - `<line>` dashed (`strokeDasharray="6 4"`) 2 px, `strokeLinecap="round"`,
        `opacity={0.85}`
      - `<circle r={6}` source pin indicator — always visible during drag,
        filled `var(--primary)`, white stroke
      - `<circle r={10}` target pin halo — only when `snapTarget !== null`,
        filled + stroked in either red or primary at 0.2 opacity fill
    - Define helper `isTargetInvalid(pencilDrag, connections)` checking
      self-loop, duplicate edge, and target pin occupancy ≥ `maxConnectionsForPin`
  - Render it inside `EditorCanvas` in the `<g clipPath="url(#boardClip)">` block,
    after all hit-area layers:
    ```tsx
    {state.pencilDrag && (
      <PencilPreviewOverlay
        pencilDrag={state.pencilDrag}
        placements={state.placements}
        pinMap={pinMap}
        connections={state.connections}
        w2s={w2s}
      />
    )}
    ```
  - _Requirements: 3.1–3.5, 5.1, 8.4, 8.5_

  - [ ]* 4.1 Write unit tests for `PencilPreviewOverlay`
    - File: `frontend/src/components/quantum-editor/__tests__/pencil-preview-overlay.test.tsx`
    - Test: renders a `<line>` element while `pencilDrag` is non-null
    - Test: line stroke is `"var(--primary)"` when snap target is valid
    - Test: line stroke is `"#ef4444"` when snap target is invalid (self-loop)
    - Test: line stroke is `"#ef4444"` when snap target pin is at capacity
    - Test: source pin `<circle r=6>` is always rendered during drag
    - Test: target halo `<circle r=10>` is rendered only when `snapTarget` is set
    - _Requirements: 3.1–3.4, 8.4, 8.5_

- [ ] 5. Keyboard shortcuts in `schematic-editor.tsx`
  - In `frontend/src/routes/_app/schematic-editor.tsx`:
    - **Add `"p"` shortcut** — inside the `onKey` handler, after the Space
      branch and before the `"g"` branch:
      ```typescript
      } else if (!inInput && e.key.toLowerCase() === "p" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "SET_TOOL", tool: "pencil" },
        });
      ```
    - **Extend the `Escape` branch** — prepend pencil-drag cancellation before
      the existing `pendingPin` check:
      ```typescript
      } else if (e.key === "Escape") {
        if (activeTab.state.pencilDrag) {
          dispatch({
            type: "CANVAS_ACTION",
            id: activeTab.id,
            action: { type: "PENCIL_DRAG_CANCEL" },
          });
        } else if (activeTab.state.pendingPin) {
          dispatch({ type: "CANVAS_ACTION", id: activeTab.id, action: { type: "CANCEL_PIN" } });
        } else {
          canvasRef.current?.cancelDrag();
          dispatch({ type: "CANVAS_ACTION", id: activeTab.id, action: { type: "SET_TOOL", tool: "select" } });
          dispatch({ type: "CANVAS_ACTION", id: activeTab.id, action: { type: "SELECT", selection: [] } });
        }
      }
      ```
    - Also add `activeTab.state.pencilDrag` to the `useEffect` dependency array
      for `onKey` so stale closures cannot miss in-progress drag state
  - _Requirements: 1.4, 6.1, 6.2_

  - [ ]* 5.1 Write unit tests for keyboard shortcut wiring
    - File: `frontend/src/routes/_app/__tests__/schematic-editor-shortcuts.test.tsx`
    - Test: pressing `"p"` outside an input dispatches `SET_TOOL "pencil"`
    - Test: pressing `"p"` inside a text input does nothing
    - Test: pressing `Escape` while `pencilDrag` is non-null dispatches
      `PENCIL_DRAG_CANCEL` (not `CANCEL_PIN`, not `SET_TOOL`)
    - Test: pressing `Escape` while `pendingPin` is non-null dispatches
      `CANCEL_PIN` (not `PENCIL_DRAG_CANCEL`)
    - Test: pressing `Escape` with neither `pencilDrag` nor `pendingPin`
      dispatches `SET_TOOL "select"` and `SELECT []`
    - _Requirements: 1.4, 6.1, 6.2_

- [ ] 6. Checkpoint — ensure build compiles and existing tests still pass
  - Run `npm run build` (or `tsc --noEmit`) inside `frontend/` to verify no
    TypeScript errors introduced by the new types and action variants
  - Run `npx vitest run` inside `frontend/` to confirm the pre-existing
    `design-store.test.ts` passes unchanged
  - Ensure all tests pass; ask the user if questions arise.

- [ ] 7. Reducer unit tests in `design-store.test.ts`
  - Extend `frontend/src/lib/editor/design-store.test.ts` with a new `describe`
    block `"editorReducer — pencil tool"`:

  - [ ]* 7.1 `PENCIL_DRAG_START` valid pin sets `pencilDrag`
    - Build a minimal `EditorState` with one placement and no connections
    - Dispatch `PENCIL_DRAG_START` for a free pin
    - Assert `pencilDrag` is non-null with correct `sourcePlacementId`,
      `sourcePinName`, `snapTarget: null`
    - Assert `past`, `connections`, `placements` are unchanged (no `bump`)
    - _Requirements: 2.1, 2.3, 3.5_

  - [ ]* 7.2 `PENCIL_DRAG_START` occupied pin leaves `pencilDrag` null
    - Build a state where the target pin already has `maxConnectionsForPin`
      connections
    - Dispatch `PENCIL_DRAG_START`
    - Assert `pencilDrag` remains `null`, `lastBlockReason` is a non-empty string
    - _Requirements: 2.2_

  - [ ]* 7.3 `PENCIL_DRAG_MOVE` updates cursor and snap target without bumping
    - Start with a `pencilDrag` already set
    - Dispatch `PENCIL_DRAG_MOVE` with new `cursorWorld` and a non-null
      `snapTarget`
    - Assert `pencilDrag.cursorWorld` and `pencilDrag.snapTarget` reflect the
      dispatched values
    - Assert `past.length` is unchanged
    - _Requirements: 3.1, 3.2, 3.5_

  - [ ]* 7.4 `PENCIL_DRAG_CANCEL` clears `pencilDrag` and `lastBlockReason`
    - Dispatch `PENCIL_DRAG_CANCEL` on a state with a non-null `pencilDrag`
    - Assert `pencilDrag === null`, `lastBlockReason === null`
    - _Requirements: 5.6, 6.1_

  - [ ]* 7.5 `PENCIL_DRAG_END` self-pin — rejected, no new connection
    - Dispatch `PENCIL_DRAG_END` with target matching source `placementId` +
      `pinName`
    - Assert `connections.length` unchanged, `pencilDrag === null`,
      `lastBlockReason` is null (silent cancel, not an error toast)
    - _Requirements: 5.2_

  - [ ]* 7.6 `PENCIL_DRAG_END` self-loop — rejected, no new connection
    - Dispatch `PENCIL_DRAG_END` where target is a different pin on the same
      placement
    - Assert `connections.length` unchanged, `pencilDrag === null`
    - _Requirements: 5.3_

  - [ ]* 7.7 `PENCIL_DRAG_END` duplicate edge — rejected, `lastBlockReason` set
    - Pre-populate `connections` with an existing connection between source and
      target
    - Dispatch `PENCIL_DRAG_END`
    - Assert `connections.length` unchanged, `lastBlockReason` is non-empty
    - _Requirements: 5.5_

  - [ ]* 7.8 `PENCIL_DRAG_END` occupied target — rejected, `lastBlockReason` set
    - Pre-populate `connections` so the target pin is at capacity
    - Dispatch `PENCIL_DRAG_END`
    - Assert `connections.length` unchanged, `lastBlockReason` is non-empty
    - _Requirements: 5.4_

  - [ ]* 7.9 `PENCIL_DRAG_END` valid — connection added, selection updated,
    drag cleared
    - Dispatch `PENCIL_DRAG_END` with a valid, unoccupied target on a different
      placement
    - Assert `connections.length` grew by 1
    - Assert the new connection has `routeComponentId === "RouteMeander"`,
      `from.placementId === source.placementId`, `from.pinName === source.pinName`
    - Assert `selection` contains the new connection
    - Assert `pencilDrag === null`
    - _Requirements: 4.1, 4.2, 4.3_

- [ ] 8. `findNearestPin` unit tests
  - Add a `describe("findNearestPin")` block to
    `frontend/src/lib/editor/design-store.test.ts`:

  - [ ]* 8.1 Returns `null` when cursor is > 24 px from every pin
    - Place a single pin at screen position (100, 100); put cursor at (125, 125)
      (distance ≈ 35 px)
    - Assert return value is `null`
    - _Requirements: 7.1, 7.3_

  - [ ]* 8.2 Returns correct pin when cursor is within 24 px
    - Place pin at (100, 100); put cursor at (115, 115) (distance ≈ 21 px)
    - Assert `{ placementId, pinName }` matches that pin
    - _Requirements: 7.1_

  - [ ]* 8.3 Never returns the source pin itself
    - Pass a single placement whose only pin is the source pin; cursor is
      directly over it (distance = 0)
    - Assert return value is `null`
    - _Requirements: 7.4_

  - [ ]* 8.4 Returns the closest pin when multiple are within radius
    - Two pins at distances 10 px and 20 px; cursor equidistant from neither
    - Assert return value is the pin at 10 px
    - _Requirements: 7.2_

- [ ] 9. Property-based tests in `design-store.test.ts`
  - Add property-based tests using `fast-check` (already a dev dependency);
    each test runs minimum 100 iterations (`{ numRuns: 100 }`). Tag each with
    `// Feature: magic-pencil-tool, Property N: <text>` as per the design.

  - [ ]* 9.1 Property 1 — `findNearestPin` never returns the source pin
    - `// Feature: magic-pencil-tool, Property 1: source-pin exclusion from snap candidates`
    - Generate: random list of placements (1–10), random source pin (any pin on
      any placement), random cursor screen position
    - Assert: result is `null` OR (`result.placementId !== sourcePlacementId`
      OR `result.pinName !== sourcePinName`)
    - _Requirements: 7.4_

  - [ ]* 9.2 Property 2 — snap radius boundary
    - `// Feature: magic-pencil-tool, Property 2: snap radius boundary`
    - Generate: a single placement with one pin at a known world position; a
      random cursor distance from the pin's screen position; a fixed `w2s`
      identity transform for simplicity
    - Assert: result is non-null iff distance < 24 (strict less-than)
    - _Requirements: 7.1, 7.3_

  - [ ]* 9.3 Property 3 — canvas state immutability during pencil drag
    - `// Feature: magic-pencil-tool, Property 3: canvas state immutability during pencil drag`
    - Generate: random `EditorState` (via a fast-check arbitrary or manual
      builder), a valid `PENCIL_DRAG_START` followed by 0–5 `PENCIL_DRAG_MOVE`
      actions
    - Capture references to `placements`, `connections`, `past` before
    - After applying actions assert `state.placements`, `state.connections`,
      and `state.past` are reference-equal (not mutated)
    - _Requirements: 3.5_

  - [ ]* 9.4 Property 4 — all invalid targets rejected by `PENCIL_DRAG_END`
    - `// Feature: magic-pencil-tool, Property 4: validation completeness — all invalid targets are rejected`
    - Generate: an `EditorState` with a pencil drag in progress; generate an
      invalid target (randomly one of: same source pin, same placement different
      pin, duplicate edge, over-capacity pin)
    - Dispatch `PENCIL_DRAG_END`
    - Assert `connections.length` unchanged, `pencilDrag === null`
    - _Requirements: 5.1–5.6_

  - [ ]* 9.5 Property 5 — valid connection creation correctness
    - `// Feature: magic-pencil-tool, Property 5: valid connection creation correctness`
    - Generate: `EditorState` with ≥ 2 placements each with ≥ 1 free pin; a
      valid source/target pair (different placements, no existing connection,
      both pins under capacity)
    - Dispatch `PENCIL_DRAG_END`
    - Assert `connections.length` increased by exactly 1
    - Assert new connection: `routeComponentId === "RouteMeander"`, `from`
      matches source, `to` matches target
    - Assert `pencilDrag === null`
    - _Requirements: 4.1, 4.2, 4.3_

  - [ ]* 9.6 Property 6 — undo stack grows on successful connection
    - `// Feature: magic-pencil-tool, Property 6: undo stack grows on successful connection`
    - Generate: same as Property 5 setup
    - Capture `pastLen = state.past.length` before dispatch
    - Dispatch `PENCIL_DRAG_END`
    - Assert `state.past.length === pastLen + 1`
    - Assert `state.future` is empty
    - _Requirements: 4.4_

- [ ] 10. Final checkpoint — full test suite passes
  - Run `npx vitest run` inside `frontend/` and confirm all tests (pre-existing
    plus new) pass with zero failures
  - Ensure all tests pass; ask the user if questions arise.

---

## Task Dependency Graph

```json
{
  "waves": [
    ["1"],
    ["2", "3", "5"],
    ["4"],
    ["6"],
    ["7", "8", "9"],
    ["10"]
  ]
}
```

---

## Notes

- Tasks marked `*` are optional and can be skipped for a faster MVP; the core
  behaviour (Tasks 1–5) is fully functional without them.
- **Dependency order**: Task 1 (types + reducer) must be complete before Tasks
  2–5 (all consumers import from `design-store.tsx`). Tasks 7–9 depend on Task 1.
  Tasks 3–4 depend on each other (overlay is rendered from canvas). Task 5 depends
  on Task 1 only. Task 2 depends on Task 1 only.
- The `"route"` literal in the current `Tool` type should be verified against
  the live file before renaming; if canvas/toolbar already use `"pan"` and
  `"select"` only, the union extension is purely additive.
- `findNearestPin` must be exported (not just module-private) so it can be
  imported by both `editor-canvas.tsx` and the test suite.
- `pinWorldPos` (used in `PencilPreviewOverlay`) already exists in
  `editor-canvas.tsx`; no duplicate implementation required.
- The existing `lastBlockReason` watcher in `editor-canvas.tsx` fires
  `toast.error(...)` automatically — no new toast wiring is needed in the
  reducer or overlay.
- Each property-based test tag comment format:
  `// Feature: magic-pencil-tool, Property N: <property_text>`
