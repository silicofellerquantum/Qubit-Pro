import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronLeft, RefreshCw, Square, RotateCw, Trash2, Download,
  CheckCircle2, AlertTriangle, Clock, Loader2, FileText,
  BarChart3, Terminal, FolderOpen, Activity, Eye, Rotate3d
} from "lucide-react";
import { VisualizationViewer } from "@/components/visualization/VisualizationViewer";
import VisualizationTab from "@/components/VisualizationTab";
import MeshVisualization from "@/components/MeshVisualization";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  fetchSimulationDetails, fetchSimulationStatus, fetchSimulationResults,
  getSimulationLogs, getSimulationMetrics, listSimulationArtifacts,
  cancelSimulation, retrySimulation, deleteSimulation,
  type Simulation, type SimulationStatusResponse, type SimulationLog,
  type SimulationArtifact, type SimulationMetrics,
} from "@/lib/api/backend";

export const Route = createFileRoute("/_app/simulations/$id")({
  head: () => ({ meta: [{ title: "Simulation — Silicofeller Quantum Studio" }] }),
  component: SimulationHubPage,
});

const ACTIVE_STATUSES = new Set(["queued", "running"]);
const POLL_INTERVAL_MS = 2500;

function statusColor(s: string) {
  return s === "completed" ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : s === "running" ? "bg-violet-100 text-violet-700 border-violet-200"
      : s === "queued" ? "bg-sky-100 text-sky-700 border-sky-200"
        : s === "failed" ? "bg-rose-100 text-rose-700 border-rose-200"
          : "bg-slate-100 text-slate-600 border-slate-200";
}

function StatusDot({ status }: { status: string }) {
  return (
    <span className={cn("h-2 w-2 rounded-full shrink-0",
      status === "completed" ? "bg-emerald-500"
        : status === "running" ? "bg-violet-500 animate-pulse"
          : status === "queued" ? "bg-sky-500 animate-pulse"
            : status === "failed" ? "bg-rose-500"
              : "bg-slate-400")} />
  );
}

function fmtDuration(sec: number) {
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

const PHASE_STEPS = [
  { key: "REQUEST_RECEIVED", label: "Queued" },
  { key: "WORKSPACE_READY", label: "Workspace" },
  { key: "GEOMETRY_READY", label: "Geometry" },
  { key: "MESH_READY", label: "Mesh" },
  { key: "CONFIG_READY", label: "Config" },
  { key: "RUNNING", label: "Solving" },
  { key: "RESULTS_READY", label: "Results" },
  { key: "COMPLETED", label: "Done" },
];

function PhaseSteps({ phase }: { phase: string | null | undefined }) {
  const idx = PHASE_STEPS.findIndex(p => p.key === phase);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {PHASE_STEPS.map((step, i) => (
        <div key={step.key} className="flex items-center gap-1">
          <div className={cn("h-6 px-2 rounded-full text-[10px] font-bold flex items-center transition-all",
            i < idx ? "bg-emerald-100 text-emerald-700"
              : i === idx ? "bg-violet-100 text-violet-700 ring-1 ring-violet-400"
                : "bg-slate-100 text-slate-400")}>
            {step.label}
          </div>
          {i < PHASE_STEPS.length - 1 && <div className={cn("h-px w-3 shrink-0", i < idx ? "bg-emerald-300" : "bg-slate-200")} />}
        </div>
      ))}
    </div>
  );
}

