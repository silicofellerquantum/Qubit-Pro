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
import {
  editorReducer,
  initialEditorState,
  findNearestPin,
  PENCIL_SNAP_RADIUS_PX,
  type EditorState,
  type PencilDragState,
} from "./design-store";
import type { Placement, PinSpec, Connection } from "@/lib/bridge/types";

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

// =============================================================================
// Task 7: editorReducer — pencil tool
// =============================================================================

// ---------------------------------------------------------------------------
// Minimal state builders — only fields exercised by the tests are set.
// ---------------------------------------------------------------------------

function makePlacement(
  id: string,
  x = 0,
  y = 0,
  rotation = 0,
  mirrorX = false,
): Placement {
  return {
    id,
    componentId: "TransmonCross",
    name: id,
    x,
    y,
    rotation,
    mirrorX,
    params: {},
  };
}

function makeConnection(
  fromPlacementId: string,
  fromPinName: string,
  toPlacementId: string,
  toPinName: string,
): Connection {
  const id = `conn_${fromPlacementId}_${fromPinName}__${toPlacementId}_${toPinName}_0`;
  return {
    id,
    from: { placementId: fromPlacementId, pinName: fromPinName },
    to: { placementId: toPlacementId, pinName: toPinName },
    routeComponentId: "RouteMeander",
  };
}

/** Build a minimal EditorState with optional overrides. */
function makeState(overrides: Partial<EditorState> = {}): EditorState {
  return { ...initialEditorState, ...overrides };
}

/** Build a state that already has a pencilDrag in progress. */
function makeStateWithDrag(
  sourcePlacementId: string,
  sourcePinName: string,
  overrides: Partial<EditorState> = {},
): EditorState {
  const pencilDrag: PencilDragState = {
    sourcePlacementId,
    sourcePinName,
    cursorWorld: { x: 0, y: 0 },
    snapTarget: null,
    pathPoints: [{ x: 0, y: 0 }],
  };
  return makeState({ ...overrides, pencilDrag });
}

