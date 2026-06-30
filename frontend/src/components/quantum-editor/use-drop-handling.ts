/**
 * useDropHandling
 *
 * Drag-over preview and drop-to-place logic extracted from EditorCanvas.
 * Returns event handlers and `dropPrev` state for rendering a DropGhost.
 *
 * Special handling: when a "Feedline" component is dropped, instead of
 * creating a single placement, dispatches ADD_FEEDLINE_PRESET which
 * atomically creates:
 *   • LaunchpadWirebond (start) — named "T0", "T1", etc.
 *   • LaunchpadWirebond (end)   — named "L0", "L1", etc.
 *   • RouteStraight connection between their tie pins
 * These are real editor placements — they look and behave exactly like
 * the T0/L1 pair in the reference image.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { prefixForCategory } from "@/lib/editor/design-store";
import { defaultParamsFromMetadata } from "@/lib/bridge/adapters";
import { bridgeClient } from "@/lib/bridge/client";
import type { ComponentMetadata } from "@/lib/bridge/types";
import { QISKIT_CATALOG } from "./qiskit-metal-catalog";
import { CHIP_HALF_W, CHIP_HALF_H } from "./use-canvas-viewport";

type Dispatch = (action: any) => void;

/** Default feedline half-length in mm (total 8 mm → ±4 mm from centre) */
const DEFAULT_FEEDLINE_HALF_LEN_MM = 4.0;

export interface DropHandlingResult {
  dropPrev: { componentId: string; x: number; y: number } | null;
  onDrop: (e: React.DragEvent, svgRef: React.RefObject<SVGSVGElement | null>, s2w: (px: number, py: number) => { x: number; y: number }, snap: number, compsById: Map<string, any>, uniqueName: (prefix: string) => string) => void;
  onDragOver: (e: React.DragEvent<SVGSVGElement>, svgRef: React.RefObject<SVGSVGElement | null>, s2w: (px: number, py: number) => { x: number; y: number }, snap: number) => void;
  onDragLeave: (e: React.DragEvent) => void;
}

