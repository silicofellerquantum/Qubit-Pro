import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";
import {
  PlayCircle, Cpu, Zap, Magnet, Activity, ChevronLeft, ChevronRight,
  AlertTriangle, CheckCircle2, Loader2, Settings, Layers, Server, Trash2,
  Info, Sliders,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useProject } from "@/lib/project-context";
import { runSimulation, type SolverType, type RollbackPolicy } from "@/lib/api/backend";

export const Route = createFileRoute("/_app/simulations/new")({
  head: () => ({ meta: [{ title: "New Simulation — Silicofeller Quantum Studio" }] }),
  component: NewSimulationPage,
});

const SOLVERS: { id: SolverType; label: string; icon: React.ComponentType<{ className?: string }>; description: string; color: string }[] = [
  { id: "eigenmode",     label: "Eigenmode",       icon: Activity, description: "Compute resonant frequencies and field distributions", color: "from-violet-500 to-purple-600" },
  { id: "driven",        label: "Driven Modal",     icon: Zap,      description: "S-parameters and port impedances under excitation",  color: "from-blue-500 to-cyan-600"   },
  { id: "electrostatic", label: "Electrostatic",    icon: Cpu,      description: "Capacitance matrix from DC field analysis",          color: "from-amber-500 to-orange-600" },
  { id: "magnetostatic", label: "Magnetostatic",    icon: Magnet,   description: "Inductance matrix from static magnetic fields",      color: "from-emerald-500 to-teal-600" },
];

const POLICIES: { value: RollbackPolicy; label: string; description: string }[] = [
  { value: "DELETE_ON_SUCCESS", label: "Delete on Success",  description: "Keep workspace if run fails, delete if completed. Recommended for production." },
  { value: "KEEP_ALL",          label: "Keep All",           description: "Preserve entire workspace regardless of outcome. Useful for debugging." },
  { value: "DELETE_ALL",        label: "Delete All",         description: "Always clean up workspace after execution completes." },
];

function MeshQualitySlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-bold text-slate-700">Mesh Quality</Label>
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-black px-2 py-0.5 rounded-full", value <= 3 ? "bg-amber-100 text-amber-700" : value <= 6 ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700")}>
            {value <= 3 ? "Coarse / Fast" : value <= 6 ? "Balanced" : "High Fidelity"}
          </span>
          <span className="text-base font-black text-slate-900 w-5 text-center">{value}</span>
        </div>
      </div>
      <div className="relative h-2 bg-slate-100 rounded-full">
        <div className="absolute top-0 left-0 h-full rounded-full bg-gradient-to-r from-amber-400 via-blue-500 to-emerald-500 transition-all duration-150"
          style={{ width: `${((value - 1) / 9) * 100}%` }} />
        <input type="range" min={1} max={10} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-white border-2 border-accent shadow-sm pointer-events-none transition-all duration-150"
          style={{ left: `${((value - 1) / 9) * 100}%` }} />
      </div>
      <div className="flex justify-between text-[9px] text-slate-400 font-bold px-0.5">
        <span>1 – Rapid</span><span>5 – Standard</span><span>10 – FEM Max</span>
      </div>
    </div>
  );
}