// ---------------------------------------------------------------------------
describe("editorReducer — pencil tool", () => {
  // ── 7.1: PENCIL_DRAG_START valid pin → pencilDrag set, no bump ────────────
  it("7.1 PENCIL_DRAG_START valid pin sets pencilDrag without bumping state", () => {
    const placement = makePlacement("pl_A");
    const state = makeState({ placements: [placement] });

    const next = editorReducer(state, {
      type: "PENCIL_DRAG_START",
      sourcePlacementId: "pl_A",
      sourcePinName: "north",
      cursorWorld: { x: 1, y: 2 },
    });

    expect(next.pencilDrag).not.toBeNull();
    expect(next.pencilDrag!.sourcePlacementId).toBe("pl_A");
    expect(next.pencilDrag!.sourcePinName).toBe("north");
    expect(next.pencilDrag!.snapTarget).toBeNull();
    expect(next.pencilDrag!.cursorWorld).toEqual({ x: 1, y: 2 });

    // No bump — undo stack must be unchanged
    expect(next.past).toHaveLength(state.past.length);
    // Connections and placements untouched
    expect(next.connections).toEqual(state.connections);
    expect(next.placements).toEqual(state.placements);
  });

  // ── 7.2: PENCIL_DRAG_START occupied pin → pencilDrag null, lastBlockReason ─
  it("7.2 PENCIL_DRAG_START occupied pin leaves pencilDrag null and sets lastBlockReason", () => {
    const placement = makePlacement("pl_A");
    // Add one connection so pin "north" is at capacity (maxConnectionsForPin = 1)
    const existingConn = makeConnection("pl_A", "north", "pl_B", "south");
    const state = makeState({
      placements: [placement],
      connections: [existingConn],
    });

    const next = editorReducer(state, {
      type: "PENCIL_DRAG_START",
      sourcePlacementId: "pl_A",
      sourcePinName: "north",
      cursorWorld: { x: 0, y: 0 },
    });

    expect(next.pencilDrag).toBeNull();
    expect(next.lastBlockReason).toBeTruthy();
    expect(typeof next.lastBlockReason).toBe("string");
    expect(next.lastBlockReason!.length).toBeGreaterThan(0);
  });

  // ── 7.3: PENCIL_DRAG_MOVE updates cursor + snapTarget, no bump ────────────
  it("7.3 PENCIL_DRAG_MOVE updates cursor and snapTarget without bumping state", () => {
    const state = makeStateWithDrag("pl_A", "north");
    const initialPastLen = state.past.length;

    const snapTarget = { placementId: "pl_B", pinName: "south" };
    const next = editorReducer(state, {
      type: "PENCIL_DRAG_MOVE",
      cursorWorld: { x: 3, y: 4 },
      snapTarget,
    });

    expect(next.pencilDrag).not.toBeNull();
    expect(next.pencilDrag!.cursorWorld).toEqual({ x: 3, y: 4 });
    expect(next.pencilDrag!.snapTarget).toEqual(snapTarget);
    // No undo entry added
    expect(next.past).toHaveLength(initialPastLen);
  });

  // ── 7.4: PENCIL_DRAG_CANCEL clears pencilDrag and lastBlockReason ─────────
  it("7.4 PENCIL_DRAG_CANCEL clears pencilDrag and lastBlockReason", () => {
    const state = makeStateWithDrag("pl_A", "north", {
      lastBlockReason: "some prior error",
    });

    const next = editorReducer(state, { type: "PENCIL_DRAG_CANCEL" });

    expect(next.pencilDrag).toBeNull();
    expect(next.lastBlockReason).toBeNull();
  });

  // ── 7.5: PENCIL_DRAG_END self-pin → rejected, no connection, lastBlockReason null ─
  it("7.5 PENCIL_DRAG_END self-pin is silently rejected with no new connection", () => {
    const state = makeStateWithDrag("pl_A", "north");
    const initialConnectionCount = state.connections.length;

    const next = editorReducer(state, {
      type: "PENCIL_DRAG_END",
      targetPlacementId: "pl_A",
      targetPinName: "north",
    });

    expect(next.connections).toHaveLength(initialConnectionCount);
    expect(next.pencilDrag).toBeNull();
    // Self-pin is a silent cancel — no error toast
    expect(next.lastBlockReason).toBeNull();
  });

  // ── 7.6: PENCIL_DRAG_END self-loop → rejected, no new connection ──────────
  it("7.6 PENCIL_DRAG_END self-loop (different pin, same placement) is silently rejected", () => {
    const placement = makePlacement("pl_A");
    const state = makeStateWithDrag("pl_A", "north", {
      placements: [placement],
    });
    const initialConnectionCount = state.connections.length;

    const next = editorReducer(state, {
      type: "PENCIL_DRAG_END",
      targetPlacementId: "pl_A",   // same placement
      targetPinName: "south",       // different pin
    });

    expect(next.connections).toHaveLength(initialConnectionCount);
    expect(next.pencilDrag).toBeNull();
  });

  // ── 7.7: PENCIL_DRAG_END duplicate edge → rejected, lastBlockReason set ───
  it("7.7 PENCIL_DRAG_END duplicate edge is rejected and sets lastBlockReason", () => {
    const existing = makeConnection("pl_A", "north", "pl_B", "south");
    const state = makeStateWithDrag("pl_A", "north", {
      connections: [existing],
    });
    const initialConnectionCount = state.connections.length;

    const next = editorReducer(state, {
      type: "PENCIL_DRAG_END",
      targetPlacementId: "pl_B",
      targetPinName: "south",
    });

    expect(next.connections).toHaveLength(initialConnectionCount);
    expect(next.lastBlockReason).toBeTruthy();
    expect(next.lastBlockReason!.length).toBeGreaterThan(0);
  });

  // ── 7.8: PENCIL_DRAG_END occupied target → rejected, lastBlockReason set ──
  it("7.8 PENCIL_DRAG_END occupied target pin is rejected and sets lastBlockReason", () => {
    // pl_B "south" already has one connection — it is at capacity
    const occupyingConn = makeConnection("pl_C", "east", "pl_B", "south");
    const state = makeStateWithDrag("pl_A", "north", {
      connections: [occupyingConn],
    });
    const initialConnectionCount = state.connections.length;

    const next = editorReducer(state, {
      type: "PENCIL_DRAG_END",
      targetPlacementId: "pl_B",
      targetPinName: "south",
    });

    expect(next.connections).toHaveLength(initialConnectionCount);
    expect(next.lastBlockReason).toBeTruthy();
    expect(next.lastBlockReason!.length).toBeGreaterThan(0);
  });

  // ── 7.9: PENCIL_DRAG_END valid → connection added, selection + drag cleared ─
  it("7.9 PENCIL_DRAG_END valid target creates connection with RouteMeander and updates selection", () => {
    const plA = makePlacement("pl_A");
    const plB = makePlacement("pl_B");
    const state = makeStateWithDrag("pl_A", "north", {
      placements: [plA, plB],
      connections: [],
    });
    const initialConnectionCount = state.connections.length;

    const next = editorReducer(state, {
      type: "PENCIL_DRAG_END",
      targetPlacementId: "pl_B",
      targetPinName: "south",
    });

    // One new connection added
    expect(next.connections).toHaveLength(initialConnectionCount + 1);

    const newConn = next.connections[next.connections.length - 1];
    expect(newConn.routeComponentId).toBe("RouteMeander");
    expect(newConn.from.placementId).toBe("pl_A");
    expect(newConn.from.pinName).toBe("north");
    expect(newConn.to.placementId).toBe("pl_B");
    expect(newConn.to.pinName).toBe("south");

    // Selection set to the new connection
    expect(next.selection).toHaveLength(1);
    expect(next.selection[0].kind).toBe("connection");
    expect(next.selection[0].id).toBe(newConn.id);

    // Drag cleared
    expect(next.pencilDrag).toBeNull();
  });
});

