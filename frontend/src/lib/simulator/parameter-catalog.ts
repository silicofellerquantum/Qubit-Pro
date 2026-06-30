/**
 * Silicofeller Quantum Parameter Reference — 192 params across 10 sections.
 * Sourced from Silicofeller_Quantum_Parameter_Reference.docx (v1.0, 2025).
 *
 * NOTE: Marked (derived) where values are computed by `derive-parameters.ts`
 * from real backend seed fields rather than a real FEM solver. Swap to a real
 * Palace/HFSS backend by replacing the deriver — this catalog stays.
 */

export type SimSection =
  | "geometry"
  | "materials"
  | "q3d"
  | "hfss"
  | "eigenmode"
  | "epr"
  | "coherence"
  | "noise"
  | "coupling"
  | "validation";

export type ParamDef = {
  id: string;
  symbol: string;
  section: SimSection;
  subgroup?: string;
  formula: string;
  unit: string;
  typicalRange: string;
  idealTarget: string;
  description: string;
};

export const SECTION_LABELS: Record<SimSection, string> = {
  geometry: "Geometry",
  materials: "Materials",
  q3d: "Q3D / RLGC",
  hfss: "HFSS Full-Wave",
  eigenmode: "Eigenmode",
  epr: "EPR Analysis",
  coherence: "Coherence",
  noise: "Noise",
  coupling: "Coupling",
  validation: "Validation",
};

