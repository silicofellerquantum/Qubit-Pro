import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Verification Report</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Verification Report is a cryptographic proof that the design passed all Four Domains of the DRC suite.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Compliance Certification</h2>
      <p className="text-slate-600 mb-6">
        Many external foundries require proof that a design has passed standard DRC checks before they will accept the GDSII file. If a broken file is submitted, it can crash their internal mask-generation software.
      </p>
      
      <p className="text-slate-600 mb-6">
        The Verification Report outputs a detailed log of every check performed, the thresholds used, and the timestamp of the pass.
      </p>

      <div className="bg-slate-900 text-emerald-400 p-4 rounded-xl font-mono text-sm mb-10 shadow-lg">
        [PASS] Graph Acyclic Verification<br/>
        [PASS] T-Junction Rule Check<br/>
        [PASS] Min Spacing (5um) DRC - 0 Violations<br/>
        [PASS] Frequency Collision Estimator (100MHz threshold)<br/>
        [WARN] Transmon_3 Anharmonicity (-150MHz) is below target.<br/>
        [PASS] Ground Plane Euler Characteristic: X=1 (No Islands)
      </div>

      <AlertBox type="info" title="Foundry Sign-off">
        Silicofeller Verification Reports include a cryptographic hash matching the exported GDSII file. Foundries partnered with Silicofeller can automatically verify this hash to fast-track your design into the fabrication queue.
      </AlertBox>
    </div>
  );
}