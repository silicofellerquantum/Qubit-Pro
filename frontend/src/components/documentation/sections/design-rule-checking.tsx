import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";
import { DocumentationCard } from "../DocumentationCard";

export default function Section() {
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Core Technologies</p>
          <h2>Design Rule Checking (DRC)</h2>
        </div>
      </div>
      <p>
        Design Rule Checking (DRC) is a critical step in the Silicofeller compilation pipeline. Before any QCLang code can be synthesized into a physical layout or exported to Qiskit Metal, it must pass a rigorous set of automated checks to ensure it is physically realizable and electromagnetically sound.
      </p>

      <h3>1. Spatial & Spacing Rules</h3>
      <p>The DRC engine verifies that no two quantum components overlap or violate minimum fabrication spacing tolerances.</p>
      <ul>
        <li><strong>Qubit-to-Qubit Spacing:</strong> Ensures qubits are spaced appropriately to prevent unwanted crosstalk.</li>
        <li><strong>Feedline Clearances:</strong> Verifies that CPW feedlines do not cross without an explicit airbridge structure.</li>
        <li><strong>Ground Plane Padding:</strong> Validates that sufficient continuous ground plane exists around all active components to prevent parasitic radiation.</li>
      </ul>

      <h3>2. Frequency Collision Detection</h3>
      <p>To avoid spectral crowding and two-level system (TLS) interference, the DRC analyzes the assigned target frequencies of all qubits and resonators.</p>
      <CodeBlock language="qclang" code={`// The DRC will flag this as an ERROR due to a frequency collision
qubit q1 { frequency: 5.0 GHz }
qubit q2 { frequency: 5.05 GHz } // Collision! Minimum detuning is 100MHz`} />
      
      <AlertBox type="warning" title="Copilot AI Intervention">
        When a frequency collision is detected, the <strong>QuantumChipGen AI Copilot</strong> will automatically suggest an optimized frequency lattice and provide a 1-click "Fix Code" button to resolve the DRC violation.
      </AlertBox>

      <h3>3. Fabrication Constraints</h3>
      <p>The DRC engine checks against the specific limits of the selected foundry profile:</p>
      <ul>
        <li>Minimum trace widths (e.g., 2μm for standard e-beam lithography).</li>
        <li>Josephson Junction critical current densities.</li>
        <li>Maximum bounding box sizes for the selected substrate.</li>
      </ul>

      <h3>4. Metal Code Generation Safety</h3>
      <p>Once the DRC passes with a 100% grade, the AST is unlocked for Synthesis. The system verifies that the required routing channels exist before passing the final graph to the <strong>Qiskit Metal Export Engine</strong>, ensuring that the generated Python Metal script will compile flawlessly in IBM's ecosystem.</p>

      <div className="mt-8 p-6 bg-[#f8f9fa] border border-[#e9ecef] rounded-xl">
        <h4 className="text-lg font-bold mb-4">The Copilot -&gt; DRC -&gt; Metal Workflow</h4>
        <ol className="list-decimal pl-5 space-y-2 text-[var(--text)]">
          <li><strong>AI Generation:</strong> User prompts the Copilot: "Generate a 5-qubit star topology."</li>
          <li><strong>Code Injection:</strong> Copilot writes the QCLang source into the editor.</li>
          <li><strong>Compilation & DRC:</strong> The user clicks Compile. The DRC engine runs 50+ geometric and frequency checks.</li>
          <li><strong>Error Resolution:</strong> If DRC fails, Copilot analyzes the specific rule violation (e.g., "Trace overlap on Feedline 2") and patches the code.</li>
          <li><strong>Synthesis & Metal:</strong> The clean code is synthesized, and exact X/Y coordinates are converted into a ready-to-run Qiskit Metal Python file.</li>
        </ol>
      </div>
    </>
  );
}
