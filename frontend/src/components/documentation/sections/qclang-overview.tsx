import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">QCLang Overview</h1>
      <p className="text-lg text-slate-600 mb-8">
        QCLang (Quantum Circuit Language) is Silicofeller's proprietary Domain Specific Language (DSL). It acts as the immutable source of truth bridging the Visual Schematic Editor and the backend physics compilers.
      </p>

      <div className="my-8 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <img src="/brain/63033335-280b-4630-beb9-8bb527edd274/qclang_api_1782265202083.png" alt="API Integration" className="w-full h-auto object-cover" />
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Why a DSL?</h2>
      <p className="text-slate-600 mb-6">
        While Qiskit Metal is powerful, writing raw Python code to place 100 qubits is tedious and error-prone. QCLang is a declarative, JSON-like language optimized specifically for describing topological graphs and physical parametric components.
      </p>
      
      <p className="text-slate-600 mb-6">
        When you drag a component in the UI, the frontend modifies the QCLang Abstract Syntax Tree (AST). This AST is highly compressible, mathematically provable, and instantly translatable into Python, GDSII, or Gmsh formats.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Core Syntax Concepts</h2>
      <CodeBlock language="json" code={`// QCLang is structured in blocks
project {
  name: "Falcon_V1"
  foundry: "MIT_LL"
}

// Global Variables
vars {
  gap_width = 5um
  substrate_eps = 11.45
}

// Component Instantiation
component TransmonCross as Q1 {
  pos_x: 0
  pos_y: 0
  cross_width: 30um
}
`} />
    </div>
  );
}