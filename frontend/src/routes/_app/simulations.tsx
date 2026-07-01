import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  PlayCircle, Clock, Download, Sparkles, Bell, ChevronDown, ChevronLeft,
  Info, Search, Eye, EyeOff, Move, Hand, ZoomIn, Maximize2, Camera,
  ChevronRight, X, CheckCircle2, AlertTriangle, FileText, Loader2, Square,
  Pause, RotateCcw, Database, Archive, AlertCircle, RefreshCw, Zap, BarChart3,
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  SOLVER_GROUPS, OPTIMIZATION_GROUP, JOBS_GROUP, SOLVER_LABEL, SOLVER_TABS,
  type SolverId,
} from "@/lib/simulator/solver-registry";
import { DESIGN_RULES, INDUSTRY_BENCHMARKS } from "@/lib/simulator/parameter-catalog";
import {
  defaultSeedFromDesign, deriveAll, type DerivedAll,
} from "@/lib/simulator/derive-parameters";
import { deductCredit, getCreditBalance } from "@/routes/_app";

export const Route = createFileRoute("/_app/simulations")({
  head: () => ({ meta: [{ title: "Simulations — Silicofeller Quantum Studio" }] }),
  component: SimulationsPage,
});

// ── Types ────────────────────────────────────────────────────────────────────
type RunStatus = "idle" | "running" | "completed" | "error";
type LogLine   = { time: string; text: string; kind?: "ok" | "warn" };

type SimResult = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  solver: SolverId;
  derived: DerivedAll;
  logs: LogLine[];
};

// ── Job cache ─────────────────────────────────────────────────────────────────
// Stored in module scope so it persists across re-renders without triggering
// re-fetches. Viewing logs/results from this cache consumes zero credits.
const JOB_CACHE: Map<string, SimResult> = new Map();

function cacheJob(result: SimResult) {
  JOB_CACHE.set(result.runId, result);
  // Keep the 20 most recent jobs to avoid unbounded memory growth
  if (JOB_CACHE.size > 20) {
    const oldest = JOB_CACHE.keys().next().value;
    if (oldest) JOB_CACHE.delete(oldest);
  }
}

function getCachedJobs(): SimResult[] {
  return Array.from(JOB_CACHE.values()).reverse();
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtSci(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)) {
    const exp = Math.floor(Math.log10(Math.abs(v)));
    return `${(v / Math.pow(10, exp)).toFixed(digits)}e${exp}`;
  }
  return v.toFixed(digits);
}

function nowTs(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toTimeString().slice(0, 8);
}

function makeLogs(solver: SolverId, d: DerivedAll): LogLine[] {
  return [
    { time: nowTs(0),   text: `Initializing ${SOLVER_LABEL[solver]} solver…` },
    { time: nowTs(80),  text: "Reading geometry and mesh…" },
    { time: nowTs(160), text: `Loaded ${d.geometry.via_count} vias, ${d.geometry.wirebond_count} wirebonds.` },
    { time: nowTs(240), text: "Adaptive pass 1 completed." },
    { time: nowTs(320), text: "Adaptive pass 2 completed." },
    { time: nowTs(400), text: "Adaptive pass 3 completed." },
    { time: nowTs(480), text: `Convergence achieved (residual ${d.eigenmode.residual.toFixed(4)}).`, kind: "ok" },
    { time: nowTs(560), text: `Solved ${d.eigenmode.modes.length} eigenmodes.` },
    { time: nowTs(620), text: `f₀ = ${d.eigenmode.modes[0].f_GHz.toFixed(4)} GHz  Q = ${d.eigenmode.modes[0].Q_loaded.toExponential(2)}` },
    { time: nowTs(680), text: `T₁ = ${d.coherence.T1_us.toFixed(1)} µs  T₂ = ${d.coherence.T2_us.toFixed(1)} µs` },
    { time: nowTs(720), text: `${SOLVER_LABEL[solver]} solution completed successfully.`, kind: "ok" },
  ];
}

async function runSolverLocally(
  designId: string, numQubits: number, solver: SolverId, variation: number,
): Promise<SimResult> {
  await new Promise(r => setTimeout(r, 700 + Math.random() * 400));
  const seedId = `${designId}::v${variation}::${solver}`;
  const seed = defaultSeedFromDesign(seedId, numQubits);
  seed.qubitFreqsGHz     = seed.qubitFreqsGHz.map(f    => f * (1 + ((variation * 0.0137) % 0.05) - 0.02));
  seed.resonatorFreqsGHz = seed.resonatorFreqsGHz.map(f => f * (1 + ((variation * 0.0091) % 0.04) - 0.015));
  const derived = deriveAll(seed);
  const t0 = nowTs();
  return {
    runId: `run_${Date.now().toString(36)}_${variation}`,
    startedAt: t0,
    finishedAt: nowTs(720),
    durationMs: 720,
    solver,
    derived,
    logs: makeLogs(solver, derived),
  };
}