function NewSimulationPage() {
  const navigate = useNavigate();
  const { activeProject } = useProject();

  const [solver,   setSolver]   = useState<SolverType>("eigenmode");
  const [meshQ,    setMeshQ]    = useState(5);
  const [np,       setNp]       = useState(4);
  const [policy,   setPolicy]   = useState<RollbackPolicy>("DELETE_ON_SUCCESS");
  const [advanced, setAdvanced] = useState(false);
  const [loading,  setLoading]  = useState(false);

  // Design validation check
  const design = activeProject?.design_payload;
  const placement = (design as Record<string, unknown> | undefined)?.placement as Record<string, unknown> | undefined;
  const freqPlan  = (design as Record<string, unknown> | undefined)?.frequency_plan as Record<string, unknown> | undefined;
  const schematicDesign = (design as Record<string, unknown> | undefined)?.design as Record<string, unknown> | undefined;
  const hasComponents = Boolean(
    (placement?.qubits as unknown[])?.length ||
    (freqPlan?.qubit_frequencies_GHz as Record<string, unknown> | undefined && Object.keys(freqPlan?.qubit_frequencies_GHz as Record<string, unknown>).length > 0) ||
    (schematicDesign?.placements as unknown[])?.length
  );
  const canRun = activeProject && hasComponents;

  const handleRun = async () => {
    if (!activeProject) { toast.error("No active project selected"); return; }
    if (!hasComponents) { toast.error("Cannot run simulation on an empty design"); return; }
    setLoading(true);
    try {
      const sim = await runSimulation({
        project_id:      activeProject.id,
        solver_type:     solver,
        coarse_mesh:     meshQ <= 3,
        rollback_policy: policy,
        user_settings: { np, mesh_quality: meshQ },
      });
      toast.success("Simulation queued!", { description: `ID: ${sim.id.slice(0, 8)}…` });
      navigate({ to: "/simulations/$id", params: { id: sim.id } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Failed to start simulation", { description: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-[#F8F9FB]">
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <Link to="/simulations"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-accent font-semibold mb-4 transition-colors">
            <ChevronLeft className="h-3 w-3" /> Back to Simulations
          </Link>
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-accent to-violet-600 flex items-center justify-center shadow-lg shadow-accent/20">
              <PlayCircle className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900">Configure Simulation</h1>
              <p className="text-sm text-slate-500 mt-0.5">Set up and launch a Palace electromagnetic FEM solver</p>
            </div>
          </div>
        </motion.div>

        {/* Project context banner */}
        {activeProject ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}>
            <Card className={cn("rounded-2xl border p-4 mb-6 shadow-sm",
              hasComponents ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60")}>
              <div className="flex items-center gap-3">
                {hasComponents
                  ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  : <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-slate-800">
                    {hasComponents ? "Design Ready" : "Empty Design"}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {hasComponents
                      ? `Project: ${activeProject.name} · ${activeProject.num_qubits}Q ${activeProject.topology}`
                      : "No components found. Open the Designer to add qubits before running."}
                  </p>
                </div>
                {!hasComponents && (
                  <Link to="/designer">
                    <Button size="sm" variant="outline" className="rounded-xl text-xs font-bold h-8 border-amber-300 text-amber-700 hover:bg-amber-100 shrink-0">
                      Open Designer <ChevronRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                )}
              </div>
            </Card>
          </motion.div>
        ) : (
          <Card className="rounded-2xl border border-slate-200 bg-white p-4 mb-6 shadow-sm">
            <div className="flex items-center gap-3 text-slate-500">
              <Info className="h-4 w-4 shrink-0" />
              <p className="text-xs font-medium">Select a project from the Projects page to enable simulation.</p>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left column: Solver selection + advanced */}
          <div className="lg:col-span-3 space-y-5">
            {/* Solver picker */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
              <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-black text-slate-900 mb-4 flex items-center gap-2">
                  <Cpu className="h-3.5 w-3.5 text-accent" /> Solver Type
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {SOLVERS.map(s => {
                    const Icon = s.icon;
                    const active = solver === s.id;
                    return (
                      <button key={s.id} onClick={() => setSolver(s.id)}
                        className={cn("relative overflow-hidden rounded-xl border-2 p-3.5 text-left transition-all duration-150 cursor-pointer",
                          active ? "border-accent bg-gradient-to-br from-accent/10 to-violet-500/5 shadow-sm" : "border-slate-100 bg-white hover:border-accent/30 hover:bg-slate-50")}>
                        <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center mb-2 bg-gradient-to-br text-white shadow-sm", active ? s.color : "from-slate-200 to-slate-300")}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <p className="text-xs font-black text-slate-900">{s.label}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{s.description}</p>
                        {active && <div className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-accent animate-pulse" />}
                      </button>
                    );
                  })}
                </div>
              </Card>
            </motion.div>

            {/* Mesh quality */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
              <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-black text-slate-900 mb-4 flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-accent" /> Mesh Quality
                </p>
                <MeshQualitySlider value={meshQ} onChange={setMeshQ} />
                {meshQ <= 3 && (
                  <p className="text-[10px] text-amber-600 font-semibold mt-3 flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3" /> Coarse mesh enabled — faster solve but reduced field accuracy
                  </p>
                )}
              </Card>
            </motion.div>

            {/* Advanced options toggle */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}>
              <button onClick={() => setAdvanced(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-dashed border-slate-200 text-xs font-bold text-slate-500 hover:border-accent/40 hover:text-accent hover:bg-accent/5 transition-all cursor-pointer">
                <div className="flex items-center gap-2"><Sliders className="h-3.5 w-3.5" /> Advanced Options</div>
                <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", advanced && "rotate-90")} />
              </button>
              {advanced && (
                <Card className="mt-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold text-slate-700">MPI Processes (np)</Label>
                    <Input type="number" min={1} max={32} value={np}
                      onChange={e => setNp(Math.max(1, Math.min(32, Number(e.target.value))))}
                      className="h-9 text-xs font-mono rounded-xl border-slate-200" />
                    <p className="text-[10px] text-slate-400">Parallel solver processes. Max 32 on this cluster.</p>
                  </div>
                </Card>
              )}
            </motion.div>
          </div>

          {/* Right column: Cleanup policy + run */}
          <div className="lg:col-span-2 space-y-5">
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-black text-slate-900 mb-4 flex items-center gap-2">
                  <Trash2 className="h-3.5 w-3.5 text-accent" /> Cleanup Policy
                </p>
                <div className="space-y-2">
                  {POLICIES.map(p => (
                    <button key={p.value} onClick={() => setPolicy(p.value)}
                      className={cn("w-full text-left rounded-xl border-2 p-3 transition-all duration-150 cursor-pointer",
                        policy === p.value ? "border-accent bg-accent/5" : "border-slate-100 hover:border-slate-200 hover:bg-slate-50")}>
                      <p className="text-xs font-bold text-slate-800">{p.label}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{p.description}</p>
                    </button>
                  ))}
                </div>
              </Card>
            </motion.div>

            {/* Summary + launch */}
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
              <Card className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-black text-slate-900 mb-3 flex items-center gap-2">
                  <Settings className="h-3.5 w-3.5 text-accent" /> Summary
                </p>
                <div className="space-y-2 mb-5">
                  {[
                    { label: "Solver",      value: SOLVERS.find(s => s.id === solver)?.label },
                    { label: "Mesh",        value: `Quality ${meshQ} · ${meshQ <= 3 ? "Coarse" : meshQ <= 6 ? "Standard" : "High Fidelity"}` },
                    { label: "Processes",   value: `${np} MPI processes` },
                    { label: "Workspace",   value: POLICIES.find(p => p.value === policy)?.label },
                    { label: "Project",     value: activeProject?.name ?? "—" },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-semibold">{row.label}</span>
                      <span className="text-slate-800 font-bold text-right">{row.value}</span>
                    </div>
                  ))}
                </div>
                <Button onClick={handleRun} disabled={!canRun || loading}
                  className="w-full h-11 rounded-xl bg-gradient-to-r from-accent to-violet-600 hover:from-accent/90 hover:to-violet-700 text-white font-black text-sm shadow-lg shadow-accent/25 flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]">
                  {loading
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Launching…</>
                    : <><PlayCircle className="h-4 w-4" /> Run Simulation</>}
                </Button>
                {!canRun && !loading && (
                  <p className="text-[10px] text-slate-400 text-center mt-2">
                    {!activeProject ? "Select a project first" : "Add design components to enable"}
                  </p>
                )}
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
