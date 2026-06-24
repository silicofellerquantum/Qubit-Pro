import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Review Simulation Results</h1>
      <p className="text-lg text-slate-600 mb-8">
        Once your Palace or LOM simulation completes, navigate to the Reports tab to view the extracted physics parameters and interactive charts.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">S-Parameter Interpretation</h2>
      <p className="text-slate-600 mb-6">
        For feedlines and readout resonators, you should analyze the S21 magnitude plots. 
      </p>
      
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>Resonance Dips:</strong> A sharp dip in the S21 transmission plot indicates the exact resonant frequency of the $\lambda/4$ resonator.</li>
        <li><strong>Spurious Box Modes:</strong> If you see unexpected ripples or broad absorption bands in the S-parameter plot, it means your chip size has created an electromagnetic cavity resonance. You must add wirebond "vias" across your ground planes to push these box modes to higher, harmless frequencies.</li>
      </ul>

      <AlertBox type="tip" title="Data Export">
        All generated charts are backed by raw Touchstone (.s2p, .sNp) and CSV files. You can download these from the attachments panel for further analysis in MATLAB or Python.
      </AlertBox>
    </div>
  );
}