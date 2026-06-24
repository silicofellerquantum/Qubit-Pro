const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/components/documentation/sections');

const files = {
  'fastapi.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">FastAPI Backend</h1>
      <p className="text-lg text-slate-600 mb-8">
        The core REST API is powered by FastAPI, leveraging Python's async IO for high concurrency.
      </p>
    </div>
  );
}
`,

  'sqlalchemy.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">SQLAlchemy 2.0</h1>
      <p className="text-lg text-slate-600 mb-8">
        We use SQLAlchemy 2.0 async sessions for non-blocking database queries.
      </p>
    </div>
  );
}
`,

  'databases.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">PostgreSQL & Redis</h1>
      <p className="text-lg text-slate-600 mb-8">
        Postgres handles relational state and JSON AST storage. Redis handles real-time WebSockets and Celery task brokering.
      </p>
    </div>
  );
}
`,

  'qiskit.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Qiskit Metal Core</h1>
      <p className="text-lg text-slate-600 mb-8">
        Many of our routing primitives wrap Qiskit Metal Python functions under the hood.
      </p>
    </div>
  );
}
`,

  'backend-unavailable.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Backend Unavailable</h1>
      <p className="text-lg text-slate-600 mb-8">
        If you see a 503 Service Unavailable error, the API gateway is unreachable.
      </p>

      <AlertBox type="warning" title="Local Debugging">
        Verify that your Docker Compose stack is running and that port 8000 is not blocked by a local firewall.
      </AlertBox>
    </div>
  );
}
`,

  'no-design.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Design Not Found</h1>
      <p className="text-lg text-slate-600 mb-8">
        This error occurs if a project is deleted by another team member while you have the schematic open.
      </p>
    </div>
  );
}
`,

  'validation-failures.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Resolving Validation Failures</h1>
      <p className="text-lg text-slate-600 mb-8">
        Refer to the Geometry and Connectivity DRC sections to trace specific error codes.
      </p>
    </div>
  );
}
`,

  'simulation-failures.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Simulation Failures</h1>
      <p className="text-lg text-slate-600 mb-8">
        Palace FEA out-of-memory (OOM) errors are the most common simulation failure.
      </p>
    </div>
  );
}
`,

  'best-practices.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Best Practices</h1>
      <p className="text-lg text-slate-600 mb-8">
        Always run a low-resolution LOM simulation before committing to a dense Palace mesh.
      </p>
    </div>
  );
}
`,

  'support.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Support & Contact</h1>
      <p className="text-lg text-slate-600 mb-8">
        Enterprise customers can open a support ticket directly from their dashboard.
      </p>
    </div>
  );
}
`,

  'security-configuration.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Security & Auth0</h1>
      <p className="text-lg text-slate-600 mb-8">
        Silicofeller uses Auth0 for identity management and RBAC (Role-Based Access Control).
      </p>
    </div>
  );
}
`
};

Object.keys(files).forEach(file => {
  fs.writeFileSync(path.join(dir, file), files[file], 'utf8');
});
console.log('Batch 4B complete');
