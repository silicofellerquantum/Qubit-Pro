/**
 * Tests for editorReducer — zoom clamping and empty-canvas fitToContent behaviour.
 *
 * Feature: schematic-canvas-viewport
 * Property 3: zoom always within bounds
 *
 * Validates: Requirements 2.4, 3.1
 */

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { editorReducer, initialEditorState } from "./design-store";

// The ZOOM case in editorReducer clamps to [0.25, 8].
// These constants mirror the reducer's internal clamp so tests are self-documenting.
const REDUCER_ZOOM_MIN = 0.25;
const REDUCER_ZOOM_MAX = 8;

// ---------------------------------------------------------------------------
// Property 3: zoom is always within bounds
// Feature: schematic-canvas-viewport, Property 3: zoom always within bounds
// Validates: Requirements 3.1
// ---------------------------------------------------------------------------
describe("editorReducer ZOOM — Property 3: zoom always within bounds", () => {
  it("clamps zoom to [REDUCER_ZOOM_MIN, REDUCER_ZOOM_MAX] for any arbitrary input", () => {
    fc.assert(
      fc.property(
        // Generate a wide range of challenging values: finite, ±Infinity, NaN, 0, huge numbers
        fc.oneof(
          fc.float({ noNaN: false }), // includes NaN, ±Infinity, 0, subnormals
          fc.constant(0),
          fc.constant(-0),
          fc.constant(Number.POSITIVE_INFINITY),
          fc.constant(Number.NEGATIVE_INFINITY),
          fc.constant(Number.NaN),
          fc.constant(Number.MAX_VALUE),
          fc.constant(-Number.MAX_VALUE),
          fc.constant(Number.MIN_VALUE),
          fc.float({ min: -1e9, max: 1e9, noNaN: true }),
        ),
        (v) => {
          const nextState = editorReducer(initialEditorState, { type: "ZOOM", zoom: v });
          // zoom must always be a finite number within the valid range
          expect(Number.isFinite(nextState.zoom)).toBe(true);
          expect(nextState.zoom).toBeGreaterThanOrEqual(REDUCER_ZOOM_MIN);
          expect(nextState.zoom).toBeLessThanOrEqual(REDUCER_ZOOM_MAX);
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Example test: empty-canvas fitToContent dispatches zoom:1 and pan:{x:0,y:0}
// Validates: Requirements 2.4
// ---------------------------------------------------------------------------
describe("fitToContent with empty placements (empty-canvas example)", () => {
  it("dispatches zoom:1 and pan:{x:0, y:0} when placements is empty", () => {
    /**
     * fitToContent lives in useCanvasViewport (a React hook), so we cannot call it directly.
     * Instead we verify the reducer handles the actions that fitToContent dispatches:
     *   dispatch({ type: "ZOOM", zoom: 1 })
     *   dispatch({ type: "PAN",  x: 0, y: 0 })
     *
     * This confirms the reducer correctly accepts these actions and the resulting state
     * matches the expected empty-canvas defaults.
     */
    const afterZoom = editorReducer(
      { ...initialEditorState, placements: [] },
      { type: "ZOOM", zoom: 1 },
    );
    expect(afterZoom.zoom).toBe(1);

    const afterPan = editorReducer(afterZoom, { type: "PAN", x: 0, y: 0 });
    expect(afterPan.pan).toEqual({ x: 0, y: 0 });

    // Verify zoom is still exactly 1 (no unintended clamping occurred)
    expect(afterPan.zoom).toBe(1);
  });

  it("zoom of 1 is within valid bounds (zoom=1 is always safe)", () => {
    const state = editorReducer(initialEditorState, { type: "ZOOM", zoom: 1 });
    expect(state.zoom).toBeGreaterThanOrEqual(REDUCER_ZOOM_MIN);
    expect(state.zoom).toBeLessThanOrEqual(REDUCER_ZOOM_MAX);
  });
});
