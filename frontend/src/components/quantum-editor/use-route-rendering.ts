/**
 * useRouteRendering
 *
 * Per-route incremental rendering logic extracted from EditorCanvas:
 *   - Computes geometry hashes for each connection
 *   - Fires per-route render queries only when hash changes
 *   - Auto-caches fresh SVG back into design state
 *   - Returns `routeSvg` map and `routeQueries` array
 */

import { useEffect, useMemo, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import { bridgeClient } from "@/lib/bridge/client";
import type { EditorState } from "@/lib/editor/design-store";

type Dispatch = (action: any) => void;

export interface RouteRenderingResult {
  routeQueries: ReturnType<typeof useQueries>;
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
      if (!fromP || !toP) { m.set(c.id, "none"); return; }
      m.set(
        c.id,
        `${fromP.x.toFixed(6)},${fromP.y.toFixed(6)}:${c.from.pinName}:${toP.x.toFixed(6)},${toP.y.toFixed(6)}:${c.to.pinName}:${JSON.stringify(c.routeOverrides ?? {})}`,
      );
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
    state.connections.forEach((c, i) => { m.set(c.id, routeQueries[i]); });
    return m;
  }, [state.connections, routeQueries]);

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
