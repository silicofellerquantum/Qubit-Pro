const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/components/documentation/sections');

const files = {
  'frequency-collisions.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Frequency Collisions</h1>
      <p className="text-lg text-slate-600 mb-8">
        Avoiding frequency collisions is the hardest part of fixed-frequency transmon design.
      </p>

      <h2 className="text-2xl font-bold mb-4">Collision Types</h2>
      <ul className="list-disc pl-5 space-y-4 text-slate-600 mb-10">
        <li>
          <strong>Type 1 (Fundamental Collision):</strong> $|f_{Q1} - f_{Q2}| < 10\\text{ MHz}$. 
          Two neighboring qubits have nearly identical frequencies. Static ZZ interaction dominates.
        </li>
        <li>
          <strong>Type 2 (Cross-Resonance Spectator):</strong> $|f_{Q1} - f_{Q3}| < 15\\text{ MHz}$ where Q1 and Q3 share a neighbor Q2. 
          Driving Q2 to interact with Q1 accidentally drives Q3.
        </li>
        <li>
          <strong>Type 3 (Anharmonicity Collision):</strong> $f_{Q1} \\approx f_{Q2} + \\alpha_{Q2}$.
          The 0-1 transition of Q1 matches the 1-2 transition of Q2, causing leakage into the $|2\\rangle$ state.
        </li>
      </ul>

      <AlertBox type="warning" title="Laser Annealing">
        If you manufacture a chip and discover a Type 1 collision, you can use post-fabrication laser annealing to shift the junction resistance, lowering the frequency.
      </AlertBox>
    </div>
  );
}
`,

  'resonator-planning.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Resonator Multiplexing</h1>
      <p className="text-lg text-slate-600 mb-8">
        To reduce cryogenic wiring limits, multiple readout resonators are coupled to a single feedline.
      </p>

      <div className="overflow-hidden rounded-xl border border-slate-200 mb-10">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4">Multiplex Group</th>
              <th className="px-6 py-4">Resonator Q1</th>
              <th className="px-6 py-4">Resonator Q2</th>
              <th className="px-6 py-4">Resonator Q3</th>
              <th className="px-6 py-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr>
              <td className="px-6 py-4 font-mono font-bold">Line A</td>
              <td className="px-6 py-4">6.12 GHz</td>
              <td className="px-6 py-4">6.25 GHz</td>
              <td className="px-6 py-4">6.38 GHz</td>
              <td className="px-6 py-4 text-emerald-600 font-bold">Good separation</td>
            </tr>
            <tr>
              <td className="px-6 py-4 font-mono font-bold">Line B</td>
              <td className="px-6 py-4">7.05 GHz</td>
              <td className="px-6 py-4 text-rose-600">7.08 GHz</td>
              <td className="px-6 py-4 text-rose-600">7.11 GHz</td>
              <td className="px-6 py-4 text-rose-600 font-bold">Purcell Overlap</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-slate-600">Ensure at least 50 MHz separation between resonators on the same feedline to prevent Purcell filter overlap.</p>
    </div>
  );
}
`,

  'transmon-properties.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Transmon Properties</h1>
      <p className="text-lg text-slate-600 mb-8">
        Analytical estimates for Relaxation ($T_1$) and Dephasing ($T_2$) times.
      </p>

      <div className="bg-slate-50 p-8 rounded-xl border border-slate-200 font-serif text-lg text-center mb-10 shadow-inner">
        <p className="mb-4">$\\frac{1}{T_1} = \\sum_{i} \\frac{p_i \\tan(\\delta_i)}{\\omega_{01}}$</p>
        <p>$\\frac{1}{T_2^*} = \\frac{1}{2T_1} + \\frac{1}{T_\\phi}$</p>
      </div>

      <p className="text-slate-600 mb-4">
        Where $p_i$ is the participation ratio of dielectric region $i$, and $\\tan(\\delta_i)$ is its loss tangent.
      </p>
    </div>
  );
}
`,

  'coherence-analysis.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Coherence Analysis (EPR)</h1>
      <p className="text-lg text-slate-600 mb-8">
        Energy Participation Ratio (EPR) analysis quantifies how much of the quantum zero-point energy is stored in dissipative elements.
      </p>

      <h2 className="text-2xl font-bold mb-4">Dielectric Participation</h2>
      <p className="text-slate-600 mb-6">
        Most TLS (Two-Level System) loss occurs at the interfaces: Substrate-Air (SA), Metal-Air (MA), and Metal-Substrate (MS).
      </p>

      <AlertBox type="tip" title="Optimization">
        Increasing the gap spacing of the transmon pads pushes the electric field deeper into the bulk substrate, reducing the highly-lossy SA and MS interface participation.
      </AlertBox>
    </div>
  );
}
`,

  'anharmonicity.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Anharmonicity ($\\alpha$)</h1>
      <p className="text-lg text-slate-600 mb-8">
        Anharmonicity determines how fast you can drive a qubit without leaking into higher energy states.
      </p>

      <div className="bg-slate-900 text-white p-8 rounded-xl text-center mb-10 shadow-lg">
        <h3 className="text-indigo-300 font-bold mb-2">Fundamental Equation</h3>
        <p className="text-2xl font-serif">$\\alpha = f_{12} - f_{01} \\approx -E_C$</p>
      </div>

      <p className="text-slate-600">
        In standard transmons, $\\alpha$ is strictly negative and roughly equal to the charging energy $E_C$. Typical values range from -300 MHz to -200 MHz.
      </p>
    </div>
  );
}
`,

  'gate-fidelity.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Gate Fidelity Predictions</h1>
      <p className="text-lg text-slate-600 mb-8">
        Simulate the expected fidelity of single-qubit and two-qubit (Cross-Resonance) gates based on your derived Hamiltonian.
      </p>

      <AlertBox type="info" title="Cross-Resonance Limitations">
        CR gates require a strong static coupling ($J$) but suffer from unwanted $ZX$ interactions if the detuning $\\Delta$ is too small. Silicofeller calculates the effective CR drive strength and projects the 2Q gate error.
      </AlertBox>
    </div>
  );
}
`,

  'create-simulation.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Create a Simulation Task</h1>
      <p className="text-lg text-slate-600 mb-8">
        Heavy physics simulations are offloaded to our cloud compute cluster. Submit jobs via the UI or the REST API.
      </p>

      <h2 className="text-2xl font-bold mb-4">API Submission</h2>
      <CodeBlock language="bash" code={\`curl -X POST https://api.silicofeller.com/v1/simulations \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "project_id": "proj_99xx",
    "solver": "LOM",
    "mesh_resolution": "fine"
  }'\`} />
    </div>
  );
}
`,

  'run-analytical.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Lumped Oscillator Model (LOM)</h1>
      <p className="text-lg text-slate-600 mb-8">
        The LOM solver extracts the Maxwell capacitance matrix from the layout and computes the corresponding eigenfrequencies.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-x-auto mb-10">
        <pre className="text-sm font-mono text-slate-800">
{\`graph TD
    A[GDSII Layout] --> B[Q3D Extractor]
    B --> C[Maxwell Capacitance Matrix (C_max)]
    C --> D[LOM Solver]
    D --> E[f_01, E_C, g_ij]
\`}
        </pre>
      </div>
    </div>
  );
}
`,

  'palace-adapter.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">AWS Palace Adapter</h1>
      <p className="text-lg text-slate-600 mb-8">
        Silicofeller integrates natively with AWS Palace, an open-source parallel finite element solver for computational electromagnetics.
      </p>

      <h2 className="text-2xl font-bold mb-4">Configuration</h2>
      <p className="text-slate-600">
        When triggering a Palace simulation, the platform automatically generates the JSON configuration file (\`palace_config.json\`) and submits the mesh to an ephemeral EC2 cluster.
      </p>
    </div>
  );
}
`,

  'review-simulation.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Review Simulation Results</h1>
      <p className="text-lg text-slate-600 mb-8">
        Once your Palace or LOM simulation completes, navigate to the Reports tab to view the results.
      </p>

      <AlertBox type="info" title="S-Parameter Plots">
        For feedlines and resonators, check the S21 magnitude plots to ensure there are no spurious box modes coupling to your transmission lines at your operating frequencies.
      </AlertBox>
    </div>
  );
}
`
};

Object.keys(files).forEach(file => {
  fs.writeFileSync(path.join(dir, file), files[file], 'utf8');
});
console.log('Batch 2B complete');
