const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/components/documentation/sections');

const files = {
  'understand-pipeline.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Validation Pipeline</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Silicofeller Pipeline executes a sequential chain of validations. If a check fails, the pipeline halts to prevent compounding errors in later physical analysis.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-x-auto mb-10">
        <pre className="text-sm font-mono text-slate-800">
{\`graph LR
    A[AST Generation] --> B[Graph Validation]
    B --> C{Passed?}
    C -->|Yes| D[Geometry DRC]
    C -->|No| F[Halt & Report]
    D --> E[Fabrication DRC]
    E --> G[Simulation Ready]\`}
        </pre>
      </div>
    </div>
  );
}
`,

  'design-graph.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Design Graph Representation</h1>
      <p className="text-lg text-slate-600 mb-8">
        Under the hood, your schematic is maintained as a strict directed acyclic graph (DAG) where nodes are QComponents and edges are electrical nets.
      </p>

      <h2 className="text-2xl font-bold mb-4">Adjacency Matrix Output</h2>
      <p className="text-slate-600 mb-6">
        You can extract the adjacency matrix for external solver integrations. An entry of '1' indicates a capacitive coupling.
      </p>
      
      <CodeBlock language="json" code={\`{
  "graph_id": "sys_92x3",
  "nodes": ["Q1", "Q2", "B1"],
  "adjacency": [
    [0, 0, 1],
    [0, 0, 1],
    [1, 1, 0]
  ]
}\`} />
    </div>
  );
}
`,

  'validate-connectivity.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Validate Connectivity</h1>
      <p className="text-lg text-slate-600 mb-8">
        Before generating layout meshes, the platform validates all CPW routing and pin snapping.
      </p>

      <AlertBox type="warning" title="Dangling Nets">
        A common failure point is a dangling net—a transmission line connected to a pin on one end, but terminating in open space on the other. 
        Dangling nets create unmodeled parasitic capacitances that will distort your frequency estimates.
      </AlertBox>

      <h2 className="text-2xl font-bold mt-10 mb-4">Validation Criteria</h2>
      <ul className="list-disc pl-5 space-y-2 text-slate-600">
        <li>All \`pin_in\` must map to exactly one \`pin_out\`.</li>
        <li>T-junctions are strictly forbidden unless instantiated through an explicit \`Splitter\` component.</li>
        <li>Readout lines must terminate at a valid launch pad.</li>
      </ul>
    </div>
  );
}
`,

  'invalid-couplings.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Correct Invalid Couplings</h1>
      <p className="text-lg text-slate-600 mb-8">
        Certain components cannot be directly coupled due to underlying physics constraints.
      </p>

      <div className="border border-slate-200 rounded-xl overflow-hidden mb-10">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">Error Code</th>
              <th className="px-6 py-4">Invalid Pair</th>
              <th className="px-6 py-4">Resolution</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            <tr className="bg-white hover:bg-slate-50">
              <td className="px-6 py-4 font-mono text-rose-600">ERR_CP_01</td>
              <td className="px-6 py-4">Qubit → Qubit</td>
              <td className="px-6 py-4">Insert a Tunable Coupler or a CPW bus between them.</td>
            </tr>
            <tr className="bg-white hover:bg-slate-50">
              <td className="px-6 py-4 font-mono text-rose-600">ERR_CP_02</td>
              <td className="px-6 py-4">Resonator → Resonator</td>
              <td className="px-6 py-4">Route to a common feedline instead.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
`,

  'geometry-drc.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Geometry DRC</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Geometry Design Rule Check (DRC) evaluates your schematic against physical overlap and spacing constraints.
      </p>

      <h2 className="text-2xl font-bold mb-4">Core Constraints</h2>
      <ul className="space-y-4 mb-8">
        <li className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <strong className="text-slate-900 block mb-1">Minimum Spacing (S_min)</strong>
          <span className="text-sm text-slate-600">No two uncoupled ground plane cutouts may be closer than 5µm to prevent unexpected parasitic coupling.</span>
        </li>
        <li className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <strong className="text-slate-900 block mb-1">Overlap Exclusion</strong>
          <span className="text-sm text-slate-600">Bounding boxes of QComponents must not overlap unless they are explicitly joined by a pin connection.</span>
        </li>
      </ul>

      <AlertBox type="tip" title="Real-Time Detection">
        Geometry DRC runs in real-time. Overlapping components will be highlighted in red directly on the schematic canvas.
      </AlertBox>
    </div>
  );
}
`,

  'frequency-drc.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Frequency DRC</h1>
      <p className="text-lg text-slate-600 mb-8">
        Frequency Design Rule Checking verifies that your analytical Hamiltonian estimates do not result in frequency crowding.
      </p>

      <h2 className="text-2xl font-bold mb-4">Collision Thresholds</h2>
      <div className="bg-indigo-950 text-indigo-100 p-6 rounded-xl font-mono text-sm mb-10">
        <p className="text-white font-bold mb-2">// Default Collision Rules</p>
        <p>Nearest Neighbor Detuning (Δ_NN) &gt; 100 MHz</p>
        <p>Next-Nearest Neighbor Detuning (Δ_NNN) &gt; 15 MHz</p>
        <p>Readout Resonator Separation &gt; 20 MHz</p>
      </div>

      <p className="text-slate-600">
        If your target parameters violate these thresholds, the pipeline will flag a Severity 2 Frequency Error. You can override these thresholds in the Project Settings if you are testing specialized detuning protocols.
      </p>
    </div>
  );
}
`,

  'fabrication-drc.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Fabrication DRC</h1>
      <p className="text-lg text-slate-600 mb-8">
        Fabrication checks ensure that the geometric polygons generated by the layout engine can actually be manufactured by standard photolithography and e-beam processes.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
        <div className="border border-slate-200 rounded-xl p-5">
          <h3 className="font-bold text-slate-900 mb-2">Minimum Trace Width</h3>
          <p className="text-sm text-slate-600">Checks for polygons thinner than the resolution limit of a standard 193nm stepper (default: 1µm). Anything smaller requires E-beam lithography.</p>
        </div>
        <div className="border border-slate-200 rounded-xl p-5">
          <h3 className="font-bold text-slate-900 mb-2">Acute Angle Checks</h3>
          <p className="text-sm text-slate-600">Flags any polygon vertices with an internal angle &lt; 45°. Acute angles act as acid traps during wet etching processes.</p>
        </div>
      </div>

      <AlertBox type="warning" title="Foundry Variability">
        Different foundries have different capabilities. Ensure you select the correct Foundry Profile in your project settings so the Fabrication DRC applies the correct rule deck.
      </AlertBox>
    </div>
  );
}
`,

  'connectivity-drc.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Connectivity DRC</h1>
      <p className="text-lg text-slate-600 mb-8">
        This is the final phase of the four-domain DRC suite, validating the electrical integrity of the entire chip mask.
      </p>

      <h2 className="text-2xl font-bold mb-4">Ground Plane Integrity</h2>
      <p className="text-slate-600 mb-6">
        The DRC engine computes the topology of the subtracted ground plane. It flags <strong>Ground Plane Islands</strong>—isolated pieces of metallization that are not connected to the main ground, which can cause spurious microwave modes.
      </p>

      <h2 className="text-2xl font-bold mb-4">Wirebond Accessibility</h2>
      <p className="text-slate-600">
        Launch pads are checked to ensure they are on the outer perimeter of the chip boundary, ensuring physical wirebonding is possible during packaging.
      </p>
    </div>
  );
}
`,

  'severity-levels.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Understand Severity Levels</h1>
      <p className="text-lg text-slate-600 mb-8">
        Silicofeller categorizes DRC and validation errors into four distinct severity levels to help you prioritize fixes.
      </p>

      <div className="space-y-4 mb-10">
        <div className="flex items-start gap-4 p-4 border border-slate-200 rounded-lg">
          <div className="w-4 h-4 mt-1 rounded-full bg-slate-400"></div>
          <div>
            <h3 className="font-bold text-slate-900">Level 0: Information</h3>
            <p className="text-sm text-slate-600">Best practice suggestions. Does not block simulation or export.</p>
          </div>
        </div>
        <div className="flex items-start gap-4 p-4 border border-amber-200 bg-amber-50 rounded-lg">
          <div className="w-4 h-4 mt-1 rounded-full bg-amber-500 animate-pulse"></div>
          <div>
            <h3 className="font-bold text-amber-900">Level 1: Warning</h3>
            <p className="text-sm text-amber-800">Potential physics issues (e.g., slight frequency detuning). Allows export but warns the user.</p>
          </div>
        </div>
        <div className="flex items-start gap-4 p-4 border border-orange-200 bg-orange-50 rounded-lg">
          <div className="w-4 h-4 mt-1 rounded-full bg-orange-500"></div>
          <div>
            <h3 className="font-bold text-orange-900">Level 2: Violation</h3>
            <p className="text-sm text-orange-800">Definite rule breaks (e.g., overlapping geometries). Blocks export to GDSII.</p>
          </div>
        </div>
        <div className="flex items-start gap-4 p-4 border border-rose-200 bg-rose-50 rounded-lg">
          <div className="w-4 h-4 mt-1 rounded-full bg-rose-600"></div>
          <div>
            <h3 className="font-bold text-rose-900">Level 3: Fatal</h3>
            <p className="text-sm text-rose-800">Graph corruption or invalid AST logic. Pipeline halts immediately.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
`,

  'target-frequencies.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Target Frequencies</h1>
      <p className="text-lg text-slate-600 mb-8">
        Assigning exact target frequencies is critical for multi-qubit gates.
      </p>

      <h2 className="text-2xl font-bold mb-4">Standard Operating Bands</h2>
      <p className="text-slate-600 mb-6">
        Most superconducting transmons operate between 4.0 GHz and 6.0 GHz. Above 6.0 GHz, you risk hitting the readout resonator bands. Below 4.0 GHz, thermal noise at 15mK becomes a dominating decoherence factor.
      </p>

      <AlertBox type="info" title="Iterative Simulation">
        Remember that the analytical frequencies provided in the UI are estimates based on standard junction parameters. True $f_{01}$ frequencies must be verified using the Energy Participation Ratio (EPR) method in the Physics Analysis simulation.
      </AlertBox>
    </div>
  );
}
`
};

Object.keys(files).forEach(file => {
  fs.writeFileSync(path.join(dir, file), files[file], 'utf8');
});
console.log('Batch 2A complete');