// =============================================================================
// Task 8: findNearestPin unit tests
// =============================================================================

/**
 * Identity world-to-screen transform: passes world coords through as px unchanged.
 * Works because pin hints are in µm and the code divides by 1000, so a placement
 * at world (0,0) with a pin hint at (hx µm, hy µm) ends up at world (hx/1000, hy/1000).
 * For test purposes we set hint values so the pin lands at a round world coordinate
 * and use an identity w2s that maps mm ≡ px.
 */
const identityW2s = (x: number, y: number) => ({ px: x, py: y });

/**
 * Build a PinSpec whose hint (in µm) places the pin at (worldX mm, worldY mm)
 * on a placement at (0, 0) with no rotation or mirror.
 * worldX mm → hint.x µm = worldX * 1000
 */
function makePinAt(name: string, worldXMm: number, worldYMm: number): PinSpec {
  return {
    name,
    direction: "io",
    hint: { x: worldXMm * 1000, y: worldYMm * 1000, angle: 0 },
  };
}

describe("findNearestPin", () => {
  // ── 8.1: Returns null when cursor > 24px from every pin ──────────────────
  it("8.1 returns null when cursor is more than 24 px from every pin", () => {
    const placement = makePlacement("pl_A", 0, 0);
    // Pin sits at world (100, 100) → screen (100, 100) with identity w2s
    const pinMap = new Map<string, PinSpec[]>([
      ["pl_A", [makePinAt("north", 100, 100)]],
    ]);
    // Cursor at (125, 125) — distance ≈ 35.4 px
    const result = findNearestPin(
      [placement],
      pinMap,
      { px: 125, py: 125 },
      identityW2s,
      "pl_X",   // different source — nothing is excluded
      "unused",
    );
    expect(result).toBeNull();
  });

  // ── 8.2: Returns correct pin when cursor is within 24px ──────────────────
  it("8.2 returns the correct pin when cursor is within 24 px", () => {
    const placement = makePlacement("pl_A", 0, 0);
    // Pin at world (100, 100)
    const pinMap = new Map<string, PinSpec[]>([
      ["pl_A", [makePinAt("north", 100, 100)]],
    ]);
    // Cursor at (115, 115) — distance ≈ 21.2 px (within radius)
    const result = findNearestPin(
      [placement],
      pinMap,
      { px: 115, py: 115 },
      identityW2s,
      "pl_X",
      "unused",
    );
    expect(result).not.toBeNull();
    expect(result!.placementId).toBe("pl_A");
    expect(result!.pinName).toBe("north");
  });

  // ── 8.3: Never returns source pin itself (even at distance 0) ────────────
  it("8.3 never returns the source pin itself even when cursor is directly over it", () => {
    const placement = makePlacement("pl_A", 0, 0);
    // Pin at world (0, 0)
    const pinMap = new Map<string, PinSpec[]>([
      ["pl_A", [makePinAt("north", 0, 0)]],
    ]);
    // Cursor exactly at (0, 0) — distance = 0
    const result = findNearestPin(
      [placement],
      pinMap,
      { px: 0, py: 0 },
      identityW2s,
      "pl_A",    // source placement
      "north",   // source pin
    );
    expect(result).toBeNull();
  });

  // ── 8.4: Returns closest pin when multiple pins are within radius ─────────
  it("8.4 returns the closest pin when multiple pins are within the snap radius", () => {
    const plA = makePlacement("pl_A", 0, 0);
    const plB = makePlacement("pl_B", 0, 0);
    // Pin A at (10, 0) — distance from cursor (0,0) = 10 px
    // Pin B at (20, 0) — distance from cursor (0,0) = 20 px
    const pinMap = new Map<string, PinSpec[]>([
      ["pl_A", [makePinAt("close", 10, 0)]],
      ["pl_B", [makePinAt("far", 20, 0)]],
    ]);
    const result = findNearestPin(
      [plA, plB],
      pinMap,
      { px: 0, py: 0 },
      identityW2s,
      "pl_X",
      "unused",
    );
    expect(result).not.toBeNull();
    expect(result!.placementId).toBe("pl_A");
    expect(result!.pinName).toBe("close");
  });
});

