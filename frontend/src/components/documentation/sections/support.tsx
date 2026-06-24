import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Support and FAQ</h1>
      <p className="text-lg text-slate-600 mb-8">
        Answers to the most common questions from our quantum engineering community.
      </p>

      <div className="space-y-6 mb-10">
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 font-bold text-slate-900">
            Can I import my own GDSII file into Silicofeller?
          </div>
          <div className="p-5 bg-white text-slate-600">
            Currently, no. GDSII is a "baked" format (just coordinates of polygons). Silicofeller relies on the semantic QCLang AST to know what a "qubit" or a "pin" is. You must rebuild the logic in the visual editor or QCLang script.
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 font-bold text-slate-900">
            Does Silicofeller support Spin Qubits or Photonic chips?
          </div>
          <div className="p-5 bg-white text-slate-600">
            Not currently. The layout engine and physics simulators (LOM/EPR) are hardcoded for superconducting circuit QED architectures (Transmons, Fluxoniums, CPWs).
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <div className="bg-slate-50 border-b border-slate-200 px-5 py-4 font-bold text-slate-900">
            Who owns the IP of the chips I design?
          </div>
          <div className="p-5 bg-white text-slate-600">
            You do. Silicofeller claims zero intellectual property rights over the GDSII outputs or QCLang scripts generated on our platform.
          </div>
        </div>
      </div>
      
      <h2 className="text-2xl font-bold mb-4 mt-10">Contact Support</h2>
      <p className="text-slate-600 mb-6">
        Enterprise customers receive 24/7 priority support. Open a ticket via the <strong>Help</strong> menu in the application header, or email <code>support@silicofeller.com</code>.
      </p>
    </div>
  );
}