# Design Document: Magic Pencil Tool

## Overview

The Magic Pencil Tool adds a third interaction mode — `"pencil"` — to the schematic editor's existing `"select"` and `"pan"` tools. When active, a user can draw a connection between two component pins by pressing the pointer down on a source pin and releasing it over a target pin. A live dashed preview line tracks the cursor during the drag, snapping to valid pin targets within a 24 px screen-space radius. On a successful release the tool commits a new `Connection` object to `EditorState` using the same `"RouteMeander"` route and the same undo-stack semantics as the existing pin-click workflow.

The implementation is entirely frontend-only. No backend API changes are required; the backend already knows how to render a `RouteMeander` connection regardless of how it was created.

---

## Architecture

The feature is decomposed into four tightly scoped units of change:

```
┌─────────────────────────────────────────────────────────────────┐
│  design-store.tsx                                               │
│  • Extend Tool union: "select" | "pan" | "pencil"               │
│  • Add PencilDragState to EditorState                           │
│  • Add PENCIL_DRAG_START / PENCIL_DRAG_MOVE / PENCIL_DRAG_END  │
│    / PENCIL_DRAG_CANCEL actions to editorReducer               │
└──────────────────────────┬──────────────────────────────────────┘
                           │ state read / dispatch
┌──────────────────────────▼──────────────────────────────────────┐
│  editor-canvas.tsx                                              │
│  • Route onPDown / onPMove / onPUp to pencil handlers when      │
│    state.tool === "pencil"                                      │
│  • Render <PencilPreviewOverlay> as the top SVG child           │
│  • Extend makePlacementHandlers: no-op drag-move when pencil    │
│    tool, prevent component move on pointerdown over a pin       │
└──────────────────────────┬──────────────────────────────────────┘
                           │ rendered inside SVG
┌──────────────────────────▼──────────────────────────────────────┐
│  PencilPreviewOverlay (new component, lives in editor-canvas)   │
│  • Reads state.pencilDrag                                       │
│  • Renders dashed preview line + source pin dot + target halo  │
└─────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│  editor-toolbar.tsx                                             │
│  • Add TB button for pencil tool (Pencil icon from lucide)      │
└─────────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│  schematic-editor.tsx (keyboard shortcuts)                      │
│  • Add "P" key → SET_TOOL "pencil"                              │
│  • Extend Escape handling: cancel pencil drag before other ESC  │
└─────────────────────────────────────────────────────────────────┘
```

This architecture deliberately keeps all pencil state inside `EditorState` (flowing through the existing `useReducer` / `workspaceReducer` pipeline) rather than in React local state. That ensures undo/redo, cross-tab isolation, and workspace persistence all work without additional wiring.

---

## Components and Interfaces

### 1. `design-store.tsx` — State and Reducer Changes

#### Extended `Tool` type

```typescript
export type Tool = "select" | "pan" | "pencil";
```

#### New `PencilDragState` interface

```typescript
/**
 * Transient state maintained while the user is drawing a connection
 * with the pencil tool. Reset to null when the drag ends (committed,
 * cancelled, or rejected).
 */
export interface PencilDragState {
  /** Placement ID of the pin the drag originated from. */
  sourcePlacementId: string;
  /** Pin name on the source placement. */
  sourcePinName: string;
  /** Current cursor position in world-space mm, updated on every pointermove. */
  cursorWorld: { x: number; y: number };
  /**
   * The nearest valid snap target within PENCIL_SNAP_RADIUS_PX, or null
   * if the cursor is not near any qualifying pin.
   * Updated on every pointermove alongside cursorWorld.
   */
  snapTarget: { placementId: string; pinName: string } | null;
}
```

#### `EditorState` addition

```typescript
export interface EditorState {
  // ... existing fields unchanged ...
  pencilDrag: PencilDragState | null;   // NEW
}
```

`pencilDrag` is initialised to `null` in `initialEditorState`.

#### New `EditorAction` variants

```typescript
| { type: "PENCIL_DRAG_START"; sourcePlacementId: string; sourcePinName: string; cursorWorld: { x: number; y: number } }
| { type: "PENCIL_DRAG_MOVE";  cursorWorld: { x: number; y: number }; snapTarget: { placementId: string; pinName: string } | null }
| { type: "PENCIL_DRAG_END";   targetPlacementId: string; targetPinName: string }
| { type: "PENCIL_DRAG_CANCEL" }
```

#### Reducer logic

**`PENCIL_DRAG_START`**
- If the source pin's occupancy ≥ `maxConnectionsForPin(...)`, set `lastBlockReason` and return without changing `pencilDrag`.
- Otherwise, set `pencilDrag` with `snapTarget: null` and the initial `cursorWorld`.
- Does **not** push a snapshot (no undo entry until the connection is committed).

