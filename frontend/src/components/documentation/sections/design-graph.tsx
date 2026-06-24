import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Graph Validation</h1>
      <p className="text-lg text-slate-600 mb-8">
        Before processing physical polygons, the engine validates the underlying Abstract Syntax Tree (AST) as a pure mathematical graph.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Acyclic Verification</h2>
      <p className="text-slate-600 mb-6">
        The routing graph must be valid. While you can create physical feedback loops with transmission lines, the logical netlist must not contain unresolvable infinite topological cycles.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Extracting the Adjacency Matrix</h2>
      <p className="text-slate-600 mb-6">
        You can export the pure topological state of your design as a JSON adjacency matrix. This is incredibly useful for interfacing with external quantum compiling tools that need to know the connectivity graph (e.g., for SWAP mapping).
      </p>
      
      <CodeBlock language="json" code={`{
  "project_id": "Falcon_V1",
  "nodes": ["Q1", "Q2", "Q3", "Res1"],
  "adjacency": [
    [0, 1, 0, 1],
    [1, 0, 1, 0],
    [0, 1, 0, 0],
    [1, 0, 0, 0]
  ]
}`} />
      <p className="text-sm text-slate-500 mt-2">A '1' indicates a direct capacitive coupling or a CPW route between components.</p>
    </div>
  );
}