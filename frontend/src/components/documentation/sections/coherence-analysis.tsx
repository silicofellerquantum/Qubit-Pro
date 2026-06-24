import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Coherence Analysis (EPR)</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Energy Participation Ratio (EPR) analysis quantifies exactly how much of the quantum zero-point energy is stored in dissipative (lossy) elements.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Dielectric Participation</h2>
      <p className="text-slate-600 mb-6">
        In superconducting circuits, most Two-Level System (TLS) loss does not occur in the bulk silicon or the bulk metal. It occurs at the microscopic oxidized interfaces:
      </p>
      
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>Substrate-Air (SA):</strong> The surface of the silicon wafer.</li>
        <li><strong>Metal-Air (MA):</strong> The top surface of the Niobium trace.</li>
        <li><strong>Metal-Substrate (MS):</strong> The interface where the metal meets the silicon.</li>
      </ul>

      <AlertBox type="tip" title="Optimization Strategy">
        To increase $T_1$, you must push the electric field out of these interfaces and deeper into the low-loss bulk substrate. Increasing the gap spacing between the transmon pads forces the E-field lines to travel deeper through the silicon, reducing SA and MS participation ratios.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Running EPR via API</h2>
      <p className="text-slate-600 mb-6">
        You can extract the participation matrix computationally by triggering a Palace FEA simulation and parsing the resulting json output.
      </p>
      
      <CodeBlock language="python" code={`from silicofeller.simulations import EPRAnalysis

analysis = EPRAnalysis(project_id="Falcon_V1")
results = analysis.run(mesh_refinement=3)

print(f"Substrate Participation: {results.p_substrate}")
print(f"Predicted T1 Limit: {results.t1_limit_us} us")`} />
    </div>
  );
}