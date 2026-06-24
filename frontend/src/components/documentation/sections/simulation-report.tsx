import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Simulation Report</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Simulation Report consolidates the results of all computationally heavy LOM and Palace FEA tasks into a single, readable document.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Contents of the Report</h2>
      
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>Hamiltonian Parameters:</strong> The final estimated $f_{01}$, $\alpha$, and $E_C$ for every qubit on the chip.</li>
        <li><strong>Coupling Matrix (J):</strong> An $N \times N$ matrix detailing the exact coupling strength (in MHz) between every pair of qubits and resonators.</li>
        <li><strong>Coherence Estimates:</strong> Predicted $T_1$ limits based on Energy Participation Ratio analysis of the dielectric interfaces.</li>
        <li><strong>Scattering Parameters:</strong> Embedded vector graphics of the S11 and S21 plots for all transmission lines.</li>
      </ul>

      <h2 className="text-2xl font-bold mb-4 mt-10">Cross-Referencing</h2>
      <p className="text-slate-600 mb-6">
        The report explicitly highlights any discrepancies between the <em>Target</em> frequencies defined in the Properties Inspector and the <em>Simulated</em> frequencies derived from the 3D physics extraction. If the delta is too large, you must iterate on the geometric design.
      </p>
    </div>
  );
}