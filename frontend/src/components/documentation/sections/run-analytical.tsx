import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Lumped Oscillator Model (LOM)</h1>
      <p className="text-lg text-slate-600 mb-8">
        The LOM solver is your workhorse for iterative design. It is much faster than full-wave FEA and provides highly accurate estimates for frequencies and coupling strengths.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">How LOM Works</h2>
      <p className="text-slate-600 mb-6">
        Instead of solving the full electromagnetic wave equations, LOM treats the chip as an abstract circuit of capacitors and inductors.
      </p>
      
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-x-auto mb-10">
        <pre className="text-sm font-mono text-slate-800">
{`graph TD
    A[GDSII Layout Polygons] --> B[Electrostatic Q3D Extractor]
    B -->|Solves Poisson Eq| C[Maxwell Capacitance Matrix C_max]
    C --> D[LOM Quantization Engine]
    D -->|Applies Josephson Inductances| E[f_01, E_C, g_ij]
    style C fill:#dbeafe,stroke:#3b82f6
    style E fill:#d1fae5,stroke:#10b981`}
        </pre>
      </div>

      <p className="text-slate-600 mb-6">
        By extracting only the Maxwell Capacitance Matrix ($C_{max}$), LOM reduces a 10-hour simulation down to ~2 minutes, allowing you to rapidly tweak pad sizes until you hit your target frequencies.
      </p>
    </div>
  );
}