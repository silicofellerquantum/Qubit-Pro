import React from "react";
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
      <CodeBlock language="bash" code={`git clone https://github.com/silicofeller/studio-frontend.git
cd studio-frontend
npm install
npm run dev`} />
      <p className="text-slate-600 mb-6 mt-4">The UI will be available at `http://localhost:3000`.</p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Starting the Backend</h2>
      <CodeBlock language="bash" code={`git clone https://github.com/silicofeller/studio-backend.git
cd studio-backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Start the FastAPI server
uvicorn main:app --reload --port 8000`} />

      <AlertBox type="warning" title="Local Simulation Limitations">
        While the geometry generation and LOM solver will run fine on a standard laptop, triggering a full Palace FEA simulation locally will likely consume 64GB+ of RAM and run for several days. We recommend using the cloud cluster for FEA.
      </AlertBox>
    </div>
  );
}