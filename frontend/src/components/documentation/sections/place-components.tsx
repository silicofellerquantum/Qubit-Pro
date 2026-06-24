import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Place Components</h1>
      <p className="text-lg text-slate-600 mb-8">
        Learn how to accurately instantiate and position QComponents onto the chip canvas.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Drag and Drop Workflow</h2>
      <ol className="list-decimal pl-6 space-y-4 text-slate-600 mb-10">
        <li>
          <strong className="text-slate-900">Select a Component:</strong> Open the left-hand Component Library. Find the desired component (e.g., `TransmonCross`).
        </li>
        <li>
          <strong className="text-slate-900">Drag to Canvas:</strong> Click and hold the component icon, drag it over the central grid, and release.
        </li>
        <li>
          <strong className="text-slate-900">Grid Snapping:</strong> By default, the component's origin will snap to the nearest 100µm grid intersection. This ensures that coplanar waveguide routing remains perfectly rectilinear.
        </li>
      </ol>

      <h2 className="text-2xl font-bold mb-4 mt-10">Precise Coordinate Entry</h2>
      <p className="text-slate-600 mb-6">
        While drag-and-drop is useful for prototyping, high-fidelity designs often require exact positioning.
      </p>
      <p className="text-slate-600 mb-6">
        With a component selected, locate the <strong>Position (X, Y)</strong> and <strong>Rotation (θ)</strong> fields in the right-hand Properties Inspector. You can manually type exact micrometer coordinates here. Rotation is applied around the component's defined origin point (usually its geometric center).
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Duplication and Arrays</h2>
      <p className="text-slate-600 mb-6">
        To rapidly populate a grid:
      </p>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li>Select an existing configured component.</li>
        <li>Press <kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs font-sans">Ctrl</kbd> + <kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs font-sans">D</kbd> to duplicate it. The duplicate will spawn slightly offset, preserving all physics parameters.</li>
      </ul>
    </div>
  );
}