import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Four-Domain DRC: Frequency Planning</h1>
      <p className="text-lg text-slate-600 mb-8">
        Frequency Design Rule Checking verifies that the analytical Hamiltonian estimates for your components do not result in catastrophic frequency crowding.
      </p>

      <div className="bg-indigo-950 text-indigo-100 p-6 rounded-xl font-mono text-sm mb-10 shadow-lg">
        <p className="text-indigo-300 font-bold mb-3">// Default Collision Thresholds</p>
        <p className="mb-1"><span className="text-emerald-400">let</span> NN_DETUNING_MIN = 100_000_000; <span className="text-indigo-400"># 100 MHz</span></p>
        <p className="mb-1"><span className="text-emerald-400">let</span> NNN_DETUNING_MIN = 15_000_000;  <span className="text-indigo-400"># 15 MHz</span></p>
        <p><span className="text-emerald-400">let</span> READOUT_SPACING_MIN = 20_000_000; <span className="text-indigo-400"># 20 MHz</span></p>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Nearest Neighbor (NN) Detuning</h2>
      <p className="text-slate-600 mb-6">
        Two directly coupled qubits (e.g., $Q_1$ and $Q_2$) must have a frequency difference ($\Delta$) significantly larger than their coupling strength ($J$). If $\Delta < 100$ MHz, the static $ZZ$ interaction becomes dominating, destroying single-qubit gate fidelities. The DRC engine scans the graph and flags any $Q_i, Q_j$ pairs that violate this.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Next-Nearest Neighbor (NNN) Spectator</h2>
      <p className="text-slate-600 mb-6">
        When driving a cross-resonance gate between $Q_1$ and $Q_2$, any qubit $Q_3$ coupled to $Q_2$ becomes a "spectator." If $Q_1$ and $Q_3$ have similar frequencies, driving the gate will accidentally drive $Q_3$. The Frequency DRC mandates at least a 15 MHz gap between any NNN pairs.
      </p>

      <AlertBox type="warning" title="Iterative Physics">
        Frequency DRC operates on <strong>analytical estimates</strong>. If the engine throws a warning, you must alter your layout (e.g., change the Transmon cross width) to shift the estimated frequencies before proceeding to heavy FEM simulations.
      </AlertBox>
    </div>
  );
}