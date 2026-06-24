import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Simulation Failures</h1>
      <p className="text-lg text-slate-600 mb-8">
        Your Palace FEA or LOM simulation fails mid-run and returns an error status.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">LOM Failures (Capacitance Matrix)</h2>
      <p className="text-slate-600 mb-6">
        Usually caused by the chip bounding box being too small. If the ground plane boundary is too close to a qubit, the electric field lines clip the simulation boundary, causing the electrostatic solver to diverge to infinity.
      </p>
      <p className="text-slate-600 mb-6"><strong>Fix:</strong> Go to Project Settings and increase the `Die Size (X, Y)` parameter by at least 1000µm to provide enough vacuum padding around the quantum geometries.</p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Palace Failures (Full Wave FEA)</h2>
      <ul className="space-y-4 mb-8 text-slate-600">
        <li className="bg-slate-50 p-5 rounded-lg border border-slate-200">
          <strong className="text-slate-900 block mb-1">Gmsh OOM (Out of Memory)</strong>
          The mesh is too dense. Reduce "Mesh Refinement Level" from 4 to 3, or increase the minimum trace gap width to reduce the number of tetrahedrons required.
        </li>
        <li className="bg-slate-50 p-5 rounded-lg border border-slate-200">
          <strong className="text-slate-900 block mb-1">Zero Pivot in Sparse Solver</strong>
          The matrix solver failed because a component is completely electrically disconnected from the environment. Check the Connectivity DRC before simulating.
        </li>
      </ul>
    </div>
  );
}