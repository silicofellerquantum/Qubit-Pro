import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">DXF Export</h1>
      <p className="text-lg text-slate-600 mb-8">
        DXF format is supported primarily for integration with CAD/CAM software (like SolidWorks) for designing macroscopic copper packaging and sample holders.
      </p>

      <h2 className="text-2xl font-bold mb-4">Limitations</h2>
      <p className="text-slate-600">
        DXF does not robustly support complex hierarchical Boolean operations. For direct lithography, always use GDSII.
      </p>
    </div>
  );
}
