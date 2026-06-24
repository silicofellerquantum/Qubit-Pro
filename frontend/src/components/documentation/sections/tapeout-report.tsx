import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Tapeout Report</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Tapeout Report is the final, comprehensive dossier generated right before the chip is sent to the cleanroom. It merges the Design Summary, Verification Report, and Simulation Report into one master document.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Manufacturing Instructions</h2>
      <p className="text-slate-600 mb-6">
        Beyond just data, the Tapeout Report includes critical human-readable instructions for the fabrication technicians:
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
          <h3 className="font-bold text-slate-900 mb-2">Layer Stackup</h3>
          <p className="text-sm text-slate-600">Clearly defines which GDSII layers correspond to which physical materials (e.g., Layer 1 = Niobium Base, Layer 2 = Aluminum Junctions, Layer 3 = Airbridges).</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
          <h3 className="font-bold text-slate-900 mb-2">Critical Dimensions (CD)</h3>
          <p className="text-sm text-slate-600">Lists the specific coordinates of the most sensitive features on the chip (usually the Josephson Junctions) so that SEM operators know exactly where to measure after lithography.</p>
        </div>
      </div>

      <AlertBox type="warning" title="Immutable State">
        Generating a Tapeout Report locks the current project revision. Any further changes to the schematic will force a new revision number to ensure the Tapeout Report strictly matches the exported GDSII file.
      </AlertBox>
    </div>
  );
}