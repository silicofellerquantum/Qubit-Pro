import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Design Pipeline Overview</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Silicofeller Validation Pipeline ensures that your visual schematic translates correctly into physical physics without disastrous manufacturing errors.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-x-auto mb-10">
        <pre className="text-sm font-mono text-slate-800">
{`graph TD
    A[Visual Graph (AST)] --> B{1. Graph Validation}
    B -->|Passed| C{2. Geometry DRC}
    C -->|Passed| D{3. Frequency DRC}
    D -->|Passed| E{4. Fabrication DRC}
    B -.->|Failed| F[Error Report]
    C -.->|Failed| F
    D -.->|Failed| F
    E -.->|Failed| F
    E -->|Passed| G[Simulation Ready]`}
        </pre>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Why Sequential?</h2>
      <p className="text-slate-600 mb-6">
        The pipeline is strictly sequential. If Graph Validation fails (e.g., a component points to a non-existent pin), the engine will not attempt Geometry DRC. This saves immense cloud compute resources and prevents confusing, cascading false-positive errors.
      </p>

      <AlertBox type="warning" title="Halt on Failure">
        A Severity 2 (Violation) or Severity 3 (Fatal) error will immediately halt the pipeline. You cannot export a GDSII mask or trigger a Palace FEA simulation until all Severity 2+ errors are resolved.
      </AlertBox>
    </div>
  );
}