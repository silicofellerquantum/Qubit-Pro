/**
 * ProjectContext — manages the "active project" that connects all tools.
 *
 * Flow:
 *   Projects page selects a project → stored here
 *   Designer generates a chip → auto-saved to active project
 *   QCLang editor compiles → saves .qc file to active project
 *   Canvas edits → debounced save to active project
 *   Verification / Simulation → runs against active project
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import {
  type Project,
  type GenerateResponse,
  fetchProjects,
  fetchProject,
  createProject,
  saveDesignToProject,
  updateProject,
  loginUser,
} from "@/lib/api/backend";
import { useDesign } from "@/lib/design-context";

interface ProjectContextProps {
  projects: Project[];
  activeProject: Project | null;
  setActiveProject: (p: Project | null) => void;
  refreshProjects: () => Promise<void>;
  createAndActivate: (data: {
    name: string;
    topology?: string;
    num_qubits?: number;
    target_frequency_ghz?: number;
    substrate_material?: string;
    metal_layer?: string;
  }) => Promise<Project>;
  saveDesign: (payload: GenerateResponse) => Promise<void>;
  backendOnline: boolean;
  setBackendOnline: (v: boolean) => void;
}

const ProjectContext = createContext<ProjectContextProps | undefined>(undefined);

const STORAGE_KEY = "qs.active_project_id";

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, _setActiveProject] = useState<Project | null>(null);
  const [backendOnline, setBackendOnline] = useState(false);

  const design = useDesign();
  const lastLoadedProjectIdRef = useRef<string | null>(null);

  // Fetch full project with design_payload when activeProject changes and is missing its payload
  useEffect(() => {
    if (!activeProject || activeProject.design_payload !== undefined) return;

    let active = true;
    async function loadFullProject() {
      try {
        const fullProject = await fetchProject(activeProject!.id);
        if (active) {
          _setActiveProject(fullProject);
        }
      } catch (err) {
        console.error("Failed to fetch full project details", err);
      }
    }
    loadFullProject();
    return () => {
      active = false;
    };
  }, [activeProject]);

  // Synchronize design conversation once when project is loaded/switched
  useEffect(() => {
    if (!activeProject) {
      lastLoadedProjectIdRef.current = null;
      return;
    }
    // design_payload === undefined means the full project hasn't been fetched yet
    // (list endpoint omits it). Wait until it's been fetched (null = fetched, no design).
    if (activeProject.design_payload === undefined) return;

    if (lastLoadedProjectIdRef.current === activeProject.id) {
      // Already initialized this project session, don't overwrite user changes
      if (design.activeId !== activeProject.id) {
        design.setActiveId(activeProject.id);
      }
      return;
    }

    lastLoadedProjectIdRef.current = activeProject.id;

    const existing = design.conversations.find((c) => c.id === activeProject.id);
    if (existing) {
      design.setConversations((cs) =>
        cs.map((c) =>
          c.id === activeProject.id
            ? { ...c, result: activeProject.design_payload || null, title: activeProject.name }
            : c,
        ),
      );
      if (design.activeId !== activeProject.id) {
        design.setActiveId(activeProject.id);
      }
    } else {
      const newConv = {
        id: activeProject.id,
        title: activeProject.name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [
          {
            role: "ai" as const,
            text: "Welcome to Silicofeller AI Quantum Designer. Describe the architecture, qubit counts, topological interfaces, or cryogenic constraints of the processor you wish to synthesize.",
          },
        ],
        result: activeProject.design_payload || null,
      };
      design.setConversations((cs) => [newConv, ...cs]);
      design.setActiveId(activeProject.id);
    }
  }, [
    activeProject,
    design.activeId,
    design.conversations,
    design.setActiveId,
    design.setConversations,
  ]);

  const setActiveProject = useCallback((p: Project | null) => {
    // Reset the guard so that switching to this project always reloads its design
    if (!p || p.id !== lastLoadedProjectIdRef.current) {
      lastLoadedProjectIdRef.current = null;
    }
    _setActiveProject(p);
    if (p) {
      try {
        localStorage.setItem(STORAGE_KEY, p.id);
      } catch {}
    } else {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    }
  }, []);

  const refreshProjects = useCallback(async () => {
    const _doFetch = async () => {
      const data = await fetchProjects();
      setProjects(data);
      setBackendOnline(true);

      // Restore active project from storage
      const savedId = localStorage.getItem(STORAGE_KEY);
      if (savedId) {
        const found = data.find((p) => p.id === savedId);
        if (found) {
          _setActiveProject(found);
        } else {
          _setActiveProject(null);
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {}
        }
      }
    };

    try {
      await _doFetch();
    } catch (err: any) {
      const isAuthError =
        err instanceof Error &&
        (err.message.includes("API 401") || err.message.includes("API 403"));

      if (isAuthError) {
        // JWT expired — try to silently re-authenticate using stored user email
        try {
          const storedUser = localStorage.getItem("silicofeller.auth.user");
          const userObj = storedUser ? JSON.parse(storedUser) : null;
          const email = userObj?.email;
          if (email) {
            await loginUser(email, "password");
            // Token refreshed — retry the fetch
            await _doFetch();
            return;
          }
        } catch {
          // Auto-refresh failed — clear stale token so user gets redirected to login
          try {
            localStorage.removeItem("qs_token");
          } catch {}
        }
      }

      // Backend offline or unrecoverable error
      setBackendOnline(false);
    }
  }, []);

  useEffect(() => {
    refreshProjects();
  }, []);

  const createAndActivate = useCallback(
    async (data: Parameters<ProjectContextProps["createAndActivate"]>[0]) => {
      const p = await createProject(data);
      setProjects((prev) => [p, ...prev]);
      // Immediately create a conversation entry for this new project so the
      // schematic editor can find it via conversationId=newProject.id
      const newConv = {
        id: p.id,
        title: p.name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [
          {
            role: "ai" as const,
            text: "Welcome to Silicofeller AI Quantum Designer. Describe the architecture, qubit counts, topological interfaces, or cryogenic constraints of the processor you wish to synthesize.",
          },
        ],
        result: null,
      };
      design.setConversations((cs) => {
        const exists = cs.some((c) => c.id === p.id);
        return exists ? cs : [newConv, ...cs];
      });
      design.setActiveId(p.id);
      setActiveProject(p);
      return p;
    },
    [setActiveProject, design],
  );

  const saveDesign = useCallback(
    async (payload: GenerateResponse) => {
      if (!activeProject) return;
      try {
        await saveDesignToProject(activeProject.id, payload);
        const now = new Date().toISOString();
        // Update local state immediately — no full refresh needed
        setProjects((prev) =>
          prev.map((p) =>
            p.id === activeProject.id
              ? {
                  ...p,
                  has_design: true,
                  num_qubits: payload.num_qubits,
                  topology: payload.topology,
                  updated_at: now,
                }
              : p,
          ),
        );
        _setActiveProject((prev) =>
          prev?.id === activeProject.id
            ? {
                ...prev,
                has_design: true,
                num_qubits: payload.num_qubits,
                topology: payload.topology,
                design_payload: payload,
                updated_at: now,
              }
            : prev,
        );
      } catch {
        // Backend offline — silently skip persistence
      }
    },
    [activeProject],
  );

  return (
    <ProjectContext.Provider
      value={{
        projects,
        activeProject,
        setActiveProject,
        refreshProjects,
        createAndActivate,
        saveDesign,
        backendOnline,
        setBackendOnline,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}
