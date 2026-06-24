import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Validate Connectivity</h1>
      <p className="text-lg text-slate-600 mb-8">
        Once the abstract graph is validated, the pipeline checks the physical routing constraints of your Coplanar Waveguides.
      </p>

      <div className="my-8 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <img src="/brain/63033335-280b-4630-beb9-8bb527edd274/media__1782263546237.png" alt="Routing Grid" className="w-full h-auto object-cover" />
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Dangling Nets and T-Junctions</h2>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>Dangling Nets:</strong> An open transmission line (a line connected to a pin on one end but floating in empty space on the other) acts as a massive antenna, drastically altering the chip's capacitance matrix. These are immediately flagged.</li>
        <li><strong>T-Junctions:</strong> Drawing a wire that intersects the middle of another wire creates a T-Junction. This causes severe impedance mismatch and scattering. The DRC engine forbids arbitrary T-junctions; you must instantiate an explicit `Splitter` component instead.</li>
      </ul>

      <AlertBox type="tip" title="Pin Snapping">
        If a route fails connectivity validation but visually appears connected, the route may be off by a few micrometers. Ensure you use the automated "Pin Snap" feature when completing a wire trace.
      </AlertBox>
    </div>
  );
}