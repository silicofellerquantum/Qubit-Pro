import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { motion } from "motion/react";
import { toast } from "sonner";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { WorkspaceProvider, useWorkspace } from "@/lib/editor/workspace-store";
import { getSingleSelection, isSelected, type Selection } from "@/lib/editor/design-store";
import { ComponentLibrary } from "@/components/quantum-editor/component-library";
import { PropertyInspector } from "@/components/quantum-editor/property-inspector";
import { EditorCanvas, type EditorCanvasHandle, CHIP_HALF_W, CHIP_HALF_H } from "@/components/quantum-editor/editor-canvas";
import { EditorToolbar } from "@/components/quantum-editor/editor-toolbar";
import { CodeIdePanel, type CodePanelMode } from "@/components/quantum-editor/code-ide-panel";
import { useDesign } from "@/lib/design-context";
import { useProject } from "@/lib/project-context";
import type { GenerateResponse } from "@/lib/api/backend";
import type { DesignDocument, Placement, Connection } from "@/lib/bridge/types";

let localClipboard = "";

// ---------- Search Parameters Schema ----------
const searchSchema = z.object({
  conversationId: z.string().optional(),
  highlight: z.string().optional(),
});

export const Route = createFileRoute("/_app/schematic-editor")({
  head: () => ({
    meta: [
      { title: "Schematic Editor — Quantum Studio" },
      {
        name: "description",
        content: "Visual schematic editor for superconducting quantum chip design.",
      },
    ],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  component: SchematicEditorRoute,
  errorComponent: ErrorBoundary,
});

function ErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-card text-card-foreground">
      <div className="max-w-md rounded-lg border border-border bg-card p-6 shadow-md">
        <h2 className="mb-2 text-lg font-bold text-destructive">Editor failed to load</h2>
        <p className="mb-4 text-sm font-mono text-muted-foreground bg-muted p-3 rounded overflow-auto max-h-40">
          {error.message}
        </p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

// ---------- Data Model Adaption ----------

export function fromGenerateResponse(result: GenerateResponse | null): DesignDocument {
  const empty: DesignDocument = { placements: [], connections: [] };
  if (!result) return empty;

  // Lossless round-trip: backend always emits result.design via SchematicCompiler.
  // Use it directly; fall back to empty (never a lossy client-side reconstruction).
  if (result.design && result.design.placements && result.design.connections) {
    return {
      placements: result.design.placements,
      connections: result.design.connections,
    };
  }

  return empty;
}

export function toGenerateResponse(
  doc: DesignDocument,
  prev: GenerateResponse | null,
): GenerateResponse {
  const qubitComps = doc.placements.filter(
    (p) => p.componentId === "TransmonPocket" || p.componentId === "TransmonCross",
  );
  const placementQubits = qubitComps.map((p) => ({
    name: p.name,
    x: parseFloat(p.x.toFixed(3)),
    y: parseFloat(p.y.toFixed(3)),
    orientation_deg: p.rotation,
  }));

  const resonatorComps = doc.placements.filter((p) => p.componentId === "ResonatorCoilRect");
  const resonator_frequencies_GHz: Record<string, number> = {};
  const resonator_lengths_mm: Record<string, number> = {};
  resonatorComps.forEach((p, i) => {
    resonator_frequencies_GHz[p.name] =
      prev?.frequency_plan?.resonator_frequencies_GHz?.[p.name] ?? 6 + i * 0.05;
    resonator_lengths_mm[p.name] = prev?.frequency_plan?.resonator_lengths_mm?.[p.name] ?? 7.5;
  });

  const qubitIds = new Set(qubitComps.map((c) => c.id));
  const qubitNameById = new Map(qubitComps.map((c) => [c.id, c.name]));
  const edgesByKey = new Map<string, any>();
  doc.connections.forEach((conn, i) => {
    if (!qubitIds.has(conn.from.placementId) || !qubitIds.has(conn.to.placementId)) return;
    const qubitA = qubitNameById.get(conn.from.placementId);
    const qubitB = qubitNameById.get(conn.to.placementId);
    if (!qubitA || !qubitB || qubitA === qubitB) return;
    const key = [qubitA, qubitB].sort().join("__");
    if (edgesByKey.has(key)) return;
    edgesByKey.set(key, {
      qubit_a: qubitA,
      pin_a: conn.from.pinName,
      qubit_b: qubitB,
      pin_b: conn.to.pinName,
      label: `editor_bus_${i + 1}`,
    });
  });
  const placementEdges = Array.from(edgesByKey.values());

  const base: GenerateResponse = {
    label: prev?.label ?? `${placementQubits.length}-Qubit Custom`,
    num_qubits: placementQubits.length,
    topology: prev?.topology ?? "custom",
    engine: prev?.engine ?? "editor",
    interpretation:
      prev?.interpretation ??
      `Edited in Schematic Editor — ${placementQubits.length} qubits, ${doc.connections.length} connections.`,
    chip_image: prev?.chip_image,
    fabricated_image: prev?.fabricated_image,
    drc: prev?.drc ?? { passed: true, violations: [] },
    frequency_plan: prev?.frequency_plan
      ? {
          ...prev.frequency_plan,
          resonator_frequencies_GHz,
          resonator_lengths_mm,
        }
      : {
          epsilon_eff: 6.45,
          qubit_frequencies_GHz: Object.fromEntries(
            placementQubits.map((q, i) => [q.name, 5.0 + i * 0.05]),
          ),
          qubit_groups: {},
          EJ_GHz: {},
          EC_GHz: {},
          resonator_frequencies_GHz,
          resonator_lengths_mm,
          detunings_GHz: {},
          warnings: [],
        },
    placement: {
      ...(prev?.placement ?? {}),
      solver: prev?.placement?.solver ?? "editor",
      qubits: placementQubits,
      edges: placementEdges,
    },
    code: prev?.code ?? "",
    material: prev?.material,
    ml_prediction: prev?.ml_prediction,
    error_hint: prev?.error_hint,
    design: doc, // store full design for lossless round-trip
  };
  return base;
}

// ---------- Shell Component ----------

function SchematicEditorRoute() {
  const { activeProject } = useProject();
  return (
    <WorkspaceProvider activeProjectId={activeProject?.id ?? null}>
      <SchematicEditorShell />
    </WorkspaceProvider>
  );
}

function SchematicEditorShell() {
  const { conversationId, highlight } = Route.useSearch();
  const navigate = useNavigate();
  const { conversations, activeId, setActiveId, updateConversationResult } = useDesign();
  // Get project context to save design to Supabase when active project exists
  const { activeProject, saveDesign: saveDesignToProject } = useProject();

  const targetId = conversationId ?? activeId;
  const conversation = useMemo(
    () => conversations.find((c) => c.id === targetId) ?? null,
    [conversations, targetId],
  );

  const [libOpen, setLibOpen] = useState(true);
  const [codeMode, setCodeMode] = useState<CodePanelMode | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const canvasRef = useRef<EditorCanvasHandle>(null);
  const { workspace, activeTab, newCanvas, loadIntoCanvas, saveAll, dispatch } = useWorkspace();
  // Ref so closures always see latest project
  const activeProjectRef = useRef(activeProject);
  activeProjectRef.current = activeProject;
  const saveDesignToProjectRef = useRef(saveDesignToProject);
  saveDesignToProjectRef.current = saveDesignToProject;

  const handleFitView = useCallback(() => {
    canvasRef.current?.fitToContent();
  }, []);

  // Warn before closing tab if there are unsaved changes
  useEffect(() => {
    const hasUnsaved = workspace.tabs.some((t) => t.dirty);
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [workspace.tabs]);

  // Keep design context's active conversation in sync with the URL search query
  useEffect(() => {
    if (conversationId && conversationId !== activeId) {
      setActiveId(conversationId);
    }
  }, [conversationId, activeId, setActiveId]);

  // Synchronize tabs list with the conversation and external modifications
  const lastSyncedResultRef = useRef<{ id: string; result: GenerateResponse | null } | null>(null);
  const prevResultRef = useRef<GenerateResponse | null>(null);

  useEffect(() => {
    if (!conversation) return;
    const tabId = `conv_${conversation.id}`;

    const isNewConversation =
      lastSyncedResultRef.current === null || lastSyncedResultRef.current.id !== conversation.id;
    const isExternalUpdate =
      !isNewConversation &&
      lastSyncedResultRef.current !== null &&
      conversation.result !== lastSyncedResultRef.current.result;

    if (isNewConversation || isExternalUpdate) {
      const doc = fromGenerateResponse(conversation.result);
      const hasTab = workspace.tabs.some((t) => t.id === tabId);

      if (!hasTab) {
        newCanvas(conversation.title || "Schematic", doc, tabId);
      } else {
        loadIntoCanvas(tabId, doc);
      }

      if (highlight) {
        const found = doc.placements.find(
          (p) =>
            p.name.toLowerCase() === highlight.toLowerCase() ||
            p.id.toLowerCase() === highlight.toLowerCase(),
        );
        if (found) {
          dispatch({
            type: "CANVAS_ACTION",
            id: tabId,
            action: { type: "SELECT", selection: [{ kind: "placement", id: found.id }] },
          });
        }
      }

      lastSyncedResultRef.current = { id: conversation.id, result: conversation.result };
      prevResultRef.current = conversation.result;
    }
  }, [
    conversation?.id,
    conversation?.result,
    workspace.tabs,
    newCanvas,
    loadIntoCanvas,
    highlight,
    dispatch,
  ]);

  // Handle activeId state switching when the user manually switches tabs inside the editor
  useEffect(() => {
    if (activeTab.id.startsWith("conv_")) {
      const parsedId = activeTab.id.replace("conv_", "");
      if (parsedId !== activeId) {
        setActiveId(parsedId);
      }
    }
  }, [activeTab.id, activeId, setActiveId]);

  // Push changes back to parent conversation context AND save to active project
  const lastDocRef = useRef("");
  useEffect(() => {
    if (!conversation || activeTab.id !== `conv_${conversation.id}`) return;
    const docKey = JSON.stringify({
      p: activeTab.state.placements.map((p) => [p.id, p.x, p.y, p.rotation]),
      c: activeTab.state.connections.map((c) => [c.id, c.from.placementId, c.from.pinName, c.to.placementId, c.to.pinName]),
    });
    if (docKey === lastDocRef.current) return;

    const t = setTimeout(() => {
      const doc: DesignDocument = {
        placements: activeTab.state.placements,
        connections: activeTab.state.connections,
      };
      const next = toGenerateResponse(doc, prevResultRef.current);
      updateConversationResult(conversation.id, next);
      prevResultRef.current = next;
      lastSyncedResultRef.current = { id: conversation.id, result: next };
      lastDocRef.current = docKey;
      // Persist to active project in Supabase (fire-and-forget)
      if (activeProjectRef.current) {
        saveDesignToProjectRef.current(next).catch(() => {});
      }
    }, 800);

    return () => clearTimeout(t);
  }, [activeTab.state.placements, activeTab.state.connections, activeTab.id, conversation?.id, updateConversationResult]);
  // Save standalone canvas (non-conversation tabs) to active project when canvas changes
  const lastStandaloneDocRef = useRef("");
  useEffect(() => {
    // Only run for non-conversation tabs (standalone canvases like "Untitled1")
    if (activeTab.id.startsWith("conv_")) return;
    if (!activeProjectRef.current) return;
    if (!activeTab.dirty) return;

    const docKey = JSON.stringify({
      p: activeTab.state.placements.map((p) => [p.id, p.x, p.y, p.rotation]),
      c: activeTab.state.connections.map((c) => [c.id, c.from.placementId, c.from.pinName, c.to.placementId, c.to.pinName]),
    });
    if (docKey === lastStandaloneDocRef.current) return;

    const t = setTimeout(() => {
      const doc: DesignDocument = {
        placements: activeTab.state.placements,
        connections: activeTab.state.connections,
      };
      const next = toGenerateResponse(doc, prevResultRef.current);
      prevResultRef.current = next;
      lastStandaloneDocRef.current = docKey;
      // Persist to active project in Supabase
      if (activeProjectRef.current) {
        saveDesignToProjectRef.current(next).catch(() => {});
      }
    }, 800);

    return () => clearTimeout(t);
  }, [activeTab.state.placements, activeTab.state.connections, activeTab.id, activeTab.dirty]);

  // Keyboard Shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      const inInput = tag === "INPUT" || tag === "TEXTAREA";

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveAll();
        // Also persist design payload to active project
        if (activeProjectRef.current) {
          const doc: DesignDocument = {
            placements: activeTab.state.placements,
            connections: activeTab.state.connections,
          };
          const next = toGenerateResponse(doc, prevResultRef.current);
          prevResultRef.current = next;
          saveDesignToProjectRef.current(next).catch(() => {});
        }
      }

      if ((e.ctrlKey || e.metaKey) && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        const tab = workspace.tabs[idx];
        if (tab) dispatch({ type: "SWITCH_CANVAS", id: tab.id });
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "w" && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: "CLOSE_CANVAS", id: activeTab.id });
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "t") {
        e.preventDefault();
        newCanvas();
      }

      if (!inInput && e.key.toLowerCase() === "f" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        if (e.shiftKey) {
          canvasRef.current?.zoomToSelection();
        } else {
          canvasRef.current?.fitToContent();
        }
      }

      if (!inInput && e.key === "Tab" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const placements = activeTab.state.placements;
        if (placements.length === 0) return;
        const selIds = activeTab.state.selection.filter((s) => s.kind === "placement").map((s) => s.id);
        let idx = 0;
        if (selIds.length === 1) {
          const currentIdx = placements.findIndex((p) => p.id === selIds[0]);
          idx = e.shiftKey ? (currentIdx - 1 + placements.length) % placements.length : (currentIdx + 1) % placements.length;
        }
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "SELECT", selection: [{ kind: "placement" as const, id: placements[idx].id }] },
        });
      } else if (!inInput && e.key === "+") {
        e.preventDefault();
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "ZOOM", zoom: Math.min(8, activeTab.state.zoom * 1.2) },
        });
      } else if (!inInput && e.key === "-") {
        e.preventDefault();
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "ZOOM", zoom: Math.max(0.25, activeTab.state.zoom / 1.2) },
        });
      } else if (!inInput && e.key === "0") {
        e.preventDefault();
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "ZOOM", zoom: 1 },
        });
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "PAN", x: 0, y: 0 },
        });
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        if (!inInput) {
          e.preventDefault();
          const all: Selection = [
            ...activeTab.state.placements.map((p) => ({ kind: "placement" as const, id: p.id })),
            ...activeTab.state.connections.map((c) => ({ kind: "connection" as const, id: c.id })),
          ];
          dispatch({
            type: "CANVAS_ACTION",
            id: activeTab.id,
            action: { type: "SELECT", selection: e.shiftKey ? [] : all },
          });
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: e.shiftKey ? "REDO" : "UNDO" },
        });
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        if (!inInput) {
          const selPlacements = activeTab.state.selection
            .filter((s): s is { kind: "placement"; id: string } => s.kind === "placement");
          if (selPlacements.length > 0) {
            e.preventDefault();
            selPlacements.forEach((s) =>
              dispatch({
                type: "CANVAS_ACTION",
                id: activeTab.id,
                action: { type: "DUPLICATE_PLACEMENT", id: s.id },
              }),
            );
          }
        }
      } else if (
        !inInput &&
        activeTab.state.selection.some((s) => s.kind === "placement") &&
        e.key.toLowerCase() === "r" &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        activeTab.state.selection
          .filter((s): s is { kind: "placement"; id: string } => s.kind === "placement")
          .forEach((sel) => {
            const p = activeTab.state.placements.find((pl) => pl.id === sel.id);
            if (p) {
              dispatch({
                type: "CANVAS_ACTION",
                id: activeTab.id,
                action: { type: "UPDATE_PLACEMENT", id: p.id, patch: { rotation: (p.rotation + 90) % 360 } },
              });
            }
          });
      } else if (
        !inInput &&
        activeTab.state.selection.some((s) => s.kind === "placement") &&
        e.key.toLowerCase() === "m" &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        activeTab.state.selection
          .filter((s): s is { kind: "placement"; id: string } => s.kind === "placement")
          .forEach((sel) =>
            dispatch({
              type: "CANVAS_ACTION",
              id: activeTab.id,
              action: { type: "MIRROR_PLACEMENT", id: sel.id },
            }),
          );
      } else if (
        !inInput &&
        getSingleSelection(activeTab.state.selection)?.kind === "placement" &&
        e.key.startsWith("Arrow")
      ) {
        e.preventDefault();
        const selId = getSingleSelection(activeTab.state.selection)!.id;
        const p = activeTab.state.placements.find((p) => p.id === selId);
        if (p) {
          const step = e.shiftKey ? 0.5 : activeTab.state.snap;
          let nx = p.x;
          let ny = p.y;
          if (e.key === "ArrowLeft") nx -= step;
          if (e.key === "ArrowRight") nx += step;
          if (e.key === "ArrowUp") ny += step; // positive y is up in world coords? wait, let's check.
          if (e.key === "ArrowDown") ny -= step;
          dispatch({
            type: "CANVAS_ACTION",
            id: activeTab.id,
            action: {
              type: "MOVE_PLACEMENT",
              id: p.id,
              x: Math.max(-CHIP_HALF_W, Math.min(CHIP_HALF_W, nx)),
              y: Math.max(-CHIP_HALF_H, Math.min(CHIP_HALF_H, ny)),
            },
          });
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (activeTab.state.selection.length > 0 && !inInput) {
          e.preventDefault();
          // Delete all selected placements and connections
          const selPlacements = activeTab.state.selection
            .filter((s) => s.kind === "placement")
            .map((s) => s.id);
          const selConnections = activeTab.state.selection
            .filter((s) => s.kind === "connection")
            .map((s) => s.id);
          selPlacements.forEach((id) =>
            dispatch({ type: "CANVAS_ACTION", id: activeTab.id, action: { type: "DELETE_PLACEMENT", id } }),
          );
          selConnections.forEach((id) =>
            dispatch({ type: "CANVAS_ACTION", id: activeTab.id, action: { type: "DELETE_CONNECTION", id } }),
          );
        }
      } else if (!inInput && e.key === "0" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "ZOOM", zoom: 1 },
        });
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "PAN", x: window.innerWidth / 2, y: window.innerHeight / 2 },
        });
      } else if (!inInput && e.key === "+" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "ZOOM", zoom: Math.min(5, activeTab.state.zoom * 1.2) },
        });
      } else if (!inInput && e.key === "-" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "ZOOM", zoom: Math.max(0.25, activeTab.state.zoom / 1.2) },
        });
      } else if (!inInput && e.code === "Space" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "SET_TOOL", tool: activeTab.state.tool === "pan" ? "select" : "pan" },
        });
      } else if (!inInput && e.key.toLowerCase() === "g" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "TOGGLE_GRID" },
        });
      } else if (!inInput && e.key.toLowerCase() === "c" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "TOGGLE_CONNECTIONS" },
        });
      } else if (!inInput && e.key.toLowerCase() === "i" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "TOGGLE_COMPONENT_IDS" },
        });
      } else if (!inInput && e.key.toLowerCase() === "u" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "TOGGLE_RULERS" },
        });
      } else if (!inInput && e.key.toLowerCase() === "h" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "TOGGLE_HUD" },
        });
      } else if (!inInput && e.key.toLowerCase() === "n" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        const seedIds = new Set(activeTab.state.selection.filter((s) => s.kind === "placement").map((s) => s.id));
        if (seedIds.size === 0) return;
        const netIds = new Set<string>(seedIds);
        let changed = true;
        while (changed) {
          changed = false;
          activeTab.state.connections.forEach((c) => {
            if (netIds.has(c.from.placementId) && !netIds.has(c.to.placementId)) {
              netIds.add(c.to.placementId);
              changed = true;
            }
            if (netIds.has(c.to.placementId) && !netIds.has(c.from.placementId)) {
              netIds.add(c.from.placementId);
              changed = true;
            }
          });
        }
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "SELECT", selection: Array.from(netIds).map((id) => ({ kind: "placement" as const, id })) },
        });
      } else if (!inInput && e.key.toLowerCase() === "l" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        activeTab.state.selection
          .filter((s) => s.kind === "placement")
          .forEach((s) => {
            const p = activeTab.state.placements.find((pl) => pl.id === s.id);
            if (p?.locked) {
              dispatch({ type: "CANVAS_ACTION", id: activeTab.id, action: { type: "UNLOCK_PLACEMENT", id: s.id } });
            } else {
              dispatch({ type: "CANVAS_ACTION", id: activeTab.id, action: { type: "LOCK_PLACEMENT", id: s.id } });
            }
          });
      } else if (!inInput && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && !e.shiftKey) {
        e.preventDefault();
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "SELECT", selection: activeTab.state.placements.map((p) => ({ kind: "placement" as const, id: p.id })) },
        });
      } else if (!inInput && (e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "a") {
        e.preventDefault();
        const currentIds = new Set(activeTab.state.selection.filter((s) => s.kind === "placement").map((s) => s.id));
        const inverted = activeTab.state.placements
          .filter((p) => !currentIds.has(p.id))
          .map((p) => ({ kind: "placement" as const, id: p.id }));
        dispatch({
          type: "CANVAS_ACTION",
          id: activeTab.id,
          action: { type: "SELECT", selection: inverted },
        });
      } else if (!inInput && (e.metaKey || e.ctrlKey) && e.key === "c") {
        e.preventDefault();
        const selPlacements = activeTab.state.selection
          .filter((s) => s.kind === "placement")
          .map((s) => activeTab.state.placements.find((p) => p.id === s.id))
          .filter(Boolean) as Placement[];
        if (selPlacements.length > 0) {
          const payload = JSON.stringify({ version: 1, placements: selPlacements });
          localClipboard = payload;
          navigator.clipboard.writeText(payload).catch(() => {});
          toast.success(`${selPlacements.length} component${selPlacements.length > 1 ? "s" : ""} copied`);
        }
      } else if (!inInput && (e.metaKey || e.ctrlKey) && e.key === "v") {
        e.preventDefault();
        const tryPaste = (payload: string) => {
          try {
            const parsed = JSON.parse(payload);
            if (parsed.placements && Array.isArray(parsed.placements)) {
              dispatch({ type: "CANVAS_ACTION", id: activeTab.id, action: { type: "PASTE_PLACEMENTS", placements: parsed.placements } });
              toast.success(`${parsed.placements.length} pasted`);
            }
          } catch { /* ignore */ }
        };
        if (localClipboard) {
          tryPaste(localClipboard);
        } else {
          navigator.clipboard.readText().then(tryPaste).catch(() => {});
        }
      } else if (!inInput && (e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowPalette((v) => !v);
      } else if (!inInput && e.key === "?") {
        e.preventDefault();
        setShowHelp((v) => !v);
      } else if (e.key === "Escape") {
        if (activeTab.state.pendingPin) {
          dispatch({
            type: "CANVAS_ACTION",
            id: activeTab.id,
            action: { type: "CANCEL_PIN" },
          });
        } else {
          canvasRef.current?.cancelDrag();
          dispatch({
            type: "CANVAS_ACTION",
            id: activeTab.id,
            action: { type: "SELECT", selection: [] },
          });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveAll, activeTab.id, activeTab.state.selection, activeTab.state.zoom, activeTab.state.pan, dispatch]);

  if (!conversation && !activeProject) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-white">
        <div className="rounded-2xl border border-slate-200 p-6 text-center shadow-sm">
          <p className="text-sm font-bold text-slate-700">No active project or design session selected.</p>
          <button
            onClick={() => navigate({ to: "/projects" })}
            className="mt-3 text-xs font-bold text-indigo-600 hover:underline"
          >
            Go to Projects →
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 flex flex-col bg-background text-foreground overflow-hidden"
    >
      {/* Toolbar */}
      <EditorToolbar
        libOpen={libOpen}
        onToggleLib={() => setLibOpen((v) => !v)}
        onFitView={handleFitView}
        onShowCode={(mode) => setCodeMode(mode)}
        canvasRef={canvasRef}
      />

      {/* Main Flex Workspace */}
      <div className="flex flex-1 min-h-0 w-full overflow-hidden">
        {/* Component Library (collapsible) */}
        {libOpen && (
          <div className="w-64 shrink-0 border-r border-border bg-card overflow-hidden flex flex-col">
            <div className="h-full flex flex-col p-2 overflow-hidden">
              <ComponentLibrary />
            </div>
          </div>
        )}

        {/* Canvas */}
        <div className="flex-1 min-w-0 overflow-hidden relative h-full bg-background">
          <EditorCanvas key={activeTab.id} ref={canvasRef} />
        </div>

        {/* Property Inspector */}
        {activeTab.state.selection && (
          <div className="w-80 shrink-0 border-l border-border bg-card overflow-y-auto p-3 flex flex-col">
            <PropertyInspector />
          </div>
        )}

        {/* Code IDE (conditional) */}
        {codeMode && (
          <div className="w-[480px] shrink-0 border-l border-border bg-card overflow-hidden flex flex-col">
            <CodeIdePanel mode={codeMode} onClose={() => setCodeMode(null)} />
          </div>
        )}
      </div>

      {showHelp && <KeyboardShortcutsHelp onClose={() => setShowHelp(false)} />}
      <CommandPalette
        open={showPalette}
        onOpenChange={setShowPalette}
        onFitView={handleFitView}
        onSave={() => { saveAll(); toast.success("Design saved"); }}
        state={activeTab.state}
        dispatch={(a) => dispatch({ type: "CANVAS_ACTION", id: activeTab.id, action: a })}
      />
    </motion.div>
  );
}

