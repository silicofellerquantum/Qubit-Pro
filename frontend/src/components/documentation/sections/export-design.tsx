import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Export a Design</h1>
      <p className="text-lg text-slate-600 mb-8">
        Once validation and simulations are complete, you must export your design into standard industry formats for physical fabrication or external simulation.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">GDSII (Graphic Data System)</h2>
      <p className="text-slate-600 mb-6">
        GDSII is the standard file format for communicating 2D integrated circuit layouts to a foundry. It contains binary representations of planar geometric shapes, text labels, and layer assignments.
      </p>

      <AlertBox type="warning" title="Negative vs Positive Masks">
        Foundries use different photolithography processes. If your foundry uses a "Positive Resist" process, you must export a <strong>Negative Mask</strong> (where polygons represent areas where metal is etched away). Verify this with your fabrication facility before generating the GDSII!
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">OASIS Format</h2>
      <p className="text-slate-600 mb-6">
        For massive multi-qubit chips, GDSII files can exceed several gigabytes. Silicofeller supports exporting to the OASIS (Open Artwork System Interchange Standard) format, which offers up to 10x file size compression over GDSII without losing precision.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Exporting to External CAD</h2>
      <p className="text-slate-600 mb-6">
        If you need to perform thermal or mechanical stress analysis on your chip package, you can export the 3D volumetric representation to standard CAD formats:
      </p>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>STEP (.stp):</strong> Standardized 3D model format.</li>
        <li><strong>STL:</strong> Mesh format (not recommended for exact physics, but useful for 3D printing custom sample holders).</li>
      </ul>
    </div>
  );
}