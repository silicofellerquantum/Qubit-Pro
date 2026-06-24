import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Couplers</h1>
      <p className="text-lg text-slate-600 mb-8">
        Couplers mediate the entanglement operations (two-qubit gates) between adjacent qubits.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Static Capacitive Coupling</h2>
      <p className="text-slate-600 mb-6">
        The simplest way to entangle two transmons is to let their electric fields overlap. You can achieve this by routing a CPW line between them or physically placing their capacitor pads near each other. This results in an always-on $ZZ$ interaction.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-x-auto mb-10">
        <pre className="text-sm font-mono text-slate-800">
{`graph LR
    Q1((Qubit 1)) ---|C_g| Q2((Qubit 2))
    style Q1 fill:#3b82f6,color:#fff
    style Q2 fill:#3b82f6,color:#fff`}
        </pre>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Tunable Couplers</h2>
      <p className="text-slate-600 mb-6">
        To prevent spectator errors in dense lattices, modern chips use Tunable Couplers (essentially a smaller, heavily detuned qubit) placed between the main computational qubits.
      </p>
      
      <AlertBox type="tip" title="Flux Bias Lines">
        Tunable couplers require a dedicated flux bias line (Fast-Z control) to rapidly tune their frequency. When using a Tunable Coupler from the library, ensure you route a `FluxLine` to its Z-control pin.
      </AlertBox>

      <p className="text-slate-600 mb-6 mt-6">
        By pulsing the tunable coupler, the effective coupling $J$ between the data qubits can be pushed to exactly 0 (idle state) or ramped up for high-fidelity CZ or iSWAP gates.
      </p>
    </div>
  );
}