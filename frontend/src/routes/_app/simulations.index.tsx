import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  PlayCircle, Search, Filter, ChevronLeft, ChevronRight,
  Loader2, Trash2, RotateCw, Eye, Clock, AlertTriangle, CheckCircle2,
  Square, Activity,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useProject } from "@/lib/project-context";
import {
  fetchSimulations, deleteSimulation, retrySimulation,
  type Simulation, type SimulationHistoryResponse,
} from "@/lib/api/backend";

export const Route = createFileRoute("/_app/simulations/")({
  head: () => ({ meta: [{ title: "Simulations — Silicofeller Quantum Studio" }] }),
  component: SimulationsPage,
});

function statusColor(s: string) {
  return s === "completed" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
       : s === "running"   ? "bg-violet-100 text-violet-700 border-violet-200"
       : s === "queued"    ? "bg-sky-100 text-sky-700 border-sky-200"
       : s === "failed"    ? "bg-rose-100 text-rose-700 border-rose-200"
       :                     "bg-slate-100 text-slate-600 border-slate-200";
}

function StatusDot({ status }: { status: string }) {
  return (
    <span className={cn("h-2 w-2 rounded-full shrink-0 inline-block",
      status === "completed" ? "bg-emerald-500"
      : status === "running" ? "bg-violet-500 animate-pulse"
      : status === "queued"  ? "bg-sky-500 animate-pulse"
      : status === "failed"  ? "bg-rose-500"
      : "bg-slate-400")} />
  );
}

