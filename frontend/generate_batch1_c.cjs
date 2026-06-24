const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/components/documentation/sections');

const files = {
  'chip-composer.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Schematic Editor Overview</h1>
      <p className="text-lg text-slate-600 mb-8">
        The WebGL-accelerated Schematic Editor is the core visual workspace where quantum logic maps to physical geometries.
      </p>

      <div className="bg-slate-900 rounded-xl p-2 mb-10 shadow-lg">
        <img src="/assets/screens/schematic-editor-overview.webp" alt="Schematic Editor" className="w-full rounded-lg opacity-90" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      </div>

      <h2 className="text-2xl font-bold mb-4">Coordinate System</h2>
      <p className="text-slate-600">
        The editor operates on an infinite Cartesian plane. 1 unit = 1 micrometer (µm) by default. The grid snapping resolution can be toggled down to 0.1 µm for precision placement.
      </p>
    </div>
  );
}
`,

  'placement-tools.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Placing Components</h1>
      <p className="text-lg text-slate-600 mb-8">
        Components can be dragged from the Library panel or instantiated via the QCLang command prompt.
      </p>

      <div className="space-y-6 mb-10">
        <div className="flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center">1</div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">Select</h3>
            <p className="text-slate-600">Click a component in the left sidebar library.</p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center">2</div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">Position</h3>
            <p className="text-slate-600">Move your cursor onto the canvas. The component will shadow your cursor.</p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center">3</div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">Drop & Snap</h3>
            <p className="text-slate-600">Click to place. Holding SHIFT disables grid snapping.</p>
          </div>
        </div>
      </div>

      <AlertBox type="tip" title="Auto-Padding">
        When placing qubits near each other, the editor automatically calculates required keep-out zones to prevent DRC spacing violations.
      </AlertBox>
    </div>
  );
}
`,

  'routing-tools.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Routing Coplanar Waveguides</h1>
      <p className="text-lg text-slate-600 mb-8">
        Silicofeller provides an intelligent CPW (Coplanar Waveguide) router that generates meandering paths to hit specific electrical lengths.
      </p>

      <h2 className="text-2xl font-bold mb-4">Meander Algorithm</h2>
      <p className="text-slate-600 mb-6">
        When you connect two pins, the router evaluates the required resonator frequency, calculates the target physical length (accounting for effective dielectric constant), and generates a meander.
      </p>

      <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl font-mono text-sm text-slate-800 mb-10">
        <p className="text-indigo-600 font-bold mb-2">Constraint Logic:</p>
        <p>L_target = c / (2 * f_res * sqrt(e_eff))</p>
        <p>If L_euclidean &lt; L_target:</p>
        <p className="pl-4">Generate N meander turns where N * turn_length ≈ L_target - L_euclidean</p>
      </div>

      <h2 className="text-2xl font-bold mb-4">Manual Routing</h2>
      <CodeBlock language="qclang" code={\`// Override auto-router with specific waypoints
route(Q1.pin_east, Res1.pin_in) {
  waypoints: [(100, 0), (100, 50), (200, 50)];
  meander_asymmetry: 0.1;
}\`} />
    </div>
  );
}
`,

  'properties-panel.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Properties Inspector</h1>
      <p className="text-lg text-slate-600 mb-8">
        Selecting any component on the canvas populates the right-hand Properties panel with editable parametrics.
      </p>

      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        <div className="border-t border-slate-200 pt-4">
          <dt className="font-bold text-slate-900 mb-1">Geometry Parameters</dt>
          <dd className="text-sm text-slate-600">Pad width, gap spacing, fillet radius. Directly affects capacitance matrix.</dd>
        </div>
        <div className="border-t border-slate-200 pt-4">
          <dt className="font-bold text-slate-900 mb-1">Electrical Parameters</dt>
          <dd className="text-sm text-slate-600">Target frequency (GHz), Anharmonicity (MHz). Driving inputs for the synthesis engine.</dd>
        </div>
        <div className="border-t border-slate-200 pt-4">
          <dt className="font-bold text-slate-900 mb-1">Mesh Overrides</dt>
          <dd className="text-sm text-slate-600">Maximum element size for HFSS/Palace exports. Use finer meshes near junctions.</dd>
        </div>
        <div className="border-t border-slate-200 pt-4">
          <dt className="font-bold text-slate-900 mb-1">Material Overrides</dt>
          <dd className="text-sm text-slate-600">Local overrides for dielectric or metallization layers per component.</dd>
        </div>
      </dl>
    </div>
  );
}
`,

  'keyboard-shortcuts.tsx': `import React from "react";

