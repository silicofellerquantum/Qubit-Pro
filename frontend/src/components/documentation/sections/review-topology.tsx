import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content">
      <h1 className="text-4xl font-extrabold mb-6">Review Generated Topology</h1>
      <p className="text-lg text-slate-600 mb-8">
        Once the Copilot synthesizes a design, you must review the logical connectivity matrix before proceeding to physics analysis.
      </p>

      <div className="flex flex-col md:flex-row gap-8 mb-10 items-start">
        <div className="flex-1 text-slate-600 space-y-4">
          <p>
            The topology viewer renders qubits as nodes and couplers as edges. 
            Hovering over an edge reveals its computed coupling strength (g-rate).
          </p>
          <ul className="list-decimal pl-5 space-y-2">
            <li>Check for isolated qubits (nodes with 0 edges).</li>
            <li>Verify max degree constraints (e.g., degree &gt; 4 usually causes crowding).</li>
            <li>Ensure symmetric placement if required by your error-correcting code.</li>
          </ul>
        </div>
        <div className="flex-1 bg-slate-900 rounded-xl p-6 w-full flex items-center justify-center min-h-[200px]">
          {/* Simple abstract node graph representation */}
          <div className="relative w-32 h-32">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-indigo-500 border-2 border-white shadow-lg flex items-center justify-center text-xs text-white font-bold">Q0</div>
            <div className="absolute bottom-0 left-0 w-8 h-8 rounded-full bg-indigo-500 border-2 border-white shadow-lg flex items-center justify-center text-xs text-white font-bold">Q1</div>
            <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-indigo-500 border-2 border-white shadow-lg flex items-center justify-center text-xs text-white font-bold">Q2</div>
            <div className="absolute top-4 left-1/2 bottom-4 w-0.5 bg-slate-600 -z-10 rotate-45 origin-top-left"></div>
            <div className="absolute top-4 right-1/2 bottom-4 w-0.5 bg-slate-600 -z-10 -rotate-45 origin-top-right"></div>
            <div className="absolute bottom-4 left-4 right-4 h-0.5 bg-slate-600 -z-10"></div>
          </div>
        </div>
      </div>

      <AlertBox type="warning" title="Manual Overrides">
        Any manual deletions of edges in the Topology Viewer will automatically sync back to your QCLang source code, permanently modifying the AST.
      </AlertBox>
    </div>
  );
}
