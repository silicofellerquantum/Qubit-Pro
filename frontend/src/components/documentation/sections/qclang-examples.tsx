import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">QCLang Examples</h1>
      <p className="text-lg text-slate-600 mb-8">
        Real-world snippets for common layout patterns.
      </p>

      <h3 className="font-bold text-xl mb-4">Multiplexed Readout Bank</h3>
      <CodeBlock language="qclang" code={`design "ReadoutBank" {
  component Bus: Feedline(z0=50);
  component R1: Resonator(freq=6.1);
  component R2: Resonator(freq=6.3);
  
  route R1.out -> Bus.in;
  route R2.out -> Bus.in;
}`} />
    </div>
  );
}