function LiveProgressTab({ simId, liveStatus }: { simId: string; liveStatus: SimulationStatusResponse | null }) {
  if (!liveStatus) return <div className="py-20 text-center text-slate-400 text-sm">Loading status…</div>;
  const pct = Math.round(liveStatus.progress);
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm font-bold">
          <span className="text-slate-700">{liveStatus.current_phase ?? liveStatus.status}</span>
          <span className="text-slate-900">{pct}%</span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-accent"
            animate={{ width: `${pct}%` }} transition={{ duration: 0.5, ease: "easeOut" }} />
        </div>
      </div>
      <PhaseSteps phase={liveStatus.current_phase} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Status", value: liveStatus.status.charAt(0).toUpperCase() + liveStatus.status.slice(1) },
          { label: "Runtime", value: fmtDuration(liveStatus.runtime) },
          { label: "Progress", value: `${pct}%` },
        ].map(k => (
          <Card key={k.label} className="rounded-xl border-slate-200 p-3 shadow-sm">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">{k.label}</p>
            <p className="text-sm font-black text-slate-900">{k.value}</p>
          </Card>
        ))}
      </div>
      {liveStatus.warnings.length > 0 && (
        <Card className="rounded-xl border-amber-200 bg-amber-50/60 p-4">
          <p className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5" /> Warnings ({liveStatus.warnings.length})</p>
          <ul className="space-y-1">{liveStatus.warnings.map((w, i) => <li key={i} className="text-[11px] text-amber-700">• {w}</li>)}</ul>
        </Card>
      )}
      {liveStatus.errors.length > 0 && (
        <Card className="rounded-xl border-rose-200 bg-rose-50/60 p-4">
          <p className="text-xs font-bold text-rose-800 mb-2 flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5" /> Errors ({liveStatus.errors.length})</p>
          <ul className="space-y-1">{liveStatus.errors.map((e, i) => <li key={i} className="text-[11px] text-rose-700">• {e}</li>)}</ul>
        </Card>
      )}
    </div>
  );
}

import { Cpu, Hash, Layers, TrendingUp } from "lucide-react";

