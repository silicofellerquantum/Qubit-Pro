import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">QCLang Export</h1>
      <p className="text-lg text-slate-600 mb-8">
        Export your visual schematic back into its underlying QCLang source code.
      </p>

      <h2 className="text-2xl font-bold mb-4">Round-Trip Engineering</h2>
      <p className="text-slate-600 mb-6">
        Silicofeller guarantees 100% round-trip fidelity between visual dragging-and-dropping and QCLang text generation.
      </p>
      
      <CodeBlock language="qclang" code={`design "Falcon-RevA" {
  component Q1: TransmonCross(freq=5.0GHz);
  component Res1: QuarterWave(freq=6.5GHz);
  
  route Q1.readout -> Res1.in;
}`} />
    </div>
  );
}