// Compact catalog — representative parameters per section, drawn from the
// reference doc. Used to render Parameters tables, tooltips, design-rule
// chips, and the right-rail Setup/Advanced forms.
export const PARAM_CATALOG: ParamDef[] = [
  // ---------- Geometry (sample) ----------
  { id: "chip_length", symbol: "L_chip", section: "geometry", formula: "design", unit: "mm", typicalRange: "5–20", idealTarget: "10", description: "Chip die length." },
  { id: "chip_width", symbol: "W_chip", section: "geometry", formula: "design", unit: "mm", typicalRange: "5–20", idealTarget: "10", description: "Chip die width." },
  { id: "qubit_count", symbol: "N_q", section: "geometry", formula: "count", unit: "#", typicalRange: "1–433", idealTarget: "≥127", description: "Number of qubits on chip." },
  { id: "qubit_pad_area", symbol: "A_pad", section: "geometry", formula: "W×H", unit: "µm²", typicalRange: "2500–90000", idealTarget: "~22500", description: "Qubit shunt pad area." },
  { id: "junction_area", symbol: "A_J", section: "geometry", formula: "W_J×H_J", unit: "nm²", typicalRange: "1e4–1e5", idealTarget: "~30000", description: "Josephson junction area." },
  { id: "resonator_length", symbol: "L_res", section: "geometry", formula: "λ/4 or λ/2", unit: "mm", typicalRange: "3–10", idealTarget: "5", description: "Readout resonator length." },
  { id: "cpw_center_width", symbol: "W_cpw", section: "geometry", formula: "design", unit: "µm", typicalRange: "5–20", idealTarget: "10", description: "CPW center conductor width." },
  { id: "cpw_gap", symbol: "G_cpw", section: "geometry", formula: "design", unit: "µm", typicalRange: "5–20", idealTarget: "6", description: "CPW gap to ground." },
  { id: "metal_thickness", symbol: "t_m", section: "geometry", formula: "design", unit: "nm", typicalRange: "50–300", idealTarget: "150", description: "Superconducting metal thickness." },
  { id: "substrate_thickness", symbol: "t_sub", section: "geometry", formula: "design", unit: "µm", typicalRange: "275–500", idealTarget: "430", description: "Wafer substrate thickness." },
  { id: "qubit_to_qubit_distance", symbol: "d_qq", section: "geometry", formula: "layout", unit: "µm", typicalRange: "400–1500", idealTarget: "800", description: "Center-to-center qubit pitch." },

  // ---------- Materials ----------
  { id: "substrate_material", symbol: "—", section: "materials", formula: "—", unit: "—", typicalRange: "Si/Sapphire/SiO₂", idealTarget: "High-R Si or Sapphire", description: "Substrate dielectric." },
  { id: "metal_material", symbol: "—", section: "materials", formula: "—", unit: "—", typicalRange: "Nb/Al/TiN/NbTiN", idealTarget: "Nb or Al", description: "Superconducting metal." },
  { id: "dielectric_constant", symbol: "εᵣ", section: "materials", formula: "ε/ε₀", unit: "—", typicalRange: "3.8–11.9", idealTarget: "11.7 (Si)", description: "Relative permittivity of substrate." },
  { id: "loss_tangent", symbol: "tan δ", section: "materials", formula: "ε″/ε′", unit: "—", typicalRange: "1e-7–1e-4", idealTarget: "<1e-6", description: "Bulk dielectric loss tangent." },
  { id: "substrate_resistivity", symbol: "ρ_sub", section: "materials", formula: "—", unit: "kΩ·cm", typicalRange: ">1", idealTarget: ">10", description: "Substrate resistivity (high-resistivity Si)." },

  // ---------- Q3D ----------
  { id: "C_sigma", symbol: "C_Σ", section: "q3d", subgroup: "Capacitance", formula: "Σ C_ii", unit: "fF", typicalRange: "50–150", idealTarget: "80–100", description: "Total shunt capacitance — drives E_C." },
  { id: "C_qq", symbol: "C_qq", section: "q3d", subgroup: "Capacitance", formula: "—", unit: "fF", typicalRange: "0.5–10", idealTarget: "1–5", description: "Direct qubit-qubit coupling capacitance." },
  { id: "L_J", symbol: "L_J", section: "q3d", subgroup: "Inductance", formula: "Φ₀/2π·I_c", unit: "nH", typicalRange: "1–20", idealTarget: "3–8", description: "Josephson inductance." },
  { id: "L_geometric", symbol: "L_geo", section: "q3d", subgroup: "Inductance", formula: "—", unit: "nH", typicalRange: "0.1–2", idealTarget: "<1", description: "Geometric inductance of pads/leads." },
  { id: "R_sheet", symbol: "R_s", section: "q3d", subgroup: "Resistance", formula: "ρ/t", unit: "mΩ/□", typicalRange: "0–1", idealTarget: "<0.1", description: "Sheet resistance of metal." },
  { id: "G_substrate", symbol: "G_sub", section: "q3d", subgroup: "Conductance", formula: "—", unit: "µS", typicalRange: "~0", idealTarget: "~0", description: "Substrate leakage conductance." },

  // ---------- HFSS ----------
  { id: "f_res", symbol: "f_res", section: "hfss", subgroup: "Resonance", formula: "1/2π√(LC)", unit: "GHz", typicalRange: "5–8", idealTarget: "6.5–7.5", description: "Resonator fundamental." },
  { id: "S11", symbol: "S11", section: "hfss", subgroup: "S-parameters", formula: "reflection", unit: "dB", typicalRange: "-50 to 0", idealTarget: "<-20", description: "Port reflection." },
  { id: "S21", symbol: "S21", section: "hfss", subgroup: "S-parameters", formula: "transmission", unit: "dB", typicalRange: "-60 to 0", idealTarget: ">-3", description: "Port-to-port transmission." },
  { id: "Q_i", symbol: "Q_i", section: "hfss", subgroup: "Quality", formula: "ω·U/P_loss", unit: "—", typicalRange: "1e5–1e7", idealTarget: ">1e6", description: "Internal quality factor." },
  { id: "Q_e", symbol: "Q_e", section: "hfss", subgroup: "Quality", formula: "ω·U/P_ext", unit: "—", typicalRange: "1e3–1e5", idealTarget: "~1e4", description: "External coupling Q." },
  { id: "Q_L", symbol: "Q_L", section: "hfss", subgroup: "Quality", formula: "(1/Qi+1/Qe)⁻¹", unit: "—", typicalRange: "1e4–1e5", idealTarget: ">1e4", description: "Loaded Q." },
  { id: "Emax", symbol: "|E|_max", section: "hfss", subgroup: "Fields", formula: "peak", unit: "V/m", typicalRange: "1e4–1e7", idealTarget: "<5e6", description: "Peak electric field." },
  { id: "Hmax", symbol: "|H|_max", section: "hfss", subgroup: "Fields", formula: "peak", unit: "A/m", typicalRange: "1e2–1e5", idealTarget: "<1e4", description: "Peak magnetic field." },
  { id: "stored_energy", symbol: "U", section: "hfss", subgroup: "Power", formula: "U_E + U_M", unit: "J", typicalRange: "1e-20–1e-15", idealTarget: "—", description: "Total stored EM energy." },
  { id: "Z0", symbol: "Z_0", section: "hfss", subgroup: "Impedance", formula: "√(L/C)", unit: "Ω", typicalRange: "—", idealTarget: "50", description: "Characteristic impedance." },

  // ---------- Eigenmode ----------
  { id: "f_e1", symbol: "f_e1", section: "eigenmode", formula: "Re(ω)/2π", unit: "GHz", typicalRange: "4–8", idealTarget: "5–7", description: "Fundamental eigen-frequency." },
  { id: "f_e2", symbol: "f_e2", section: "eigenmode", formula: "—", unit: "GHz", typicalRange: "8–14", idealTarget: "—", description: "Second eigen-frequency." },
  { id: "Q_mode", symbol: "Q_m", section: "eigenmode", formula: "ω/2·Im(ω)", unit: "—", typicalRange: "1e4–1e7", idealTarget: ">1e5", description: "Per-mode Q-factor." },
  { id: "mode_volume", symbol: "V_m", section: "eigenmode", formula: "∫|E|²/max", unit: "µm³", typicalRange: "—", idealTarget: "minimize", description: "Effective mode volume." },
  { id: "mode_participation", symbol: "p_n", section: "eigenmode", formula: "U_n/U_tot", unit: "—", typicalRange: "0–1", idealTarget: ">0.9", description: "Mode energy participation." },

  // ---------- EPR ----------
  { id: "p_J", symbol: "p_J", section: "epr", subgroup: "Participation", formula: "U_J/U_tot", unit: "—", typicalRange: "0–1", idealTarget: ">0.95", description: "Junction participation ratio." },
  { id: "p_sub", symbol: "p_sub", section: "epr", subgroup: "Participation", formula: "U_sub/U_tot", unit: "—", typicalRange: "1e-6–1e-3", idealTarget: "<1e-4", description: "Substrate participation (TLS loss)." },
  { id: "E_J", symbol: "E_J", section: "epr", subgroup: "Josephson", formula: "Φ₀·I_c/2π", unit: "GHz", typicalRange: "5–100", idealTarget: "10–30", description: "Josephson energy." },
  { id: "E_C", symbol: "E_C", section: "epr", subgroup: "Josephson", formula: "e²/2C_Σ", unit: "MHz", typicalRange: "100–400", idealTarget: "200–300", description: "Charging energy." },
  { id: "Ej_Ec", symbol: "E_J/E_C", section: "epr", subgroup: "Josephson", formula: "ratio", unit: "—", typicalRange: "20–120", idealTarget: "50–80", description: "Headline transmon ratio." },
  { id: "f01", symbol: "f_01", section: "epr", subgroup: "Transitions", formula: "√(8E_JE_C)-E_C", unit: "GHz", typicalRange: "3–7", idealTarget: "5–6", description: "Qubit transition." },
  { id: "alpha", symbol: "α", section: "epr", subgroup: "Anharmonicity", formula: "f₁₂-f₀₁≈-E_C", unit: "MHz", typicalRange: "-400 to -100", idealTarget: "-200 to -300", description: "Anharmonicity." },
  { id: "g_qr", symbol: "g", section: "epr", subgroup: "Coupling", formula: "C_g·V_zpf/ℏ", unit: "MHz", typicalRange: "20–150", idealTarget: "50–100", description: "Qubit-resonator vacuum Rabi." },
  { id: "chi", symbol: "χ", section: "epr", subgroup: "Coupling", formula: "g²α/Δ(Δ+α)", unit: "MHz", typicalRange: "0.1–5", idealTarget: "0.5–2", description: "Dispersive shift." },
  { id: "ZZ", symbol: "ζ", section: "epr", subgroup: "Coupling", formula: "2-qubit ZZ", unit: "kHz", typicalRange: "1–1000", idealTarget: "<100", description: "ZZ residual coupling." },
  { id: "detuning", symbol: "Δ", section: "epr", subgroup: "Hamiltonian", formula: "ω_q-ω_r", unit: "GHz", typicalRange: "0.5–3", idealTarget: ">1", description: "Qubit-resonator detuning." },
  { id: "g_over_delta", symbol: "g/Δ", section: "epr", subgroup: "Hamiltonian", formula: "ratio", unit: "—", typicalRange: "0.01–0.2", idealTarget: "<0.1", description: "Dispersive regime condition." },

  // ---------- Coherence ----------
  { id: "T1", symbol: "T₁", section: "coherence", formula: "1/Γ₁", unit: "µs", typicalRange: "10–500", idealTarget: ">100", description: "Energy relaxation time." },
  { id: "T2", symbol: "T₂", section: "coherence", formula: "1/Γ₂", unit: "µs", typicalRange: "5–300", idealTarget: ">80", description: "Total dephasing time (T₂≤2T₁)." },
  { id: "T2_echo", symbol: "T₂ᴱ", section: "coherence", formula: "Hahn echo", unit: "µs", typicalRange: "10–400", idealTarget: ">150", description: "Echo dephasing time." },
  { id: "T_phi", symbol: "T_φ", section: "coherence", formula: "(1/T₂-1/2T₁)⁻¹", unit: "µs", typicalRange: "10–500", idealTarget: ">200", description: "Pure dephasing." },
  { id: "T1_purcell", symbol: "T₁ᴾ", section: "coherence", formula: "Q_e/ω_r·(Δ/g)²", unit: "µs", typicalRange: "100–10000", idealTarget: ">1000", description: "Purcell limit (>10× target T₁)." },

  // ---------- Noise ----------
  { id: "S_phi", symbol: "S_Φ", section: "noise", formula: "A_Φ/f", unit: "µΦ₀/√Hz", typicalRange: "0.1–10", idealTarget: "<1", description: "1/f flux noise amplitude at 1 Hz." },
  { id: "S_q", symbol: "S_q", section: "noise", formula: "A_q/f", unit: "e/√Hz", typicalRange: "1e-5–1e-3", idealTarget: "<1e-4", description: "Charge noise amplitude." },
  { id: "n_th", symbol: "n_th", section: "noise", formula: "1/(e^(hf/kT)-1)", unit: "photons", typicalRange: "1e-5–1e-2", idealTarget: "<1e-3", description: "Thermal photon population @ 20 mK." },
  { id: "S_TLS", symbol: "S_TLS", section: "noise", formula: "—", unit: "1/√Hz", typicalRange: "1e-8–1e-6", idealTarget: "<1e-7", description: "TLS noise spectral density." },

  // ---------- Coupling ----------
  { id: "g_qq", symbol: "g_qq", section: "coupling", formula: "—", unit: "MHz", typicalRange: "5–50", idealTarget: "10–30", description: "Qubit-qubit coupling." },
  { id: "g_rr", symbol: "g_rr", section: "coupling", formula: "—", unit: "MHz", typicalRange: "0.01–5", idealTarget: "<1", description: "Resonator-resonator crosstalk." },
  { id: "crosstalk", symbol: "XT", section: "coupling", formula: "10log(P_i/P_j)", unit: "dB", typicalRange: "-80 to -20", idealTarget: "<-40", description: "Channel-to-channel crosstalk." },

  // ---------- Validation ----------
  { id: "frequency_error", symbol: "δf", section: "validation", formula: "(f_sim-f_target)/f_target", unit: "%", typicalRange: "0–10", idealTarget: "<1", description: "Frequency error." },
  { id: "coupling_error", symbol: "δg", section: "validation", formula: "Δg/g_target", unit: "%", typicalRange: "0–20", idealTarget: "<2", description: "Coupling error." },
  { id: "Q_error", symbol: "δQ", section: "validation", formula: "ΔQ/Q_target", unit: "%", typicalRange: "0–30", idealTarget: "<5", description: "Q-factor error." },
  { id: "yield_prediction", symbol: "Y", section: "validation", formula: "Monte Carlo", unit: "%", typicalRange: "60–99", idealTarget: ">85", description: "Predicted fabrication yield." },
  { id: "fabrication_score", symbol: "F", section: "validation", formula: "DRC composite", unit: "/100", typicalRange: "0–100", idealTarget: ">80", description: "Fabrication readiness score." },
  { id: "physics_score", symbol: "P", section: "validation", formula: "composite", unit: "/100", typicalRange: "0–100", idealTarget: ">85", description: "Physics validation score." },
];

