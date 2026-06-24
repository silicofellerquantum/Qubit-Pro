const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/components/documentation/sections');

const files = {
  'system-architecture.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">System Architecture Overview</h1>
      <p className="text-lg text-slate-600 mb-8">
        Silicofeller Quantum Studio follows a distributed, event-driven architecture designed to decouple the lightweight WebGL frontend from the compute-heavy physics simulation backend.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-x-auto mb-10">
        <pre className="text-sm font-mono text-slate-800">
{\`graph TD
    Client[React/WebGL Client] -->|REST/WebSockets| Gateway(API Gateway)
    Gateway --> Auth(Auth Service)
    Gateway --> Design(Design Matrix Service)
    Gateway --> Physics(Physics Orchestrator)
    Physics --> AWS[AWS EC2 Spot Fleet - Palace FEA]
    Design --> DB[(PostgreSQL + PostGIS)]\`}
        </pre>
      </div>
    </div>
  );
}
`,

  'frontend-architecture.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Frontend Architecture</h1>
      <p className="text-lg text-slate-600 mb-8">
        Built for high performance rendering of massive quantum graphs.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
        <div>
          <h3 className="font-bold text-xl mb-4 border-b pb-2">State Management</h3>
          <p className="text-sm text-slate-600">We use Zustand for global state and React Query (TanStack Query) for asynchronous API data fetching and caching.</p>
        </div>
        <div>
          <h3 className="font-bold text-xl mb-4 border-b pb-2">Canvas Rendering</h3>
          <p className="text-sm text-slate-600">The schematic canvas is powered by PixiJS (WebGL), allowing us to render up to 100,000 geometric polygons at 60 FPS without DOM lag.</p>
        </div>
      </div>
    </div>
  );
}
`,

  'backend-architecture.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Backend Architecture</h1>
      <p className="text-lg text-slate-600 mb-8">
        Our microservices are built in Python (FastAPI) and Rust.
      </p>

      <ul className="list-disc pl-5 space-y-2 text-slate-600 mb-8">
        <li><strong>Rust:</strong> Used exclusively for the AST compiler, GDSII binary generation, and geometric boolean operations (via \`clipper2\`).</li>
        <li><strong>Python (FastAPI):</strong> Handles all CRUD API endpoints, authentication, and orchestrating Qiskit Metal bindings.</li>
      </ul>
    </div>
  );
}
`,

  'design-physics-services.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Physics Services</h1>
      <p className="text-lg text-slate-600 mb-8">
        Physics simulation is completely decoupled from the main API.
      </p>

      <p className="text-slate-600">
        When a simulation is requested, the Design Service publishes an AMQP message to RabbitMQ. The Physics Orchestrator consumes this message, provisions an ephemeral container, runs the LOM/EPR extraction, writes the S-parameter results to S3, and fires a Webhook back to the main API.
      </p>
    </div>
  );
}
`,

  'database-architecture.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Database Architecture</h1>
      <p className="text-lg text-slate-600 mb-8">
        We rely on PostgreSQL for all relational data.
      </p>

      <AlertBox type="tip" title="JSONB Columns">
        The AST of a layout is stored entirely within a compressed JSONB column. This allows us to perform deep graph queries (e.g., finding all projects using a specific Transmon gap width) directly via SQL.
      </AlertBox>
    </div>
  );
}
`,

  'running-locally.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Running Locally</h1>
      <p className="text-lg text-slate-600 mb-8">
        Spin up the entire stack on your local workstation for development.
      </p>

      <h2 className="text-2xl font-bold mb-4">Start the Frontend</h2>
      <CodeBlock language="bash" code={\`cd frontend
npm install
npm run dev\`} />
      
      <p className="mt-4 text-sm text-slate-500">The app will be available at <code>http://localhost:8080</code></p>
    </div>
  );
}
`,

  'environment-variables.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Environment Variables</h1>
      <p className="text-lg text-slate-600 mb-8">
        Configuration settings for the frontend and backend.
      </p>

      <h2 className="text-2xl font-bold mb-4">.env.local</h2>
      <CodeBlock language="bash" code={\`VITE_API_URL=http://localhost:8000/api/v1
VITE_ENABLE_COPILOT=true
VITE_AUTH_DOMAIN=silicofeller.us.auth0.com\`} />
    </div>
  );
}
`,

  'docker-compose-deploy.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Docker Compose Deployment</h1>
      <p className="text-lg text-slate-600 mb-8">
        Deploy the full stack in a single command.
      </p>

      <CodeBlock language="yaml" code={\`version: '3.8'
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: secret
  api:
    build: ./backend
    ports:
      - "8000:8000"
    depends_on:
      - db
  web:
    build: ./frontend
    ports:
      - "8080:80"\`} />
    </div>
  );
}
`,

  'react-typescript.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">React & TypeScript</h1>
      <p className="text-lg text-slate-600 mb-8">
        The entire frontend is strongly typed with strict TypeScript configurations.
      </p>
    </div>
  );
}
`,

  'tanstack.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">TanStack Router & Query</h1>
      <p className="text-lg text-slate-600 mb-8">
        We use the TanStack ecosystem for type-safe routing and data fetching.
      </p>
    </div>
  );
}
`,

  'tailwind.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Tailwind CSS</h1>
      <p className="text-lg text-slate-600 mb-8">
        Utility-first styling allows us to maintain a cohesive design system without massive CSS bundles.
      </p>
    </div>
  );
}
`
};

Object.keys(files).forEach(file => {
  fs.writeFileSync(path.join(dir, file), files[file], 'utf8');
});
console.log('Batch 4A complete');
