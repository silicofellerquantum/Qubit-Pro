/**
 * feedline-canvas.tsx
 *
 * SVG rendering for the native Feedline component.
 *
 * Visual design matches the reference image:
 *   • Thick dark CPW ground rail (black bar)
 *   • Bright gold/yellow centre conductor running through it
 *   • Large filled gold circles at each LaunchPad endpoint
 *   • Name label centred above the line (always visible, not just on select)
 *   • Resonator attachment dots (emerald) along the line
 *   • On select: glow halo + white resize handles at endpoints
 *
 * Interaction:
 *   • Click body            → select
 *   • Drag body             → move entire feedline (both endpoints)
 *   • Drag endpoint circle  → resize one end
 *   • Delete key            → DELETE_FEEDLINE (handled in schematic-editor.tsx)
 */

import { useCallback, useRef, useState } from "react";
import type { Feedline } from "@/lib/bridge/types";
import { MM_TO_PX } from "./use-canvas-viewport";

// ─── Visual sizing ────────────────────────────────────────────────────────────
// All values in screen-pixels. Fixed size so the feedline is always readable
// regardless of zoom level.

/** Half-height of the dark CPW ground rail bar */
const RAIL_HALF_H = 10;
/** Width of the gold centre conductor line */
const CONDUCTOR_W = 6;
/** Radius of the LaunchPad endpoint circles */
const LP_RADIUS = 14;
/** Radius of the resize handle ring (shown when selected) */
const HANDLE_RING = 18;
/** Radius of resonator snap dots */
const SNAP_R = 6;

// ─── Colours ──────────────────────────────────────────────────────────────────
const C_RAIL = "#1a1a2e";   // very dark navy — the CPW ground bar
const C_RAIL_SEL = "#0f172a";   // slightly darker when selected
const C_CONDUCTOR = "#f5c518";   // bright gold — centre conductor
const C_CONDUCTOR_SEL = "#ffe066";   // lighter gold when selected
const C_LP = "#f5c518";   // LaunchPad circles same gold
const C_LP_STROKE = "#b45309";   // dark amber ring around pads
const C_LP_SEL = "#ffe066";
const C_HANDLE_FILL = "#ffffff";
const C_HANDLE_STROKE = "#f5c518";
const C_SNAP = "#34d399";   // emerald — resonator attachment
const C_SNAP_STROKE = "#064e3b";
const C_LABEL = "#1a1a2e";   // dark text
const C_LABEL_STROKE = "rgba(255,255,255,0.85)";
const C_GLOW = "rgba(245,197,24,0.30)";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FeedlineGlyphProps {
    feedline: Feedline;
    isSelected: boolean;
    w2s: (x: number, y: number) => { px: number; py: number };
    scale: number;
    onSelect: (id: string) => void;
    onMoveStart: (id: string, x1: number, y1: number) => void;
    onMoveEnd: (id: string, x2: number, y2: number) => void;
    onMove: (id: string, dx: number, dy: number) => void;
    onCommitStart: (id: string, x1: number, y1: number) => void;
    onCommitEnd: (id: string, x2: number, y2: number) => void;
}

