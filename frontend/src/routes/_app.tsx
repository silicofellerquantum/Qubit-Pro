import { createFileRoute, Outlet, useNavigate, Link, useRouterState } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app/app-sidebar";

import { useAuth } from "@/lib/auth/auth-context";
import { DesignProvider } from "@/lib/design-context";
import { ProjectProvider, useProject } from "@/lib/project-context";
import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

// ─── Credit Balance Indicator ─────────────────────────────────────────────
// Reads from localStorage so it updates across all pages without API calls.
// Credits are only deducted when a simulation actually runs.
const CREDIT_KEY = "qs_credits";
const CREDIT_DEFAULT = 50;

export function getCreditBalance(): number {
  if (typeof window === "undefined") return CREDIT_DEFAULT;
  const v = localStorage.getItem(CREDIT_KEY);
  return v !== null ? Number(v) : CREDIT_DEFAULT;
}

export function deductCredit(amount = 1): number {
  const next = Math.max(0, getCreditBalance() - amount);
  localStorage.setItem(CREDIT_KEY, String(next));
  window.dispatchEvent(new Event("qs:credits:changed"));
  return next;
}

function CreditBalanceIndicator() {
  const [credits, setCredits] = useState<number>(getCreditBalance);

  useEffect(() => {
    const sync = () => setCredits(getCreditBalance());
    window.addEventListener("qs:credits:changed", sync);
    return () => window.removeEventListener("qs:credits:changed", sync);
  }, []);

  const pct  = Math.round((credits / CREDIT_DEFAULT) * 100);
  const low  = credits <= 10;
  const warn = credits <= 25;

  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold select-none",
      low  ? "bg-rose-50 border-rose-200 text-rose-700" :
      warn ? "bg-amber-50 border-amber-200 text-amber-700" :
             "bg-violet-50 border-violet-200 text-violet-700",
    )}>
      <Zap className={cn("h-3.5 w-3.5", low ? "text-rose-500" : warn ? "text-amber-500" : "text-violet-500")} />
      <span>{credits} credits</span>
      <span className={cn("text-[10px] font-normal",
        low ? "text-rose-500" : warn ? "text-amber-500" : "text-violet-400")}>
        {low ? "low" : warn ? "limited" : `${pct}%`}
      </span>
    </div>
  );
}

function AppHeader({ getPageTitle }: { getPageTitle: () => string }) {
  const { user } = useAuth();
  const { activeProject } = useProject();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/50 bg-white/70 px-4 backdrop-blur-md shadow-[0_1px_2px_0_rgba(0,0,0,0.01)] select-none">
      {/* Left Group */}
      <div className="flex items-center gap-3">
        <SidebarTrigger className="h-10 w-10 min-h-[44px] min-w-[44px] rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all cursor-pointer shadow-sm active:scale-95 flex items-center justify-center" />
        <span className="h-4 w-px bg-slate-200" />
        <h1 className="text-sm font-black text-slate-900 tracking-tight font-display">
          {getPageTitle()}
        </h1>
      </div>
      {/* Right Group — credit balance always visible */}
      <CreditBalanceIndicator />
    </header>
  );
}

function AppLayout() {
  const navigate = useNavigate();
  const { user, hydrated } = useAuth();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  useEffect(() => {
    if (hydrated && !user) navigate({ to: "/sign-in", replace: true });
  }, [hydrated, user, navigate]);

  if (!hydrated || !user) return null;

  // Resolve clean dynamic page title
  const TITLES: Record<string, string> = {
    "/dashboard": "Workspace",
    "/projects": "Projects",
    "/designer": "Design Copilot",
    "/architecture-explorer": "Architecture Explorer",
    "/schematic-editor": "Schematic Editor",
    "/layout-viewer": "Layout Viewer",
    "/component-library": "Component Library",
    "/simulations": "Simulations",
    "/physics-analysis": "Physics Analysis",
    "/verification": "Verification",
    "/results": "Results",
    "/version-control": "Version Control",
    "/reports": "Reports",
    "/team": "Users & Teams",
    "/integrations": "Integrations",
    "/billing": "Billing & Usage",
    "/settings": "Settings",
    "/profile": "User Profile",
    "/about": "About Platform",
    "/admin": "Admin Console",
  };
  const getPageTitle = () => TITLES[pathname] || "Workspace";

  return (
    <DesignProvider>
      <ProjectProvider>
      <SidebarProvider className="h-screen min-h-0 overflow-hidden">
        <div className="flex h-full w-full bg-background text-slate-800 font-sans app-workspace overflow-hidden">
          <AppSidebar />
          <SidebarInset className="flex flex-1 flex-col overflow-hidden">
            <AppHeader getPageTitle={getPageTitle} />

            <main className="flex-1 overflow-hidden relative">
              <Outlet />
            </main>
          </SidebarInset>

        </div>
      </SidebarProvider>
      </ProjectProvider>
    </DesignProvider>
  );
}