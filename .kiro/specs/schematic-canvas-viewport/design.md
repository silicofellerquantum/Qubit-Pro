# Design Document: Schematic Canvas Viewport Fix

## Overview

The schematic editor initializes the viewport to fit the entire 40×40 mm chip coordinate space,
making placed components appear tiny at first load. Three coupled issues must be fixed:

1. **Initial viewport**: no `fitToContent` call fires after a design loads.
2. **Ruler tick range**: `hTicks` / `vTicks` clamp the tick loop to `±CHIP_HALF_W/H`, so the
   ruler goes blank when the user pans beyond ±20 mm.
3. **Canvas pan clamped to board pixel size**: prevents panning beyond the chip boundary.

The fix is surgical and localized to `use-canvas-viewport.ts`, `schematic-editor.tsx`, and
optionally `design-store.tsx`. No data model changes are required.

## Glossary

- **CHIP_HALF_W / CHIP_HALF_H**: Half-width and half-height of the fixed chip coordinate space
  (±20 mm). Used for component placement snapping and DRC; must not be removed, only decoupled
  from ruler tick and pan logic.
- **baseScale**: The canvas scale factor that makes the full chip exactly fill the usable SVG
  area at `zoom = 1`. Computed from `size.w` / `size.h` and `CHIP_W_MM × MM_TO_PX`.
- **w2s / s2w**: World-to-screen and screen-to-world coordinate transforms; must remain
  unmodified.
- **fitToContent**: Imperative action on `EditorCanvasHandle` that computes bounding-box zoom
  and pan from the current `placements` array.
- **hTicks / vTicks**: Derived arrays of ruler tick positions and labels, recomputed on every
  zoom or pan change.

## Bug Details

### Root Cause

Three distinct bugs interact to produce the "tiny components on load" experience:

**Bug A — No auto-fit on load** (`schematic-editor.tsx`)

The `useEffect` that calls `newCanvas` or `loadIntoCanvas` never calls `fitToContent` afterward.
The initial `EditorState` carries `zoom: 0.5, pan: {0, 0}`, which centres the chip boundary.
Result: the viewport always shows the full 40×40 mm chip regardless of where components are.

**Bug B — Ruler ticks clamped to chip boundary** (`use-canvas-viewport.ts`)

```ts
// hTicks (lines ~195–196)
const startV = Math.max(-CHIP_HALF_W, Math.ceil(visLeft  / step) * step);
const endV   = Math.min( CHIP_HALF_W, Math.floor(visRight / step) * step);
```

The same pattern exists in `vTicks`. When the user pans so that the visible world range
extends beyond ±20 mm, `startV > endV` and the tick loop emits zero ticks — blank ruler.

**Bug C — Pan clamped to chip pixel size** (`use-canvas-viewport.ts`)

```ts
const maxPanX = Math.max(0, (bw - usableW) / 2);
const maxPanY = Math.max(0, (bh - usableH) / 2);
```

`bw` / `bh` are the chip pixel dimensions. At low zoom the clamp prevents scrolling beyond
the chip boundary, making the canvas feel artificially bounded.

### Affected Files

| File | Symptom |
|---|---|
| `frontend/src/components/quantum-editor/use-canvas-viewport.ts` | Bugs B and C |
| `frontend/src/routes/_app/schematic-editor.tsx` | Bug A |

## Expected Behavior

- When the editor opens (or a design loads) with ≥1 placed component, the viewport
  automatically fits to the component bounding box with ~1.5 mm padding.
- When the editor opens with no components, a comfortable default view centred on the origin
  is shown.
- The ruler remains populated with correctly classified ticks at any zoom level and any pan
  position, including coordinates outside ±20 mm.
- The canvas has no hard visible boundary; panning beyond the old chip edge is seamless.
- All existing interactions (zoom toward cursor, middle-mouse pan, snap, DRC) are unaffected.

## Hypothesized Root Cause

All three bugs trace to the same design decision: the viewport was built around a fixed
40×40 mm coordinate space that was expected to always be visible. The constants `CHIP_HALF_W`
and `CHIP_HALF_H` leaked out of their original domain (component placement constraints) and
into display logic (tick bounds, pan limits), coupling the visual viewport to the physical chip
dimensions in ways that were never intentional.

## Fix Implementation

### Architecture

```
DesignStoreProvider / workspace-store
  └─ EditorState { zoom, pan, placements }
        │
        ▼
useCanvasViewport(state, dispatch)     ← all derived viewport values live here
  ├─ baseScale                         ← fits CHIP_W_MM×CHIP_H_MM into the usable area
  ├─ scale = baseScale × state.zoom
  ├─ cx / cy                           ← screen origin of world (0,0)
  ├─ pan clamping          ← BUG C: replace bw/bh clamp with MAX_VIRTUAL_PAN
  ├─ fitToContent()        ← correct logic, BUG A: never called on load
  ├─ hTicks / vTicks       ← BUG B: clamp to ±CHIP_HALF_W/H must be removed
  └─ w2s / s2w             ← unchanged
        │
        ▼
EditorCanvas (SVG renderer)
  └─ schematic-editor.tsx (host)   ← BUG A fix: call fitToContent after load
```

