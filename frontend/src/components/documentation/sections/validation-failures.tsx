import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Validation Failures</h1>
      <p className="text-lg text-slate-600 mb-8">
        The DRC Engine is throwing Level 2 or Level 3 violations, preventing GDSII export.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">The "Overlapping Polygons" Error</h2>
      <p className="text-slate-600 mb-6">
        This is the most common Level 2 violation. It occurs when two components are placed too close together, causing their etched ground-plane moats to collide.
      </p>
      <p className="text-slate-600 mb-6"><strong>Fix:</strong> Increase the `pos_x` or `pos_y` distance between the components in the properties inspector, or utilize the "Auto-Layout" wand to mathematically separate them by exactly `min_spacing + 5um`.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">The "Dangling Route" Error</h2>
      <p className="text-slate-600 mb-6">
        A Level 3 Fatal error. Occurs when a `RouteMeander` tries to connect to a pin that doesn't exist (e.g., `Q1.north` on a Transmon Pocket that only has east/west pins).
      </p>

      <AlertBox type="warning" title="Pin Verification">
        Always check the <strong>Component Library</strong> reference for the specific component you are using. Different transmon classes expose differently named pins.
      </AlertBox>
    </div>
  );
}