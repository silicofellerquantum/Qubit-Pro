/**
 * workspace-store.tsx — Multi-canvas workspace state management.
 *
 * Persistence strategy (two-tier):
 *   1. localStorage — fast local cache, works offline
 *   2. Supabase (via backend API) — cloud source of truth when a project is active
 */
import {
  createContext, useCallback, useContext, useEffect,
  useMemo, useReducer, useRef, type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  editorReducer, initialEditorState,
  type EditorState, type EditorAction,
} from "./design-store";
import type { DesignDocument } from "@/lib/bridge/types";
import { getProjectWorkspace, saveProjectWorkspace, fetchProject } from "@/lib/api/backend";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CanvasTab {
  id: string;
  name: string;
  state: EditorState;
  dirty: boolean;
  savedAt: number | null;
}

export interface WorkspaceState {
  tabs: CanvasTab[];
  activeId: string;
  saveStatus: "saved" | "unsaved" | "saving";
}

type WorkspaceAction =
  | { type: "NEW_CANVAS"; name?: string; id?: string }
  | { type: "CLOSE_CANVAS"; id: string }
  | { type: "SWITCH_CANVAS"; id: string }
  | { type: "RENAME_CANVAS"; id: string; name: string }
  | { type: "CANVAS_ACTION"; id: string; action: EditorAction }
  | { type: "LOAD_INTO_CANVAS"; id: string; doc: DesignDocument }
  | { type: "MARK_SAVED"; id: string }
  | { type: "SET_SAVE_STATUS"; status: WorkspaceState["saveStatus"] }
  | { type: "RESET_WORKSPACE"; state: WorkspaceState };

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `canvas_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function uniqueName(existing: string[]): string {
  let n = 1;
  while (existing.includes(`Untitled${n}`)) n++;
  return `Untitled${n}`;
}

function makeTab(name: string, id?: string): CanvasTab {
  return { id: id ?? generateId(), name, state: { ...initialEditorState }, dirty: false, savedAt: null };
}

// ── Initial state ─────────────────────────────────────────────────────────────

function makeInitialState(): WorkspaceState {
  const first = makeTab("Untitled1");
  return { tabs: [first], activeId: first.id, saveStatus: "saved" };
}

// ── Reducer ───────────────────────────────────────────────────────────────────

function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "NEW_CANVAS": {
      const name = action.name?.trim() || uniqueName(state.tabs.map((t) => t.name));
      const tab  = makeTab(name, action.id);
      return { ...state, tabs: [...state.tabs, tab], activeId: tab.id, saveStatus: "unsaved" };
    }
    case "CLOSE_CANVAS": {
      if (state.tabs.length === 1)
        return { ...state, tabs: [{ ...state.tabs[0], state: { ...initialEditorState }, dirty: false }], saveStatus: "saved" };
      const idx     = state.tabs.findIndex((t) => t.id === action.id);
      const newTabs = state.tabs.filter((t) => t.id !== action.id);
      const newActive = state.activeId === action.id ? (newTabs[Math.max(0, idx - 1)]?.id ?? newTabs[0].id) : state.activeId;
      return { ...state, tabs: newTabs, activeId: newActive, saveStatus: "unsaved" };
    }
    case "SWITCH_CANVAS":
      return { ...state, activeId: action.id };
    case "RENAME_CANVAS":
      return { ...state, tabs: state.tabs.map((t) => t.id === action.id ? { ...t, name: action.name, dirty: true } : t), saveStatus: "unsaved" };
    case "CANVAS_ACTION": {
      const newTabs = state.tabs.map((t) =>
        t.id !== action.id ? t : { ...t, state: editorReducer(t.state, action.action), dirty: true },
      );
      return { ...state, tabs: newTabs, saveStatus: "unsaved" };
    }
    case "LOAD_INTO_CANVAS": {
      const newTabs = state.tabs.map((t) =>
        t.id !== action.id ? t : { ...t, state: editorReducer(t.state, { type: "LOAD", doc: action.doc }), dirty: true },
      );
      return { ...state, tabs: newTabs, activeId: action.id, saveStatus: "unsaved" };
    }
    case "MARK_SAVED": {
      const now = Date.now();
      const newTabs = state.tabs.map((t) => t.id === action.id ? { ...t, dirty: false, savedAt: now } : t);
      const allSaved = newTabs.every((t) => !t.dirty);
      return { ...state, tabs: newTabs, saveStatus: allSaved ? "saved" : "unsaved" };
    }
    case "SET_SAVE_STATUS":
      return { ...state, saveStatus: action.status };
    case "RESET_WORKSPACE":
      return action.state;
    default:
      return state;
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────

const WORKSPACE_KEY = "silicofeller:workspace:v2";
const CURRENT_SCHEMA_VERSION = 6;

interface PersistedWorkspace extends Omit<WorkspaceState, "tabs"> {
  version: number;
  tabs: Array<Omit<CanvasTab, "state"> & { state: Partial<EditorState> }>;
}

function persistWorkspace(ws: WorkspaceState): boolean {
  try {
    const slim: PersistedWorkspace = {
      ...ws,
      version: CURRENT_SCHEMA_VERSION,
      tabs: ws.tabs.map((t) => ({ ...t, state: { ...t.state, past: [], future: [] } })),
      saveStatus: "saved" as const,
    };
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(slim));
    return true;
  } catch {
    return false;
  }
}

function migrateWorkspace(data: unknown): PersistedWorkspace | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const version = typeof d.version === "number" ? d.version : 1;
  if (!Array.isArray(d.tabs) || d.tabs.length === 0) return null;

  // v1 -> v2: normalize selection to array
  if (version < 2) {
    d.tabs = (d.tabs as any[]).map((t) => ({
      ...t,
      state: {
        ...t.state,
        selection: Array.isArray(t.state?.selection) ? t.state.selection : [],
      },
    }));
  }

  // v2 -> v3: ensure snap field exists
  if (version < 3) {
    d.tabs = (d.tabs as any[]).map((t) => ({
      ...t,
      state: {
        ...t.state,
        snap: t.state?.snap ?? 0.05,
      },
    }));
  }

  // v3 -> v4: ensure showComponentIds field exists
  if (version < 4) {
    d.tabs = (d.tabs as any[]).map((t) => ({
      ...t,
      state: {
        ...t.state,
        showComponentIds: t.state?.showComponentIds ?? false,
      },
    }));
  }

  // v4 -> v5: ensure showHUD field exists
  if (version < 5) {
    d.tabs = (d.tabs as any[]).map((t) => ({
      ...t,
      state: {
        ...t.state,
        showHUD: t.state?.showHUD ?? true,
      },
    }));
  }

  // v5 -> v6: ensure showRulers field exists
  if (version < 6) {
    d.tabs = (d.tabs as any[]).map((t) => ({
      ...t,
      state: {
        ...t.state,
        showRulers: t.state?.showRulers ?? true,
      },
    }));
  }

  return { ...d, version: CURRENT_SCHEMA_VERSION } as PersistedWorkspace;
}

function loadWorkspace(): WorkspaceState | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const migrated = migrateWorkspace(parsed);
    if (!migrated) return null;
    return {
      ...migrated, saveStatus: "saved",
      tabs: migrated.tabs.map((t) => ({
        ...t,
        state: {
          ...initialEditorState,
          ...t.state,
          selection: Array.isArray(t.state.selection) ? t.state.selection : [],
          past: [],
          future: [],
        } as EditorState,
      })),
    };
  } catch { return null; }
}

// ── Context ───────────────────────────────────────────────────────────────────

export interface WorkspaceContextValue {
  workspace: WorkspaceState;
  activeTab: CanvasTab;
  dispatch: (action: WorkspaceAction) => void;
  dispatchActive: (action: EditorAction) => void;
  newCanvas: (name?: string, doc?: DesignDocument, customId?: string) => string;
  loadIntoCanvas: (canvasId: string, doc: DesignDocument) => void;
  saveAll: () => void;
  syncToBackend: (projectId: string) => Promise<void>;
  loadFromBackend: (projectId: string) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children, activeProjectId }: { children: ReactNode; activeProjectId?: string | null }) {
  const [workspace, dispatch] = useReducer(workspaceReducer, null, () => loadWorkspace() ?? makeInitialState());

  const activeTab = useMemo(
    () => workspace.tabs.find((t) => t.id === workspace.activeId) ?? workspace.tabs[0],
    [workspace],
  );

  const dispatchActive = useCallback(
    (action: EditorAction) => dispatch({ type: "CANVAS_ACTION", id: workspace.activeId, action }),
    [workspace.activeId],
  );

  const newCanvas = useCallback((name?: string, doc?: DesignDocument, customId?: string): string => {
    const existingNames = workspace.tabs.map((t) => t.name);
    const resolvedName  = name?.trim() || uniqueName(existingNames);
    const newId = customId ?? generateId();
    dispatch({ type: "NEW_CANVAS", name: resolvedName, id: newId });
    if (doc) dispatch({ type: "LOAD_INTO_CANVAS", id: newId, doc });
    return newId;
  }, [workspace.tabs]);

  const loadIntoCanvas = useCallback((canvasId: string, doc: DesignDocument) => {
    dispatch({ type: "LOAD_INTO_CANVAS", id: canvasId, doc });
    dispatch({ type: "SWITCH_CANVAS", id: canvasId });
  }, []);

  // ── Backend sync helpers ─────────────────────────────────────────────────────

  const syncToBackend = useCallback(async (projectId: string) => {
    try {
      await saveProjectWorkspace(projectId, workspace);
    } catch {
      // silently fail if backend is offline — localStorage still has it
    }
  }, [workspace]);

  const loadFromBackend = useCallback(async (projectId: string) => {
    try {
      const remote = await getProjectWorkspace(projectId);
      if (remote) {
        const migrated = migrateWorkspace(remote);
        if (migrated) {
          const restored: WorkspaceState = {
            ...migrated,
            saveStatus: "saved",
            tabs: migrated.tabs.map((t) => ({
              ...t,
              state: {
                ...initialEditorState,
                ...t.state,
                selection: Array.isArray(t.state.selection) ? t.state.selection : [],
                past: [],
                future: [],
              } as EditorState,
            })),
          };
          persistWorkspace(restored);
          dispatch({ type: "RESET_WORKSPACE", state: restored });
          return;
        }
      }

      // No remote workspace saved yet, or migration failed. Check if project has design_payload
      const project = await fetchProject(projectId);
      if (project && project.design_payload) {
        // Local helper to extract design document from response
        const designFromPayload = (payload: any): DesignDocument => {
          const empty: DesignDocument = { placements: [], connections: [] };
          if (!payload) return empty;
          if (payload.design && payload.design.placements && payload.design.connections) {
            return {
              placements: payload.design.placements,
              connections: payload.design.connections,
            };
          }
          if (payload.placements && payload.connections) {
            return {
              placements: payload.placements,
              connections: payload.connections,
            };
          }
          return empty;
        };

        const doc = designFromPayload(project.design_payload);
        if (doc.placements.length > 0) {
          const firstTabId = `canvas_project_${projectId}`;
          const initialTab: CanvasTab = {
            id: firstTabId,
            name: project.name || "Schematic",
            state: editorReducer({ ...initialEditorState }, { type: "LOAD", doc }),
            dirty: false,
            savedAt: Date.now(),
          };
          const ws: WorkspaceState = {
            tabs: [initialTab],
            activeId: firstTabId,
            saveStatus: "saved",
          };
          persistWorkspace(ws);
          dispatch({ type: "RESET_WORKSPACE", state: ws });
          return;
        }
      }

      // Fallback: create a fresh workspace for this project
      const freshProject = project || await fetchProject(projectId).catch(() => null);
      const firstTabId = `canvas_project_${projectId}`;
      const freshTab = makeTab(freshProject?.name || "Schematic", firstTabId);
      const ws: WorkspaceState = {
        tabs: [freshTab],
        activeId: firstTabId,
        saveStatus: "saved",
      };
      persistWorkspace(ws);
      dispatch({ type: "RESET_WORKSPACE", state: ws });
    } catch {
      // Backend offline — localStorage remains as fallback
    }
  }, []);

  // Load workspace when activeProjectId changes
  useEffect(() => {
    if (activeProjectId) {
      loadFromBackend(activeProjectId);
    }
  }, [activeProjectId, loadFromBackend]);

  // ── Save all (localStorage + backend) ────────────────────────────────────────

  const saveAll = useCallback(() => {
    dispatch({ type: "SET_SAVE_STATUS", status: "saving" });
    const ok = persistWorkspace(workspace);
    if (!ok) {
      toast.error("Save failed: localStorage quota exceeded. Export your design to avoid data loss.");
      dispatch({ type: "SET_SAVE_STATUS", status: "unsaved" });
      return;
    }
    workspace.tabs.forEach((t) => dispatch({ type: "MARK_SAVED", id: t.id }));
    dispatch({ type: "SET_SAVE_STATUS", status: "saved" });
    // Sync to Supabase if a project is active
    if (activeProjectId) {
      saveProjectWorkspace(activeProjectId, workspace).catch(() => {});
    }
  }, [workspace, activeProjectId]);

  // Debounced auto-persist on every change
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const savingRef = useRef(false);
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;

  useEffect(() => {
    if (workspace.saveStatus !== "unsaved") return;
    const t = setTimeout(() => {
      if (savingRef.current) return;
      savingRef.current = true;
      dispatch({ type: "SET_SAVE_STATUS", status: "saving" });
      const ok = persistWorkspace(workspaceRef.current);
      savingRef.current = false;
      if (!ok) {
        toast.error("Auto-save failed: localStorage quota exceeded.");
        dispatch({ type: "SET_SAVE_STATUS", status: "unsaved" });
        return;
      }
      workspaceRef.current.tabs.forEach((tab) => dispatch({ type: "MARK_SAVED", id: tab.id }));
      dispatch({ type: "SET_SAVE_STATUS", status: "saved" });
      // Cloud sync
      if (activeProjectIdRef.current) {
        saveProjectWorkspace(activeProjectIdRef.current, workspaceRef.current).catch(() => {});
      }
    }, 1_000);
    return () => clearTimeout(t);
  }, [workspace]);

  // Auto-save every 25 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const ws = workspaceRef.current;
      if (ws.saveStatus === "unsaved" && !savingRef.current) {
        savingRef.current = true;
        dispatch({ type: "SET_SAVE_STATUS", status: "saving" });
        const ok = persistWorkspace(ws);
        savingRef.current = false;
        if (!ok) {
          toast.error("Auto-save failed: localStorage quota exceeded.");
          dispatch({ type: "SET_SAVE_STATUS", status: "unsaved" });
          return;
        }
        ws.tabs.forEach((t) => dispatch({ type: "MARK_SAVED", id: t.id }));
        dispatch({ type: "SET_SAVE_STATUS", status: "saved" });
        if (activeProjectIdRef.current) {
          saveProjectWorkspace(activeProjectIdRef.current, ws).catch(() => {});
        }
      }
    }, 25_000);
    return () => clearInterval(interval);
  }, []);

  // Warn before closing if unsaved
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasUnsaved = workspaceRef.current.tabs.some((t) => t.dirty);
      if (hasUnsaved) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({ workspace, activeTab, dispatch, dispatchActive, newCanvas, loadIntoCanvas, saveAll, syncToBackend, loadFromBackend }),
    [workspace, activeTab, dispatchActive, newCanvas, loadIntoCanvas, saveAll, syncToBackend, loadFromBackend],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}
