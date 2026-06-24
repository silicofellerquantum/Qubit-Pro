import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content">
      <h1 className="text-4xl font-extrabold mb-6">Review Placement & Frequencies</h1>
      <p className="text-lg text-slate-600 mb-8">
        Physical placement and frequency assignments are the leading causes of coherent errors (cross-resonance collisions, spectator errors).
      </p>

      <h2 className="text-2xl font-bold mb-4">Collision Matrices</h2>
      <p className="text-slate-600 mb-6">
        Silicofeller automatically generates a detuning matrix for all nearest-neighbor (NN) and next-nearest-neighbor (NNN) pairs.
      </p>

      <div className="overflow-hidden rounded-xl border border-slate-200 mb-10">
        <table className="w-full text-center text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-3">Pair</th>
              <th className="p-3">Target Detuning (Δ)</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr>
              <td className="p-3 font-mono">Q1-Q2</td>
              <td className="p-3">150 MHz</td>
              <td className="p-3 text-emerald-600 font-bold">Pass</td>
            </tr>
            <tr>
              <td className="p-3 font-mono">Q2-Q3</td>
              <td className="p-3">20 MHz</td>
              <td className="p-3 text-rose-600 font-bold">Collision Risk</td>
            </tr>
          </tbody>
        </table>
      </div>

      <AlertBox type="info" title="Mitigation Strategy">
        If a collision risk is detected, navigate back to the schematic and manually tweak the geometric padding of the Transmon capacitor pads to adjust the resonant frequency.
      </AlertBox>
    </div>
  );
}
