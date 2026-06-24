const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/components/documentation/sections');

const files = {
  'system-architecture.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">System Architecture</h1>
      <p className="text-lg text-slate-600 mb-8">
        Silicofeller Quantum Studio is built using a modern, scalable microservices architecture designed to decouple the lightweight visual frontend from the computationally intensive physics backend.
      </p>

      <div className="my-8 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <img src="/brain/63033335-280b-4630-beb9-8bb527edd274/system_architecture_1782265216047.png" alt="System Architecture Overview" className="w-full h-auto object-cover" />
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Frontend: React & WebGL</h2>
      <p className="text-slate-600 mb-6">
        The user interface is a Single Page Application (SPA) built with React and TypeScript. The infinite canvas is rendered using WebGL to guarantee 60fps performance even when viewing masks with over 100,000 polygon vertices.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Backend: Python & Rust</h2>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>FastAPI Gateway:</strong> Handles REST endpoints, authentication, and WebSocket streaming.</li>
        <li><strong>Qiskit Metal Wrapper:</strong> A dedicated Python service that translates the QCLang JSON AST into Qiskit Metal Python classes to generate the raw GDSII files.</li>
        <li><strong>Rust DRC Engine:</strong> A highly optimized WebAssembly-compatible Rust binary that performs boolean polygon intersections for Design Rule Checking.</li>
      </ul>

      <h2 className="text-2xl font-bold mb-4 mt-10">Simulation Cluster</h2>
      <p className="text-slate-600 mb-6">
        When a user triggers a Palace FEA simulation, the FastAPI backend places a task in a Redis queue. A fleet of AWS EC2 instances auto-scales to consume these tasks, running the MPI-distributed Palace C++ binaries and writing the resulting S-parameters back to a PostgreSQL database.
      </p>
    </div>
  );
}`,

  'run-locally.tsx': `import React from "react";
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

  'environment-variables.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Environment Variables</h1>
      <p className="text-lg text-slate-600 mb-8">
        Configure the behavior of your local or containerized deployment using the following .env file parameters.
      </p>

      <div className="overflow-x-auto mb-8 border border-slate-200 rounded-xl shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-900">Variable</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Default</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-mono font-bold text-slate-700">DATABASE_URL</td>
              <td className="px-6 py-4 font-mono">postgres://localhost:5432</td>
              <td className="px-6 py-4 text-slate-600">Connection string for the primary PostgreSQL database storing AST versions.</td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-mono font-bold text-slate-700">REDIS_URL</td>
              <td className="px-6 py-4 font-mono">redis://localhost:6379</td>
              <td className="px-6 py-4 text-slate-600">Connection string for the Celery task queue (used for background simulations).</td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-mono font-bold text-slate-700">JWT_SECRET</td>
              <td className="px-6 py-4 font-mono">changeme</td>
              <td className="px-6 py-4 text-slate-600">Cryptographic key used to sign authentication tokens. Must be changed in production.</td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-mono font-bold text-slate-700">ENABLE_PALACE</td>
              <td className="px-6 py-4 font-mono">false</td>
              <td className="px-6 py-4 text-slate-600">Set to true if you have a local MPI cluster configured to run Palace binaries.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}`,

  'docker-deployment.tsx': `import React from "react";
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

  'technology-stack.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Technology Stack</h1>
      <p className="text-lg text-slate-600 mb-8">
        A deep dive into the open-source libraries that power the Silicofeller Quantum platform.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
        <div>
          <h3 className="font-bold text-slate-900 text-xl border-b pb-2 mb-4">Frontend Layer</h3>
          <ul className="space-y-3 text-slate-600">
            <li><strong>React 18:</strong> UI component rendering and state management.</li>
            <li><strong>Zustand:</strong> High-performance atomic state management for the schematic AST, avoiding React Context re-renders.</li>
            <li><strong>PixiJS / WebGL:</strong> The rendering engine behind the 2D infinite canvas. Handles hardware-accelerated drawing of tens of thousands of CPW meander segments.</li>
            <li><strong>Tailwind CSS:</strong> Utility-first styling system used for the dark-mode documentation and UI panels.</li>
          </ul>
        </div>
        
        <div>
          <h3 className="font-bold text-slate-900 text-xl border-b pb-2 mb-4">Backend & Physics Layer</h3>
          <ul className="space-y-3 text-slate-600">
            <li><strong>Qiskit Metal:</strong> IBM's open-source library for superconducting qubit design. Used as the underlying geometric engine.</li>
            <li><strong>Gmsh:</strong> Open-source 3D finite element mesh generator. Translates 2D GDSII polygons into 3D volumetric tetrahedrons for FEA.</li>
            <li><strong>AWS Palace:</strong> Parallel finite element solver. Computes the Maxwell capacitance matrix and EPR parameters.</li>
            <li><strong>FastAPI & Celery:</strong> API routing and asynchronous task queuing.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}`,

  'troubleshooting.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Troubleshooting</h1>
      <p className="text-lg text-slate-600 mb-8">
        Solutions for common issues encountered during layout, DRC, and simulation.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">1. WebGL Canvas Crashing / Sluggish</h2>
      <p className="text-slate-600 mb-2"><strong>Symptom:</strong> The editor tab freezes or Chrome displays the "Aw, Snap!" memory error.</p>
      <p className="text-slate-600 mb-6"><strong>Fix:</strong> You likely have thousands of overlapping polygons caused by an infinite \`for\` loop in your QCLang script, or Hardware Acceleration is disabled in your browser settings. Check \`chrome://settings/system\` to ensure "Use hardware acceleration when available" is toggled ON.</p>

      <h2 className="text-2xl font-bold mb-4 mt-10">2. "Unresolved Pin Reference" in DRC</h2>
      <p className="text-slate-600 mb-2"><strong>Symptom:</strong> Level 3 Fatal Error preventing GDSII export.</p>
      <p className="text-slate-600 mb-6"><strong>Fix:</strong> You drew a wire to a component (e.g., \`Q1\`), but then deleted \`Q1\` and replaced it with \`Q2\`. The wire is still trying to route to \`Q1.east\`. Delete the dangling wire and redraw it to the new component.</p>

      <h2 className="text-2xl font-bold mb-4 mt-10">3. Palace Simulation Immediately Fails</h2>
      <p className="text-slate-600 mb-2"><strong>Symptom:</strong> Simulation task changes from 'Pending' to 'Failed' within 10 seconds.</p>
      <p className="text-slate-600 mb-6"><strong>Fix:</strong> This is almost always a Gmsh meshing failure. If your geometric tolerances are too tight (e.g., a 0.1µm gap width), the mesher creates too many tetrahedrons and runs out of RAM. Increase your gap width or decrease the "Mesh Refinement" setting before simulating.</p>

      <AlertBox type="tip" title="Checking Logs">
        If you are running locally via Docker, you can inspect the exact mesher error by running \`docker-compose logs -f worker\`.
      </AlertBox>
    </div>
  );
}`,

  'best-practices.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Design Best Practices</h1>
      <p className="text-lg text-slate-600 mb-8">
        Adhering to these principles will dramatically increase the likelihood of your physical chip actually performing quantum algorithms successfully.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Parametric over Hardcoded</h2>
      <p className="text-slate-600 mb-6">
        Never hardcode absolute positions (\`pos_x: 1250um\`) for an entire lattice. If the foundry requires you to shrink the chip size by 10%, you will have to recalculate 100 coordinates manually. Always use the provided Lattice Macros (like \`SquareGrid\` or \`HeavyHexTopology\`) which calculate positions relatively based on a \`qubit_spacing\` variable.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Ground Plane Stitching</h2>
      <p className="text-slate-600 mb-6">
        When routing dense CPW lines, the ground plane becomes fractured. These massive unbroken stretches of metal can host unwanted microwave box modes.
      </p>
      
      <AlertBox type="warning" title="Vias and Airbridges">
        You must periodically "stitch" the ground planes together over the CPW traces using Airbridges, or use TSVs (Through-Silicon Vias) to connect to a backside ground plane. Silicofeller provides an "Auto-Bridge" tool that automatically places airbridges every $\\lambda/8$ along transmission lines. Use it.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Mitigate Crosstalk Physically</h2>
      <p className="text-slate-600 mb-6">
        Do not route CPW lines parallel to each other over long distances. If two lines must travel parallel, keep them separated by at least 10x their gap width to prevent capacitive cross-talk, or route them orthogonally to each other.
      </p>
    </div>
  );
}`,

  'support-faq.tsx': `import React from "react";

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
}`,

  'security-configuration.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Security & Deployment Guidelines</h1>
      <p className="text-lg text-slate-600 mb-8">
        Quantum IP is highly sensitive. Whether deploying via Docker or using the cloud service, you must secure your instance properly.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Cloud Data Encryption</h2>
      <p className="text-slate-600 mb-6">
        All QCLang ASTs and simulation results stored in the Silicofeller Cloud are encrypted at rest using AES-256. Database volumes are managed by AWS RDS with KMS encryption keys.
      </p>

      <AlertBox type="warning" title="ITAR / Export Controls">
        In many jurisdictions, advanced quantum processor layouts are restricted by export controls (e.g., ITAR in the US). If your project falls under these regulations, you <strong>cannot</strong> use the public SaaS cloud. You must deploy the on-premise Docker stack within your organization's air-gapped intranet.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Securing Local Deployments</h2>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>Change Default Passwords:</strong> The Docker Compose file includes default PostgreSQL and Redis credentials. Change these immediately using environment variables before running in production.</li>
        <li><strong>Reverse Proxy:</strong> Do not expose the FastAPI backend directly to the internet. Always place it behind a reverse proxy like Nginx or Traefik, configured with strict TLS 1.3 certificates.</li>
        <li><strong>Rotate JWT Secrets:</strong> Ensure the \`JWT_SECRET\` environment variable is generated securely (\`openssl rand -hex 32\`) and rotated regularly.</li>
      </ul>
    </div>
  );
}`
};

Object.keys(files).forEach(file => {
  fs.writeFileSync(path.join(dir, file), files[file], 'utf8');
});
console.log('Batch 5 expanded');