export default function Section() {
  const shortcuts = [
    { key: "V", action: "Select Tool" },
    { key: "W", action: "Wire / Route Tool" },
    { key: "R", action: "Rotate component 90°" },
    { key: "F", action: "Flip horizontally" },
    { key: "Ctrl + Z", action: "Undo" },
    { key: "Ctrl + Shift + Z", action: "Redo" },
    { key: "Space + Drag", action: "Pan canvas" },
    { key: "Shift + Click", action: "Multi-select" },
    { key: "[ / ]", action: "Decrease / Increase grid size" },
  ];

  return (
    <div className="documentation-page-content max-w-3xl">
      <h1 className="text-4xl font-extrabold mb-6">Keyboard Shortcuts</h1>
      <p className="text-lg text-slate-600 mb-8">
        Master these shortcuts to rapidly draft and modify quantum layouts.
      </p>

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <tbody className="divide-y divide-slate-100">
            {shortcuts.map((s, i) => (
              <tr key={i} className="bg-white hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 w-1/3">
                  <kbd className="px-2 py-1 bg-slate-100 border border-slate-300 rounded-md font-mono text-sm text-slate-800 shadow-sm">{s.key}</kbd>
                </td>
                <td className="px-6 py-4 text-slate-700 font-medium">{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
`,

  'save-designs.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Saving & Restoring</h1>
      <p className="text-lg text-slate-600 mb-8">
        Silicofeller utilizes an optimistic auto-save architecture. Every action on the canvas is instantly recorded as a differential patch to your project's AST graph.
      </p>

      <AlertBox type="info" title="Version History">
        The backend maintains an immutable append-only log of your layout changes. You can instantly rewind the canvas state to any previous second.
      </AlertBox>

      <h2 className="text-2xl font-bold mt-10 mb-4">Manual Snapshots</h2>
      <p className="text-slate-600">
        Press <strong>Ctrl + S</strong> to create a named snapshot. Named snapshots are preserved indefinitely and can be used as base templates for future projects.
      </p>
    </div>
  );
}
`,

  'browse-components.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Browse Component Library</h1>
      <p className="text-lg text-slate-600 mb-8">
        The left-hand sidebar houses the Parametric Component Library, containing physics-validated primitive shapes.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        <div className="border border-slate-200 rounded-lg p-5">
          <h3 className="font-bold text-slate-900 mb-2">Primitives vs QComponents</h3>
          <p className="text-sm text-slate-600">Primitives are raw geometry (polygons, lines). QComponents are physics-aware macro-blocks that automatically generate their own layout based on electrical parameters.</p>
        </div>
        <div className="border border-slate-200 rounded-lg p-5">
          <h3 className="font-bold text-slate-900 mb-2">Search & Filter</h3>
          <p className="text-sm text-slate-600">Use the top search bar to filter by tag (e.g., "#tunable", "#readout") or component class.</p>
        </div>
      </div>
    </div>
  );
}
`,

  'designer-qubits.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Transmon Qubits</h1>
      <p className="text-lg text-slate-600 mb-8">
        Transmon (Transmission-line shunted plasma oscillation) qubits are the default compute elements in Silicofeller.
      </p>

      <h2 className="text-2xl font-bold mb-4">Hamiltonian Target</h2>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 text-center text-xl font-serif italic mb-8">
        H = 4 E_C (n - n_g)^2 - E_J \\cos(\\phi)
      </div>

      <h2 className="text-2xl font-bold mb-4">Geometric Parameters</h2>
      <ul className="list-disc pl-5 space-y-2 text-slate-600 mb-8">
        <li><strong>Cross Size / Pad Size:</strong> Determines the shunt capacitance ($C_s$), which defines charging energy ($E_C$).</li>
        <li><strong>Junction Inductance ($L_J$):</strong> Usually targeted analytically via the \`target_frequency\` parameter, forcing the synthesizer to adjust the geometry.</li>
      </ul>

      <AlertBox type="warning" title="Anharmonicity Limits">
        Decreasing $E_C$ increases coherence but lowers anharmonicity. Silicofeller flags an error if anharmonicity drops below 200 MHz, as it risks state leakage during fast gates.
      </AlertBox>
    </div>
  );
}
`,

  'designer-couplers.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Couplers</h1>
      <p className="text-lg text-slate-600 mb-8">
        Couplers mediate the entanglement operations between adjacent qubits. Silicofeller supports both direct capacitive coupling and tunable bus couplers.
      </p>

      <div className="overflow-x-auto rounded-xl border border-slate-200 mb-10">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-900">
            <tr>
              <th className="px-6 py-4 font-semibold">Type</th>
              <th className="px-6 py-4 font-semibold">Mechanism</th>
              <th className="px-6 py-4 font-semibold">Pros</th>
              <th className="px-6 py-4 font-semibold">Cons</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr className="hover:bg-slate-50/50">
              <td className="px-6 py-4 font-medium text-slate-900">Direct Capacitive</td>
              <td className="px-6 py-4 text-slate-600">Always-on ZZ coupling</td>
              <td className="px-6 py-4 text-emerald-600">Simpler layout, less noise</td>
              <td className="px-6 py-4 text-rose-600">High static cross-talk</td>
            </tr>
            <tr className="hover:bg-slate-50/50">
              <td className="px-6 py-4 font-medium text-slate-900">Tunable Coupler</td>
              <td className="px-6 py-4 text-slate-600">Flux-tunable intermediate SQUID</td>
              <td className="px-6 py-4 text-emerald-600">Zero idle cross-talk</td>
              <td className="px-6 py-4 text-rose-600">Complex wiring, flux noise</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
`,

  'designer-feedlines.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Transmission Lines</h1>
      <p className="text-lg text-slate-600 mb-8">
        Coplanar waveguide (CPW) transmission lines deliver microwave drive signals to qubits and carry readout signals to the amplifiers.
      </p>

      <h2 className="text-2xl font-bold mb-4">Impedance Matching</h2>
      <p className="text-slate-600 mb-6">
        All default Silicofeller feedlines are mathematically constrained to $Z_0 = 50 \\Omega$. The ratio of the center trace width ($w$) to the gap spacing ($s$) is locked based on the dielectric constant of the selected substrate.
      </p>

      <AlertBox type="info" title="Trace/Gap Ratio">
        For standard 500µm Silicon, a typical 50Ω CPW geometry uses $w = 10\\mu m$ and $s = 6\\mu m$. Modifying the substrate requires re-running the CPW calculator in the properties panel.
      </AlertBox>
    </div>
  );
}
`,

  'designer-resonators.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Readout Resonators</h1>
      <p className="text-lg text-slate-600 mb-8">
        Dispersive readout is achieved by coupling a microwave resonator to the qubit. The qubit state shifts the resonant frequency of the cavity.
      </p>

      <h2 className="text-2xl font-bold mb-4">Quarter-Wave vs Half-Wave</h2>
      <ul className="list-disc pl-5 mb-8 text-slate-600 space-y-4">
        <li>
          <strong>Quarter-Wave ($\\lambda/4$):</strong> Shorted to ground on one end, capacitively coupled to the feedline on the other. More compact, default choice for multiplexed readout on heavy-hex grids.
        </li>
        <li>
          <strong>Half-Wave ($\\lambda/2$):</strong> Capacitively coupled on both ends. Used in specialized filter configurations (e.g., Purcell filters).
        </li>
      </ul>
    </div>
  );
}
`,

  'designer-terminations.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Terminations & Pads</h1>
      <p className="text-lg text-slate-600 mb-8">
        Wirebond pads and launch geometries bridge the on-chip transmission lines to the macroscopic packaging environment.
      </p>

      <h2 className="text-2xl font-bold mb-4">Launch Pad Geometries</h2>
      <p className="text-slate-600 mb-6">
        Silicofeller provides tapered CPW launch pads optimized for minimizing return loss (S11) when bonding to PCB traces. The taper angle and ground plane cutouts are parametrizable.
      </p>
    </div>
  );
}
`,

  'copy-qiskit.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Copy Qiskit Metal Snippets</h1>
      <p className="text-lg text-slate-600 mb-8">
        Silicofeller integrates natively with IBM's Qiskit Metal. You can select any visual component and instantly copy its equivalent Python representation.
      </p>

      <AlertBox type="tip" title="Right-Click Context Menu">
        Right-click any component on the canvas and select <strong>"Copy as Qiskit Metal"</strong>.
      </AlertBox>

      <h2 className="text-2xl font-bold mt-10 mb-4">Example Output</h2>
      <CodeBlock language="python" code={\`from qiskit_metal.qlibrary.qubits.transmon_cross import TransmonCross

q1 = TransmonCross(design, 'Q1', options=dict(
    pos_x='0um', 
    pos_y='0um',
    cross_width='20um',
    cross_length='200um',
    connection_pads=dict(
        readout=dict(connector_type='0', connector_location='90')
    )
))\`} />
    </div>
  );
}
`
};

Object.keys(files).forEach(file => {
  fs.writeFileSync(path.join(dir, file), files[file], 'utf8');
});
console.log('Batch 1C and 1D complete');
