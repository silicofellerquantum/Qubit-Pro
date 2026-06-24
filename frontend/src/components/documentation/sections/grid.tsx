import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Grid & Surface Code Layouts</h1>
      <p className="text-lg text-slate-600 mb-8">
        Square grids are the foundation of standard surface code error correction. Every data qubit is connected to 4 measure qubits, and vice versa.
      </p>

      <h2 className="text-2xl font-bold mb-4">Distance Scaling</h2>
      <p className="text-slate-600 mb-4">
        A surface code of distance $d$ requires exactly $2d^2 - 1$ physical qubits.
      </p>
      
      <ul className="list-disc pl-5 mb-8 text-slate-600 space-y-2">
        <li><strong>d=3:</strong> 17 physical qubits (9 data, 8 measure)</li>
        <li><strong>d=5:</strong> 49 physical qubits (25 data, 24 measure)</li>
        <li><strong>d=7:</strong> 97 physical qubits (49 data, 48 measure)</li>
      </ul>

      <h2 className="text-2xl font-bold mb-4">Generation Snippet</h2>
      <CodeBlock language="qclang" code={`// Generate a d=5 Surface Code Grid
topology "SurfaceGrid" {
  type: grid;
  dimensions: 7x7; // Accounts for boundaries
  qubit_count: 49;
  routing_algorithm: manhattan_astar;
}`} />
    </div>
  );
}
