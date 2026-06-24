import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Simulation Results</h1>
      <p className="text-lg text-slate-600 mb-8">
        Aggregated outputs from Palace FEA and LOM solvers.
      </p>

      <h2 className="text-2xl font-bold mb-4">Export Formats</h2>
      <ul className="list-disc pl-5 space-y-2 text-slate-600 mb-8">
        <li><strong>Capacitance Matrices:</strong> Exported as CSV matrices.</li>
        <li><strong>E-Field Visualizations:</strong> Exported as VTK files for viewing in ParaView.</li>
        <li><strong>S-Parameters:</strong> Exported as standard Touchstone (.s2p, .sNp) files.</li>
      </ul>
    </div>
  );
}
