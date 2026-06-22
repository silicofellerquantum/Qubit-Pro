import { queryOptions } from "@tanstack/react-query";
import { bridgeClient } from "./client";
import type { BridgeResult, DesignDocument } from "./types";

const DAY = 1000 * 60 * 60 * 24;
const WEEK = DAY * 7;

function unwrap<T>(r: BridgeResult<T>): T {
  if (r.error) throw new Error(r.error);
  return r.data as T;
}

export const componentsQueryOptions = () =>
  queryOptions({
    queryKey: ["bridge", "components"] as const,
    queryFn: async ({ signal }) => unwrap(await bridgeClient.listComponents(signal)),
    staleTime: DAY,
    gcTime: WEEK,
  });

export const componentMetadataQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["bridge", "components", id, "metadata"] as const,
    queryFn: async ({ signal }) => unwrap(await bridgeClient.getMetadata(id, signal)),
    staleTime: DAY,
    gcTime: WEEK,
    enabled: id.length > 0,
  });

export const componentPinsQueryOptions = (id: string, params?: Record<string, string | number>) => {
  const sortedParams = params
    ? Object.fromEntries(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)))
    : null;
  return queryOptions({
    queryKey: ["bridge", "components", id, "pins", sortedParams] as const,
    queryFn: async ({ signal }) => unwrap(await bridgeClient.getPins(id, params, signal)),
    staleTime: params ? 0 : DAY,
    gcTime: WEEK,
    enabled: id.length > 0,
  });
};

export const validateDesignQueryOptions = (doc: DesignDocument) =>
  queryOptions({
    queryKey: ["bridge", "validate", doc] as const,
    queryFn: async ({ signal }) => unwrap(await bridgeClient.validateDesign(doc, signal)),
    staleTime: 0,
    gcTime: 60_000,
    enabled: true,
  });

export const componentPreviewQueryOptions = (
  id: string,
  params?: Record<string, string | number>,
) => {
  // Normalize key order for consistent cache keys regardless of object construction order
  const sortedParams = params
    ? Object.fromEntries(Object.entries(params).sort(([a], [b]) => a.localeCompare(b)))
    : null;
  return queryOptions({
    queryKey: ["bridge", "components", id, "preview", sortedParams] as const,
    queryFn: async ({ signal }) => unwrap(await bridgeClient.getPreview(id, params, signal)),
    // Default-param previews are stable; user-tuned previews refetch on change.
    staleTime: params ? 0 : DAY,
    gcTime: WEEK,
    enabled: id.length > 0,
  });
};
