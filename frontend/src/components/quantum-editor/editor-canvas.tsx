import {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Minus, Hand, MousePointer2 } from "lucide-react";
import { prefixForCategory, type EditorState, type Selection, isSelected, getSingleSelection } from "@/lib/editor/design-store";
import { useWorkspace } from "@/lib/editor/workspace-store";
import {
  componentPinsQueryOptions,
  componentPreviewQueryOptions,
  componentsQueryOptions,
  componentMetadataQueryOptions,
} from "@/lib/bridge/queries";
import { defaultParamsFromMetadata } from "@/lib/bridge/adapters";
import { bridgeClient } from "@/lib/bridge/client";
import type {
  ComponentSummary,
  PinSpec,
  Placement,
  Connection,
  RenderResult,
  ComponentMetadata,
} from "@/lib/bridge/types";
import { cn } from "@/lib/utils";
import { QISKIT_CATALOG } from "./qiskit-metal-catalog";

export const CHIP_W_MM = 9.0;
export const CHIP_H_MM = 6.0;
export const CHIP_HALF_W = CHIP_W_MM / 2;
export const CHIP_HALF_H = CHIP_H_MM / 2;
const MM_TO_PX = 80;
const UM_TO_MM = 0.001;
const RULER_L = 28;
const RULER_B = 28;
const SCALE_MIN = 0.25;
const SCALE_MAX = 5.0;
const SCALE_STEP = 0.1;
const UI_SCALE_KEY = "_uiScale";

export interface EditorCanvasHandle {
  fitToContent: () => void;
  zoomToSelection: () => void;
  cancelDrag: () => void;
  getSvgElement: () => SVGSVGElement | null;
}

type DragState = { mode: "move"; id: string; offsetX: number; offsetY: number } | null;

function getUiScale(p: Placement): number {
  const v = p.params[UI_SCALE_KEY];
  return typeof v === "number" && v > 0 ? v : 1;
}

