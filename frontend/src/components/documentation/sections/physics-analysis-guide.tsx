import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <div className="mb-12 mt-8">
        <p className="text-sm font-semibold text-blue-600 tracking-wider uppercase mb-2">GUIDES</p>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--text)] mb-6">
          Physics Analysis Guide
        </h1>
      </div>

      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">1. Frequency analysis</h2>
        <p className="text-[var(--muted)] leading-relaxed mb-4">
          Detailed technical documentation regarding <strong>Frequency analysis</strong>. 
          This section explains how frequency analysis integrates into the overall Physics Analysis Guide subsystem within Silicofeller Quantum Studio.
        </p>
        <div className="p-5 bg-gray-50 border border-black/5 rounded-xl">
          <p className="text-sm text-[var(--text)] leading-relaxed font-medium mb-3">
            Core functionality for Frequency analysis
          </p>
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            The Frequency analysis module is engineered for maximum stability and performance within the GUIDES stack. By decoupling the core logic from presentation layers, developers can seamlessly extend and configure these capabilities. For advanced initialization parameters or integration workflows specifically targeting Frequency analysis, please refer to the backend API reference or the deployment manifest documentation.
          </p>
        </div>
      </section>

      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">2. Coupling analysis</h2>
        <p className="text-[var(--muted)] leading-relaxed mb-4">
          Detailed technical documentation regarding <strong>Coupling analysis</strong>. 
          This section explains how coupling analysis integrates into the overall Physics Analysis Guide subsystem within Silicofeller Quantum Studio.
        </p>
        <div className="p-5 bg-gray-50 border border-black/5 rounded-xl">
          <p className="text-sm text-[var(--text)] leading-relaxed font-medium mb-3">
            Core functionality for Coupling analysis
          </p>
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            The Coupling analysis module is engineered for maximum stability and performance within the GUIDES stack. By decoupling the core logic from presentation layers, developers can seamlessly extend and configure these capabilities. For advanced initialization parameters or integration workflows specifically targeting Coupling analysis, please refer to the backend API reference or the deployment manifest documentation.
          </p>
        </div>
      </section>

      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">3. Noise analysis</h2>
        <p className="text-[var(--muted)] leading-relaxed mb-4">
          Detailed technical documentation regarding <strong>Noise analysis</strong>. 
          This section explains how noise analysis integrates into the overall Physics Analysis Guide subsystem within Silicofeller Quantum Studio.
        </p>
        <div className="p-5 bg-gray-50 border border-black/5 rounded-xl">
          <p className="text-sm text-[var(--text)] leading-relaxed font-medium mb-3">
            Core functionality for Noise analysis
          </p>
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            The Noise analysis module is engineered for maximum stability and performance within the GUIDES stack. By decoupling the core logic from presentation layers, developers can seamlessly extend and configure these capabilities. For advanced initialization parameters or integration workflows specifically targeting Noise analysis, please refer to the backend API reference or the deployment manifest documentation.
          </p>
        </div>
      </section>

    </div>
  );
}
