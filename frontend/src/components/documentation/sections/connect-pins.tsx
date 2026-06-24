import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Connect Component Pins</h1>
      <p className="text-lg text-slate-600 mb-8">
        Wiring components together establishes the graph connectivity required for both DRC checks and physical Coplanar Waveguide (CPW) generation.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Understanding Pins</h2>
      <p className="text-slate-600 mb-6">
        Every connectable QComponent exposes "Pins". A pin represents a physical coordinate and a normal vector pointing outward from the component. For example, a `TransmonCross` typically has 4 pins (North, South, East, West) extending from its cross arms.
      </p>

      <div className="my-8 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <img src="/brain/63033335-280b-4630-beb9-8bb527edd274/validation_drc_1782265191432.png" alt="Validation" className="w-full h-auto object-cover" />
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">The Wire Tool</h2>
      <p className="text-slate-600 mb-6">
        To draw a connection:
      </p>
      <ol className="list-decimal pl-6 space-y-4 text-slate-600 mb-10">
        <li>Activate the Wire Tool by pressing <kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs font-sans">W</kbd> or clicking the Wire icon in the top toolbar.</li>
        <li>Hover over a component. Valid connection pins will highlight as glowing blue dots.</li>
        <li>Click a starting pin.</li>
        <li>Click along the canvas to create routing waypoints (corners). The engine enforces Manhattan routing (90-degree angles).</li>
        <li>Click the target pin on the destination component to complete the route.</li>
      </ol>

      <AlertBox type="warning" title="Auto-Meandering">
        When connecting a Resonator, the length of the wire dictates its resonance frequency. Silicofeller includes an "Auto-Meander" feature. If you define a target frequency in the route properties, the engine will automatically fold the wire into a serpentine pattern to achieve the exact required electrical length.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Direct Coupling</h2>
      <p className="text-slate-600 mb-6">
        Not all connections require a wire. You can physically abut two components (e.g., placing a Qubit's readout pin directly adjacent to a Feedline's coupling pin) to create a direct capacitive coupling. The DRC engine automatically detects proximate pins and infers the connection.
      </p>
    </div>
  );
}