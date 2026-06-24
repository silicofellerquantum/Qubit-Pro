import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">GDSII Generation</h1>
      <p className="text-lg text-slate-600 mb-8">
        GDSII (Graphic Data System II) is the standard binary file format for controlling lithography photomask generation.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-10">
        <h3 className="font-bold text-slate-900 mb-4 border-b pb-2">Default Layer Mapping</h3>
        <dl className="space-y-3 text-sm">
          <div className="flex"><dt className="w-24 font-bold text-slate-700">Layer 1:</dt><dd className="text-slate-600">Base ground plane (Nb)</dd></div>
          <div className="flex"><dt className="w-24 font-bold text-slate-700">Layer 2:</dt><dd className="text-slate-600">Base metallization subtraction (etching)</dd></div>
          <div className="flex"><dt className="w-24 font-bold text-slate-700">Layer 3:</dt><dd className="text-slate-600">Josephson Junction dose (Al)</dd></div>
          <div className="flex"><dt className="w-24 font-bold text-slate-700">Layer 4:</dt><dd className="text-slate-600">Bandage/galvanic connections</dd></div>
        </dl>
      </div>

      <AlertBox type="warning" title="Polygon Resolution">
        Ensure your polygon discretization resolution is set appropriately for your e-beam writer. Too fine a resolution generates huge GDS files that crash stepper software.
      </AlertBox>
    </div>
  );
}
