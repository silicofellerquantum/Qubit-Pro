import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Correct Invalid Couplings</h1>
      <p className="text-lg text-slate-600 mb-8">
        The physics engine enforces strict rules about what component classes are allowed to directly interact.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Error Resolution Matrix</h2>
      <div className="overflow-x-auto mb-8 border border-slate-200 rounded-xl shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-900">Error Code</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Invalid Connection</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Why it's Invalid</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Resolution</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-mono text-rose-600 font-bold">ERR_CP_01</td>
              <td className="px-6 py-4 font-medium text-slate-900">Qubit → Qubit</td>
              <td className="px-6 py-4 text-slate-600">Direct geometric abutment creates unmanageably high fixed $J$ coupling, preventing single-qubit addressing.</td>
              <td className="px-6 py-4">Insert a Tunable Coupler or a CPW bus between them.</td>
            </tr>
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-mono text-rose-600 font-bold">ERR_CP_02</td>
              <td className="px-6 py-4 font-medium text-slate-900">Resonator → Resonator</td>
              <td className="px-6 py-4 text-slate-600">Creates a massive hybridized mode that completely ruins readout multiplexing.</td>
              <td className="px-6 py-4">Route them to a common Feedline separately.</td>
            </tr>
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-mono text-rose-600 font-bold">ERR_CP_03</td>
              <td className="px-6 py-4 font-medium text-slate-900">Feedline → Feedline</td>
              <td className="px-6 py-4 text-slate-600">Shorts your input lines together, destroying the scattering matrix.</td>
              <td className="px-6 py-4">Remove connection or use an RF Diplexer.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}