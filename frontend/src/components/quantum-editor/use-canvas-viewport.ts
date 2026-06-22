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

export const CHIP_W_MM = 9.0;
export const CHIP_H_MM = 6.0;
export const CHIP_HALF_W = CHIP_W_MM / 2;
export const CHIP_HALF_H = CHIP_H_MM / 2;
export const MM_TO_PX = 80;
export const SCALE_MIN = 0.25;
export const SCALE_MAX = 5.0;
const RULER_B = 28;
const RULER_L = 28;

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

export function useCanvasViewport(state: EditorState, dispatch: Dispatch): CanvasViewport {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [panDrag, setPanDrag] = useState<CanvasViewport["panDrag"]>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  const baseScale = useMemo(
    () => Math.max(0.4, Math.min((size.w - 100) / 720, (size.h - 100) / 480)),
    [size.w, size.h],
  );
  const scale = baseScale * state.zoom;

  const cx = size.w / 2 + state.pan.x;
  const cy = size.h / 2 + state.pan.y;
  const bw = 720 * scale;
  const bh = 480 * scale;
  const left = cx - bw / 2;
  const right = cx + bw / 2;
  const top = cy - bh / 2;
  const bottom = cy + bh / 2;

  const w2s = useCallback(
    (x: number, y: number) => ({
      px: cx + x * MM_TO_PX * scale,
      py: cy - y * MM_TO_PX * scale,
    }),
    [cx, cy, scale],
  );

  const s2w = useCallback(
    (px: number, py: number) => ({
      x: (px - cx) / (MM_TO_PX * scale),
      y: -(py - cy) / (MM_TO_PX * scale),
    }),
    [cx, cy, scale],
  );

  const fitToContent = useCallback(() => {
    if (state.placements.length === 0) {
      dispatch({ type: "ZOOM", zoom: 1 });
      dispatch({ type: "PAN", x: 0, y: 0 });
      return;
    }
    const xs = state.placements.map((p: Placement) => p.x);
    const ys = state.placements.map((p: Placement) => p.y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const padding = 1.0;
    const contentW = (maxX - minX + 2 * padding) * MM_TO_PX;
    const contentH = (maxY - minY + 2 * padding) * MM_TO_PX;
    const newZoom = Math.min((size.w - 100) / contentW, (size.h - 100) / contentH) / baseScale;
    const clampedZoom = Math.max(SCALE_MIN, Math.min(SCALE_MAX, newZoom));
    const k = MM_TO_PX * baseScale * clampedZoom;
    dispatch({ type: "ZOOM", zoom: clampedZoom });
    dispatch({ type: "PAN", x: -((minX + maxX) / 2) * k, y: ((minY + maxY) / 2) * k });
  }, [state.placements, size.w, size.h, baseScale, dispatch]);

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
    const xs: number[] = [],
      ys: number[] = [];
    selPlacements.forEach((p: Placement) => {
      xs.push(p.x);
      ys.push(p.y);
    });
    selConnections.forEach((c: Connection) => {
      const a = state.placements.find((p: Placement) => p.id === c.from.placementId);
      const b = state.placements.find((p: Placement) => p.id === c.to.placementId);
      if (a) {
        xs.push(a.x);
        ys.push(a.y);
      }
      if (b) {
        xs.push(b.x);
        ys.push(b.y);
      }
    });
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const padding = 1.0;
    const contentW = (maxX - minX + 2 * padding) * MM_TO_PX;
    const contentH = (maxY - minY + 2 * padding) * MM_TO_PX;
    const newZoom = Math.min((size.w - 100) / contentW, (size.h - 100) / contentH) / baseScale;
    const clampedZoom = Math.max(SCALE_MIN, Math.min(SCALE_MAX, newZoom));
    const k = MM_TO_PX * baseScale * clampedZoom;
    dispatch({ type: "ZOOM", zoom: clampedZoom });
    dispatch({ type: "PAN", x: -((minX + maxX) / 2) * k, y: ((minY + maxY) / 2) * k });
  }, [
    state.selection,
    state.placements,
    state.connections,
    size.w,
    size.h,
    baseScale,
    dispatch,
    fitToContent,
  ]);

  const hTicks = useMemo(() => {
    const ticks: { value: number; px: number; type: "major" | "half" | "minor" }[] = [];
    for (let v = -CHIP_HALF_W; v <= CHIP_HALF_W; v = parseFloat((v + 0.1).toFixed(1))) {
      const isMajor = Math.abs(v % 1.0) < 0.01;
      const isHalf = Math.abs(v % 0.5) < 0.01;
      ticks.push({
        value: v,
        px: cx + v * MM_TO_PX * scale,
        type: isMajor ? "major" : isHalf ? "half" : "minor",
      });
    }
    return ticks;
  }, [cx, scale]);

  const vTicks = useMemo(() => {
    const ticks: { value: number; py: number; type: "major" | "half" | "minor" }[] = [];
    for (let v = -CHIP_HALF_H; v <= CHIP_HALF_H; v = parseFloat((v + 0.1).toFixed(1))) {
      const isMajor = Math.abs(v % 1.0) < 0.01;
      const isHalf = Math.abs(v % 0.5) < 0.01;
      ticks.push({
        value: v,
        py: cy - v * MM_TO_PX * scale,
        type: isMajor ? "major" : isHalf ? "half" : "minor",
      });
    }
    return ticks;
  }, [cy, scale]);

  return {
    size,
    containerRef,
    svgRef,
    panDrag,
    setPanDrag,
    cx,
    cy,
    scale,
    baseScale,
    bw,
    bh,
    left,
    right,
    top,
    bottom,
    w2s,
    s2w,
    fitToContent,
    zoomToSelection,
    hTicks,
    vTicks,
    RULER_B,
    RULER_L,
  };
}