function CommandPalette({
  open, onOpenChange, onFitView, onSave, state, dispatch,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onFitView: () => void;
  onSave: () => void;
  state: import("@/lib/editor/design-store").EditorState;
  dispatch: (a: import("@/lib/editor/design-store").EditorAction) => void;
}) {
  const sel = state.selection;
  const hasSel = sel.length > 0;
  const hasPlacementSel = sel.some((s) => s.kind === "placement");

  const run = (action: () => void) => {
    action();
    onOpenChange(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Type a command…" />
      <CommandList>
        <CommandEmpty>No command found.</CommandEmpty>
        <CommandGroup heading="File">
          <CommandItem onSelect={() => run(onSave)}>Save design</CommandItem>
          <CommandItem onSelect={() => run(() => dispatch({ type: "UNDO" }))}>Undo</CommandItem>
          <CommandItem onSelect={() => run(() => dispatch({ type: "REDO" }))}>Redo</CommandItem>
        </CommandGroup>
        <CommandGroup heading="View">
          <CommandItem onSelect={() => run(onFitView)}>Fit to content</CommandItem>
          <CommandItem onSelect={() => run(() => dispatch({ type: "ZOOM", zoom: 1 }))}>Reset zoom</CommandItem>
          <CommandItem onSelect={() => run(() => dispatch({ type: "ZOOM", zoom: Math.min(5, state.zoom * 1.2) }))}>Zoom in</CommandItem>
          <CommandItem onSelect={() => run(() => dispatch({ type: "ZOOM", zoom: Math.max(0.25, state.zoom / 1.2) }))}>Zoom out</CommandItem>
          <CommandItem onSelect={() => run(() => dispatch({ type: "TOGGLE_HUD" }))}>Toggle HUD</CommandItem>
          <CommandItem onSelect={() => run(() => dispatch({ type: "TOGGLE_RULERS" }))}>Toggle rulers</CommandItem>
        </CommandGroup>
        <CommandGroup heading="Find">
          {state.placements.map((p) => (
            <CommandItem key={p.id} onSelect={() => run(() => {
              dispatch({ type: "SELECT", selection: [{ kind: "placement" as const, id: p.id }] });
            })}>
              {p.name} <span className="text-muted-foreground">({p.componentId})</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Select by type">
          {Array.from(new Set(state.placements.map((p) => p.componentId))).map((cid) => (
            <CommandItem
              key={cid}
              onSelect={() => run(() => dispatch({
                type: "SELECT",
                selection: state.placements.filter((p) => p.componentId === cid).map((p) => ({ kind: "placement" as const, id: p.id })),
              }))}
            >
              {cid}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Selection">
          <CommandItem onSelect={() => run(() => dispatch({ type: "SELECT", selection: state.placements.map((p) => ({ kind: "placement" as const, id: p.id })) }))}>Select all placements</CommandItem>
          <CommandItem onSelect={() => run(() => dispatch({ type: "SELECT", selection: state.connections.map((c) => ({ kind: "connection" as const, id: c.id })) }))}>Select all connections</CommandItem>
          <CommandItem onSelect={() => run(() => dispatch({ type: "SELECT", selection: [] }))}>Deselect all</CommandItem>
          <CommandItem onSelect={() => run(() => {
            const selectedIds = new Set(sel.filter((s) => s.kind === "placement").map((s) => s.id));
            dispatch({
              type: "SELECT",
              selection: state.placements.filter((p) => !selectedIds.has(p.id)).map((p) => ({ kind: "placement" as const, id: p.id })),
            });
          })}>Invert selection</CommandItem>
          {hasPlacementSel && (
            <CommandItem onSelect={() => run(() => {
              const connectedIds = new Set<string>();
              sel.filter((s) => s.kind === "placement").forEach((s) => {
                state.connections.forEach((c) => {
                  if (c.from.placementId === s.id) connectedIds.add(c.to.placementId);
                  if (c.to.placementId === s.id) connectedIds.add(c.from.placementId);
                });
              });
              const selection = sel.filter((s) => s.kind === "placement").map((s) => ({ kind: "placement" as const, id: s.id }));
              connectedIds.forEach((id) => selection.push({ kind: "placement" as const, id }));
              dispatch({ type: "SELECT", selection });
            })}>Select connected</CommandItem>
          )}
          {hasPlacementSel && (
            <CommandItem onSelect={() => run(() => {
              const seedIds = new Set(sel.filter((s) => s.kind === "placement").map((s) => s.id));
              const netIds = new Set<string>(seedIds);
              let changed = true;
              while (changed) {
                changed = false;
                state.connections.forEach((c) => {
                  if (netIds.has(c.from.placementId) && !netIds.has(c.to.placementId)) {
                    netIds.add(c.to.placementId);
                    changed = true;
                  }
                  if (netIds.has(c.to.placementId) && !netIds.has(c.from.placementId)) {
                    netIds.add(c.from.placementId);
                    changed = true;
                  }
                });
              }
              dispatch({ type: "SELECT", selection: Array.from(netIds).map((id) => ({ kind: "placement" as const, id })) });
            })}>Select net</CommandItem>
          )}
          {hasSel && (
            <CommandItem onSelect={() => run(() => {
              sel.filter((s) => s.kind === "placement").forEach((s) => dispatch({ type: "DELETE_PLACEMENT", id: s.id }));
              sel.filter((s) => s.kind === "connection").forEach((s) => dispatch({ type: "DELETE_CONNECTION", id: s.id }));
            })}>Delete selected</CommandItem>
          )}
          {hasPlacementSel && (
            <CommandItem onSelect={() => run(() => {
              const p = state.placements.find((pl) => sel.some((s) => s.kind === "placement" && s.id === pl.id));
              if (p) dispatch({ type: "DUPLICATE_PLACEMENT", id: p.id });
            })}>Duplicate selected</CommandItem>
          )}
          {hasPlacementSel && (
            <CommandItem onSelect={() => run(() => {
              const selPlacements = sel
                .filter((s) => s.kind === "placement")
                .map((s) => state.placements.find((p) => p.id === s.id))
                .filter(Boolean) as Placement[];
              if (selPlacements.length > 0) {
                const payload = JSON.stringify({ version: 1, placements: selPlacements });
                localClipboard = payload;
                navigator.clipboard.writeText(payload).catch(() => {});
              }
            })}>Copy selected</CommandItem>
          )}
          {localClipboard && (
            <CommandItem onSelect={() => run(() => {
              try {
                const parsed = JSON.parse(localClipboard);
                if (parsed.placements && Array.isArray(parsed.placements)) {
                  dispatch({ type: "PASTE_PLACEMENTS", placements: parsed.placements });
                }
              } catch { /* ignore */ }
            })}>Paste</CommandItem>
          )}
        </CommandGroup>
        {state.connections.length > 0 && (
          <CommandGroup heading="Routes">
            <CommandItem onSelect={() => run(() => state.connections.forEach((c) => dispatch({ type: "LOCK_CONNECTION", id: c.id })))}>Lock all routes</CommandItem>
            <CommandItem onSelect={() => run(() => state.connections.forEach((c) => dispatch({ type: "UNLOCK_CONNECTION", id: c.id })))}>Unlock all routes</CommandItem>
            <CommandItem onSelect={() => run(() => {
              const connectedIds = new Set<string>();
              state.connections.forEach((c) => { connectedIds.add(c.from.placementId); connectedIds.add(c.to.placementId); });
              state.placements.forEach((p) => { if (!connectedIds.has(p.id)) dispatch({ type: "DELETE_PLACEMENT", id: p.id }); });
            })}>Delete unconnected placements</CommandItem>
          </CommandGroup>
        )}
        {hasPlacementSel && sel.filter((s) => s.kind === "placement").length >= 2 && (
          <CommandGroup heading="Align">
            <CommandItem onSelect={() => run(() => {
              const targets = sel.filter((s): s is { kind: "placement"; id: string } => s.kind === "placement");
              const ps = targets.map((s) => state.placements.find((p) => p.id === s.id)).filter(Boolean) as Placement[];
              if (ps.length < 2) return;
              const minX = Math.min(...ps.map((p) => p.x));
              ps.forEach((p) => dispatch({ type: "UPDATE_PLACEMENT", id: p.id, patch: { x: minX } }));
            })}>Align left</CommandItem>
            <CommandItem onSelect={() => run(() => {
              const targets = sel.filter((s): s is { kind: "placement"; id: string } => s.kind === "placement");
              const ps = targets.map((s) => state.placements.find((p) => p.id === s.id)).filter(Boolean) as Placement[];
              if (ps.length < 2) return;
              const maxX = Math.max(...ps.map((p) => p.x));
              ps.forEach((p) => dispatch({ type: "UPDATE_PLACEMENT", id: p.id, patch: { x: maxX } }));
            })}>Align right</CommandItem>
            <CommandItem onSelect={() => run(() => {
              const targets = sel.filter((s): s is { kind: "placement"; id: string } => s.kind === "placement");
              const ps = targets.map((s) => state.placements.find((p) => p.id === s.id)).filter(Boolean) as Placement[];
              if (ps.length < 2) return;
              const avgX = ps.reduce((sum, p) => sum + p.x, 0) / ps.length;
              ps.forEach((p) => dispatch({ type: "UPDATE_PLACEMENT", id: p.id, patch: { x: avgX } }));
            })}>Align center X</CommandItem>
            <CommandItem onSelect={() => run(() => {
              const targets = sel.filter((s): s is { kind: "placement"; id: string } => s.kind === "placement");
              const ps = targets.map((s) => state.placements.find((p) => p.id === s.id)).filter(Boolean) as Placement[];
              if (ps.length < 2) return;
              const minY = Math.min(...ps.map((p) => p.y));
              ps.forEach((p) => dispatch({ type: "UPDATE_PLACEMENT", id: p.id, patch: { y: minY } }));
            })}>Align top</CommandItem>
            <CommandItem onSelect={() => run(() => {
              const targets = sel.filter((s): s is { kind: "placement"; id: string } => s.kind === "placement");
              const ps = targets.map((s) => state.placements.find((p) => p.id === s.id)).filter(Boolean) as Placement[];
              if (ps.length < 2) return;
              const maxY = Math.max(...ps.map((p) => p.y));
              ps.forEach((p) => dispatch({ type: "UPDATE_PLACEMENT", id: p.id, patch: { y: maxY } }));
            })}>Align bottom</CommandItem>
            <CommandItem onSelect={() => run(() => {
              const targets = sel.filter((s): s is { kind: "placement"; id: string } => s.kind === "placement");
              const ps = targets.map((s) => state.placements.find((p) => p.id === s.id)).filter(Boolean) as Placement[];
              if (ps.length < 2) return;
              const avgY = ps.reduce((sum, p) => sum + p.y, 0) / ps.length;
              ps.forEach((p) => dispatch({ type: "UPDATE_PLACEMENT", id: p.id, patch: { y: avgY } }));
            })}>Align center Y</CommandItem>
            <CommandItem onSelect={() => run(() => {
              const targets = sel.filter((s): s is { kind: "placement"; id: string } => s.kind === "placement");
              const ps = targets.map((s) => state.placements.find((p) => p.id === s.id)).filter(Boolean) as Placement[];
              if (ps.length < 3) return;
              const sorted = [...ps].sort((a, b) => a.x - b.x);
              const minX = sorted[0].x, maxX = sorted[sorted.length - 1].x;
              const step = (maxX - minX) / (sorted.length - 1);
              sorted.forEach((p, i) => dispatch({ type: "UPDATE_PLACEMENT", id: p.id, patch: { x: minX + step * i } }));
            })}>Distribute horizontally</CommandItem>
            <CommandItem onSelect={() => run(() => {
              const targets = sel.filter((s): s is { kind: "placement"; id: string } => s.kind === "placement");
              const ps = targets.map((s) => state.placements.find((p) => p.id === s.id)).filter(Boolean) as Placement[];
              if (ps.length < 3) return;
              const sorted = [...ps].sort((a, b) => a.y - b.y);
              const minY = sorted[0].y, maxY = sorted[sorted.length - 1].y;
              const step = (maxY - minY) / (sorted.length - 1);
              sorted.forEach((p, i) => dispatch({ type: "UPDATE_PLACEMENT", id: p.id, patch: { y: minY + step * i } }));
            })}>Distribute vertically</CommandItem>
          </CommandGroup>
        )}
        {hasPlacementSel && (
          <CommandGroup heading="Transform">
            <CommandItem onSelect={() => run(() => {
              sel.filter((s) => s.kind === "placement").forEach((s) => {
                const p = state.placements.find((pl) => pl.id === s.id);
                if (p) dispatch({ type: "UPDATE_PLACEMENT", id: s.id, patch: { rotation: (p.rotation + 90) % 360 } });
              });
            })}>Rotate 90°</CommandItem>
            <CommandItem onSelect={() => run(() => {
              sel.filter((s) => s.kind === "placement").forEach((s) => {
                dispatch({ type: "MIRROR_PLACEMENT", id: s.id });
              });
            })}>Mirror selected</CommandItem>
          </CommandGroup>
        )}
        {hasPlacementSel && (
          <CommandGroup heading="Lock">
            <CommandItem onSelect={() => run(() => {
              sel.filter((s) => s.kind === "placement").forEach((s) => dispatch({ type: "LOCK_PLACEMENT", id: s.id }));
            })}>Lock selected</CommandItem>
            <CommandItem onSelect={() => run(() => {
              sel.filter((s) => s.kind === "placement").forEach((s) => dispatch({ type: "UNLOCK_PLACEMENT", id: s.id }));
            })}>Unlock selected</CommandItem>
          </CommandGroup>
        )}
        {hasPlacementSel && (
          <CommandGroup heading="Array">
            <CommandItem onSelect={() => run(() => {
              const selPlacements = sel.filter((s) => s.kind === "placement").map((s) => state.placements.find((p) => p.id === s.id)).filter(Boolean) as Placement[];
              const spacing = 1.0;
              const copies = selPlacements.flatMap((p, idx) =>
                [1, 2].map((col) => ({
                  ...p,
                  id: `pl_${p.componentId}_${Date.now()}_${idx}_${col}`,
                  name: `${p.name}_copy${col}`,
                  x: p.x + spacing * col,
                  y: p.y,
                })),
              );
              dispatch({ type: "PASTE_PLACEMENTS", placements: copies });
            })}>Duplicate in row ×3</CommandItem>
            <CommandItem onSelect={() => run(() => {
              const selPlacements = sel.filter((s) => s.kind === "placement").map((s) => state.placements.find((p) => p.id === s.id)).filter(Boolean) as Placement[];
              const spacing = 1.0;
              const copies = selPlacements.flatMap((p, idx) =>
                [1, 2].map((row) => ({
                  ...p,
                  id: `pl_${p.componentId}_${Date.now()}_${idx}_${row}`,
                  name: `${p.name}_copy${row}`,
                  x: p.x,
                  y: p.y + spacing * row,
                })),
              );
              dispatch({ type: "PASTE_PLACEMENTS", placements: copies });
            })}>Duplicate in column ×3</CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}

function KeyboardShortcutsHelp({ onClose }: { onClose: () => void }) {
  const groups = [
    {
      title: "Navigation",
      items: [
        { key: "+ / -", action: "Zoom in / out" },
        { key: "0", action: "Reset zoom" },
        { key: "F", action: "Fit to content" },
        { key: "Shift + F", action: "Zoom to selection" },
        { key: "Space", action: "Toggle pan tool" },
      ],
    },
    {
      title: "Selection",
      items: [
        { key: "Click", action: "Select object" },
        { key: "Shift + Click", action: "Toggle selection" },
        { key: "Tab", action: "Cycle selection" },
        { key: "Ctrl + A", action: "Select all" },
        { key: "Ctrl + Shift + A", action: "Deselect all" },
        { key: "Delete", action: "Delete selected" },
      ],
    },
    {
      title: "Placement",
      items: [
        { key: "Drag", action: "Move placement" },
        { key: "Escape (dragging)", action: "Cancel drag" },
        { key: "Ctrl + A", action: "Select all placements" },
        { key: "Ctrl + Shift + A", action: "Invert selection" },
        { key: "Ctrl + D", action: "Duplicate placement" },
        { key: "Ctrl + C", action: "Copy selected" },
        { key: "Ctrl + V", action: "Paste" },
        { key: "R", action: "Rotate 90°" },
        { key: "M", action: "Mirror horizontally" },
        { key: "N", action: "Select net" },
        { key: "L", action: "Toggle lock" },
        { key: "Arrow keys", action: "Nudge" },
        { key: "Shift + Arrow", action: "Nudge coarse" },
      ],
    },
    {
      title: "General",
      items: [
        { key: "0", action: "Reset view" },
        { key: "F", action: "Fit to content" },
        { key: "Shift + F", action: "Zoom to selection" },
        { key: "Space", action: "Toggle pan tool" },
        { key: "+", action: "Zoom in" },
        { key: "-", action: "Zoom out" },
        { key: "G", action: "Toggle grid" },
        { key: "C", action: "Toggle routes" },
        { key: "I", action: "Toggle component IDs" },
        { key: "U", action: "Toggle rulers" },
        { key: "H", action: "Toggle HUD" },
        { key: "Ctrl / Cmd + 1–9", action: "Switch tab" },
        { key: "Ctrl / Cmd + T", action: "New tab" },
        { key: "Ctrl / Cmd + W", action: "Close tab" },
        { key: "Ctrl / Cmd + K", action: "Command palette" },
        { key: "Ctrl + S", action: "Save workspace" },
        { key: "Ctrl + Z", action: "Undo" },
        { key: "Ctrl + Shift + Z", action: "Redo" },
        { key: "?", action: "Toggle this help" },
        { key: "Escape", action: "Clear selection / cancel pin" },
      ],
    },
  ];

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.title}>
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{g.title}</h3>
              <div className="flex flex-col gap-1">
                {g.items.map((item) => (
                  <div key={item.key} className="flex items-center justify-between py-1">
                    <span className="text-sm text-foreground">{item.action}</span>
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-mono font-semibold text-muted-foreground">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
