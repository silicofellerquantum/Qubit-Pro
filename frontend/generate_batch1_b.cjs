const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/components/documentation/sections');

const files = {
  'design-prompts.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content">
      <h1 className="text-4xl font-extrabold mb-6">Write Effective Design Prompts</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Design Copilot transforms natural language into robust QCLang syntax. Writing precise prompts ensures accurate topology mapping.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="border border-emerald-200 bg-emerald-50 rounded-xl p-6">
          <h3 className="font-bold text-emerald-800 mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 flex justify-center items-center text-xs">✓</span> Do
          </h3>
          <ul className="list-disc pl-5 text-emerald-900 text-sm space-y-2">
            <li>Specify exact qubit counts (e.g., "16 qubits").</li>
            <li>Explicitly name the topology ("Heavy Hex").</li>
            <li>Mention frequency targets if critical.</li>
          </ul>
        </div>
        <div className="border border-rose-200 bg-rose-50 rounded-xl p-6">
          <h3 className="font-bold text-rose-800 mb-4 flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-rose-200 text-rose-800 flex justify-center items-center text-xs">✗</span> Don't
          </h3>
          <ul className="list-disc pl-5 text-rose-900 text-sm space-y-2">
            <li>Use ambiguous terms ("Make a large chip").</li>
            <li>Request topologies that aren't mathematically possible (e.g., "7-qubit square grid").</li>
          </ul>
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-4">Example Prompt</h2>
      <CodeBlock language="text" code={'Generate a 27-qubit Heavy Hex layout optimized for 5GHz frequency with sapphire substrate overrides.'} />
      
      <AlertBox type="tip" className="mt-8" title="Iterative Refinement">
        If the Copilot hallucinates a connection, simply prompt it again with "Remove the coupler between Q1 and Q5." It maintains conversational context.
      </AlertBox>
    </div>
  );
}
`,

  'ai-workflow.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">AI Generation Workflow</h1>
      <p className="text-lg text-slate-600 mb-8">
        Understand the data transformation pipeline from your initial prompt down to the rendered graphical layout.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-x-auto mb-10">
        <pre className="text-sm font-mono text-slate-800">
{\`graph TD
    A[Natural Language Prompt] -->|NLP Engine| B(Intent Extraction)
    B --> C{Topology Match?}
    C -->|Yes| D[QCLang Generation]
    C -->|No| E[Prompt for Clarification]
    D --> F[AST Compilation]
    F --> G[Layout Synthesis]
    G --> H[Interactive Schematic Viewer]\`}
        </pre>
      </div>

      <h2 className="text-2xl font-bold mb-4">Intermediate Abstract Syntax Tree (AST)</h2>
      <p className="text-slate-600">
        Between the NLP phase and the visual layout, the system generates a JSON AST representing the design graph. You can inspect this AST directly using the Developer Tools panel.
      </p>
    </div>
  );
}
`,

  'review-topology.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content">
      <h1 className="text-4xl font-extrabold mb-6">Review Generated Topology</h1>
      <p className="text-lg text-slate-600 mb-8">
        Once the Copilot synthesizes a design, you must review the logical connectivity matrix before proceeding to physics analysis.
      </p>

      <div className="flex flex-col md:flex-row gap-8 mb-10 items-start">
        <div className="flex-1 text-slate-600 space-y-4">
          <p>
            The topology viewer renders qubits as nodes and couplers as edges. 
            Hovering over an edge reveals its computed coupling strength (g-rate).
          </p>
          <ul className="list-decimal pl-5 space-y-2">
            <li>Check for isolated qubits (nodes with 0 edges).</li>
            <li>Verify max degree constraints (e.g., degree &gt; 4 usually causes crowding).</li>
            <li>Ensure symmetric placement if required by your error-correcting code.</li>
          </ul>
        </div>
        <div className="flex-1 bg-slate-900 rounded-xl p-6 w-full flex items-center justify-center min-h-[200px]">
          {/* Simple abstract node graph representation */}
          <div className="relative w-32 h-32">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-indigo-500 border-2 border-white shadow-lg flex items-center justify-center text-xs text-white font-bold">Q0</div>
            <div className="absolute bottom-0 left-0 w-8 h-8 rounded-full bg-indigo-500 border-2 border-white shadow-lg flex items-center justify-center text-xs text-white font-bold">Q1</div>
            <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-indigo-500 border-2 border-white shadow-lg flex items-center justify-center text-xs text-white font-bold">Q2</div>
            <div className="absolute top-4 left-1/2 bottom-4 w-0.5 bg-slate-600 -z-10 rotate-45 origin-top-left"></div>
            <div className="absolute top-4 right-1/2 bottom-4 w-0.5 bg-slate-600 -z-10 -rotate-45 origin-top-right"></div>
            <div className="absolute bottom-4 left-4 right-4 h-0.5 bg-slate-600 -z-10"></div>
          </div>
        </div>
      </div>

      <AlertBox type="warning" title="Manual Overrides">
        Any manual deletions of edges in the Topology Viewer will automatically sync back to your QCLang source code, permanently modifying the AST.
      </AlertBox>
    </div>
  );
}
`,

  'review-placement.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content">
      <h1 className="text-4xl font-extrabold mb-6">Review Placement & Frequencies</h1>
      <p className="text-lg text-slate-600 mb-8">
        Physical placement and frequency assignments are the leading causes of coherent errors (cross-resonance collisions, spectator errors).
      </p>

      <h2 className="text-2xl font-bold mb-4">Collision Matrices</h2>
      <p className="text-slate-600 mb-6">
        Silicofeller automatically generates a detuning matrix for all nearest-neighbor (NN) and next-nearest-neighbor (NNN) pairs.
      </p>

      <div className="overflow-hidden rounded-xl border border-slate-200 mb-10">
        <table className="w-full text-center text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="p-3">Pair</th>
              <th className="p-3">Target Detuning (Δ)</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr>
              <td className="p-3 font-mono">Q1-Q2</td>
              <td className="p-3">150 MHz</td>
              <td className="p-3 text-emerald-600 font-bold">Pass</td>
            </tr>
            <tr>
              <td className="p-3 font-mono">Q2-Q3</td>
              <td className="p-3">20 MHz</td>
              <td className="p-3 text-rose-600 font-bold">Collision Risk</td>
            </tr>
          </tbody>
        </table>
      </div>

      <AlertBox type="info" title="Mitigation Strategy">
        If a collision risk is detected, navigate back to the schematic and manually tweak the geometric padding of the Transmon capacitor pads to adjust the resonant frequency.
      </AlertBox>
    </div>
  );
}
`,

  'topology-explorer.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Topology Explorer</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Topology Explorer is a sandbox utility for rendering massive graph structures before committing to schematic layout and physical routing.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {["Heavy Hex", "Square Grid", "Octagonal", "Linear Chain", "Star", "Kagome", "Ring", "Custom"].map(preset => (
          <div key={preset} className="border border-slate-200 rounded-lg p-4 text-center hover:bg-indigo-50 hover:border-indigo-200 transition-colors cursor-pointer group">
            <span className="font-semibold text-slate-700 group-hover:text-indigo-700">{preset}</span>
          </div>
        ))}
      </div>

      <h2 className="text-2xl font-bold mb-4">Exporting Graphs</h2>
      <p className="text-slate-600">
        You can export the pure mathematical graph structure as a NetworkX JSON payload directly from the Explorer, which is useful for offline algorithmic research.
      </p>
    </div>
  );
}
`,

  'grid.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Grid & Surface Code Layouts</h1>
      <p className="text-lg text-slate-600 mb-8">
        Square grids are the foundation of standard surface code error correction. Every data qubit is connected to 4 measure qubits, and vice versa.
      </p>

      <h2 className="text-2xl font-bold mb-4">Distance Scaling</h2>
      <p className="text-slate-600 mb-4">
        A surface code of distance $d$ requires exactly $2d^2 - 1$ physical qubits.
      </p>
      
      <ul className="list-disc pl-5 mb-8 text-slate-600 space-y-2">
        <li><strong>d=3:</strong> 17 physical qubits (9 data, 8 measure)</li>
        <li><strong>d=5:</strong> 49 physical qubits (25 data, 24 measure)</li>
        <li><strong>d=7:</strong> 97 physical qubits (49 data, 48 measure)</li>
      </ul>

      <h2 className="text-2xl font-bold mb-4">Generation Snippet</h2>
      <CodeBlock language="qclang" code={\`// Generate a d=5 Surface Code Grid
topology "SurfaceGrid" {
  type: grid;
  dimensions: 7x7; // Accounts for boundaries
  qubit_count: 49;
  routing_algorithm: manhattan_astar;
}\`} />
    </div>
  );
}
`,

  'heavy-hex.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Heavy-Hex Layouts</h1>
      <p className="text-lg text-slate-600 mb-8">
        Pioneered by IBM Quantum, the heavy-hex lattice reduces the average graph degree to ~2.6, significantly minimizing frequency collisions and cross-resonance spectator errors.
      </p>

      <div className="bg-indigo-950 p-6 rounded-xl mb-10 text-center text-white">
        <h3 className="text-indigo-200 font-medium mb-2">Cross-Talk Profile</h3>
        <p className="text-4xl font-bold mb-1">~65% Reduction</p>
        <p className="text-sm opacity-75">in spectator errors compared to Square Grid.</p>
      </div>

      <h2 className="text-2xl font-bold mb-4">Color Codes vs Surface Codes</h2>
      <p className="text-slate-600 mb-6">
        Heavy hex lattices are traditionally evaluated using subsystem codes or specialized heavy-hexagon codes rather than standard surface codes, altering the logical-to-physical qubit ratio.
      </p>

      <AlertBox type="info" title="Compatibility">
        Silicofeller's physical routing engine includes specialized meandering algorithms designed specifically to avoid edge-crossing in non-planar heavy-hex translations.
      </AlertBox>
    </div>
  );
}
`,

  'linear.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Linear & Ring Layouts</h1>
      <p className="text-lg text-slate-600 mb-8">
        Linear chains are primarily used for small-scale physical prototyping, academic studies on 1D spin chains, and calibration baselines.
      </p>

      <h2 className="text-2xl font-bold mb-4">Characteristics</h2>
      <p className="text-slate-600 mb-6">
        Degree is uniformly 2 (except for endpoints). Cross-talk is practically non-existent, but logical error correction is impossible.
      </p>

      <h2 className="text-2xl font-bold mb-4">Ring Topology</h2>
      <p className="text-slate-600 mb-4">
        Connecting the ends of a linear chain produces a Ring, restoring translation symmetry.
      </p>

      <CodeBlock language="qclang" code={\`// Generate a 12-qubit ring
topology "Ring12" {
  type: linear;
  qubit_count: 12;
  close_loop: true;
}\`} />
    </div>
  );
}
`
};

Object.keys(files).forEach(file => {
  fs.writeFileSync(path.join(dir, file), files[file], 'utf8');
});
console.log('Batch 1B complete');
