import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Use the Properties Inspector</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Properties Inspector is the control center for fine-tuning the physics and geometries of individual components.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Dynamic Parameter Injection</h2>
      <p className="text-slate-600 mb-6">
        The inspector fields are dynamically generated based on the selected component's QCLang schema. This means a Transmon will display completely different properties than a Quarter-Wave Resonator.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-10">
        <h3 className="font-bold text-slate-900 mb-4 border-b pb-2">Common Property Categories</h3>
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="font-bold text-indigo-700 text-base">Physics Targets</dt>
            <dd className="text-slate-600 mt-1">High-level goals like <code>target_freq</code> or <code>target_anharmonicity</code>. Modifying these will cause the solver to automatically recalculate required geometry.</dd>
          </div>
          <div>
            <dt className="font-bold text-indigo-700 text-base">Geometry Dimensions</dt>
            <dd className="text-slate-600 mt-1">Explicit physical sizes like <code>cross_width</code>, <code>pad_gap</code>, or <code>trace_width</code>. Overriding these manually will lock the component out of automated physics solving.</dd>
          </div>
          <div>
            <dt className="font-bold text-indigo-700 text-base">Material Overrides</dt>
            <dd className="text-slate-600 mt-1">Allows you to specify specific loss tangents or dielectric constants for a single component, overriding the global chip substrate settings.</dd>
          </div>
        </dl>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Variables and Expressions</h2>
      <p className="text-slate-600 mb-6">
        You do not have to enter hardcoded numbers. The properties inspector supports mathematical expressions and referencing global variables. 
        For example, instead of typing <code>20um</code> for a gap width, you can type <code>global_cpw_gap * 1.5</code>. If the global variable changes, the component automatically updates.
      </p>
    </div>
  );
}