import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Transmon Properties</h1>
      <p className="text-lg text-slate-600 mb-8">
        Understanding the core physical properties governing Transmon behavior is essential for predicting gate fidelities and coherence limits.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Coherence Times ($T_1$ and $T_2$)</h2>
      <p className="text-slate-600 mb-6">
        $T_1$ (Relaxation Time) is how long the qubit takes to decay from $|1\rangle$ to $|0\rangle$. $T_2$ (Dephasing Time) is how long the qubit maintains its quantum phase.
      </p>

      <div className="bg-slate-50 p-8 rounded-xl border border-slate-200 font-serif text-lg text-center mb-10 shadow-inner">
        <p className="mb-4">{"1/T_1 = Σ (p_i * tan(δ_i)) / ω_01"}</p>
        <p>{"1/T_2* = 1/(2*T_1) + 1/T_φ"}</p>
      </div>

      <p className="text-slate-600 mb-6">
        Where $p_i$ is the participation ratio of dielectric region $i$, and $\tan(\delta_i)$ is its loss tangent. These equations show that to increase $T_1$, you must minimize the electric field's interaction with lossy materials.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Capacitance and Charging Energy ($E_C$)</h2>
      <p className="text-slate-600 mb-6">
        The charging energy $E_C$ is the energy required to add a single Cooper pair to the transmon island. It is purely determined by the total shunt capacitance ($C_{\Sigma}$) extracted from the geometry.
      </p>
      <div className="bg-slate-900 text-slate-300 p-4 rounded-xl font-mono text-sm text-center">
        E_C = e² / (2 * C_Σ)
      </div>
    </div>
  );
}