### Fix A — Auto-fit on load (`schematic-editor.tsx`)

Inside the `useEffect` that calls `newCanvas` / `loadIntoCanvas`, add after the call:

```ts
if (doc.placements.length > 0) {
  requestAnimationFrame(() => {
    canvasRef.current?.fitToContent();
  });
}
```

The `requestAnimationFrame` defers by one frame so `useCanvasViewport`'s `ResizeObserver`
has had time to record the real canvas dimensions before the fit math runs.

### Fix B — Remove tick clamp (`use-canvas-viewport.ts`)

In `hTicks`:
```ts
// Remove:
const startV = Math.max(-CHIP_HALF_W, Math.ceil(visLeft  / step) * step);
const endV   = Math.min( CHIP_HALF_W, Math.floor(visRight / step) * step);

// Replace with:
const startV = Math.ceil(visLeft  / step) * step;
const endV   = Math.floor(visRight / step) * step;
```

Apply the identical change in `vTicks` (`-CHIP_HALF_H` / `+CHIP_HALF_H`).
The existing per-tick screen pixel guard already handles off-screen filtering.

### Fix C — Infinite-canvas pan limit (`use-canvas-viewport.ts`)

```ts
// Add constant near top of file:
const MAX_VIRTUAL_PAN = 50_000; // px — effectively infinite canvas

// Replace:
const maxPanX = Math.max(0, (bw - usableW) / 2);
const maxPanY = Math.max(0, (bh - usableH) / 2);

// With:
const maxPanX = MAX_VIRTUAL_PAN;
const maxPanY = MAX_VIRTUAL_PAN;
```

The downstream `clampedPanX/Y` computation is unchanged; pan is now bounded at ±50 000 px.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a
system — essentially, a formal statement about what the system should do. Properties serve as the
bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Fit places all components within the visible area

*For any* non-empty set of placements with arbitrary world coordinates, after `fitToContent`
executes the world-to-screen transform `w2s` applied to every placement coordinate must return
pixel values inside the usable canvas area `[RULER_L, size.w] × [0, size.h − RULER_B]`.

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 2: Ruler ticks are always present in the visible range

*For any* zoom level in `[SCALE_MIN, SCALE_MAX]` and *any* pan value (including values where
`|pan.x| > CHIP_HALF_W × MM_TO_PX`), the computed `hTicks` list must be non-empty and every
tick's `px` value must satisfy `RULER_L ≤ px ≤ size.w`. Similarly, every `vTicks` entry must
satisfy `0 ≤ py ≤ size.h − RULER_B`.

**Validates: Requirements 2.5, 2.6**

### Property 3: Zoom is always within bounds

*For any* zoom action dispatched with an arbitrary value, the resulting `state.zoom` must
satisfy `SCALE_MIN ≤ state.zoom ≤ SCALE_MAX`.

**Validates: Requirements 3.1**

### Property 4: Fit zoom is independent of chip boundary constants

*For any* set of placements whose bounding box lies entirely outside `±CHIP_HALF_W / ±CHIP_HALF_H`,
`fitToContent` must still produce a zoom and pan such that all component screen positions fall
within the visible canvas area.

**Validates: Requirements 2.3**

## Error Handling

| Scenario | Handling |
|---|---|
| `placements` is empty when `fitToContent` fires | Fall through to the empty-state branch: dispatch `zoom: 1, pan: {0,0}` |
| `size` is `{800, 600}` (pre-resize default) when `fitToContent` fires | The `requestAnimationFrame` delay defers the call; if the observer has not fired yet, the user can press `F` to re-fit |
| All placements at identical coordinates | `contentW`/`contentH` collapse to `2 * padding * MM_TO_PX`; fit still produces a centred view |
| Very large pan values | `MAX_VIRTUAL_PAN = 50_000 px` acts as a soft stop preventing runaway drift |

## Testing Strategy

Property-based tests target the pure computational functions; integration tests verify the
React-side load trigger.

### Property / Unit Tests (Vitest + fast-check)

Each property test runs a minimum of 100 iterations.

- **Property 1 & 4**: Extract `computeFitViewport(placements, sizeW, sizeH, baseScale)` as a
  pure helper; generate arbitrary placements including coordinates outside ±20 mm.
- **Property 2**: Extract tick-generation logic as pure helpers
  `computeHTicks(cx, scale, sizeW)` / `computeVTicks(cy, scale, sizeH, usableH)`.
  Generate `(zoom, panX, panY)` combinations including `|panX| >> CHIP_HALF_W * MM_TO_PX`.
- **Property 3**: Feed arbitrary values through `editorReducer` `ZOOM` case (pure function).

### Example Tests

- Empty canvas fit dispatches `zoom: 1, pan: {0,0}`.
- Single component at `(0, 0)` produces screen position near canvas centre.
- Ruler tick step sizes change correctly across the zoom breakpoints defined in `use-canvas-viewport.ts`.

### Manual Smoke Tests

Open the editor with 3–5 components clustered in a 2–4 mm region; confirm they fill the canvas
on first load without pressing `F`. Pan past the ±20 mm boundary and confirm the ruler stays
populated.
