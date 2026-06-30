/**
 * feedline-geometry.ts
 *
 * Pure geometry utilities for the native Feedline component.
 *
 * All coordinates are in mm (world units) unless stated otherwise.
 *
 * Used by:
 *  - The canvas drag handler (resonator-to-feedline snapping)
 *  - The codegen bridge adapter (computing attachment points for export)
 *  - The import reconstructor (detecting LaunchPad→RouteStraight→LaunchPad)
 */

import type { Feedline, FeedlineAttachment } from "@/lib/bridge/types";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SnapResult {
    feedlineId: string;
    /** Which segment index (always 0 for straight feedlines) */
    segmentIndex: number;
    /** Normalised position [0–1] along the segment */
    t: number;
    /** World-space attachment point */
    x: number;
    y: number;
    /** Perpendicular distance from the point to the feedline (mm) */
    dist: number;
}

// ── Core geometry ──────────────────────────────────────────────────────────────

/**
 * Project a world point (px, py) onto the line segment (x1,y1)→(x2,y2).
 * Returns the clamped parameter t ∈ [0,1] and the projection coordinates.
 */
export function projectPointOnSegment(
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
): { t: number; projX: number; projY: number; dist: number } {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq < 1e-12) {
        // Degenerate segment — return start point
        const d = Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
        return { t: 0, projX: x1, projY: y1, dist: d };
    }
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const dist = Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
    return { t, projX, projY, dist };
}

/**
 * Find the nearest snap point on all feedlines for a given world coordinate.
 *
 * @param px          World x of the resonator connection pin (mm)
 * @param py          World y of the resonator connection pin (mm)
 * @param feedlines   All feedlines in the design
 * @param threshold   Maximum snap distance in mm (default 1.5 mm)
 * @returns Nearest SnapResult, or null if nothing is within threshold
 */
export function findNearestFeedlineSnap(
    px: number,
    py: number,
    feedlines: Feedline[],
    threshold = 1.5,
): SnapResult | null {
    let best: SnapResult | null = null;

    for (const fl of feedlines) {
        // Only one segment for straight feedlines
        const { t, projX, projY, dist } = projectPointOnSegment(
            px,
            py,
            fl.x1,
            fl.y1,
            fl.x2,
            fl.y2,
        );
        if (dist < threshold && (best === null || dist < best.dist)) {
            best = {
                feedlineId: fl.id,
                segmentIndex: 0,
                t,
                x: projX,
                y: projY,
                dist,
            };
        }
    }

    return best;
}

/**
 * Compute the world-space attachment point for an existing FeedlineAttachment.
 * Used during export to determine where the resonator's RouteMeander terminates.
 */
export function computeAttachmentPoint(
    feedline: Feedline,
    attachment: FeedlineAttachment,
): { x: number; y: number } {
    const { x1, y1, x2, y2 } = feedline;
    const t = Math.max(0, Math.min(1, attachment.t));
    return {
        x: x1 + (x2 - x1) * t,
        y: y1 + (y2 - y1) * t,
    };
}

/**
 * Compute the total length of a feedline in mm.
 */
export function feedlineLength(fl: Feedline): number {
    const dx = fl.x2 - fl.x1;
    const dy = fl.y2 - fl.y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute the normal (perpendicular) unit vector of a feedline.
 * Returns {nx, ny} pointing "up" (i.e. rotated 90° CCW from the feedline direction).
 */
export function feedlineNormal(fl: Feedline): { nx: number; ny: number } {
    const dx = fl.x2 - fl.x1;
    const dy = fl.y2 - fl.y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-9) return { nx: 0, ny: 1 };
    return { nx: -dy / len, ny: dx / len };
}

/**
 * Determine the resonator coupling orientation relative to the feedline.
 * The resonator is assumed to sit on the side from which `py` arrives relative
 * to the feedline's own y-coordinate at the attachment point.
 */
export function computeResonatorOrientation(
    fl: Feedline,
    snap: SnapResult,
    resonatorY: number,
): FeedlineAttachment["orientation"] {
    const { nx, ny } = feedlineNormal(fl);
    // Project (resonatorY - snap.y) onto the normal
    const side = (resonatorY - snap.y) * ny + (0) * nx;
    // For horizontal feedlines: ny > 0 → resonator above → "up"; below → "down"
    if (Math.abs(ny) >= Math.abs(nx)) {
        return side >= 0 ? "up" : "down";
    }
    return side >= 0 ? "right" : "left";
}

// ── Import round-trip pattern detection ───────────────────────────────────────

export interface FeedlinePattern {
    /** Name of the start LaunchPad component in the generated code */
    launchpadStartName: string;
    /** Name of the RouteStraight component */
    routeName: string;
    /** Name of the end LaunchPad component */
    launchpadEndName: string;
}

/**
 * Detect LaunchPad → RouteStraight → LaunchPad patterns inside a list of
 * Qiskit Metal component names (as returned by design.components after rebuild).
 *
 * A feedline pattern is:
 *   - two LaunchpadWirebond* instances
 *   - one RouteStraight whose pin_inputs connects both of them
 *
 * Returns an array of matched patterns.
 */
export function detectFeedlinePatterns(
    components: Array<{ name: string; className: string; options?: Record<string, unknown> }>,
    routes: Array<{
        name: string;
        className: string;
        startComponent?: string;
        endComponent?: string;
    }>,
): FeedlinePattern[] {
    const launchpads = new Set(
        components
            .filter((c) =>
                c.className?.startsWith("LaunchpadWirebond") ||
                c.className?.startsWith("Launchpad"),
            )
            .map((c) => c.name),
    );

    const patterns: FeedlinePattern[] = [];

    for (const route of routes) {
        if (!route.className?.startsWith("RouteStraight")) continue;
        const startComp = route.startComponent ?? "";
        const endComp = route.endComponent ?? "";
        if (launchpads.has(startComp) && launchpads.has(endComp)) {
            patterns.push({
                launchpadStartName: startComp,
                routeName: route.name,
                launchpadEndName: endComp,
            });
        }
    }

    return patterns;
}
