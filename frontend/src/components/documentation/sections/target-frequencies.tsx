import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Target Frequencies</h1>
      <p className="text-lg text-slate-600 mb-8">
        Assigning exact target frequencies is the most critical physics parameter when designing a multi-qubit chip. It dictates your gate times, coherence limits, and cryogenic hardware requirements.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Standard Operating Bands</h2>
      <p className="text-slate-600 mb-6">
        The microwave spectrum must be carefully partitioned.
      </p>

      <div className="overflow-x-auto mb-8 border border-slate-200 rounded-xl shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-900">Component</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Typical Frequency Band</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Reasoning</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-medium text-slate-900">Transmons ($f_{01}$)</td>
              <td className="px-6 py-4">4.0 GHz — 5.5 GHz</td>
              <td className="px-6 py-4 text-slate-600">Below 4 GHz, thermal noise at 15mK dominates. Above 5.5 GHz, you risk colliding with readout bands.</td>
            </tr>
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-medium text-slate-900">Readout Resonators</td>
              <td className="px-6 py-4">6.0 GHz — 8.0 GHz</td>
              <td className="px-6 py-4 text-slate-600">Must be highly detuned from qubits to enable dispersive shift readout without Purcell decay.</td>
            </tr>
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-medium text-slate-900">Purcell Filters</td>
              <td className="px-6 py-4">Matches Resonator</td>
              <td className="px-6 py-4 text-slate-600">Acts as a bandpass filter centered on the resonator's readout tone.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <AlertBox type="info" title="Iterative Simulation Requirement">
        The analytical frequencies provided in the UI are rough estimates based on standard capacitance models. Because geometric fringing fields affect the final capacitance matrix ($C_{max}$), the true $f_{01}$ frequencies must be verified using the Energy Participation Ratio (EPR) method in the Physics Analysis simulation tab.
      </AlertBox>
    </div>
  );
}