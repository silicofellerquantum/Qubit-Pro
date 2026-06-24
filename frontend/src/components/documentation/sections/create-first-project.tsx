import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content">
      <h1 className="text-4xl font-extrabold mb-4">Create Your First Project</h1>
      <p className="text-lg text-slate-600 mb-8">
        A Project in Silicofeller acts as an isolated workspace container for your AST files, schematics, and simulation reports.
      </p>

      <div className="bg-slate-900 p-8 rounded-2xl mb-10 shadow-lg">
        <h3 className="text-white font-medium mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
          Workspace Provisioning Engine
        </h3>
        <p className="text-slate-400 text-sm mb-6">
          When you create a project, our backend provisions a dedicated PostgreSQL schema and initializes a version-controlled graph database for your components.
        </p>
        <img src="/assets/screens/schematic-editor-overview.webp" alt="Workspace Initialization" className="w-full rounded-xl border border-slate-700 opacity-90" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      </div>

      <h2 className="text-2xl font-bold mb-4">API Provisioning</h2>
      <p className="mb-4 text-slate-600">Instead of the UI, you can programmatically create projects via the REST interface.</p>
      
      <CodeBlock language="bash" code={`curl -X POST https://api.silicofeller.com/v1/projects \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Falcon Prototype",
    "description": "27-qubit exploratory layout",
    "target_foundry": "IBM Quantum"
  }'`} />

      <AlertBox type="tip" title="Naming Conventions" className="mt-8">
        We recommend using semantic versioning in your project descriptions to keep track of iterative topology changes.
      </AlertBox>
    </div>
  );
}