function ResultsTab({ simId, status }: { simId: string; status: string }) {
  const [results, setResults] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (status !== "completed") return;
    setLoading(true);
    fetchSimulationResults(simId)
      .then(setResults)
      .catch(() => setResults(null))
      .finally(() => setLoading(false));
  }, [simId, status]);

  if (status !== "completed") {
    return (
      <div className="py-20 text-center space-y-2">
        <Clock className="h-8 w-8 text-slate-300 mx-auto animate-pulse" />
        <p className="text-sm font-bold text-slate-500">Results available after completion</p>
        <p className="text-xs text-slate-400">The solver is currently processing your geometry.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="py-20 text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-accent mx-auto" />
        <p className="text-xs text-slate-400">Loading and parsing simulation results…</p>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="py-20 text-center space-y-2 text-slate-400">
        <AlertTriangle className="h-8 w-8 mx-auto text-amber-500/80" />
        <p className="text-sm font-semibold">No results available</p>
        <p className="text-xs">Verify that the solver execution completed without errors.</p>
      </div>
    );
  }

  const solverType = results.solver_type || "eigenmode";

  // 1. Render Eigenmode Solver Results
  if (solverType === "eigenmode" && results.eigenmode?.modes) {
    const modes = results.eigenmode.modes;
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3 bg-violet-50/50 border border-violet-100 rounded-xl p-4">
          <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-600 shrink-0">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-violet-800 uppercase tracking-wide">Eigenmode Solver Results</h4>
            <p className="text-[11px] text-violet-600/80 mt-0.5">
              Extracted {modes.length} resonant modes and Quality Factors from the electromagnetic field solver.
            </p>
          </div>
        </div>

        <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 w-16 text-center">Mode</th>
                  <th className="py-3 px-4">Frequency (GHz)</th>
                  <th className="py-3 px-4">Quality Factor (Q)</th>
                  <th className="py-3 px-4">Energy Participation Ratio (EPR)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {modes.map((mode: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors text-xs text-slate-700">
                    <td className="py-3.5 px-4 text-center font-bold text-slate-500 bg-slate-50/30 w-16">
                      #{mode.mode_index}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                      {typeof mode.frequency_ghz === "number"
                        ? mode.frequency_ghz >= 1e9
                          ? (mode.frequency_ghz / 1e9).toFixed(6) + " GHz (scaled)"
                          : mode.frequency_ghz.toFixed(6)
                        : String(mode.frequency_ghz)}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {typeof mode.quality_factor === "number"
                        ? mode.quality_factor.toLocaleString(undefined, { maximumFractionDigits: 4 })
                        : String(mode.quality_factor)}
                    </td>
                    <td className="py-3.5 px-4">
                      {mode.epr && Object.keys(mode.epr).length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 max-w-lg">
                          {Object.entries(mode.epr).map(([junction, ratio]: [string, any]) => (
                            <Badge
                              key={junction}
                              variant="outline"
                              className="text-[10px] font-mono px-2 py-0.5 bg-slate-50/60 border-slate-200 text-slate-600 hover:bg-slate-100"
                            >
                              <span className="font-bold text-slate-700 mr-1">{junction}:</span>
                              {typeof ratio === "number" ? ratio.toExponential(4) : String(ratio)}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic text-[11px]">No EPR data</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // 2. Render Matrix Results (Electrostatic or Magnetostatic)
  const matrixData = results.electrostatic || results.magnetostatic;
  if (matrixData && Array.isArray(matrixData.matrix)) {
    const isElectrostatic = solverType === "electrostatic";
    const title = isElectrostatic ? "Electrostatic Capacitance Matrix" : "Magnetostatic Inductance Matrix";
    const desc = isElectrostatic
      ? `Maxwell capacitance matrix in ${matrixData.units || "fF"} used for extracting transmon shunting and coupling energies.`
      : `Inductance matrix in ${matrixData.units || "nH"} describing loop self-inductance and mutual coupling.`;
    const themeColor = isElectrostatic ? "amber" : "emerald";
    const Icon = isElectrostatic ? Cpu : Layers;

    const terminalIds = matrixData.terminal_ids || [];
    const matrix = matrixData.matrix;

    return (
      <div className="p-6 space-y-6">
        <div className={cn(
          "flex items-center gap-3 border rounded-xl p-4",
          isElectrostatic ? "bg-amber-50/50 border-amber-100" : "bg-emerald-50/50 border-emerald-100"
        )}>
          <div className={cn(
            "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
            isElectrostatic ? "bg-amber-500/10 text-amber-600" : "bg-emerald-500/10 text-emerald-600"
          )}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h4 className={cn(
              "text-xs font-bold uppercase tracking-wide",
              isElectrostatic ? "text-amber-800" : "text-emerald-800"
            )}>{title}</h4>
            <p className={cn(
              "text-[11px] mt-0.5",
              isElectrostatic ? "text-amber-600/80" : "text-emerald-600/80"
            )}>{desc}</p>
          </div>
        </div>

        <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed min-w-[500px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4 w-32 font-semibold">Terminal</th>
                  {terminalIds.map((name: string) => (
                    <th key={name} className="py-3 px-4 text-right truncate" title={name}>
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {matrix.map((row: number[], rIdx: number) => (
                  <tr key={rIdx} className="hover:bg-slate-50/30 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-600 bg-slate-50/30 truncate w-32" title={terminalIds[rIdx]}>
                      {terminalIds[rIdx] || `T_${rIdx + 1}`}
                    </td>
                    {row.map((val: number, cIdx: number) => {
                      const isDiagonal = rIdx === cIdx;
                      return (
                        <td
                          key={cIdx}
                          className={cn(
                            "py-3.5 px-4 text-right font-mono border-l border-slate-100/50",
                            isDiagonal
                              ? isElectrostatic
                                ? "bg-amber-50/40 font-bold text-amber-700"
                                : "bg-emerald-50/40 font-bold text-emerald-700"
                              : "text-slate-700 hover:bg-slate-50/60"
                          )}
                          title={`${terminalIds[rIdx]} ↔ ${terminalIds[cIdx]}: ${val.toFixed(6)} ${matrixData.units}`}
                        >
                          {val.toFixed(4)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // 3. Fallback generic renderer for other shapes
  const renderValue = (v: unknown): React.ReactNode => {
    if (Array.isArray(v)) {
      return (
        <span className="text-[11px] text-slate-500 font-mono">
          [{v.map((x, i) => <span key={i}>{typeof x === "number" ? x.toFixed(4) : String(x)}{i < v.length - 1 ? ", " : ""}</span>)}]
        </span>
      );
    }
    if (typeof v === "object" && v !== null) {
      return (
        <pre className="text-[10px] font-mono bg-slate-50 p-2 rounded-lg border border-slate-100 max-h-40 overflow-y-auto text-slate-600 leading-normal">
          {JSON.stringify(v, null, 2)}
        </pre>
      );
    }
    if (typeof v === "number") {
      return <span className="font-mono text-slate-900">{v.toFixed(6)}</span>;
    }
    return <span>{String(v)}</span>;
  };

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-1 gap-3">
        {Object.entries(results).map(([k, v]) => {
          if (k === "solver_type") return null;
          return (
            <Card key={k} className="rounded-xl border-slate-200 p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                <Hash className="h-3 w-3" /> {k.replace(/_/g, " ")}
              </p>
              <div className="text-xs font-semibold text-slate-800">{renderValue(v)}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function LogsTab({ simId }: { simId: string }) {
  const [logs, setLogs] = useState<SimulationLog[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    getSimulationLogs(simId).then(setLogs).catch(() => setLogs([])).finally(() => setLoading(false));
  }, [simId]);

  useEffect(() => { bottomRef.current?.scrollIntoView(); }, [logs]);

  const filtered = filter ? logs.filter(l => l.log_type.toLowerCase().includes(filter.toLowerCase()) || l.content.toLowerCase().includes(filter.toLowerCase())) : logs;

  const downloadLogs = () => {
    const text = logs.map(l => `[${l.created_at}][${l.log_type}] ${l.content}`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = `simulation_${simId}_logs.txt`;
    a.click();
    toast.success("Logs downloaded");
  };

  return (
    <div className="p-6 space-y-3">
      <div className="flex items-center gap-2">
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter logs…"
          className="flex-1 h-8 rounded-lg border border-slate-200 text-xs px-3 focus:outline-none focus:ring-1 focus:ring-accent/40" />
        <Button size="sm" variant="outline" onClick={downloadLogs} className="h-8 rounded-lg text-xs gap-1.5">
          <Download className="h-3 w-3" /> Download
        </Button>
      </div>
      <div className="bg-slate-950 rounded-xl p-4 h-[400px] overflow-y-auto font-mono text-[11px] space-y-0.5">
        {loading && <div className="text-slate-500">Loading logs…</div>}
        {!loading && filtered.length === 0 && <div className="text-slate-500">No logs found</div>}
        {filtered.map(l => (
          <div key={l.id} className="flex gap-2">
            <span className="text-slate-600 shrink-0">{new Date(l.created_at).toLocaleTimeString()}</span>
            <span className={cn("shrink-0 text-[10px] px-1 rounded font-bold",
              l.log_type === "orchestrator" ? "text-violet-400" : l.log_type === "runner" ? "text-cyan-400" : "text-slate-500")}>
              [{l.log_type}]
            </span>
            <span className="text-slate-300 break-all">{l.content}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function MetricsTab({ simId }: { simId: string }) {
  const [metrics, setMetrics] = useState<SimulationMetrics | null>(null);
  useEffect(() => { getSimulationMetrics(simId).then(setMetrics).catch(() => { }); }, [simId]);
  if (!metrics) return <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin text-accent mx-auto" /></div>;
  return (
    <div className="p-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Object.entries(metrics.metrics).map(([k, v]) => (
          <Card key={k} className="rounded-xl border-slate-200 p-4 shadow-sm">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">{k.replace(/_/g, " ")}</p>
            <p className="text-lg font-black text-slate-900">{typeof v === "number" && v > 60 ? fmtDuration(v) : typeof v === "number" ? v.toFixed(2) : String(v)}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

function ArtifactsTab({ simId }: { simId: string }) {
  const [artifacts, setArtifacts] = useState<SimulationArtifact[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setLoading(true);
    listSimulationArtifacts(simId).then(setArtifacts).catch(() => setArtifacts([])).finally(() => setLoading(false));
  }, [simId]);

  const token = typeof window !== "undefined" ? localStorage.getItem("qs_token") : null;
  const downloadUrl = (a: SimulationArtifact) =>
    `/api/simulations/${simId}/artifacts/${a.id}${token ? `?token=${token}` : ""}`;

  const typeColor = (t: string) =>
    t === "mesh" ? "bg-blue-100 text-blue-700" :
      t === "log" ? "bg-slate-100 text-slate-600" :
        t === "result" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700";

  if (loading) return <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin text-accent mx-auto" /></div>;
  if (!artifacts.length) return (
    <div className="py-20 text-center space-y-2">
      <FolderOpen className="h-8 w-8 text-slate-300 mx-auto" />
      <p className="text-sm font-bold text-slate-500">No artifacts generated yet</p>
    </div>
  );

  return (
    <div className="p-6">
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-xs">
          <thead><tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[10px]">
            <th className="px-4 py-2.5 text-left">File</th>
            <th className="px-4 py-2.5 text-left">Type</th>
            <th className="px-4 py-2.5 text-left">Size</th>
            <th className="px-4 py-2.5 text-left">Created</th>
            <th className="px-4 py-2.5" />
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {artifacts.map(a => (
              <tr key={a.id} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-mono font-semibold text-slate-800 flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />{a.file_name}
                </td>
                <td className="px-4 py-2.5"><span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold", typeColor(a.artifact_type))}>{a.artifact_type}</span></td>
                <td className="px-4 py-2.5 text-slate-500">{fmtBytes(a.size)}</td>
                <td className="px-4 py-2.5 text-slate-500">{new Date(a.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-2.5 text-right">
                  <a href={downloadUrl(a)} download={a.file_name} onClick={() => toast.success(`Downloading ${a.file_name}`)}>
                    <Button size="sm" variant="outline" className="h-7 rounded-lg text-[10px] gap-1 font-bold">
                      <Download className="h-3 w-3" /> Download
                    </Button>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SimulationHubPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [sim, setSim] = useState<Simulation | null>(null);
  const [liveStatus, setLiveStatus] = useState<SimulationStatusResponse | null>(null);
  const [activeTab, setActiveTab] = useState("progress");
  const [deleting, setDeleting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSim = useCallback(async () => {
    try {
      const s = await fetchSimulationDetails(id);
      setSim(s);
      if (s.status === "completed" && activeTab === "progress") setActiveTab("results");
      return s;
    } catch { return null; }
  }, [id]);

  const loadStatus = useCallback(async () => {
    try { const s = await fetchSimulationStatus(id); setLiveStatus(s); return s; } catch { return null; }
  }, [id]);

  useEffect(() => {
    loadSim();
    loadStatus();
  }, [id]);

  useEffect(() => {
    const currentStatus = sim?.status ?? "queued";
    if (ACTIVE_STATUSES.has(currentStatus)) {
      pollRef.current = setInterval(async () => {
        const s = await loadStatus();
        if (s) {
          if (sim && s.status !== sim.status) {
            await loadSim();
          }
          if (!ACTIVE_STATUSES.has(s.status)) {
            if (pollRef.current) clearInterval(pollRef.current);
            await loadSim();
            toast.success("Simulation completed!", { description: `Run ${id.slice(0, 8)} finished` });
          }
        }
      }, POLL_INTERVAL_MS);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [sim?.status, id, loadStatus, loadSim]);

  const handleCancel = async () => {
    try {
      await cancelSimulation(id);
      toast.success("Cancellation requested");
      await loadSim(); await loadStatus();
    } catch (e) { toast.error("Cancel failed", { description: String(e) }); }
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const newSim = await retrySimulation(id);
      toast.success("Retry queued!");
      navigate({ to: "/simulations/$id", params: { id: newSim.id } });
    } catch (e) { toast.error("Retry failed", { description: String(e) }); }
    finally { setRetrying(false); }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this simulation and all its artifacts? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await deleteSimulation(id);
      toast.success("Simulation deleted");
      navigate({ to: "/simulations" });
    } catch (e) { toast.error("Delete failed", { description: String(e) }); setDeleting(false); }
  };

  const isActive = ACTIVE_STATUSES.has(sim?.status ?? "");

  const TABS = [
    { id: "progress", label: "Live Progress", icon: Activity },
    { id: "results", label: "Results", icon: BarChart3 },
    { id: "logs", label: "Logs", icon: Terminal },
    { id: "metrics", label: "Metrics", icon: Clock },
    { id: "artifacts", label: "Artifacts", icon: FolderOpen },
    { 
      id: "visualization", 
      label: sim?.solver === "eigenmode" ? "3D E-Field" : "Visualization", 
      icon: Eye 
    },
  ];

  TABS.push({ id: "volume_mesh", label: "3D Volume Mesh", icon: Rotate3d });

  return (
    <div className="h-full overflow-y-auto bg-[#F8F9FB]">
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <Link to="/simulations" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-accent font-semibold mb-4 transition-colors">
            <ChevronLeft className="h-3 w-3" /> Simulations
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center shadow">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h1 className="text-xl font-black text-slate-900">Simulation Run</h1>
                  {sim && (
                    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border", statusColor(sim.status))}>
                      <StatusDot status={sim.status} />
                      {sim.status.charAt(0).toUpperCase() + sim.status.slice(1)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-mono">{id}</p>
                {sim && <p className="text-xs text-slate-400 mt-0.5">Solver: <span className="font-bold text-slate-600">{sim.solver}</span></p>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => { loadSim(); loadStatus(); }} className="h-8 rounded-lg text-xs gap-1.5">
                <RefreshCw className="h-3 w-3" /> Refresh
              </Button>
              {isActive && (
                <Button size="sm" onClick={handleCancel} className="h-8 rounded-lg text-xs gap-1.5 bg-rose-600 hover:bg-rose-700 text-white">
                  <Square className="h-3 w-3" /> Cancel
                </Button>
              )}
              {!isActive && (
                <Button size="sm" variant="outline" onClick={handleRetry} disabled={retrying} className="h-8 rounded-lg text-xs gap-1.5">
                  {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw className="h-3 w-3" />} Retry
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={handleDelete} disabled={deleting} className="h-8 rounded-lg text-xs gap-1.5 text-rose-600 hover:bg-rose-50 border-rose-200">
                {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Quick stats */}
        {sim && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Solver", value: sim.solver },
              { label: "Created", value: new Date(sim.created_at).toLocaleString() },
              { label: "Runtime", value: sim.runtime_seconds ? fmtDuration(sim.runtime_seconds) : "—" },
              { label: "Memory", value: sim.memory_gb ? `${sim.memory_gb.toFixed(1)} GB` : "—" },
            ].map(k => (
              <Card key={k.label} className="rounded-xl border-slate-200 p-3 shadow-sm">
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">{k.label}</p>
                <p className="text-xs font-black text-slate-800 truncate">{k.value}</p>
              </Card>
            ))}
          </div>
        )}

        {/* Error banner */}
        {sim?.error_message && (
          <Card className="rounded-xl border-rose-200 bg-rose-50/60 p-4 mb-5 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-rose-800">Simulation Error</p>
              <p className="text-[11px] text-rose-700 mt-0.5">{sim.error_message}</p>
            </div>
          </Card>
        )}

        {/* Tab hub */}
        <Card className="rounded-2xl border-slate-200 shadow-sm overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="border-b border-slate-200 px-4 bg-white">
              <TabsList className="h-11 bg-transparent p-0 gap-0">
                {TABS.map(t => {
                  const Icon = t.icon;
                  return (
                    <TabsTrigger key={t.id} value={t.id}
                      className="h-11 px-4 text-xs font-semibold text-slate-500 data-[state=active]:text-accent data-[state=active]:font-bold data-[state=active]:bg-transparent data-[state=active]:shadow-none rounded-none border-b-2 border-transparent data-[state=active]:border-accent gap-1.5">
                      <Icon className="h-3.5 w-3.5" />{t.label}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>
            <div className="bg-white min-h-[400px]">
              <TabsContent value="progress" className="mt-0"><LiveProgressTab simId={id} liveStatus={liveStatus} /></TabsContent>
              <TabsContent value="results" className="mt-0"><ResultsTab simId={id} status={sim?.status ?? ""} /></TabsContent>
              <TabsContent value="logs" className="mt-0"><LogsTab simId={id} /></TabsContent>
              <TabsContent value="metrics" className="mt-0"><MetricsTab simId={id} /></TabsContent>
              <TabsContent value="artifacts" className="mt-0"><ArtifactsTab simId={id} /></TabsContent>
              <TabsContent value="visualization" className="mt-0 p-0" style={{ height: 600 }}>
                {sim?.status === "completed"
                  ? (sim?.solver === "eigenmode"
                      ? <VisualizationTab simId={id} />
                      : <VisualizationViewer simId={id} />)
                  : <div className="py-20 text-center space-y-2">
                    <Eye className="h-8 w-8 text-slate-300 mx-auto" />
                    <p className="text-sm font-bold text-slate-500">Visualization available after simulation completes</p>
                  </div>
                }
              </TabsContent>
              <TabsContent value="volume_mesh" className="mt-0 p-0">
                {sim?.status === "completed"
                  ? <MeshVisualization simId={id} />
                  : <div className="py-20 text-center space-y-2">
                    <Rotate3d className="h-8 w-8 text-slate-300 mx-auto" />
                    <p className="text-sm font-bold text-slate-500">Volume mesh available after simulation completes</p>
                  </div>
                }
              </TabsContent>
            </div>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
