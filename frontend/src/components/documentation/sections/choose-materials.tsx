import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Choose Materials</h1>
      <p className="text-lg text-slate-600 mb-8">
        Material properties deeply impact the Hamiltonian of your transmon qubits. The Design Copilot uses default standard materials unless explicitly overridden.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
        <div>
          <h3 className="font-bold text-xl mb-4 border-b pb-2">Substrates</h3>
          <dl className="space-y-4">
            <div>
              <dt className="font-bold text-slate-900">Silicon (Si)</dt>
              <dd className="text-sm text-slate-600">Relative Permittivity: 11.45. Industry standard, excellent for high-coherence when highly purified.</dd>
            </div>
            <div>
              <dt className="font-bold text-slate-900">Sapphire (Al2O3)</dt>
              <dd className="text-sm text-slate-600">Relative Permittivity: ~9.9. Exceptional loss-tangent properties at cryogenic temperatures.</dd>
            </div>
          </dl>
        </div>
        <div>
          <h3 className="font-bold text-xl mb-4 border-b pb-2">Superconductors</h3>
          <dl className="space-y-4">
            <div>
              <dt className="font-bold text-slate-900">Niobium (Nb)</dt>
              <dd className="text-sm text-slate-600">Tc: 9.2K. Standard for transmission lines and ground planes due to robust kinetic inductance.</dd>
            </div>
            <div>
              <dt className="font-bold text-slate-900">Aluminum (Al)</dt>
              <dd className="text-sm text-slate-600">Tc: 1.2K. Exclusively used for Josephson Junction fabrication (Al/AlOx/Al).</dd>
            </div>
          </dl>
        </div>
      </div>

      <AlertBox type="warning" title="Dielectric Loss Variations" className="mb-8">
        Modifying substrate thickness directly impacts the participation ratio of Two-Level System (TLS) defects. Always re-run the Coherence Analysis simulation when altering substrate layers.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4">Material Override Configuration</h2>
      <CodeBlock language="json" code={`{
  "project_overrides": {
    "substrate": {
      "material": "Sapphire",
      "thickness_um": 500,
      "loss_tangent": 1e-7
    },
    "metallization": {
      "ground_plane": "Nb",
      "junction": "Al",
      "thickness_nm": 200
    }
  }
}`} />
    </div>
  );
}
