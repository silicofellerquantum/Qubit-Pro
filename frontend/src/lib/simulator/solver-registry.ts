import type { LucideIcon } from "lucide-react";
import {
  Radio, Waves, Activity, Layers, Atom, Zap, Cpu,
  AlertTriangle, Link2, Shield, Sliders, BarChart3, Target,
  Briefcase, CheckCircle2, FileText,
} from "lucide-react";

export type SolverId =
  | "eigenmode"
  | "driven_modal"
  | "hfss_em"
  | "q3d"
  | "physics"
  | "epr"
  | "hamiltonian"
  | "noise"
  | "coupling"
  | "purcell";

export type SolverGroup = {
  label: string;
  items: { id: SolverId; label: string; icon: LucideIcon }[];
};

export const SOLVER_GROUPS: SolverGroup[] = [
  {
    label: "Electromagnetic",
    items: [
      { id: "eigenmode",    label: "Eigenmode",        icon: Radio },
      { id: "driven_modal", label: "Driven Modal",     icon: Waves },
      { id: "hfss_em",      label: "HFSS EM",          icon: Activity },
      { id: "q3d",          label: "Q3D Extraction",   icon: Layers },
    ],
  },
  {
    label: "Quantum",
    items: [
      { id: "physics",     label: "Physics (scqubits)", icon: Atom },
      { id: "epr",         label: "EPR Analysis",       icon: Zap },
      { id: "hamiltonian", label: "Hamiltonian",        icon: Cpu },
      { id: "noise",       label: "Noise & Decoherence", icon: AlertTriangle },
      { id: "coupling",    label: "Coupling Analysis",  icon: Link2 },
      { id: "purcell",     label: "Purcell Analysis",   icon: Shield },
    ],
  },
];

export const OPTIMIZATION_GROUP: SolverGroup = {
  label: "Optimization",
  items: [
    { id: "eigenmode" as SolverId, label: "Parameter Sweep",     icon: Sliders },
    { id: "eigenmode" as SolverId, label: "Sensitivity Analysis", icon: BarChart3 },
    { id: "eigenmode" as SolverId, label: "Optimization",        icon: Target },
  ],
};

export const JOBS_GROUP = {
  label: "Jobs & Results",
  items: [
    { id: "running",   label: "Running Jobs",   icon: Briefcase, badge: 2 },
    { id: "completed", label: "Completed Jobs", icon: CheckCircle2 },
    { id: "results",   label: "Results",        icon: BarChart3 },
    { id: "reports",   label: "Reports",        icon: FileText },
  ],
};

export const SOLVER_LABEL: Record<SolverId, string> = {
  eigenmode: "Eigenmode Analysis",
  driven_modal: "Driven Modal",
  hfss_em: "HFSS EM",
  q3d: "Q3D Extraction",
  physics: "Physics (scqubits)",
  epr: "EPR Analysis",
  hamiltonian: "Hamiltonian",
  noise: "Noise & Decoherence",
  coupling: "Coupling Analysis",
  purcell: "Purcell Analysis",
};

export type SolverTab = { id: string; label: string };

const OV: SolverTab = { id: "overview", label: "Overview" };

export const SOLVER_TABS: Record<SolverId, SolverTab[]> = {
  eigenmode:    [OV, { id: "field", label: "Field View" }, { id: "modes", label: "Mode Shapes" }, { id: "spectrum", label: "Spectrum" }, { id: "q", label: "Q Factors" }, { id: "energy", label: "Energy" }, { id: "mesh", label: "Mesh" }],
  driven_modal: [OV, { id: "s", label: "S-Parameters" }, { id: "smith", label: "Smith Chart" }, { id: "field", label: "Field View" }, { id: "z", label: "Impedance" }, { id: "delay", label: "Group Delay" }, { id: "mesh", label: "Mesh" }],
  hfss_em:      [OV, { id: "e", label: "E Field" }, { id: "h", label: "H Field" }, { id: "j", label: "Current Density" }, { id: "power", label: "Power Flow" }, { id: "loss", label: "Loss Breakdown" }, { id: "mesh", label: "Mesh" }],
  q3d:          [OV, { id: "c", label: "Capacitance Matrix" }, { id: "l", label: "Inductance Matrix" }, { id: "r", label: "Resistance Matrix" }, { id: "g", label: "Conductance Matrix" }, { id: "derived", label: "Derived Parameters" }],
  physics:      [OV, { id: "levels", label: "Energy Levels" }, { id: "wave", label: "Wavefunctions" }, { id: "charge", label: "Charge Dispersion" }, { id: "ham", label: "Hamiltonian Matrix" }, { id: "coh", label: "Coherence" }],
  epr:          [OV, { id: "part", label: "Participation Ratios" }, { id: "ham", label: "Hamiltonian Parameters" }, { id: "trans", label: "Transition Frequencies" }, { id: "coup", label: "Coupling" }, { id: "anh", label: "Anharmonicity" }],
  hamiltonian:  [OV, { id: "states", label: "Bare vs Dressed States" }, { id: "diag", label: "Energy Diagram" }, { id: "disp", label: "Dispersive Map" }, { id: "conv", label: "Convergence" }],
  noise:        [OV, { id: "psd", label: "PSD Spectrum" }, { id: "t1", label: "T₁ Budget" }, { id: "t2", label: "T₂ Budget" }, { id: "thermal", label: "Thermal" }, { id: "tls", label: "TLS Map" }],
  coupling:     [OV, { id: "map", label: "Coupling Map" }, { id: "dist", label: "Distance Dependence" }, { id: "xt", label: "Crosstalk Matrix" }, { id: "zz", label: "ZZ Suppression" }],
  purcell:      [OV, { id: "limit", label: "Purcell Limit vs Detuning" }, { id: "filter", label: "Filter Response" }, { id: "qe", label: "Q_e Sweep" }],
};