**`PENCIL_DRAG_MOVE`**
- Update `pencilDrag.cursorWorld` and `pencilDrag.snapTarget`.
- Returns without calling `bump()` — this is a transient update.

**`PENCIL_DRAG_END`**
- Runs the full validation suite (same logic as `PIN_CLICK`):
  - Self-pin check (`sourcePlacementId === targetPlacementId && sourcePinName === targetPinName`)
  - Self-loop check (`sourcePlacementId === targetPlacementId`)
  - Duplicate-edge check (both directions)
  - Source pin capacity check
  - Target pin capacity check
- On failure: clear `pencilDrag`, set `lastBlockReason`, return.
- On success: create a `Connection` object identical to what `PIN_CLICK` produces (`routeComponentId: "RouteMeander"`), call `bump()`, add to `connections`, select the new connection, clear `pencilDrag`.

**`PENCIL_DRAG_CANCEL`**
- Set `pencilDrag` to `null`, clear `lastBlockReason`.

#### Constant

```typescript
/** Screen-space snap radius in pixels for the pencil tool. */
export const PENCIL_SNAP_RADIUS_PX = 24;
```

---

### 2. Pure Helper: `findNearestPin`

This is a pure function that belongs in `design-store.tsx` alongside `pinOccupancy` and `maxConnectionsForPin`:

```typescript
/**
 * Given a list of all placements (with their pin specs resolved via pinMap),
 * a current cursor position in screen-space pixels, and a source pin to
 * exclude, return the nearest pin endpoint within PENCIL_SNAP_RADIUS_PX.
 *
 * w2s:   world → screen transform (from useCanvasViewport)
 * pinMap: placementId → PinSpec[]
 * sourcePlacementId / sourcePinName: excluded from candidates
 *
 * Returns { placementId, pinName } of the closest pin, or null.
 */
export function findNearestPin(
  placements: Placement[],
  pinMap: Map<string, PinSpec[]>,
  cursorScreen: { px: number; py: number },
  w2s: (x: number, y: number) => { px: number; py: number },
  sourcePlacementId: string,
  sourcePinName: string,
  snapRadiusPx: number = PENCIL_SNAP_RADIUS_PX,
): { placementId: string; pinName: string } | null
```

The algorithm is O(P × pins_per_placement) per pointermove event — acceptable given typical placement counts (≤ 100) and pin counts (≤ 8 per component):

```
bestDist ← ∞
bestPin ← null

for each placement p:
  for each pin pin in pinMap[p.id]:
    if p.id === sourcePlacementId AND pin.name === sourcePinName: skip
    worldPos ← pinWorldPos(p, pin)
    screenPos ← w2s(worldPos.x, worldPos.y)
    dist ← euclidean(cursorScreen, screenPos)
    if dist < snapRadiusPx AND dist < bestDist:
      bestDist ← dist
      bestPin ← { placementId: p.id, pinName: pin.name }

return bestPin
```

`pinWorldPos` (already defined in `editor-canvas.tsx`) applies the placement's translation, rotation, and mirrorX to convert a pin's µm offset into world-space mm.

---

### 3. `editor-canvas.tsx` — Event Routing and SVG Overlay

#### Pointer event routing

The three top-level SVG pointer handlers (`onPDown`, `onPMove`, `onPUp`) gain a pencil-tool branch:

**`onPDown`** (when `state.tool === "pencil"`)
```
1. Convert client coords to screen-space px relative to the SVG rect.
2. Call findNearestPin with cursorScreen.
3. If no pin found within PENCIL_SNAP_RADIUS_PX:
   - Dispatch SELECT({ selection: [] }) to clear selection (matching existing canvas-bg click).
   - Return.
4. Dispatch PENCIL_DRAG_START with the snapped source pin and initial cursorWorld.
5. Call svgRef.current.setPointerCapture(e.pointerId) to ensure all subsequent
   move/up events arrive even if cursor exits the SVG.
6. e.stopPropagation() to prevent the component drag handler from firing.
```

**`onPMove`** (when `state.pencilDrag !== null`)
```
1. Convert client coords to world-space (existing cursorPos logic unchanged).
2. Convert client coords to screen-space px.
3. Call findNearestPin (excluding source pin) → snapTarget.
4. Dispatch PENCIL_DRAG_MOVE({ cursorWorld, snapTarget }).
```

