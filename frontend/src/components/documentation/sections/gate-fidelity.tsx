import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Gate Fidelity Predictions</h1>
      <p className="text-lg text-slate-600 mb-8">
        Once the Hamiltonian parameters ($f_{01}$, $\alpha$, $J_{ij}$) are extracted from the layout, Silicofeller can simulate the expected fidelity of single-qubit and two-qubit operations.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Cross-Resonance (CR) Gate Errors</h2>
      <p className="text-slate-600 mb-6">
        The primary 2-qubit gate for fixed-frequency transmons is the Cross-Resonance gate. It is driven by applying a microwave tone to the Control Qubit at the frequency of the Target Qubit.
      </p>

      <AlertBox type="warning" title="CR Limitations">
        CR gates require a strong static coupling ($J$) to be fast, but suffer from unwanted $ZX$ interactions if the detuning $\Delta$ between the qubits is too small. The fidelity simulator calculates the effective CR drive strength and projects the coherent gate error based on your layout's exact $J/\Delta$ ratio.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Single Qubit (SQ) DRAG Pulses</h2>
      <p className="text-slate-600 mb-6">
        For single qubit gates, the simulator calculates the optimal DRAG (Derivative Removal by Adiabatic Gate) coefficient needed to suppress leakage into the $|2\rangle$ state, providing a baseline error rate governed primarily by the calculated $T_1$ and $T_2$ coherence limits.
      </p>
    </div>
  );
}