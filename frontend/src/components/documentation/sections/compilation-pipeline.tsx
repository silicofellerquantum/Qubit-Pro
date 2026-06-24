import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <div className="mb-12 mt-8">
        <p className="text-sm font-semibold text-blue-600 tracking-wider uppercase mb-2">COMPILER</p>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--text)] mb-6">
          Compilation Pipeline
        </h1>
      </div>

      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">1. End-to-end flow</h2>
        <p className="text-[var(--muted)] leading-relaxed mb-4">
          Detailed technical documentation regarding <strong>End-to-end flow</strong>. 
          This section explains how end-to-end flow integrates into the overall Compilation Pipeline subsystem within Silicofeller Quantum Studio.
        </p>
        <div className="p-5 bg-gray-50 border border-black/5 rounded-xl">
          <p className="text-sm text-[var(--text)] leading-relaxed font-medium mb-3">
            Core functionality for End-to-end flow
          </p>
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            The End-to-end flow module is engineered for maximum stability and performance within the COMPILER stack. By decoupling the core logic from presentation layers, developers can seamlessly extend and configure these capabilities. For advanced initialization parameters or integration workflows specifically targeting End-to-end flow, please refer to the backend API reference or the deployment manifest documentation.
          </p>
          {/* Flowchart image */}
          <img src="file:///C:/Users/ASUS/.gemini/antigravity-ide/brain/44d953df-d273-4111-acf9-342057648f93/compilation_pipeline_flowchart_1782209632132.png" alt="Compilation Pipeline Flowchart" className="my-4 mx-auto rounded shadow-lg" style={{ maxWidth: "100%" }} />
          {/* Pseudo code */}
          <pre className="bg-gray-100 p-4 rounded overflow-x-auto">
{`// Pseudo code for compilation pipeline
source = readFile('program.qc')
tokens = lexer(source)
ast = parser(tokens)
optimized = optimizer(ast)
backendIR = codegen(optimized)
hardwareMap = mapToHardware(backendIR)
output = emitBinaries(hardwareMap)
`}
          </pre>
        </div>
      </section>

    </div>
  );
}