**`onPUp`** (when `state.pencilDrag !== null`)
```
1. Release pointer capture.
2. If snapTarget !== null:
   Dispatch PENCIL_DRAG_END({ targetPlacementId: snapTarget.placementId,
                               targetPinName:    snapTarget.pinName }).
3. Else:
   Dispatch PENCIL_DRAG_CANCEL.
```

**`onPointerCancel`** (already mapped to `onPUp`) — this handles the "pointer leaves browser window" case (Requirement 6.3).

#### Suppressing component move during pencil drag

In `makePlacementHandlers`, the `onPointerDown` handler already checks `state.tool === "pan"` and bails out. Add a parallel check:

```typescript
if (state.tool === "pencil") {
  // Let the SVG-level onPDown handle pin detection; do not start a component drag.
  return;
}
```

This prevents the user accidentally moving a component when they press down near it but not near a pin.

#### PencilPreviewOverlay

A new child component rendered inside the `<g clipPath="url(#boardClip)">` block, **after** all hit-area layers so it sits on top:

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

---

### 4. New `PencilPreviewOverlay` Component

Defined in `editor-canvas.tsx` (local, not exported). Receives all data via props — no hooks or stores directly.

```
Inputs:
  pencilDrag   : PencilDragState
  placements   : Placement[]
  pinMap       : Map<string, PinSpec[]>
  connections  : Connection[]
  w2s          : world→screen transform

Rendering logic:
  sourcePinWorld ← pinWorldPos(sourcePlacement, sourcePinName)
  sourceScreen   ← w2s(sourcePinWorld.x, sourcePinWorld.y)

  if snapTarget:
    targetPinWorld ← pinWorldPos(targetPlacement, targetPinName)
    targetScreen   ← w2s(targetPinWorld.x, targetPinWorld.y)
    lineEnd        ← targetScreen
    isInvalid      ← isTargetInvalid(pencilDrag, connections)
  else:
    targetScreen   ← w2s(cursorWorld.x, cursorWorld.y)
    lineEnd        ← targetScreen
    isInvalid      ← false

  lineColor ← isInvalid ? "#ef4444" : "var(--primary)"

  Render:
    1. Dashed preview line from sourceScreen to lineEnd
    2. Source pin indicator — filled circle at sourceScreen (always visible)
    3. If snapTarget:
         - Target halo — larger translucent circle
         - If isInvalid: red circle
         - If valid: primary-color circle
```

SVG elements:

```svg
<!-- Preview line -->
<line
  x1={sourceScreen.px} y1={sourceScreen.py}
  x2={lineEnd.px}       y2={lineEnd.py}
  stroke={lineColor}
  strokeWidth={2}
  strokeDasharray="6 4"
  strokeLinecap="round"
  pointerEvents="none"
  opacity={0.85}
/>

<!-- Source pin indicator (always shown during drag) -->
<circle
  cx={sourceScreen.px} cy={sourceScreen.py}
  r={6}
  fill="var(--primary)"
  stroke="var(--background)"
  strokeWidth={1.5}
  pointerEvents="none"
/>

<!-- Target pin halo (only when snap target exists) -->
<circle
  cx={targetScreen.px} cy={targetScreen.py}
  r={10}
  fill={isInvalid ? "#ef4444" : "var(--primary)"}
  fillOpacity={0.2}
  stroke={isInvalid ? "#ef4444" : "var(--primary)"}
  strokeWidth={2}
  pointerEvents="none"
/>
```

The `isTargetInvalid` predicate checks (in order):
1. `target.placementId === source.placementId` (self-loop)
2. Duplicate-edge check against `connections`
3. `pinOccupancy(connections, target.placementId, target.pinName) >= maxConnectionsForPin(...)`

---

### 5. `editor-toolbar.tsx` — Pencil Button

Import `Pencil` from `lucide-react`. Add a `TB` button between Pan and the first `<Separator>`:

```tsx
<TB icon={Pencil} label="Pencil (P)" active={state.tool === "pencil"} onClick={() => setTool("pencil")} />
```

No other toolbar changes are needed.

---

### 6. `schematic-editor.tsx` — Keyboard Shortcuts

In the `onKey` handler (`useEffect` with `window.addEventListener("keydown", onKey)`):

**Add `"P"` shortcut** (alongside existing Space/G/C/I/U/H/N/L):
```typescript
} else if (!inInput && e.key.toLowerCase() === "p" && !e.ctrlKey && !e.metaKey) {
  e.preventDefault();
  dispatch({
    type: "CANVAS_ACTION",
    id: activeTab.id,
    action: { type: "SET_TOOL", tool: "pencil" },
  });
}
```