// Design-rule chips — enforced from §"Key Design Rules".
export type DesignRule = {
  id: string;
  label: string;
  // returns "pass" | "warn" | "fail" given a derived metrics bag.
  check: (m: Record<string, number>) => "pass" | "warn" | "fail";
  message: (m: Record<string, number>) => string;
};

export const DESIGN_RULES: DesignRule[] = [
  {
    id: "ej_ec",
    label: "E_J / E_C ∈ [50, 80]",
    check: (m) => (m.Ej_Ec >= 50 && m.Ej_Ec <= 80 ? "pass" : m.Ej_Ec >= 40 && m.Ej_Ec <= 100 ? "warn" : "fail"),
    message: (m) => `E_J/E_C = ${m.Ej_Ec?.toFixed(1)}`,
  },
  {
    id: "alpha",
    label: "|α| ≥ 150 MHz",
    check: (m) => (Math.abs(m.alpha) >= 150 ? "pass" : "fail"),
    message: (m) => `α = ${m.alpha?.toFixed(0)} MHz`,
  },
  {
    id: "g_delta",
    label: "g/Δ < 0.1 (dispersive)",
    check: (m) => (m.g_over_delta < 0.1 ? "pass" : "fail"),
    message: (m) => `g/Δ = ${m.g_over_delta?.toFixed(3)}`,
  },
  {
    id: "Qi",
    label: "Q_i > 1e6",
    check: (m) => (m.Q_i > 1e6 ? "pass" : m.Q_i > 1e5 ? "warn" : "fail"),
    message: (m) => `Q_i = ${(m.Q_i / 1e6)?.toFixed(2)}M`,
  },
  {
    id: "zz",
    label: "ZZ < 100 kHz",
    check: (m) => (m.ZZ < 100 ? "pass" : m.ZZ < 200 ? "warn" : "fail"),
    message: (m) => `ζ = ${m.ZZ?.toFixed(0)} kHz`,
  },
  {
    id: "purcell",
    label: "T₁ᴾ > 10× T₁",
    check: (m) => (m.T1_purcell > 10 * m.T1 ? "pass" : "warn"),
    message: (m) => `T₁ᴾ/T₁ = ${(m.T1_purcell / m.T1)?.toFixed(1)}×`,
  },
  {
    id: "yield",
    label: "Yield > 85%",
    check: (m) => (m.yield_prediction > 85 ? "pass" : "warn"),
    message: (m) => `${m.yield_prediction?.toFixed(0)}%`,
  },
];

