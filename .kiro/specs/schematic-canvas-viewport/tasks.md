# Implementation Plan: Schematic Canvas Viewport Fix

## Overview

Fix the schematic editor so it auto-fits to placed components on load and renders ruler ticks at
any pan/zoom position. All changes are in TypeScript/React and confined to three files.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": ["1", "2", "3", "5"] },
    { "wave": 2, "tasks": ["1.1", "3.1", "5.1"] },
    { "wave": 3, "tasks": ["4"] },
    { "wave": 4, "tasks": ["6"] }
  ]
}
```

## Tasks

- [x] 1. Remove chip-boundary clamp from ruler tick generation
  - In `frontend/src/components/quantum-editor/use-canvas-viewport.ts`, locate the `hTicks`
    `useMemo` block (~line 192).
  - Replace the two clamped start/end lines:
    ```ts
    // BEFORE
    const startV = Math.max(-CHIP_HALF_W, Math.ceil(visLeft  / step) * step);
    const endV   = Math.min( CHIP_HALF_W, Math.floor(visRight / step) * step);
    // AFTER
    const startV = Math.ceil(visLeft  / step) * step;
    const endV   = Math.floor(visRight / step) * step;
    ```
  - Apply the identical change in the `vTicks` `useMemo` block: replace
    `Math.max(-CHIP_HALF_H, …)` and `Math.min(CHIP_HALF_H, …)` with the raw visible-range
    values.
  - The existing per-tick screen-pixel guard (`if (px < RULER_L || px > size.w) continue`)
    already prevents off-screen ticks from being emitted, so there is no overflow risk.
  - _Requirements: 2.5, 2.6_

  - [ ]* 1.1 Write property test for ruler tick completeness (Property 2)
    - Extract the tick-generation logic into two pure helper functions
      `computeHTicks(cx, scale, sizeW)` and `computeVTicks(cy, scale, sizeH, usableH)` so
      tests do not require React hook mounting.
    - Install fast-check if not present: `cd frontend && npm install --save-dev fast-check`.
    - Use fast-check to generate arbitrary `(zoom, panX, panY, canvasW, canvasH)` combinations,
      including `panX > CHIP_HALF_W * MM_TO_PX` to cover the previously-blank-ruler case.
    - Assert `hTicks.length > 0` and every tick `px ∈ [RULER_L, canvasW]`.
    - Assert `vTicks.length > 0` and every tick `py ∈ [0, canvasH − RULER_B]`.
    - Run with at least 100 iterations.
    - Tag: `Feature: schematic-canvas-viewport, Property 2: ruler ticks always present in visible range`
    - **Validates: Requirements 2.5, 2.6**

- [x] 2. Replace chip-boundary pan clamp with infinite-canvas pan limit
  - In `use-canvas-viewport.ts`, add a constant near the top of the file (after the existing
    exports):
    ```ts
    const MAX_VIRTUAL_PAN = 50_000; // px — effectively infinite canvas
    ```
  - Locate the pan-clamping section and replace:
    ```ts
    // BEFORE
    const maxPanX = Math.max(0, (bw - usableW) / 2);
    const maxPanY = Math.max(0, (bh - usableH) / 2);
    // AFTER
    const maxPanX = MAX_VIRTUAL_PAN;
    const maxPanY = MAX_VIRTUAL_PAN;
    ```
  - The `clampedPanX`/`clampedPanY` lines that follow are unchanged; the only difference is
    that the clamp limit is now ±50 000 px rather than the chip pixel size.
  - _Requirements: 2.6_

- [x] 3. Call `fitToContent` after loading a design with placements
  - In `frontend/src/routes/_app/schematic-editor.tsx`, locate the `useEffect` that handles
    `isNewConversation || isExternalUpdate` (the block that calls `newCanvas` or
    `loadIntoCanvas`).
  - After the `newCanvas` / `loadIntoCanvas` call, add:
    ```ts
    if (doc.placements.length > 0) {
      requestAnimationFrame(() => {
        canvasRef.current?.fitToContent();
      });
    }
    ```
  - The `requestAnimationFrame` defers the call by one frame so `useCanvasViewport`'s
    `ResizeObserver` has had time to record the real canvas size.
  - Do **not** call `fitToContent` for empty documents; the canvas should remain at its default
    zoom/pan for a blank design.
  - _Requirements: 2.1, 2.2, 2.3_

  - [ ]* 3.1 Write property test for fitToContent placing all components in the viewport (Properties 1 & 4)
    - Extract the zoom/pan computation from `fitToContent` into a pure helper function
      `computeFitViewport(placements, sizeW, sizeH, baseScale)` returning `{ zoom, panX, panY }`.
    - Use fast-check to generate:
      - Arbitrary placement arrays (1–50 components, `x ∈ [−100, 100] mm`, `y ∈ [−100, 100] mm`).
      - Canvas sizes (`w ∈ [400, 2000] px`, `h ∈ [300, 1200] px`).
    - Compute `cx`/`cy` from the returned zoom/pan, then assert every `w2s(p.x, p.y)` falls
      inside `[RULER_L, sizeW] × [0, sizeH − RULER_B]`.
    - Add a second generator with `x ∈ [30, 100] mm` (outside ±20 mm) to cover Property 4.
    - Run with at least 100 iterations.
    - Tag: `Feature: schematic-canvas-viewport, Property 1: fit places all components within visible area`
    - **Validates: Requirements 2.1, 2.3 (Properties 1 and 4)**

- [x] 4. Checkpoint — run tests and manual smoke test
  - Run `cd frontend && npx vitest --run` to confirm the existing test suite remains green.
  - Open the schematic editor in the browser with a saved design containing 3–5 components in a
    2–4 mm cluster. Confirm components fill the viewport immediately on load without pressing `F`.
  - Pan past the ±20 mm boundary and confirm the ruler remains populated with ticks.
  - Ensure all tests pass; ask the user if questions arise.
  - _Requirements: 2.1, 2.5, 3.1–3.8_

- [x] 5. Add zoom-clamp property test and empty-canvas example test
  - Write a property test for Property 3 using `editorReducer` from `design-store.tsx` directly
    (it is a pure function; no React mounting required).
  - Use fast-check to generate arbitrary zoom values including `−Infinity`, `0`, `NaN`, and
    very large numbers.
  - Assert `SCALE_MIN ≤ result.zoom ≤ SCALE_MAX` after dispatching `{ type: "ZOOM", zoom: v }`.
  - Write an example test: calling `fitToContent` with `placements = []` dispatches
    `{ type: "ZOOM", zoom: 1 }` and `{ type: "PAN", x: 0, y: 0 }`.
  - _Requirements: 2.4, 3.1_

  - [ ]* 5.1 Implement the zoom-clamp and empty-canvas tests
    - Tag: `Feature: schematic-canvas-viewport, Property 3: zoom always within bounds`
    - Run with at least 100 iterations for the property test.
    - **Validates: Requirements 2.4, 3.1**

- [x] 6. Final checkpoint — full test run and regression verification
  - Run `cd frontend && npx vitest --run` to confirm all new and existing tests pass.
  - Manually verify the regression scenarios from requirements 3.1–3.8:
    - Ctrl+scroll zoom zooms toward cursor and stays within SCALE_MIN/SCALE_MAX.
    - Middle-mouse pan moves components correctly.
    - `F` key calls `fitToContent`; `Shift+F` calls `zoomToSelection`.
    - Component drag snaps to the configured grid.
    - Grid lines render within the visible canvas area.
    - Ruler ticks classify correctly as major / half / minor at different zoom levels.
    - Empty canvas loads without error.
  - Ensure all tests pass; ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP fix.
- Extract `computeFitViewport` and `computeHTicks`/`computeVTicks` as pure helper functions
  before writing property tests to avoid needing to mount React hooks in the test environment.
- `fast-check` is the recommended PBT library; install with
  `cd frontend && npm install --save-dev fast-check` if not already present.
- No backend changes are required and no data model migration is needed.
- `CHIP_HALF_W` / `CHIP_HALF_H` constants stay exported for component placement snapping
  and DRC; only their use inside tick generation and pan clamping is removed.