type DragTarget = "body" | "start" | "end";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function lerp(ax: number, ay: number, bx: number, by: number, t: number) {
    return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FeedlineGlyph({
    feedline,
    isSelected,
    w2s,
    scale,
    onSelect,
    onMoveStart,
    onMoveEnd,
    onMove,
    onCommitStart,
    onCommitEnd,
}: FeedlineGlyphProps) {
    const { id, x1, y1, x2, y2, name, attachedResonators } = feedline;

    const a = w2s(x1, y1);
    const b = w2s(x2, y2);

    // Line direction & normal (for the rail polygon)
    const dsx = b.px - a.px;
    const dsy = b.py - a.py;
    const len = Math.sqrt(dsx * dsx + dsy * dsy);
    const ux = len > 0 ? dsx / len : 1;
    const uy = len > 0 ? dsy / len : 0;
    const nx = -uy;   // perpendicular (rotated 90° CCW)
    const ny = ux;

    // Rail polygon corners (thick bar around the conductor)
    const rh = RAIL_HALF_H;
    const railPts = [
        `${a.px + nx * rh},${a.py + ny * rh}`,
        `${b.px + nx * rh},${b.py + ny * rh}`,
        `${b.px - nx * rh},${b.py - ny * rh}`,
        `${a.px - nx * rh},${a.py - ny * rh}`,
    ].join(" ");

    const midX = (a.px + b.px) / 2;
    const midY = (a.py + b.py) / 2;

    const railColour = isSelected ? C_RAIL_SEL : C_RAIL;
    const conductorColour = isSelected ? C_CONDUCTOR_SEL : C_CONDUCTOR;
    const lpColour = isSelected ? C_LP_SEL : C_LP;

    // ── Drag state ──────────────────────────────────────────────────────────────
    const dragRef = useRef<{
        target: DragTarget;
        mx0: number; my0: number;
        wx1: number; wy1: number;
        wx2: number; wy2: number;
    } | null>(null);
    const [dragging, setDragging] = useState(false);

    const toWorld = (dpx: number, dpy: number) => ({
        dx: dpx / (MM_TO_PX * scale),
        dy: -dpy / (MM_TO_PX * scale),
    });

    const onPointerDown = useCallback(
        (target: DragTarget, e: React.PointerEvent<SVGElement>) => {
            e.stopPropagation();
            onSelect(id);
            (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
            dragRef.current = {
                target, mx0: e.clientX, my0: e.clientY,
                wx1: x1, wy1: y1, wx2: x2, wy2: y2
            };
            setDragging(true);
        },
        [id, x1, y1, x2, y2, onSelect],
    );

    const onPointerMove = useCallback(
        (e: React.PointerEvent<SVGElement>) => {
            if (!dragRef.current) return;
            const dr = dragRef.current;
            const { dx, dy } = toWorld(e.clientX - dr.mx0, e.clientY - dr.my0);
            if (dr.target === "body") onMove(id, dx, dy);
            else if (dr.target === "start") onMoveStart(id, dr.wx1 + dx, dr.wy1 + dy);
            else onMoveEnd(id, dr.wx2 + dx, dr.wy2 + dy);
        },
        [id, scale, onMove, onMoveStart, onMoveEnd],
    );

    const onPointerUp = useCallback(
        (e: React.PointerEvent<SVGElement>) => {
            if (!dragRef.current) return;
            const dr = dragRef.current;
            const { dx, dy } = toWorld(e.clientX - dr.mx0, e.clientY - dr.my0);
            if (dr.target === "start") onCommitStart(id, dr.wx1 + dx, dr.wy1 + dy);
            else if (dr.target === "end") onCommitEnd(id, dr.wx2 + dx, dr.wy2 + dy);
            dragRef.current = null;
            setDragging(false);
        },
        [id, scale, onCommitStart, onCommitEnd],
    );

    return (
        <g data-feedline-id={id} style={{ cursor: dragging ? "grabbing" : "default" }}>

            {/* ── Selection glow halo ───────────────────────────────────────────── */}
            {isSelected && (
                <polygon
                    points={[
                        `${a.px + nx * (rh + 8)},${a.py + ny * (rh + 8)}`,
                        `${b.px + nx * (rh + 8)},${b.py + ny * (rh + 8)}`,
                        `${b.px - nx * (rh + 8)},${b.py - ny * (rh + 8)}`,
                        `${a.px - nx * (rh + 8)},${a.py - ny * (rh + 8)}`,
                    ].join(" ")}
                    fill={C_GLOW}
                    pointerEvents="none"
                />
            )}

            {/* ── Dark CPW ground rail ──────────────────────────────────────────── */}
            <polygon
                points={railPts}
                fill={railColour}
                rx={4}
                pointerEvents="none"
            />

            {/* ── Gold centre conductor ─────────────────────────────────────────── */}
            <line
                x1={a.px} y1={a.py} x2={b.px} y2={b.py}
                stroke={conductorColour}
                strokeWidth={CONDUCTOR_W}
                strokeLinecap="round"
                pointerEvents="none"
            />

            {/* ── Transparent wide hit area ─────────────────────────────────────── */}
            <polygon
                points={railPts}
                fill="transparent"
                style={{ cursor: dragging ? "grabbing" : "grab" }}
                onPointerDown={(e) => onPointerDown("body", e)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
            />

            {/* ── LaunchPad A — filled gold circle ─────────────────────────────── */}
            <circle
                cx={a.px} cy={a.py} r={LP_RADIUS}
                fill={lpColour}
                stroke={C_LP_STROKE}
                strokeWidth={2.5}
                pointerEvents="none"
            />
            {/* LaunchPad A inner dot */}
            <circle cx={a.px} cy={a.py} r={LP_RADIUS * 0.35}
                fill={C_LP_STROKE} pointerEvents="none" />

            {/* ── LaunchPad B — filled gold circle ─────────────────────────────── */}
            <circle
                cx={b.px} cy={b.py} r={LP_RADIUS}
                fill={lpColour}
                stroke={C_LP_STROKE}
                strokeWidth={2.5}
                pointerEvents="none"
            />
            <circle cx={b.px} cy={b.py} r={LP_RADIUS * 0.35}
                fill={C_LP_STROKE} pointerEvents="none" />

            {/* ── Endpoint resize handles (always shown, ring style) ───────────── */}
            <circle
                cx={a.px} cy={a.py} r={HANDLE_RING}
                fill={isSelected ? "rgba(245,197,24,0.15)" : "transparent"}
                stroke={isSelected ? C_HANDLE_STROKE : "transparent"}
                strokeWidth={1.5}
                strokeDasharray={isSelected ? "none" : "4 2"}
                style={{ cursor: "ew-resize" }}
                onPointerDown={(e) => onPointerDown("start", e)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
            />
            <circle
                cx={b.px} cy={b.py} r={HANDLE_RING}
                fill={isSelected ? "rgba(245,197,24,0.15)" : "transparent"}
                stroke={isSelected ? C_HANDLE_STROKE : "transparent"}
                strokeWidth={1.5}
                style={{ cursor: "ew-resize" }}
                onPointerDown={(e) => onPointerDown("end", e)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
            />

            {/* ── Resonator attachment dots ─────────────────────────────────────── */}
            {attachedResonators.map((att) => {
                const pt = lerp(a.px, a.py, b.px, b.py, att.t);
                return (
                    <g key={att.resonatorId} pointerEvents="none">
                        <circle cx={pt.x} cy={pt.y} r={SNAP_R + 3}
                            fill="none" stroke={C_SNAP} strokeWidth={1.5} strokeOpacity={0.6} />
                        <circle cx={pt.x} cy={pt.y} r={SNAP_R}
                            fill={C_SNAP} stroke={C_SNAP_STROKE} strokeWidth={1} />
                    </g>
                );
            })}

            {/* ── Name label — always visible, centred above the line ──────────── */}
            {len > 30 && (
                <text
                    x={midX}
                    y={a.py - rh - 6}
                    textAnchor="middle"
                    fontSize={12}
                    fontFamily="ui-monospace, monospace"
                    fontWeight="bold"
                    fill={C_LABEL}
                    stroke={C_LABEL_STROKE}
                    strokeWidth={3}
                    paintOrder="stroke"
                    pointerEvents="none"
                    letterSpacing="0.04em"
                >
                    {name}
                </text>
            )}
        </g>
    );
}

// ─── Snap indicator ────────────────────────────────────────────────────────────

export interface FeedlineSnapPoint {
    feedlineId: string;
    sx: number;
    sy: number;
}

export function FeedlineSnapIndicator({ point }: { point: FeedlineSnapPoint }) {
    return (
        <g pointerEvents="none">
            <circle cx={point.sx} cy={point.sy} r={14}
                fill="none" stroke={C_SNAP} strokeWidth={2.5} strokeDasharray="4 2"
                opacity={0.9} />
            <circle cx={point.sx} cy={point.sy} r={4} fill={C_SNAP} />
        </g>
    );
}
