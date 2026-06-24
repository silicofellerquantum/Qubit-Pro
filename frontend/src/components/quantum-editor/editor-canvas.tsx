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
import { Plus, Minus, Hand, MousePointer2, X } from "lucide-react";
import { prefixForCategory, type EditorState, type Selection, isSelected, getSingleSelection } from "@/lib/editor/design-store";
import { useWorkspace } from "@/lib/editor/workspace-store";
import {
  componentPinsQueryOptions,
  componentsQueryOptions,
  componentPreviewQueryOptions,
} from "@/lib/bridge/queries";
import { defaultParamsFromMetadata } from "@/lib/bridge/adapters";
import { bridgeClient } from "@/lib/bridge/client";
import type {
  ComponentSummary,
  PinSpec,
  Placement,
  Connection,
  ComponentMetadata,
} from "@/lib/bridge/types";
import { cn } from "@/lib/utils";
import { QISKIT_CATALOG } from "./qiskit-metal-catalog";
import {
  useCanvasViewport,
  CHIP_W_MM,
  CHIP_H_MM,
  CHIP_HALF_W,
  CHIP_HALF_H,
  MM_TO_PX,
  SCALE_MIN,
  SCALE_MAX,
} from "./use-canvas-viewport";
import { useRouteRendering } from "./use-route-rendering";
import { useDropHandling } from "./use-drop-handling";
// PlacementPreview, DropGhost, PlacementGlyph, MiniMap are defined locally below

export { CHIP_W_MM, CHIP_H_MM, CHIP_HALF_W, CHIP_HALF_H } from "./use-canvas-viewport"; // re-export for consumers
const UM_TO_MM = 0.001;
const UI_SCALE_KEY = "_uiScale";

// Maximum component footprint in mm before we scale it down.
// A 1.2 mm cap keeps even large qubits (like concentric-ring types) at a
// sensible size relative to the 9 mm chip, while small components like
// TransmonPocket (~1 mm) render at true physical size.
const MAX_COMP_MM = 1.2;

/**
 * Compute the SVG→screen scale factor for a component preview.
 * All components render at their true physical size (sc = MM_TO_PX * scale),
 * but are capped so their largest dimension never exceeds MAX_COMP_MM on screen.
 * Pin positions MUST use the same svgScale value so they stay aligned.
 *
 * @param vbMaxDim  largest dimension of the component viewBox (in svgUnits)
 * @param svgUnits  "um" | "mm"
 * @param scale     canvas scale (baseScale × zoom)
 * @param uiScale   per-placement uiScale override (default 1)
 */
function svgScale(
  vbMaxDim: number,
  svgUnits: "um" | "mm",
  scale: number,
  uiScale = 1,
): number {
  const physSc = MM_TO_PX * scale * uiScale * (svgUnits === "um" ? UM_TO_MM : 1);
  const maxDimMm = vbMaxDim * (svgUnits === "um" ? UM_TO_MM : 1);
  const capSc    = maxDimMm > MAX_COMP_MM
    ? (MAX_COMP_MM * MM_TO_PX * scale * uiScale) / vbMaxDim
    : physSc;
  return capSc;
}

