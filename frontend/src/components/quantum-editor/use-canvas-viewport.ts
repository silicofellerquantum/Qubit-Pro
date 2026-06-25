/**
 * useCanvasViewport
 *
 * Encapsulates all viewport state for EditorCanvas:
 *   - Container resize observation → `size`
 *   - Pan drag state
 *   - Coordinate transforms: w2s (world→screen), s2w (screen→world)
 *   - fitToContent / zoomToSelection imperative actions
 *   - Ruler tick lists (hTicks, vTicks)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Placement, Connection } from "@/lib/bridge/types";
import type { EditorState, Selection } from "@/lib/editor/design-store";

// ── Chip dimensions ──────────────────────────────────────────────────────────
// 40×40 mm gives ample room for 100-qubit designs while keeping qubit
// physical sizes identical (qubits are ~0.5–1 mm, unchanged).
export const CHIP_W_MM   = 40.0;
export const CHIP_H_MM   = 40.0;
export const CHIP_HALF_W = CHIP_W_MM / 2;   // ±20 mm
export const CHIP_HALF_H = CHIP_H_MM / 2;   // ±20 mm

export const MM_TO_PX  = 80;   // pixels per mm at scale=1
export const SCALE_MIN = 0.1;  // zoom out to see full chip
export const SCALE_MAX = 10.0; // zoom in for fine detail

// Ruler dimensions (px) — these are the sticky axis bars on the SVG edges
export const RULER_B = 28;  // X-axis ruler height, anchored to bottom
export const RULER_L = 36;  // Y-axis ruler width,  anchored to left

const MAX_VIRTUAL_PAN = 50_000; // px — effectively infinite canvas

type Dispatch = (action: any) => void;

export interface CanvasViewport {
  size: { w: number; h: number };
  containerRef: React.RefObject<HTMLDivElement | null>;
  svgRef: React.RefObject<SVGSVGElement | null>;
  panDrag: { startX: number; startY: number; startPanX: number; startPanY: number } | null;
  setPanDrag: React.Dispatch<React.SetStateAction<CanvasViewport["panDrag"]>>;
  cx: number;
  cy: number;
  scale: number;
  baseScale: number;
  bw: number;
  bh: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  w2s: (x: number, y: number) => { px: number; py: number };
  s2w: (px: number, py: number) => { x: number; y: number };
  fitToContent: () => void;
  zoomToSelection: () => void;
  hTicks: { value: number; px: number; type: "major" | "half" | "minor" }[];
  vTicks: { value: number; py: number; type: "major" | "half" | "minor" }[];
  RULER_B: number;
  RULER_L: number;
}

export function useCanvasViewport(
  state: EditorState,
  dispatch: Dispatch,
): CanvasViewport {
  const svgRef       = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize]       = useState({ w: 800, h: 600 });
  const [panDrag, setPanDrag] = useState<CanvasViewport["panDrag"]>(null);

  // ── Resize observer ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        setSize({ w: el.clientWidth, h: el.clientHeight }),
      );
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  // ── Scale ────────────────────────────────────────────────────────────────
  // baseScale makes the full chip exactly fill the usable canvas area at zoom=1.
  // Usable area = SVG minus the ruler strips.
  const baseScale = useMemo(() => {
    const usableW = size.w - RULER_L;
    const usableH = size.h - RULER_B;
    return Math.max(0.01, Math.min(
      usableW / (CHIP_W_MM * MM_TO_PX),
      usableH / (CHIP_H_MM * MM_TO_PX),
    ));
  }, [size.w, size.h]);

  const scale = baseScale * state.zoom;

  // ── Board pixel dimensions ───────────────────────────────────────────────
  const bw = CHIP_W_MM * MM_TO_PX * scale;
  const bh = CHIP_H_MM * MM_TO_PX * scale;

  // ── Pan clamping — infinite canvas with a soft ±MAX_VIRTUAL_PAN px stop ──
  const usableW = size.w - RULER_L;
  const usableH = size.h - RULER_B;
  const maxPanX = MAX_VIRTUAL_PAN;
  const maxPanY = MAX_VIRTUAL_PAN;
  const clampedPanX = Math.max(-maxPanX, Math.min(maxPanX, state.pan.x));
  const clampedPanY = Math.max(-maxPanY, Math.min(maxPanY, state.pan.y));

  // Center of the board in screen coordinates (origin of world space on screen).
  // The board fills [RULER_L .. RULER_L+usableW] × [0 .. usableH].
  // When pan=0, board center = (RULER_L + usableW/2, usableH/2).
  const cx = RULER_L + usableW / 2 + clampedPanX;
  const cy =           usableH / 2 + clampedPanY;

  const left   = cx - bw / 2;
  const right  = cx + bw / 2;
  const top    = cy - bh / 2;
  const bottom = cy + bh / 2;

  // ── Coordinate transforms ────────────────────────────────────────────────
  const w2s = useCallback(
    (x: number, y: number) => ({
      px: cx + x * MM_TO_PX * scale,
      py: cy - y * MM_TO_PX * scale,
    }),
    [cx, cy, scale],
  );

  const s2w = useCallback(
    (px: number, py: number) => ({
      x:  (px - cx) / (MM_TO_PX * scale),
      y: -(py - cy) / (MM_TO_PX * scale),
    }),
    [cx, cy, scale],
  );

  // ── fitToContent ─────────────────────────────────────────────────────────
  const fitToContent = useCallback(() => {
    if (state.placements.length === 0) {
      dispatch({ type: "ZOOM", zoom: 1 });
      dispatch({ type: "PAN",  x: 0, y: 0 });
      return;
    }
    const xs = state.placements.map((p: Placement) => p.x);
    const ys = state.placements.map((p: Placement) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const padding = 1.5;
    const contentW = (maxX - minX + 2 * padding) * MM_TO_PX;
    const contentH = (maxY - minY + 2 * padding) * MM_TO_PX;
    const newZoom = Math.min(
      (size.w - RULER_L) / contentW,
      (size.h - RULER_B) / contentH,
    ) / baseScale;
    const clampedZoom = Math.max(SCALE_MIN, Math.min(SCALE_MAX, newZoom));
    const k = MM_TO_PX * baseScale * clampedZoom;
    dispatch({ type: "ZOOM", zoom: clampedZoom });
    dispatch({ type: "PAN",  x: -((minX + maxX) / 2) * k, y: ((minY + maxY) / 2) * k });
  }, [state.placements, size.w, size.h, baseScale, dispatch]);

  // ── zoomToSelection ──────────────────────────────────────────────────────
  const zoomToSelection = useCallback(() => {
    const selPlacements = state.selection
      .filter((s: Selection[number]) => s.kind === "placement")
      .map((s: Selection[number]) => state.placements.find((p: Placement) => p.id === s.id))
      .filter(Boolean) as Placement[];
    const selConnections = state.selection
      .filter((s: Selection[number]) => s.kind === "connection")
      .map((s: Selection[number]) => state.connections.find((c: Connection) => c.id === s.id))
      .filter(Boolean) as Connection[];
    if (selPlacements.length === 0 && selConnections.length === 0) {
      fitToContent();
      return;
    }
    const xs: number[] = [], ys: number[] = [];
    selPlacements.forEach((p: Placement) => { xs.push(p.x); ys.push(p.y); });
    selConnections.forEach((c: Connection) => {
      const a = state.placements.find((p: Placement) => p.id === c.from.placementId);
      const b = state.placements.find((p: Placement) => p.id === c.to.placementId);
      if (a) { xs.push(a.x); ys.push(a.y); }
      if (b) { xs.push(b.x); ys.push(b.y); }
    });
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const padding = 1.5;
    const contentW = (maxX - minX + 2 * padding) * MM_TO_PX;
    const contentH = (maxY - minY + 2 * padding) * MM_TO_PX;
    const newZoom = Math.min(
      (size.w - RULER_L) / contentW,
      (size.h - RULER_B) / contentH,
    ) / baseScale;
    const clampedZoom = Math.max(SCALE_MIN, Math.min(SCALE_MAX, newZoom));
    const k = MM_TO_PX * baseScale * clampedZoom;
    dispatch({ type: "ZOOM", zoom: clampedZoom });
    dispatch({ type: "PAN",  x: -((minX + maxX) / 2) * k, y: ((minY + maxY) / 2) * k });
  }, [state.selection, state.placements, state.connections, size.w, size.h, baseScale, dispatch, fitToContent]);

  // ── Adaptive ruler tick generation ───────────────────────────────────────
  // Step size adapts to zoom so we never emit thousands of ticks.
  // Only ticks whose screen-px falls within the visible ruler strip are emitted.
  const hTicks = useMemo(() => {
    const ticks: { value: number; px: number; type: "major" | "half" | "minor" }[] = [];
    const pxPerMm = MM_TO_PX * scale;
    const step      = pxPerMm >= 60 ? 0.5  : pxPerMm >= 20 ? 1  : pxPerMm >= 8 ? 2  : pxPerMm >= 3 ? 5  : 10;
    const majorStep = pxPerMm >= 60 ? 1    : pxPerMm >= 20 ? 5  : pxPerMm >= 8 ? 10 : pxPerMm >= 3 ? 10 : 20;

    // World x range visible between the left ruler and the right edge
    const visLeft  = (RULER_L - cx) / (MM_TO_PX * scale);
    const visRight = (size.w  - cx) / (MM_TO_PX * scale);
    const startV = Math.ceil(visLeft  / step) * step;
    const endV   = Math.floor(visRight / step) * step;

    for (let v = startV; v <= endV + step * 0.001; v = parseFloat((v + step).toFixed(6))) {
      const r = parseFloat(v.toFixed(4));
      const isMajor = Math.abs(r % majorStep) < step * 0.01;
      const isHalf  = !isMajor && Math.abs(r % (majorStep / 2)) < step * 0.01;
      const px = cx + r * MM_TO_PX * scale;
      if (px < RULER_L || px > size.w) continue;
      ticks.push({ value: r, px, type: isMajor ? "major" : isHalf ? "half" : "minor" });
    }
    return ticks;
  }, [cx, scale, size.w]);

  const vTicks = useMemo(() => {
    const ticks: { value: number; py: number; type: "major" | "half" | "minor" }[] = [];
    const pxPerMm = MM_TO_PX * scale;
    const step      = pxPerMm >= 60 ? 0.5  : pxPerMm >= 20 ? 1  : pxPerMm >= 8 ? 2  : pxPerMm >= 3 ? 5  : 10;
    const majorStep = pxPerMm >= 60 ? 1    : pxPerMm >= 20 ? 5  : pxPerMm >= 8 ? 10 : pxPerMm >= 3 ? 10 : 20;

    // World y range visible between top and the bottom ruler
    const visTop    = -(0         - cy) / (MM_TO_PX * scale);
    const visBottom = -(usableH   - cy) / (MM_TO_PX * scale);
    const startV = Math.ceil(Math.min(visTop, visBottom) / step) * step;
    const endV   = Math.floor(Math.max(visTop, visBottom) / step) * step;

    for (let v = startV; v <= endV + step * 0.001; v = parseFloat((v + step).toFixed(6))) {
      const r  = parseFloat(v.toFixed(4));
      const isMajor = Math.abs(r % majorStep) < step * 0.01;
      const isHalf  = !isMajor && Math.abs(r % (majorStep / 2)) < step * 0.01;
      const py = cy - r * MM_TO_PX * scale;
      if (py < 0 || py > usableH) continue;
      ticks.push({ value: r, py, type: isMajor ? "major" : isHalf ? "half" : "minor" });
    }
    return ticks;
  }, [cy, scale, size.h, usableH]);

  return {
    size, containerRef, svgRef,
    panDrag, setPanDrag,
    cx, cy, scale, baseScale,
    bw, bh, left, right, top, bottom,
    w2s, s2w,
    fitToContent, zoomToSelection,
    hTicks, vTicks,
    RULER_B, RULER_L,
  };
}
