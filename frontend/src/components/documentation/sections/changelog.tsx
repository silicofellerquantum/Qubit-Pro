import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-3xl">
      <h1 className="text-4xl font-extrabold mb-2">Changelog</h1>
      <p className="text-lg text-slate-600 mb-12">Track all major updates, bug fixes, and new features.</p>

      <div className="relative border-l-2 border-indigo-100 pl-8 pb-12 space-y-12 ml-4">
        
        {/* Version 2.4.0 */}
        <div className="relative">
          <div className="absolute -left-[41px] top-1 w-5 h-5 rounded-full bg-indigo-500 ring-4 ring-white" />
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <h2 className="text-2xl font-bold text-slate-900">v2.4.0</h2>
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold uppercase tracking-wider rounded-full">Current Release</span>
            <span className="text-sm text-slate-500 font-medium">May 15, 2026</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
            <h4 className="font-bold text-slate-900 mb-3">Added</h4>
            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600 mb-6">
              <li>Support for 433-qubit Osprey-class Heavy Hex topologies.</li>
              <li>Four-domain DRC now includes kinetic inductance rule checking.</li>
              <li>New Export target: Direct conversion to Ansys HFSS via DXF layering.</li>
            </ul>
            <h4 className="font-bold text-slate-900 mb-3">Fixed</h4>
            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
              <li>Resolved routing crossover overlaps in high-density grid layouts.</li>
              <li>Fixed JWT token expiration bugs in the REST API.</li>
            </ul>
          </div>
        </div>

        {/* Version 2.3.0 */}
        <div className="relative">
          <div className="absolute -left-[41px] top-1 w-5 h-5 rounded-full bg-slate-300 ring-4 ring-white" />
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <h2 className="text-2xl font-bold text-slate-900">v2.3.0</h2>
            <span className="text-sm text-slate-500 font-medium">April 2, 2026</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h4 className="font-bold text-slate-900 mb-3">Added</h4>
            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600">
              <li>Design Copilot introduced for natural language generation.</li>
              <li>Interactive topology 3D viewer.</li>
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
