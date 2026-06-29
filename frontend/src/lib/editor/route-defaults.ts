/**
 * route-defaults.ts
 *
 * Single source of truth for Qiskit Metal route component default parameter values.
 *
 * Rules:
 *  - Add a new entry here when a new route QComponent is supported.
 *  - Values must match Qiskit Metal's built-in defaults exactly.
 *  - LEAD LENGTH: Qiskit Metal RouteMeander uses 30um internally. The UI
 *    previously showed 50um as a placeholder hint — 30um is the correct value.
 */

// ── Per-component default maps ────────────────────────────────────────────────

export const ROUTE_COMPONENT_DEFAULTS: Record<string, Record<string, string>> = {
  RouteMeander: {
    total_length: "7mm",
    fillet: "99um",
    lead_length: "30um",
    trace_width: "10um",
    trace_gap: "6um",
  },
  RouteStraight: {
    total_length: "7mm",
    fillet: "99um",
    lead_length: "30um",
    trace_width: "10um",
    trace_gap: "6um",
  },
};

/** Fallback used when the route component ID is unknown / not in the map above. */
const ROUTE_FALLBACK_DEFAULTS: Record<string, string> = {
  total_length: "7mm",
  fillet: "99um",
  lead_length: "30um",
  trace_width: "10um",
  trace_gap: "6um",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Return the default parameter values for the given route component.
 * - Exact match first (e.g. "RouteMeander").
 * - Partial match second (e.g. "RouteMeanderPathlength" → RouteMeander defaults).
 * - Falls back to ROUTE_FALLBACK_DEFAULTS for unknown components.
 */
export function getRouteDefaults(routeComponentId?: string): Record<string, string> {
  if (!routeComponentId) return ROUTE_COMPONENT_DEFAULTS["RouteMeander"];

  // Exact match
  if (ROUTE_COMPONENT_DEFAULTS[routeComponentId]) {
    return ROUTE_COMPONENT_DEFAULTS[routeComponentId];
  }

  // Partial match — case-insensitive substring
  const partialEntry = Object.entries(ROUTE_COMPONENT_DEFAULTS).find(([k]) =>
    routeComponentId.toLowerCase().includes(k.toLowerCase()),
  );
  if (partialEntry) return partialEntry[1];

  return ROUTE_FALLBACK_DEFAULTS;
}

/**
 * Build a routeOverrides object pre-filled with the component's defaults.
 * Existing user-set overrides in `current` are preserved and take precedence —
 * defaults only fill keys that are absent from `current`.
 */
export function buildInitialRouteOverrides(
  routeComponentId?: string,
  current?: Record<string, string | number>,
): Record<string, string | number> {
  const defaults = getRouteDefaults(routeComponentId);
  // Merge: defaults first, then current on top
  return { ...defaults, ...(current ?? {}) };
}
