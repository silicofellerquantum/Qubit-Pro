const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/components/documentation/sections');

const files = {
  'export-json.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">JSON Export</h1>
      <p className="text-lg text-slate-600 mb-8">
        The JSON format provides a completely serialized representation of your project's Abstract Syntax Tree (AST), making it ideal for version control diffs.
      </p>

      <h2 className="text-2xl font-bold mb-4">Schema Structure</h2>
      <CodeBlock language="json" code={\`{
  "version": "1.2.0",
  "project": "Falcon-RevA",
  "components": [
    { "id": "Q1", "type": "TransmonCross", "params": { "freq": 5.0 } }
  ],
  "nets": [
    { "source": "Q1.readout", "target": "Res1.in" }
  ]
}\`} />
    </div>
  );
}
`,

  'export-qclang.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">QCLang Export</h1>
      <p className="text-lg text-slate-600 mb-8">
        Export your visual schematic back into its underlying QCLang source code.
      </p>

      <h2 className="text-2xl font-bold mb-4">Round-Trip Engineering</h2>
      <p className="text-slate-600 mb-6">
        Silicofeller guarantees 100% round-trip fidelity between visual dragging-and-dropping and QCLang text generation.
      </p>
      
      <CodeBlock language="qclang" code={\`design "Falcon-RevA" {
  component Q1: TransmonCross(freq=5.0GHz);
  component Res1: QuarterWave(freq=6.5GHz);
  
  route Q1.readout -> Res1.in;
}\`} />
    </div>
  );
}
`,

  'export-svg.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">SVG Export</h1>
      <p className="text-lg text-slate-600 mb-8">
        Generate publication-ready vector graphics of your quantum layouts.
      </p>

      <h2 className="text-2xl font-bold mb-4">Styling Output</h2>
      <p className="text-slate-600 mb-6">
        By default, SVG exports use a high-contrast dark theme. You can toggle to a "Print-Friendly" mode in the Export modal, which renders black outlines on a white background, perfect for academic papers (e.g., Physical Review Letters).
      </p>
    </div>
  );
}
`,

  'export-gdsii.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">GDSII Generation</h1>
      <p className="text-lg text-slate-600 mb-8">
        GDSII (Graphic Data System II) is the standard binary file format for controlling lithography photomask generation.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-10">
        <h3 className="font-bold text-slate-900 mb-4 border-b pb-2">Default Layer Mapping</h3>
        <dl className="space-y-3 text-sm">
          <div className="flex"><dt className="w-24 font-bold text-slate-700">Layer 1:</dt><dd className="text-slate-600">Base ground plane (Nb)</dd></div>
          <div className="flex"><dt className="w-24 font-bold text-slate-700">Layer 2:</dt><dd className="text-slate-600">Base metallization subtraction (etching)</dd></div>
          <div className="flex"><dt className="w-24 font-bold text-slate-700">Layer 3:</dt><dd className="text-slate-600">Josephson Junction dose (Al)</dd></div>
          <div className="flex"><dt className="w-24 font-bold text-slate-700">Layer 4:</dt><dd className="text-slate-600">Bandage/galvanic connections</dd></div>
        </dl>
      </div>

      <AlertBox type="warning" title="Polygon Resolution">
        Ensure your polygon discretization resolution is set appropriately for your e-beam writer. Too fine a resolution generates huge GDS files that crash stepper software.
      </AlertBox>
    </div>
  );
}
`,

  'export-dxf.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">DXF Export</h1>
      <p className="text-lg text-slate-600 mb-8">
        DXF format is supported primarily for integration with CAD/CAM software (like SolidWorks) for designing macroscopic copper packaging and sample holders.
      </p>

      <h2 className="text-2xl font-bold mb-4">Limitations</h2>
      <p className="text-slate-600">
        DXF does not robustly support complex hierarchical Boolean operations. For direct lithography, always use GDSII.
      </p>
    </div>
  );
}
`,

  'pdf-reports.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">PDF Generation</h1>
      <p className="text-lg text-slate-600 mb-8">
        Compile comprehensive PDF dossiers combining schematic views, DRC results, and physics simulation charts.
      </p>

      <h2 className="text-2xl font-bold mb-4">Customizing Reports</h2>
      <p className="text-slate-600">
        You can append custom Markdown notes to the Design Summary section before triggering the PDF compilation engine.
      </p>
    </div>
  );
}
`,

  'export-qiskit-metal.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Qiskit Metal Integration</h1>
      <p className="text-lg text-slate-600 mb-8">
        Export an entire project directly as a functional Qiskit Metal Python script.
      </p>

      <CodeBlock language="python" code={\`# Generated by Silicofeller Quantum Studio
import qiskit_metal as metal
from qiskit_metal import designs, draw

design = designs.DesignPlanar()
design.overwrite_enabled = True

# Custom Components
from qiskit_metal.qlibrary.qubits.transmon_cross import TransmonCross
# ... instantiation generated here ...

gui = metal.MetalGUI(design)
gui.rebuild()
gui.autoscale()\`} />
    </div>
  );
}
`,

  'design-summary.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Design Summary</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Design Summary provides a high-level bill of materials (BOM).
      </p>

      <div className="border border-slate-200 rounded-xl overflow-hidden mb-10">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-semibold">Metric</th>
              <th className="px-6 py-4 font-semibold">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr>
              <td className="px-6 py-4 font-medium">Total Qubits</td>
              <td className="px-6 py-4 text-slate-600">5</td>
            </tr>
            <tr>
              <td className="px-6 py-4 font-medium">Total Wire Length</td>
              <td className="px-6 py-4 text-slate-600">42.5 mm</td>
            </tr>
            <tr>
              <td className="px-6 py-4 font-medium">Est. Bounding Box</td>
              <td className="px-6 py-4 text-slate-600">5.0 x 5.0 mm</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
`,

  'validation-reports.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Validation Reports</h1>
      <p className="text-lg text-slate-600 mb-8">
        A permanent audit trail of all DRC checks run against the design.
      </p>

      <AlertBox type="warning" title="Audit Compliance">
        For ISO-9001 certified fab runs, the Validation Report contains cryptographic hashes of the AST state to prove that the GDSII file matches the validated DRC output.
      </AlertBox>
    </div>
  );
}
`,

  'results-reports.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Simulation Results</h1>
      <p className="text-lg text-slate-600 mb-8">
        Aggregated outputs from Palace FEA and LOM solvers.
      </p>

      <h2 className="text-2xl font-bold mb-4">Export Formats</h2>
      <ul className="list-disc pl-5 space-y-2 text-slate-600 mb-8">
        <li><strong>Capacitance Matrices:</strong> Exported as CSV matrices.</li>
        <li><strong>E-Field Visualizations:</strong> Exported as VTK files for viewing in ParaView.</li>
        <li><strong>S-Parameters:</strong> Exported as standard Touchstone (.s2p, .sNp) files.</li>
      </ul>
    </div>
  );
}
`,

  'tapeout-reports.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Tapeout Review</h1>
      <p className="text-lg text-slate-600 mb-8">
        The final pre-flight checklist before foundry submission.
      </p>

      <h2 className="text-2xl font-bold mb-4">Approval Chains</h2>
      <p className="text-slate-600 mb-6">
        Enterprise users can configure required approval signatures. A tapeout report cannot be finalized until all requested Principal Engineers have signed off cryptographically.
      </p>
    </div>
  );
}
`,

  'generate-package.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Generate Foundry Package</h1>
      <p className="text-lg text-slate-600 mb-8">
        Bundles the GDSII, DRC Report, and metadata into a secure .tar.gz payload.
      </p>

      <AlertBox type="info" title="Automated FTP">
        If configured, the platform can automatically securely FTP the generated package directly to your contracted foundry partner.
      </AlertBox>
    </div>
  );
}
`,

  'foundry-rules.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Foundry Rule Decks</h1>
      <p className="text-lg text-slate-600 mb-8">
        Manage custom DRC constraints for proprietary fab facilities.
      </p>

      <h2 className="text-2xl font-bold mb-4">Custom Rule JSON</h2>
      <p className="text-slate-600">
        Administrators can upload custom JSON rule decks that override the default minimum geometries and maximum bounding boxes, ensuring that designers cannot create layouts that exceed the capability of your internal cleanroom.
      </p>
    </div>
  );
}
`
};

Object.keys(files).forEach(file => {
  fs.writeFileSync(path.join(dir, file), files[file], 'utf8');
});
console.log('Batch 3A complete');