**Extend `Escape` handling** — cancel pencil drag first, before the existing cancel-pin and clear-selection branches:
```typescript
} else if (e.key === "Escape") {
  if (activeTab.state.pencilDrag) {
    dispatch({ type: "CANVAS_ACTION", id: activeTab.id, action: { type: "PENCIL_DRAG_CANCEL" } });
  } else if (activeTab.state.pendingPin) {
    dispatch({ type: "CANVAS_ACTION", id: activeTab.id, action: { type: "CANCEL_PIN" } });
  } else {
    canvasRef.current?.cancelDrag();
    dispatch({ type: "CANVAS_ACTION", id: activeTab.id, action: { type: "SET_TOOL", tool: "select" } });
    dispatch({ type: "CANVAS_ACTION", id: activeTab.id, action: { type: "SELECT", selection: [] } });
  }
}
```

Note: Requirement 6.2 says Escape with no drag in progress should return to `"select"`. The existing behaviour clears the selection; this design adds the `SET_TOOL "select"` dispatch to satisfy 6.2.

---

## Data Models

### `EditorState` additions (delta from current)

| Field | Type | Initial | Description |
|-------|------|---------|-------------|
| `pencilDrag` | `PencilDragState \| null` | `null` | Transient drag state for the pencil tool |

### `PencilDragState`

| Field | Type | Description |
|-------|------|-------------|
| `sourcePlacementId` | `string` | ID of the placement from which the drag started |
| `sourcePinName` | `string` | Name of the pin on that placement |
| `cursorWorld` | `{ x: number; y: number }` | Current cursor in world-space mm |
| `snapTarget` | `{ placementId: string; pinName: string } \| null` | Nearest snappable pin, or null |

### Connection creation (unchanged schema)

```typescript
const id = `conn_${sourcePlacementId}_${sourcePinName}__${targetPlacementId}_${targetPinName}_${Date.now()}`;
const conn: Connection = {
  id,
  from: { placementId: sourcePlacementId, pinName: sourcePinName },
  to:   { placementId: targetPlacementId, pinName: targetPinName },
  routeComponentId: "RouteMeander",
};
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

The pencil tool has testable correctness properties in its validation logic, snap algorithm, and state management. The UI rendering criteria (cursor styles, visual feedback) are not amenable to property-based testing and are handled through example-based tests.

### Property 1: Source-pin exclusion from snap candidates

*For any* set of placements with resolved pins, any source pin, and any cursor screen position, `findNearestPin` shall never return the source pin itself as a snap target — even if the cursor is directly over the source pin.

**Validates: Requirements 7.4**

---

### Property 2: Snap radius boundary

*For any* cursor position and placement pin position, `findNearestPin` shall return that pin as a candidate if and only if the Euclidean screen-space distance between cursor and pin is strictly less than `PENCIL_SNAP_RADIUS_PX` (24 px). A pin at exactly 24 px or beyond shall not be returned.

**Validates: Requirements 7.1, 7.3**

---

### Property 3: Canvas state immutability during pencil drag

*For any* sequence of `PENCIL_DRAG_START` and `PENCIL_DRAG_MOVE` actions, the `placements` array, `connections` array, and `past` (undo stack) in `EditorState` shall remain identical to their values before the drag sequence began. Only `pencilDrag`, `cursorWorld`, and `snapTarget` change.

**Validates: Requirements 3.5**

---

### Property 4: Validation completeness — all invalid targets are rejected

*For any* pencil drag where the `PENCIL_DRAG_END` target is invalid (self-pin, self-loop, duplicate edge, or over-capacity), the reducer shall not add any new entry to `connections` and shall set `pencilDrag` to `null`.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**

---

### Property 5: Valid connection creation correctness

*For any* `PENCIL_DRAG_END` action where the target passes all validation rules, exactly one new `Connection` shall be appended to `connections`, that connection shall have `routeComponentId === "RouteMeander"`, `from` shall match the source pin, `to` shall match the target pin, and `pencilDrag` shall be cleared to `null`.

**Validates: Requirements 4.1, 4.2, 4.3**

---

### Property 6: Undo stack grows on successful connection

*For any* successful `PENCIL_DRAG_END` (one that commits a connection), `state.past.length` after the action shall equal `state.past.length` before the action plus one, and `state.future` shall be empty.

**Validates: Requirements 4.4**

---

## Error Handling

### Occupied source pin on drag start

When `PENCIL_DRAG_START` is dispatched for a pin that is already at capacity, the reducer sets `lastBlockReason` and leaves `pencilDrag` as `null`. The existing `useEffect` in `editor-canvas.tsx` that watches `state.lastBlockReason` will fire a `toast.error(...)` automatically — no new wiring required.

### Invalid target on drag end

Same mechanism: `PENCIL_DRAG_END` with a failing target sets `lastBlockReason` and clears `pencilDrag`. The toast fires via the existing watcher.

### Pointer leaves browser window mid-drag

`onPointerCancel` on the SVG element is already routed to `onPUp`. When the browser fires `pointercancel` (pointer lost, e.g. window blur), `onPUp` is called. The guard `if (state.pencilDrag !== null)` dispatches `PENCIL_DRAG_CANCEL` and releases the pointer capture.

### Missing pin metadata

`pinWorldPos` returns `null` when pin data is not yet loaded (still fetching). `findNearestPin` skips any pin whose world position is null. The drag can still start if at least one pin has metadata; the preview line will simply fall back to `cursorWorld` until metadata arrives.

---

## Testing Strategy

### Unit tests (example-based)

Using Vitest + `@testing-library/react`:

- **Toolbar render**: `EditorToolbar` renders a pencil button; clicking it dispatches `SET_TOOL "pencil"`.
- **Toolbar active state**: when `state.tool === "pencil"`, the pencil button has the active CSS class.
- **Reducer — `PENCIL_DRAG_START` valid pin**: `pencilDrag` is set correctly.
- **Reducer — `PENCIL_DRAG_START` occupied pin**: `pencilDrag` remains null, `lastBlockReason` is set.
- **Reducer — `PENCIL_DRAG_CANCEL`**: `pencilDrag` is null, `lastBlockReason` is null.
- **Reducer — `PENCIL_DRAG_END` self-pin**: rejected, no new connection.
- **Reducer — `PENCIL_DRAG_END` self-loop**: rejected, no new connection.
- **Reducer — `PENCIL_DRAG_END` duplicate edge**: rejected, `lastBlockReason` set.
- **Reducer — `PENCIL_DRAG_END` occupied target**: rejected, `lastBlockReason` set.
- **Reducer — `PENCIL_DRAG_END` valid**: new connection added, `routeComponentId === "RouteMeander"`, selection updated.
- **`findNearestPin`**: no result when cursor is > 24 px from all pins.
- **`findNearestPin`**: correct pin returned when cursor is < 24 px from one pin.
- **Keyboard `"p"`**: dispatches `SET_TOOL "pencil"`.
- **Keyboard `Escape` during drag**: dispatches `PENCIL_DRAG_CANCEL`.
- **Keyboard `Escape` with no drag**: dispatches `SET_TOOL "select"`.
- **`PencilPreviewOverlay`**: renders a line element while `pencilDrag` is non-null.
- **`PencilPreviewOverlay` red line**: stroke is `#ef4444` when snap target is invalid.

