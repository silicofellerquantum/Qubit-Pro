/**
 * editor-canvas-glyphs.tsx
 *
 * SVG sub-components extracted from EditorCanvas to reduce its size.
 *
 * Exports:
 *   PlacementPreview  — lightweight ghost preview while dragging
 *   DropGhost         — transparent drop target preview
 *   PlacementGlyph    — full interactive component glyph with pins, labels, selection ring
 *   MiniMap           — overview minimap with viewport rectangle
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { componentPreviewQueryOptions } from "@/lib/bridge/queries";
import type { Placement, Connection, PinSpec } from "@/lib/bridge/types";
import type { Selection } from "@/lib/editor/design-store";
import { cn } from "@/lib/utils";
import {
  CHIP_W_MM,
  CHIP_H_MM,
  CHIP_HALF_W,
  CHIP_HALF_H,
  MM_TO_PX,
} from "./use-canvas-viewport";

const UM_TO_MM = 0.001;

// ─────────────────────────────────────────────────────────────────────────────
// PlacementPreview
// ─────────────────────────────────────────────────────────────────────────────

export function PlacementPreview({
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
    const s = Math.max(36, 0.6 * MM_TO_PX * scale * uiScale), h = s / 2;
    return (
      <g transform={`translate(${px} ${py}) rotate(${-placement.rotation}) scale(${mx} 1)`}>
        <rect
          x={-h} y={-h} width={s} height={s} rx={4}
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
  // Correct: sc = target_px / max_svg_dim. SVG coords are raw (um or mm),
  // not pixels — no MM_TO_PX factor needed in the denominator.
  const maxDim = Math.max(vb.w, vb.h);
  const normSc = maxDim > 0 ? (40 * scale * uiScale) / maxDim : sc;
  return (
    <g transform={`translate(${px} ${py}) rotate(${-placement.rotation}) scale(${mx} 1)`}>
      <g
        transform={`scale(${normSc} ${-normSc}) translate(${-(vb.x + vb.w / 2)} ${-(vb.y + vb.h / 2)})`}
        dangerouslySetInnerHTML={{ __html: p.svg }}
        style={{ transition: "transform 0.12s ease" }}
      />
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DropGhost
// ─────────────────────────────────────────────────────────────────────────────

export function DropGhost({
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
    const s = Math.max(36, 0.6 * MM_TO_PX * scale), h = s / 2;
    return (
      <g className="pointer-events-none" transform={`translate(${px} ${py})`}>
        <rect
          x={-h} y={-h} width={s} height={s} rx={4}
          fill="color-mix(in oklab, var(--primary) 10%, transparent)"
          stroke="var(--primary)"
          strokeDasharray="5 4"
          strokeOpacity={0.65}
        />
      </g>
    );
  }
  const sc = scale * MM_TO_PX * (p.units === "um" ? UM_TO_MM : 1), vb = p.viewBox;
  const maxDim = Math.max(vb.w, vb.h);
  const ghostSc = maxDim > 0 ? (40 * scale) / maxDim : sc;
  return (
    <g className="pointer-events-none" opacity={0.72}>
      <g transform={`translate(${px} ${py})`}>
        <g
          transform={`scale(${ghostSc} ${-ghostSc}) translate(${-(vb.x + vb.w / 2)} ${-(vb.y + vb.h / 2)})`}
          dangerouslySetInnerHTML={{ __html: p.svg }}
        />
      </g>
      <circle cx={px} cy={py} r={4} fill="var(--primary)" stroke="var(--background)" strokeWidth={1.5} />
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PlacementGlyph
// ─────────────────────────────────────────────────────────────────────────────

export function PlacementGlyph({
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
  // sz = normalized screen size in px (same BASE_SCREEN_PX as PlacementPreview).
  // Raw SVG coords are in backend units — divide target_px by max_svg_dim directly.
  const maxSvgDim = vb ? Math.max(vb.w, vb.h) : 0;
  const sz = maxSvgDim > 0
    ? (40 * scale * uiScale)   // normalised to 40px like PlacementPreview
    : Math.max(28, 0.5 * MM_TO_PX * scale);
  const { px, py } = w2s(placement.x, placement.y), half = sz / 2;
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
        <rect x={-half - 6} y={-half - 6} width={sz + 12} height={sz + 12} rx={6}
          fill="none" stroke="var(--primary)" strokeOpacity={0.5} strokeWidth={2} strokeDasharray="3 2" />
      )}
      {!selected && hovered && (
        <rect x={-half - 6} y={-half - 6} width={sz + 12} height={sz + 12} rx={6}
          fill="none" stroke="var(--primary)" strokeOpacity={0.2} strokeWidth={1.5} />
      )}
      {overlapping && (
        <rect x={-half - 8} y={-half - 8} width={sz + 16} height={sz + 16} rx={6}
          fill="none" stroke="#ef4444" strokeOpacity={0.6} strokeWidth={2} strokeDasharray="4 2" />
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
            onBlur={(e) => { const v = e.target.value.trim(); if (v) onRename(v); setEditingName(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { const v = (e.currentTarget as HTMLInputElement).value.trim(); if (v) onRename(v); setEditingName(false); }
              else if (e.key === "Escape") { setEditingName(false); }
            }}
            className="h-5 w-full rounded border border-primary bg-background px-1 text-[10px] font-bold text-foreground outline-none"
            onClick={(e) => e.stopPropagation()}
          />
        </foreignObject>
      ) : (
        <text
          x={0} y={half + 14} textAnchor="middle" fontSize={10} fontWeight={700}
          fill="var(--foreground)" className="select-none cursor-text"
          onDoubleClick={(e) => { e.stopPropagation(); setEditingName(true); }}
        >
          {placement.name}
        </text>
      )}
      {showComponentIds && !editingName && (
        <text x={0} y={half + 26} textAnchor="middle" fontSize={8}
          fill="var(--muted-foreground)" className="select-none">
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
        const cx = pin.hint.x * UM_TO_MM * MM_TO_PX * scale;
        const cy = -pin.hint.y * UM_TO_MM * MM_TO_PX * scale;
        const iP = isPO && pendingPin === pin.name;
        return (
          <g key={pin.name}>
            <circle
              cx={cx} cy={cy} r={iP ? 5 : 3.5}
              fill={iP ? "var(--destructive)" : selected ? "var(--primary)" : "var(--muted-foreground)"}
              stroke="var(--background)" strokeWidth={1}
              className="cursor-crosshair"
              onPointerDown={(e) => { e.stopPropagation(); onPinClick(pin.name); }}
            />
            {selected && (
              <text x={cx + 6} y={cy + 3} fontSize={8} fill="var(--foreground)" fontWeight={700}
                className="pointer-events-none select-none">
                {pin.name}
              </text>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MiniMap
// ─────────────────────────────────────────────────────────────────────────────

export function MiniMap({
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
  const W = 160, H = 100, PAD = 4;
  const mapScale = Math.min((W - PAD * 2) / CHIP_W_MM, (H - PAD * 2) / CHIP_H_MM);
  const ox = (W - CHIP_W_MM * mapScale) / 2;
  const oy = (H - CHIP_H_MM * mapScale) / 2;

  const w2m = (wx: number, wy: number) => ({
    mx: ox + (wx + CHIP_HALF_W) * mapScale,
    my: H - (oy + (wy + CHIP_HALF_H) * mapScale),
  });

  const visLeft = (0 - cx) / (MM_TO_PX * scale);
  const visRight = (size.w - cx) / (MM_TO_PX * scale);
  const visTop = (0 - cy) / (MM_TO_PX * scale);
  const visBottom = (size.h - cy) / (MM_TO_PX * scale);
  const a = w2m(visLeft, visTop);
  const b = w2m(visRight, visBottom);
  const selSet = new Set(selection.filter((s) => s.kind === "placement").map((s) => s.id));

  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
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
        <rect x={ox} y={oy} width={CHIP_W_MM * mapScale} height={CHIP_H_MM * mapScale}
          fill="var(--muted)" stroke="var(--border)" strokeWidth={1} rx={2} />
        {connections.map((c) => {
          const pa = placements.find((p) => p.id === c.from.placementId);
          const pb = placements.find((p) => p.id === c.to.placementId);
          if (!pa || !pb) return null;
          const ma = w2m(pa.x, pa.y), mb = w2m(pb.x, pb.y);
          return <line key={c.id} x1={ma.mx} y1={ma.my} x2={mb.mx} y2={mb.my}
            stroke="var(--border)" strokeWidth={0.5} opacity={0.5} />;
        })}
        {placements.map((p) => {
          const { mx, my } = w2m(p.x, p.y);
          const isSel = selSet.has(p.id);
          return <circle key={p.id} cx={mx} cy={my} r={isSel ? 2.5 : 1.5}
            fill={isSel ? "var(--primary)" : "var(--foreground)"} opacity={isSel ? 1 : 0.5} />;
        })}
        <rect
          x={Math.min(a.mx, b.mx)} y={Math.min(a.my, b.my)}
          width={Math.abs(b.mx - a.mx)} height={Math.abs(b.my - a.my)}
          fill="none" stroke="var(--primary)" strokeWidth={1} opacity={0.6} pointerEvents="none"
        />
      </svg>
    </div>
  );
}