export const EditorCanvas = forwardRef<EditorCanvasHandle, object>(function EditorCanvas(_p, ref) {
  const { activeTab, dispatchActive } = useWorkspace();
  const state = activeTab.state;
  const dispatch = dispatchActive;
  const doc = { placements: state.placements, connections: state.connections };
  const qc = useQueryClient();
  const uniqueName = useCallback(
    (prefix: string) => {
      let n = 0;
      const taken = new Set(state.placements.map((p) => p.name));
      while (taken.has(`${prefix}${n}`)) n++;
      return `${prefix}${n}`;
    },
    [state.placements],
  );

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [drag, setDrag] = useState<DragState>(null);
  const [dragStartPos, setDragStartPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const [panDrag, setPanDrag] = useState<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
  const [dropPrev, setDropPrev] = useState<{ componentId: string; x: number; y: number } | null>(
    null,
  );
  const [hovered, setHovered] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: { label: string; action: () => void; disabled?: boolean; destructive?: boolean }[];
  } | null>(null);

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

  // Close context menu on any click outside
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("pointerdown", close, { once: true });
    return () => window.removeEventListener("pointerdown", close);
  }, [contextMenu]);

  const compsQ = useQuery(componentsQueryOptions());
  const compsById = useMemo(() => {
    const m = new Map<string, ComponentSummary>();
    QISKIT_CATALOG.forEach((c) =>
      m.set(c.className, {
        id: c.className,
        name: c.label,
        module: c.modulePath,
        category: (c.category === "tlines"
          ? "routes"
          : c.category === "lumped"
            ? "other"
            : c.category === "sample shapes"
              ? "other"
              : c.category) as any,
        description: c.description,
      }),
    );
    (compsQ.data ?? []).forEach((c) => m.set(c.id, c));
    return m;
  }, [compsQ.data]);

  // Per-route incremental rendering: only fetch routes whose hash has changed
  const docRef = useRef(doc);
  docRef.current = doc;

  const routeHashes = useMemo(() => {
    const m = new Map<string, string>();
    state.connections.forEach((c) => {
      const fromP = state.placements.find((p) => p.id === c.from.placementId);
      const toP = state.placements.find((p) => p.id === c.to.placementId);
      if (!fromP || !toP) { m.set(c.id, "none"); return; }
      m.set(c.id, `${fromP.x.toFixed(6)},${fromP.y.toFixed(6)}:${c.from.pinName}:${toP.x.toFixed(6)},${toP.y.toFixed(6)}:${c.to.pinName}:${JSON.stringify(c.routeOverrides ?? {})}`);
    });
    return m;
  }, [state.connections, state.placements]);

  const needsRouteRender = useMemo(() => {
    const m = new Map<string, boolean>();
    state.connections.forEach((c) => {
      const hash = routeHashes.get(c.id) ?? "none";
      if (c.locked && c.cachedSvg) { m.set(c.id, false); return; }
      m.set(c.id, c.cachedGeometryHash !== hash);
    });
    return m;
  }, [state.connections, routeHashes]);

  const routeQueries = useQueries({
    queries: state.connections.map((c) => ({
      queryKey: ["bridge", "render-route", c.id, routeHashes.get(c.id)] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        bridgeClient.renderRoute(docRef.current, c.id, signal).then((r) => {
          if (!r.data) throw new Error(r.error || "Route render failed");
          return r.data;
        }),
      enabled: doc.placements.length > 0 && !!c.routeComponentId && needsRouteRender.get(c.id) === true && !drag,
      staleTime: 0,
      placeholderData: (prev: any) => prev,
    })),
  });

  const routeQueriesById = useMemo(() => {
    const m = new Map<string, typeof routeQueries[number]>();
    state.connections.forEach((c, i) => {
      m.set(c.id, routeQueries[i]);
    });
    return m;
  }, [state.connections, routeQueries]);

  const routeSvg = useMemo(() => {
    const m = new Map<string, string>();
    state.connections.forEach((c) => {
      const needsRender = needsRouteRender.get(c.id) ?? false;
      if (!needsRender && c.cachedSvg) {
        m.set(c.id, c.cachedSvg);
      }
      const q = routeQueriesById.get(c.id);
      if (q?.data?.svg) {
        m.set(c.id, q.data.svg);
      }
    });
    return m;
  }, [state.connections, routeQueriesById, needsRouteRender]);

  // Auto-cache route geometry from per-route query results
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    state.connections.forEach((c) => {
      const q = routeQueriesById.get(c.id);
      if (q?.data?.svg) {
        const expectedHash = routeHashes.get(c.id) ?? "none";
        if (c.cachedGeometryHash !== expectedHash) {
          dispatch({ type: "SET_CONNECTION_GEOMETRY", id: c.id, svg: q.data.svg, hash: expectedHash });
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeQueriesById]);

  const pinQueries = useQueries({
    queries: state.placements.map((p) => componentPinsQueryOptions(p.componentId, p.params)),
  });

  // Base auto-fit scale (chip fills viewport); user zoom multiplies on top
  const baseScale = useMemo(() => {
    return Math.max(0.4, Math.min((size.w - 100) / 720, (size.h - 100) / 480));
  }, [size.w, size.h]);

  const scale = baseScale * state.zoom;

  // Map placementId -> pins for quick lookup
  const pinMap = useMemo(() => {
    const m = new Map<string, PinSpec[]>();
    state.placements.forEach((p, i) => {
      m.set(p.id, pinQueries[i]?.data?.pins ?? []);
    });
    return m;
  }, [state.placements, pinQueries]);

  const pinWorldPos = (placement: Placement, pinName: string): { x: number; y: number } | null => {
    const pins = pinMap.get(placement.id) ?? [];
    const pin = pins.find((p) => p.name === pinName);
    if (!pin) return null;
    const mx = placement.mirrorX ? -1 : 1;
    const dx = pin.hint.x * UM_TO_MM * mx;
    const dy = pin.hint.y * UM_TO_MM;
    const rad = (placement.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: placement.x + (dx * cos - dy * sin),
      y: placement.y + (dx * sin + dy * cos),
    };
  };

  // Simple overlap detection: placements within 0.4mm center-to-center
  const overlappingIds = useMemo(() => {
    const ids = new Set<string>();
    const threshold = 0.4; // mm
    for (let i = 0; i < state.placements.length; i++) {
      for (let j = i + 1; j < state.placements.length; j++) {
        const a = state.placements[i];
        const b = state.placements[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        if (Math.sqrt(dx * dx + dy * dy) < threshold) {
          ids.add(a.id);
          ids.add(b.id);
        }
      }
    }
    return ids;
  }, [state.placements]);

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

  // Canvas-specific keyboard handling removed to schematic-editor to prevent duplicates

  const onPDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // Middle mouse or Pan tool starts viewport pan
    if (e.button === 1 || state.tool === "pan") {
      e.preventDefault();
      setPanDrag({ startX: e.clientX, startY: e.clientY, startPanX: state.pan.x, startPanY: state.pan.y });
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      return;
    }
    const t = e.target as Element;
    if (t === e.currentTarget || t.getAttribute("data-canvas-bg") === "true") {
      if (state.pendingPin) {
        dispatch({ type: "CANCEL_PIN" });
      } else {
        dispatch({ type: "SELECT", selection: [] });
      }
    }
  };

  const onPMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      const w = s2w(e.clientX - rect.left, e.clientY - rect.top);
      setCursorPos({ x: w.x, y: w.y });
    }
    if (panDrag) {
      const dx = e.clientX - panDrag.startX;
      const dy = e.clientY - panDrag.startY;
      dispatch({ type: "PAN", x: panDrag.startPanX + dx, y: panDrag.startPanY + dy });
      return;
    }
    if (!drag) return;
    if (!rect) return;
    if (drag.mode === "move") {
      const w = s2w(e.clientX - rect.left - drag.offsetX, e.clientY - rect.top - drag.offsetY),
        snap = state.snap;
      const snapX = parseFloat((Math.round(w.x / snap) * snap).toFixed(3));
      const snapY = parseFloat((Math.round(w.y / snap) * snap).toFixed(3));
      const constrainedX = Math.max(-CHIP_HALF_W, Math.min(CHIP_HALF_W, snapX));
      const constrainedY = Math.max(-CHIP_HALF_H, Math.min(CHIP_HALF_H, snapY));
      dispatch({ type: "MOVE_PLACEMENT", id: drag.id, x: constrainedX, y: constrainedY, transient: true });
    }
  };

  const onPUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (panDrag) {
      setPanDrag(null);
      if ((e.currentTarget as Element).hasPointerCapture(e.pointerId))
        (e.currentTarget as Element).releasePointerCapture(e.pointerId);
      return;
    }
    if (drag && (e.currentTarget as Element).hasPointerCapture(e.pointerId))
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    if (drag) {
      const p = state.placements.find((pl) => pl.id === drag.id);
      if (p) {
        dispatch({ type: "MOVE_PLACEMENT", id: drag.id, x: p.x, y: p.y });
      }
    }
    setDrag(null);
    setDragStartPos(null);
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(SCALE_MIN, Math.min(SCALE_MAX, state.zoom * zoomFactor));
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect && state.zoom > 0) {
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const newPanX = state.pan.x + (mx - cx) * (1 - newZoom / state.zoom);
      const newPanY = state.pan.y + (my - cy) * (1 - newZoom / state.zoom);
      dispatch({ type: "ZOOM", zoom: newZoom });
      dispatch({ type: "PAN", x: newPanX, y: newPanY });
    } else {
      dispatch({ type: "ZOOM", zoom: newZoom });
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDropPrev(null);
    const cid = e.dataTransfer.getData("application/x-silicofeller-component");
    if (!cid) return;
    const summary = compsById.get(cid);
    if (!summary) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const w = s2w(e.clientX - rect.left, e.clientY - rect.top),
      snap = state.snap;
    const snapX = parseFloat((Math.round(w.x / snap) * snap).toFixed(3));
    const snapY = parseFloat((Math.round(w.y / snap) * snap).toFixed(3));
    const constrainedX = Math.max(-CHIP_HALF_W, Math.min(CHIP_HALF_W, snapX));
    const constrainedY = Math.max(-CHIP_HALF_H, Math.min(CHIP_HALF_H, snapY));

    const queryKey = ["bridge", "components", cid, "metadata"] as const;
    const cachedMetadata = qc.getQueryData<ComponentMetadata>(queryKey);
    let params: Record<string, string | number> = {};

    if (cachedMetadata) {
      params = defaultParamsFromMetadata(cachedMetadata);
    } else {
      const catalogEntry = QISKIT_CATALOG.find((c) => c.className === cid);
      if (catalogEntry) {
        params = Object.fromEntries(
          Object.entries(catalogEntry.defaultParams).map(([k, v]) => [k, String(v)]),
        );
      }
    }

    const name = uniqueName(prefixForCategory(summary.category));
    const placementId = `pl_${name}_${Date.now()}`;

    dispatch({
      type: "ADD_PLACEMENT",
      placement: {
        id: placementId,
        componentId: cid,
        name,
        x: parseFloat(constrainedX.toFixed(3)),
        y: parseFloat(constrainedY.toFixed(3)),
        rotation: 0,
        params,
      },
    });

    // Track recent component usage
    try {
      const recent = JSON.parse(localStorage.getItem("sf_recent_components") || "[]") as string[];
      const next = [cid, ...recent.filter((id) => id !== cid)].slice(0, 10);
      localStorage.setItem("sf_recent_components", JSON.stringify(next));
    } catch { /* ignore */ }

    if (!cachedMetadata) {
      bridgeClient
        .getMetadata(cid)
        .then((metaRes) => {
          if (metaRes.data) {
            const liveParams = defaultParamsFromMetadata(metaRes.data);
            dispatch({
              type: "UPDATE_PLACEMENT",
              id: placementId,
              patch: { params: liveParams },
            });
          }
        })
        .catch(console.error);
    }
  };

  const onDragOver = (e: React.DragEvent<SVGSVGElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const cid = e.dataTransfer.types.includes("application/x-silicofeller-component")
      ? e.dataTransfer.getData("application/x-silicofeller-component")
      : "";
    const rect = svgRef.current?.getBoundingClientRect();
    if (!cid || !rect) return;
    const w = s2w(e.clientX - rect.left, e.clientY - rect.top),
      snap = state.snap;
    const snapX = parseFloat((Math.round(w.x / snap) * snap).toFixed(3));
    const snapY = parseFloat((Math.round(w.y / snap) * snap).toFixed(3));
    const constrainedX = Math.max(-CHIP_HALF_W, Math.min(CHIP_HALF_W, snapX));
    const constrainedY = Math.max(-CHIP_HALF_H, Math.min(CHIP_HALF_H, snapY));
    setDropPrev({ componentId: cid, x: constrainedX, y: constrainedY });
  };

  const fitToContent = useCallback(() => {
    if (state.placements.length === 0) {
      dispatch({ type: "ZOOM", zoom: 1 });
      dispatch({ type: "PAN", x: 0, y: 0 });
      return;
    }
    const xs = state.placements.map((p) => p.x);
    const ys = state.placements.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const padding = 1.0;
    const contentW = (maxX - minX + 2 * padding) * MM_TO_PX;
    const contentH = (maxY - minY + 2 * padding) * MM_TO_PX;
    const newZoom = Math.min((size.w - 100) / contentW, (size.h - 100) / contentH) / baseScale;
    const clampedZoom = Math.max(SCALE_MIN, Math.min(SCALE_MAX, newZoom));
    const k = MM_TO_PX * baseScale * clampedZoom;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    dispatch({ type: "ZOOM", zoom: clampedZoom });
    dispatch({ type: "PAN", x: -centerX * k, y: centerY * k });
  }, [state.placements, size.w, size.h, baseScale, dispatch]);

  const zoomToSelection = useCallback(() => {
    const selPlacements = state.selection
      .filter((s) => s.kind === "placement")
      .map((s) => state.placements.find((p) => p.id === s.id))
      .filter(Boolean) as Placement[];
    const selConnections = state.selection
      .filter((s) => s.kind === "connection")
      .map((s) => state.connections.find((c) => c.id === s.id))
      .filter(Boolean) as Connection[];
    if (selPlacements.length === 0 && selConnections.length === 0) {
      fitToContent();
      return;
    }
    const xs: number[] = [];
    const ys: number[] = [];
    selPlacements.forEach((p) => { xs.push(p.x); ys.push(p.y); });
    selConnections.forEach((c) => {
      const a = state.placements.find((p) => p.id === c.from.placementId);
      const b = state.placements.find((p) => p.id === c.to.placementId);
      if (a) { xs.push(a.x); ys.push(a.y); }
      if (b) { xs.push(b.x); ys.push(b.y); }
    });
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const padding = 1.0;
    const contentW = (maxX - minX + 2 * padding) * MM_TO_PX;
    const contentH = (maxY - minY + 2 * padding) * MM_TO_PX;
    const newZoom = Math.min((size.w - 100) / contentW, (size.h - 100) / contentH) / baseScale;
    const clampedZoom = Math.max(SCALE_MIN, Math.min(SCALE_MAX, newZoom));
    const k = MM_TO_PX * baseScale * clampedZoom;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    dispatch({ type: "ZOOM", zoom: clampedZoom });
    dispatch({ type: "PAN", x: -centerX * k, y: centerY * k });
  }, [state.selection, state.placements, state.connections, size.w, size.h, baseScale, dispatch, fitToContent]);

  const cancelDrag = useCallback(() => {
    if (drag && dragStartPos) {
      dispatch({ type: "MOVE_PLACEMENT", id: dragStartPos.id, x: dragStartPos.x, y: dragStartPos.y });
      setDrag(null);
      setDragStartPos(null);
    }
  }, [drag, dragStartPos, dispatch]);

  useImperativeHandle(ref, () => ({ fitToContent, zoomToSelection, cancelDrag, getSvgElement: () => svgRef.current }), [
    fitToContent, zoomToSelection, cancelDrag,
  ]);

  // Compute fixed tick lists for horizontal and vertical rulers attached to the board
  const hTicks = useMemo(() => {
    const ticks = [];
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
    const ticks = [];
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

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-[#f8fafc] select-none flex items-center justify-center"
    >
      <svg
        ref={svgRef}
        width={size.w}
        height={size.h}
        className="block touch-none"
        role="application"
        aria-label="Quantum chip schematic editor canvas"
        style={{ cursor: panDrag ? "grabbing" : state.tool === "pan" ? "grab" : drag?.mode === "move" ? "grabbing" : "default" }}
        onPointerDown={onPDown}
        onPointerMove={onPMove}
        onPointerUp={onPUp}
        onPointerCancel={onPUp}
        onWheel={onWheel}
        onDragEnter={onDragOver}
        onDragOver={onDragOver}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDropPrev(null);
          }
        }}
        onDrop={onDrop}
      >
        <defs>
          <clipPath id="boardClip">
            <rect x={left} y={top} width={bw} height={bh} rx={8} />
          </clipPath>
          <linearGradient id="siliconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#e0f2fe" />
            <stop offset="100%" stopColor="#bae6fd" stopOpacity={0.95} />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow
              dx="0"
              dy="6"
              stdDeviation="10"
              floodColor="#0284c7"
              floodOpacity="0.18"
            />
          </filter>
        </defs>

        {/* Workbench Background Grid */}
        <rect
          data-canvas-bg="true"
          x={0}
          y={0}
          width={size.w}
          height={size.h}
          fill="transparent"
          style={{
            backgroundImage: "radial-gradient(circle, #cbd5e1 1.2px, transparent 1.2px)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Chip board and content */}
        <g clipPath="url(#boardClip)">
          <rect
            x={left}
            y={top}
            width={bw}
            height={bh}
            fill="url(#siliconGrad)"
            stroke="#0284c7"
            strokeWidth={2.5}
            filter="url(#glow)"
            rx={8}
          />

          {/* Snap-aligned grid inside board */}
          {state.showGrid && (
            <g opacity={Math.min(1, state.snap * 10)}>
              {(() => {
                const step = state.snap;
                const els = [];
                // Vertical lines
                const startX = Math.ceil(-CHIP_HALF_W / step) * step;
                const endX = Math.floor(CHIP_HALF_W / step) * step;
                for (let x = startX; x <= endX + 0.0001; x = parseFloat((x + step).toFixed(3))) {
                  const isMajor = Math.abs(x % 1.0) < 0.001;
                  const a = w2s(x, -CHIP_HALF_H);
                  const b = w2s(x, CHIP_HALF_H);
                  els.push(
                    <line
                      key={`v-${x}`}
                      x1={a.px} y1={a.py} x2={b.px} y2={b.py}
                      stroke={isMajor ? "rgba(14,165,233,0.25)" : "rgba(14,165,233,0.10)"}
                      strokeWidth={isMajor ? 0.8 : 0.4}
                    />
                  );
                }
                // Horizontal lines
                const startY = Math.ceil(-CHIP_HALF_H / step) * step;
                const endY = Math.floor(CHIP_HALF_H / step) * step;
                for (let y = startY; y <= endY + 0.0001; y = parseFloat((y + step).toFixed(3))) {
                  const isMajor = Math.abs(y % 1.0) < 0.001;
                  const a = w2s(-CHIP_HALF_W, y);
                  const b = w2s(CHIP_HALF_W, y);
                  els.push(
                    <line
                      key={`h-${y}`}
                      x1={a.px} y1={a.py} x2={b.px} y2={b.py}
                      stroke={isMajor ? "rgba(14,165,233,0.25)" : "rgba(14,165,233,0.10)"}
                      strokeWidth={isMajor ? 0.8 : 0.4}
                    />
                  );
                }
                return els;
              })()}
            </g>
          )}

          {state.placements.map((p) => (
            <PlacementPreview
              key={p.id}
              placement={p}
              w2s={w2s}
              scale={scale}
              uiScale={getUiScale(p)}
            />
          ))}
          {dropPrev && (
            <DropGhost
              componentId={dropPrev.componentId}
              x={dropPrev.x}
              y={dropPrev.y}
              w2s={w2s}
              scale={scale}
            />
          )}

          {state.placements.map((p, i) => (
            <PlacementGlyph
              key={p.id}
              placement={p}
              componentId={p.componentId}
              selected={isSelected(state.selection, "placement", p.id)}
              hovered={hovered === p.id}
              pendingOwner={state.pendingPin?.placementId ?? null}
              pendingPin={state.pendingPin?.pinName ?? null}
              pins={pinQueries[i]?.data?.pins ?? []}
              showComponentIds={state.showComponentIds}
              w2s={w2s}
              scale={scale}
              uiScale={getUiScale(p)}
              onPointerDown={(e) => {
                if (state.tool === "pan") return; // let SVG pan handler take over
                e.stopPropagation();
                if (e.shiftKey) {
                  dispatch({ type: "TOGGLE_SELECT", item: { kind: "placement", id: p.id } });
                } else {
                  dispatch({ type: "SELECT", selection: [{ kind: "placement", id: p.id }] });
                }
                if (p.locked) return;
                const rect = svgRef.current?.getBoundingClientRect();
                if (!rect) return;
                const sc = w2s(p.x, p.y);
                setDrag({
                  mode: "move",
                  id: p.id,
                  offsetX: e.clientX - rect.left - sc.px,
                  offsetY: e.clientY - rect.top - sc.py,
                });
                setDragStartPos({ id: p.id, x: p.x, y: p.y });
                (e.currentTarget as Element).setPointerCapture(e.pointerId);
              }}
              onPinClick={(pin) =>
                dispatch({
                  type: "PIN_CLICK",
                  placementId: p.id,
                  pinName: pin,
                  defaultRouteComponentId: "RouteMeander",
                })
              }
              onRename={(name) => dispatch({ type: "UPDATE_PLACEMENT", id: p.id, patch: { name } })}
              overlapping={overlappingIds.has(p.id)}
              onHoverStart={() => setHovered(p.id)}
              onHoverEnd={() => setHovered(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return;
                const selIds = state.selection
                  .filter((s): s is { kind: "placement"; id: string } => s.kind === "placement")
                  .map((s) => s.id);
                const multi = selIds.length > 1 && selIds.includes(p.id);
                setContextMenu({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                  items: [
                    {
                      label: "Select similar",
                      action: () => {
                        const similar = state.placements
                          .filter((pl) => pl.componentId === p.componentId)
                          .map((pl) => ({ kind: "placement" as const, id: pl.id }));
                        dispatch({ type: "SELECT", selection: similar });
                      },
                    },
                    {
                      label: multi ? "Duplicate selected" : "Duplicate",
                      action: () => {
                        if (multi) {
                          selIds.forEach((id) => dispatch({ type: "DUPLICATE_PLACEMENT", id }));
                        } else {
                          dispatch({ type: "DUPLICATE_PLACEMENT", id: p.id });
                        }
                      },
                    },
                    {
                      label: multi ? "Rotate 90°" : "Rotate 90°",
                      action: () => {
                        const targets = multi ? selIds : [p.id];
                        targets.forEach((id) => {
                          const pl = state.placements.find((x) => x.id === id);
                          if (pl) {
                            dispatch({
                              type: "UPDATE_PLACEMENT",
                              id: pl.id,
                              patch: { rotation: (pl.rotation + 90) % 360 },
                            });
                          }
                        });
                      },
                    },
                    {
                      label: multi ? "Mirror selected" : "Mirror",
                      action: () => {
                        const targets = multi ? selIds : [p.id];
                        targets.forEach((id) => dispatch({ type: "MIRROR_PLACEMENT", id }));
                      },
                    },
                    {
                      label: multi ? "Delete selected" : "Delete",
                      action: () => {
                        const targets = multi ? [...selIds] : [p.id];
                        targets.forEach((id) => dispatch({ type: "DELETE_PLACEMENT", id }));
                      },
                      destructive: true,
                    },
                  ],
                });
              }}
            />
          ))}

          {state.showConnections && state.connections.map((c) => {
            const a = state.placements.find((x) => x.id === c.from.placementId),
              b = state.placements.find((x) => x.id === c.to.placementId);
            if (!a || !b) return null;
            const isSel = isSelected(state.selection, "connection", c.id);
            const fromPinPos = pinWorldPos(a, c.from.pinName);
            const toPinPos = pinWorldPos(b, c.to.pinName);
            const pa = fromPinPos ? w2s(fromPinPos.x, fromPinPos.y) : w2s(a.x, a.y);
            const pb = toPinPos ? w2s(toPinPos.x, toPinPos.y) : w2s(b.x, b.y);
            const rsvg = routeSvg.get(c.id);
            if (rsvg) {
              const sc = scale * MM_TO_PX * UM_TO_MM,
                { px, py } = w2s(0, 0);
              return (
                <g
                  key={c.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey) {
                      dispatch({ type: "TOGGLE_SELECT", item: { kind: "connection", id: c.id } });
                    } else {
                      dispatch({ type: "SELECT", selection: [{ kind: "connection", id: c.id }] });
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setContextMenu({
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                      items: [
                        {
                          label: c.locked ? "Unlock route" : "Lock route",
                          action: () =>
                            dispatch({
                              type: c.locked ? "UNLOCK_CONNECTION" : "LOCK_CONNECTION",
                              id: c.id,
                            }),
                        },
                        {
                          label: "Delete",
                          action: () => dispatch({ type: "DELETE_CONNECTION", id: c.id }),
                          destructive: true,
                        },
                      ],
                    });
                  }}
                >
                  {isSel && (
                    <g
                      transform={`translate(${px} ${py}) scale(${sc} ${-sc})`}
                      opacity={0.3}
                      dangerouslySetInnerHTML={{ __html: rsvg }}
                    />
                  )}
                  <g
                    transform={`translate(${px} ${py}) scale(${sc} ${-sc})`}
                    opacity={isSel ? 1 : 0.9}
                    dangerouslySetInnerHTML={{ __html: rsvg }}
                  />
                  {c.locked && (
                    <g transform={`translate(${(pa.px + pb.px) / 2} ${(pa.py + pb.py) / 2})`}>
                      <rect x={-6} y={-7} width={12} height={10} rx={2} fill="#64748b" />
                      <rect x={-3} y={-10} width={6} height={5} rx={1} fill="none" stroke="#64748b" strokeWidth={1.5} />
                    </g>
                  )}
                  {/* Direction arrow at midpoint */}
                  <g transform={`translate(${(pa.px + pb.px) / 2} ${(pa.py + pb.py) / 2})`}>
                    <polygon
                      points="0,-4 3,2 -3,2"
                      fill={isSel ? "var(--primary)" : "#5B9BD5"}
                      opacity={0.7}
                      transform={`rotate(${Math.atan2(pb.py - pa.py, pb.px - pa.px) * 180 / Math.PI})`}
                    />
                  </g>
                </g>
              );
            }
            return (
              <g key={c.id}>
                {isSel && (
                  <path
                    d={`M ${pa.px} ${pa.py} L ${pb.px} ${pb.py}`}
                    stroke="var(--primary)"
                    strokeWidth={8}
                    strokeOpacity={0.2}
                    fill="none"
                  />
                )}
                <path
                  d={`M ${pa.px} ${pa.py} L ${pb.px} ${pb.py}`}
                  stroke={isSel ? "var(--primary)" : c.locked ? "#94a3b8" : "#5B9BD5"}
                  strokeWidth={isSel ? 2.5 : 1.8}
                  strokeDasharray={routeQueries.some((q) => q.isLoading) ? "6 4" : c.locked ? "4 2" : "none"}
                  fill="none"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.shiftKey) {
                      dispatch({ type: "TOGGLE_SELECT", item: { kind: "connection", id: c.id } });
                    } else {
                      dispatch({ type: "SELECT", selection: [{ kind: "connection", id: c.id }] });
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    setContextMenu({
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                      items: [
                        {
                          label: c.locked ? "Unlock route" : "Lock route",
                          action: () =>
                            dispatch({
                              type: c.locked ? "UNLOCK_CONNECTION" : "LOCK_CONNECTION",
                              id: c.id,
                            }),
                        },
                        {
                          label: "Delete",
                          action: () => dispatch({ type: "DELETE_CONNECTION", id: c.id }),
                          destructive: true,
                        },
                      ],
                    });
                  }}
                />
                {c.locked && (
                  <g transform={`translate(${(pa.px + pb.px) / 2} ${(pa.py + pb.py) / 2})`}>
                    <rect x={-6} y={-7} width={12} height={10} rx={2} fill="#64748b" />
                    <rect x={-3} y={-10} width={6} height={5} rx={1} fill="none" stroke="#64748b" strokeWidth={1.5} />
                  </g>
                )}
                {/* Direction arrow at midpoint */}
                <g transform={`translate(${(pa.px + pb.px) / 2} ${(pa.py + pb.py) / 2})`}>
                  <polygon
                    points="0,-4 3,2 -3,2"
                    fill={isSel ? "var(--primary)" : "#5B9BD5"}
                    opacity={0.7}
                    transform={`rotate(${Math.atan2(pb.py - pa.py, pb.px - pa.px) * 180 / Math.PI})`}
                  />
                </g>
                <text
                  x={(pa.px + pb.px) / 2}
                  y={(pa.py + pb.py) / 2 - 10}
                  textAnchor="middle"
                  fontSize={8}
                  fill={isSel ? "var(--primary)" : "var(--muted-foreground)"}
                  className="pointer-events-none select-none"
                >
                  {routeQueries.some((q) => q.isLoading) ? "rendering…" : `${a.name}→${b.name}`}
                </text>
              </g>
            );
          })}
        </g>

        {/* Multi-selection bounding box */}
        {(() => {
          const selPlacements = state.selection
            .filter((s) => s.kind === "placement")
            .map((s) => state.placements.find((p) => p.id === s.id))
            .filter(Boolean) as Placement[];
          if (selPlacements.length < 2) return null;
          const xs = selPlacements.map((p) => p.x);
          const ys = selPlacements.map((p) => p.y);
          const minX = Math.min(...xs), maxX = Math.max(...xs);
          const minY = Math.min(...ys), maxY = Math.max(...ys);
          const pad = 0.5;
          const { px: x1, py: y1 } = w2s(minX - pad, maxY + pad);
          const { px: x2, py: y2 } = w2s(maxX + pad, minY - pad);
          return (
            <rect
              x={Math.min(x1, x2)}
              y={Math.min(y1, y2)}
              width={Math.abs(x2 - x1)}
              height={Math.abs(y2 - y1)}
              fill="none"
              stroke="var(--primary)"
              strokeOpacity={0.3}
              strokeWidth={1}
              strokeDasharray="4 2"
              rx={4}
              pointerEvents="none"
            />
          );
        })()}

        {state.showRulers && (
        <>
        {/* Horizontal board ruler */}
        <g>
          <rect
            x={left}
            y={top - RULER_B}
            width={bw}
            height={RULER_B}
            fill="#f1f5f9"
            stroke="#cbd5e1"
            strokeWidth={1}
          />
          {hTicks.map(({ value, px, type }) => {
            const y1 = type === "major" ? top - 12 : type === "half" ? top - 8 : top - 4;
            return (
              <g key={`h-${value}`}>
                <line
                  x1={px}
                  y1={y1}
                  x2={px}
                  y2={top}
                  stroke={type === "major" ? "#475569" : type === "half" ? "#94a3b8" : "#e2e8f0"}
                  strokeWidth={type === "major" ? 1.2 : 0.8}
                />
                {type === "major" && (
                  <text
                    x={px}
                    y={top - 16}
                    fontSize={8.5}
                    fill="#475569"
                    fontWeight={600}
                    textAnchor="middle"
                    className="pointer-events-none select-none font-mono"
                  >
                    {value}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Vertical board ruler */}
        <g>
          <rect
            x={left - RULER_L}
            y={top}
            width={RULER_L}
            height={bh}
            fill="#f1f5f9"
            stroke="#cbd5e1"
            strokeWidth={1}
          />
          {vTicks.map(({ value, py, type }) => {
            const x1 = type === "major" ? left - 12 : type === "half" ? left - 8 : left - 4;
            return (
              <g key={`v-${value}`}>
                <line
                  x1={x1}
                  y1={py}
                  x2={left}
                  y2={py}
                  stroke={type === "major" ? "#475569" : type === "half" ? "#94a3b8" : "#e2e8f0"}
                  strokeWidth={type === "major" ? 1.2 : 0.8}
                />
                {type === "major" && (
                  <text
                    x={left - 15}
                    y={py + 3}
                    fontSize={8.5}
                    fill="#475569"
                    fontWeight={600}
                    textAnchor="end"
                    className="pointer-events-none select-none font-mono"
                  >
                    {value}
                  </text>
                )}
              </g>
            );
          })}
        </g>

        {/* Cursor crosshair on rulers */}
        {cursorPos && (
          <g>
            <line
              x1={w2s(cursorPos.x, 0).px}
              y1={top}
              x2={w2s(cursorPos.x, 0).px}
              y2={bottom}
              stroke="#ef4444"
              strokeWidth={0.8}
              strokeDasharray="4 3"
              opacity={0.6}
            />
            <line
              x1={left}
              y1={w2s(0, cursorPos.y).py}
              x2={right}
              y2={w2s(0, cursorPos.y).py}
              stroke="#ef4444"
              strokeWidth={0.8}
              strokeDasharray="4 3"
              opacity={0.6}
            />
          </g>
        )}

        {/* Corner mm unit label */}
        <g>
          <rect
            x={left - RULER_L}
            y={top - RULER_B}
            width={RULER_L}
            height={RULER_B}
            fill="#e2e8f0"
            stroke="#cbd5e1"
            strokeWidth={1}
          />
          <text
            x={left - RULER_L / 2}
            y={top - RULER_B / 2 + 3.5}
            textAnchor="middle"
            fontSize={10}
            fontWeight="bold"
            fill="#0284c7"
            className="pointer-events-none select-none font-sans"
          >
            mm
          </text>
        </g>
        </>
        )}
      </svg>

      {/* Empty state */}
      {state.placements.length === 0 && !dropPrev && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <p className="text-sm font-medium text-muted-foreground">Canvas is empty</p>
            <p className="text-xs text-muted-foreground mt-1">Drag a component from the library to get started</p>
            <p className="text-[10px] text-muted-foreground mt-2">Or press <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono">Ctrl/Cmd + K</kbd> for commands</p>
          </div>
        </div>
      )}

      {/* Floating zoom controls */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1 rounded-lg border border-border bg-card/95 p-1 shadow-sm backdrop-blur">
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => dispatch({ type: "ZOOM", zoom: Math.min(SCALE_MAX, state.zoom * 1.2) })}
          title="Zoom in (+)"
          aria-label="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => dispatch({ type: "ZOOM", zoom: Math.max(SCALE_MIN, state.zoom / 1.2) })}
          title="Zoom out (-)"
          aria-label="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => { dispatch({ type: "ZOOM", zoom: 1 }); dispatch({ type: "PAN", x: 0, y: 0 }); }}
          title="Reset view (0)"
          aria-label="Reset zoom and pan"
        >
          <span className="text-[10px] font-bold">1:1</span>
        </button>
      </div>

      {/* Mini-map */}
      <MiniMap
        placements={state.placements}
        connections={state.connections}
        selection={state.selection}
        size={size}
        cx={cx}
        cy={cy}
        scale={scale}
        onPan={(x, y) => dispatch({ type: "PAN", x, y })}
      />

      {/* Global Dimension Indicator & Selection HUD */}
      {state.showHUD && (
      <div className="absolute bottom-3 right-4 flex items-center gap-3 rounded-full border border-border bg-card/95 px-3 py-1 shadow-sm backdrop-blur">
        {getSingleSelection(state.selection)?.kind === "placement" &&
          (() => {
            const sel = getSingleSelection(state.selection);
            const p = sel ? state.placements.find((x) => x.id === sel.id) : null;
            return p ? (
              <div className="flex items-center gap-3 border-r border-border pr-3">
                <span className="text-[11px] text-muted-foreground">
                  <strong className="text-foreground font-semibold">X:</strong> {p.x.toFixed(3)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  <strong className="text-foreground font-semibold">Y:</strong> {p.y.toFixed(3)}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  <strong className="text-foreground font-semibold">Rot:</strong> {p.rotation}°
                </span>
              </div>
            ) : null;
          })()}
        <div className="flex items-center gap-1.5 border-r border-border pr-3">
          <span className="text-[11px] font-semibold text-muted-foreground">Tool:</span>
          <span className="text-[11px] font-bold text-foreground capitalize">{state.tool}</span>
        </div>
        {cursorPos && (
          <div className="flex items-center gap-1 border-r border-border pr-3">
            <span className="text-[11px] font-semibold text-muted-foreground">Cursor:</span>
            <span className="text-[11px] font-mono font-bold text-foreground">
              {cursorPos.x.toFixed(3)}, {cursorPos.y.toFixed(3)}
            </span>
          </div>
        )}
        {drag && dragStartPos && (
          <div className="flex items-center gap-1 border-r border-border pr-3">
            <span className="text-[11px] font-semibold text-muted-foreground">Delta:</span>
            <span className="text-[11px] font-mono font-bold text-foreground">
              {(cursorPos!.x - dragStartPos.x).toFixed(3)}, {(cursorPos!.y - dragStartPos.y).toFixed(3)}
            </span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-semibold text-muted-foreground">Snap:</span>
          {[0.01, 0.05, 0.1, 0.5, 1.0].map((v) => (
            <button
              key={v}
              className={`text-[10px] font-bold px-1 rounded ${state.snap === v ? "text-foreground bg-muted" : "text-muted-foreground hover:text-primary"}`}
              onClick={() => dispatch({ type: "SET_SNAP", snap: v })}
              title={`Snap to ${v} mm`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 border-l border-border pl-3">
          <button
            className={`text-[11px] font-bold ${state.showGrid ? "text-foreground" : "text-muted-foreground"} hover:text-primary`}
            onClick={() => dispatch({ type: "TOGGLE_GRID" })}
            title="Toggle grid visibility"
          >
            {state.showGrid ? "Grid" : "Grid off"}
          </button>
        </div>
        <div className="flex items-center gap-1 border-l border-border pl-3">
          <button
            className={`text-[11px] font-bold ${state.showConnections ? "text-foreground" : "text-muted-foreground"} hover:text-primary`}
            onClick={() => dispatch({ type: "TOGGLE_CONNECTIONS" })}
            title="Toggle connections visibility"
          >
            {state.showConnections ? "Routes" : "Routes off"}
          </button>
          <button
            className={`text-[11px] font-bold ${state.showRulers ? "text-foreground" : "text-muted-foreground"} hover:text-primary`}
            onClick={() => dispatch({ type: "TOGGLE_RULERS" })}
            title="Toggle rulers (U)"
          >
            {state.showRulers ? "Rulers" : "Rulers off"}
          </button>
        </div>
        <div className="flex items-center gap-1 border-l border-border pl-3">
          <button
            className={`text-[11px] font-bold ${state.showComponentIds ? "text-foreground" : "text-muted-foreground"} hover:text-primary`}
            onClick={() => dispatch({ type: "TOGGLE_COMPONENT_IDS" })}
            title="Toggle component ID labels"
          >
            {state.showComponentIds ? "IDs" : "IDs off"}
          </button>
        </div>
        <div className="flex items-center gap-1.5 border-l border-border pl-3">
          <span className="text-[11px] font-semibold text-muted-foreground">Zoom:</span>
          <button
            className="text-[11px] font-bold text-muted-foreground hover:text-foreground px-1 leading-none"
            onClick={() => dispatch({ type: "ZOOM", zoom: Math.max(SCALE_MIN, state.zoom * 0.9) })}
            title="Zoom out"
          >
            −
          </button>
          <span className="text-[11px] font-bold text-foreground">{Math.round(state.zoom * 100)}%</span>
          <button
            className="text-[11px] font-bold text-muted-foreground hover:text-foreground px-1 leading-none"
            onClick={() => dispatch({ type: "ZOOM", zoom: Math.min(SCALE_MAX, state.zoom * 1.1) })}
            title="Zoom in"
          >
            +
          </button>
          <button
            className="text-[11px] font-bold text-muted-foreground hover:text-foreground px-1 leading-none"
            onClick={zoomToSelection}
            title="Zoom to selection (Shift+F)"
          >
            ⊕
          </button>
        </div>
        <div className="flex items-center gap-1.5 border-l border-border pl-3">
          <span className="text-[11px] font-semibold text-muted-foreground">Scale:</span>
          <span className="text-[11px] font-mono font-bold text-foreground">{Math.round(MM_TO_PX * scale)} px/mm</span>
        </div>
        <div className="flex items-center gap-1.5 border-l border-border pl-3">
          <span className="text-[11px] font-semibold text-muted-foreground">Objects:</span>
          <span className="text-[11px] font-bold text-foreground">{state.placements.length}P · {state.connections.length}C</span>
        </div>
        <div className="flex items-center gap-1.5 border-l border-border pl-3">
          <span className="text-[11px] font-semibold text-muted-foreground">Chip:</span>
          <span className="text-[11px] font-bold text-foreground">{CHIP_W_MM} × {CHIP_H_MM} mm</span>
        </div>
        <div className="flex items-center gap-1.5 border-l border-border pl-3">
          <button
            className="text-[11px] font-bold text-muted-foreground hover:text-foreground"
            onClick={() => {
              dispatch({ type: "ZOOM", zoom: 1 });
              dispatch({ type: "PAN", x: size.w / 2, y: size.h / 2 });
            }}
            title="Reset view (1:1, center)"
          >
            1:1
          </button>
        </div>
        <div className="flex items-center gap-1.5 border-l border-border pl-3">
          <button
            className="text-[11px] font-bold text-muted-foreground hover:text-foreground"
            onClick={() => {
              if (state.placements.length === 0) {
                dispatch({ type: "ZOOM", zoom: 1 });
                dispatch({ type: "PAN", x: size.w / 2, y: size.h / 2 });
                return;
              }
              const xs = state.placements.map((p) => p.x);
              const ys = state.placements.map((p) => p.y);
              const minX = Math.min(...xs), maxX = Math.max(...xs);
              const minY = Math.min(...ys), maxY = Math.max(...ys);
              const pad = 2;
              const contentW = (maxX - minX + pad * 2) * MM_TO_PX;
              const contentH = (maxY - minY + pad * 2) * MM_TO_PX;
              const scaleX = size.w / contentW;
              const scaleY = size.h / contentH;
              const newZoom = Math.max(SCALE_MIN, Math.min(SCALE_MAX, Math.min(scaleX, scaleY) * 0.9));
              const cxWorld = (minX + maxX) / 2;
              const cyWorld = (minY + maxY) / 2;
              dispatch({ type: "ZOOM", zoom: newZoom });
              dispatch({ type: "PAN", x: size.w / 2 - cxWorld * MM_TO_PX * newZoom, y: size.h / 2 + cyWorld * MM_TO_PX * newZoom });
            }}
            title="Fit all placements to screen"
          >
            Fit
          </button>
        </div>
      </div>
      )}

      {state.pendingPin && (
        <div className="absolute top-8 left-8 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold text-primary shadow-sm">
          Click another pin to connect · Esc to cancel
        </div>
      )}
      {state.placements.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/80 px-8 py-6 text-center shadow-sm backdrop-blur">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <MousePointer2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Start your design</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Drag a component from the Library panel to place it on the chip.
              </p>
            </div>
            <div className="mt-1 flex flex-wrap justify-center gap-2 text-[10px] text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5">?</span>
              <span>Shortcuts</span>
              <span className="rounded bg-muted px-1.5 py-0.5">F</span>
              <span>Fit view</span>
              <span className="rounded bg-muted px-1.5 py-0.5">Ctrl+A</span>
              <span>Select all</span>
            </div>
          </div>
        </div>
      )}
      {routeQueries.some((q) => q.isError) && (
        <div className="absolute bottom-12 left-8 max-w-xs rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-[10px] text-destructive">
          <p className="font-semibold">Route render errors:</p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {routeQueries.map((q, i) => {
              if (!q.isError) return null;
              const c = state.connections[i];
              return (
                <li key={c.id} className="truncate">
                  {c.from.placementId}→{c.to.placementId}: {q.error instanceof Error ? q.error.message : String(q.error)}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {routeQueries.some((q) => q.isFetching) && state.connections.length > 0 && (
        <div className="absolute bottom-12 left-8 flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-3 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" /> Rendering
          route geometry…
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="absolute z-50 min-w-[140px] rounded-md border border-border bg-card p-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {contextMenu.items.map((item, i) => (
            <button
              key={i}
              className={cn(
                "flex w-full items-center rounded-sm px-2 py-1.5 text-xs",
                item.destructive
                  ? "text-destructive hover:bg-destructive/10"
                  : "text-foreground hover:bg-muted",
                item.disabled && "opacity-50 pointer-events-none",
              )}
              onClick={() => {
                item.action();
                setContextMenu(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

function PlacementPreview({
  placement,
  w2s,
  scale,
  uiScale,
}: {
  placement: Placement;
  w2s: (x: number, y: number) => { px: number; py: number };
  scale: number;
  uiScale: number;
}) {
  const q = useQuery(componentPreviewQueryOptions(placement.componentId, placement.params));
  const p = q.data;
  const { px, py } = w2s(placement.x, placement.y);
  const mx = placement.mirrorX ? -1 : 1;
  if (!p?.svg) {
    const s = Math.max(36, 0.6 * MM_TO_PX * scale * uiScale),
      h = s / 2;
    return (
      <g transform={`translate(${px} ${py}) rotate(${-placement.rotation}) scale(${mx} 1)`}>
        <rect
          x={-h}
          y={-h}
          width={s}
          height={s}
          rx={4}
          fill="color-mix(in oklab, var(--primary) 5%, transparent)"
          stroke="color-mix(in oklab, var(--foreground) 30%, transparent)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      </g>
    );
  }
  const sc = scale * MM_TO_PX * (p.units === "um" ? UM_TO_MM : 1) * uiScale;
  const vb = p.viewBox;
  return (
    <g transform={`translate(${px} ${py}) rotate(${-placement.rotation}) scale(${mx} 1)`}>
      <g
        transform={`scale(${sc} ${-sc}) translate(${-(vb.x + vb.w / 2)} ${-(vb.y + vb.h / 2)})`}
        dangerouslySetInnerHTML={{ __html: p.svg }}
        style={{ transition: "transform 0.12s ease" }}
      />
    </g>
  );
}

function DropGhost({
  componentId,
  x,
  y,
  w2s,
  scale,
}: {
  componentId: string;
  x: number;
  y: number;
  w2s: (x: number, y: number) => { px: number; py: number };
  scale: number;
}) {
  const q = useQuery(componentPreviewQueryOptions(componentId));
  const p = q.data;
  const { px, py } = w2s(x, y);
  if (!p?.svg) {
    const s = Math.max(36, 0.6 * MM_TO_PX * scale),
      h = s / 2;
    return (
      <g className="pointer-events-none" transform={`translate(${px} ${py})`}>
        <rect
          x={-h}
          y={-h}
          width={s}
          height={s}
          rx={4}
          fill="color-mix(in oklab, var(--primary) 10%, transparent)"
          stroke="var(--primary)"
          strokeDasharray="5 4"
          strokeOpacity={0.65}
        />
      </g>
    );
  }
  const sc = scale * MM_TO_PX * (p.units === "um" ? UM_TO_MM : 1),
    vb = p.viewBox;
  return (
    <g className="pointer-events-none" opacity={0.72}>
      <g transform={`translate(${px} ${py})`}>
        <g
          transform={`scale(${sc} ${-sc}) translate(${-(vb.x + vb.w / 2)} ${-(vb.y + vb.h / 2)})`}
          dangerouslySetInnerHTML={{ __html: p.svg }}
        />
      </g>
      <circle
        cx={px}
        cy={py}
        r={4}
        fill="var(--primary)"
        stroke="var(--background)"
        strokeWidth={1.5}
      />
    </g>
  );
}

function PlacementGlyph({
  placement,
  componentId,
  selected,
  hovered,
  overlapping,
  pendingOwner,
  pendingPin,
  pins,
  showComponentIds,
  w2s,
  scale,
  uiScale,
  onPointerDown,
  onPinClick,
  onRename,
  onHoverStart,
  onHoverEnd,
  onContextMenu,
}: {
  placement: Placement;
  componentId: string;
  selected: boolean;
  hovered: boolean;
  overlapping: boolean;
  pendingOwner: string | null;
  pendingPin: string | null;
  pins: PinSpec[];
  showComponentIds: boolean;
  w2s: (x: number, y: number) => { px: number; py: number };
  scale: number;
  uiScale: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onPinClick: (p: string) => void;
  onRename: (name: string) => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const q = useQuery(componentPreviewQueryOptions(componentId, placement.params));
  const vb = q.data?.viewBox;
  const um = q.data?.units === "um" ? UM_TO_MM : 1;
  const sz = vb
    ? Math.max(vb.w, vb.h) * um * MM_TO_PX * scale * uiScale
    : Math.max(28, 0.5 * MM_TO_PX * scale);
  const { px, py } = w2s(placement.x, placement.y),
    half = sz / 2;
  const isPO = pendingOwner === placement.id;
  return (
    <g
      transform={`translate(${px} ${py}) rotate(${-placement.rotation})`}
      className={cn("cursor-grab", selected && "cursor-grabbing")}
      role="button"
      aria-label={`${placement.name} (${componentId}) at ${placement.x.toFixed(2)}, ${placement.y.toFixed(2)} mm`}
      onPointerDown={onPointerDown}
      onPointerEnter={onHoverStart}
      onPointerLeave={onHoverEnd}
      onContextMenu={onContextMenu}
    >
      <title>{`${placement.name} (${componentId})\nX: ${placement.x.toFixed(3)} mm, Y: ${placement.y.toFixed(3)} mm\nRotation: ${placement.rotation}°${placement.mirrorX ? ", Mirrored" : ""}${placement.locked ? " [Locked]" : ""}`}</title>
      <rect x={-half} y={-half} width={sz} height={sz} fill="transparent" stroke="none" />
      {selected && (
        <rect
          x={-half - 6}
          y={-half - 6}
          width={sz + 12}
          height={sz + 12}
          rx={6}
          fill="none"
          stroke="var(--primary)"
          strokeOpacity={0.5}
          strokeWidth={2}
          strokeDasharray="3 2"
        />
      )}
      {!selected && hovered && (
        <rect
          x={-half - 6}
          y={-half - 6}
          width={sz + 12}
          height={sz + 12}
          rx={6}
          fill="none"
          stroke="var(--primary)"
          strokeOpacity={0.2}
          strokeWidth={1.5}
        />
      )}
      {overlapping && (
        <rect
          x={-half - 8}
          y={-half - 8}
          width={sz + 16}
          height={sz + 16}
          rx={6}
          fill="none"
          stroke="#ef4444"
          strokeOpacity={0.6}
          strokeWidth={2}
          strokeDasharray="4 2"
        />
      )}
      {placement.locked && (
        <g transform={`translate(${half - 8} ${-half + 2})`}>
          <rect x={-4} y={-2} width={10} height={8} rx={1} fill="#64748b" />
          <rect x={-2} y={-5} width={6} height={4} rx={1} fill="none" stroke="#64748b" strokeWidth={1.2} />
        </g>
      )}
      {editingName ? (
        <foreignObject x={-60} y={half + 4} width={120} height={22}>
          <input
            type="text"
            defaultValue={placement.name}
            autoFocus
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v) onRename(v);
              setEditingName(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = (e.currentTarget as HTMLInputElement).value.trim();
                if (v) onRename(v);
                setEditingName(false);
              } else if (e.key === "Escape") {
                setEditingName(false);
              }
            }}
            className="h-5 w-full rounded border border-primary bg-background px-1 text-[10px] font-bold text-foreground outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        </foreignObject>
      ) : (
        <text
          x={0}
          y={half + 14}
          textAnchor="middle"
          fontSize={10}
          fontWeight={700}
          fill="var(--foreground)"
          className="select-none cursor-text"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setEditingName(true);
          }}
        >
          {placement.name}
        </text>
      )}
      {showComponentIds && !editingName && (
        <text
          x={0}
          y={half + 26}
          textAnchor="middle"
          fontSize={8}
          fill="var(--muted-foreground)"
          className="select-none"
        >
          {componentId}
        </text>
      )}
      {placement.locked && (
        <g transform={`translate(${-half + 4} ${-half + 4})`}>
          <circle r={6} fill="var(--amber-500)" stroke="var(--foreground)" strokeWidth={1} />
          <text y={3} textAnchor="middle" fontSize={7} fontWeight={700} fill="var(--foreground)">L</text>
        </g>
      )}
      {hovered && (
        <g transform={`translate(${half + 8} ${-half})`}>
          <rect x={0} y={0} width={140} height={42} rx={4} fill="var(--card)" stroke="var(--border)" strokeWidth={1} opacity={0.95} />
          <text x={6} y={14} fontSize={9} fontWeight={700} fill="var(--foreground)">{placement.componentId}</text>
          <text x={6} y={28} fontSize={8} fill="var(--muted-foreground)">
            {Object.entries(placement.params).slice(0, 2).map(([k, v]) => `${k}=${v}`).join(" ")}
          </text>
          <text x={6} y={38} fontSize={8} fill="var(--muted-foreground)">x:{placement.x.toFixed(2)} y:{placement.y.toFixed(2)}</text>
        </g>
      )}
      {pins.map((pin) => {
        const cx = pin.hint.x * UM_TO_MM * MM_TO_PX * scale,
          cy = -pin.hint.y * UM_TO_MM * MM_TO_PX * scale;
        const iP = isPO && pendingPin === pin.name;
        return (
          <g key={pin.name}>
            <circle
              cx={cx}
              cy={cy}
              r={iP ? 5 : 3.5}
              fill={
                iP ? "var(--destructive)" : selected ? "var(--primary)" : "var(--muted-foreground)"
              }
              stroke="var(--background)"
              strokeWidth={1}
              className="cursor-crosshair"
              onPointerDown={(e) => {
                e.stopPropagation();
                onPinClick(pin.name);
              }}
            />
            {selected && (
              <text
                x={cx + 6}
                y={cy + 3}
                fontSize={8}
                fill="var(--foreground)"
                fontWeight={700}
                className="pointer-events-none select-none"
              >
                {pin.name}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

function MiniMap({
  placements,
  connections,
  selection,
  size,
  cx,
  cy,
  scale,
  onPan,
}: {
  placements: Placement[];
  connections: Connection[];
  selection: Selection;
  size: { w: number; h: number };
  cx: number;
  cy: number;
  scale: number;
  onPan: (x: number, y: number) => void;
}) {
  const W = 160;
  const H = 100;
  const PAD = 4;
  const mapScale = Math.min((W - PAD * 2) / CHIP_W_MM, (H - PAD * 2) / CHIP_H_MM);
  const ox = (W - CHIP_W_MM * mapScale) / 2;
  const oy = (H - CHIP_H_MM * mapScale) / 2;

  const w2m = (wx: number, wy: number) => ({
    mx: ox + (wx + CHIP_HALF_W) * mapScale,
    my: H - (oy + (wy + CHIP_HALF_H) * mapScale),
  });

  // Visible world bounds
  const visLeft = (0 - cx) / (MM_TO_PX * scale);
  const visRight = (size.w - cx) / (MM_TO_PX * scale);
  const visTop = (0 - cy) / (MM_TO_PX * scale);
  const visBottom = (size.h - cy) / (MM_TO_PX * scale);

  const a = w2m(visLeft, visTop);
  const b = w2m(visRight, visBottom);
  const selSet = new Set(selection.filter((s) => s.kind === "placement").map((s) => s.id));

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const wx = (sx - ox) / mapScale - CHIP_HALF_W;
    const wy = -(sy - H + oy) / mapScale - CHIP_HALF_H;
    onPan(-wx * MM_TO_PX * scale + size.w / 2, -wy * MM_TO_PX * scale + size.h / 2);
  };

  return (
    <div
      className="absolute top-3 right-3 rounded-lg border border-border bg-card/95 p-1 shadow-sm backdrop-blur"
      style={{ width: W, height: H }}
    >
      <svg width={W} height={H} className="block cursor-pointer" role="img" aria-label="Mini-map overview" onClick={onClick}>
        {/* Chip bounds */}
        <rect
          x={ox}
          y={oy}
          width={CHIP_W_MM * mapScale}
          height={CHIP_H_MM * mapScale}
          fill="var(--muted)"
          stroke="var(--border)"
          strokeWidth={1}
          rx={2}
        />
        {/* Connections */}
        {connections.map((c) => {
          const a = placements.find((p) => p.id === c.from.placementId);
          const b = placements.find((p) => p.id === c.to.placementId);
          if (!a || !b) return null;
          const pa = w2m(a.x, a.y);
          const pb = w2m(b.x, b.y);
          return (
            <line
              key={c.id}
              x1={pa.mx}
              y1={pa.my}
              x2={pb.mx}
              y2={pb.my}
              stroke="var(--border)"
              strokeWidth={0.5}
              opacity={0.5}
            />
          );
        })}
        {/* Placements */}
        {placements.map((p) => {
          const { mx, my } = w2m(p.x, p.y);
          const isSel = selSet.has(p.id);
          return (
            <circle
              key={p.id}
              cx={mx}
              cy={my}
              r={isSel ? 2.5 : 1.5}
              fill={isSel ? "var(--primary)" : "var(--foreground)"}
              opacity={isSel ? 1 : 0.5}
            />
          );
        })}
        {/* Viewport rectangle */}
        <rect
          x={Math.min(a.mx, b.mx)}
          y={Math.min(a.my, b.my)}
          width={Math.abs(b.mx - a.mx)}
          height={Math.abs(b.my - a.my)}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={1}
          opacity={0.6}
          pointerEvents="none"
        />
      </svg>
    </div>
  );
}
