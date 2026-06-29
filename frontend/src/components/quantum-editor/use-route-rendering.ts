/**
 * useRouteRendering
 *
 * Per-route incremental rendering logic extracted from EditorCanvas:
 *   - Computes geometry hashes for each connection
 *   - Fires per-route render queries only when hash changes
 *   - Auto-caches fresh SVG back into design state
 *   - Stores resolved Qiskit Metal options as routeOverrides so the
 *     code-export pipeline emits identical parameters (geometry parity Δ=0)
 *   - Returns `routeSvg` map and `routeQueries` array
 */

import { useEffect, useMemo, useRef } from "react";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { bridgeClient } from "@/lib/bridge/client";
import type { EditorState } from "@/lib/editor/design-store";
import type { RouteRender } from "@/lib/bridge/types";

type Dispatch = (action: any) => void;

interface RouteRenderData {
  svg: string;
  resolvedRouteOptions?: Record<string, unknown>;
  /** Exact Qiskit Metal path points (metres). Never round or snap these. */
  resolvedPathPoints?: Array<{ x: number; y: number }>;
}

export interface RouteRenderingResult {
  routeQueries: UseQueryResult<RouteRenderData, Error>[];
  routeSvg: Map<string, string>;
}

export function useRouteRendering(
  state: EditorState,
  doc: { placements: EditorState["placements"]; connections: EditorState["connections"] },
  drag: unknown,
  dispatch: Dispatch,
): RouteRenderingResult {
  const docRef = useRef(doc);
  docRef.current = doc;

  const stateRef = useRef(state);
  stateRef.current = state;

  const routeHashes = useMemo(() => {
    const m = new Map<string, string>();
    state.connections.forEach((c) => {
      const fromP = state.placements.find((p) => p.id === c.from.placementId);
      const toP = state.placements.find((p) => p.id === c.to.placementId);
      if (!fromP || !toP) {
        m.set(c.id, "none");
        return;
      }
      const overridesKey = JSON.stringify(
        Object.fromEntries(Object.entries(c.routeOverrides ?? {}).sort()),
      );
      m.set(
        c.id,
        `${fromP.x.toFixed(6)},${fromP.y.toFixed(6)},${fromP.rotation},${fromP.mirrorX ? 1 : 0}:${c.from.pinName}:${toP.x.toFixed(6)},${toP.y.toFixed(6)},${toP.rotation},${toP.mirrorX ? 1 : 0}:${c.to.pinName}:${overridesKey}`,
      );
    });
    return m;
  }, [state.connections, state.placements]);

  const needsRouteRender = useMemo(() => {
    const m = new Map<string, boolean>();
    state.connections.forEach((c) => {
      const hash = routeHashes.get(c.id) ?? "none";
      if (c.locked && c.cachedSvg) {
        m.set(c.id, false);
        return;
      }
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
          const data = r.data as RouteRender;
          return {
            svg: data.svg,
            resolvedRouteOptions: data.resolvedRouteOptions,
          };
        }),
      enabled:
        doc.placements.length > 0 &&
        !!c.routeComponentId &&
        needsRouteRender.get(c.id) === true &&
        !drag,
      staleTime: 0,
      placeholderData: (prev: any) => prev,
    })),
  });

  const routeQueriesById = useMemo(() => {
    const m = new Map<string, (typeof routeQueries)[number]>();
    state.connections.forEach((c, i) => {
      m.set(c.id, routeQueries[i]);
    });
    return m;
  }, [state.connections, routeQueries]);

  useEffect(() => {
    state.connections.forEach((c) => {
      const q = routeQueriesById.get(c.id);
      if (q?.data?.svg) {
        const expectedHash = routeHashes.get(c.id) ?? "none";
        if (c.cachedGeometryHash !== expectedHash) {
          // Cache the SVG geometry
          dispatch({
            type: "SET_CONNECTION_GEOMETRY",
            id: c.id,
            svg: q.data.svg,
            hash: expectedHash,
          });

          // ── Geometry parity: store resolved Qiskit Metal options as overrides ──
          // This ensures the code-export pipeline emits the exact same
          // total_length, fillet, lead, and meander values that the worker
          // used to produce this SVG — achieving Δ = 0 geometry.
          if (q.data.resolvedRouteOptions && Object.keys(q.data.resolvedRouteOptions).length > 0) {
            // Only write keys that are meaningful route params; skip internal ones
            const ROUTE_PARAM_KEYS = new Set([
              "total_length",
              "fillet",
              "lead",
              "meander",
              "trace_width",
              "trace_gap",
              "asymmetry",
              "snap",
            ]);
            const resolvedOverrides: Record<string, string | number> = {};
            for (const [k, v] of Object.entries(q.data.resolvedRouteOptions)) {
              if (!ROUTE_PARAM_KEYS.has(k)) continue;
              if (typeof v === "string" || typeof v === "number") {
                resolvedOverrides[k] = v;
              } else if (v !== null && typeof v === "object") {
                // Store nested dicts (e.g. lead, meander) as JSON strings;
                // codegen_service.py knows to parse them back as dict() calls
                resolvedOverrides[k] = JSON.stringify(v);
              }
            }
            if (Object.keys(resolvedOverrides).length > 0) {
              const existing = c.routeOverrides ?? {};
              // Merge: resolved options take precedence over stale user overrides
              // but do not overwrite user-intentional overrides that already exist
              // at higher specificity (i.e. non-default values they explicitly set).
              const merged = { ...resolvedOverrides, ...existing };
              // Always sync total_length and fillet from resolved — these are
              // the values that produced the visible geometry.
              if (resolvedOverrides["total_length"])
                merged["total_length"] = resolvedOverrides["total_length"];
              if (resolvedOverrides["fillet"]) merged["fillet"] = resolvedOverrides["fillet"];
              if (resolvedOverrides["lead"]) merged["lead"] = resolvedOverrides["lead"];
              dispatch({
                type: "UPDATE_CONNECTION",
                id: c.id,
                patch: { routeOverrides: merged },
              });
            }
          }
        }
      }
    });
  }, [routeQueriesById, routeHashes, state.connections, dispatch]);

  const routeSvg = useMemo(() => {
    const m = new Map<string, string>();
    state.connections.forEach((c) => {
      const needsRender = needsRouteRender.get(c.id) ?? false;
      if (!needsRender && c.cachedSvg) m.set(c.id, c.cachedSvg);
      const q = routeQueriesById.get(c.id);
      if (q?.data?.svg) m.set(c.id, q.data.svg);
    });
    return m;
  }, [state.connections, routeQueriesById, needsRouteRender]);

  return { routeQueries, routeSvg };
}
