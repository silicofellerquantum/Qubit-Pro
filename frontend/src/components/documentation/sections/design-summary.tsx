import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Design Summary Report</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Design Summary provides a high-level bill of materials (BOM) and metric overview of your completed quantum processor.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Key Metrics Tracked</h2>
      <ul className="space-y-4 mb-8">
        <li className="bg-slate-50 p-5 rounded-lg border border-slate-200 shadow-sm">
          <strong className="text-slate-900 block mb-2 text-lg">Component Count</strong>
          <span className="text-slate-600">Total number of Qubits, Resonators, Feedlines, and Pads. Useful for verifying that the expected topology was instantiated correctly.</span>
        </li>
        <li className="bg-slate-50 p-5 rounded-lg border border-slate-200 shadow-sm">
          <strong className="text-slate-900 block mb-2 text-lg">Total Die Area</strong>
          <span className="text-slate-600">The physical bounding box of the layout. Crucial for ensuring the design fits within the reticle limits of the foundry's stepper machine (e.g., max 20mm x 20mm).</span>
        </li>
        <li className="bg-slate-50 p-5 rounded-lg border border-slate-200 shadow-sm">
          <strong className="text-slate-900 block mb-2 text-lg">Pin/Pad Count</strong>
          <span className="text-slate-600">The number of external wirebond connections required. This dictates what type of cryogenic sample holder and PCB you will need to purchase.</span>
        </li>
      </ul>

      <h2 className="text-2xl font-bold mb-4 mt-10">Export Formats</h2>
      <p className="text-slate-600 mb-6">
        The Summary Report can be exported as a PDF for management review, or as a JSON file for automated integration into inventory management systems.
      </p>
    </div>
  );
}