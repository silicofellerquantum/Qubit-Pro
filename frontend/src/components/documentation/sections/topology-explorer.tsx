import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Topology Explorer</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Topology Explorer is a sandbox utility for rendering massive graph structures before committing to schematic layout and physical routing.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {["Heavy Hex", "Square Grid", "Octagonal", "Linear Chain", "Star", "Kagome", "Ring", "Custom"].map(preset => (
          <div key={preset} className="border border-slate-200 rounded-lg p-4 text-center hover:bg-indigo-50 hover:border-indigo-200 transition-colors cursor-pointer group">
            <span className="font-semibold text-slate-700 group-hover:text-indigo-700">{preset}</span>
          </div>
        ))}
      </div>

      <h2 className="text-2xl font-bold mb-4">Exporting Graphs</h2>
      <p className="text-slate-600">
        You can export the pure mathematical graph structure as a NetworkX JSON payload directly from the Explorer, which is useful for offline algorithmic research.
      </p>
    </div>
  );
}
