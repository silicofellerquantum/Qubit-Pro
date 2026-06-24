import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Qubits</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Qubit is the fundamental unit of quantum information processing. Silicofeller currently supports two primary topologies of superconducting qubits: The Transmon and the Fluxonium.
      </p>

      <div className="my-8 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <img src="/brain/63033335-280b-4630-beb9-8bb527edd274/media__1782265647392.png" alt="Qubit Close-up" className="w-full h-auto object-cover" />
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Transmon Variations</h2>
      <p className="text-slate-600 mb-6">
        A transmon is essentially an LC oscillator where the inductor is replaced by a non-linear Josephson Junction. We offer three pre-parameterized shapes:
      </p>
      
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>Transmon Cross:</strong> IBM's signature design. Highly symmetric, excellent for 4-way coupling.</li>
        <li><strong>Transmon Pocket:</strong> A rectangular pad design. Useful when space is constrained or when coupling to a single adjacent resonator.</li>
        <li><strong>Xmon:</strong> Google's signature cross-shaped transmon. Similar to the Transmon Cross but optimized for nearest-neighbor tunable coupling.</li>
      </ul>

      <AlertBox type="warning" title="Anharmonicity">
        Transmons suffer from inherently weak anharmonicity (~-300 MHz). If you drive your 0→1 transition too hard, you risk leaking into the |2⟩ state. Always check the calculated $\alpha$ in the Properties Inspector.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Geometric Parameters</h2>
      <p className="text-slate-600 mb-6">
        When dragging a Qubit onto the canvas, you can tweak its fundamental geometry to alter its quantum properties:
      </p>
      
      <div className="overflow-x-auto mb-8 border border-slate-200 rounded-xl shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-900">Parameter</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Effect on Physics</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-medium text-slate-900 text-mono">cross_width</td>
              <td className="px-6 py-4">Increases the total shunt capacitance ($C_s$), lowering both $f_{01}$ and $E_C$.</td>
            </tr>
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-medium text-slate-900 text-mono">L_j (Junction Inductance)</td>
              <td className="px-6 py-4">Inversely proportional to $f_{01}$. Governed by the physical size of the Al-AlOx-Al junction during e-beam lithography.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}