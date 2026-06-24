import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Latest Release Details</h1>
      <p className="text-lg text-slate-600 mb-8">
        Deep dive into the architecture changes introduced in v2.4.0.
      </p>

      <AlertBox type="info" title="Platform Rollout">
        This release is currently being rolled out to Enterprise tenants. Community edition users will receive this update on June 1st.
      </AlertBox>

      <h2 className="text-2xl font-bold mt-10 mb-6">Feature Breakdown</h2>
      
      <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 mb-10 overflow-x-auto">
        {/* We use standard markdown pre for Mermaid support in the UI if implemented, or just a code block simulating it */}
        <pre className="text-sm font-mono text-slate-800">
{`pie title Release v2.4.0 Focus Areas
    "433-Qubit Topology Engine" : 45
    "DRC Enhancement" : 25
    "Export Targets (Ansys)" : 20
    "Bug Fixes" : 10`}
        </pre>
      </div>

      <h3 className="text-xl font-bold mb-4">433-Qubit Osprey Support</h3>
      <p className="text-slate-600 mb-4">
        Scaling beyond 127 qubits required a complete rewrite of our A* routing heuristic. The new parallelized routing engine calculates non-intersecting meandering feedlines for 433-qubit layouts in under 48 seconds.
      </p>

    </div>
  );
}
