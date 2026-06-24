import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Understand Severity Levels</h1>
      <p className="text-lg text-slate-600 mb-8">
        Silicofeller categorizes DRC and validation errors into four distinct severity levels to help you prioritize fixes during the layout phase.
      </p>

      <div className="space-y-6 mb-10">
        <div className="flex items-start gap-4 p-5 border border-slate-200 rounded-xl shadow-sm">
          <div className="w-5 h-5 mt-1 rounded-full bg-slate-400 flex-shrink-0"></div>
          <div>
            <h3 className="font-bold text-slate-900 text-lg">Level 0: Information</h3>
            <p className="text-slate-600 mt-2">These are best practice suggestions. For example, advising that a trace width is non-standard but technically manufacturable. Level 0 does not block simulation or GDSII export.</p>
          </div>
        </div>
        
        <div className="flex items-start gap-4 p-5 border border-amber-200 bg-amber-50 rounded-xl shadow-sm">
          <div className="w-5 h-5 mt-1 rounded-full bg-amber-500 flex-shrink-0 animate-pulse"></div>
          <div>
            <h3 className="font-bold text-amber-900 text-lg">Level 1: Warning</h3>
            <p className="text-amber-800 mt-2">Potential physics issues, such as slight frequency detuning or suboptimal Purcell filter bandwidth. The platform allows you to export the design, but forces you to acknowledge the warning first.</p>
          </div>
        </div>
        
        <div className="flex items-start gap-4 p-5 border border-orange-200 bg-orange-50 rounded-xl shadow-sm">
          <div className="w-5 h-5 mt-1 rounded-full bg-orange-500 flex-shrink-0"></div>
          <div>
            <h3 className="font-bold text-orange-900 text-lg">Level 2: Violation</h3>
            <p className="text-orange-800 mt-2">Definite physical rule breaks. Examples include overlapping geometries, shorted components, or photolithography limits breached. <strong>Blocks export to GDSII and blocks Palace FEA simulations.</strong></p>
          </div>
        </div>
        
        <div className="flex items-start gap-4 p-5 border border-rose-200 bg-rose-50 rounded-xl shadow-sm">
          <div className="w-5 h-5 mt-1 rounded-full bg-rose-600 flex-shrink-0"></div>
          <div>
            <h3 className="font-bold text-rose-900 text-lg">Level 3: Fatal</h3>
            <p className="text-rose-800 mt-2">The Abstract Syntax Tree is logically corrupted. This occurs if a component references a deleted net, or if the JSON graph contains cyclic redundancies. The rendering pipeline halts immediately.</p>
          </div>
        </div>
      </div>
    </div>
  );
}