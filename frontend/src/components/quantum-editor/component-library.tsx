import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { ChevronDown, ChevronRight, Search, Box, Loader2, WifiOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { componentsQueryOptions, componentMetadataQueryOptions, componentPreviewQueryOptions } from "@/lib/bridge/queries";
import { QISKIT_CATALOG, QISKIT_CATEGORY_ORDER, QISKIT_CATEGORY_LABEL } from "./qiskit-metal-catalog";

import type { ComponentCategory, ComponentSummary } from "@/lib/bridge/types";
import type { QiskitCategory } from "./qiskit-metal-catalog";

// Map Qiskit catalog categories to bridge ComponentCategory
const QISKIT_TO_BRIDGE: Record<QiskitCategory, ComponentCategory> = {
  qubits: "qubits",
  couplers: "couplers",
  tlines: "routes",
  resonators: "resonators",
  terminations: "terminations",
  lumped: "other",
  "sample shapes": "other",
  feedlines: "feedlines",
};

// Convert the static catalog to ComponentSummary format for fallback
const STATIC_COMPONENTS: ComponentSummary[] = QISKIT_CATALOG.map((c) => ({
  id: c.className,
  name: c.label,
  module: c.modulePath,
  category: QISKIT_TO_BRIDGE[c.category],
  description: c.description,
}));

// All ordered categories for display
const DISPLAY_CATEGORY_ORDER: ComponentCategory[] = [
  "qubits",
  "feedlines",      // ← Feedline appears second, prominently above resonators/routes
  "resonators",
  "couplers",
  "routes",
  "launchpads",
  "ground",
  "terminations",
  "other",
];

// Human-readable labels for each panel section
const CATEGORY_LABEL: Partial<Record<ComponentCategory, string>> = {
  qubits: "Qubits",
  feedlines: "Feedlines",
  resonators: "Resonators",
  couplers: "Couplers",
  routes: "Routes",
  launchpads: "Launchpads",
  ground: "Ground",
  terminations: "Terminations",
  other: "Other",
};

const RECENT_KEY = "sf_recent_components";

function useRecentComponents(all: ComponentSummary[]) {
  const [recentIds, setRecentIds] = useState<string[]>([]);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as string[];
      setRecentIds(stored);
    } catch { /* ignore */ }
  }, []);
  const recent = useMemo(() => {
    const byId = new Map(all.map((c) => [c.id, c]));
    return recentIds.map((id) => byId.get(id)).filter(Boolean) as ComponentSummary[];
  }, [recentIds, all]);
  return { recent, setRecentIds };
}

export function ComponentLibrary() {
  return <LibraryContent />;
}