export function useDropHandling(dispatch: Dispatch, chipHalfW = 20, chipHalfH = 20): DropHandlingResult {
  const qc = useQueryClient();
  const [dropPrev, setDropPrev] = useState<{ componentId: string; x: number; y: number } | null>(null);

  const snapAndConstrain = (raw: { x: number; y: number }, snap: number) => ({
    x: Math.max(-chipHalfW, Math.min(chipHalfW, parseFloat((Math.round(raw.x / snap) * snap).toFixed(3)))),
    y: Math.max(-chipHalfH, Math.min(chipHalfH, parseFloat((Math.round(raw.y / snap) * snap).toFixed(3)))),
  });

  const onDrop = (
    e: React.DragEvent,
    svgRef: React.RefObject<SVGSVGElement | null>,
    s2w: (px: number, py: number) => { x: number; y: number },
    snap: number,
    compsById: Map<string, any>,
    uniqueName: (prefix: string) => string,
  ) => {
    e.preventDefault();
    setDropPrev(null);
    const cid = e.dataTransfer.getData("application/x-silicofeller-component");
    if (!cid) return;
    const summary = compsById.get(cid);
    // Feedline is an editor-only abstraction — it may not be in the backend bridge
    // catalog, so we allow it even when summary is undefined.
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { x, y } = snapAndConstrain(s2w(e.clientX - rect.left, e.clientY - rect.top), snap);

    // ── Native Feedline: create 2 LaunchpadWirebond placements + 1 RouteStraight ──
    // This produces real editor placements identical to T0/L1 in the image.
    if (cid === "Feedline") {
      const ts = Date.now();

      // uniqueName reads the current state — both calls use the same snapshot
      // so "T" and "L" get independent counters and can't clash with each other.
      const nameA = uniqueName("T");
      const nameB = uniqueName("L");

      const idA = `pl_LaunchpadWirebond_${nameA}_${ts}`;
      const idB = `pl_LaunchpadWirebond_${nameB}_${ts + 1}`;

      const halfLen = DEFAULT_FEEDLINE_HALF_LEN_MM;
      const xA = Math.max(-chipHalfW, x - halfLen);
      const xB = Math.min(chipHalfW, x + halfLen);

      // LaunchPad A — left end, faces right (tie pin points inward)
      const lpA = {
        id: idA,
        componentId: "LaunchpadWirebond",
        name: nameA,
        x: xA,
        y,
        rotation: 0,
        params: {
          trace_width: "10um",
          trace_gap: "6um",
          pad_width: "80um",
          pad_height: "80um",
          lead_length: "25um",
        },
      };

      // LaunchPad B — right end, faces left (rotation 180, tie pin points inward)
      const lpB = {
        id: idB,
        componentId: "LaunchpadWirebond",
        name: nameB,
        x: xB,
        y,
        rotation: 180,
        params: {
          trace_width: "10um",
          trace_gap: "6um",
          pad_width: "80um",
          pad_height: "80um",
          lead_length: "25um",
        },
      };

      // RouteStraight wiring the two tie pins — this is the CPW body
      const connId = `conn_${nameA}_tie__${nameB}_tie_${ts}`;
      const connection = {
        id: connId,
        from: { placementId: idA, pinName: "tie" },
        to: { placementId: idB, pinName: "tie" },
        routeComponentId: "RouteStraight",
        routeOverrides: {
          trace_width: "10um",
          trace_gap: "6um",
        },
      };

      dispatch({ type: "ADD_FEEDLINE_PRESET", lpA, lpB, connection });

      try {
        const recent = JSON.parse(localStorage.getItem("sf_recent_components") || "[]") as string[];
        localStorage.setItem(
          "sf_recent_components",
          JSON.stringify([cid, ...recent.filter((id) => id !== cid)].slice(0, 10)),
        );
      } catch { /* ignore */ }
      return;
    }

    // ── Regular component: dispatch ADD_PLACEMENT ───────────────────────────
    if (!summary) return;

    const queryKey = ["bridge", "components", cid, "metadata"] as const;
    const cachedMetadata = qc.getQueryData<ComponentMetadata>(queryKey);
    let params: Record<string, string | number> = {};

    const catalogEntry = QISKIT_CATALOG.find((c) => c.className === cid);
    const getMergedParams = (base: Record<string, any>) => {
      if (!catalogEntry?.defaultParams) return base;
      return { ...base, ...catalogEntry.defaultParams };
    };

    if (cachedMetadata) {
      params = getMergedParams(defaultParamsFromMetadata(cachedMetadata));
    } else {
      if (catalogEntry) {
        params = getMergedParams({});
      }
    }

    const name = uniqueName(prefixForCategory(summary.category));
    const placementId = `pl_${name}_${Date.now()}`;

    dispatch({
      type: "ADD_PLACEMENT",
      placement: { id: placementId, componentId: cid, name, x, y, rotation: 0, params },
    });

    try {
      const recent = JSON.parse(localStorage.getItem("sf_recent_components") || "[]") as string[];
      localStorage.setItem("sf_recent_components", JSON.stringify([cid, ...recent.filter((id) => id !== cid)].slice(0, 10)));
    } catch { /* ignore */ }

    if (!cachedMetadata) {
      bridgeClient
        .getMetadata(cid)
        .then((metaRes) => {
          if (metaRes.data) {
            const baseParams = defaultParamsFromMetadata(metaRes.data);
            const mergedParams = getMergedParams(baseParams);
            dispatch({ type: "UPDATE_PLACEMENT", id: placementId, patch: { params: mergedParams } });
          }
        })
        .catch(console.error);
    }
  };

  const onDragOver = (
    e: React.DragEvent<SVGSVGElement>,
    svgRef: React.RefObject<SVGSVGElement | null>,
    s2w: (px: number, py: number) => { x: number; y: number },
    snap: number,
  ) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const cid = e.dataTransfer.types.includes("application/x-silicofeller-component")
      ? e.dataTransfer.getData("application/x-silicofeller-component")
      : "";
    const rect = svgRef.current?.getBoundingClientRect();
    if (!cid || !rect) return;
    const { x, y } = snapAndConstrain(s2w(e.clientX - rect.left, e.clientY - rect.top), snap);
    setDropPrev({ componentId: cid, x, y });
  };

  const onDragLeave = (e: React.DragEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && !(e.currentTarget as Element).contains(related)) {
      setDropPrev(null);
    }
  };

  return { dropPrev, onDrop, onDragOver, onDragLeave };
}