export const INDUSTRY_BENCHMARKS = [
  { metric: "f₀₁ (GHz)",      ibm: "4.5–5.5",  google: "5–6",     rigetti: "3.5–4.5", target: "4–8" },
  { metric: "f_r (GHz)",      ibm: "6.5–7.5",  google: "6–7",     rigetti: "6–7.5",   target: "6–8" },
  { metric: "α (MHz)",        ibm: "~−330",    google: "~−200",   rigetti: "~−200",   target: "−150 to −350" },
  { metric: "g (MHz)",        ibm: "70–100",   google: "50–80",   rigetti: "50–100",  target: "50–100" },
  { metric: "T₁ (µs)",        ibm: ">100",     google: ">100",    rigetti: ">50",     target: ">100" },
  { metric: "T₂ (µs)",        ibm: ">100",     google: ">100",    rigetti: ">50",     target: ">80" },
  { metric: "Q_i",            ibm: ">1e6",     google: ">3e6",    rigetti: ">5e5",    target: ">1e6" },
  { metric: "E_J/E_C",        ibm: "50–80",    google: "40–60",   rigetti: "40–70",   target: "50–80" },
  { metric: "Fab score",      ibm: ">85",      google: ">90",     rigetti: ">80",     target: ">80" },
  { metric: "Yield",          ibm: ">90%",     google: ">90%",    rigetti: ">85%",    target: ">85%" },
];
