const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/components/documentation/sections');

const files = {
  'qclang-overview.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">QCLang Overview</h1>
      <p className="text-lg text-slate-600 mb-8">
        Quantum Chip Language (QCLang) is a domain-specific language designed exclusively for defining superconducting quantum topologies.
      </p>

      <h2 className="text-2xl font-bold mb-4">Syntax Core</h2>
      <CodeBlock language="qclang" code={\`// Block declaration
design "MyChip" {
  // Component instantiation
  component Q1: Transmon(freq=5.0);
  
  // Routing semantics
  route Q1 -> Q2;
}\`} />
    </div>
  );
}
`,

  'qclang-examples.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">QCLang Examples</h1>
      <p className="text-lg text-slate-600 mb-8">
        Real-world snippets for common layout patterns.
      </p>

      <h3 className="font-bold text-xl mb-4">Multiplexed Readout Bank</h3>
      <CodeBlock language="qclang" code={\`design "ReadoutBank" {
  component Bus: Feedline(z0=50);
  component R1: Resonator(freq=6.1);
  component R2: Resonator(freq=6.3);
  
  route R1.out -> Bus.in;
  route R2.out -> Bus.in;
}\`} />
    </div>
  );
}
`,

  'parser.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">QCLang Parser</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Silicofeller AST compiler runs entirely in the browser using a WebAssembly-compiled Rust parser.
      </p>

      <AlertBox type="info" title="Performance">
        WASM parsing guarantees instant feedback as you type in the QCLang console, flagging syntax errors before sending payloads to the backend.
      </AlertBox>
    </div>
  );
}
`,

  'compile-design.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Compile Design</h1>
      <p className="text-lg text-slate-600 mb-8">
        Translating AST into physical geometries.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-x-auto mb-10">
        <pre className="text-sm font-mono text-slate-800">
{\`graph TD
    A[AST JSON] --> B[Component Expansion]
    B --> C[Parameter Resolution]
    C --> D[Boolean Subtraction]
    D --> E[Mesh Triangulation]\`}
        </pre>
      </div>
    </div>
  );
}
`,

  'save-qclang.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Saving QCLang Scripts</h1>
      <p className="text-lg text-slate-600 mb-8">
        QCLang scripts can be saved as \`.qcl\` files and imported as parameterized macros in other designs.
      </p>
    </div>
  );
}
`,

  'authentication.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">API Authentication</h1>
      <p className="text-lg text-slate-600 mb-8">
        All REST API endpoints require Bearer Token authentication.
      </p>

      <h2 className="text-2xl font-bold mb-4">Header Format</h2>
      <CodeBlock language="bash" code={\`Authorization: Bearer sk_live_...\`} />
    </div>
  );
}
`,

  'api-design.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Design API</h1>
      <p className="text-lg text-slate-600 mb-8">
        Modify the layout graph directly.
      </p>
      
      <div className="mb-4">
        <span className="bg-blue-100 text-blue-800 font-bold px-3 py-1 rounded-md text-sm">POST</span>
        <code className="ml-3 text-lg font-bold text-slate-800">/v1/designs/:id/components</code>
      </div>
      <p className="text-slate-600">Instantiates a new QComponent via the API.</p>
    </div>
  );
}
`,

  'api-qclang.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">QCLang API</h1>
      <p className="text-lg text-slate-600 mb-8">
        Endpoints for remote compilation.
      </p>
    </div>
  );
}
`,

  'simulation-api.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Simulation API</h1>
      <p className="text-lg text-slate-600 mb-8">
        Submit and poll AWS Palace FEA tasks.
      </p>
    </div>
  );
}
`,

  'api-verification.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Verification API</h1>
      <p className="text-lg text-slate-600 mb-8">
        Trigger DRC checks programmatically.
      </p>
    </div>
  );
}
`,

  'api-materials.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Materials API</h1>
      <p className="text-lg text-slate-600 mb-8">
        Manage custom substrate definitions.
      </p>
    </div>
  );
}
`,

  'api-tapeout.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Tapeout API</h1>
      <p className="text-lg text-slate-600 mb-8">
        Automate GDSII packaging and foundry delivery.
      </p>
    </div>
  );
}
`,

  'api-component.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Component Library API</h1>
      <p className="text-lg text-slate-600 mb-8">
        Fetch parametric constraints for custom QComponents.
      </p>
    </div>
  );
}
`,

  'api-explorer.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Graph API</h1>
      <p className="text-lg text-slate-600 mb-8">
        Extract pure topology matrices.
      </p>
    </div>
  );
}
`,

  'redoc.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Interactive OpenAPI Reference</h1>
      <p className="text-lg text-slate-600 mb-8">
        Access the full Swagger/ReDoc portal for comprehensive schema definitions.
      </p>
      
      <AlertBox type="tip" title="External Portal">
        The interactive portal is hosted separately at <code>api.silicofeller.com/docs</code>.
      </AlertBox>
    </div>
  );
}
`
};

Object.keys(files).forEach(file => {
  fs.writeFileSync(path.join(dir, file), files[file], 'utf8');
});
console.log('Batch 3B complete');
