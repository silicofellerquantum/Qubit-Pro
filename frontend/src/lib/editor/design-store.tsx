import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import type {
  Connection,
  DesignDocument,
  Placement,
  PinSpec,
} from "@/lib/bridge/types";
import { loadDesign, saveDesign, clearDesign } from "./persistence";

export { clearDesign };

const CHIP_W_MM = 9.0;
const CHIP_H_MM = 6.0;
const CHIP_HALF_W = CHIP_W_MM / 2;
const CHIP_HALF_H = CHIP_H_MM / 2;


// ---------- State ----------

export type Tool = "select" | "pan" | "route" | "pencil";

export interface SelectionItem {
  kind: "placement" | "connection";
  id: string;
}

export type Selection = SelectionItem[];

/** Check if an object is in the current selection */
export function isSelected(sel: Selection, kind: SelectionItem["kind"], id: string): boolean {
  return sel.some((s) => s.kind === kind && s.id === id);
}

/** Get the single selected item (first), or null if none */
export function getSingleSelection(sel: Selection): SelectionItem | null {
  return sel.length > 0 ? sel[0] : null;
}

export interface PendingPin {
  placementId: string;
  pinName: string;
}

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
  /**
   * Freehand path points collected during the drag gesture, in world-space mm.
   * Used to render the live preview curve and stored as the connection's
   * cachedSvg geometry on commit.
   */
  pathPoints: { x: number; y: number }[];
}

export interface EditorState {
  placements: Placement[];
  connections: Connection[];
  selection: Selection;
  pendingPin: PendingPin | null;
  zoom: number;
  pan: { x: number; y: number };
  tool: Tool;
  snap: number;
  showConnections: boolean;
  showGrid: boolean;
  showRulers: boolean;
  showComponentIds: boolean;
  showHUD: boolean;
  showMiniMap: boolean;
  past: Snapshot[];
  future: Snapshot[];
  rev: number;
  /**
   * Set whenever a connection attempt is blocked by validation.
   * Consumers (e.g. the canvas) watch this field and show the
   * appropriate user feedback. Reset to null on the next successful
   * action or on CANCEL_PIN.
   */
  lastBlockReason: string | null;
  /** Transient drag state for the pencil tool. null when no drag is in progress. */
  pencilDrag: PencilDragState | null;
}

/** Screen-space snap radius in pixels for the pencil tool. */
export const PENCIL_SNAP_RADIUS_PX = 24;

// ---------- Pin capacity helpers ----------

/**
 * Default maximum connections per pin.
 * A single physical pin can carry exactly one signal in quantum hardware.
 * This constant is the fallback until per-pin metadata is available.
 */
export const DEFAULT_MAX_CONNECTIONS_PER_PIN = 1;

/**
 * Count how many connections are currently attached to a specific pin.
 * Counts both ends (from + to) so directionality does not matter.
 */
export function pinOccupancy(
  connections: Connection[],
  placementId: string,
  pinName: string,
): number {
  return connections.filter(
    (c) =>
      (c.from.placementId === placementId && c.from.pinName === pinName) ||
      (c.to.placementId === placementId && c.to.pinName === pinName),
  ).length;
}

/**
 * Return the maximum number of connections allowed on a pin.
 * Reads PinSpec metadata when available; falls back to the global default.
 * This is the single extension point: once PinSpec gains `maxConnections`,
 * update this function and all validation automatically benefits.
 */
export function maxConnectionsForPin(
  // Reserved for future PinSpec metadata lookup
  _placementId: string,
  _pinName: string,
): number {
  // Future: look up PinSpec.maxConnections from a pin catalog / metadata store.
  return DEFAULT_MAX_CONNECTIONS_PER_PIN;
}

