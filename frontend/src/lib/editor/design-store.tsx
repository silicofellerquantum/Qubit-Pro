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
  Feedline,
  FeedlineAttachment,
  Placement,
} from "@/lib/bridge/types";
import { loadDesign, saveDesign, clearDesign } from "./persistence";
import { buildInitialRouteOverrides } from "./route-defaults";

export { clearDesign };

// Default chip dimensions — overridden at runtime by SET_CHIP_SIZE
export const DEFAULT_CHIP_W_MM = 40.0;
export const DEFAULT_CHIP_H_MM = 40.0;

// Preset chip sizes offered in the toolbar dropdown
export const CHIP_SIZE_PRESETS = [
  { label: "5 × 5 mm", w: 5, h: 5 },
  { label: "10 × 10 mm", w: 10, h: 10 },
  { label: "20 × 20 mm", w: 20, h: 20 },
  { label: "40 × 40 mm", w: 40, h: 40 },
] as const;


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
  /** Native feedline objects — each expands to LaunchPad→RouteStraight→LaunchPad on export */
  feedlines: Feedline[];
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
  /** Chip physical dimensions in mm — changed by SET_CHIP_SIZE */
  chipW: number;
  chipH: number;
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
 * One connection per pin — this matches Qiskit Metal's physical constraint.
 * Use a CoupledLineTee inserted on the feedline to tap a resonator mid-line.
 */
export function maxConnectionsForPin(
  _placementId: string,
  _pinName: string,
  _placements?: Array<{ id: string; componentId: string }>,
): number {
  return DEFAULT_MAX_CONNECTIONS_PER_PIN; // always 1
}

