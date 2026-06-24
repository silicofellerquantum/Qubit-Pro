import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Schematic Editor Overview</h1>
      <p className="text-lg text-slate-600 mb-8">
        The WebGL-accelerated Schematic Editor is the core visual workspace where quantum logic maps to physical geometries.
      </p>

      <div className="bg-slate-900 rounded-xl p-2 mb-10 shadow-lg">
        <img src="/assets/screens/schematic-editor-overview.webp" alt="Schematic Editor" className="w-full rounded-lg opacity-90" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      </div>

      <h2 className="text-2xl font-bold mb-4">Coordinate System</h2>
      <p className="text-slate-600">
        The editor operates on an infinite Cartesian plane. 1 unit = 1 micrometer (µm) by default. The grid snapping resolution can be toggled down to 0.1 µm for precision placement.
      </p>
    </div>
  );
}