// =============================================================================
// Task 9: Property-based tests — magic-pencil-tool
// =============================================================================

describe("PBT — magic-pencil-tool", () => {
  // ── 9.1: Property 1 — findNearestPin never returns source pin ─────────────
  // Feature: magic-pencil-tool, Property 1: source-pin exclusion from snap candidates
  it("9.1 Property 1: findNearestPin never returns the source pin regardless of cursor position", () => {
    // Validates: Requirements 7.4
    fc.assert(
      fc.property(
        // Generate 1–5 placements
        fc.array(
          fc.record({
            id: fc.uuid(),
            x: fc.float({ min: -4, max: 4, noNaN: true }),
            y: fc.float({ min: -3, max: 3, noNaN: true }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        fc.tuple(
          fc.float({ min: -100, max: 100, noNaN: true }),
          fc.float({ min: -100, max: 100, noNaN: true }),
        ),
        (placements, [cursorPx, cursorPy]) => {
          if (placements.length === 0) return;

          // Pick the first placement + a pin named "p0" as source
          const sourcePlacement = placements[0];
          const sourcePinName = "p0";

          // Build pinMap: each placement gets one pin at a position based on its index
          const builtPlacements: Placement[] = placements.map((p) =>
            makePlacement(p.id, p.x, p.y),
          );
          const pinMap = new Map<string, PinSpec[]>(
            placements.map((p, idx) => [
              p.id,
              [makePinAt(`p${idx}`, p.x, p.y)],
            ]),
          );

          const result = findNearestPin(
            builtPlacements,
            pinMap,
            { px: cursorPx, py: cursorPy },
            identityW2s,
            sourcePlacement.id,
            sourcePinName,
          );

          // Result must not be the source pin
          if (result !== null) {
            expect(
              result.placementId === sourcePlacement.id &&
              result.pinName === sourcePinName,
            ).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── 9.2: Property 2 — snap radius boundary ────────────────────────────────
  // Feature: magic-pencil-tool, Property 2: snap radius boundary
  it("9.2 Property 2: findNearestPin returns non-null iff distance < 24 px (single pin, identity w2s)", () => {
    // Validates: Requirements 7.1, 7.3
    fc.assert(
      fc.property(
        // pin world position (= screen position with identity w2s)
        fc.float({ min: -200, max: 200, noNaN: true }),
        fc.float({ min: -200, max: 200, noNaN: true }),
        // cursor offset from pin
        fc.float({ min: 0, max: 60, noNaN: true }),
        fc.float({ min: -1, max: 1, noNaN: true }), // direction cosine
        (pinX, pinY, dist, dirCosX) => {
          // Clamp dirCosX to avoid degenerate zero-vector
          const clampedDirCosX = Math.abs(dirCosX) < 0.001 ? 0.5 : dirCosX;
          const dirCosY = Math.sqrt(Math.max(0, 1 - clampedDirCosX * clampedDirCosX));
          const cursorPx = pinX + dist * clampedDirCosX;
          const cursorPy = pinY + dist * dirCosY;

          const placement = makePlacement("pl_T", 0, 0);
          const pinMap = new Map<string, PinSpec[]>([
            ["pl_T", [makePinAt("target", pinX, pinY)]],
          ]);

          const result = findNearestPin(
            [placement],
            pinMap,
            { px: cursorPx, py: cursorPy },
            identityW2s,
            "pl_SOURCE",   // different source — target pin is never excluded
            "unused",
          );

          if (dist < PENCIL_SNAP_RADIUS_PX) {
            expect(result).not.toBeNull();
          } else {
            expect(result).toBeNull();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── 9.3: Property 3 — canvas state immutability during pencil drag ─────────
  // Feature: magic-pencil-tool, Property 3: canvas state immutability during pencil drag
  it("9.3 Property 3: PENCIL_DRAG_START + PENCIL_DRAG_MOVE never mutate placements, connections, or past", () => {
    // Validates: Requirements 3.5
    fc.assert(
      fc.property(
        // Number of PENCIL_DRAG_MOVE actions to apply (0–5)
        fc.integer({ min: 0, max: 5 }),
        fc.array(
          fc.record({
            x: fc.float({ min: -5, max: 5, noNaN: true }),
            y: fc.float({ min: -5, max: 5, noNaN: true }),
          }),
          { minLength: 0, maxLength: 5 },
        ),
        (moveCount, movePositions) => {
          const plA = makePlacement("pl_A");
          const plB = makePlacement("pl_B");
          let state = makeState({
            placements: [plA, plB],
            connections: [],
          });

          // Capture references BEFORE any pencil actions
          const origPlacements = state.placements;
          const origConnections = state.connections;
          const origPast = state.past;

          // Apply PENCIL_DRAG_START
          state = editorReducer(state, {
            type: "PENCIL_DRAG_START",
            sourcePlacementId: "pl_A",
            sourcePinName: "north",
            cursorWorld: { x: 0, y: 0 },
          });

          // Apply up to moveCount PENCIL_DRAG_MOVE actions
          const actualMoves = Math.min(moveCount, movePositions.length);
          for (let i = 0; i < actualMoves; i++) {
            state = editorReducer(state, {
              type: "PENCIL_DRAG_MOVE",
              cursorWorld: movePositions[i],
              snapTarget: null,
            });
          }

          // placements, connections, and past must be reference-equal to originals
          expect(state.placements).toBe(origPlacements);
          expect(state.connections).toBe(origConnections);
          expect(state.past).toBe(origPast);
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── 9.4: Property 4 — all invalid targets rejected by PENCIL_DRAG_END ─────
  // Feature: magic-pencil-tool, Property 4: validation completeness — all invalid targets are rejected
  it("9.4 Property 4: PENCIL_DRAG_END always rejects invalid targets without adding connections", () => {
    // Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6
    fc.assert(
      fc.property(
        // Choose which kind of invalid target to generate (0–3)
        fc.integer({ min: 0, max: 3 }),
        (invalidKind) => {
          const plA = makePlacement("pl_A");
          const plB = makePlacement("pl_B");

          let connections: Connection[] = [];
          let targetPlacementId: string;
          let targetPinName: string;

          switch (invalidKind) {
            case 0:
              // Self-pin: same placementId AND same pinName
              targetPlacementId = "pl_A";
              targetPinName = "north";
              break;
            case 1:
              // Self-loop: same placement, different pin
              targetPlacementId = "pl_A";
              targetPinName = "south";
              break;
            case 2:
              // Duplicate edge: connection already exists
              connections = [makeConnection("pl_A", "north", "pl_B", "east")];
              targetPlacementId = "pl_B";
              targetPinName = "east";
              break;
            case 3:
            default:
              // Occupied target: pl_B "east" is already at capacity
              connections = [makeConnection("pl_C", "west", "pl_B", "east")];
              targetPlacementId = "pl_B";
              targetPinName = "east";
              break;
          }

          const state = makeStateWithDrag("pl_A", "north", {
            placements: [plA, plB],
            connections,
          });
          const initialLen = state.connections.length;

          const next = editorReducer(state, {
            type: "PENCIL_DRAG_END",
            targetPlacementId,
            targetPinName,
          });

          expect(next.connections).toHaveLength(initialLen);
          expect(next.pencilDrag).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── 9.5: Property 5 — valid connection creation correctness ───────────────
  // Feature: magic-pencil-tool, Property 5: valid connection creation correctness
  it("9.5 Property 5: valid PENCIL_DRAG_END always adds exactly one RouteMeander connection", () => {
    // Validates: Requirements 4.1, 4.2, 4.3
    fc.assert(
      fc.property(
        // Generate unique source / target pin names to keep pins free
        fc.string({ minLength: 1, maxLength: 8, unit: "grapheme-ascii" }),
        fc.string({ minLength: 1, maxLength: 8, unit: "grapheme-ascii" }),
        (srcPin, tgtPin) => {
          const plA = makePlacement("pl_A");
          const plB = makePlacement("pl_B");

          const state = makeStateWithDrag("pl_A", `pin_${srcPin}`, {
            placements: [plA, plB],
            connections: [],
          });
          const initialLen = state.connections.length;

          const next = editorReducer(state, {
            type: "PENCIL_DRAG_END",
            targetPlacementId: "pl_B",
            targetPinName: `pin_${tgtPin}`,
          });

          // Exactly one connection added
          expect(next.connections).toHaveLength(initialLen + 1);

          const newConn = next.connections[next.connections.length - 1];
          expect(newConn.routeComponentId).toBe("RouteMeander");
          expect(newConn.from.placementId).toBe("pl_A");
          expect(newConn.from.pinName).toBe(`pin_${srcPin}`);
          expect(newConn.to.placementId).toBe("pl_B");
          expect(newConn.to.pinName).toBe(`pin_${tgtPin}`);

          expect(next.pencilDrag).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  // ── 9.6: Property 6 — undo stack grows on successful connection ───────────
  // Feature: magic-pencil-tool, Property 6: undo stack grows on successful connection
  it("9.6 Property 6: successful PENCIL_DRAG_END increments past.length by 1 and empties future", () => {
    // Validates: Requirements 4.4
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8, unit: "grapheme-ascii" }),
        fc.string({ minLength: 1, maxLength: 8, unit: "grapheme-ascii" }),
        (srcPin, tgtPin) => {
          const plA = makePlacement("pl_A");
          const plB = makePlacement("pl_B");

          const state = makeStateWithDrag("pl_A", `pin_${srcPin}`, {
            placements: [plA, plB],
            connections: [],
            future: [],
          });
          const pastLen = state.past.length;

          const next = editorReducer(state, {
            type: "PENCIL_DRAG_END",
            targetPlacementId: "pl_B",
            targetPinName: `pin_${tgtPin}`,
          });

          expect(next.past).toHaveLength(pastLen + 1);
          expect(next.future).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
