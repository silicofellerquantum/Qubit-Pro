/**
 * useDropHandling
 *
 * Drag-over preview and drop-to-place logic extracted from EditorCanvas.
 * Returns event handlers and `dropPrev` state for rendering a DropGhost.
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

export interface DropHandlingResult {
  dropPrev: { componentId: string; x: number; y: number } | null;
  onDrop: (e: React.DragEvent, svgRef: React.RefObject<SVGSVGElement | null>, s2w: (px: number, py: number) => { x: number; y: number }, snap: number, compsById: Map<string, any>, uniqueName: (prefix: string) => string) => void;
  onDragOver: (e: React.DragEvent<SVGSVGElement>, svgRef: React.RefObject<SVGSVGElement | null>, s2w: (px: number, py: number) => { x: number; y: number }, snap: number) => void;
  onDragLeave: (e: React.DragEvent) => void;
}

export function useDropHandling(dispatch: Dispatch): DropHandlingResult {
  const qc = useQueryClient();
  const [dropPrev, setDropPrev] = useState<{ componentId: string; x: number; y: number } | null>(null);

  const snapAndConstrain = (raw: { x: number; y: number }, snap: number) => ({
    x: Math.max(-CHIP_HALF_W, Math.min(CHIP_HALF_W, parseFloat((Math.round(raw.x / snap) * snap).toFixed(3)))),
    y: Math.max(-CHIP_HALF_H, Math.min(CHIP_HALF_H, parseFloat((Math.round(raw.y / snap) * snap).toFixed(3)))),
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
    if (!summary) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const { x, y } = snapAndConstrain(s2w(e.clientX - rect.left, e.clientY - rect.top), snap);

    const queryKey = ["bridge", "components", cid, "metadata"] as const;
    const cachedMetadata = qc.getQueryData<ComponentMetadata>(queryKey);
    let params: Record<string, string | number> = {};

    if (cachedMetadata) {
      params = defaultParamsFromMetadata(cachedMetadata);
    } else {
      const catalogEntry = QISKIT_CATALOG.find((c) => c.className === cid);
      if (catalogEntry) {
        params = Object.fromEntries(Object.entries(catalogEntry.defaultParams).map(([k, v]) => [k, String(v)]));
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
            dispatch({ type: "UPDATE_PLACEMENT", id: placementId, patch: { params: defaultParamsFromMetadata(metaRes.data) } });
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
