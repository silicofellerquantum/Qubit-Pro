import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Schematic Editor Overview</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Silicofeller Schematic Editor is a high-performance WebGL canvas where you physically drag, drop, and wire together your quantum processor. It acts as the visual front-end to the underlying QCLang Abstract Syntax Tree.
      </p>

      <div className="my-8 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <img src="/brain/63033335-280b-4630-beb9-8bb527edd274/system_architecture_1782265216047.png" alt="Architecture" className="w-full h-auto object-cover" />
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Core Interface Regions</h2>
      <p className="text-slate-600 mb-6">
        The editor is divided into four primary panels:
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
          <h3 className="font-bold text-slate-900 mb-2">1. Component Palette (Left)</h3>
          <p className="text-sm text-slate-600">Contains categorized QComponents (Qubits, Resonators, Feedlines). Drag items from here onto the central canvas.</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
          <h3 className="font-bold text-slate-900 mb-2">2. Infinite Canvas (Center)</h3>
          <p className="text-sm text-slate-600">A pannable, zoomable WebGL grid where components are placed and routed. Features automatic snapping and grid alignment.</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
          <h3 className="font-bold text-slate-900 mb-2">3. Properties Inspector (Right)</h3>
          <p className="text-sm text-slate-600">Displays the modifiable physics and geometric parameters (like frequencies, capacitance lengths) for the currently selected component.</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
          <h3 className="font-bold text-slate-900 mb-2">4. Toolbar (Top)</h3>
          <p className="text-sm text-slate-600">Houses controls for validation, DRC execution, simulation launching, and GDSII export.</p>
        </div>
      </div>

      <AlertBox type="info" title="Bi-directional Sync">
        Any changes made in the visual editor instantly update the underlying QCLang code, and vice versa. There is no "compilation step" required to see visual updates.
      </AlertBox>
    </div>
  );
}