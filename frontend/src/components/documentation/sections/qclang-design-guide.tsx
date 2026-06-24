import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <div className="mb-12 mt-8">
        <p className="text-sm font-semibold text-blue-600 tracking-wider uppercase mb-2">GUIDES</p>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--text)] mb-6">
          QCLang Design Guide
        </h1>
      </div>

      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">1. DSL workflow</h2>
        <p className="text-[var(--muted)] leading-relaxed mb-4">
          Detailed technical documentation regarding <strong>DSL workflow</strong>. 
          This section explains how dsl workflow integrates into the overall QCLang Design Guide subsystem within Silicofeller Quantum Studio.
        </p>
        <div className="p-5 bg-gray-50 border border-black/5 rounded-xl">
          <p className="text-sm text-[var(--text)] leading-relaxed font-medium mb-3">
            Core functionality for DSL workflow
          </p>
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            The DSL workflow module is engineered for maximum stability and performance within the GUIDES stack. By decoupling the core logic from presentation layers, developers can seamlessly extend and configure these capabilities. For advanced initialization parameters or integration workflows specifically targeting DSL workflow, please refer to the backend API reference or the deployment manifest documentation.
          </p>
        </div>
      </section>

      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">2. Design modeling</h2>
        <p className="text-[var(--muted)] leading-relaxed mb-4">
          Detailed technical documentation regarding <strong>Design modeling</strong>. 
          This section explains how design modeling integrates into the overall QCLang Design Guide subsystem within Silicofeller Quantum Studio.
        </p>
        <div className="p-5 bg-gray-50 border border-black/5 rounded-xl">
          <p className="text-sm text-[var(--text)] leading-relaxed font-medium mb-3">
            Core functionality for Design modeling
          </p>
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            The Design modeling module is engineered for maximum stability and performance within the GUIDES stack. By decoupling the core logic from presentation layers, developers can seamlessly extend and configure these capabilities. For advanced initialization parameters or integration workflows specifically targeting Design modeling, please refer to the backend API reference or the deployment manifest documentation.
          </p>
        </div>
      </section>

    </div>
  );
}
