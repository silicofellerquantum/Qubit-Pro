import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";
import { DocumentationCard } from "../DocumentationCard";
import { Link } from "@tanstack/react-router";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <div className="mb-12 mt-8">
        <p className="text-sm font-semibold text-blue-600 tracking-wider uppercase mb-2">Silicofeller Platform</p>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--text)] mb-6">
          Networkx Processing
        </h1>
      </div>

      {/* 1. OVERVIEW */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">1. Overview</h2>
        <p className="text-[var(--muted)] leading-relaxed mb-4">
          <strong>What it is:</strong> Networkx Processing is a core sub-system of the Silicofeller Quantum Studio platform designed to bridge the gap between abstract quantum intent and physical layout.
        </p>
        <p className="text-[var(--muted)] leading-relaxed mb-4">
          <strong>Why it exists:</strong> Designing high-fidelity superconducting quantum processors requires immense precision. This module automates the manual effort traditionally required to define layouts, constraints, and dependencies.
        </p>
        <p className="text-[var(--muted)] leading-relaxed mb-4">
          <strong>What problems it solves:</strong> It mitigates human error in qubit topology definition, cross-talk minimization, and DRC constraint satisfaction.
        </p>
        <p className="text-[var(--muted)] leading-relaxed">
          <strong>How it fits:</strong> As part of the end-to-end toolchain, it interfaces seamlessly with the QuantumChipGen AI, the QCLang Compiler, and the downstream Physics Analysis pipelines.
        </p>
      </section>

      <hr className="my-10 border-black/10" />

      {/* 2. KEY FEATURES */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-6">2. Key Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 bg-gray-50 border border-black/5 rounded-xl">
            <h4 className="font-bold mb-2">Topology Definitions</h4>
            <p className="text-sm text-[var(--muted)]">Support for Heavy Hex, Grid, and Hexagonal architectures.</p>
          </div>
          <div className="p-5 bg-gray-50 border border-black/5 rounded-xl">
            <h4 className="font-bold mb-2">Constraint Modeling</h4>
            <p className="text-sm text-[var(--muted)]">Automated enforcement of coupling, frequency, and spacing rules.</p>
          </div>
          <div className="p-5 bg-gray-50 border border-black/5 rounded-xl">
            <h4 className="font-bold mb-2">Hardware Validation</h4>
            <p className="text-sm text-[var(--muted)]">Four-domain DRC checking in real-time.</p>
          </div>
          <div className="p-5 bg-gray-50 border border-black/5 rounded-xl">
            <h4 className="font-bold mb-2">Export Compatibility</h4>
            <p className="text-sm text-[var(--muted)]">Direct JSON IR and Qiskit Metal export generation.</p>
          </div>
        </div>
      </section>

      {/* 3. ARCHITECTURE DIAGRAM */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-6">3. Architecture Diagram</h2>
        <div className="p-8 bg-black text-white font-mono text-sm rounded-xl overflow-x-auto whitespace-pre">
          {`Silicofeller Platform -> Networkx Processing Pipeline

[Parser / Intent Analyzer]
       ↓
[AST / Context Graph]
       ↓
[Core Execution Engine: Networkx Processing]
       ↓
[Constraint Resolution / Synthesis]
       ↓
[Routing & Connectivity]
       ↓
[Export Data Model]`}
        </div>
      </section>

      {/* 4. WORKFLOW SECTION */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-6">4. Workflow</h2>
        <p className="text-[var(--muted)] mb-4">The typical execution sequence when interacting with this module:</p>
        <div className="p-6 border-l-4 border-blue-500 bg-blue-50/50 rounded-r-xl">
          <ol className="list-decimal pl-5 space-y-2 text-sm text-[var(--muted)] font-medium">
            <li>Natural Language Prompt (or QCLang Source)</li>
            <li>QuantumChipGen AI Interpretation</li>
            <li>QCLang Generation</li>
            <li>Compiler Execution</li>
            <li>Chip Synthesis & Routing</li>
            <li>Simulation</li>
            <li>Tapeout Export</li>
          </ol>
        </div>
      </section>

      <hr className="my-10 border-black/10" />

      {/* 5. PREREQUISITES */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">5. Prerequisites</h2>
        <ul className="list-disc pl-5 space-y-2 text-[var(--muted)]">
          <li>A valid Silicofeller Quantum Studio account and API key.</li>
          <li>Basic knowledge of QCLang syntax and terminology.</li>
          <li>A newly created or cloned project in the workspace.</li>
          <li>A defined target topology (e.g., `HeavyHex`).</li>
        </ul>
      </section>

      {/* 6. QUICK START */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">6. Quick Start</h2>
        <ol className="list-decimal pl-5 space-y-3 text-[var(--muted)]">
          <li><strong>Create Project:</strong> `silico new project`</li>
          <li><strong>Define Qubits:</strong> Declare your qubit array in the QCLang file.</li>
          <li><strong>Select Topology:</strong> Apply `HeavyHex` or `Grid`.</li>
          <li><strong>Run Synthesis:</strong> Click the "Synthesize" button or run `silico build`.</li>
          <li><strong>Launch Simulation:</strong> Open the Physics Dashboard to verify couplings.</li>
          <li><strong>Export Design:</strong> Generate Qiskit Metal code.</li>
        </ol>
      </section>

      {/* 7. INTERACTIVE EXAMPLES */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-6">7. Interactive Examples</h2>
        
        <div className="mb-8">
          <h3 className="text-xl font-bold mb-3">5-Qubit Heavy Hex</h3>
          <CodeBlock language="qclang" code={`// 5-Qubit Starter Design
project "MyFirstChip" {
  target_topology: HeavyHex(5);
  frequency_target: 5.0GHz;
}

component q1 = Transmon { frequency: 4.8GHz; }
// Routing generated automatically`} />
        </div>

        <div className="mb-8">
          <h3 className="text-xl font-bold mb-3">27-Qubit Heavy Hex</h3>
          <CodeBlock language="qclang" code={`// 27-Qubit IBM Falcon-style architecture
project "Falcon27" {
  target_topology: HeavyHex(27);
  error_correction: surface_code_compatible;
}`} />
        </div>

        <div>
          <h3 className="text-xl font-bold mb-3">127-Qubit Architecture</h3>
          <p className="text-[var(--muted)] mb-3">Large scale generation requires background compilation and batch routing analysis.</p>
        </div>
      </section>

      <hr className="my-10 border-black/10" />

      {/* 8. INPUT SPECIFICATIONS */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">8. Input Specifications</h2>
        <table className="w-full text-left border-collapse border border-black/10 rounded-lg overflow-hidden">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3 px-4 font-semibold border-b border-black/10">Parameter</th>
              <th className="py-3 px-4 font-semibold border-b border-black/10">Type</th>
              <th className="py-3 px-4 font-semibold border-b border-black/10">Description</th>
            </tr>
          </thead>
          <tbody className="text-sm text-[var(--muted)]">
            <tr className="border-b border-black/5 hover:bg-black/5">
              <td className="py-3 px-4 font-mono text-[var(--accent)]">qubit_count</td>
              <td className="py-3 px-4">Integer</td>
              <td className="py-3 px-4">Number of physical qubits (1-433)</td>
            </tr>
            <tr className="border-b border-black/5 hover:bg-black/5">
              <td className="py-3 px-4 font-mono text-[var(--accent)]">topology</td>
              <td className="py-3 px-4">Enum</td>
              <td className="py-3 px-4">HeavyHex, Grid, Hexagonal, Linear</td>
            </tr>
            <tr className="border-b border-black/5 hover:bg-black/5">
              <td className="py-3 px-4 font-mono text-[var(--accent)]">hardware_type</td>
              <td className="py-3 px-4">String</td>
              <td className="py-3 px-4">Currently "Superconducting"</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 9. OUTPUT SPECIFICATIONS */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">9. Output Specifications</h2>
        <p className="text-[var(--muted)] mb-4">The compilation pipeline outputs an Intermediate Representation (IR) JSON containing the full Layout Graph, Placement Map, and Verification Report.</p>
        <CodeBlock language="json" code={`{
  "metadata": {
    "version": "1.0",
    "qubit_count": 27,
    "topology": "HeavyHex"
  },
  "layout_graph": { ... },
  "verification_report": { "drc_passed": true }
}`} />
      </section>

      {/* 10. SUPPORTED CONFIGURATIONS */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">10. Supported Configurations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <h4 className="font-bold mb-2">Topologies</h4>
            <ul className="list-disc pl-5 text-[var(--muted)] space-y-1">
              <li>Heavy Hex</li>
              <li>Grid</li>
              <li>Hexagonal</li>
              <li>Kagome</li>
              <li>Linear</li>
              <li>Star</li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-2">Hardware Types</h4>
            <ul className="list-disc pl-5 text-[var(--muted)] space-y-1">
              <li>Superconducting (Stable)</li>
              <li>Trapped Ion (Alpha)</li>
              <li>Silicon Spin (Alpha)</li>
            </ul>
          </div>
        </div>
      </section>

      <hr className="my-10 border-black/10" />

      {/* 11. API REFERENCE */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">11. API Reference</h2>
        <div className="p-5 border border-black/10 rounded-xl bg-white shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-bold rounded">POST</span>
            <code className="text-sm font-bold">/api/v1/compile</code>
          </div>
          <p className="text-sm text-[var(--muted)] mb-4">Submits a QCLang source file or JSON AST for compilation and synthesis.</p>
          <h4 className="font-bold text-xs uppercase mb-2">Parameters</h4>
          <ul className="list-disc pl-5 text-sm text-[var(--muted)] mb-4">
            <li>`source` (string) - QCLang code block</li>
            <li>`target` (string) - Export target e.g. "qiskit_metal"</li>
          </ul>
          <h4 className="font-bold text-xs uppercase mb-2">Response (200 OK)</h4>
          <p className="text-sm text-[var(--muted)]">Returns the compiled `DesignGraph` object containing the layout.</p>
        </div>
      </section>

      {/* 12. TUTORIALS */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-6">12. Tutorials</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 border border-black/10 rounded-lg">
            <h4 className="font-bold text-green-600 mb-2">Beginner</h4>
            <ul className="text-sm text-[var(--muted)] space-y-1">
              <li>• First Chip</li>
              <li>• First Synthesis</li>
              <li>• First Simulation</li>
            </ul>
          </div>
          <div className="p-4 border border-black/10 rounded-lg">
            <h4 className="font-bold text-blue-600 mb-2">Intermediate</h4>
            <ul className="text-sm text-[var(--muted)] space-y-1">
              <li>• Routing Optimization</li>
              <li>• DRC Verification</li>
            </ul>
          </div>
          <div className="p-4 border border-black/10 rounded-lg">
            <h4 className="font-bold text-purple-600 mb-2">Advanced</h4>
            <ul className="text-sm text-[var(--muted)] space-y-1">
              <li>• Error Correction</li>
              <li>• 433-Qubit Architectures</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 13. USE CASES */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">13. Use Cases</h2>
        <ul className="list-disc pl-5 text-[var(--muted)] space-y-2">
          <li><strong>Research Labs:</strong> Rapid prototyping of novel qubit arrangements before fabrication.</li>
          <li><strong>Quantum Startups:</strong> Skipping the boilerplate of writing manual GDSII and Qiskit Metal Python scripts.</li>
          <li><strong>Hardware Engineers:</strong> Validating crosstalk and frequency collisions in Four-Domain DRC.</li>
          <li><strong>Enterprise R&D:</strong> Standardizing massive 127+ qubit architectures via AI.</li>
        </ul>
      </section>

      {/* 14. BEST PRACTICES */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">14. Best Practices</h2>
        <AlertBox type="info" title="Architecture Best Practices">
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Use Heavy Hex for scalable superconducting architectures to minimize frequency collisions.</li>
            <li>Always validate routing paths before launching electromagnetic simulation.</li>
            <li>Run the full Four-Domain DRC suite before exporting the Tapeout Package.</li>
          </ul>
        </AlertBox>
      </section>

      <hr className="my-10 border-black/10" />

      {/* 15. COMMON ISSUES */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">15. Common Issues & Troubleshooting</h2>
        <div className="space-y-4">
          <div className="p-4 bg-red-50 border border-red-100 rounded-lg">
            <h4 className="font-bold text-red-800">Topology Validation Failures</h4>
            <p className="text-sm text-red-700 mt-1"><strong>Fix:</strong> Ensure the `qubit_count` matches the exact physical requirements of the chosen topology (e.g., HeavyHex requires specific geometric groupings).</p>
          </div>
          <div className="p-4 bg-red-50 border border-red-100 rounded-lg">
            <h4 className="font-bold text-red-800">Routing Failures</h4>
            <p className="text-sm text-red-700 mt-1"><strong>Fix:</strong> If the auto-router fails to find paths, increase the chip footprint or reduce coupling density constraints in the QCLang setup.</p>
          </div>
        </div>
      </section>

      {/* 16. PERFORMANCE METRICS */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">16. Performance Metrics</h2>
        <table className="w-full text-left text-sm border-collapse border border-black/10 rounded-lg overflow-hidden">
          <thead className="bg-gray-50">
            <tr>
              <th className="py-3 px-4 font-semibold border-b border-black/10">Architecture</th>
              <th className="py-3 px-4 font-semibold border-b border-black/10">Compile Time</th>
              <th className="py-3 px-4 font-semibold border-b border-black/10">Routing Time</th>
              <th className="py-3 px-4 font-semibold border-b border-black/10">Export Time</th>
            </tr>
          </thead>
          <tbody className="text-[var(--muted)]">
            <tr className="border-b border-black/5 hover:bg-black/5">
              <td className="py-3 px-4 font-medium">5-Qubit Grid</td>
              <td className="py-3 px-4">&lt; 0.1s</td>
              <td className="py-3 px-4">&lt; 0.2s</td>
              <td className="py-3 px-4">&lt; 0.1s</td>
            </tr>
            <tr className="border-b border-black/5 hover:bg-black/5">
              <td className="py-3 px-4 font-medium">27-Qubit Heavy Hex</td>
              <td className="py-3 px-4">0.3s</td>
              <td className="py-3 px-4">1.2s</td>
              <td className="py-3 px-4">0.5s</td>
            </tr>
            <tr className="border-b border-black/5 hover:bg-black/5">
              <td className="py-3 px-4 font-medium">65-Qubit Heavy Hex</td>
              <td className="py-3 px-4">0.8s</td>
              <td className="py-3 px-4">4.5s</td>
              <td className="py-3 px-4">1.2s</td>
            </tr>
            <tr className="border-b border-black/5 hover:bg-black/5">
              <td className="py-3 px-4 font-medium">127-Qubit Heavy Hex</td>
              <td className="py-3 px-4">1.5s</td>
              <td className="py-3 px-4">12.0s</td>
              <td className="py-3 px-4">2.8s</td>
            </tr>
            <tr className="hover:bg-black/5">
              <td className="py-3 px-4 font-medium">433-Qubit Osprey-class</td>
              <td className="py-3 px-4">4.2s</td>
              <td className="py-3 px-4">48.5s</td>
              <td className="py-3 px-4">8.4s</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 17. INTERACTIVE VISUALIZATIONS */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">17. Interactive Visualizations</h2>
        <p className="text-[var(--muted)] mb-4">To see these features in action, launch the visualizers built into the platform:</p>
        <div className="flex flex-wrap gap-4">
          <Link to="/layout-viewer" className="px-5 py-2 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 font-medium text-sm">
            Topology Explorer
          </Link>
          <button className="px-5 py-2 bg-gray-100 border border-gray-300 rounded-lg hover:bg-gray-200 font-medium text-sm">
            Compiler Pipeline Viewer
          </button>
        </div>
      </section>

      <hr className="my-10 border-black/10" />

      {/* 18. RELATED DOCUMENTATION */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">18. Related Topics</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DocumentationCard title="QCLang Syntax" description="Learn the language constructs." icon="code" href="syntax" />
          <DocumentationCard title="Routing Engine" description="How the connections are drawn." icon="git-branch" href="routing-algorithms" />
        </div>
      </section>

      {/* 19. RELEASE NOTES */}
      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">19. Release Notes</h2>
        <div className="text-sm text-[var(--muted)]">
          <p className="font-bold text-black mb-1">Version 2.4.0</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>New:</strong> 433-qubit topology support added.</li>
            <li><strong>Improvement:</strong> Routing engine parallelization (3x speedup).</li>
            <li><strong>Fix:</strong> Corrected boundary coupling errors in Grid layout.</li>
          </ul>
        </div>
      </section>

    </div>
  );
}
