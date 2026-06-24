import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Properties Inspector</h1>
      <p className="text-lg text-slate-600 mb-8">
        Selecting any component on the canvas populates the right-hand Properties panel with editable parametrics.
      </p>

      <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        <div className="border-t border-slate-200 pt-4">
          <dt className="font-bold text-slate-900 mb-1">Geometry Parameters</dt>
          <dd className="text-sm text-slate-600">Pad width, gap spacing, fillet radius. Directly affects capacitance matrix.</dd>
        </div>
        <div className="border-t border-slate-200 pt-4">
          <dt className="font-bold text-slate-900 mb-1">Electrical Parameters</dt>
          <dd className="text-sm text-slate-600">Target frequency (GHz), Anharmonicity (MHz). Driving inputs for the synthesis engine.</dd>
        </div>
        <div className="border-t border-slate-200 pt-4">
          <dt className="font-bold text-slate-900 mb-1">Mesh Overrides</dt>
          <dd className="text-sm text-slate-600">Maximum element size for HFSS/Palace exports. Use finer meshes near junctions.</dd>
        </div>
        <div className="border-t border-slate-200 pt-4">
          <dt className="font-bold text-slate-900 mb-1">Material Overrides</dt>
          <dd className="text-sm text-slate-600">Local overrides for dielectric or metallization layers per component.</dd>
        </div>
      </dl>
    </div>
  );
}
