import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <div className="mb-12 mt-8">
        <p className="text-sm font-semibold text-blue-600 tracking-wider uppercase mb-2">QCLANG</p>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--text)] mb-6">
          Best Practices
        </h1>
      </div>

      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">1. Naming</h2>
        <p className="text-[var(--muted)] leading-relaxed mb-4">
          Detailed technical documentation regarding <strong>Naming</strong>. 
          This section explains how naming integrates into the overall Best Practices subsystem within Silicofeller Quantum Studio.
        </p>
        <div className="p-5 bg-gray-50 border border-black/5 rounded-xl">
          <p className="text-sm text-[var(--text)] leading-relaxed font-medium mb-3">
            Core functionality for Naming
          </p>
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            The Naming module is engineered for maximum stability and performance within the QCLANG stack. By decoupling the core logic from presentation layers, developers can seamlessly extend and configure these capabilities. For advanced initialization parameters or integration workflows specifically targeting Naming, please refer to the backend API reference or the deployment manifest documentation.
          </p>
        </div>
      </section>

      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">2. Organization</h2>
        <p className="text-[var(--muted)] leading-relaxed mb-4">
          Detailed technical documentation regarding <strong>Organization</strong>. 
          This section explains how organization integrates into the overall Best Practices subsystem within Silicofeller Quantum Studio.
        </p>
        <div className="p-5 bg-gray-50 border border-black/5 rounded-xl">
          <p className="text-sm text-[var(--text)] leading-relaxed font-medium mb-3">
            Core functionality for Organization
          </p>
          <p className="text-sm text-[var(--muted)] leading-relaxed">
            The Organization module is engineered for maximum stability and performance within the QCLANG stack. By decoupling the core logic from presentation layers, developers can seamlessly extend and configure these capabilities. For advanced initialization parameters or integration workflows specifically targeting Organization, please refer to the backend API reference or the deployment manifest documentation.
          </p>
        </div>
      </section>

    </div>
  );
}
