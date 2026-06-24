const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/components/documentation/sections');

const files = {
  'quick-start.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content">
      <h1 className="text-4xl font-extrabold mb-6">Quick Start</h1>
      <p className="text-lg text-[var(--muted)] mb-8">
        Get up and running with Silicofeller Quantum Studio in under five minutes.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="p-6 border border-slate-200 rounded-xl bg-slate-50">
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold mb-4">1</div>
          <h3 className="font-bold text-slate-900 mb-2">Install CLI</h3>
          <p className="text-sm text-slate-600">Download the Silicofeller command-line tool.</p>
        </div>
        <div className="p-6 border border-slate-200 rounded-xl bg-slate-50">
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold mb-4">2</div>
          <h3 className="font-bold text-slate-900 mb-2">Authenticate</h3>
          <p className="text-sm text-slate-600">Link your local environment to your Studio account.</p>
        </div>
        <div className="p-6 border border-slate-200 rounded-xl bg-slate-50">
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold mb-4">3</div>
          <h3 className="font-bold text-slate-900 mb-2">Initialize</h3>
          <p className="text-sm text-slate-600">Bootstrap a new quantum layout repository.</p>
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-4">Local Environment Setup</h2>
      <CodeBlock language="bash" code={\`# Install globally via npm
npm install -g silicofeller-cli

# Authenticate with your API key
silico auth login

# Initialize your first layout project
silico init my-first-chip\`} />

      <AlertBox type="info" title="Node.js Requirement" className="mt-8">
        Ensure you are running Node.js version 18.0.0 or higher to avoid WebAssembly compilation errors during local DRC simulation.
      </AlertBox>
    </div>
  );
}
`,

  'create-first-project.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content">
      <h1 className="text-4xl font-extrabold mb-4">Create Your First Project</h1>
      <p className="text-lg text-slate-600 mb-8">
        A Project in Silicofeller acts as an isolated workspace container for your AST files, schematics, and simulation reports.
      </p>

      <div className="bg-slate-900 p-8 rounded-2xl mb-10 shadow-lg">
        <h3 className="text-white font-medium mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
          Workspace Provisioning Engine
        </h3>
        <p className="text-slate-400 text-sm mb-6">
          When you create a project, our backend provisions a dedicated PostgreSQL schema and initializes a version-controlled graph database for your components.
        </p>
        <img src="/assets/screens/schematic-editor-overview.webp" alt="Workspace Initialization" className="w-full rounded-xl border border-slate-700 opacity-90" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      </div>

      <h2 className="text-2xl font-bold mb-4">API Provisioning</h2>
      <p className="mb-4 text-slate-600">Instead of the UI, you can programmatically create projects via the REST interface.</p>
      
      <CodeBlock language="bash" code={\`curl -X POST https://api.silicofeller.com/v1/projects \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Falcon Prototype",
    "description": "27-qubit exploratory layout",
    "target_foundry": "IBM Quantum"
  }'\`} />

      <AlertBox type="tip" title="Naming Conventions" className="mt-8">
        We recommend using semantic versioning in your project descriptions to keep track of iterative topology changes.
      </AlertBox>
    </div>
  );
}
`,

  'choose-topology.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Choose a Topology</h1>
      <p className="text-lg text-slate-600 mb-8">
        The topology dictates the physical connectivity graph of your qubits. Selecting the correct arrangement is crucial for balancing error correction capabilities against cross-talk mitigation.
      </p>

      <h2 className="text-2xl font-bold mb-4">Architectural Comparison</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200 mb-10">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-900">
            <tr>
              <th className="px-6 py-4 font-semibold">Topology</th>
              <th className="px-6 py-4 font-semibold">Average Degree</th>
              <th className="px-6 py-4 font-semibold">Primary Use Case</th>
              <th className="px-6 py-4 font-semibold">Cross-talk Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr className="hover:bg-slate-50/50">
              <td className="px-6 py-4 font-medium text-slate-900">Heavy Hex</td>
              <td className="px-6 py-4 font-mono text-xs text-indigo-600">2.6</td>
              <td className="px-6 py-4 text-slate-600">Scalable Error Mitigation</td>
              <td className="px-6 py-4 text-emerald-600">Low</td>
            </tr>
            <tr className="hover:bg-slate-50/50">
              <td className="px-6 py-4 font-medium text-slate-900">Square Grid</td>
              <td className="px-6 py-4 font-mono text-xs text-indigo-600">4.0</td>
              <td className="px-6 py-4 text-slate-600">Surface Code Algorithms</td>
              <td className="px-6 py-4 text-rose-600">High</td>
            </tr>
            <tr className="hover:bg-slate-50/50">
              <td className="px-6 py-4 font-medium text-slate-900">Linear Chain</td>
              <td className="px-6 py-4 font-mono text-xs text-indigo-600">2.0</td>
              <td className="px-6 py-4 text-slate-600">Hardware Prototyping</td>
              <td className="px-6 py-4 text-emerald-600">Very Low</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 className="text-2xl font-bold mb-4">Graph Generation Algorithm</h2>
      <p className="text-slate-600 mb-6">
        Silicofeller uses a proprietary tessellation algorithm to generate Heavy Hex layouts. Given a target depth $D$, the algorithm constructs $D$ concentric hexagonal layers, interspersing ancilla qubits on the edges to reduce the connectivity degree.
      </p>
      
      <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl font-mono text-sm text-slate-800">
        <p className="text-indigo-600 font-bold mb-2">Algorithm: generateHeavyHex(n)</p>
        <p className="pl-4 border-l-2 border-indigo-200">
          1. Initialize empty Graph G<br/>
          2. While |V(G)| &lt; n:<br/>
          &nbsp;&nbsp;&nbsp;&nbsp;a. Add central face F<br/>
          &nbsp;&nbsp;&nbsp;&nbsp;b. For each edge E in F: insert intermediate Q_ancilla<br/>
          3. Prune dangling edges to maintain symmetry<br/>
          4. Return G
        </p>
      </div>
    </div>
  );
}
`,

  'choose-materials.tsx': `import React from "react";
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
      <CodeBlock language="json" code={\`{
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
}\`} />
    </div>
  );
}
`,

  'changelog.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-3xl">
      <h1 className="text-4xl font-extrabold mb-2">Changelog</h1>
      <p className="text-lg text-slate-600 mb-12">Track all major updates, bug fixes, and new features.</p>

      <div className="relative border-l-2 border-indigo-100 pl-8 pb-12 space-y-12 ml-4">
        
        {/* Version 2.4.0 */}
        <div className="relative">
          <div className="absolute -left-[41px] top-1 w-5 h-5 rounded-full bg-indigo-500 ring-4 ring-white" />
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <h2 className="text-2xl font-bold text-slate-900">v2.4.0</h2>
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider rounded-full">Current Release</span>
            <span className="text-sm text-slate-500 font-medium">May 15, 2026</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
            <h4 className="font-bold text-slate-900 mb-3">Added</h4>
            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600 mb-6">
              <li>Support for 433-qubit Osprey-class Heavy Hex topologies.</li>
              <li>Four-domain DRC now includes kinetic inductance rule checking.</li>
              <li>New Export target: Direct conversion to Ansys HFSS via DXF layering.</li>
            </ul>
            <h4 className="font-bold text-slate-900 mb-3">Fixed</h4>
            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
              <li>Resolved routing crossover overlaps in high-density grid layouts.</li>
              <li>Fixed JWT token expiration bugs in the REST API.</li>
            </ul>
          </div>
        </div>

        {/* Version 2.3.0 */}
        <div className="relative">
          <div className="absolute -left-[41px] top-1 w-5 h-5 rounded-full bg-slate-300 ring-4 ring-white" />
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <h2 className="text-2xl font-bold text-slate-900">v2.3.0</h2>
            <span className="text-sm text-slate-500 font-medium">April 2, 2026</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h4 className="font-bold text-slate-900 mb-3">Added</h4>
            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
              <li>Design Copilot introduced for natural language generation.</li>
              <li>Interactive topology 3D viewer.</li>
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
`,

  'latest-release.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Latest Release Details</h1>
      <p className="text-lg text-slate-600 mb-8">
        Deep dive into the architecture changes introduced in v2.4.0.
      </p>

      <AlertBox type="info" title="Platform Rollout">
        This release is currently being rolled out to Enterprise tenants. Community edition users will receive this update on June 1st.
      </AlertBox>

      <h2 className="text-2xl font-bold mt-10 mb-6">Feature Breakdown</h2>
      
      <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-10 overflow-x-auto">
        {/* We use standard markdown pre for Mermaid support in the UI if implemented, or just a code block simulating it */}
        <pre className="text-sm font-mono text-slate-800">
{\`pie title Release v2.4.0 Focus Areas
    "433-Qubit Topology Engine" : 45
    "DRC Enhancement" : 25
    "Export Targets (Ansys)" : 20
    "Bug Fixes" : 10\`}
        </pre>
      </div>

      <h3 className="text-xl font-bold mb-4">433-Qubit Osprey Support</h3>
      <p className="text-slate-600 mb-4">
        Scaling beyond 127 qubits required a complete rewrite of our A* routing heuristic. The new parallelized routing engine calculates non-intersecting meandering feedlines for 433-qubit layouts in under 48 seconds.
      </p>

    </div>
  );
}
`,

  'projects-api.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content">
      <h1 className="text-4xl font-extrabold mb-6">Projects API</h1>
      <p className="text-lg text-slate-600 mb-10">
        Manage the lifecycle of your workspace environments programmatically.
      </p>

      <div className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <span className="bg-emerald-100 text-emerald-800 font-bold px-3 py-1 rounded-md text-sm">GET</span>
          <code className="text-lg font-bold text-slate-800">/v1/projects</code>
        </div>
        <p className="text-slate-600 mb-6">Retrieves a paginated list of all projects accessible by your API key.</p>
        
        <h4 className="font-bold text-slate-900 mb-3 border-b pb-2">Query Parameters</h4>
        <table className="w-full text-left text-sm mb-6 border-collapse">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="p-3 border-b">Parameter</th>
              <th className="p-3 border-b">Type</th>
              <th className="p-3 border-b">Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-3 border-b font-mono text-indigo-600">limit</td>
              <td className="p-3 border-b">integer</td>
              <td className="p-3 border-b">Maximum items to return. Default: 50.</td>
            </tr>
            <tr>
              <td className="p-3 border-b font-mono text-indigo-600">offset</td>
              <td className="p-3 border-b">integer</td>
              <td className="p-3 border-b">Pagination offset.</td>
            </tr>
          </tbody>
        </table>

        <h4 className="font-bold text-slate-900 mb-3">Python Example</h4>
        <CodeBlock language="python" code={\`import requests

url = "https://api.silicofeller.com/v1/projects?limit=10"
headers = {"Authorization": "Bearer sk_test_12345"}

response = requests.get(url, headers=headers)
print(response.json())\`} />
      </div>

    </div>
  );
}
`
};

Object.keys(files).forEach(file => {
  fs.writeFileSync(path.join(dir, file), files[file], 'utf8');
});
console.log('Batch 1A complete');
