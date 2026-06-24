const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/components/documentation/sections');

const files = {
  // --- SYSTEM ARCHITECTURE SUB-PAGES ---
  'frontend-architecture.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Frontend Architecture</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Silicofeller Quantum Studio frontend is a highly performant Single Page Application (SPA) designed to handle massive computational graphs smoothly in the browser.
      </p>

      <div className="my-8 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <img src="/brain/63033335-280b-4630-beb9-8bb527edd274/system_architecture_1782265216047.png" alt="Frontend Structure" className="w-full h-auto object-cover" />
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">State Management Patterns</h2>
      <p className="text-slate-600 mb-6">
        We use a bifurcated state management approach to isolate high-frequency updates from structural application state.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
          <h3 className="font-bold text-slate-900 mb-2">Zustand for Canvas State</h3>
          <p className="text-sm text-slate-600">The position, rotation, and selection state of thousands of QCLang components change 60 times a second during a drag operation. This is stored in transient Zustand stores to bypass the React rendering lifecycle.</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
          <h3 className="font-bold text-slate-900 mb-2">React Query for Server State</h3>
          <p className="text-sm text-slate-600">Simulation progress, user permissions, and saved AST versions are handled by TanStack Query, providing automatic caching, background fetching, and optimistic UI updates.</p>
        </div>
      </div>

      <AlertBox type="tip" title="Performance Rule">
        Never place the AST (Abstract Syntax Tree) inside a top-level React Context. A single character change in the code editor would trigger a re-render of the entire DOM tree, causing fatal lag.
      </AlertBox>
    </div>
  );
}`,

  'backend-architecture.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Backend Architecture</h1>
      <p className="text-lg text-slate-600 mb-8">
        The primary gateway routing all requests between the user and the compute cluster.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Microservice Topology</h2>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>API Gateway (FastAPI):</strong> Handles all incoming HTTP traffic, JWT validation, and rate-limiting.</li>
        <li><strong>WebSocket Manager:</strong> Maintains persistent connections with clients, broadcasting graph mutations for collaborative editing.</li>
        <li><strong>Job Dispatcher:</strong> Evaluates incoming simulation requests, constructs the payload, and pushes it onto the Redis task queue.</li>
      </ul>

      <h2 className="text-2xl font-bold mb-4 mt-10">The Request Lifecycle</h2>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-x-auto mb-10">
        <pre className="text-sm font-mono text-slate-800">
{\`Client -> [Nginx Load Balancer] -> [FastAPI Gateway]
   |
   +-> 1. Auth Middleware validates JWT
   +-> 2. Pydantic validates incoming QCLang JSON payload
   +-> 3. Rust Extension parses AST for Fatal Syntax Errors
   +-> 4. Payload serialized to PostgreSQL
   +-> 5. 200 OK Response\`}
        </pre>
      </div>
    </div>
  );
}`,

  'design-physics-services.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Design & Physics Services</h1>
      <p className="text-lg text-slate-600 mb-8">
        The heavy lifting of quantum design happens asynchronously in isolated worker containers.
      </p>

      <div className="my-8 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <img src="/brain/63033335-280b-4630-beb9-8bb527edd274/validation_drc_1782265191432.png" alt="Physics Services" className="w-full h-auto object-cover" />
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">The Qiskit Metal Translation Layer</h2>
      <p className="text-slate-600 mb-6">
        When a DRC check or GDSII export is requested, the Python Celery worker consumes the QCLang JSON. It dynamically instantiates Qiskit Metal Python objects in memory, essentially "rebuilding" the user's schematic programmatically.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Simulation Orchestration</h2>
      <p className="text-slate-600 mb-6">
        For finite element analysis (FEA), the system must orchestrate an MPI job across multiple EC2 instances.
      </p>

      <AlertBox type="warning" title="Memory Limits">
        The Palace adapter generates Gmsh files that can easily exceed 50GB of RAM. The physics service is configured with a memory threshold watch; if the mesher exceeds the node's limit, it fails gracefully and reports an 'OOM Error' to the frontend rather than crashing the entire cluster.
      </AlertBox>
    </div>
  );
}`,

  'database-architecture.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Database Layer</h1>
      <p className="text-lg text-slate-600 mb-8">
        Silicofeller Quantum Studio relies on a hybrid persistence strategy to handle both structured relational data and massive unstructured simulation blobs.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Primary Data Store (PostgreSQL)</h2>
      <p className="text-slate-600 mb-6">
        We use PostgreSQL with the \`JSONB\` column type to store the raw QCLang Abstract Syntax Trees.
      </p>
      
      <ul className="space-y-4 mb-8">
        <li className="bg-slate-50 p-5 rounded-lg border border-slate-200 shadow-sm">
          <strong className="text-slate-900 block mb-2 text-lg">Revision History</strong>
          <span className="text-slate-600">Every time a user hits "Save", a new immutable row is created in the \`ast_revisions\` table. This allows for infinite undo/redo capability and deterministic rollbacks if a Tapeout fails DRC.</span>
        </li>
      </ul>

      <h2 className="text-2xl font-bold mb-4 mt-10">Message Broker (Redis)</h2>
      <p className="text-slate-600 mb-6">
        Redis handles three distinct workloads:
      </p>
      <ol className="list-decimal pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>Celery Task Queues:</strong> Routing simulation jobs to available workers.</li>
        <li><strong>Pub/Sub:</strong> Routing WebSocket messages between users in a shared collaborative session.</li>
        <li><strong>Rate Limiting:</strong> Fast incrementing counters for API quotas.</li>
      </ol>

      <h2 className="text-2xl font-bold mb-4 mt-10">Object Storage (AWS S3)</h2>
      <p className="text-slate-600 mb-6">
        Gigabyte-sized GDSII mask files and Palace Touchstone (.s2p) results are never stored in Postgres. They are pushed to S3, and the database merely stores a pre-signed URL reference.
      </p>
    </div>
  );
}`,

  // --- TECHNOLOGY STACK SUB-PAGES ---
  'react-typescript.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">React and TypeScript</h1>
      <p className="text-lg text-slate-600 mb-8">
        The entire frontend is built on React 18 using strict TypeScript. This guarantees that UI components accurately reflect the highly structured nature of the QCLang physics schemas.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Why TypeScript is Mandatory</h2>
      <p className="text-slate-600 mb-6">
        In a quantum design tool, a \`length\` property could be \`"50um"\` (string) or \`0.05\` (number representing mm). Using raw JavaScript leads to catastrophic layout bugs where components overlap invisibly.
      </p>
      
      <p className="text-slate-600 mb-6">
        Our TypeScript interfaces perfectly mirror the Pydantic models on the backend. We use OpenAPI generators to automatically build the TypeScript types from the FastAPI definitions during every CI/CD build.
      </p>

      <AlertBox type="info" title="Strict Mode">
        The repository enforces \`strict: true\` in the \`tsconfig.json\`. No \`any\` types are permitted in the codebase without an explicit ESLint override comment explaining why the type cannot be statically inferred.
      </AlertBox>
    </div>
  );
}`,

  'tanstack.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">TanStack Libraries</h1>
      <p className="text-lg text-slate-600 mb-8">
        We utilize the TanStack ecosystem to provide enterprise-grade routing, data fetching, and table rendering.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
          <h3 className="font-bold text-slate-900 text-lg mb-2">TanStack Router</h3>
          <p className="text-slate-600 text-sm">Provides fully type-safe routing. When navigating to \`/project/123/simulate\`, the router guarantees that \`123\` is available as a string parameter, preventing runtime crashes in the simulation panel.</p>
        </div>

        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
          <h3 className="font-bold text-slate-900 text-lg mb-2">TanStack Query</h3>
          <p className="text-slate-600 text-sm">Replaces \`useEffect\` data fetching. It caches project lists, automatically deduplicates API requests, and handles the polling logic required to check if a long-running FEA simulation has finished.</p>
        </div>
      </div>
    </div>
  );
}`,

  'tailwind.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Tailwind CSS and Radix UI</h1>
      <p className="text-lg text-slate-600 mb-8">
        Our UI strikes a balance between rapid development and uncompromised accessibility.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Tailwind CSS</h2>
      <p className="text-slate-600 mb-6">
        We use Tailwind for all styling to maintain a strict design system. Custom colors (like \`electric-indigo\` and \`slate\`) are defined in \`tailwind.config.js\` to match Silicofeller's dark, technical branding.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Radix UI Primitives</h2>
      <p className="text-slate-600 mb-6">
        Building accessible dropdowns, modals, and tooltips from scratch is error-prone. We use Radix UI as the unstyled accessible foundation.
      </p>

      <AlertBox type="tip" title="Design System Pattern">
        Never use raw Radix primitives directly in application code. Always use our wrapped, Tailwind-styled versions exported from the \`src/components/ui\` folder (e.g., \`<Button>\`, \`<Dialog>\`). This ensures visual consistency across the entire Studio.
      </AlertBox>
    </div>
  );
}`,

  'fastapi.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">FastAPI and Pydantic</h1>
      <p className="text-lg text-slate-600 mb-8">
        The backend API is built entirely on FastAPI, an incredibly performant ASGI web framework for Python.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Why FastAPI?</h2>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>Async Native:</strong> Allows a single worker to handle thousands of concurrent WebSocket connections for real-time collaborative editing without blocking threads.</li>
        <li><strong>Automatic Docs:</strong> Swagger UI and ReDoc are generated automatically, keeping our API documentation perfectly synced with the codebase.</li>
      </ul>

      <h2 className="text-2xl font-bold mb-4 mt-10">Pydantic Data Validation</h2>
      <p className="text-slate-600 mb-6">
        Pydantic guarantees that any incoming QCLang JSON string matches the required schema before the physics engine ever touches it.
      </p>

      <CodeBlock language="python" code={\`from pydantic import BaseModel, Field

class TransmonComponent(BaseModel):
    id: str
    pos_x: str = Field(pattern=r'^[-+]?[0-9]*\\.?[0-9]+[a-z]+$')
    cross_width: str
    
    # If the user sends "pos_x": 50 (integer), 
    # FastAPI automatically rejects it with a 422 Unprocessable Entity error.\`} />
    </div>
  );
}`,

  'sqlalchemy.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">SQLAlchemy and Alembic</h1>
      <p className="text-lg text-slate-600 mb-8">
        We manage relational data (Users, Workspaces, Project Metadata, Simulation Runs) using SQLAlchemy ORM.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Asynchronous Queries</h2>
      <p className="text-slate-600 mb-6">
        To take full advantage of FastAPI, we use the \`asyncpg\` driver with SQLAlchemy 2.0. This ensures database I/O never blocks the event loop.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Database Migrations with Alembic</h2>
      <p className="text-slate-600 mb-6">
        Schema changes (e.g., adding a new \`fabrication_foundry\` column to the Projects table) are managed via Alembic.
      </p>
      
      <div className="bg-slate-900 text-slate-300 p-4 rounded-xl font-mono text-sm mb-10 shadow-lg">
        # Create a new migration script<br/>
        alembic revision --autogenerate -m "Add foundry column"<br/>
        <br/>
        # Apply to local database<br/>
        alembic upgrade head
      </div>
    </div>
  );
}`,

  'databases.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Databases: SQLite, PostgreSQL, Redis</h1>
      <p className="text-lg text-slate-600 mb-8">
        We utilize different data stores optimized for different environments and workloads.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">PostgreSQL (Production)</h2>
      <p className="text-slate-600 mb-6">
        The heavy-duty primary store for all user and project data in the cloud. It expertly handles concurrent reads/writes and powerful JSONB querying for searching through AST structures.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">SQLite (Local Development)</h2>
      <p className="text-slate-600 mb-6">
        When running the backend locally via \`npm run start:local\`, the system defaults to a local \`app.db\` SQLite file. This allows developers to work on the UI without needing to run Docker or configure a local Postgres instance.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Redis (Message Broker)</h2>
      <p className="text-slate-600 mb-6">
        Because HTTP requests are stateless, Redis acts as the glue. It queues tasks for Celery (so a simulation request isn't lost if the server restarts) and manages pub/sub channels for the collaborative WebSocket editor.
      </p>
    </div>
  );
}`,

  'qiskit.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Physics Tooling</h1>
      <p className="text-lg text-slate-600 mb-8">
        The core domain logic relies heavily on open-source scientific computing libraries.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Qiskit Metal</h2>
      <p className="text-slate-600 mb-6">
        Developed by IBM Quantum, Qiskit Metal provides the fundamental Python classes (e.g., \`TransmonCross\`, \`RouteMeander\`) that translate abstract connectivity graphs into raw GDSII geometry.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">NetworkX</h2>
      <p className="text-slate-600 mb-6">
        Before physics simulations run, the DRC engine converts the QCLang AST into a mathematical graph using NetworkX. This allows us to instantly run topological checks, such as identifying isolated "islands" in the ground plane or detecting cyclic routing loops.
      </p>

      <AlertBox type="warning" title="Dependency Management">
        Qiskit Metal has very strict dependencies on specific versions of \`gdspy\` and \`Shapely\`. We enforce these via strict version pinning in the \`requirements.txt\`. Do not upgrade these libraries locally without consulting the core engineering team, as it can cause fatal segmentation faults during GDSII export.
      </AlertBox>
    </div>
  );
}`,

  // --- TROUBLESHOOTING SUB-PAGES ---
  'backend-unavailable.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Backend Unavailable</h1>
      <p className="text-lg text-slate-600 mb-8">
        Resolving issues when the frontend cannot communicate with the API.
      </p>

      <div className="bg-rose-50 border-l-4 border-rose-500 p-5 mb-8 rounded-r-xl">
        <h3 className="text-rose-800 font-bold mb-1">Error Symbol</h3>
        <p className="text-rose-700 text-sm">A red "Disconnected" pill appears in the top right of the navigation bar, and the visual editor refuses to save changes.</p>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Common Causes</h2>
      <ul className="list-disc pl-6 space-y-4 text-slate-600 mb-8">
        <li>
          <strong>CORS Policy Block:</strong> If you are running the frontend on \`localhost:3000\` but your \`.env\` file points to the production API, the browser will block the request. Ensure \`NEXT_PUBLIC_API_URL\` is set to \`http://localhost:8000\`.
        </li>
        <li>
          <strong>Docker Networking:</strong> If running via Docker Compose, ensure the \`backend\` container is fully healthy. Run \`docker-compose ps\`. If it's restarting in a loop, it usually means the database container isn't ready yet or the \`DATABASE_URL\` is incorrect.
        </li>
        <li>
          <strong>VPN / Proxy Interference:</strong> Corporate firewalls occasionally block WebSocket connections (\`wss://\`), falling back to slow HTTP polling. Check your browser network tab for WS connection timeouts.
        </li>
      </ul>
    </div>
  );
}`,

  'no-design.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">No Design Generated</h1>
      <p className="text-lg text-slate-600 mb-8">
        You clicked "Generate" in the Design Copilot, but the canvas remains empty.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Step-by-Step Fixes</h2>
      
      <div className="space-y-6 mb-10">
        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
          <h3 className="font-bold text-slate-900 text-lg mb-2">1. Check AI Quotas</h3>
          <p className="text-slate-600">The LLM generation service has strict rate limits. If you've requested 50 designs in the last hour, the API will silently reject the prompt. Check the notification bell for a "Rate Limit Exceeded" alert.</p>
        </div>

        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
          <h3 className="font-bold text-slate-900 text-lg mb-2">2. Unparseable Response</h3>
          <p className="text-slate-600">Sometimes the LLM outputs malformed QCLang JSON. Press \`Ctrl + Shift + J\` to open the developer console. If you see a \`SyntaxError: Unexpected token\`, it means the generation failed structurally. Try rephrasing your prompt to be more explicit (e.g., "Generate exactly 3 transmons").</p>
        </div>
      </div>

      <AlertBox type="tip" title="Use Templates Instead">
        If the Copilot is completely unresponsive, navigate to the <strong>Code Editor</strong> tab and paste a standard layout from the <em>QCLang Examples & Templates</em> documentation to jumpstart your workspace manually.
      </AlertBox>
    </div>
  );
}`,

  'validation-failures.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Validation Failures</h1>
      <p className="text-lg text-slate-600 mb-8">
        The DRC Engine is throwing Level 2 or Level 3 violations, preventing GDSII export.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">The "Overlapping Polygons" Error</h2>
      <p className="text-slate-600 mb-6">
        This is the most common Level 2 violation. It occurs when two components are placed too close together, causing their etched ground-plane moats to collide.
      </p>
      <p className="text-slate-600 mb-6"><strong>Fix:</strong> Increase the \`pos_x\` or \`pos_y\` distance between the components in the properties inspector, or utilize the "Auto-Layout" wand to mathematically separate them by exactly \`min_spacing + 5um\`.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">The "Dangling Route" Error</h2>
      <p className="text-slate-600 mb-6">
        A Level 3 Fatal error. Occurs when a \`RouteMeander\` tries to connect to a pin that doesn't exist (e.g., \`Q1.north\` on a Transmon Pocket that only has east/west pins).
      </p>

      <AlertBox type="warning" title="Pin Verification">
        Always check the <strong>Component Library</strong> reference for the specific component you are using. Different transmon classes expose differently named pins.
      </AlertBox>
    </div>
  );
}`,

  'simulation-failures.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Simulation Failures</h1>
      <p className="text-lg text-slate-600 mb-8">
        Your Palace FEA or LOM simulation fails mid-run and returns an error status.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">LOM Failures (Capacitance Matrix)</h2>
      <p className="text-slate-600 mb-6">
        Usually caused by the chip bounding box being too small. If the ground plane boundary is too close to a qubit, the electric field lines clip the simulation boundary, causing the electrostatic solver to diverge to infinity.
      </p>
      <p className="text-slate-600 mb-6"><strong>Fix:</strong> Go to Project Settings and increase the \`Die Size (X, Y)\` parameter by at least 1000µm to provide enough vacuum padding around the quantum geometries.</p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Palace Failures (Full Wave FEA)</h2>
      <ul className="space-y-4 mb-8 text-slate-600">
        <li className="bg-slate-50 p-5 rounded-lg border border-slate-200">
          <strong className="text-slate-900 block mb-1">Gmsh OOM (Out of Memory)</strong>
          The mesh is too dense. Reduce "Mesh Refinement Level" from 4 to 3, or increase the minimum trace gap width to reduce the number of tetrahedrons required.
        </li>
        <li className="bg-slate-50 p-5 rounded-lg border border-slate-200">
          <strong className="text-slate-900 block mb-1">Zero Pivot in Sparse Solver</strong>
          The matrix solver failed because a component is completely electrically disconnected from the environment. Check the Connectivity DRC before simulating.
        </li>
      </ul>
    </div>
  );
}`,

  // --- THE CORRECTLY NAMED MISSING PARENT FILES ---
  'running-locally.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Run Locally</h1>
      <p className="text-lg text-slate-600 mb-8">
        You can spin up the entire Silicofeller Studio stack on your local workstation for air-gapped development or custom module testing.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Prerequisites</h2>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li>Node.js v18+</li>
        <li>Python 3.10+ (with Anaconda or venv)</li>
        <li>Docker Desktop (for Redis and PostgreSQL)</li>
      </ul>

      <h2 className="text-2xl font-bold mb-4 mt-10">Starting the Frontend</h2>
      <CodeBlock language="bash" code={\`git clone https://github.com/silicofeller/studio-frontend.git
cd studio-frontend
npm install
npm run dev\`} />
      <p className="text-slate-600 mb-6 mt-4">The UI will be available at \`http://localhost:3000\`.</p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Starting the Backend</h2>
      <CodeBlock language="bash" code={\`git clone https://github.com/silicofeller/studio-backend.git
cd studio-backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start the FastAPI server
uvicorn main:app --reload --port 8000\`} />

      <AlertBox type="warning" title="Local Simulation Limitations">
        While the geometry generation and LOM solver will run fine on a standard laptop, triggering a full Palace FEA simulation locally will likely consume 64GB+ of RAM and run for several days. We recommend using the cloud cluster for FEA.
      </AlertBox>
    </div>
  );
}`,

  'docker-compose-deploy.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Docker Compose Deployment</h1>
      <p className="text-lg text-slate-600 mb-8">
        The easiest way to deploy Silicofeller Studio on a local server or private cloud is via our official Docker Compose stack.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">The docker-compose.yml</h2>
      <p className="text-slate-600 mb-6">
        This file spins up 5 containers: the React frontend (Nginx), the FastAPI backend, a PostgreSQL database, a Redis queue, and a Celery worker for mesh generation.
      </p>

      <CodeBlock language="yaml" code={\`version: '3.8'
services:
  frontend:
    image: silicofeller/studio-ui:latest
    ports:
      - "80:80"
    depends_on:
      - backend

  backend:
    image: silicofeller/studio-api:latest
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgres://user:pass@db:5432/silicofeller
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      - db
      - redis

  worker:
    image: silicofeller/studio-api:latest
    command: celery -A core.tasks worker --loglevel=info
    environment:
      - REDIS_URL=redis://redis:6379/0

  db:
    image: postgres:14-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass

  redis:
    image: redis:6-alpine\`} />

      <h2 className="text-2xl font-bold mb-4 mt-10">Launch Commands</h2>
      <CodeBlock language="bash" code="docker-compose up -d" />

      <AlertBox type="info" title="Volumes">
        By default, the PostgreSQL and Redis data are ephemeral. For a persistent deployment, ensure you map Docker volumes to the database directories.
      </AlertBox>
    </div>
  );
}`,

  'support.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Support and FAQ</h1>
      <p className="text-lg text-slate-600 mb-8">
        Answers to the most common questions from our quantum engineering community.
      </p>

      <div className="space-y-6 mb-10">
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 font-bold text-slate-900">
            Can I import my own GDSII file into Silicofeller?
          </div>
          <div className="p-5 bg-white text-slate-600">
            Currently, no. GDSII is a "baked" format (just coordinates of polygons). Silicofeller relies on the semantic QCLang AST to know what a "qubit" or a "pin" is. You must rebuild the logic in the visual editor or QCLang script.
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 font-bold text-slate-900">
            Does Silicofeller support Spin Qubits or Photonic chips?
          </div>
          <div className="p-5 bg-white text-slate-600">
            Not currently. The layout engine and physics simulators (LOM/EPR) are hardcoded for superconducting circuit QED architectures (Transmons, Fluxoniums, CPWs).
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 font-bold text-slate-900">
            Who owns the IP of the chips I design?
          </div>
          <div className="p-5 bg-white text-slate-600">
            You do. Silicofeller claims zero intellectual property rights over the GDSII outputs or QCLang scripts generated on our platform.
          </div>
        </div>
      </div>
      
      <h2 className="text-2xl font-bold mb-4 mt-10">Contact Support</h2>
      <p className="text-slate-600 mb-6">
        Enterprise customers receive 24/7 priority support. Open a ticket via the <strong>Help</strong> menu in the application header, or email <code>support@silicofeller.com</code>.
      </p>
    </div>
  );
}`
};

Object.keys(files).forEach(file => {
  fs.writeFileSync(path.join(dir, file), files[file], 'utf8');
});
console.log('Batch 6 (nested sub-pages) expanded');
