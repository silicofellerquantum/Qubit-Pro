import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Choose a Topology</h1>
      <p className="text-lg text-slate-600 mb-8">
        The topology dictates the physical connectivity graph of your qubits. Selecting the correct arrangement is crucial for balancing error correction capabilities against cross-talk mitigation.
      </p>

      <h2 className="text-2xl font-bold mb-4">Architectural Comparison</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 mb-10">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-900">
            <tr>
              <th className="px-6 py-4 font-semibold">Topology</th>
              <th className="px-6 py-4 font-semibold">Average Degree</th>
              <th className="px-6 py-4 font-semibold">Primary Use Case</th>
              <th className="px-6 py-4 font-semibold">Cross-talk Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr className="hover:bg-slate-50/50">
              <td className="px-6 py-4 font-medium text-slate-900">Heavy Hex</td>
              <td className="px-6 py-4 font-mono text-xs text-indigo-600">2.6</td>
              <td className="px-6 py-4 text-slate-600">Scalable Error Mitigation</td>
              <td className="px-6 py-4 text-emerald-600">Low</td>
            </tr>
            <tr className="hover:bg-slate-50/50">
              <td className="px-6 py-4 font-medium text-slate-900">Square Grid</td>
              <td className="px-6 py-4 font-mono text-xs text-indigo-600">4.0</td>
              <td className="px-6 py-4 text-slate-600">Surface Code Algorithms</td>
              <td className="px-6 py-4 text-rose-600">High</td>
            </tr>
            <tr className="hover:bg-slate-50/50">
              <td className="px-6 py-4 font-medium text-slate-900">Linear Chain</td>
              <td className="px-6 py-4 font-mono text-xs text-indigo-600">2.0</td>
              <td className="px-6 py-4 text-slate-600">Hardware Prototyping</td>
              <td className="px-6 py-4 text-emerald-600">Very Low</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold mb-4">Graph Generation Algorithm</h2>
      <p className="text-slate-600 mb-6">
        Silicofeller uses a proprietary tessellation algorithm to generate Heavy Hex layouts. Given a target depth $D$, the algorithm constructs $D$ concentric hexagonal layers, interspersing ancilla qubits on the edges to reduce the connectivity degree.
      </p>
      
      <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl font-mono text-sm text-slate-800">
        <p className="text-indigo-600 font-bold mb-2">Algorithm: generateHeavyHex(n)</p>
        <p className="pl-4 border-l-2 border-indigo-200">
          1. Initialize empty Graph G<br/>
          2. While |V(G)| &lt; n:<br/>
          &nbsp;&nbsp;&nbsp;&nbsp;a. Add central face F<br/>
          &nbsp;&nbsp;&nbsp;&nbsp;b. For each edge E in F: insert intermediate Q_ancilla<br/>
          3. Prune dangling edges to maintain symmetry<br/>
          4. Return G
        </p>
      </div>
    </div>
  );
}
