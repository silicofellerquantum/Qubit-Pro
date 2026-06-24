import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">API Reference</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Silicofeller platform offers a comprehensive suite of APIs for programmatic control over the design, simulation, and deployment lifecycle.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm text-center">
          <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <span className="text-blue-600 font-bold text-xl">Py</span>
          </div>
          <h3 className="font-bold text-slate-900 mb-2">Python SDK</h3>
          <p className="text-sm text-slate-600">The primary interface for quantum engineers. Automate topologies and run large-scale parameter sweeps.</p>
        </div>
        
        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm text-center">
          <div className="w-16 h-16 mx-auto bg-purple-100 rounded-full flex items-center justify-center mb-4">
            <span className="text-purple-600 font-bold text-xl">REST</span>
          </div>
          <h3 className="font-bold text-slate-900 mb-2">REST API</h3>
          <p className="text-sm text-slate-600">Standardized HTTP endpoints for CI/CD integration, user management, and triggering batch simulations.</p>
        </div>
        
        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm text-center">
          <div className="w-16 h-16 mx-auto bg-emerald-100 rounded-full flex items-center justify-center mb-4">
            <span className="text-emerald-600 font-bold text-xl">WS</span>
          </div>
          <h3 className="font-bold text-slate-900 mb-2">WebSockets</h3>
          <p className="text-sm text-slate-600">Real-time bi-directional streaming. Used for collaborative multi-user editing and live simulation progress bars.</p>
        </div>
      </div>
    </div>
  );
}