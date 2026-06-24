import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Terminations and Lumped Elements</h1>
      <p className="text-lg text-slate-600 mb-8">
        Proper termination of CPW lines is critical to prevent microwave reflections.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Available Terminations</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
          <h3 className="font-bold text-slate-900 mb-2">Open Circuit (Open)</h3>
          <p className="text-sm text-slate-600">The center trace abruptly stops. Due to the gap, the microwave signal sees a near-infinite impedance and reflects back completely. Used at the end of $\lambda/2$ resonators.</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
          <h3 className="font-bold text-slate-900 mb-2">Short Circuit (Short)</h3>
          <p className="text-sm text-slate-600">The center trace merges directly into the ground plane. The signal sees 0 impedance. Used at the termination of $\lambda/4$ resonators and flux lines.</p>
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Lumped Elements</h2>
      <p className="text-slate-600 mb-6">
        For specialized RF simulations, you can instantiate lumped element ports. These are mathematically perfect $50\Omega$ resistors used purely for S-parameter extraction in Palace or Ansys HFSS. They do not generate physical lithography masks.
      </p>
    </div>
  );
}