function LibraryContent() {
  const [filter, setFilter] = useState("");
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState<Partial<Record<ComponentCategory, boolean>>>({
    qubits: true,
    feedlines: true,   // Feedline section open by default — it's the primary new feature
    routes: true,
  });

  // Suppress SSR/client mismatch by only showing dynamic content after mount
  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    data: bridgeData,
    isLoading,
    isError,
  } = useQuery({
    ...componentsQueryOptions(),
    // Don't run on server — avoids hydration mismatch from async bridge data
    enabled: mounted,
    // Don't show error state if bridge is unavailable — we have a fallback
    retry: 1,
  });

  // Feedline is an editor-only native component — always inject it regardless
  // of whether we have bridge data. The backend doesn't know about it.
  const FEEDLINE_ENTRY: ComponentSummary = {
    id: "Feedline",
    name: "Feedline",
    module: "app.components.feedline",
    category: "feedlines",
    description:
      "Native CPW transmission line. Drag to place LaunchPad A → CPW → LaunchPad B as one object. Exports as standard Qiskit Metal LaunchpadWirebond + RouteStraight.",
  };

  // Use bridge data when available, fall back to static catalog.
  // Always inject the native Feedline entry at the top of the list.
  const components: ComponentSummary[] = useMemo(() => {
    const base = bridgeData && bridgeData.length > 0 ? bridgeData : STATIC_COMPONENTS;
    // Deduplicate — remove any stale "Feedline" that might have slipped in
    const withoutFeedline = base.filter((c) => c.id !== "Feedline");
    return [FEEDLINE_ENTRY, ...withoutFeedline];
  }, [bridgeData]);

  const usingFallback = !isLoading && (isError || !bridgeData || bridgeData.length === 0);

  const grouped: Record<ComponentCategory, ComponentSummary[]> = {
    qubits: [],
    feedlines: [],
    resonators: [],
    couplers: [],
    routes: [],
    launchpads: [],
    ground: [],
    terminations: [],
    other: [],
  };
  const q = filter.trim().toLowerCase();
  for (const c of components) {
    if (q && !c.name.toLowerCase().includes(q) && !c.id.toLowerCase().includes(q)) continue;
    (grouped[c.category] ?? grouped.other).push(c);
  }

  const sourceLabel = usingFallback
    ? "Qiskit Metal catalog (offline)"
    : isLoading
      ? "Loading from bridge…"
      : `Bridge · ${components.length} components`;

  const { recent, setRecentIds } = useRecentComponents(components);

  return (
    <div className="flex h-full flex-col gap-2 text-xs min-w-[155px]">
      <div className="px-1 pb-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Component Library
        </p>
        <p className="flex items-center gap-1 text-[10px] text-muted-foreground/80">
          {usingFallback && <WifiOff className="h-2.5 w-2.5 shrink-0" />}
          {mounted ? sourceLabel : "Loading…"}
        </p>
      </div>
      <div className="relative px-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter components"
          className="h-7 pl-7 text-[11px]"
        />
      </div>

      {!mounted && (
        <div className="flex flex-1 items-center justify-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      )}

      {mounted && components.length === 0 && (
        <div className="flex flex-1 items-center justify-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading components…
        </div>
      )}

      {mounted && components.length > 0 && (
        <div className="flex-1 space-y-1 overflow-y-auto px-1 pb-2">
          {recent.length > 0 && !filter.trim() && (
            <div className="overflow-hidden rounded-md border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border bg-muted/40 px-2 py-1.5 text-left text-[11px] font-semibold text-foreground">
                <span>Recent</span>
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-destructive"
                  onClick={() => { localStorage.removeItem(RECENT_KEY); setRecentIds([]); }}
                >
                  Clear
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-1.5">
                {recent.map((c) => (
                  <LibraryItem key={c.id} component={c} />
                ))}
              </div>
            </div>
          )}
          {DISPLAY_CATEGORY_ORDER.map((cat) => {
            const items = grouped[cat];
            if (items.length === 0) return null;
            const isOpen = open[cat] ?? false;
            const isFeedlines = cat === "feedlines";
            return (
              <div
                key={cat}
                className={cn(
                  "overflow-hidden rounded-md border bg-card",
                  isFeedlines
                    ? "border-blue-300/60 ring-1 ring-blue-300/20"
                    : "border-border",
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpen((s) => ({ ...s, [cat]: !isOpen }))}
                  className={cn(
                    "flex w-full items-center justify-between border-b px-2 py-1.5 text-left text-[11px] font-semibold hover:bg-muted",
                    isFeedlines
                      ? "border-blue-200/60 bg-blue-50/60 text-blue-800 hover:bg-blue-100"
                      : "border-border bg-muted/40 text-foreground",
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {isFeedlines && (
                      <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                    )}
                    {CATEGORY_LABEL[cat] ?? cat}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    {items.length}
                    {isOpen ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </span>
                </button>
                {isOpen && (
                  <div className="grid grid-cols-2 gap-1.5 p-1.5">
                    {items.map((c) => (
                      <LibraryItem key={c.id} component={c} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LibraryItem({ component }: { component: ComponentSummary }) {
  const [dragging, setDragging] = useState(false);
  const qc = useQueryClient();

  // Look up the static catalog entry for the thumbnail image
  const catalogEntry = useMemo(
    () => QISKIT_CATALOG.find((c) => c.className === component.id),
    [component.id],
  );

  const isFeedline = component.id === "Feedline";

  const handlePrefetch = () => {
    // Feedline is editor-only — no bridge metadata to prefetch
    if (isFeedline) return;
    qc.prefetchQuery(componentMetadataQueryOptions(component.id));
    qc.prefetchQuery(componentPreviewQueryOptions(component.id));
  };

  return (
    <motion.div
      draggable
      animate={{ scale: dragging ? 0.95 : 1, opacity: dragging ? 0.6 : 1 }}
      transition={{ duration: 0.12 }}
      onMouseEnter={handlePrefetch}
      onDragStart={(e) => {
        handlePrefetch();
        const dt = (e as unknown as DragEvent).dataTransfer;
        if (dt) {
          dt.setData("application/x-silicofeller-component", component.id);
          dt.effectAllowed = "copy";
        }
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={cn(
        "group flex cursor-grab flex-col items-center gap-1 rounded-md border p-1.5 transition-all hover:shadow-sm active:cursor-grabbing",
        isFeedline
          ? "border-blue-300/70 bg-blue-50/60 hover:border-blue-400 hover:bg-blue-50"
          : "border-border bg-background hover:border-primary",
      )}
      title={`${component.name} — ${component.description ?? component.category}`}
    >
      {/* Preview thumbnail */}
      <div className={cn(
        "flex h-12 w-12 items-center justify-center overflow-hidden rounded",
        isFeedline ? "bg-blue-100/60" : "bg-muted/40",
      )}>
        {isFeedline ? (
          /* CPW feedline icon — matches actual editor component appearance:
             arrow-shaped LaunchPads + straight transmission line */
          <svg viewBox="0 0 48 24" className="h-10 w-10">
            {/* CPW ground plane bar */}
            <rect x="8" y="9" width="32" height="6" rx="1" fill="#bae6fd" />
            {/* Centre conductor */}
            <line x1="8" y1="12" x2="40" y2="12" stroke="#5B9BD5" strokeWidth="2" strokeLinecap="round" />
            {/* Mid-line tick to suggest the arrow direction */}
            <polygon points="22,9.5 26,12 22,14.5" fill="#5B9BD5" opacity="0.5" />
            {/* LaunchPad A — triangle arrow pointing right (inward) */}
            <polygon points="2,7 9,12 2,17" fill="#5B9BD5" stroke="#2563eb" strokeWidth="0.5" />
            <circle cx="2" cy="12" r="2" fill="#bfdbfe" stroke="#5B9BD5" strokeWidth="0.8" />
            {/* LaunchPad B — triangle arrow pointing left (inward) */}
            <polygon points="46,7 39,12 46,17" fill="#5B9BD5" stroke="#2563eb" strokeWidth="0.5" />
            <circle cx="46" cy="12" r="2" fill="#bfdbfe" stroke="#5B9BD5" strokeWidth="0.8" />
          </svg>
        ) : catalogEntry?.image ? (
          <img
            src={catalogEntry.image}
            alt={component.name}
            className="h-full w-full object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
              const parent = e.currentTarget.parentElement;
              if (parent) {
                parent.innerHTML =
                  '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>';
              }
            }}
          />
        ) : (
          <Box className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
        )}
      </div>

      {/* Name */}
      <span
        className={cn(
          "w-full truncate text-center text-[10px] font-semibold leading-tight",
          isFeedline ? "text-blue-800" : "text-foreground",
        )}
        title={component.name}
      >
        {component.name}
      </span>

      {/* "Native" badge for Feedline */}
      {isFeedline && (
        <span className="rounded bg-blue-500/15 px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide text-blue-700">
          Native
        </span>
      )}
    </motion.div>
  );
}