/**
 * Given a list of all placements (with their pin specs resolved via pinMap),
 * a current cursor position in screen-space pixels, and a source pin to
 * exclude, return the nearest pin endpoint within snapRadiusPx.
 *
 * @param placements     All placements on the canvas
 * @param pinMap         Map from placementId to the resolved PinSpec array for that placement
 * @param cursorScreen   Current cursor position in screen-space pixels { px, py }
 * @param w2s            World-to-screen transform: (x, y) → { px, py }
 * @param sourcePlacementId  The placement the drag started from (excluded from candidates)
 * @param sourcePinName      The pin the drag started from (excluded from candidates)
 * @param snapRadiusPx   Maximum screen-space distance to consider (defaults to PENCIL_SNAP_RADIUS_PX)
 * @returns { placementId, pinName } of the nearest qualifying pin, or null
 */
export function findNearestPin(
  placements: Placement[],
  pinMap: Map<string, PinSpec[]>,
  cursorScreen: { px: number; py: number },
  w2s: (x: number, y: number) => { px: number; py: number },
  sourcePlacementId: string,
  sourcePinName: string,
  snapRadiusPx: number = PENCIL_SNAP_RADIUS_PX,
): { placementId: string; pinName: string } | null {
  let bestDist = Infinity;
  let bestPin: { placementId: string; pinName: string } | null = null;

  for (const placement of placements) {
    const pins = pinMap.get(placement.id);
    if (!pins) continue;

    for (const pin of pins) {
      // Skip the source pin itself
      if (placement.id === sourcePlacementId && pin.name === sourcePinName) continue;

      // Convert pin hint position (µm) to world-space mm, applying placement transform
      const angleRad = (placement.rotation * Math.PI) / 180;
      const cosA = Math.cos(angleRad);
      const sinA = Math.sin(angleRad);
      // Pin hint is in µm — convert to mm
      const hintXMm = pin.hint.x / 1000;
      const hintYMm = pin.hint.y / 1000;
      // Apply mirrorX if set
      const mx = placement.mirrorX ? -hintXMm : hintXMm;
      // Rotate and translate to world space
      const worldX = placement.x + mx * cosA - hintYMm * sinA;
      const worldY = placement.y + mx * sinA + hintYMm * cosA;

      const screenPos = w2s(worldX, worldY);
      const dx = cursorScreen.px - screenPos.px;
      const dy = cursorScreen.py - screenPos.py;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < snapRadiusPx && dist < bestDist) {
        bestDist = dist;
        bestPin = { placementId: placement.id, pinName: pin.name };
      }
    }
  }

  return bestPin;
}

/**
 * Convert an array of {x,y} points (in µm) into a smooth SVG path string
 * using Catmull-Rom to cubic Bézier conversion. This makes freehand strokes
 * look smooth rather than jagged polylines.
 *
 * The resulting <path> uses the quantum CPW wire style (stroke "#0284c7",
 * stroke-width 30µm, no fill, round caps) to match the existing route style.
 */
