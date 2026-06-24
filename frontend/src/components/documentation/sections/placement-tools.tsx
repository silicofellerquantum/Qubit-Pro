import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Placing Components</h1>
      <p className="text-lg text-slate-600 mb-8">
        Components can be dragged from the Library panel or instantiated via the QCLang command prompt.
      </p>

      <div className="space-y-6 mb-10">
        <div className="flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center">1</div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">Select</h3>
            <p className="text-slate-600">Click a component in the left sidebar library.</p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center">2</div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">Position</h3>
            <p className="text-slate-600">Move your cursor onto the canvas. The component will shadow your cursor.</p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center">3</div>
          <div>
            <h3 className="font-bold text-lg text-slate-900">Drop & Snap</h3>
            <p className="text-slate-600">Click to place. Holding SHIFT disables grid snapping.</p>
          </div>
        </div>
      </div>

      <AlertBox type="tip" title="Auto-Padding">
        When placing qubits near each other, the editor automatically calculates required keep-out zones to prevent DRC spacing violations.
      </AlertBox>
    </div>
  );
}
