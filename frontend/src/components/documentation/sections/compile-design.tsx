import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Compile Design</h1>
      <p className="text-lg text-slate-600 mb-8">
        Translating AST into physical geometries.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-x-auto mb-10">
        <pre className="text-sm font-mono text-slate-800">
{`graph TD
    A[AST JSON] --> B[Component Expansion]
    B --> C[Parameter Resolution]
    C --> D[Boolean Subtraction]
    D --> E[Mesh Triangulation]`}
        </pre>
      </div>
    </div>
  );
}