export function pointsToSmoothSvgPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  if (pts.length === 2) {
    return `<path d="M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}" stroke="#0284c7" stroke-width="30" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  }
  // Catmull-Rom → cubic Bézier (tension = 0.5)
  const tension = 0.5;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) * tension / 3;
    const cp1y = p1.y + (p2.y - p0.y) * tension / 3;
    const cp2x = p2.x - (p3.x - p1.x) * tension / 3;
    const cp2y = p2.y - (p3.y - p1.y) * tension / 3;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x} ${p2.y}`;
  }
  return `<path d="${d}" stroke="#0284c7" stroke-width="30" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}

interface Snapshot {
  placements: Placement[];
  connections: Connection[];
}

const MAX_HISTORY = 50;

export type EditorAction =
  | { type: "ADD_PLACEMENT"; placement: Placement }
  | { type: "DUPLICATE_PLACEMENT"; id: string }
  | { type: "PASTE_PLACEMENTS"; placements: Placement[] }
  | { type: "MIRROR_PLACEMENT"; id: string }
  | { type: "LOCK_PLACEMENT"; id: string }
  | { type: "UNLOCK_PLACEMENT"; id: string }
  | { type: "MOVE_PLACEMENT"; id: string; x: number; y: number; transient?: boolean }
  | { type: "UPDATE_PLACEMENT"; id: string; patch: Partial<Placement> }
  | { type: "DELETE_PLACEMENT"; id: string }
  | { type: "PIN_CLICK"; placementId: string; pinName: string; defaultRouteComponentId?: string }
  | { type: "CANCEL_PIN" }
  | { type: "DELETE_CONNECTION"; id: string }
  | { type: "UPDATE_CONNECTION"; id: string; patch: Partial<Connection> }
  | { type: "LOCK_CONNECTION"; id: string }
  | { type: "UNLOCK_CONNECTION"; id: string }
  | { type: "CLEAR_ROUTE_CACHE" }
  | { type: "SET_CONNECTION_GEOMETRY"; id: string; svg: string; hash: string }
  | { type: "SELECT"; selection: Selection }
  | { type: "TOGGLE_SELECT"; item: SelectionItem }
  | { type: "SET_TOOL"; tool: Tool }
  | { type: "ZOOM"; zoom: number }
  | { type: "PAN"; x: number; y: number }
  | { type: "SET_SNAP"; snap: number }
  | { type: "TOGGLE_CONNECTIONS" }
  | { type: "TOGGLE_GRID" }
  | { type: "TOGGLE_RULERS" }
  | { type: "TOGGLE_COMPONENT_IDS" }
  | { type: "TOGGLE_HUD" }
  | { type: "TOGGLE_MINIMAP" }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "LOAD"; doc: DesignDocument }
  | { type: "PENCIL_DRAG_START"; sourcePlacementId: string; sourcePinName: string; cursorWorld: { x: number; y: number } }
  | { type: "PENCIL_DRAG_MOVE"; cursorWorld: { x: number; y: number }; snapTarget: { placementId: string; pinName: string } | null }
  | { type: "PENCIL_DRAG_END"; targetPlacementId: string; targetPinName: string }
  | { type: "PENCIL_DRAG_CANCEL" };

function snapshot(s: EditorState): Snapshot {
  return {
    placements: s.placements.map((p) => ({ ...p, params: { ...p.params } })),
    connections: s.connections.map((c) => ({
      ...c,
      routeOverrides: c.routeOverrides ? { ...c.routeOverrides } : undefined,
    })),
  };
}

function bump(s: EditorState): Pick<EditorState, "past" | "future" | "rev"> {
  return {
    past: [...s.past, snapshot(s)].slice(-MAX_HISTORY),
    future: [],
    rev: s.rev + 1,
  };
}

export const initialEditorState: EditorState = {
  placements: [],
  connections: [],
  selection: [],
  pendingPin: null,
  zoom: 0.5,
  pan: { x: 0, y: 0 },
  tool: "select",
  snap: 0.05,
  showConnections: true,
  showGrid: true,
  showRulers: true,
  showComponentIds: false,
  showHUD: true,
  showMiniMap: (() => {
    try {
      const saved = localStorage.getItem("editor_minimap_visible");
      return saved === null ? false : saved === "true";
    } catch { return false; }
  })(),
  past: [],
  future: [],
  rev: 0,
  lastBlockReason: null,
  pencilDrag: null,
};

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "ADD_PLACEMENT":
      return {
        ...state,
        ...bump(state),
        placements: [...state.placements, action.placement],
        selection: [{ kind: "placement", id: action.placement.id }],
      };
    case "DUPLICATE_PLACEMENT": {
      const src = state.placements.find(p => p.id === action.id);
      if (!src) return state;
      const copyId = `pl_${src.componentId}_${Date.now()}`;
      const copyName = `${src.name}_copy`;
      const copy: Placement = {
        ...src,
        id: copyId,
        name: copyName,
        x: Math.max(-CHIP_HALF_W, Math.min(CHIP_HALF_W, src.x + 0.2)),
        y: Math.max(-CHIP_HALF_H, Math.min(CHIP_HALF_H, src.y - 0.2)),
        params: { ...src.params }
      };
      return {
        ...state,
        ...bump(state),
        placements: [...state.placements, copy],
        selection: [{ kind: "placement", id: copyId }],
      };
    }
    case "PASTE_PLACEMENTS": {
      if (action.placements.length === 0) return state;
      const offset = 0.2;
      const pasted: Placement[] = action.placements.map((p) => ({
        ...p,
        id: `pl_${p.componentId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: `${p.name}_copy`,
        x: Math.max(-CHIP_HALF_W, Math.min(CHIP_HALF_W, p.x + offset)),
        y: Math.max(-CHIP_HALF_H, Math.min(CHIP_HALF_H, p.y - offset)),
        params: { ...p.params },
      }));
      return {
        ...state,
        ...bump(state),
        placements: [...state.placements, ...pasted],
        selection: pasted.map((p) => ({ kind: "placement" as const, id: p.id })),
      };
    }
    case "MIRROR_PLACEMENT": {
      const next = {
        ...state,
        ...bump(state),
        placements: state.placements.map((p) =>
          p.id === action.id ? { ...p, mirrorX: !p.mirrorX } : p,
        ),
      };
      return next;
    }
    case "LOCK_PLACEMENT":
      return {
        ...state,
        ...bump(state),
        placements: state.placements.map((p) =>
          p.id === action.id ? { ...p, locked: true } : p,
        ),
      };
    case "UNLOCK_PLACEMENT":
      return {
        ...state,
        ...bump(state),
        placements: state.placements.map((p) =>
          p.id === action.id ? { ...p, locked: false } : p,
        ),
      };
    case "MOVE_PLACEMENT": {
      const target = state.placements.find((p) => p.id === action.id);
      if (target?.locked) return state;
      // Invalidate cached geometry for all routes touching this placement
      // so locked routes don't show stale SVG after a component is moved.
      const connections = action.transient
        ? state.connections
        : state.connections.map((c) => {
          const touches =
            c.from.placementId === action.id || c.to.placementId === action.id;
          if (!touches) return c;
          return { ...c, cachedGeometryHash: undefined };
        });
      const next = {
        ...state,
        placements: state.placements.map((p) =>
          p.id === action.id ? { ...p, x: action.x, y: action.y } : p,
        ),
        connections,
      };
      return action.transient ? next : { ...next, ...bump(state) };
    }
    case "UPDATE_PLACEMENT":
      return {
        ...state,
        ...bump(state),
        placements: state.placements.map((p) =>
          p.id === action.id ? { ...p, ...action.patch } : p,
        ),
      };
    case "DELETE_PLACEMENT": {
      const target = state.placements.find((p) => p.id === action.id);
      if (target?.locked) return state;
      return {
        ...state,
        ...bump(state),
        placements: state.placements.filter((p) => p.id !== action.id),
        // Cascade: drop any connection touching this placement.
        connections: state.connections.filter(
          (c) => c.from.placementId !== action.id && c.to.placementId !== action.id,
        ),
        selection: state.selection.filter(
          (s) => !(s.kind === "placement" && s.id === action.id),
        ),
      };
    }
    case "PIN_CLICK": {
      if (!state.pendingPin) {
        return {
          ...state,
          lastBlockReason: null,
          pendingPin: { placementId: action.placementId, pinName: action.pinName },
        };
      }
      // Same pin clicked again → cancel
      if (
        state.pendingPin.placementId === action.placementId &&
        state.pendingPin.pinName === action.pinName
      ) {
        return { ...state, pendingPin: null, lastBlockReason: null };
      }
      // Prevent self-loops (same placement, different pin)
      if (state.pendingPin.placementId === action.placementId) {
        return { ...state, pendingPin: null, lastBlockReason: null };
      }
      // ── Prevent duplicate connections (either direction) ──────────────────
      const alreadyExists = state.connections.some((c) => {
        const fwd =
          c.from.placementId === state.pendingPin!.placementId &&
          c.from.pinName === state.pendingPin!.pinName &&
          c.to.placementId === action.placementId &&
          c.to.pinName === action.pinName;
        const rev =
          c.from.placementId === action.placementId &&
          c.from.pinName === action.pinName &&
          c.to.placementId === state.pendingPin!.placementId &&
          c.to.pinName === state.pendingPin!.pinName;
        return fwd || rev;
      });
      if (alreadyExists) {
        return {
          ...state,
          pendingPin: null,
          lastBlockReason: `Pin "${state.pendingPin.pinName}" is already connected to pin "${action.pinName}". Duplicate connections are not allowed.`,
        };
      }
      // ── Single-connection-per-pin capacity check ─────────────────────────
      // Check the "from" pin (the first pin the user clicked, i.e. pendingPin)
      const fromMax = maxConnectionsForPin(state.pendingPin.placementId, state.pendingPin.pinName);
      const fromCount = pinOccupancy(state.connections, state.pendingPin.placementId, state.pendingPin.pinName);
      if (fromCount >= fromMax) {
        return {
          ...state,
          pendingPin: null,
          lastBlockReason: `Pin "${state.pendingPin.pinName}" already has a connection. Maximum allowed: ${fromMax}.`,
        };
      }
      // Check the "to" pin (the second pin the user clicked)
      const toMax = maxConnectionsForPin(action.placementId, action.pinName);
      const toCount = pinOccupancy(state.connections, action.placementId, action.pinName);
      if (toCount >= toMax) {
        return {
          ...state,
          pendingPin: null,
          lastBlockReason: `Pin "${action.pinName}" already has a connection. Maximum allowed: ${toMax}.`,
        };
      }
      // ── All checks passed — commit the connection ─────────────────────────
      const id = `conn_${state.pendingPin.placementId}_${state.pendingPin.pinName}__${action.placementId}_${action.pinName}_${Date.now()}`;
      const conn: Connection = {
        id,
        from: { placementId: state.pendingPin.placementId, pinName: state.pendingPin.pinName },
        to: { placementId: action.placementId, pinName: action.pinName },
        routeComponentId: action.defaultRouteComponentId,
      };
      return {
        ...state,
        ...bump(state),
        pendingPin: null,
        lastBlockReason: null,
        connections: [...state.connections, conn],
        selection: [{ kind: "connection", id }],
      };
    }
    case "CANCEL_PIN":
      return { ...state, pendingPin: null, lastBlockReason: null };
    case "DELETE_CONNECTION":
      return {
        ...state,
        ...bump(state),
        connections: state.connections.filter((c) => c.id !== action.id),
        selection: state.selection.filter(
          (s) => !(s.kind === "connection" && s.id === action.id),
        ),
      };
    case "UPDATE_CONNECTION":
      return {
        ...state,
        ...bump(state),
        connections: state.connections.map((c) =>
          c.id === action.id ? { ...c, ...action.patch } : c,
        ),
      };
    case "LOCK_CONNECTION":
      return {
        ...state,
        ...bump(state),
        connections: state.connections.map((c) =>
          c.id === action.id ? { ...c, locked: true } : c,
        ),
      };
    case "UNLOCK_CONNECTION":
      return {
        ...state,
        ...bump(state),
        connections: state.connections.map((c) =>
          c.id === action.id ? { ...c, locked: false, cachedSvg: undefined, cachedGeometryHash: undefined } : c,
        ),
      };
    case "CLEAR_ROUTE_CACHE":
      return {
        ...state,
        ...bump(state),
        connections: state.connections.map((c) => ({
          ...c, locked: false, cachedSvg: undefined, cachedGeometryHash: undefined,
        })),
      };
    case "SET_CONNECTION_GEOMETRY":
      return {
        ...state,
        connections: state.connections.map((c) =>
          c.id === action.id ? { ...c, cachedSvg: action.svg, cachedGeometryHash: action.hash } : c,
        ),
      };
    case "SELECT":
      return { ...state, selection: action.selection ?? [], pendingPin: null };
    case "TOGGLE_SELECT": {
      const sel = state.selection ?? [];
      const exists = sel.some(
        (s) => s.kind === action.item.kind && s.id === action.item.id,
      );
      return {
        ...state,
        selection: exists
          ? sel.filter(
            (s) => !(s.kind === action.item.kind && s.id === action.item.id),
          )
          : [...sel, action.item],
        pendingPin: null,
      };
    }
    case "SET_TOOL":
      return { ...state, tool: action.tool };
    case "ZOOM": {
      // Guard against NaN/Infinity before clamping — any non-finite value
      // falls back to the minimum zoom so the canvas remains navigable.
      const rawZoom = Number.isFinite(action.zoom) ? action.zoom : 0.25;
      return { ...state, zoom: Math.max(0.25, Math.min(8, rawZoom)) };
    }
    case "PAN":
      return { ...state, pan: { x: action.x, y: action.y } };
    case "SET_SNAP":
      return { ...state, snap: Math.max(0.001, Math.min(1, action.snap)) };
    case "TOGGLE_CONNECTIONS":
      return { ...state, showConnections: !state.showConnections };
    case "TOGGLE_GRID":
      return { ...state, showGrid: !state.showGrid };
    case "TOGGLE_RULERS":
      return { ...state, showRulers: !state.showRulers };
    case "TOGGLE_COMPONENT_IDS":
      return { ...state, showComponentIds: !state.showComponentIds };
    case "TOGGLE_HUD":
      return { ...state, showHUD: !state.showHUD };
    case "TOGGLE_MINIMAP": {
      const next = !state.showMiniMap;
      try { localStorage.setItem("editor_minimap_visible", String(next)); } catch { /* ignore */ }
      return { ...state, showMiniMap: next };
    }
    case "UNDO": {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      const nextState = {
        ...state,
        placements: prev.placements,
        connections: prev.connections,
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future].slice(0, MAX_HISTORY),
        rev: state.rev + 1,
        pendingPin: null,
      };
      // Preserve selection if objects still exist in restored state
      const sel = state.selection;
      nextState.selection = sel.filter(
        (s) =>
          (s.kind === "placement" && prev.placements.some((p) => p.id === s.id)) ||
          (s.kind === "connection" && prev.connections.some((c) => c.id === s.id)),
      );
      return nextState;
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      const nextState = {
        ...state,
        placements: next.placements,
        connections: next.connections,
        past: [...state.past, snapshot(state)],
        future: state.future.slice(1),
        rev: state.rev + 1,
        pendingPin: null,
      };
      // Preserve selection if objects still exist in restored state
      const sel = state.selection;
      nextState.selection = sel.filter(
        (s) =>
          (s.kind === "placement" && next.placements.some((p) => p.id === s.id)) ||
          (s.kind === "connection" && next.connections.some((c) => c.id === s.id)),
      );
      return nextState;
    }
    case "LOAD": {
      const sel = state.selection;
      let selection: Selection = [];
      selection = sel.filter(
        (s) =>
          (s.kind === "placement" && action.doc.placements.some((p) => p.id === s.id)) ||
          (s.kind === "connection" && action.doc.connections.some((c) => c.id === s.id)),
      );
      return {
        ...state,
        placements: action.doc.placements,
        connections: action.doc.connections,
        selection,
        pendingPin: null,
        rev: state.rev + 1,
      };
    }
    case "PENCIL_DRAG_START": {
      // Reject if source pin is already at capacity
      const srcMax = maxConnectionsForPin(action.sourcePlacementId, action.sourcePinName);
      const srcCount = pinOccupancy(state.connections, action.sourcePlacementId, action.sourcePinName);
      if (srcCount >= srcMax) {
        return {
          ...state,
          lastBlockReason: `Pin "${action.sourcePinName}" already has a connection. Maximum allowed: ${srcMax}.`,
        };
      }
      return {
        ...state,
        pencilDrag: {
          sourcePlacementId: action.sourcePlacementId,
          sourcePinName: action.sourcePinName,
          cursorWorld: action.cursorWorld,
          snapTarget: null,
          pathPoints: [action.cursorWorld],
        },
      };
    }
    case "PENCIL_DRAG_MOVE": {
      if (!state.pencilDrag) return state;
      // Append new point only if it moved at least 0.02mm from the last point
      // (prevents accumulating hundreds of near-identical points on slow moves)
      const prev = state.pencilDrag.pathPoints;
      const last = prev[prev.length - 1];
      const dx = action.cursorWorld.x - last.x;
      const dy = action.cursorWorld.y - last.y;
      const moved = Math.sqrt(dx * dx + dy * dy) > 0.02;
      const pathPoints = moved ? [...prev, action.cursorWorld] : prev;
      return {
        ...state,
        pencilDrag: {
          ...state.pencilDrag,
          cursorWorld: action.cursorWorld,
          snapTarget: action.snapTarget,
          pathPoints,
        },
      };
    }
    case "PENCIL_DRAG_END": {
      if (!state.pencilDrag) return state;
      const { sourcePlacementId, sourcePinName } = state.pencilDrag;
      const { targetPlacementId, targetPinName } = action;

      // Self-pin check — same placement and same pin (silent cancel)
      if (sourcePlacementId === targetPlacementId && sourcePinName === targetPinName) {
        return { ...state, pencilDrag: null, lastBlockReason: null };
      }
      // Self-loop check — same placement, different pin (silent cancel)
      if (sourcePlacementId === targetPlacementId) {
        return { ...state, pencilDrag: null, lastBlockReason: null };
      }
      // Duplicate-edge check (both directions)
      const alreadyExists = state.connections.some((c) => {
        const fwd =
          c.from.placementId === sourcePlacementId &&
          c.from.pinName === sourcePinName &&
          c.to.placementId === targetPlacementId &&
          c.to.pinName === targetPinName;
        const rev =
          c.from.placementId === targetPlacementId &&
          c.from.pinName === targetPinName &&
          c.to.placementId === sourcePlacementId &&
          c.to.pinName === sourcePinName;
        return fwd || rev;
      });
      if (alreadyExists) {
        return {
          ...state,
          pencilDrag: null,
          lastBlockReason: `Pin "${sourcePinName}" is already connected to pin "${targetPinName}". Duplicate connections are not allowed.`,
        };
      }
      // Source pin capacity check
      const fromMax = maxConnectionsForPin(sourcePlacementId, sourcePinName);
      const fromCount = pinOccupancy(state.connections, sourcePlacementId, sourcePinName);
      if (fromCount >= fromMax) {
        return {
          ...state,
          pencilDrag: null,
          lastBlockReason: `Pin "${sourcePinName}" already has a connection. Maximum allowed: ${fromMax}.`,
        };
      }
      // Target pin capacity check
      const toMax = maxConnectionsForPin(targetPlacementId, targetPinName);
      const toCount = pinOccupancy(state.connections, targetPlacementId, targetPinName);
      if (toCount >= toMax) {
        return {
          ...state,
          pencilDrag: null,
          lastBlockReason: `Pin "${targetPinName}" already has a connection. Maximum allowed: ${toMax}.`,
        };
      }
      // All checks passed — commit the connection
      const id = `conn_${sourcePlacementId}_${sourcePinName}__${targetPlacementId}_${targetPinName}_${Date.now()}`;

      // Build a freehand SVG path from the collected world-space points.
      // The cachedSvg is embedded in a group with transform:
      //   translate(worldOriginPx, worldOriginPx) scale(sc, -sc)
      // where sc = scale * MM_TO_PX * UM_TO_MM, so our coordinates must be in µm.
      // Append the target pin world position as the final point so the path
      // ends exactly at the target pin.
      const rawPoints = state.pencilDrag.pathPoints;
      // Convert mm → µm (×1000) for the SVG coordinate space
      const toUm = (v: number) => v * 1000;
      let svgPath = "";
      if (rawPoints.length >= 2) {
        // Smooth the path using a Catmull-Rom to cubic Bézier approximation
        // so the freehand stroke looks natural rather than jagged.
        const pts = rawPoints.map(p => ({ x: toUm(p.x), y: toUm(p.y) }));
        svgPath = pointsToSmoothSvgPath(pts);
      } else if (rawPoints.length === 1) {
        const sx = toUm(rawPoints[0].x);
        const sy = toUm(rawPoints[0].y);
        const ex = toUm(state.pencilDrag.cursorWorld.x);
        const ey = toUm(state.pencilDrag.cursorWorld.y);
        svgPath = `<path d="M ${sx} ${sy} L ${ex} ${ey}" stroke="#0284c7" stroke-width="30" fill="none" stroke-linecap="round"/>`;
      }

      const conn: Connection = {
        id,
        from: { placementId: sourcePlacementId, pinName: sourcePinName },
        to: { placementId: targetPlacementId, pinName: targetPinName },
        routeComponentId: "RouteMeander",
        // Store the freehand drawing as locked cached geometry so it renders
        // exactly as drawn without a backend round-trip.
        locked: true,
        cachedSvg: svgPath,
        cachedGeometryHash: `freehand_${id}`,
      };
      return {
        ...state,
        ...bump(state),
        pencilDrag: null,
        lastBlockReason: null,
        connections: [...state.connections, conn],
        selection: [{ kind: "connection", id }],
      };
    }
    case "PENCIL_DRAG_CANCEL":
      return { ...state, pencilDrag: null, lastBlockReason: null };
    default:
      return state;
  }
}

