import React from "react";
import { CodeBlock } from "../CodeBlock";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Create a Simulation Task</h1>
      <p className="text-lg text-slate-600 mb-8">
        Solving Maxwell's equations for large quantum chips requires immense computational power. Heavy physics simulations are entirely decoupled from the frontend and offloaded to our scalable cloud compute cluster.
      </p>

      <div className="my-8 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <img src="/brain/63033335-280b-4630-beb9-8bb527edd274/system_architecture_1782265216047.png" alt="Simulation Architecture" className="w-full h-auto object-cover" />
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Submission via the UI</h2>
      <p className="text-slate-600 mb-6">
        Click the <strong>"Simulate"</strong> button in the top toolbar. You can select either the fast <strong>LOM Solver</strong> (for capacitance matrix extraction) or the highly rigorous <strong>Palace FEA</strong> (for full wave electromagnetics).
      </p>

      <AlertBox type="info" title="Asynchronous Processing">
        Simulations can take anywhere from 5 minutes to 48 hours depending on mesh resolution. The UI will provide a persistent progress bar. You can close your browser; you will receive an email notification when the results are written to the database.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">API Submission</h2>
      <p className="text-slate-600 mb-6">
        For CI/CD pipelines, you can trigger simulations programmatically.
      </p>
      
      <CodeBlock language="bash" code={`curl -X POST https://api.silicofeller.com/v1/simulations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "project_id": "proj_99xx",
    "solver": "LOM",
    "mesh_resolution": "fine",
    "notify_email": "engineer@company.com"
  }'`} />
    </div>
  );
}