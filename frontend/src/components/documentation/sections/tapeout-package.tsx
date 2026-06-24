import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">The Tapeout Package (.zip)</h1>
      <p className="text-lg text-slate-600 mb-8">
        The ultimate deliverable of Silicofeller Quantum Studio is the Tapeout Package—a single ZIP archive containing everything the foundry needs to build your quantum chip.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Package Contents</h2>
      
      <ul className="space-y-4 mb-8">
        <li className="flex items-start gap-4 p-4 border border-slate-200 rounded-xl">
          <div className="bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded">1</div>
          <div>
            <h3 className="font-bold text-slate-900">Mask Files</h3>
            <p className="text-slate-600 text-sm">The `design.gds` or `design.oas` files containing the 2D polygon layouts.</p>
          </div>
        </li>
        <li className="flex items-start gap-4 p-4 border border-slate-200 rounded-xl">
          <div className="bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded">2</div>
          <div>
            <h3 className="font-bold text-slate-900">Documentation</h3>
            <p className="text-slate-600 text-sm">The PDF Tapeout Report, including layer definitions and critical dimension targets.</p>
          </div>
        </li>
        <li className="flex items-start gap-4 p-4 border border-slate-200 rounded-xl">
          <div className="bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded">3</div>
          <div>
            <h3 className="font-bold text-slate-900">Source Code</h3>
            <p className="text-slate-600 text-sm">The `qiskit_metal_export.py` script used to generate the polygons, provided for reproducibility and auditing.</p>
          </div>
        </li>
        <li className="flex items-start gap-4 p-4 border border-slate-200 rounded-xl">
          <div className="bg-blue-100 text-blue-700 font-bold px-3 py-1 rounded">4</div>
          <div>
            <h3 className="font-bold text-slate-900">Digital Signatures</h3>
            <p className="text-slate-600 text-sm">A `checksums.txt` file containing SHA-256 hashes of all files in the archive to detect corruption during transfer.</p>
          </div>
        </li>
      </ul>

      <p className="text-slate-600 mt-8 italic">
        Once you download the Tapeout Package, email or securely transfer it to your fabrication partner. Your work in the software is done; now the physics takes over!
      </p>
    </div>
  );
}