function fmtDuration(sec: number) {
  if (sec < 60) return `${Math.round(sec)}s`;
  return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`;
}

function SimCard({ sim, onDelete, onRetry }: {
  sim: Simulation;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="rounded-xl border-slate-200 bg-white shadow-sm hover:shadow-md hover:border-accent/30 transition-all">
        <div className="p-4 flex items-center gap-4">
          {/* Status indicator */}
          <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
            sim.status === "completed" ? "bg-emerald-50" :
            sim.status === "running"   ? "bg-violet-50" :
            sim.status === "failed"    ? "bg-rose-50"   : "bg-slate-100")}>
            {sim.status === "running" || sim.status === "queued"
              ? <Loader2 className="h-5 w-5 text-violet-500 animate-spin" />
              : sim.status === "completed"
              ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              : sim.status === "failed"
              ? <AlertTriangle className="h-5 w-5 text-rose-500" />
              : <Square className="h-5 w-5 text-slate-400" />}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-xs font-black text-slate-900 truncate">{sim.solver.charAt(0).toUpperCase() + sim.solver.slice(1)} Solver</p>
              <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border", statusColor(sim.status))}>
                <StatusDot status={sim.status} />
                {sim.status.charAt(0).toUpperCase() + sim.status.slice(1)}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-mono">{sim.id.slice(0, 16)}…</p>
            <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400 font-medium">
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(sim.created_at).toLocaleString()}</span>
              {sim.runtime_seconds && <span>{fmtDuration(sim.runtime_seconds)}</span>}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Link to="/simulations/$id" params={{ id: sim.id }}>
              <Button size="sm" variant="outline" className="h-8 rounded-lg text-[10px] font-bold gap-1">
                <Eye className="h-3 w-3" /> View
              </Button>
            </Link>
            {(sim.status === "completed" || sim.status === "failed" || sim.status === "cancelled") && (
              <Button size="sm" variant="outline" onClick={() => onRetry(sim.id)}
                className="h-8 rounded-lg text-[10px] font-bold gap-1">
                <RotateCw className="h-3 w-3" /> Retry
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => onDelete(sim.id)}
              className="h-8 rounded-lg text-[10px] font-bold gap-1 text-rose-500 hover:bg-rose-50 border-rose-100">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
        {sim.error_message && (
          <div className="px-4 pb-3">
            <p className="text-[10px] text-rose-600 font-medium bg-rose-50 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
              <AlertTriangle className="h-3 w-3 shrink-0" />{sim.error_message}
            </p>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

function SimulationsPage() {
  const { activeProject, projects } = useProject();
  const [data, setData] = useState<SimulationHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [solverFilter, setSolverFilter] = useState("all");
  const [projectScope, setProjectScope] = useState<"active" | "all">("active");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pid = projectScope === "active" ? activeProject?.id : undefined;
      const resp = await fetchSimulations({
        page,
        page_size: 20,
        project_id: pid,
        status: statusFilter !== "all" ? statusFilter : undefined,
        solver: solverFilter !== "all" ? solverFilter : undefined,
        sort_by: "created_at",
        sort_dir: "desc",
      });
      setData(resp);
    } catch {
      setData(null);
      toast.error("Failed to load simulations");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, solverFilter, projectScope, activeProject?.id]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this simulation?")) return;
    try {
      await deleteSimulation(id);
      toast.success("Deleted");
      load();
    } catch (e) { toast.error("Delete failed", { description: String(e) }); }
  };

  const handleRetry = async (id: string) => {
    try {
      const s = await retrySimulation(id);
      toast.success("Retry queued!", { description: `New run: ${s.id.slice(0, 8)}…` });
      load();
    } catch (e) { toast.error("Retry failed", { description: String(e) }); }
  };

  const sims = data?.items ?? [];
  const filtered = search
    ? sims.filter(s => s.id.includes(search) || s.solver.includes(search.toLowerCase()))
    : sims;

  return (
    <div className="h-full overflow-y-auto bg-[#F8F9FB]">
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-accent to-violet-600 flex items-center justify-center shadow-lg shadow-accent/20">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">Simulations</h1>
              <p className="text-sm text-slate-500">{data ? `${data.total_count} total runs` : "Loading…"}</p>
            </div>
          </div>
          <Link to="/simulations/new">
            <Button className="h-10 rounded-xl bg-gradient-to-r from-accent to-violet-600 text-white font-bold text-xs shadow-lg shadow-accent/25 gap-2">
              <PlayCircle className="h-4 w-4" /> New Simulation
            </Button>
          </Link>
        </motion.div>

        {/* Filters */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by ID or solver…"
                className="pl-9 h-9 text-xs rounded-xl border-slate-200" />
            </div>
            <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="h-9 text-xs rounded-xl border-slate-200 w-36">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {["all", "queued", "running", "completed", "failed", "cancelled"].map(s => (
                  <SelectItem key={s} value={s} className="text-xs">{s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={solverFilter} onValueChange={v => { setSolverFilter(v); setPage(1); }}>
              <SelectTrigger className="h-9 text-xs rounded-xl border-slate-200 w-40">
                <SelectValue placeholder="Solver" />
              </SelectTrigger>
              <SelectContent>
                {["all", "eigenmode", "driven", "electrostatic", "magnetostatic"].map(s => (
                  <SelectItem key={s} value={s} className="text-xs">{s === "all" ? "All Solvers" : s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={projectScope} onValueChange={v => { setProjectScope(v as "active" | "all"); setPage(1); }}>
              <SelectTrigger className="h-9 text-xs rounded-xl border-slate-200 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active" className="text-xs">Active Project</SelectItem>
                <SelectItem value="all"    className="text-xs">All Projects</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={load} className="h-9 rounded-xl text-xs gap-1.5">
              <Filter className="h-3 w-3" /> {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Apply"}
            </Button>
          </div>
        </motion.div>

        {/* List */}
        {loading && !data && (
          <div className="py-20 text-center"><Loader2 className="h-8 w-8 animate-spin text-accent mx-auto" /></div>
        )}

        {!loading && filtered.length === 0 && (
          <Card className="rounded-2xl border-dashed border-slate-200 bg-white p-16 text-center shadow-sm">
            <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Activity className="h-6 w-6 text-slate-400" />
            </div>
            <h3 className="text-sm font-black text-slate-700 mb-1">No simulations yet</h3>
            <p className="text-xs text-slate-400 mb-5">
              {!activeProject
                ? "Select a project, then design a quantum chip and run your first simulation."
                : "Design a chip in the Designer, then configure and launch your first simulation."}
            </p>
            <Link to="/simulations/new">
              <Button className="h-9 rounded-xl bg-gradient-to-r from-accent to-violet-600 text-white font-bold text-xs gap-2">
                <PlayCircle className="h-3.5 w-3.5" /> Configure First Run
              </Button>
            </Link>
          </Card>
        )}

        {filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map(sim => (
              <SimCard key={sim.id} sim={sim} onDelete={handleDelete} onRetry={handleRetry} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {data && data.total_pages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-200">
            <p className="text-xs text-slate-500">Page {data.page} of {data.total_pages} · {data.total_count} runs</p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-8 rounded-lg text-xs gap-1">
                <ChevronLeft className="h-3 w-3" /> Prev
              </Button>
              <Button size="sm" variant="outline" disabled={page >= data.total_pages} onClick={() => setPage(p => p + 1)} className="h-8 rounded-lg text-xs gap-1">
                Next <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
