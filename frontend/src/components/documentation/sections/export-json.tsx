import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">JSON Export</h1>
      <p className="text-lg text-slate-600 mb-8">
        The JSON format provides a completely serialized representation of your project's Abstract Syntax Tree (AST), making it ideal for version control diffs.
      </p>

      <h2 className="text-2xl font-bold mb-4">Schema Structure</h2>
      <CodeBlock language="json" code={`{
  "version": "1.2.0",
  "project": "Falcon-RevA",
  "components": [
    { "id": "Q1", "type": "TransmonCross", "params": { "freq": 5.0 } }
  ],
  "nets": [
    { "source": "Q1.readout", "target": "Res1.in" }
  ]
}`} />
    </div>
  );
}
