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
} from "@/lib/bridge/types";
import { loadDesign, saveDesign, clearDesign } from "./persistence";

export { clearDesign };

const CHIP_W_MM = 9.0;
const CHIP_H_MM = 6.0;
const CHIP_HALF_W = CHIP_W_MM / 2;
const CHIP_HALF_H = CHIP_H_MM / 2;


// ---------- State ----------

export type Tool = "select" | "pan" | "route";

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
}

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
  | { type: "AUTO_ALIGN"; layout?: AlignLayout };

export type AlignLayout =
  | "grid"        // balanced rows × cols (default)
  | "horizontal"  // single row
  | "vertical"    // single column
  | "rhombus"     // diamond / rhombus pattern
  | "u-shape"     // three sides of a rectangle (U)
  | "circle"      // qubits on a circle
  | "h-shape";    // two parallel rows with gap in between (H / IBM heavy-hex style)

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
        // Clear any stale validation error — moving a component is a geometry
        // operation only and must never replay a previous connection block.
        lastBlockReason: null,
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
    case "AUTO_ALIGN": {
      // ── Multi-layout Qubit Auto-Align ───────────────────────────────────
      // Supported layouts: grid | horizontal | vertical | rhombus |
      //                    u-shape | circle | h-shape
      //
      // Resonator-clearance guarantee: pitch ≥ pocket(1mm) + 2×clearance(1.5mm)
      // = 4mm so each qubit has a 1.5mm exclusive zone for its meander route.
      // ────────────────────────────────────────────────────────────────────
      const QUBIT_RE  = /transmon|qubit|JJ_Dolan|JJ_Manhattan|SNAIL|SQUID|star_qubit/i;
      const POCKET_MM = 1.0;
      const CLEARANCE = 1.5;
      const MIN_PITCH = 2.5;
      const PITCH     = Math.max(MIN_PITCH, POCKET_MM + 2 * CLEARANCE); // 4.0 mm

      const qubits = state.placements.filter(
        (p) => !p.locked && QUBIT_RE.test(p.componentId),
      );
      if (qubits.length === 0) return state;

      const N      = qubits.length;
      const layout = action.layout ?? "grid";

      // Cluster centroid — keep layout on-screen
      const cx = qubits.reduce((s, p) => s + p.x, 0) / N;
      const cy = qubits.reduce((s, p) => s + p.y, 0) / N;

      // Sort qubits by (y, x) to preserve reading order
      const sorted = [...qubits].sort((a, b) =>
        a.y !== b.y ? a.y - b.y : a.x - b.x,
      );

      let slots: Array<{ x: number; y: number }> = [];

      // ── GRID (balanced rows × cols) ──────────────────────────────────
      if (layout === "grid") {
        const cols = Math.ceil(Math.sqrt(N));
        const rows = Math.ceil(N / cols);
        const ox = cx - ((cols - 1) * PITCH) / 2;
        const oy = cy - ((rows - 1) * PITCH) / 2;
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols && slots.length < N; c++)
            slots.push({ x: ox + c * PITCH, y: oy + r * PITCH });
      }
      // ── HORIZONTAL (single row) ──────────────────────────────────────
      else if (layout === "horizontal") {
        const ox = cx - ((N - 1) * PITCH) / 2;
        for (let i = 0; i < N; i++)
          slots.push({ x: ox + i * PITCH, y: cy });
      }
      // ── VERTICAL (single column) ─────────────────────────────────────
      else if (layout === "vertical") {
        const oy = cy - ((N - 1) * PITCH) / 2;
        for (let i = 0; i < N; i++)
          slots.push({ x: cx, y: oy + i * PITCH });
      }
      // ── RHOMBUS / DIAMOND ────────────────────────────────────────────
      else if (layout === "rhombus") {
        const D = PITCH;
        const V = PITCH * Math.sin(Math.PI / 4);
        const k = Math.ceil(Math.sqrt(N));
        const rowSizes: number[] = [];
        for (let i = 1; i <= k; i++) rowSizes.push(i);
        for (let i = k - 1; i >= 1; i--) rowSizes.push(i);
        let filled = 0;
        for (let ri = 0; ri < rowSizes.length && filled < N; ri++) {
          const w    = rowSizes[ri];
          const rowY = cy + (ri - (rowSizes.length - 1) / 2) * V;
          for (let ci = 0; ci < w && filled < N; ci++) {
            const rowX = cx + (ci - (w - 1) / 2) * D;
            slots.push({ x: rowX, y: rowY });
            filled++;
          }
        }
      }
      // ── U-SHAPE ──────────────────────────────────────────────────────
      else if (layout === "u-shape") {
        const side   = Math.max(2, Math.ceil(N / 3));
        const topW   = N - 2 * (side - 1);
        const totalH = (side - 1) * PITCH;
        const totalW = Math.max(topW - 1, 1) * PITCH;
        const ox     = cx - totalW / 2;
        const oy     = cy - totalH / 2;
        for (let i = side - 1; i >= 0 && slots.length < N; i--)
          slots.push({ x: ox, y: oy + i * PITCH });
        for (let i = 1; i < topW - 1 && slots.length < N; i++)
          slots.push({ x: ox + i * PITCH, y: oy });
        for (let i = 0; i < side && slots.length < N; i++)
          slots.push({ x: ox + (topW - 1) * PITCH, y: oy + i * PITCH });
      }
      // ── CIRCLE ───────────────────────────────────────────────────────
      else if (layout === "circle") {
        const minR = N > 1 ? PITCH / (2 * Math.sin(Math.PI / N)) : 0;
        const R    = Math.max(minR, PITCH);
        for (let i = 0; i < N; i++) {
          const angle = (2 * Math.PI * i) / N - Math.PI / 2;
          slots.push({ x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) });
        }
      }
      // ── H-SHAPE (two staggered rows, IBM heavy-hex style) ────────────
      else if (layout === "h-shape") {
        const topN   = Math.ceil(N / 2);
        const botN   = N - topN;
        const rowY   = PITCH / 2;
        const stagger = PITCH / 2;
        const topOx  = cx - ((topN - 1) * PITCH) / 2;
        for (let i = 0; i < topN; i++)
          slots.push({ x: topOx + i * PITCH, y: cy - rowY });
        const botOx = cx - ((botN - 1) * PITCH) / 2 + stagger;
        for (let i = 0; i < botN; i++)
          slots.push({ x: botOx + i * PITCH, y: cy + rowY });
      }

      // Apply new positions
      const movedIds = new Set(sorted.map((q) => q.id));
      return {
        ...state,
        ...bump(state),
        placements: state.placements.map((p) => {
          if (!movedIds.has(p.id)) return p;
          const idx = sorted.findIndex((q) => q.id === p.id);
          return { ...p, x: slots[idx].x, y: slots[idx].y };
        }),
        connections: state.connections.map((c) => ({
          ...c,
          cachedGeometryHash: undefined,
        })),
      };
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