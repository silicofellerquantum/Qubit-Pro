import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content">
      <h1 className="text-4xl font-extrabold mb-6">Quick Start</h1>
      <p className="text-lg text-[var(--muted)] mb-8">
        Get up and running with Silicofeller Quantum Studio in under five minutes.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="p-6 border border-slate-200 rounded-xl bg-slate-50">
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold mb-4">1</div>
          <h3 className="font-bold text-slate-900 mb-2">Install CLI</h3>
          <p className="text-sm text-slate-600">Download the Silicofeller command-line tool.</p>
        </div>
        <div className="p-6 border border-slate-200 rounded-xl bg-slate-50">
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold mb-4">2</div>
          <h3 className="font-bold text-slate-900 mb-2">Authenticate</h3>
          <p className="text-sm text-slate-600">Link your local environment to your Studio account.</p>
        </div>
        <div className="p-6 border border-slate-200 rounded-xl bg-slate-50">
          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold mb-4">3</div>
          <h3 className="font-bold text-slate-900 mb-2">Initialize</h3>
          <p className="text-sm text-slate-600">Bootstrap a new quantum layout repository.</p>
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-4">Local Environment Setup</h2>
      <CodeBlock language="bash" code={`# Install globally via npm
npm install -g silicofeller-cli

# Authenticate with your API key
silico auth login

# Initialize your first layout project
silico init my-first-chip`} />

      <AlertBox type="info" title="Node.js Requirement" className="mt-8">
        Ensure you are running Node.js version 18.0.0 or higher to avoid WebAssembly compilation errors during local DRC simulation.
      </AlertBox>
    </div>
  );
}
