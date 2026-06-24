import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <div className="mb-12 mt-8">
        <p className="text-sm font-semibold text-blue-600 tracking-wider uppercase mb-2">EXPORT AND TAPEOUT</p>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--text)] mb-6">
          Export a Design
        </h1>
        <figure className="my-8">
          <img src="/tech/export-reports.png" alt="Export and Reports UI" className="rounded-xl border border-slate-200 shadow-sm w-full" />
          <figcaption className="text-center text-sm text-slate-500 mt-3">The export and reporting interface for Silicofeller Quantum Studio.</figcaption>
        </figure>
      </div>

      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">1. Export formats</h2>
        <p className="text-[var(--muted)] leading-relaxed mb-4">
          Detailed technical documentation regarding <strong>Export formats</strong>. 
          This section explains how export formats integrates into the overall Export Guide subsystem within Silicofeller Quantum Studio.
        </p>
        <div className="p-5 bg-gray-50 border border-black/5 rounded-xl">
          <p className="text-sm text-[var(--text)] leading-relaxed font-medium mb-3">
            Core functionality for Export formats
          </p>
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            The Export formats module is engineered for maximum stability and performance within the GUIDES stack. By decoupling the core logic from presentation layers, developers can seamlessly extend and configure these capabilities. For advanced initialization parameters or integration workflows specifically targeting Export formats, please refer to the backend API reference or the deployment manifest documentation.
          </p>
        </div>
      </section>

      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">2. Validation</h2>
        <p className="text-[var(--muted)] leading-relaxed mb-4">
          Detailed technical documentation regarding <strong>Validation</strong>. 
          This section explains how validation integrates into the overall Export Guide subsystem within Silicofeller Quantum Studio.
        </p>
        <div className="p-5 bg-gray-50 border border-black/5 rounded-xl">
          <p className="text-sm text-[var(--text)] leading-relaxed font-medium mb-3">
            Core functionality for Validation
          </p>
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            The Validation module is engineered for maximum stability and performance within the GUIDES stack. By decoupling the core logic from presentation layers, developers can seamlessly extend and configure these capabilities. For advanced initialization parameters or integration workflows specifically targeting Validation, please refer to the backend API reference or the deployment manifest documentation.
          </p>
        </div>
      </section>

    </div>
  );
}
