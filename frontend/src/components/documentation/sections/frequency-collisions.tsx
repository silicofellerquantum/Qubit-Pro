import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Frequency Collisions</h1>
      <p className="text-lg text-slate-600 mb-8">
        Avoiding frequency collisions is the absolute hardest part of fixed-frequency transmon design. A single collision can render an entire sub-lattice of the chip useless for quantum algorithms.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">The Three Collision Typologies</h2>
      
      <div className="space-y-6 mb-10">
        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
          <h3 className="font-bold text-slate-900 text-lg mb-2">Type 1: Fundamental Collision</h3>
          <p className="font-mono text-sm text-indigo-600 bg-indigo-50 inline-block px-2 py-1 rounded mb-3">|f_Q1 - f_Q2| &lt; 10 MHz</p>
          <p className="text-slate-600">Two directly neighboring qubits have nearly identical frequencies. The static $ZZ$ interaction dominates, meaning you cannot apply a single-qubit gate to $Q_1$ without also severely rotating $Q_2$.</p>
        </div>

        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
          <h3 className="font-bold text-slate-900 text-lg mb-2">Type 2: Cross-Resonance Spectator</h3>
          <p className="font-mono text-sm text-indigo-600 bg-indigo-50 inline-block px-2 py-1 rounded mb-3">|f_Q1 - f_Q3| &lt; 15 MHz</p>
          <p className="text-slate-600">Occurs when $Q_1$ and $Q_3$ share a common neighbor $Q_2$. When driving $Q_2$ at $Q_1$'s frequency to perform a Cross-Resonance gate, you accidentally drive $Q_3$ as well, causing severe "spectator" errors.</p>
        </div>

        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
          <h3 className="font-bold text-slate-900 text-lg mb-2">Type 3: Anharmonicity Collision</h3>
          <p className="font-mono text-sm text-indigo-600 bg-indigo-50 inline-block px-2 py-1 rounded mb-3">f_Q1 ≈ f_Q2 + α_Q2</p>
          <p className="text-slate-600">The 0→1 transition of $Q_1$ exactly matches the 1→2 transition of its neighbor $Q_2$. Driving $Q_1$ will cause $Q_2$ to leak out of the computational basis into the $|2\rangle$ state, permanently destroying the quantum information.</p>
        </div>
      </div>

      <AlertBox type="tip" title="Post-Fabrication Tuning">
        If you manufacture a chip and discover a Type 1 collision due to lithography variations, you can use post-fabrication Laser Annealing to selectively heat the Josephson Junction. This shifts the junction resistance, permanently lowering the qubit's frequency by 50-100 MHz to resolve the collision.
      </AlertBox>
    </div>
  );
}