// ---------- Context ----------

interface DesignStoreValue {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  doc: DesignDocument;
  canUndo: boolean;
  canRedo: boolean;
  uniqueName: (prefix: string) => string;
}

const DesignStoreContext = createContext<DesignStoreValue | null>(null);

export function DesignStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);

  // Load persisted design once on mount.
  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const saved = loadDesign();
    if (saved) {
      dispatch({ type: "LOAD", doc: saved });
      // Clear any stale route geometry so connections re-render with the current backend
      dispatch({ type: "CLEAR_ROUTE_CACHE" });
    }
  }, []);

  // Auto-save whenever placements/connections change.
  useEffect(() => {
    if (!loadedRef.current) return;
    saveDesign({ placements: state.placements, connections: state.connections });
  }, [state.rev, state.placements, state.connections]);

  const uniqueName = useCallback(

    (prefix: string) => {
      let n = 0;
      const taken = new Set(state.placements.map((p) => p.name));
      while (taken.has(`${prefix}${n}`)) n++;
      return `${prefix}${n}`;
    },
    [state.placements],
  );

  const value = useMemo<DesignStoreValue>(
    () => ({
      state,
      dispatch,
      doc: { placements: state.placements, connections: state.connections },
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      uniqueName,
    }),
    [state, uniqueName],
  );

  return <DesignStoreContext.Provider value={value}>{children}</DesignStoreContext.Provider>;
}

export function useDesignStore(): DesignStoreValue {
  const ctx = useContext(DesignStoreContext);
  if (!ctx) throw new Error("useDesignStore must be used inside DesignStoreProvider");
  return ctx;
}

export function prefixForCategory(category: string | undefined): string {
  switch (category) {
    case "qubits":
      return "Q";
    case "resonators":
      return "R";
    case "couplers":
      return "C";
    case "routes":
      return "W";
    case "launchpads":
      return "L";
    case "ground":
      return "G";
    case "terminations":
      return "T";
    default:
      return "X";
  }
}