interface Snapshot {
  placements: Placement[];
  connections: Connection[];
  feedlines: Feedline[];
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
  | { type: "AUTO_ALIGN"; layout?: AlignLayout }
  | { type: "SET_CHIP_SIZE"; w: number; h: number }
  | { type: "PLACE_N_QUBITS"; n: number; componentId?: string }
  // ── Feedline actions ─────────────────────────────────────────────────────
  | { type: "ADD_FEEDLINE"; feedline: Feedline }
  | { type: "UPDATE_FEEDLINE"; id: string; patch: Partial<Feedline> }
  | { type: "DELETE_FEEDLINE"; id: string }
  | { type: "MOVE_FEEDLINE_START"; id: string; x1: number; y1: number }
  | { type: "MOVE_FEEDLINE_END"; id: string; x2: number; y2: number }
  | { type: "MOVE_FEEDLINE"; id: string; dx: number; dy: number }
  | { type: "ATTACH_RESONATOR_TO_FEEDLINE"; feedlineId: string; attachment: FeedlineAttachment }
  | { type: "DETACH_RESONATOR_FROM_FEEDLINE"; feedlineId: string; resonatorId: string }
  /**
   * Place a complete feedline preset: two LaunchpadWirebond placements wired
   * by a RouteStraight — all created atomically in one undo step.
   * This produces real editor placements identical to manually placing T0 + L1
   * and connecting them, exactly matching the image reference.
   */
  | {
    type: "ADD_FEEDLINE_PRESET";
    lpA: Placement;          // LaunchpadWirebond start (left)
    lpB: Placement;          // LaunchpadWirebond end (right)
    connection: Connection;  // RouteStraight between them
  }
  /** Add a single connection directly — used for tee insertion on feedlines */
  | { type: "ADD_CONNECTION"; connection: Connection };

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
    feedlines: s.feedlines.map((f) => ({
      ...f,
      attachedResonators: [...f.attachedResonators],
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
  feedlines: [],
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
  chipW: DEFAULT_CHIP_W_MM,
  chipH: DEFAULT_CHIP_H_MM,
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
      const halfW = state.chipW / 2;
      const halfH = state.chipH / 2;
      const copy: Placement = {
        ...src,
        id: copyId,
        name: copyName,
        x: Math.max(-halfW, Math.min(halfW, src.x + 0.2)),
        y: Math.max(-halfH, Math.min(halfH, src.y - 0.2)),
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
      const halfW = state.chipW / 2;
      const halfH = state.chipH / 2;
      const pasted: Placement[] = action.placements.map((p) => ({
        ...p,
        id: `pl_${p.componentId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: `${p.name}_copy`,
        x: Math.max(-halfW, Math.min(halfW, p.x + offset)),
        y: Math.max(-halfH, Math.min(halfH, p.y - offset)),
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

      // ── Feedline tee healing ─────────────────────────────────────────────
      // When a CoupledLineTee / LineTee is deleted that is wired inline on a
      // feedline (prime_start ← RouteStraight and prime_end → RouteStraight),
      // automatically reconnect the two outer endpoints with a new RouteStraight
      // so the feedline body is not broken.
      const _TEE_IDS = new Set(["CoupledLineTee", "LineTee", "CapNInterdigitalTee"]);
      let healedConnections = state.connections.filter(
        (c) => c.from.placementId !== action.id && c.to.placementId !== action.id,
      );

      if (target && _TEE_IDS.has(target.componentId)) {
        // Find the segment arriving at Tee.prime_start
        const segIn = state.connections.find(
          (c) => c.to.placementId === action.id && c.to.pinName === "prime_start",
        );
        // Find the segment leaving from Tee.prime_end
        const segOut = state.connections.find(
          (c) => c.from.placementId === action.id && c.from.pinName === "prime_end",
        );

        if (segIn && segOut) {
          // Reconnect outer endpoints: segIn.from → segOut.to
          const healId = `conn_fl_heal_${Date.now()}`;
          const healed: Connection = {
            id: healId,
            from: { placementId: segIn.from.placementId, pinName: segIn.from.pinName },
            to: { placementId: segOut.to.placementId, pinName: segOut.to.pinName },
            routeComponentId: "RouteStraight",
            routeOverrides: { trace_width: "10um", trace_gap: "6um" },
          };
          healedConnections = [...healedConnections, healed];
        }
      }

      return {
        ...state,
        ...bump(state),
        placements: state.placements.filter((p) => p.id !== action.id),
        connections: healedConnections,
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
      const fromMax = maxConnectionsForPin(state.pendingPin.placementId, state.pendingPin.pinName, state.placements);
      const fromCount = pinOccupancy(state.connections, state.pendingPin.placementId, state.pendingPin.pinName);
      if (fromCount >= fromMax) {
        return {
          ...state,
          pendingPin: null,
          lastBlockReason: `Pin "${state.pendingPin.pinName}" already has a connection. Maximum allowed: ${fromMax}.`,
        };
      }
      // Check the "to" pin (the second pin the user clicked)
      const toMax = maxConnectionsForPin(action.placementId, action.pinName, state.placements);
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
        // Pre-populate route override fields with Qiskit Metal defaults so the
        // inspector shows real values immediately rather than blank placeholders.
        routeOverrides: buildInitialRouteOverrides(action.defaultRouteComponentId),
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
      const QUBIT_RE = /transmon|qubit|JJ_Dolan|JJ_Manhattan|SNAIL|SQUID|star_qubit/i;
      const POCKET_MM = 1.0;
      const CLEARANCE = 1.5;
      const MIN_PITCH = 2.5;
      const PITCH = Math.max(MIN_PITCH, POCKET_MM + 2 * CLEARANCE); // 4.0 mm

      const qubits = state.placements.filter(
        (p) => !p.locked && QUBIT_RE.test(p.componentId),
      );
      if (qubits.length === 0) return state;

      const N = qubits.length;
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
          const w = rowSizes[ri];
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
        const side = Math.max(2, Math.ceil(N / 3));
        const topW = N - 2 * (side - 1);
        const totalH = (side - 1) * PITCH;
        const totalW = Math.max(topW - 1, 1) * PITCH;
        const ox = cx - totalW / 2;
        const oy = cy - totalH / 2;
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
        const R = Math.max(minR, PITCH);
        for (let i = 0; i < N; i++) {
          const angle = (2 * Math.PI * i) / N - Math.PI / 2;
          slots.push({ x: cx + R * Math.cos(angle), y: cy + R * Math.sin(angle) });
        }
      }
      // ── H-SHAPE (two staggered rows, IBM heavy-hex style) ────────────
      else if (layout === "h-shape") {
        const topN = Math.ceil(N / 2);
        const botN = N - topN;
        const rowY = PITCH / 2;
        const stagger = PITCH / 2;
        const topOx = cx - ((topN - 1) * PITCH) / 2;
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
        feedlines: prev.feedlines,
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future].slice(0, MAX_HISTORY),
        rev: state.rev + 1,
        pendingPin: null,
      };
      // Preserve selection if objects still exist in restored state
      const sel = state.selection;
      nextState.selection = sel.filter(
        (s) =>
          (s.kind === "placement" && (prev.placements.some((p) => p.id === s.id) || prev.feedlines.some((f) => f.id === s.id))) ||
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
        feedlines: next.feedlines,
        past: [...state.past, snapshot(state)],
        future: state.future.slice(1),
        rev: state.rev + 1,
        pendingPin: null,
      };
      // Preserve selection if objects still exist in restored state
      const sel = state.selection;
      nextState.selection = sel.filter(
        (s) =>
          (s.kind === "placement" && (next.placements.some((p) => p.id === s.id) || next.feedlines.some((f) => f.id === s.id))) ||
          (s.kind === "connection" && next.connections.some((c) => c.id === s.id)),
      );
      return nextState;
    }
    case "SET_CHIP_SIZE": {
      const newW = Math.max(1, action.w);
      const newH = Math.max(1, action.h);
      const halfW = newW / 2;
      const halfH = newH / 2;
      // Re-clamp all existing placements to the new boundary
      const clampedPlacements = state.placements.map((p) => ({
        ...p,
        x: Math.max(-halfW, Math.min(halfW, p.x)),
        y: Math.max(-halfH, Math.min(halfH, p.y)),
      }));
      return {
        ...state,
        ...bump(state),
        chipW: newW,
        chipH: newH,
        placements: clampedPlacements,
        // Re-layout unlocked qubits to respect new boundary
      };
    }
    case "PLACE_N_QUBITS": {
      const N = Math.max(0, Math.min(200, Math.round(action.n)));
      if (N === 0) return state;
      const DEFAULT_QUBIT_COMPONENT = action.componentId ?? "TransmonPocket";
      const QUBIT_RE = /transmon|qubit|JJ_Dolan|JJ_Manhattan|SNAIL|SQUID|star_qubit/i;

      // Remove all existing unlocked qubit placements
      const nonQubits = state.placements.filter(
        (p) => !QUBIT_RE.test(p.componentId) || p.locked,
      );

      // Compute grid layout that fits within the current chip bounds
      const chipHalfW = state.chipW / 2;
      const chipHalfH = state.chipH / 2;
      const POCKET_MM = 0.5;
      const CLEARANCE = 0.6;
      const MIN_PITCH = 1.2;
      // Scale pitch so all N qubits fit within the chip
      const cols = Math.ceil(Math.sqrt(N));
      const rows = Math.ceil(N / cols);
      const maxPitchByW = cols > 1 ? (state.chipW * 0.85) / (cols - 1) : state.chipW;
      const maxPitchByH = rows > 1 ? (state.chipH * 0.85) / (rows - 1) : state.chipH;
      const PITCH = Math.max(MIN_PITCH, Math.min(
        maxPitchByW,
        maxPitchByH,
        POCKET_MM + 2 * CLEARANCE,
      ));

      const gridW = (cols - 1) * PITCH;
      const gridH = (rows - 1) * PITCH;
      const ox = -gridW / 2;
      const oy = -gridH / 2;

      const newPlacements: Placement[] = [];
      const takenNames = new Set([...nonQubits.map((p) => p.name)]);

      let placed = 0;
      for (let r = 0; r < rows && placed < N; r++) {
        for (let c = 0; c < cols && placed < N; c++) {
          const x = parseFloat((ox + c * PITCH).toFixed(3));
          const y = parseFloat((oy + r * PITCH).toFixed(3));
          // Clamp to chip bounds
          const cx = Math.max(-chipHalfW, Math.min(chipHalfW, x));
          const cy = Math.max(-chipHalfH, Math.min(chipHalfH, y));

          let nameIdx = placed;
          let name = `Q${nameIdx}`;
          while (takenNames.has(name)) { nameIdx++; name = `Q${nameIdx}`; }
          takenNames.add(name);

          newPlacements.push({
            id: `pl_${DEFAULT_QUBIT_COMPONENT}_${Date.now()}_${placed}`,
            componentId: DEFAULT_QUBIT_COMPONENT,
            name,
            x: cx,
            y: cy,
            rotation: 0,
            params: { pad_gap: "30um", pad_width: "455um", pad_height: "90um" },
          });
          placed++;
        }
      }

      return {
        ...state,
        ...bump(state),
        placements: [...nonQubits, ...newPlacements],
        connections: state.connections.filter((c) =>
          [...nonQubits].some((p) => p.id === c.from.placementId) &&
          [...nonQubits].some((p) => p.id === c.to.placementId),
        ),
        selection: newPlacements.map((p) => ({ kind: "placement" as const, id: p.id })),
      };
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
        feedlines: action.doc.feedlines ?? [],
        selection,
        pendingPin: null,
        rev: state.rev + 1,
      };
    }
    // ── Feedline actions ─────────────────────────────────────────────────────
    case "ADD_FEEDLINE": {
      const fl = action.feedline;
      // Compute totalLength from geometry
      const dx = fl.x2 - fl.x1;
      const dy = fl.y2 - fl.y1;
      const totalLength = Math.sqrt(dx * dx + dy * dy);
      return {
        ...state,
        ...bump(state),
        feedlines: [...state.feedlines, { ...fl, totalLength }],
        selection: [{ kind: "placement", id: fl.id }],
      };
    }
    case "UPDATE_FEEDLINE": {
      return {
        ...state,
        ...bump(state),
        feedlines: state.feedlines.map((f) => {
          if (f.id !== action.id) return f;
          const patched = { ...f, ...action.patch };
          const dx = patched.x2 - patched.x1;
          const dy = patched.y2 - patched.y1;
          patched.totalLength = Math.sqrt(dx * dx + dy * dy);
          return patched;
        }),
      };
    }
    case "DELETE_FEEDLINE":
      return {
        ...state,
        ...bump(state),
        feedlines: state.feedlines.filter((f) => f.id !== action.id),
        selection: state.selection.filter(
          (s) => !(s.kind === "placement" && s.id === action.id),
        ),
      };
    case "MOVE_FEEDLINE_START": {
      return {
        ...state,
        feedlines: state.feedlines.map((f) => {
          if (f.id !== action.id) return f;
          const dx = f.x2 - action.x1;
          const dy = f.y2 - action.y1;
          return { ...f, x1: action.x1, y1: action.y1, totalLength: Math.sqrt(dx * dx + dy * dy) };
        }),
      };
    }
    case "MOVE_FEEDLINE_END": {
      return {
        ...state,
        feedlines: state.feedlines.map((f) => {
          if (f.id !== action.id) return f;
          const dx = action.x2 - f.x1;
          const dy = action.y2 - f.y1;
          return { ...f, x2: action.x2, y2: action.y2, totalLength: Math.sqrt(dx * dx + dy * dy) };
        }),
      };
    }
    case "MOVE_FEEDLINE": {
      return {
        ...state,
        feedlines: state.feedlines.map((f) => {
          if (f.id !== action.id) return f;
          return {
            ...f,
            x1: f.x1 + action.dx,
            y1: f.y1 + action.dy,
            x2: f.x2 + action.dx,
            y2: f.y2 + action.dy,
          };
        }),
      };
    }
    case "ATTACH_RESONATOR_TO_FEEDLINE":
      return {
        ...state,
        ...bump(state),
        feedlines: state.feedlines.map((f) =>
          f.id !== action.feedlineId
            ? f
            : {
              ...f,
              attachedResonators: [
                ...f.attachedResonators.filter(
                  (a) => a.resonatorId !== action.attachment.resonatorId,
                ),
                action.attachment,
              ],
            },
        ),
      };
    case "DETACH_RESONATOR_FROM_FEEDLINE":
      return {
        ...state,
        ...bump(state),
        feedlines: state.feedlines.map((f) =>
          f.id !== action.feedlineId
            ? f
            : {
              ...f,
              attachedResonators: f.attachedResonators.filter(
                (a) => a.resonatorId !== action.resonatorId,
              ),
            },
        ),
      };
    // ── Feedline preset: creates real LP + Route + LP placements atomically ─
    case "ADD_FEEDLINE_PRESET":
      return {
        ...state,
        ...bump(state),
        placements: [...state.placements, action.lpA, action.lpB],
        connections: [...state.connections, action.connection],
        selection: [
          { kind: "placement" as const, id: action.lpA.id },
          { kind: "placement" as const, id: action.lpB.id },
        ],
      };
    // ── Add a single connection directly ─────────────────────────────────────
    case "ADD_CONNECTION":
      return {
        ...state,
        ...bump(state),
        connections: [...state.connections, action.connection],
        selection: [{ kind: "connection" as const, id: action.connection.id }],
      };
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
      doc: { placements: state.placements, connections: state.connections, feedlines: state.feedlines },
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
    case "feedlines":
      return "FL";
    default:
      return "X";
  }
}