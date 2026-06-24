import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">REST API</h1>
      <p className="text-lg text-slate-600 mb-8">
        Base URL: `https://api.silicofeller.com/v1/`
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Core Endpoints</h2>
      
      <div className="space-y-6 mb-10">
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex gap-3 items-center">
            <span className="bg-blue-600 text-white font-mono text-xs px-2 py-1 rounded font-bold">GET</span>
            <span className="font-mono text-slate-900 font-bold">/projects/&#123;id&#125;/export</span>
          </div>
          <div className="p-4 bg-white text-sm text-slate-600">
            Triggers an export task. Requires a query parameter `format=gdsii|qiskit|qclang`. Returns a task ID.
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex gap-3 items-center">
            <span className="bg-emerald-600 text-white font-mono text-xs px-2 py-1 rounded font-bold">POST</span>
            <span className="font-mono text-slate-900 font-bold">/simulations/run</span>
          </div>
          <div className="p-4 bg-white text-sm text-slate-600">
            Submit a new Palace FEA or LOM simulation to the cluster queue.
          </div>
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Rate Limiting</h2>
      <p className="text-slate-600 mb-6">
        Standard API keys are limited to 100 requests per minute. Batch simulation triggering is limited to 5 concurrent tasks per organization tier.
      </p>
    </div>
  );
}