// ── Simulation runner hook ───────────────────────────────────────────────────
function useSimulationRunner(initial: DerivedAll, designId: string, numQubits: number) {
  const [status,   setStatus]   = useState<RunStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [logs,     setLogs]     = useState<LogLine[]>([]);
  const [derived,  setDerived]  = useState<DerivedAll>(initial);
  const [lastRun,  setLastRun]  = useState<SimResult | null>(null);
  const [paused,   setPaused]   = useState(false);
  const variation = useRef(0);
  const tickRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const pushLog = useCallback((line: LogLine) => setLogs(prev => [...prev, line]), []);

  const cancel = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    setStatus("idle");
    setProgress(0);
    setPaused(false);
    pushLog({ time: new Date().toTimeString().slice(0, 8), text: "Run cancelled by user.", kind: "warn" });
    toast.warning("Simulation cancelled");
  }, [pushLog]);

  const pause = useCallback(() => {
    // Pause just freezes the progress ticker — no new simulation, no credit charge.
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setPaused(true);
    pushLog({ time: new Date().toTimeString().slice(0, 8), text: "Run paused by user.", kind: "warn" });
    toast.info("Simulation paused");
  }, [pushLog]);

  const resume = useCallback(() => {
    if (status !== "running") return;
    setPaused(false);
    tickRef.current = setInterval(() => {
      setProgress(p => p < 92 ? p + Math.random() * 6 : p);
    }, 90);
    pushLog({ time: new Date().toTimeString().slice(0, 8), text: "Run resumed." });
    toast.info("Simulation resumed");
  }, [status, pushLog]);

  // run() is the only place credits are consumed.
  const run = useCallback(async (solver: SolverId) => {
    if (status === "running") return;

    // Credit gate — refuse if balance is 0
    const balance = getCreditBalance();
    if (balance <= 0) {
      toast.error("No credits remaining", {
        description: "Top up your credits in Billing & Usage before running a simulation.",
      });
      return;
    }

    variation.current += 1;
    setStatus("running");
    setProgress(0);
    setPaused(false);
    setLogs([{ time: new Date().toTimeString().slice(0, 8), text: `Queuing ${solver} job… (1 credit will be charged)` }]);
    toast.info(`Running ${solver}…`, { description: `Variation #${variation.current} · Credits remaining: ${balance - 1}` });

    // Deduct 1 credit — this is the ONLY place credits are consumed.
    deductCredit(1);

    tickRef.current = setInterval(() => {
      setProgress(p => p < 92 ? p + Math.random() * 6 : p);
    }, 90);

    try {
      const result = await runSolverLocally(designId, numQubits, solver, variation.current);
      for (let i = 0; i < result.logs.length; i++) {
        await new Promise(r => setTimeout(r, 60));
        setLogs(prev => [...prev, result.logs[i]]);
      }
      setDerived(result.derived);
      setLastRun(result);
      // Cache the completed job — logs/results are now free to view
      cacheJob(result);
      setProgress(100);
      setStatus("completed");
      toast.success(`${solver} completed`, {
        description: `f₀ = ${result.derived.eigenmode.modes[0].f_GHz.toFixed(3)} GHz`,
      });
    } catch (err) {
      setStatus("error");
      const msg = err instanceof Error ? err.message : String(err);
      pushLog({ time: new Date().toTimeString().slice(0, 8), text: `ERROR: ${msg}`, kind: "warn" });
      toast.error("Simulation failed", { description: msg });
    } finally {
      if (tickRef.current) clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, [designId, numQubits, status, pushLog]);

  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current); }, []);

  const exportResults = useCallback(() => {
    // Export uses cached data — zero credits consumed.
    const payload = lastRun ?? { derived, note: "no run yet" };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `simulation_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Results exported (cached — no credits used)", { description: a.download });
  }, [lastRun, derived]);

  return { status, progress, logs, derived, lastRun, paused, run, cancel, pause, resume, exportResults };
}

// ── Main page ────────────────────────────────────────────────────────────────
function SimulationsPage() {
  const [solver,        setSolver]        = useState<SolverId>("eigenmode");
  const [activeTab,     setActiveTab]     = useState<string>("field");
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [paramsTab,     setParamsTab]     = useState<"setup" | "advanced">("setup");
  const [aiPillOpen,    setAiPillOpen]    = useState(true);
  const [showDock,      setShowDock]      = useState(false);
  // Jobs panel state (no extra API calls — uses local cache)
  const [jobsPanel,     setJobsPanel]     = useState<"none"|"running"|"completed"|"results"|"reports">("none");
  // Rerun confirmation dialog
  const [rerunTarget,   setRerunTarget]   = useState<SimResult | null>(null);

  const designId   = "demo";
  const numQubits  = 5;
  const initial    = useMemo(() => deriveAll(defaultSeedFromDesign(designId, numQubits)), []);
  const runner     = useSimulationRunner(initial, designId, numQubits);
  const derived    = runner.derived;

  useEffect(() => {
    const tabs = SOLVER_TABS[solver];
    if (tabs?.length) setActiveTab(tabs[0].id);
  }, [solver]);

  useEffect(() => {
    if (runner.status !== "idle") setShowDock(true);
  }, [runner.status]);

  // Rerun: only triggers if user explicitly confirms. Credits consumed inside runner.run().
  const handleRerunConfirm = useCallback(() => {
    if (!rerunTarget) return;
    setRerunTarget(null);
    setJobsPanel("none");
    setShowDock(true);
    runner.run(rerunTarget.solver);
  }, [rerunTarget, runner]);

  return (
    <TooltipProvider delayDuration={200}>
      {/* Rerun confirmation dialog — prevents accidental credit usage */}
      <Dialog open={rerunTarget !== null} onOpenChange={open => { if (!open) setRerunTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" /> Confirm Rerun
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              Rerunning <span className="font-semibold">{rerunTarget ? SOLVER_LABEL[rerunTarget.solver] : ""}</span> will consume{" "}
              <span className="font-bold text-violet-700">1 credit</span>. You currently have{" "}
              <span className="font-bold">{getCreditBalance()} credits</span>.
              <br /><br />
              Only rerun if you have changed parameters. Viewing existing results is always free.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRerunTarget(null)}>Cancel</Button>
            <Button onClick={handleRerunConfirm} className="bg-accent hover:bg-accent/90 text-white gap-1.5">
              <Zap className="h-3.5 w-3.5" /> Confirm Rerun (1 credit)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-col h-full w-full bg-slate-50 text-slate-800 overflow-hidden">
        <Topbar
          projectName="Transmon_Processor_v2"
          solverLabel={SOLVER_LABEL[solver]}
          aiPillOpen={aiPillOpen}
          setAiPillOpen={setAiPillOpen}
          status={runner.status}
          progress={runner.progress}
          paused={runner.paused}
          onRun={() => { setShowDock(true); runner.run(solver); }}
          onCancel={runner.cancel}
          onPause={runner.pause}
          onResume={runner.resume}
          onExport={runner.exportResults}
        />
        <div className="flex-1 flex min-h-0">
          <SolverRail
            solver={solver} setSolver={setSolver}
            collapsed={railCollapsed} setCollapsed={setRailCollapsed}
            activeJobsPanel={jobsPanel} setJobsPanel={setJobsPanel}
          />
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Jobs panels — uses cached data, zero credits */}
            {jobsPanel !== "none" ? (
              <JobsOverlay
                panel={jobsPanel}
                onClose={() => setJobsPanel("none")}
                runner={runner}
                solver={solver}
                onRerun={(job) => setRerunTarget(job)}
              />
            ) : (
              <>
                <CenterPane
                  solver={solver}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  derived={derived}
                  runner={runner}
                  showDock={showDock}
                  onCloseDock={() => setShowDock(false)}
                />
                <StatusBar derived={derived} status={runner.status} progress={runner.progress} />
              </>
            )}
          </div>
          <ParametersRail
            solver={solver}
            paramsTab={paramsTab}
            setParamsTab={setParamsTab}
            onRun={() => { setShowDock(true); runner.run(solver); }}
            status={runner.status}
          />
        </div>
      </div>
    </TooltipProvider>
  );
}

// ── Topbar ───────────────────────────────────────────────────────────────────
function Topbar({ projectName, solverLabel, aiPillOpen, setAiPillOpen, status, progress, paused, onRun, onCancel, onPause, onResume, onExport }: {
  projectName: string; solverLabel: string;
  aiPillOpen: boolean; setAiPillOpen: (v: boolean) => void;
  status: RunStatus; progress: number; paused: boolean;
  onRun: () => void; onCancel: () => void; onPause: () => void; onResume: () => void; onExport: () => void;
}) {
  const running = status === "running";
  const [credits, setCredits] = useState<number>(getCreditBalance);
  useEffect(() => {
    const sync = () => setCredits(getCreditBalance());
    window.addEventListener("qs:credits:changed", sync);
    return () => window.removeEventListener("qs:credits:changed", sync);
  }, []);

  return (
    <div className="h-14 px-5 flex items-center justify-between bg-white border-b border-slate-200 shrink-0">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500 font-medium">Simulations</span>
        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-slate-700 font-semibold">{solverLabel}</span>
        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-slate-900 font-bold">{projectName}</span>
        <span className={cn("inline-flex items-center gap-1.5 ml-3 px-2 py-0.5 rounded-md text-xs font-medium border",
          status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
          status === "running"   ? "bg-violet-50 text-violet-700 border-violet-200" :
          status === "error"     ? "bg-rose-50 text-rose-700 border-rose-200" :
                                   "bg-slate-50 text-slate-600 border-slate-200")}>
          <span className={cn("h-1.5 w-1.5 rounded-full",
            status === "completed" ? "bg-emerald-500" :
            status === "running"   ? "bg-violet-500 animate-pulse" :
            status === "error"     ? "bg-rose-500" : "bg-slate-400")} />
          {status === "running" ? (paused ? `Paused ${Math.round(progress)}%` : `Running ${Math.round(progress)}%`) :
           status === "completed" ? "Completed" :
           status === "error" ? "Error" : "Ready"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {/* Credit cost indicator — shown before running */}
        {!running && status !== "completed" && (
          <div className={cn("flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border",
            credits <= 5 ? "bg-rose-50 text-rose-700 border-rose-200" :
            credits <= 15 ? "bg-amber-50 text-amber-700 border-amber-200" :
            "bg-violet-50 text-violet-700 border-violet-200")}>
            <Zap className="h-3 w-3" />
            {credits} credits · 1 per run
          </div>
        )}
        {running ? (
          <div className="flex items-center gap-1.5">
            {paused ? (
              <Button onClick={onResume} className="h-9 bg-violet-600 hover:bg-violet-700 text-white font-semibold gap-2 shadow-sm">
                <PlayCircle className="h-4 w-4" /> Resume
              </Button>
            ) : (
              <Button onClick={onPause} variant="outline" className="h-9 gap-2 font-medium text-amber-700 border-amber-300 hover:bg-amber-50">
                <Pause className="h-4 w-4" /> Pause
              </Button>
            )}
            <Button onClick={onCancel} className="h-9 bg-rose-600 hover:bg-rose-700 text-white font-semibold gap-2 shadow-sm">
              <Square className="h-4 w-4" /> Stop
            </Button>
          </div>
        ) : (
          <Button onClick={onRun} disabled={credits <= 0} className="h-9 bg-accent hover:bg-accent/90 text-white font-semibold gap-2 shadow-sm disabled:opacity-50">
            <PlayCircle className="h-4 w-4" /> Run Simulation
          </Button>
        )}
        <Button variant="outline" className="h-9 gap-2 font-medium"
          onClick={() => toast.info("Job Monitor", { description: `${getCachedJobs().length} completed · cached` })}>
          <Clock className="h-4 w-4" /> Job Monitor
        </Button>
        <Button variant="outline" className="h-9 gap-2 font-medium" onClick={onExport}>
          <Download className="h-4 w-4" /> Export <ChevronDown className="h-3 w-3" />
        </Button>
        <AnimatePresence>
          {aiPillOpen && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="h-9 inline-flex items-center gap-1.5 px-3 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-xs font-semibold shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
              AI Copilot
              <button onClick={() => setAiPillOpen(false)} className="ml-1 hover:bg-white/20 rounded-full p-0.5">
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        <button onClick={() => toast.info("No new notifications")}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">
          <Bell className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Solver rail ──────────────────────────────────────────────────────────────
function SolverRail({ solver, setSolver, collapsed, setCollapsed, activeJobsPanel, setJobsPanel }: {
  solver: SolverId; setSolver: (s: SolverId) => void;
  collapsed: boolean; setCollapsed: (v: boolean) => void;
  activeJobsPanel: string; setJobsPanel: (v: "none"|"running"|"completed"|"results"|"reports") => void;
}) {
  if (collapsed) {
    return (
      <div className="w-10 bg-white border-r border-slate-200 flex flex-col items-center pt-3">
        <button onClick={() => setCollapsed(false)} className="h-8 w-8 rounded hover:bg-slate-100 inline-flex items-center justify-center">
          <ChevronRight className="h-4 w-4 text-slate-500" />
        </button>
      </div>
    );
  }
  return (
    <div className="w-[260px] bg-white border-r border-slate-200 flex flex-col shrink-0 overflow-hidden">
      <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => setCollapsed(true)} className="h-7 w-7 rounded hover:bg-slate-100 inline-flex items-center justify-center">
            <ChevronLeft className="h-4 w-4 text-slate-500" />
          </button>
          <span className="text-sm font-bold text-slate-900">Simulations</span>
        </div>
      </div>
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input placeholder="Search analysis…" className="pl-8 h-8 text-xs bg-slate-50 border-slate-200" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-3">
        {SOLVER_GROUPS.map(group => (
          <div key={group.label}>
            <div className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{group.label}</div>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const Icon = item.icon;
                const active = solver === item.id;
                return (
                  <button key={item.label} onClick={() => setSolver(item.id)}
                    className={cn("w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-xs transition-colors",
                      active ? "bg-accent/10 text-accent font-semibold" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}>
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", active ? "text-accent" : "text-slate-400")} />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div>
          <div className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{OPTIMIZATION_GROUP.label}</div>
          <div className="space-y-0.5">
            {OPTIMIZATION_GROUP.items.map((item, i) => {
              const Icon = item.icon;
              return (
                <button key={i} className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs text-slate-600 hover:bg-slate-100">
                  <Icon className="h-3.5 w-3.5 text-slate-400" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <div className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{JOBS_GROUP.label}</div>
          <div className="space-y-0.5">
            {JOBS_GROUP.items.map(item => {
              const Icon = item.icon;
              const badge = "badge" in item ? (item as { badge?: number }).badge : undefined;
              const panelId = item.id as "running"|"completed"|"results"|"reports";
              const isActive = activeJobsPanel === panelId;
              return (
                <button key={item.label}
                  onClick={() => setJobsPanel(isActive ? "none" : panelId)}
                  className={cn("w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-colors",
                    isActive ? "bg-accent/10 text-accent font-semibold" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}>
                  <div className="flex items-center gap-2.5">
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-accent" : "text-slate-400")} />
                    <span>{item.label}</span>
                  </div>
                  {badge != null && (
                    <span className="text-[10px] font-bold px-1.5 rounded-full bg-accent/15 text-accent">{badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Jobs overlay ─────────────────────────────────────────────────────────────
// All four panels read from the local job cache. Zero credits consumed here.
// Refresh interval: 30s for Running Jobs only; Completed/Results/Reports are static.

type JobsOverlayProps = {
  panel: "running" | "completed" | "results" | "reports";
  onClose: () => void;
  runner: ReturnType<typeof useSimulationRunner>;
  solver: SolverId;
  onRerun: (job: SimResult) => void;
};

function JobsOverlay({ panel, onClose, runner, solver, onRerun }: JobsOverlayProps) {
  const [tick, setTick] = useState(0);
  const [viewingLogsFor, setViewingLogsFor] = useState<string | null>(null);
  // Generated reports cache — each job gets one report, re-downloads are free
  const [generatedReports, setGeneratedReports] = useState<Set<string>>(new Set());

  // 30-second refresh only when viewing running jobs — avoids unnecessary work
  useEffect(() => {
    if (panel !== "running") return;
    const id = setInterval(() => setTick(t => t + 1), 30_000);
    return () => clearInterval(id);
  }, [panel]);

  const completedJobs = getCachedJobs();
  const activeJob = runner.status === "running" || runner.status === "completed"
    ? runner.lastRun ?? { runId: "current", startedAt: "-", finishedAt: "-", durationMs: 0, solver, derived: runner.derived, logs: runner.logs }
    : null;

  const titles: Record<typeof panel, string> = {
    running:   "Running Jobs",
    completed: "Completed Jobs",
    results:   "Results",
    reports:   "Reports",
  };

  function CreditSafeBadge() {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
        <Database className="h-3 w-3" /> Cached · 0 credits
      </span>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-white">
      {/* Header */}
      <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-base font-black text-slate-900 tracking-tight">{titles[panel]}</span>
          <CreditSafeBadge />
          {panel === "running" && (
            <span className="text-[11px] text-slate-400">Auto-refreshes every 30s</span>
          )}
        </div>
        <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 inline-flex items-center justify-center text-slate-500">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

        {/* ── Running Jobs ── */}
        {panel === "running" && (
          <div className="space-y-3">
            {runner.status === "running" && activeJob ? (
              <Card className="border-violet-200 bg-violet-50/40 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-violet-500 animate-pulse" />
                    <span className="text-sm font-bold text-slate-900">{SOLVER_LABEL[solver]}</span>
                    <Badge variant="outline" className="text-[10px] font-mono text-violet-700 border-violet-300">
                      {runner.paused ? "Paused" : "Running"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {runner.paused ? (
                      <Button size="sm" onClick={runner.resume} className="h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white gap-1">
                        <PlayCircle className="h-3 w-3" /> Resume
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={runner.pause} className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50 gap-1">
                        <Pause className="h-3 w-3" /> Pause
                      </Button>
                    )}
                    <Button size="sm" onClick={runner.cancel} className="h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white gap-1">
                      <Square className="h-3 w-3" /> Cancel
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>Progress</span>
                    <span className="font-mono font-semibold text-violet-700">{Math.round(runner.progress)}%</span>
                  </div>
                  <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-violet-500 rounded-full transition-all duration-300" style={{ width: `${runner.progress}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div><span className="text-slate-400">Started</span><div className="font-mono font-semibold text-slate-700">{runner.logs[0]?.time ?? "–"}</div></div>
                  <div><span className="text-slate-400">Solver</span><div className="font-semibold text-slate-700">{SOLVER_LABEL[solver]}</div></div>
                  <div><span className="text-slate-400">Status</span><div className="font-semibold text-violet-700">{runner.paused ? "Paused" : "Active"}</div></div>
                </div>
              </Card>
            ) : (
              <div className="text-center py-16 text-slate-400">
                <Archive className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No active jobs</p>
                <p className="text-xs mt-1">Start a simulation to see live status here.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Completed Jobs ── */}
        {panel === "completed" && (
          <div className="space-y-3">
            {completedJobs.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No completed jobs yet</p>
                <p className="text-xs mt-1">Run a simulation — results are cached automatically.</p>
              </div>
            ) : completedJobs.map(job => (
              <Card key={job.runId} className="rounded-xl border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm font-bold text-slate-900">{SOLVER_LABEL[job.solver]}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {/* View logs — cached, 0 credits */}
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                      onClick={() => setViewingLogsFor(viewingLogsFor === job.runId ? null : job.runId)}>
                      <FileText className="h-3 w-3" />
                      {viewingLogsFor === job.runId ? "Hide Logs" : "View Logs"}
                    </Button>
                    {/* Rerun — opens confirmation dialog, credits charged only on confirm */}
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-amber-700 border-amber-300 hover:bg-amber-50"
                      onClick={() => onRerun(job)}>
                      <RotateCcw className="h-3 w-3" /> Rerun
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3 text-[11px]">
                  <div>
                    <span className="text-slate-400">Job ID</span>
                    <div className="font-mono text-slate-700 truncate">{job.runId}</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Status</span>
                    <div className="font-semibold text-emerald-600">Completed</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Runtime</span>
                    <div className="font-mono text-slate-700">{(job.durationMs / 1000).toFixed(2)}s</div>
                  </div>
                  <div>
                    <span className="text-slate-400">Finished</span>
                    <div className="font-mono text-slate-700">{job.finishedAt}</div>
                  </div>
                </div>
                {/* Cached logs — zero credits */}
                {viewingLogsFor === job.runId && (
                  <div className="bg-slate-900 rounded-lg p-3 font-mono text-[11px] leading-5 max-h-48 overflow-y-auto">
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-700">
                      <Database className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400 text-[10px] font-semibold">Cached logs · 0 credits used</span>
                    </div>
                    {job.logs.map((line, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-slate-500">{line.time}</span>
                        <span className={cn(
                          line.kind === "ok" ? "text-emerald-400" :
                          line.kind === "warn" ? "text-amber-400" : "text-slate-300"
                        )}>{line.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {/* ── Results ── */}
        {panel === "results" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-200">
              <Database className="h-4 w-4 text-emerald-500 shrink-0" />
              Viewing stored outputs. All results are loaded from cache — no re-computation, no credits consumed.
            </div>
            {completedJobs.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No results available</p>
                <p className="text-xs mt-1">Run at least one simulation to see cached results here.</p>
              </div>
            ) : completedJobs.map(job => (
              <Card key={job.runId} className="rounded-xl border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold text-slate-900">{SOLVER_LABEL[job.solver]}</div>
                    <div className="text-[11px] text-slate-400 font-mono">{job.runId} · {job.finishedAt}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(job.derived, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a"); a.href = url; a.download = `${job.runId}_results.json`; a.click();
                        URL.revokeObjectURL(url);
                        toast.success("Exported from cache · 0 credits used");
                      }}>
                      <Download className="h-3 w-3" /> JSON
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                      onClick={() => {
                        const modes = job.derived.eigenmode.modes;
                        const csv = ["mode,f_GHz,Q_loaded,Q_unloaded,stored_energy_J",
                          ...modes.map(m => `${m.n},${m.f_GHz},${m.Q_loaded},${m.Q_unloaded},${m.stored_energy_J}`)
                        ].join("\n");
                        const blob = new Blob([csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a"); a.href = url; a.download = `${job.runId}_eigenmode.csv`; a.click();
                        URL.revokeObjectURL(url);
                        toast.success("CSV exported from cache · 0 credits used");
                      }}>
                      <Download className="h-3 w-3" /> CSV
                    </Button>
                  </div>
                </div>
                {/* Key metrics summary */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ["f₀", `${job.derived.eigenmode.modes[0].f_GHz.toFixed(3)} GHz`],
                    ["T₁", `${job.derived.coherence.T1_us.toFixed(0)} µs`],
                    ["Q", fmtSci(job.derived.eigenmode.modes[0].Q_loaded)],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wide">{k}</div>
                      <div className="text-sm font-black text-slate-900 font-mono">{v}</div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* ── Reports ── */}
        {panel === "reports" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg p-3 border border-slate-200">
              <FileText className="h-4 w-4 text-blue-500 shrink-0" />
              Reports are generated once per job and cached. Re-downloading is always free — no credits consumed.
            </div>
            {completedJobs.length === 0 ? (
              <div className="text-center py-16 text-slate-400">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium">No reports available</p>
                <p className="text-xs mt-1">Complete a simulation to generate a report.</p>
              </div>
            ) : completedJobs.map(job => {
              const hasReport = generatedReports.has(job.runId);
              return (
                <Card key={job.runId} className="rounded-xl border-slate-200 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-bold text-slate-900">{SOLVER_LABEL[job.solver]} — Summary</div>
                      <div className="text-[11px] text-slate-400 font-mono">{job.runId}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {hasReport ? (
                        // Re-download from cache — 0 credits
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                          onClick={() => {
                            const content = `SIMULATION REPORT\n${"=".repeat(40)}\nJob: ${job.runId}\nSolver: ${SOLVER_LABEL[job.solver]}\nStarted: ${job.startedAt} · Finished: ${job.finishedAt}\nRuntime: ${(job.durationMs / 1000).toFixed(2)}s\n\nKEY RESULTS\nf₀ = ${job.derived.eigenmode.modes[0].f_GHz.toFixed(4)} GHz\nT₁ = ${job.derived.coherence.T1_us.toFixed(1)} µs\nT₂ = ${job.derived.coherence.T2_us.toFixed(1)} µs\nQ  = ${fmtSci(job.derived.eigenmode.modes[0].Q_loaded)}\n\n[Cached report — 0 credits]`;
                            const blob = new Blob([content], { type: "text/plain" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a"); a.href = url; a.download = `report_${job.runId}.txt`; a.click();
                            URL.revokeObjectURL(url);
                            toast.success("Report downloaded from cache · 0 credits");
                          }}>
                          <Download className="h-3 w-3" /> Re-download
                        </Button>
                      ) : (
                        // Generate once — also 0 credits (report generation doesn't rerun the sim)
                        <Button size="sm" className="h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                          onClick={() => {
                            setGeneratedReports(prev => new Set(prev).add(job.runId));
                            toast.success("Report generated · 0 credits used", {
                              description: "Click 'Re-download' to save anytime.",
                            });
                          }}>
                          <RefreshCw className="h-3 w-3" /> Generate Report
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-400">Job ID</span>
                      <span className="font-mono text-slate-700">{job.runId}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-400">Status</span>
                      <span className="text-emerald-600 font-semibold">Completed</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-400">Runtime</span>
                      <span className="font-mono text-slate-700">{(job.durationMs / 1000).toFixed(2)}s</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100">
                      <span className="text-slate-400">Finished</span>
                      <span className="font-mono text-slate-700">{job.finishedAt}</span>
                    </div>
                  </div>
                  {hasReport && (
                    <div className="text-[10px] text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Report cached — re-download anytime at no cost
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Center pane ──────────────────────────────────────────────────────────────
function CenterPane({ solver, activeTab, setActiveTab, derived, runner, showDock, onCloseDock }: {
  solver: SolverId; activeTab: string; setActiveTab: (s: string) => void;
  derived: DerivedAll;
  runner: ReturnType<typeof useSimulationRunner>;
  showDock: boolean; onCloseDock: () => void;
}) {
  const tabs = SOLVER_TABS[solver];
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="px-5 pt-2.5 pb-2 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-base font-black text-slate-900 tracking-tight">{SOLVER_LABEL[solver]}</h1>
          <Popover>
            <PopoverTrigger asChild>
              <button className="h-5 w-5 inline-flex items-center justify-center rounded-full text-slate-400 hover:text-accent hover:bg-accent/10">
                <Info className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[480px] p-0" align="start">
              <div className="p-4">
                <div className="text-sm font-bold text-slate-900 mb-2">Industry Benchmarks</div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-200">
                      {["Param","IBM","Google","Rigetti","Target"].map(h =>
                        <th key={h} className="text-left font-semibold py-1.5">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {INDUSTRY_BENCHMARKS.map(row => (
                      <tr key={row.metric} className="border-b border-slate-100">
                        <td className="py-1.5 font-semibold text-slate-700">{row.metric}</td>
                        <td className="py-1.5 text-slate-600">{row.ibm}</td>
                        <td className="py-1.5 text-slate-600">{row.google}</td>
                        <td className="py-1.5 text-slate-600">{row.rigetti}</td>
                        <td className="py-1.5 text-accent font-semibold">{row.target}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <MetricStrip solver={solver} derived={derived} />
      </div>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="px-6 border-b border-slate-200 shrink-0 bg-white">
          <TabsList className="bg-transparent h-10 p-0 gap-1">
            {tabs.map(t => (
              <TabsTrigger key={t.id} value={t.id}
                className="h-10 px-3 text-xs font-medium text-slate-500 data-[state=active]:text-accent data-[state=active]:font-semibold data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-accent">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          <motion.div key={`${solver}:${activeTab}`}
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
            className="px-6 py-5 space-y-5">
            <SolverContent solver={solver} tab={activeTab} derived={derived} />
            {showDock && (
              <BottomDock
                derived={derived} solver={solver}
                liveLogs={runner.logs} progress={runner.progress}
                status={runner.status} onClose={onCloseDock}
              />
            )}
          </motion.div>
        </div>
      </Tabs>
    </div>
  );
}

// ── KPI strip ────────────────────────────────────────────────────────────────
type KpiCard = { label: string; value: string; sub: string; accent?: "emerald" };

function getKpis(solver: SolverId, d: DerivedAll): KpiCard[] {
  const e = d.eigenmode.modes[0];
  switch (solver) {
    case "eigenmode":    return [
      { label: "Modes",        value: String(d.eigenmode.modes.length), sub: "Solved" },
      { label: "f₀ (Mode 1)", value: `${e.f_GHz.toFixed(3)} GHz`,      sub: "Frequency" },
      { label: "Q (Mode 1)",  value: fmtSci(e.Q_loaded),                sub: "Loaded Q" },
      { label: "Stored E",    value: `${fmtSci(e.stored_energy_J,2)} J`, sub: "Total" },
      { label: "Max |E|",     value: `${fmtSci(e.Emax_Vm,2)} V/m`,      sub: "Peak" },
      { label: "Converged",   value: "Yes",                              sub: "Status", accent: "emerald" },
    ];
    case "driven_modal": return [
      { label: "S21 (Min)",   value: `${d.hfss.S21_dB.toFixed(1)} dB`,     sub: "Transmission" },
      { label: "S11 (Min)",   value: `${d.hfss.S11_dB.toFixed(1)} dB`,     sub: "Reflection" },
      { label: "Bandwidth",   value: `${d.hfss.bandwidth_MHz.toFixed(2)} MHz`, sub: "−3 dB" },
      { label: "VSWR",        value: d.hfss.VSWR.toFixed(2),               sub: "Port" },
      { label: "Q_i",         value: fmtSci(d.hfss.Q_i),                   sub: "Internal" },
      { label: "Converged",   value: "Yes",                                 sub: "Status", accent: "emerald" },
    ];
    case "hfss_em": return [
      { label: "Max |E|",     value: `${fmtSci(d.hfss.Emax_Vm,2)} V/m`,   sub: "Peak field" },
      { label: "Max |H|",     value: `${d.hfss.Hmax_Am.toFixed(2)} A/m`,   sub: "Peak field" },
      { label: "Max J",       value: `${fmtSci(d.hfss.Jmax_Am2,2)} A/m²`, sub: "Current" },
      { label: "Cond. Loss",  value: `${d.hfss.conductor_loss_dB_m.toFixed(3)} dB/m`, sub: "α_c" },
      { label: "Diel. Loss",  value: `${d.hfss.dielectric_loss_dB_m.toFixed(3)} dB/m`, sub: "α_d" },
      { label: "Stored E",    value: `${fmtSci(d.hfss.stored_energy_J,2)} J`, sub: "Total" },
    ];
    case "q3d": return [
      { label: "C_Σ",         value: `${d.q3d.C_sigma_fF.toFixed(1)} fF`,  sub: "Shunt cap" },
      { label: "L_J",         value: `${d.q3d.L_J_nH.toFixed(2)} nH`,      sub: "Josephson" },
      { label: "C_qq",        value: `${d.q3d.C_qq_fF.toFixed(2)} fF`,     sub: "Q-Q coupling" },
      { label: "R_sheet",     value: `${d.q3d.R_sheet_mOhm_sq.toFixed(3)} mΩ/□`, sub: "Conductor" },
      { label: "L_tot",       value: `${(d.q3d.L_J_nH + d.q3d.L_geometric_nH).toFixed(2)} nH`, sub: "Total" },
      { label: "C_coup",      value: `${d.q3d.C_coup_fF.toFixed(1)} fF`,   sub: "Coupler" },
    ];
    case "physics": return [
      { label: "E_J",         value: `${d.epr.E_J_GHz.toFixed(2)} GHz`,    sub: "Josephson" },
      { label: "E_C",         value: `${d.epr.E_C_MHz.toFixed(1)} MHz`,    sub: "Charging" },
      { label: "E_J/E_C",    value: d.epr.Ej_Ec.toFixed(1),                sub: "Ratio" },
      { label: "f₀₁",        value: `${d.epr.f01_GHz.toFixed(3)} GHz`,    sub: "Transition" },
      { label: "α",           value: `${d.epr.alpha_MHz.toFixed(0)} MHz`,  sub: "Anharmonicity" },
      { label: "T₁",          value: `${d.coherence.T1_us.toFixed(0)} µs`, sub: "Relaxation" },
    ];
    case "epr": return [
      { label: "p_J",         value: d.epr.p_J.toFixed(3),                 sub: "Junction part." },
      { label: "E_J/E_C",    value: d.epr.Ej_Ec.toFixed(1),                sub: "Ratio" },
      { label: "α",           value: `${d.epr.alpha_MHz.toFixed(0)} MHz`,  sub: "Anharmonicity" },
      { label: "g",           value: `${d.epr.g_qr_MHz.toFixed(1)} MHz`,  sub: "Q-R coupling" },
      { label: "χ",           value: `${d.epr.chi_MHz.toFixed(2)} MHz`,   sub: "Dispersive" },
      { label: "ZZ",          value: `${d.epr.ZZ_kHz.toFixed(0)} kHz`,    sub: "Residual" },
    ];
    case "hamiltonian": return [
      { label: "Δ",           value: `${d.epr.detuning_GHz.toFixed(3)} GHz`, sub: "Detuning" },
      { label: "g/Δ",        value: d.epr.g_over_delta.toFixed(3),           sub: "Dispersive" },
      { label: "χ_disp",     value: `${d.epr.dispersive_shift_MHz.toFixed(2)} MHz`, sub: "Shift" },
      { label: "J_ex",       value: `${d.epr.J_qq_MHz.toFixed(1)} MHz`,     sub: "Exchange" },
      { label: "f₀₁ dressed", value: `${d.epr.f01_GHz.toFixed(3)} GHz`,    sub: "Qubit" },
      { label: "f_r dressed", value: `${(d.epr.f01_GHz + d.epr.detuning_GHz).toFixed(3)} GHz`, sub: "Resonator" },
    ];
    case "noise": return [
      { label: "T₁",          value: `${d.coherence.T1_us.toFixed(0)} µs`,  sub: "Relaxation" },
      { label: "T₂",          value: `${d.coherence.T2_us.toFixed(0)} µs`,  sub: "Dephasing" },
      { label: "T_φ",         value: `${d.coherence.T_phi_us.toFixed(0)} µs`, sub: "Pure dephasing" },
      { label: "S_Φ",         value: `${d.noise.S_phi_uPhi0.toFixed(2)} µΦ₀/√Hz`, sub: "Flux noise" },
      { label: "S_q",         value: `${fmtSci(d.noise.S_q_e,2)} e/√Hz`,   sub: "Charge noise" },
      { label: "n_th",        value: fmtSci(d.noise.n_th_photons,2),         sub: "Thermal" },
    ];
    case "coupling": return [
      { label: "g_qr",        value: `${d.coupling.g_qr_MHz.toFixed(1)} MHz`, sub: "Q–R" },
      { label: "g_qq",        value: `${d.coupling.g_qq_MHz.toFixed(1)} MHz`, sub: "Q–Q" },
      { label: "Crosstalk",   value: `${d.coupling.crosstalk_dB.toFixed(0)} dB`, sub: "Isolation" },
      { label: "ZZ",          value: `${d.coupling.ZZ_kHz.toFixed(0)} kHz`,  sub: "Residual" },
      { label: "g_rr",        value: `${d.coupling.g_rr_MHz.toFixed(2)} MHz`, sub: "R–R" },
      { label: "J",           value: `${d.coupling.g_qq_MHz.toFixed(1)} MHz`, sub: "Exchange" },
    ];
    case "purcell": return [
      { label: "T₁ᴾ",         value: `${(d.coherence.T1_purcell_us/1000).toFixed(2)} ms`, sub: "Purcell limit" },
      { label: "Q_e",         value: fmtSci(d.hfss.Q_e),                    sub: "External" },
      { label: "Δ",           value: `${d.epr.detuning_GHz.toFixed(3)} GHz`, sub: "Detuning" },
      { label: "g",           value: `${d.epr.g_qr_MHz.toFixed(1)} MHz`,    sub: "Coupling" },
      { label: "κ",           value: `${d.hfss.bandwidth_MHz.toFixed(2)} MHz`, sub: "Decay" },
      { label: "Margin",      value: `${(d.coherence.T1_purcell_us/d.coherence.T1_us).toFixed(1)}×`, sub: "vs T₁", accent: "emerald" },
    ];
  }
}

function MetricStrip({ solver, derived }: { solver: SolverId; derived: DerivedAll }) {
  const kpis = getKpis(solver, derived);
  return (
    <div className="flex items-stretch gap-3">
      {kpis.map((k, i) => (
        <motion.div key={k.label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04, duration: 0.18 }} className="flex-1 min-w-0">
          <Card className="border-slate-200 px-4 py-3 shadow-sm rounded-xl">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 truncate">{k.label}</div>
            <div className="flex items-center gap-1.5">
              <div className={cn("text-lg font-black tracking-tight truncate",
                k.accent === "emerald" ? "text-emerald-600" : "text-slate-900")}>
                {k.value}
              </div>
              {k.accent === "emerald" && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 truncate">{k.sub}</div>
          </Card>
        </motion.div>
      ))}
      <Button variant="outline" className="h-auto px-3 self-stretch text-xs gap-1 font-medium shrink-0">
        More Metrics <ChevronDown className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ── Solver content router ────────────────────────────────────────────────────
function SolverContent({ solver, tab, derived }: { solver: SolverId; tab: string; derived: DerivedAll }) {
  if (solver === "eigenmode") {
    if (tab === "field")    return <EigenmodeFieldView derived={derived} />;
    if (tab === "spectrum") return <SpectrumChart data={derived.eigenmode.modes.map(m => ({ f: m.f_GHz, Q: m.Q_loaded }))} />;
    if (tab === "q")        return <QFactorBars modes={derived.eigenmode.modes} />;
    if (tab === "energy")   return <EnergyBars modes={derived.eigenmode.modes} />;
    if (tab === "modes")    return <PlaceholderPanel title="Mode shape gallery" subtitle="3D field renderings per eigenmode" />;
    return <PlaceholderPanel title="Adaptive mesh" subtitle="Tetrahedral mesh statistics" />;
  }
  if (solver === "driven_modal") {
    if (tab === "s") return <SParamChart data={derived.hfss.sweep} />;
    return <PlaceholderPanel title={tab} subtitle="HFSS driven-modal output" />;
  }
  if (solver === "hfss_em") {
    if (tab === "e" || tab === "h" || tab === "j") return <EigenmodeFieldView derived={derived} variant={tab as "e"|"h"|"j"} />;
    if (tab === "loss") return <LossBreakdown derived={derived} />;
    return <PlaceholderPanel title={tab} subtitle="HFSS full-wave output" />;
  }
  if (solver === "q3d") {
    if (tab === "derived") return <Q3DDerivedTable derived={derived} />;
    return <Q3DMatrix derived={derived} kind={tab as "c"|"l"|"r"|"g"} />;
  }
  if (solver === "physics") {
    if (tab === "levels") return <EnergyLevels derived={derived} />;
    if (tab === "coh")    return <CoherencePanel derived={derived} />;
    return <PlaceholderPanel title={tab} subtitle="scqubits transmon output" />;
  }
  if (solver === "epr") {
    if (tab === "part")  return <ParticipationBars derived={derived} />;
    if (tab === "trans") return <TransitionTable derived={derived} />;
    return <PlaceholderPanel title={tab} subtitle="Energy Participation Ratio output" />;
  }
  if (solver === "hamiltonian") return <PlaceholderPanel title={tab} subtitle="Dressed/bare states & dispersive map" />;
  if (solver === "noise") {
    if (tab === "psd") return <PSDChart data={derived.noise.psd} />;
    if (tab === "t1")  return <T1Budget data={derived.noise.t1_budget} />;
    return <PlaceholderPanel title={tab} subtitle="Noise & decoherence output" />;
  }
  if (solver === "coupling") {
    if (tab === "dist") return <DistanceCurve data={derived.coupling.distance_curve} />;
    return <PlaceholderPanel title={tab} subtitle="Coupling analysis output" />;
  }
  if (solver === "purcell") return <PlaceholderPanel title={tab} subtitle="Purcell limit vs detuning curve" />;
  return null;
}

// ── Field view ───────────────────────────────────────────────────────────────
const LAYER_COLORS: Record<string, string> = {
  Metal_1: "bg-purple-500", Metal_2: "bg-amber-500",
  Josephson_Junction: "bg-yellow-400", Dielectric_1: "bg-blue-500",
  Dielectric_2: "bg-teal-400", Substrate: "bg-slate-400",
  Air_Box: "bg-slate-300", Ports: "bg-red-500",
};

function FieldHeatmapSVG({ selectedMode }: { selectedMode: number }) {
  const offset = selectedMode * 7;
  return (
    <svg viewBox="0 0 900 460" className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="glow1" cx="50%" cy="50%" r="40%">
          <stop offset="0%"   stopColor="#facc15" stopOpacity="0.9" />
          <stop offset="40%"  stopColor="#10b981" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="glow2" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#f97316" stopOpacity="0.7" />
          <stop offset="50%"  stopColor="#06b6d4" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0" />
        </radialGradient>
        <pattern id="dots" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="#3b82f6" opacity="0.4" />
        </pattern>
      </defs>
      <rect width="900" height="460" fill="#0c1330" />
      <rect width="900" height="460" fill="url(#dots)" />
      <ellipse cx={450 + offset} cy="230" rx="320" ry="160" fill="url(#glow1)" />
      <ellipse cx="450" cy="230" rx="220" ry="100" fill="url(#glow2)" />
      <g stroke="#f97316" strokeWidth="3" fill="none" opacity="0.95">
        <path d="M 360 180 L 540 180 L 540 195 L 360 195 L 360 210 L 540 210 L 540 225 L 360 225 L 360 240 L 540 240 L 540 255 L 360 255 L 360 270 L 540 270" />
      </g>
      {[180, 720].map(x => (
        <g key={x}><rect x={x-30} y="80" width="60" height="36" fill="#facc15" rx="2" /><rect x={x-6} y="116" width="12" height="40" fill="#facc15" /></g>
      ))}
      {[160, 380, 560, 740].map(x => (
        <rect key={`b-${x}`} x={x-20} y="350" width="40" height="22" fill="#facc15" rx="2" opacity="0.85" />
      ))}
      {[[240,200],[240,240],[660,200],[660,240]].map(([x,y],i) => (
        <rect key={i} x={x-14} y={y-6} width="28" height="12" fill="#22d3ee" opacity="0.9" rx="1" />
      ))}
      {[100, 800].map(x => (
        <g key={x}><rect x={x-18} y="400" width="36" height="30" fill="#facc15" rx="2" /><line x1={x} y1="380" x2={x} y2="400" stroke="#facc15" strokeWidth="3" /></g>
      ))}
      <text x="836" y="332" fill="#facc15" fontSize="11" fontWeight="bold" opacity="0.7" fontFamily="monospace">MPAC</text>
      <text x="836" y="346" fill="#facc15" fontSize="11" fontWeight="bold" opacity="0.7" fontFamily="monospace">STSU</text>
    </svg>
  );
}

function EigenmodeFieldView({ derived, variant = "e" }: { derived: DerivedAll; variant?: "e"|"h"|"j" }) {
  const [selectedMode, setSelectedMode] = useState(0);
  const [layers, setLayers] = useState<Record<string,boolean>>({
    Metal_1: true, Metal_2: true, Josephson_Junction: true,
    Dielectric_1: true, Dielectric_2: true, Substrate: true, Air_Box: false, Ports: true,
  });
  const [showLayers,  setShowLayers]  = useState(true);
  const [showViewCtrl, setShowViewCtrl] = useState(true);
  const [showFreq,    setShowFreq]    = useState(true);
  const [tool, setTool] = useState<"move"|"pan"|"rotate"|"zoom"|"fit">("move");
  const [zoom, setZoom] = useState(1);

  const viewTools = [
    { id: "move"   as const, Icon: Move,     label: "Move" },
    { id: "pan"    as const, Icon: Hand,     label: "Pan" },
    { id: "rotate" as const, Icon: Hand,     label: "Rotate" },
    { id: "zoom"   as const, Icon: ZoomIn,   label: "Zoom in" },
    { id: "fit"    as const, Icon: Maximize2, label: "Fit to view" },
  ];

  const label = variant === "h" ? "| Total H | (dBA/m)" : variant === "j" ? "| Total J | (dBA/m²)" : "| Total E | (dBV/m)";

  return (
    <Card className="overflow-hidden border-slate-200 rounded-xl shadow-sm">
      <div className="px-4 py-2.5 border-b border-slate-200 flex items-center justify-between bg-white">
        <div className="text-xs font-bold text-slate-700">{label}</div>
        <div className="flex items-center gap-2">
          <button onClick={() => toast.success("Snapshot captured")}
            className="h-7 w-7 rounded hover:bg-slate-100 inline-flex items-center justify-center text-slate-500">
            <Camera className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => {
            const blob = new Blob([JSON.stringify(derived.eigenmode,null,2)],{type:"application/json"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href=url; a.download=`field_mode_${selectedMode+1}.json`; a.click(); URL.revokeObjectURL(url);
            toast.success("Field data exported");
          }} className="h-7 w-7 rounded hover:bg-slate-100 inline-flex items-center justify-center text-slate-500">
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="relative bg-gradient-to-br from-slate-900 to-slate-950 h-[460px] overflow-hidden">
        {/* Colorbar */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-2/3 z-10">
          <div className="h-3 rounded-sm" style={{ background: "linear-gradient(to right, #1e3a8a, #2563eb, #06b6d4, #10b981, #84cc16, #facc15, #f97316, #ef4444)" }} />
          <div className="flex justify-between text-[10px] text-white/80 mt-0.5 font-mono">
            {["164","180","196","211","219","234"].map(v => <span key={v}>{v}</span>)}
          </div>
        </div>
        <FieldHeatmapSVG selectedMode={selectedMode} />
        {/* Layers panel */}
        {showLayers && (
          <div className="absolute top-16 left-3 w-52 bg-white/[0.15] backdrop-blur-md rounded-lg border border-white/20 text-xs z-10 shadow-[0_4px_24px_rgba(0,0,0,0.45)] transition-opacity duration-300 opacity-[0.18] hover:opacity-100">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/15">
              <span className="font-bold text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]">Layers</span>
              <button onClick={() => setShowLayers(false)} className="text-white/60 hover:text-white"><X className="h-3 w-3" /></button>
            </div>
            <div className="p-2 space-y-1">
              {Object.entries(layers).map(([name, on]) => (
                <button key={name} onClick={() => setLayers(s => ({ ...s, [name]: !s[name] }))}
                  className="w-full flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-white/10">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-3 w-3 rounded-sm shrink-0", LAYER_COLORS[name] || "bg-slate-400")} />
                    <span className="text-white/90 [text-shadow:0_0_8px_rgba(255,255,255,0.5)]">{name}</span>
                  </div>
                  {on ? <Eye className="h-3 w-3 text-white/60" /> : <EyeOff className="h-3 w-3 text-white/30" />}
                </button>
              ))}
            </div>
          </div>
        )}
        {/* View controls */}
        {showViewCtrl && (
          <div className="absolute top-[280px] left-3 w-52 bg-white/[0.15] backdrop-blur-md rounded-lg border border-white/20 z-10 shadow-[0_4px_24px_rgba(0,0,0,0.45)] transition-opacity duration-300 opacity-[0.18] hover:opacity-100">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/15">
              <span className="text-xs font-bold text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]">View Controls</span>
              <button onClick={() => setShowViewCtrl(false)} className="text-white/60 hover:text-white"><X className="h-3 w-3" /></button>
            </div>
            <div className="flex items-center gap-1 p-2">
              {viewTools.map(({ id, Icon, label: lbl }) => (
                <button key={id} title={lbl} onClick={() => {
                  setTool(id);
                  if (id === "zoom") setZoom(z => Math.min(z + 0.2, 3));
                  else if (id === "fit") setZoom(1);
                  toast.success(lbl);
                }} className={cn("h-7 w-7 inline-flex items-center justify-center rounded hover:bg-white/15",
                  tool === id ? "bg-white/20 text-white" : "text-white/70")}>
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>
        )}
        {/* Restore chips */}
        {(!showLayers || !showViewCtrl || !showFreq) && (
          <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1.5">
            {!showLayers   && <button onClick={() => setShowLayers(true)}   className="text-[10px] font-semibold px-2 py-1 rounded-md bg-white/[0.15] backdrop-blur-md text-white/90 border border-white/20 shadow-[0_2px_12px_rgba(0,0,0,0.4)] [text-shadow:0_0_8px_rgba(255,255,255,0.6)] transition-opacity duration-300 opacity-[0.18] hover:opacity-100">Show Layers</button>}
            {!showViewCtrl && <button onClick={() => setShowViewCtrl(true)} className="text-[10px] font-semibold px-2 py-1 rounded-md bg-white/[0.15] backdrop-blur-md text-white/90 border border-white/20 shadow-[0_2px_12px_rgba(0,0,0,0.4)] [text-shadow:0_0_8px_rgba(255,255,255,0.6)] transition-opacity duration-300 opacity-[0.18] hover:opacity-100">Show View Controls</button>}
            {!showFreq     && <button onClick={() => setShowFreq(true)}     className="text-[10px] font-semibold px-2 py-1 rounded-md bg-white/[0.15] backdrop-blur-md text-white/90 border border-white/20 shadow-[0_2px_12px_rgba(0,0,0,0.4)] [text-shadow:0_0_8px_rgba(255,255,255,0.6)] transition-opacity duration-300 opacity-[0.18] hover:opacity-100">Show Frequency</button>}
          </div>
        )}
        {/* XYZ gizmo */}
        <div className="absolute bottom-4 left-6 z-10">
          <svg width="60" height="60" viewBox="0 0 60 60">
            <circle cx="20" cy="40" r="4" fill="#10b981" />
            <line x1="20" y1="40" x2="50" y2="40" stroke="#ef4444" strokeWidth="2" markerEnd="url(#ax)" />
            <line x1="20" y1="40" x2="20" y2="10" stroke="#06b6d4" strokeWidth="2" markerEnd="url(#ay)" />
            <text x="52" y="44" fill="#ef4444" fontSize="10" fontWeight="bold">X</text>
            <text x="14" y="10" fill="#06b6d4" fontSize="10" fontWeight="bold">Z</text>
            <defs>
              <marker id="ax" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0 0,6 3,0 6" fill="#ef4444" /></marker>
              <marker id="ay" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><polygon points="0 0,6 3,0 6" fill="#06b6d4" /></marker>
            </defs>
          </svg>
        </div>
        {/* Frequency picker */}
        {showFreq && (
          <div className="absolute top-16 right-3 w-32 bg-white/[0.15] backdrop-blur-md rounded-lg border border-white/20 flex flex-col z-10 shadow-[0_4px_24px_rgba(0,0,0,0.45)] transition-opacity duration-300 opacity-[0.18] hover:opacity-100">
            <div className="px-3 py-2 border-b border-white/15 flex items-center justify-between">
              <span className="text-xs font-bold text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]">Frequency (MHz)</span>
              <button onClick={() => setShowFreq(false)} className="text-white/60 hover:text-white"><X className="h-3 w-3" /></button>
            </div>
            <div className="overflow-y-auto max-h-[300px]">
              {derived.eigenmode.modes.map((m, i) => (
                <button key={i} onClick={() => setSelectedMode(i)}
                  className={cn("w-full text-left px-3 py-1.5 text-xs font-mono",
                    selectedMode === i ? "bg-accent/80 text-white font-semibold" : "text-white/80 hover:bg-white/10 [text-shadow:0_0_6px_rgba(255,255,255,0.4)]")}>
                  {(m.f_GHz * 1000).toFixed(2)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Bottom dock ──────────────────────────────────────────────────────────────
function BottomDock({ derived, solver, liveLogs, progress, status, onClose }: {
  derived: DerivedAll; solver: SolverId;
  liveLogs: LogLine[]; progress: number; status: RunStatus;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"logs"|"messages"|"probe"|"results"|"progress">("logs");
  const logs    = liveLogs.length > 0 ? liveLogs : makeLogs(solver, derived);
  const logRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs.length]);

  return (
    <Card className="border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="border-b border-slate-200 px-4">
        <div className="flex items-center justify-between gap-1 h-10">
          <div className="flex items-center gap-1 h-10">
            {(["logs","messages","probe","results","progress"] as const).map(id => (
              <button key={id} onClick={() => setTab(id)}
                className={cn("h-10 px-3 text-xs font-medium border-b-2 -mb-px flex items-center gap-1.5",
                  tab === id ? "border-accent text-accent font-semibold" : "border-transparent text-slate-500 hover:text-slate-700")}>
                {id.charAt(0).toUpperCase() + id.slice(1)}
                {id === "messages" && <span className="text-[10px] font-bold px-1.5 rounded-full bg-accent/15 text-accent">3</span>}
                {id === "progress" && status === "running" && <span className="text-[10px] font-bold px-1.5 rounded-full bg-violet-100 text-violet-700">{Math.round(progress)}%</span>}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-slate-100 text-slate-500">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-12 gap-4 p-4">
        {/* Log terminal */}
        <div ref={logRef} className="col-span-4 bg-slate-50 rounded-lg border border-slate-200 p-3 font-mono text-[11px] leading-5 h-[220px] overflow-auto">
          {logs.map((line, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-slate-400">{line.time}</span>
              <span className={cn(line.kind === "ok" ? "text-emerald-600" : line.kind === "warn" ? "text-amber-600" : "text-slate-700")}>
                {line.text}
              </span>
            </div>
          ))}
          {status === "running" && (
            <div className="flex gap-2 mt-1 text-violet-600"><Loader2 className="h-3 w-3 animate-spin" /><span>Streaming… {Math.round(progress)}%</span></div>
          )}
        </div>
        {/* Mode list */}
        <div className="col-span-3">
          <div className="text-xs font-bold text-slate-700 mb-2">Mode List</div>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50">
                <tr className="text-slate-500">
                  {["Mode #","Frequency (GHz)","Q Loaded","Q Unloaded","R/Q (Ω)"].map(h =>
                    <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {derived.eigenmode.modes.slice(0, 5).map(m => (
                  <tr key={m.n} className="border-t border-slate-100">
                    <td className="px-2 py-1.5 font-mono text-slate-700">{m.n}</td>
                    <td className="px-2 py-1.5 font-mono text-slate-700">{m.f_GHz.toFixed(3)}</td>
                    <td className="px-2 py-1.5 font-mono text-slate-700">{fmtSci(m.Q_loaded,2)}</td>
                    <td className="px-2 py-1.5 font-mono text-slate-700">{fmtSci(m.Q_unloaded,2)}</td>
                    <td className="px-2 py-1.5 font-mono text-slate-700">{m.R_over_Q.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Field summary */}
        <div className="col-span-3">
          <div className="text-xs font-bold text-slate-700 mb-2">
            Field Summary <span className="text-slate-400 font-normal">(Mode 1 @ {derived.eigenmode.modes[0].f_GHz.toFixed(3)} GHz)</span>
          </div>
          <div className="border border-slate-200 rounded-lg p-3 text-[11px] space-y-1.5">
            {[
              ["Max |E|",       `${fmtSci(derived.eigenmode.modes[0].Emax_Vm,2)} V/m`],
              ["Max |H|",       `${derived.eigenmode.modes[0].Hmax_Am.toFixed(2)} A/m`],
              ["Stored Energy", `${fmtSci(derived.eigenmode.modes[0].stored_energy_J,2)} J`],
              ["E Field Energy",`${fmtSci(derived.eigenmode.modes[0].E_energy_J,2)} J`],
              ["H Field Energy",`${fmtSci(derived.eigenmode.modes[0].H_energy_J,2)} J`],
              ["Radiation Loss",`${derived.eigenmode.modes[0].radiation_loss_W.toFixed(4)} W`],
            ].map(([k,v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-slate-500">{k}</span>
                <span className="font-mono text-slate-800 font-semibold">{v}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Mini preview */}
        <div className="col-span-2">
          <div className="text-xs font-bold text-slate-700 mb-2 flex items-center justify-between">
            Preview (Mode 1)
            <div className="flex items-center gap-1">
              <button className="h-5 w-5 rounded hover:bg-slate-100 inline-flex items-center justify-center"><ChevronLeft className="h-3 w-3 text-slate-500" /></button>
              <button className="h-5 w-5 rounded hover:bg-slate-100 inline-flex items-center justify-center"><ChevronRight className="h-3 w-3 text-slate-500" /></button>
            </div>
          </div>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="h-[120px] bg-gradient-to-br from-slate-900 to-slate-950 relative">
              <FieldHeatmapSVG selectedMode={0} />
            </div>
            <div className="px-2 py-1.5 border-t border-slate-200">
              <Select defaultValue="xy">
                <SelectTrigger className="h-7 text-[11px] border-none shadow-none px-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="xy">Slice: XY Plane</SelectItem>
                  <SelectItem value="xz">Slice: XZ Plane</SelectItem>
                  <SelectItem value="yz">Slice: YZ Plane</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Parameters rail ──────────────────────────────────────────────────────────
function ParametersRail({ solver, paramsTab, setParamsTab, onRun, status }: {
  solver: SolverId; paramsTab: "setup"|"advanced"; setParamsTab: (v: "setup"|"advanced") => void;
  onRun: () => void; status: RunStatus;
}) {
  const running = status === "running";
  return (
    <div className="w-[320px] bg-white border-l border-slate-200 flex flex-col shrink-0 overflow-hidden">
      <div className="h-14 px-4 flex items-center justify-between border-b border-slate-200 shrink-0">
        <span className="text-sm font-bold text-slate-900">Parameters</span>
        <button className="h-7 w-7 rounded hover:bg-slate-100 inline-flex items-center justify-center text-slate-500">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-4 pt-3 shrink-0">
        <div className="flex gap-4 border-b border-slate-200">
          {(["setup","advanced"] as const).map(t => (
            <button key={t} onClick={() => setParamsTab(t)}
              className={cn("pb-2 text-xs font-medium capitalize",
                paramsTab === t ? "text-accent border-b-2 border-accent font-semibold -mb-px" : "text-slate-500")}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {paramsTab === "setup" ? <SetupForm solver={solver} /> : <AdvancedForm />}
      </div>
      <div className="p-3 border-t border-slate-200 shrink-0">
        <Button onClick={onRun} disabled={running} className="w-full bg-accent hover:bg-accent/90 text-white font-semibold gap-2 shadow-sm">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
          {running ? "Running…" : "Run Simulation"}
        </Button>
      </div>
    </div>
  );
}

function FormGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="text-xs font-bold text-slate-800 mb-2">{title}</div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}
function ParamRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <label className="text-xs text-slate-600 truncate">{label}</label>
      <div className="w-[150px]">{children}</div>
    </div>
  );
}
function NumInput({ value, unit }: { value: string|number; unit?: string }) {
  return (
    <div className="flex">
      <Input defaultValue={String(value)} className="h-7 text-xs rounded-r-none border-r-0" />
      {unit && <span className="inline-flex items-center px-2 text-[10px] font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-r-md">{unit}</span>}
    </div>
  );
}

function SetupForm({ solver }: { solver: SolverId }) {
  if (solver === "eigenmode") return (
    <>
      <FormGroup title="Frequency Sweep">
        <ParamRow label="Start Frequency"><NumInput value={4} unit="GHz" /></ParamRow>
        <ParamRow label="Stop Frequency"><NumInput value={10} unit="GHz" /></ParamRow>
        <ParamRow label="Step Size"><NumInput value={10} unit="MHz" /></ParamRow>
        <ParamRow label="Num. Modes"><NumInput value={10} /></ParamRow>
      </FormGroup>
      <FormGroup title="Solver Settings">
        <ParamRow label="Solver Type">
          <Select defaultValue="hfss"><SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="hfss">HFSS Eigenmode</SelectItem><SelectItem value="palace">Palace Eigenmode</SelectItem></SelectContent>
          </Select>
        </ParamRow>
        <ParamRow label="Basis Order">
          <Select defaultValue="high"><SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="mixed">Mixed</SelectItem><SelectItem value="high">High</SelectItem></SelectContent>
          </Select>
        </ParamRow>
        <ParamRow label="Convergence"><NumInput value={0.01} /></ParamRow>
        <ParamRow label="Maximum Passes"><NumInput value={20} /></ParamRow>
      </FormGroup>
      <FormGroup title="Boundary Conditions">
        <ParamRow label="Outer Boundary">
          <Select defaultValue="rad"><SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="rad">Radiation</SelectItem><SelectItem value="pml">PML</SelectItem><SelectItem value="pec">PEC</SelectItem></SelectContent>
          </Select>
        </ParamRow>
        <ParamRow label="Symmetry">
          <Select defaultValue="none"><SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="none">None</SelectItem><SelectItem value="xy">XY</SelectItem><SelectItem value="xz">XZ</SelectItem><SelectItem value="yz">YZ</SelectItem></SelectContent>
          </Select>
        </ParamRow>
      </FormGroup>
      <FormGroup title="Options">
        {["Generate Fields","Save Field Data","Solve for Q","Use Adaptive Mesh"].map(o => (
          <label key={o} className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer"><Checkbox defaultChecked /> {o}</label>
        ))}
      </FormGroup>
    </>
  );
  if (solver === "driven_modal") return (
    <>
      <FormGroup title="Frequency Sweep">
        <ParamRow label="Start"><NumInput value={5} unit="GHz" /></ParamRow>
        <ParamRow label="Stop"><NumInput value={8} unit="GHz" /></ParamRow>
        <ParamRow label="Step"><NumInput value={1} unit="MHz" /></ParamRow>
      </FormGroup>
      <FormGroup title="Ports">
        <ParamRow label="Port Count"><NumInput value={2} /></ParamRow>
        <ParamRow label="Port Impedance"><NumInput value={50} unit="Ω" /></ParamRow>
      </FormGroup>
    </>
  );
  if (solver === "q3d") return (
    <>
      <FormGroup title="Nets">
        <ParamRow label="Net Selection">
          <Select defaultValue="all"><SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All nets</SelectItem><SelectItem value="qubits">Qubit pads only</SelectItem></SelectContent>
          </Select>
        </ParamRow>
        <ParamRow label="Ground Net"><Input defaultValue="GND" className="h-7 text-xs" /></ParamRow>
      </FormGroup>
      <FormGroup title="Solution">
        <ParamRow label="Frequency"><NumInput value={5} unit="GHz" /></ParamRow>
      </FormGroup>
    </>
  );
  if (solver === "physics") return (
    <FormGroup title="Transmon">
      <ParamRow label="Number of Levels"><NumInput value={6} /></ParamRow>
      <ParamRow label="Charge Offset n_g"><NumInput value={0.5} /></ParamRow>
      <ParamRow label="Flux Bias Φ/Φ₀"><NumInput value={0} /></ParamRow>
    </FormGroup>
  );
  if (solver === "noise") return (
    <FormGroup title="Operating Conditions">
      <ParamRow label="Operating Temp"><NumInput value={20} unit="mK" /></ParamRow>
      <ParamRow label="Base Temp"><NumInput value={10} unit="mK" /></ParamRow>
      <ParamRow label="PSD f_min"><NumInput value={0.1} unit="Hz" /></ParamRow>
      <ParamRow label="PSD f_max"><NumInput value={1e6} unit="Hz" /></ParamRow>
    </FormGroup>
  );
  if (solver === "coupling") return (
    <FormGroup title="Coupling">
      <ParamRow label="Distance min"><NumInput value={200} unit="µm" /></ParamRow>
      <ParamRow label="Distance max"><NumInput value={1500} unit="µm" /></ParamRow>
    </FormGroup>
  );
  if (solver === "purcell") return (
    <FormGroup title="Purcell">
      <ParamRow label="Resonator Q_e"><NumInput value={15000} /></ParamRow>
      <ParamRow label="Target T₁"><NumInput value={100} unit="µs" /></ParamRow>
    </FormGroup>
  );
  return (
    <FormGroup title="Setup">
      <ParamRow label="Frequency"><NumInput value={5} unit="GHz" /></ParamRow>
    </FormGroup>
  );
}

function AdvancedForm() {
  return (
    <>
      <FormGroup title="Mesh Refinement">
        <ParamRow label="Refinement %"><NumInput value={30} unit="%" /></ParamRow>
        <ParamRow label="Lambda Refinement"><NumInput value={0.25} /></ParamRow>
        <ParamRow label="Minimum Passes"><NumInput value={5} /></ParamRow>
      </FormGroup>
      <FormGroup title="Convergence">
        <ParamRow label="Energy Error"><NumInput value={1} unit="%" /></ParamRow>
        <label className="flex items-center gap-2 text-xs text-slate-700"><Checkbox defaultChecked /> Auto-increase solution order</label>
      </FormGroup>
    </>
  );
}

// ── Status bar ───────────────────────────────────────────────────────────────
function StatusBar({ derived, status, progress }: { derived: DerivedAll; status: RunStatus; progress: number }) {
  return (
    <div className="h-7 px-4 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-[10px] font-mono text-slate-500 shrink-0">
      <div className="flex items-center gap-4">
        <span>Solver: HFSS 2025 R1</span>
        <span>Matrix: {derived.eigenmode.matrix_size_M.toFixed(1)}M</span>
        <span>Pass: {derived.eigenmode.adaptive_passes}</span>
        <span>Residual: {derived.eigenmode.residual.toFixed(4)}</span>
        {status === "running"   && <span className="flex items-center gap-1.5 text-violet-600"><Loader2 className="h-3 w-3 animate-spin" /> {Math.round(progress)}%</span>}
        {status === "completed" && <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3 w-3" /> Complete</span>}
      </div>
      <div>Units: mm, GHz, dB</div>
    </div>
  );
}

// ── Charts ────────────────────────────────────────────────────────────────────
function SpectrumChart({ data }: { data: { f: number; Q: number }[] }) {
  return (
    <Card className="p-4 border-slate-200 rounded-xl shadow-sm">
      <div className="text-xs font-bold text-slate-700 mb-3">Eigen Spectrum — frequency vs Q</div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="f" tickFormatter={v => Number(v).toFixed(2)} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtSci(Number(v))} />
            <RTooltip contentStyle={{ fontSize: 11 }} />
            <Bar dataKey="Q" fill="#7C3AED" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function QFactorBars({ modes }: { modes: DerivedAll["eigenmode"]["modes"] }) {
  const data = modes.map(m => ({ name: `M${m.n}`, "Q Loaded": m.Q_loaded/1e6, "Q Unloaded": m.Q_unloaded/1e6 }));
  return (
    <Card className="p-4 border-slate-200 rounded-xl shadow-sm">
      <div className="text-xs font-bold text-slate-700 mb-3">Q Factors per mode (millions)</div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <RTooltip contentStyle={{ fontSize: 11 }} />
            <Bar dataKey="Q Loaded"   fill="#7C3AED" radius={[4,4,0,0]} />
            <Bar dataKey="Q Unloaded" fill="#a78bfa" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function EnergyBars({ modes }: { modes: DerivedAll["eigenmode"]["modes"] }) {
  const data = modes.map(m => ({ name: `M${m.n}`, E: m.E_energy_J*1e19, H: m.H_energy_J*1e19 }));
  return (
    <Card className="p-4 border-slate-200 rounded-xl shadow-sm">
      <div className="text-xs font-bold text-slate-700 mb-3">Stored energy (×10⁻¹⁹ J)</div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <RTooltip contentStyle={{ fontSize: 11 }} />
            <Bar dataKey="E" fill="#3b82f6" radius={[4,4,0,0]} />
            <Bar dataKey="H" fill="#06b6d4" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function SParamChart({ data }: { data: { f: number; S11: number; S21: number }[] }) {
  return (
    <Card className="p-4 border-slate-200 rounded-xl shadow-sm">
      <div className="text-xs font-bold text-slate-700 mb-3">S-Parameters (dB)</div>
      <div className="h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="f" tickFormatter={v => Number(v).toFixed(2)} tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} unit=" dB" />
            <RTooltip contentStyle={{ fontSize: 11 }} />
            <ReferenceLine y={-20} stroke="#ef4444" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="S11" stroke="#7C3AED" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="S21" stroke="#06b6d4" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function Q3DMatrix({ derived, kind }: { derived: DerivedAll; kind: "c"|"l"|"r"|"g" }) {
  const labels = { c: "Capacitance (fF)", l: "Inductance (nH)", r: "Resistance (mΩ)", g: "Conductance (µS)" };
  const scale  = { c: 1, l: 0.1, r: 0.05, g: 0.001 }[kind];
  const m = derived.q3d.matrix;
  const max = Math.max(...m.flat().map(Math.abs));
  return (
    <Card className="p-4 border-slate-200 rounded-xl shadow-sm">
      <div className="text-xs font-bold text-slate-700 mb-3">{labels[kind]} matrix</div>
      <div className="overflow-x-auto">
        <table className="text-[11px]">
          <thead><tr><th className="px-2 py-1"></th>
            {derived.q3d.netNames.map(n => <th key={n} className="px-2 py-1 font-mono text-slate-500">{n}</th>)}
          </tr></thead>
          <tbody>
            {m.map((row, i) => (
              <tr key={i}><td className="px-2 py-1 font-mono text-slate-500">{derived.q3d.netNames[i]}</td>
                {row.map((v, j) => {
                  const val = v * scale;
                  const intensity = Math.abs(val) / (max * scale);
                  return <td key={j} className="px-2 py-1 font-mono text-center" style={{ background: `rgba(124,58,237,${intensity*0.35})` }}>{val.toFixed(2)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Q3DDerivedTable({ derived }: { derived: DerivedAll }) {
  const rows = [
    ["C_Σ (total shunt)",  `${derived.q3d.C_sigma_fF.toFixed(2)} fF`,             "80–100 fF"],
    ["L_J (Josephson)",    `${derived.q3d.L_J_nH.toFixed(2)} nH`,                  "3–8 nH"],
    ["L_geometric",        `${derived.q3d.L_geometric_nH.toFixed(2)} nH`,           "<1 nH"],
    ["L_kinetic",          `${derived.q3d.L_kinetic_nH.toFixed(2)} nH`,             "<0.5 nH"],
    ["C_qq (Q-Q)",         `${derived.q3d.C_qq_fF.toFixed(2)} fF`,                  "1–5 fF"],
    ["C_coup",             `${derived.q3d.C_coup_fF.toFixed(2)} fF`,                "2–10 fF"],
    ["R_sheet",            `${derived.q3d.R_sheet_mOhm_sq.toFixed(4)} mΩ/□`,       "<0.1"],
    ["G_substrate",        `${fmtSci(derived.q3d.G_substrate_uS,2)} µS`,            "~0"],
  ];
  return (
    <Card className="p-4 border-slate-200 rounded-xl shadow-sm">
      <div className="text-xs font-bold text-slate-700 mb-3">Derived RLGC parameters</div>
      <table className="w-full text-xs">
        <thead><tr className="text-slate-500 border-b border-slate-200">
          {["Parameter","Value","Target"].map(h => <th key={h} className="text-left py-1.5 font-semibold">{h}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(([k,v,t]) => (
            <tr key={k} className="border-b border-slate-100">
              <td className="py-1.5 text-slate-700">{k}</td>
              <td className="py-1.5 font-mono font-semibold text-slate-900">{v}</td>
              <td className="py-1.5 text-accent">{t}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function EnergyLevels({ derived }: { derived: DerivedAll }) {
  const { f01_GHz: f01, f12_GHz: f12, f23_GHz: f23, alpha_MHz } = derived.epr;
  const levels = [
    { n: 0, E: 0 }, { n: 1, E: f01 }, { n: 2, E: f01+f12 },
    { n: 3, E: f01+f12+f23 }, { n: 4, E: f01+f12+f23+(f23+alpha_MHz/1000) },
  ];
  return (
    <Card className="p-4 border-slate-200 rounded-xl shadow-sm">
      <div className="text-xs font-bold text-slate-700 mb-3">Transmon energy levels (GHz)</div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={levels} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="n" tick={{ fontSize: 10 }} />
            <RTooltip contentStyle={{ fontSize: 11 }} />
            <Bar dataKey="E" fill="#7C3AED" radius={[0,4,4,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function CoherencePanel({ derived }: { derived: DerivedAll }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card className="p-4 border-slate-200 rounded-xl shadow-sm">
        <div className="text-xs font-bold text-slate-700 mb-3">Coherence times</div>
        <div className="space-y-2.5 text-xs">
          {[
            ["T₁",         `${derived.coherence.T1_us.toFixed(0)} µs`,               ">100"],
            ["T₂",         `${derived.coherence.T2_us.toFixed(0)} µs`,               ">80"],
            ["T₂ Echo",    `${derived.coherence.T2_echo_us.toFixed(0)} µs`,           ">150"],
            ["T_φ",        `${derived.coherence.T_phi_us.toFixed(0)} µs`,             ">200"],
            ["T₁ Purcell", `${(derived.coherence.T1_purcell_us/1000).toFixed(2)} ms`, ">1 ms"],
          ].map(([k,v,t]) => (
            <div key={k} className="flex justify-between border-b border-slate-100 pb-1.5">
              <span className="text-slate-600">{k}</span>
              <span className="font-mono font-semibold text-slate-900">{v}</span>
              <span className="text-accent text-[10px] self-end">target {t}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-4 border-slate-200 rounded-xl shadow-sm">
        <div className="text-xs font-bold text-slate-700 mb-3">Design rule checks</div>
        <DesignRuleChips derived={derived} />
      </Card>
    </div>
  );
}

function ParticipationBars({ derived }: { derived: DerivedAll }) {
  const data = [
    { name: "Junction",   p: derived.epr.p_J,         fill: "#7C3AED" },
    { name: "Pad",        p: derived.epr.p_pad,        fill: "#a78bfa" },
    { name: "Substrate",  p: derived.epr.p_sub * 100,  fill: "#f97316" },
    { name: "Metal",      p: derived.epr.p_met * 100,  fill: "#facc15" },
  ];
  return (
    <Card className="p-4 border-slate-200 rounded-xl shadow-sm">
      <div className="text-xs font-bold text-slate-700 mb-3">Energy participation ratios</div>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <RTooltip contentStyle={{ fontSize: 11 }} />
            <Bar dataKey="p" radius={[4,4,0,0]}>{data.map((d,i) => <Cell key={i} fill={d.fill} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function TransitionTable({ derived }: { derived: DerivedAll }) {
  return (
    <Card className="p-4 border-slate-200 rounded-xl shadow-sm">
      <div className="text-xs font-bold text-slate-700 mb-3">Transition frequencies</div>
      <table className="w-full text-xs">
        <thead><tr className="text-slate-500 border-b border-slate-200">
          {["Transition","Frequency","Target"].map(h => <th key={h} className="text-left py-1.5 font-semibold">{h}</th>)}
        </tr></thead>
        <tbody>
          {[
            ["f₀₁", `${derived.epr.f01_GHz.toFixed(4)} GHz`, "5–6 GHz"],
            ["f₁₂", `${derived.epr.f12_GHz.toFixed(4)} GHz`, "—"],
            ["f₂₃", `${derived.epr.f23_GHz.toFixed(4)} GHz`, "—"],
            ["α",   `${derived.epr.alpha_MHz.toFixed(0)} MHz`, "−200 to −300"],
          ].map(([k,v,t]) => (
            <tr key={k} className="border-b border-slate-100">
              <td className="py-1.5">{k}</td>
              <td className="py-1.5 font-mono font-semibold">{v}</td>
              <td className="py-1.5 text-accent text-[10px]">{t}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function PSDChart({ data }: { data: { f: number; S: number }[] }) {
  return (
    <Card className="p-4 border-slate-200 rounded-xl shadow-sm">
      <div className="text-xs font-bold text-slate-700 mb-3">Noise PSD S(f)</div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="f" tick={{ fontSize: 10 }} tickFormatter={v => fmtSci(Number(v))} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtSci(Number(v))} />
            <RTooltip contentStyle={{ fontSize: 11 }} formatter={v => fmtSci(Number(v),2)} />
            <Line dataKey="S" stroke="#7C3AED" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function T1Budget({ data }: { data: { channel: string; us: number }[] }) {
  return (
    <Card className="p-4 border-slate-200 rounded-xl shadow-sm">
      <div className="text-xs font-bold text-slate-700 mb-3">T₁ budget by loss channel (µs)</div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="channel" tick={{ fontSize: 10 }} width={100} />
            <RTooltip contentStyle={{ fontSize: 11 }} />
            <Bar dataKey="us" fill="#7C3AED" radius={[0,4,4,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function DistanceCurve({ data }: { data: { d_um: number; g_MHz: number }[] }) {
  return (
    <Card className="p-4 border-slate-200 rounded-xl shadow-sm">
      <div className="text-xs font-bold text-slate-700 mb-3">Coupling vs distance</div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="d_um" tick={{ fontSize: 10 }} unit=" µm" />
            <YAxis tick={{ fontSize: 10 }} unit=" MHz" />
            <RTooltip contentStyle={{ fontSize: 11 }} />
            <Line dataKey="g_MHz" stroke="#7C3AED" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function LossBreakdown({ derived }: { derived: DerivedAll }) {
  const data = [
    { name: "Conductor",    v: derived.hfss.conductor_loss_dB_m * 1000 },
    { name: "Dielectric",   v: derived.hfss.dielectric_loss_dB_m * 1000 },
    { name: "Radiation",    v: 0.5 },
    { name: "Surface (TLS)", v: 80 },
    { name: "Package",      v: 50 },
  ];
  return (
    <Card className="p-4 border-slate-200 rounded-xl shadow-sm">
      <div className="text-xs font-bold text-slate-700 mb-3">Loss breakdown (ppm equivalent)</div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <RTooltip contentStyle={{ fontSize: 11 }} />
            <Bar dataKey="v" fill="#7C3AED" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function DesignRuleChips({ derived }: { derived: DerivedAll }) {
  const metrics: Record<string, number> = {
    Ej_Ec: derived.epr.Ej_Ec, alpha: derived.epr.alpha_MHz,
    g_over_delta: derived.epr.g_over_delta, Q_i: derived.hfss.Q_i,
    ZZ: derived.epr.ZZ_kHz, T1: derived.coherence.T1_us,
    T1_purcell: derived.coherence.T1_purcell_us,
    yield_prediction: derived.validation.yield_prediction_pct,
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {DESIGN_RULES.map(r => {
        const state = r.check(metrics);
        const Icon  = state === "pass" ? CheckCircle2 : AlertTriangle;
        const cls   = state === "pass" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : state === "warn" ? "bg-amber-50  text-amber-700  border-amber-200"
                    :                    "bg-rose-50   text-rose-700   border-rose-200";
        return (
          <Tooltip key={r.id}>
            <TooltipTrigger asChild>
              <span className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[10px] font-semibold", cls)}>
                <Icon className="h-3 w-3" /> {r.label}
              </span>
            </TooltipTrigger>
            <TooltipContent><span className="text-xs">{r.message(metrics)}</span></TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function PlaceholderPanel({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <Card className="p-10 border-slate-200 rounded-xl shadow-sm text-center">
      <div className="text-sm font-bold text-slate-700 mb-1 capitalize">{title}</div>
      <div className="text-xs text-slate-500">{subtitle}</div>
      <Badge variant="outline" className="mt-3 text-[10px]">derived</Badge>
    </Card>
  );
}
