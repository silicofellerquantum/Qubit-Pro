import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Technology Stack</h1>
      <p className="text-lg text-slate-600 mb-8">
        A deep dive into the open-source libraries that power the Silicofeller Quantum platform.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10">
        <div>
          <h3 className="font-bold text-slate-900 text-xl border-b pb-2 mb-4">Frontend Layer</h3>
          <ul className="space-y-3 text-slate-600">
            <li><strong>React 18:</strong> UI component rendering and state management.</li>
            <li><strong>Zustand:</strong> High-performance atomic state management for the schematic AST, avoiding React Context re-renders.</li>
            <li><strong>PixiJS / WebGL:</strong> The rendering engine behind the 2D infinite canvas. Handles hardware-accelerated drawing of tens of thousands of CPW meander segments.</li>
            <li><strong>Tailwind CSS:</strong> Utility-first styling system used for the dark-mode documentation and UI panels.</li>
          </ul>
        </div>
        
        <div>
          <h3 className="font-bold text-slate-900 text-xl border-b pb-2 mb-4">Backend & Physics Layer</h3>
          <ul className="space-y-3 text-slate-600">
            <li><strong>Qiskit Metal:</strong> IBM's open-source library for superconducting qubit design. Used as the underlying geometric engine.</li>
            <li><strong>Gmsh:</strong> Open-source 3D finite element mesh generator. Translates 2D GDSII polygons into 3D volumetric tetrahedrons for FEA.</li>
            <li><strong>AWS Palace:</strong> Parallel finite element solver. Computes the Maxwell capacitance matrix and EPR parameters.</li>
            <li><strong>FastAPI & Celery:</strong> API routing and asynchronous task queuing.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}