### Property-based tests

Using [fast-check](https://github.com/dubzzz/fast-check) (already compatible with Vitest):

Each property below corresponds to a numbered property in the Correctness Properties section. Minimum 100 iterations per test.

- **Property 1** — `findNearestPin` never returns source pin.
  - Generate: random placements, random cursor position near source pin.
  - Assert: result is null or result.placementId/pinName ≠ source.

- **Property 2** — `findNearestPin` respects 24 px boundary.
  - Generate: single placement at fixed origin, cursor at random distance from pin screen position.
  - Assert: result non-null iff distance < 24.

- **Property 3** — Canvas state immutability during drag.
  - Generate: random `EditorState` with placements/connections, random `PENCIL_DRAG_START` + sequence of `PENCIL_DRAG_MOVE`.
  - Assert: `placements`, `connections`, `past` are reference-equal to originals.

- **Property 4** — All invalid targets rejected.
  - Generate: `EditorState` with placements and a pencil drag source, then generate an invalid `PENCIL_DRAG_END` target (self-pin, self-loop, duplicate, or occupied — chosen randomly).
  - Assert: `connections.length` unchanged, `pencilDrag === null`.

- **Property 5** — Valid connection creation.
  - Generate: `EditorState` with ≥ 2 placements with available pins, valid source/target pair.
  - Assert: `connections.length` grew by 1, new connection has correct `from`/`to`/`routeComponentId`, `pencilDrag === null`.

- **Property 6** — Undo stack grows.
  - Generate: same as Property 5.
  - Assert: `past.length` = original + 1, `future` is empty.

**Tag format for each property test:**
```
// Feature: magic-pencil-tool, Property N: <property_text>
```

### Integration note

The pencil tool produces a `Connection` object structurally identical to one created by the existing `PIN_CLICK` workflow. All downstream rendering, route-fetching, property-inspector, and backend export paths are exercised without any additional wiring.
