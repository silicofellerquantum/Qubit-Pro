import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Four-Domain DRC: Connectivity & Ground</h1>
      <p className="text-lg text-slate-600 mb-8">
        The final phase of the DRC suite validates the macroscopic electrical integrity of the entire chip mask, focusing heavily on ground plane continuity.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Ground Plane Topology</h2>
      <p className="text-slate-600 mb-6">
        Superconducting chips rely on an infinite ground plane. Every time you draw a CPW line, you etch away a gap, carving a "moat" into the ground plane.
      </p>

      <p className="text-slate-600 mb-6">
        If you route your lines in a closed loop (e.g., surrounding a qubit completely with feedlines), you create a <strong>Ground Island</strong>. This is a piece of metal that is physically disconnected from the main ground plane.
      </p>

      <div className="bg-rose-50 border-l-4 border-rose-500 p-4 mb-8 rounded-r-xl">
        <h3 className="text-rose-800 font-bold mb-1">The Danger of Ground Islands</h3>
        <p className="text-rose-700 text-sm">Isolated ground patches have undefined electrical potential. They will act as parasitic resonators with spurious modes that aggressively couple to and destroy nearby qubits. The DRC engine computes the topological Euler characteristic of the ground plane to mathematically guarantee zero islands exist.</p>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Wirebond Accessibility</h2>
      <p className="text-slate-600 mb-6">
        The final check ensures that all defined Launch Pads (the points where off-chip cables connect) are located on the outer perimeter of the chip boundary.
      </p>
      <AlertBox type="info" title="Packaging Limits">
        If a launch pad is placed in the center of the chip, the physical wirebonder cannot reach it without the bonding wire crossing over (and shorting to) the rest of the chip.
      </AlertBox>
    </div>
  );
}