// Hit-area tuning constants — generous padding so components are easy to
// click without needing pixel-perfect precision.
const HIT_PAD = 28; // px extra around the component's visual bounding box
const MIN_HIT = 64; // px minimum hit-rect side length
const HIT_PAD_ROUTE = 18; // px extra around a route's pin-to-pin bbox (kept
// modest so route hit areas don't swallow nearby component hit areas)

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

  const uniqueName = useCallback(
    (prefix: string) => {
      let n = 0;
      const taken = new Set(state.placements.map((p) => p.name));
      while (taken.has(`${prefix}${n}`)) n++;
      return `${prefix}${n}`;
    },
    [state.placements],
  );

  const [drag, setDrag] = useState<DragState>(null);
  const [dragStartPos, setDragStartPos] = useState<{ id: string; x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: { label: string; action: () => void; disabled?: boolean; destructive?: boolean }[];
  } | null>(null);

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

  // ── Viewport hook (resize, pan, zoom, w2s/s2w, fit, ticks) ──────────────────
  const vp = useCanvasViewport(state, dispatch);
  const { size, containerRef, svgRef, panDrag, setPanDrag,
    cx, cy, scale, baseScale, bw, bh, left, right, top, bottom,
    w2s, s2w, fitToContent, zoomToSelection,
    hTicks, vTicks, RULER_B, RULER_L } = vp;

  // ── Route rendering hook ────────────────────────────────────────────────────
  const { routeQueries, routeSvg } = useRouteRendering(state, doc, drag, dispatch);

  // ── Drop handling hook ───────────────────────────────────────────────────────
  const { dropPrev, onDrop, onDragOver, onDragLeave } = useDropHandling(dispatch);

  const pinQueries = useQueries({
    queries: state.placements.map((p) => componentPinsQueryOptions(p.componentId, p.params)),
  });

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

  // Per-category overlap thresholds: resonators are physically larger
  // and need more clearance before flagging a collision.
  const overlappingIds = useMemo(() => {
    const ids = new Set<string>();
    // compsById maps componentId -> ComponentSummary with .category
    const getThreshold = (a: Placement, b: Placement): number => {
      const catA = compsById.get(a.componentId)?.category ?? "other";
      const catB = compsById.get(b.componentId)?.category ?? "other";
      const isResonatorA = catA === "resonators";
      const isResonatorB = catB === "resonators";
      if (isResonatorA || isResonatorB) return 0.15; // resonators don't overlap unless very close
      return 0.4; // default for qubits, launchpads, etc.
    };
    for (let i = 0; i < state.placements.length; i++) {
      for (let j = i + 1; j < state.placements.length; j++) {
        const a = state.placements[i];
        const b = state.placements[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < getThreshold(a, b)) {
          ids.add(a.id);
          ids.add(b.id);
        }
      }
    }
    return ids;
  }, [state.placements, compsById]);

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

  // hTicks and vTicks come from useCanvasViewport (vp) — no local re-declaration needed

  // Shared placement interaction handlers — used by both the visual glyph
  // layer and the top-level hit-area layer so behavior stays consistent.
  const makePlacementHandlers = useCallback(
    (p: Placement) => ({
      onPointerDown: (e: React.PointerEvent) => {
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
      },
      onPinClick: (pin: string) =>
        dispatch({
          type: "PIN_CLICK",
          placementId: p.id,
          pinName: pin,
          defaultRouteComponentId: "RouteMeander",
        }),
      onRename: (name: string) => dispatch({ type: "UPDATE_PLACEMENT", id: p.id, patch: { name } }),
      onContextMenu: (e: React.MouseEvent) => {
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
      },
    }),
    [state.tool, state.selection, state.placements, dispatch, w2s],
  );

  // Shared connection interaction handlers — used by both the route visual
  // layer and the top-level route hit-area layer.
  const makeConnectionHandlers = useCallback(
    (c: Connection) => ({
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation();
        if (e.shiftKey) {
          dispatch({ type: "TOGGLE_SELECT", item: { kind: "connection", id: c.id } });
        } else {
          dispatch({ type: "SELECT", selection: [{ kind: "connection", id: c.id }] });
        }
      },
      onContextMenu: (e: React.MouseEvent) => {
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
      },
    }),
    [dispatch],
  );

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
        onDragEnter={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
        onDragOver={(e) => onDragOver(e, svgRef, s2w, state.snap)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, svgRef, s2w, state.snap, compsById, uniqueName)}
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
            <g opacity={Math.min(1, state.snap * 10)} style={{ pointerEvents: "none" }}>
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

          {/* ── Z-ORDER LAYERING FOR SELECTION ──────────────────────────────
              1. Visual glyphs (labels, pin dots, lock icons) — no big hit areas
              2. Route visuals + a MODEST route hit-rect
              3. Component hit-areas (large, generous) — always on TOP so a
                 click anywhere near a component wins over nearby wires/grid.
             ─────────────────────────────────────────────────────────────── */}

          {/* 1. Visual glyphs only (labels, pins, lock icon, hover tooltip) */}
          {state.placements.map((p, i) => (
            <PlacementGlyph
              key={p.id}
              placement={p}
              componentId={p.componentId}
              category={compsById.get(p.componentId)?.category}
              selected={isSelected(state.selection, "placement", p.id)}
              hovered={hovered === p.id}
              pendingOwner={state.pendingPin?.placementId ?? null}
              pendingPin={state.pendingPin?.pinName ?? null}
              pins={pinQueries[i]?.data?.pins ?? []}
              showComponentIds={state.showComponentIds}
              w2s={w2s}
              scale={scale}
              uiScale={getUiScale(p)}
              overlapping={overlappingIds.has(p.id)}
            />
          ))}

          {/* 2. Route visuals + modest hit-rects (sit below component hit areas) */}
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
            const handlers = makeConnectionHandlers(c);
            if (rsvg) {
              const sc = scale * MM_TO_PX * UM_TO_MM,
                { px, py } = w2s(0, 0);

              // Bounding box of the route in screen coords for the hit rect.
              // Kept modest (HIT_PAD_ROUTE) so it doesn't overwhelm nearby
              // component hit-areas, which render afterwards and win ties.
              const rxMin = Math.min(pa.px, pb.px) - HIT_PAD_ROUTE;
              const ryMin = Math.min(pa.py, pb.py) - HIT_PAD_ROUTE;
              const rxW   = Math.abs(pb.px - pa.px) + HIT_PAD_ROUTE * 2;
              const ryH   = Math.abs(pb.py - pa.py) + HIT_PAD_ROUTE * 2;

              return (
                <g
                  key={c.id}
                  className="cursor-pointer"
                  onClick={handlers.onClick}
                  onContextMenu={handlers.onContextMenu}
                >
                  {/* Modest invisible hit rect covering the meander bounding box */}
                  <rect
                    x={rxMin} y={ryMin}
                    width={Math.max(rxW, 32)} height={Math.max(ryH, 32)}
                    fill="transparent" stroke="none"
                  />
                  {isSel && (
                    <g
                      transform={`translate(${px} ${py}) scale(${sc} ${-sc})`}
                      opacity={0.3}
                      style={{ pointerEvents: "none" }}
                      dangerouslySetInnerHTML={{ __html: rsvg }}
                    />
                  )}
                  <g
                    transform={`translate(${px} ${py}) scale(${sc} ${-sc})`}
                    opacity={isSel ? 1 : 0.9}
                    style={{ pointerEvents: "none" }}
                    dangerouslySetInnerHTML={{ __html: rsvg }}
                  />
                  {/* Selection highlight border */}
                  {isSel && (
                    <rect
                      x={rxMin - 2} y={ryMin - 2}
                      width={Math.max(rxW, 32) + 4} height={Math.max(ryH, 32) + 4}
                      rx={6} fill="none"
                      stroke="var(--primary)" strokeOpacity={0.35}
                      strokeWidth={2} strokeDasharray="4 2"
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                  {c.locked && (
                    <g transform={`translate(${(pa.px + pb.px) / 2} ${(pa.py + pb.py) / 2})`} style={{ pointerEvents: "none" }}>
                      <rect x={-6} y={-7} width={12} height={10} rx={2} fill="#64748b" />
                      <rect x={-3} y={-10} width={6} height={5} rx={1} fill="none" stroke="#64748b" strokeWidth={1.5} />
                    </g>
                  )}
                  {/* Direction arrow at midpoint */}
                  <g transform={`translate(${(pa.px + pb.px) / 2} ${(pa.py + pb.py) / 2})`} style={{ pointerEvents: "none" }}>
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
                {/* Modest transparent stroke for clicking on thin wire */}
                <path
                  d={`M ${pa.px} ${pa.py} L ${pb.px} ${pb.py}`}
                  stroke="transparent"
                  strokeWidth={Math.max(8, HIT_PAD_ROUTE)}
                  fill="none"
                  className="cursor-pointer"
                  onClick={handlers.onClick}
                  onContextMenu={handlers.onContextMenu}
                />
                {isSel && (
                  <path
                    d={`M ${pa.px} ${pa.py} L ${pb.px} ${pb.py}`}
                    stroke="var(--primary)"
                    strokeWidth={8}
                    strokeOpacity={0.2}
                    fill="none"
                    style={{ pointerEvents: "none" }}
                  />
                )}
                <path
                  d={`M ${pa.px} ${pa.py} L ${pb.px} ${pb.py}`}
                  stroke={isSel ? "var(--primary)" : c.locked ? "#94a3b8" : "#5B9BD5"}
                  strokeWidth={isSel ? 2 : 1.4}
                  strokeDasharray={c.locked ? "4 2" : "5 3"}
                  strokeOpacity={0.65}
                  fill="none"
                  style={{ pointerEvents: "none" }}
                />
                {c.locked && (
                  <g transform={`translate(${(pa.px + pb.px) / 2} ${(pa.py + pb.py) / 2})`} style={{ pointerEvents: "none" }}>
                    <rect x={-6} y={-7} width={12} height={10} rx={2} fill="#64748b" />
                    <rect x={-3} y={-10} width={6} height={5} rx={1} fill="none" stroke="#64748b" strokeWidth={1.5} />
                  </g>
                )}
                {/* Direction arrow at midpoint */}
                <g transform={`translate(${(pa.px + pb.px) / 2} ${(pa.py + pb.py) / 2})`} style={{ pointerEvents: "none" }}>
                  <polygon
                    points="0,-4 3,2 -3,2"
                    fill={isSel ? "var(--primary)" : "#5B9BD5"}
                    opacity={0.7}
                    transform={`rotate(${Math.atan2(pb.py - pa.py, pb.px - pa.px) * 180 / Math.PI})`}
                  />
                </g>
                {!c.routeComponentId && (
                  <text
                    x={(pa.px + pb.px) / 2}
                    y={(pa.py + pb.py) / 2 - 14}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--muted-foreground)"
                    opacity={0.7}
                    style={{ pointerEvents: "none" }}
                    className="select-none"
                  >
                    no route component
                  </text>
                )}
                {c.routeComponentId && !routeSvg.get(c.id) && (
                  <text
                    x={(pa.px + pb.px) / 2}
                    y={(pa.py + pb.py) / 2 - 14}
                    textAnchor="middle"
                    fontSize={9}
                    fill="var(--muted-foreground)"
                    opacity={0.6}
                    style={{ pointerEvents: "none" }}
                    className="select-none"
                  >
                    {c.routeComponentId} ···
                  </text>
                )}
              </g>
            );
          })}

          {/* 3. Component hit-areas — rendered LAST so they sit on top of
                 route hit-rects and the grid, guaranteeing components win
                 selection priority. Large, generous padding (HIT_PAD/MIN_HIT). */}
          {state.placements.map((p, i) => {
            const handlers = makePlacementHandlers(p);
            return (
              <PlacementHitArea
                key={`hit-${p.id}`}
                placement={p}
                componentId={p.componentId}
                pins={pinQueries[i]?.data?.pins ?? []}
                w2s={w2s}
                scale={scale}
                uiScale={getUiScale(p)}
                selected={isSelected(state.selection, "placement", p.id)}
                onPointerDown={handlers.onPointerDown}
                onPinClick={handlers.onPinClick}
                onRename={handlers.onRename}
                onHoverStart={() => setHovered(p.id)}
                onHoverEnd={() => setHovered(null)}
                onContextMenu={handlers.onContextMenu}
              />
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
        <g style={{ pointerEvents: "none" }}>
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
        <g style={{ pointerEvents: "none" }}>
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
          <g style={{ pointerEvents: "none" }}>
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
        <g style={{ pointerEvents: "none" }}>
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
        visible={state.showMiniMap}
        onPan={(x, y) => dispatch({ type: "PAN", x, y })}
        onClose={() => dispatch({ type: "TOGGLE_MINIMAP" })}
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
    // Fallback placeholder: 0.8 mm square
    const s = 0.8 * MM_TO_PX * scale * uiScale, h = s / 2;
    return (
      <g
        transform={`translate(${px} ${py}) rotate(${-placement.rotation}) scale(${mx} 1)`}
        style={{ pointerEvents: "none" }}
      >
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
  const vb = p.viewBox;
  const sc = svgScale(Math.max(vb.w, vb.h), p.units as "um" | "mm", scale, uiScale);
  return (
    <g
      transform={`translate(${px} ${py}) rotate(${-placement.rotation}) scale(${mx} 1)`}
      style={{ pointerEvents: "none" }}
    >
      <g
        transform={`scale(${sc} ${-sc}) translate(${-(vb.x + vb.w / 2)} ${-(vb.y + vb.h / 2)})`}
        dangerouslySetInnerHTML={{ __html: p.svg }}
        style={{ transition: "transform 0.12s ease", pointerEvents: "none" }}
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
    const s = Math.max(24, 40 * scale),
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
  const vb = p.viewBox;
  const ghostSc = svgScale(Math.max(vb.w, vb.h), p.units as "um" | "mm", scale);
  return (
    <g className="pointer-events-none" opacity={0.72}>
      <g transform={`translate(${px} ${py})`}>
        <g
          transform={`scale(${ghostSc} ${-ghostSc}) translate(${-(vb.x + vb.w / 2)} ${-(vb.y + vb.h / 2)})`}
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

/**
 * Visual-only glyph layer: name label, component-id label, lock icon,
 * overlap/selection outline, and hover tooltip. Carries NO large hit
 * rectangle of its own — selection & dragging are handled by
 * `PlacementHitArea`, which renders afterwards (on top) with a generous
 * hitbox. This split lets us guarantee component hit-areas always win
 * over routes/grid in z-order while keeping visuals in their natural
 * paint position.
 */
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
}) {
  const q = useQuery(componentPreviewQueryOptions(componentId, placement.params));
  const vb = q.data?.viewBox;
  const units = (q.data?.units ?? "um") as "um" | "mm";
  // sz = largest physical dimension in screen pixels, capped at MAX_COMP_MM.
  const sc = vb
    ? svgScale(Math.max(vb.w, vb.h), units, scale, uiScale)
    : svgScale(800, "um", scale, uiScale);  // fallback ~0.8mm
  const sz = vb
    ? Math.max(vb.w, vb.h) * sc
    : 0.8 * MM_TO_PX * scale * uiScale;

  const { px, py } = w2s(placement.x, placement.y),
    half = sz / 2;

  return (
    <g
      transform={`translate(${px} ${py}) rotate(${-placement.rotation})`}
      style={{ pointerEvents: "none" }}
    >
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
      <text
        x={0}
        y={half + 14}
        textAnchor="middle"
        fontSize={10}
        fontWeight={700}
        fill="var(--foreground)"
        className="select-none"
      >
        {placement.name}
      </text>
      {showComponentIds && (
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
      {/* Pin name labels (dots themselves are interactive, drawn in PlacementHitArea) */}
      {selected && pins.map((pin) => {
        const cx = pin.hint.x * sc,
          cy = -pin.hint.y * sc;
        return (
          <text
            key={pin.name}
            x={cx + 6}
            y={cy + 3}
            fontSize={8}
            fill="var(--foreground)"
            fontWeight={700}
            className="select-none"
          >
            {pin.name}
          </text>
        );
      })}
    </g>
  );
}

/**
 * Interactive hit-area layer for a placement. Renders LAST (topmost) so
 * that clicking anywhere within a generous padded bounding box around the
 * component — even over a route or the background grid — selects and lets
 * the user drag the component. Also renders the rename text-edit field,
 * selection/hover outlines, and pin click targets, all of which need to be
 * interactive.
 */
function PlacementHitArea({
  placement,
  componentId,
  pins,
  w2s,
  scale,
  uiScale,
  selected,
  onPointerDown,
  onPinClick,
  onRename,
  onHoverStart,
  onHoverEnd,
  onContextMenu,
}: {
  placement: Placement;
  componentId: string;
  pins: PinSpec[];
  w2s: (x: number, y: number) => { px: number; py: number };
  scale: number;
  uiScale: number;
  selected: boolean;
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
  const units = (q.data?.units ?? "um") as "um" | "mm";
  // Use the same capped scale as PlacementGlyph/Preview so hit area aligns.
  const sc = vb
    ? svgScale(Math.max(vb.w, vb.h), units, scale, uiScale)
    : svgScale(800, "um", scale, uiScale);
  const sz = vb
    ? Math.max(vb.w, vb.h) * sc
    : 0.8 * MM_TO_PX * scale * uiScale;

  // ── Hit area calculation ──────────────────────────────────────────────────
  const vbOffX = vb ? (vb.x + vb.w / 2) * sc : 0;
  const vbOffY = vb ? -(vb.y + vb.h / 2) * sc : 0;
  const hitW = Math.max(MIN_HIT, sz + HIT_PAD * 2);
  const hitH = hitW;
  // ─────────────────────────────────────────────────────────────────────────

  const { px, py } = w2s(placement.x, placement.y),
    half = sz / 2;

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
      {/* Large invisible hit area — generous padding, easy to click anywhere
          near the component. fill="transparent" (NOT "none") so it remains
          a valid pointer target. */}
      <rect
        x={vbOffX - hitW / 2}
        y={vbOffY - hitH / 2}
        width={hitW}
        height={hitH}
        fill="transparent"
        stroke="none"
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditingName(true);
        }}
      />
      {selected && (
        <rect
          x={vbOffX - hitW / 2 + 4}
          y={vbOffY - hitH / 2 + 4}
          width={hitW - 8}
          height={hitH - 8}
          rx={6}
          fill="none"
          stroke="var(--primary)"
          strokeOpacity={0.5}
          strokeWidth={2}
          strokeDasharray="3 2"
          style={{ pointerEvents: "none" }}
        />
      )}
      {!selected && (
        <rect
          x={vbOffX - hitW / 2 + 4}
          y={vbOffY - hitH / 2 + 4}
          width={hitW - 8}
          height={hitH - 8}
          rx={6}
          fill="none"
          stroke="var(--primary)"
          strokeOpacity={0}
          strokeWidth={1.5}
          className="hover:[stroke-opacity:0.2]"
          style={{ pointerEvents: "none" }}
        />
      )}
      {editingName && (
        <foreignObject x={-60} y={half + 4} width={120} height={22} style={{ pointerEvents: "auto" }}>
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
      )}
      {pins.map((pin) => {
        const cx = pin.hint.x * sc,
          cy = -pin.hint.y * sc;
        return (
          <g key={pin.name}>
            {/* Larger invisible pin hit target so pins are easy to click too */}
            <circle
              cx={cx}
              cy={cy}
              r={10}
              fill="transparent"
              className="cursor-crosshair"
              onPointerDown={(e) => {
                e.stopPropagation();
                onPinClick(pin.name);
              }}
            />
            <circle
              cx={cx}
              cy={cy}
              r={3.5}
              fill={selected ? "var(--primary)" : "var(--muted-foreground)"}
              stroke="var(--background)"
              strokeWidth={1}
              style={{ pointerEvents: "none" }}
            />
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
  visible,
  onPan,
  onClose,
}: {
  placements: Placement[];
  connections: Connection[];
  selection: Selection;
  size: { w: number; h: number };
  cx: number;
  cy: number;
  scale: number;
  visible: boolean;
  onPan: (x: number, y: number) => void;
  onClose: () => void;
}) {
  const W = 160;
  const H = 100;
  const PAD = 4;
  const mapScale = Math.min((W - PAD * 2) / CHIP_W_MM, (H - PAD * 2) / CHIP_H_MM);
  const ox = (W - CHIP_W_MM * mapScale) / 2;
  const oy = (H - CHIP_H_MM * mapScale) / 2;

  // Draggable panel position
  const panelRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; origLeft: number; origTop: number } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

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

  const onSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const wx = (sx - ox) / mapScale - CHIP_HALF_W;
    const wy = -(sy - H + oy) / mapScale - CHIP_HALF_H;
    onPan(-wx * MM_TO_PX * scale + size.w / 2, -wy * MM_TO_PX * scale + size.h / 2);
  };

  const onDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only drag from the header bar, not the SVG
    if ((e.target as HTMLElement).closest("svg, button")) return;
    e.preventDefault();
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    dragState.current = { startX: e.clientX, startY: e.clientY, origLeft: rect.left, origTop: rect.top };

    const onMove = (me: MouseEvent) => {
      if (!dragState.current) return;
      const dx = me.clientX - dragState.current.startX;
      const dy = me.clientY - dragState.current.startY;
      setPos({ left: dragState.current.origLeft + dx, top: dragState.current.origTop + dy });
    };
    const onUp = () => {
      dragState.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const panelStyle: React.CSSProperties = pos
    ? { position: "fixed", left: pos.left, top: pos.top, right: "auto", bottom: "auto" }
    : { position: "absolute", top: 12, right: 12 };

  return (
    <div
      ref={panelRef}
      onMouseDown={onDragStart}
      style={{
        ...panelStyle,
        width: W + 2,       // +2 for border
        opacity: visible ? 1 : 0,
        transform: visible ? "translateX(0) scale(1)" : "translateX(24px) scale(0.95)",
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity 220ms ease, transform 220ms ease",
        zIndex: 50,
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--card)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        backdropFilter: "blur(8px)",
        cursor: "grab",
        userSelect: "none",
      }}
      aria-hidden={!visible}
    >
      {/* Drag handle / header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "3px 4px 2px 7px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", letterSpacing: "0.03em", lineHeight: 1.4 }}>
          TOP VIEW
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 18, height: 18, borderRadius: 4, border: "none",
            background: "transparent", cursor: "pointer", color: "var(--muted-foreground)",
            transition: "background 150ms",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "var(--destructive)/10")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          title="Close Top View"
          aria-label="Close Top View panel"
        >
          <X style={{ width: 10, height: 10 }} />
        </button>
      </div>

      {/* SVG map */}
      <div style={{ padding: 2 }}>
        <svg
          width={W}
          height={H}
          style={{ display: "block", cursor: "crosshair" }}
          role="img"
          aria-label="Mini-map overview"
          onClick={onSvgClick}
          onMouseDown={e => e.stopPropagation()}  // prevent drag when clicking map
        >
          {/* Chip bounds */}
          <rect
            x={ox} y={oy}
            width={CHIP_W_MM * mapScale} height={CHIP_H_MM * mapScale}
            fill="var(--muted)" stroke="var(--border)" strokeWidth={1} rx={2}
          />
          {/* Connections */}
          {connections.map((c) => {
            const pa_ = placements.find((p) => p.id === c.from.placementId);
            const pb_ = placements.find((p) => p.id === c.to.placementId);
            if (!pa_ || !pb_) return null;
            const pa = w2m(pa_.x, pa_.y);
            const pb = w2m(pb_.x, pb_.y);
            return (
              <line key={c.id} x1={pa.mx} y1={pa.my} x2={pb.mx} y2={pb.my}
                stroke="var(--border)" strokeWidth={0.5} opacity={0.5} />
            );
          })}
          {/* Placements */}
          {placements.map((p) => {
            const { mx, my } = w2m(p.x, p.y);
            const isSel = selSet.has(p.id);
            return (
              <circle key={p.id} cx={mx} cy={my} r={isSel ? 2.5 : 1.5}
                fill={isSel ? "var(--primary)" : "var(--foreground)"}
                opacity={isSel ? 1 : 0.5} />
            );
          })}
          {/* Viewport rectangle */}
          <rect
            x={Math.min(a.mx, b.mx)} y={Math.min(a.my, b.my)}
            width={Math.abs(b.mx - a.mx)} height={Math.abs(b.my - a.my)}
            fill="none" stroke="var(--primary)" strokeWidth={1} opacity={0.6}
            pointerEvents="none"
          />
        </svg>
      </div>
    </div>
  );
}