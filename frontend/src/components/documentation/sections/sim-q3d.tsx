import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";
import { DocumentationCard } from "../DocumentationCard";

export default function Section() {
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Electromagnetic Simulation</p>
          <h2>Sim Q3d</h2>
        </div>
      </div>
      
      <p className="text-[var(--muted)] mb-8 leading-relaxed">
        Advanced parameters and finite-element mesh setup for Sim Q3d. This module provides researchers and hardware engineers with the necessary tooling to optimize their quantum design lifecycle within the Silicofeller platform. It has been built from the ground up to support massive scale, seamless AI integration via the Copilot, and absolute precision down to the nanometer level.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="p-6 bg-[#f8f9fa] border border-[#e9ecef] rounded-[16px]">
          <h4 className="font-bold text-lg mb-2">Key Advantages</h4>
          <p className="text-[var(--muted)] text-sm mb-4">Why use this specific module?</p>
          <ul className="list-disc pl-4 space-y-2 text-sm text-[var(--muted)]">
            <li>Guaranteed reproducible results across compilation runs.</li>
            <li>Optimized for cloud-based parallel execution.</li>
            <li>Fully observable by the QuantumChipGen AI Copilot.</li>
          </ul>
        </div>
        <div className="p-6 bg-[#f8f9fa] border border-[#e9ecef] rounded-[16px]">
          <h4 className="font-bold text-lg mb-2">Integration Level</h4>
          <p className="text-[var(--muted)] text-sm mb-4">System requirements and impact.</p>
          <ul className="list-disc pl-4 space-y-2 text-sm text-[var(--muted)]">
            <li><strong>Latency:</strong> &lt; 50ms overhead</li>
            <li><strong>Dependencies:</strong> Core execution engine</li>
            <li><strong>Supported Exporters:</strong> GDSII, Qiskit Metal</li>
          </ul>
        </div>
      </div>

      <h3>Architecture & Implementation Details</h3>
      <p className="mb-6">
        The <strong>Sim Q3d</strong> sub-system is heavily integrated into the core QuantumChipGen pipeline. When designing superconducting layouts, maintaining precise control over this module ensures high-fidelity qubit operation, minimized cross-talk, and reduced dielectric loss tangents. The data structures are serialized via Protobuf before being handed off to the finite element solvers.
      </p>

      <AlertBox type="info" title="Best Practices">
        Always ensure that your QCLang definitions strictly adhere to the parameter constraints of Sim Q3d to prevent Design Rule Checking (DRC) violations during the final synthesis phase.
      </AlertBox>

      <h3 className="mt-10">Parameter Reference</h3>
      <p className="mb-4">The following table outlines the configuration schema available for <code>sim-q3d</code>. These properties can be manipulated directly via QCLang or the Python bindings.</p>
      
      <table className="w-full text-left border-collapse mt-6 mb-8">
        <thead>
          <tr className="border-b border-black/10">
            <th className="py-3 px-4 font-semibold text-[var(--text)]">Parameter</th>
            <th className="py-3 px-4 font-semibold text-[var(--text)]">Type</th>
            <th className="py-3 px-4 font-semibold text-[var(--text)]">Default Value</th>
            <th className="py-3 px-4 font-semibold text-[var(--text)]">Description</th>
          </tr>
        </thead>
        <tbody className="text-sm text-[var(--muted)]">
          <tr className="border-b border-black/5 hover:bg-black/5 transition-colors">
            <td className="py-3 px-4 font-mono text-[var(--accent)]">accuracy</td>
            <td className="py-3 px-4">Float</td>
            <td className="py-3 px-4">1e-6</td>
            <td className="py-3 px-4">Delta S convergence target.</td>
          </tr>
          <tr className="border-b border-black/5 hover:bg-black/5 transition-colors">
            <td className="py-3 px-4 font-mono text-[var(--accent)]">max_passes</td>
            <td className="py-3 px-4">Integer</td>
            <td className="py-3 px-4">15</td>
            <td className="py-3 px-4">Maximum adaptive meshing passes.</td>
          </tr>
        </tbody>
      </table>

      <h3 className="mt-10">Configuration & Usage</h3>
      <p className="mb-4">Below is a standard reference implementation used by the Silicofeller synthesis engine. It demonstrates how to initialize the Sim Q3d module correctly.</p>
      
      <CodeBlock language="qclang" code={`simulate sim-q3d {
  accuracy: 1e-6;
  mesh_operations: true;
  max_passes: 15;
  min_passes: 3;
  min_converged_passes: 2;
}`} />

      <h3 className="mt-10">Advanced Enterprise Integration</h3>
      <p className="mb-6">
        For enterprise users, the Sim Q3d module provides direct access to the lower-level Abstract Syntax Tree (AST) nodes and backend PostgreSQL database entries. When running large-scale parameter sweeps (e.g., via Ansys Optimetrics or CST Studio Suite), you can batch-submit highly tuned configurations via our RESTful API endpoint, bypassing the UI entirely for massive throughput.
      </p>

      <AlertBox type="warning" title="Warning">
        Modifying internal AST properties directly can lead to physical layout anomalies. Only do this if you are actively bypassing the built-in Copilot validation.
      </AlertBox>
    </>
  );
}
