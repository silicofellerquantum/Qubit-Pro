import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Linear, Ring, and Star Layouts</h1>
      <p className="text-lg text-slate-600 mb-8">
        These fundamental 1D and simple 2D topologies are excellent starting points for academic research, proof-of-concept chips, and specialized analog quantum simulators.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Linear Chains</h2>
      <p className="text-slate-600 mb-6">
        A Linear layout simply places qubits in a 1D row, where each qubit (except the ends) connects only to its left and right neighbors.
      </p>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>Pros:</strong> Absolute minimum crosstalk. Trivial to route control lines from the top and bottom of the chip. Easy to fabricate on a single layer.</li>
        <li><strong>Cons:</strong> Extremely high SWAP overhead. To entangle the first and last qubit, you must perform O(N) SWAP gates, which accumulates devastating error rates.</li>
      </ul>

      <h2 className="text-2xl font-bold mb-4 mt-10">Ring Topology</h2>
      <p className="text-slate-600 mb-6">
        A Ring is a linear chain where the last qubit connects back to the first. 
      </p>
      <AlertBox type="tip" title="Quantum Simulators">
        Ring topologies are frequently used to simulate periodic boundary conditions in condensed matter physics (e.g., simulating a 1D spin chain with periodic boundaries).
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Star Topology</h2>
      <p className="text-slate-600 mb-6">
        In a Star topology, one central "hub" qubit (or a central coupling bus) connects to multiple outer "spoke" qubits. The outer qubits do not connect to each other.
      </p>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-x-auto mb-10">
        <pre className="text-sm font-mono text-slate-800">
{`graph TD
    S1((Spoke 1)) --- H((Hub Qubit))
    S2((Spoke 2)) --- H
    S3((Spoke 3)) --- H
    S4((Spoke 4)) --- H
    style H fill:#8b5cf6,color:#fff`}
        </pre>
      </div>
      <p className="text-slate-600 mb-6">
        <strong>Applications:</strong> Star layouts are useful for testing multi-qubit gates, implementing Quantum Random Access Memory (QRAM) primitives, or creating W-states efficiently. However, the central hub becomes a massive frequency crowding bottleneck.
      </p>
    </div>
  );
}