import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Troubleshooting</h1>
      <p className="text-lg text-slate-600 mb-8">
        Solutions for common issues encountered during layout, DRC, and simulation.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">1. WebGL Canvas Crashing / Sluggish</h2>
      <p className="text-slate-600 mb-2"><strong>Symptom:</strong> The editor tab freezes or Chrome displays the "Aw, Snap!" memory error.</p>
      <p className="text-slate-600 mb-6"><strong>Fix:</strong> You likely have thousands of overlapping polygons caused by an infinite `for` loop in your QCLang script, or Hardware Acceleration is disabled in your browser settings. Check `chrome://settings/system` to ensure "Use hardware acceleration when available" is toggled ON.</p>

      <h2 className="text-2xl font-bold mb-4 mt-10">2. "Unresolved Pin Reference" in DRC</h2>
      <p className="text-slate-600 mb-2"><strong>Symptom:</strong> Level 3 Fatal Error preventing GDSII export.</p>
      <p className="text-slate-600 mb-6"><strong>Fix:</strong> You drew a wire to a component (e.g., `Q1`), but then deleted `Q1` and replaced it with `Q2`. The wire is still trying to route to `Q1.east`. Delete the dangling wire and redraw it to the new component.</p>

      <h2 className="text-2xl font-bold mb-4 mt-10">3. Palace Simulation Immediately Fails</h2>
      <p className="text-slate-600 mb-2"><strong>Symptom:</strong> Simulation task changes from 'Pending' to 'Failed' within 10 seconds.</p>
      <p className="text-slate-600 mb-6"><strong>Fix:</strong> This is almost always a Gmsh meshing failure. If your geometric tolerances are too tight (e.g., a 0.1µm gap width), the mesher creates too many tetrahedrons and runs out of RAM. Increase your gap width or decrease the "Mesh Refinement" setting before simulating.</p>

      <AlertBox type="tip" title="Checking Logs">
        If you are running locally via Docker, you can inspect the exact mesher error by running `docker-compose logs -f worker`.
      </AlertBox>
    </div>
  );
}