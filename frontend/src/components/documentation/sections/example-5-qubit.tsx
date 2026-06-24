import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <div className="mb-12 mt-8">
        <p className="text-sm font-semibold text-blue-600 tracking-wider uppercase mb-2">SILICOFELLER PLATFORM</p>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-[var(--text)] mb-6">
          Example 5 Qubit
        </h1>
      </div>

      <section className="mb-16">
        <h2 className="text-2xl font-bold mb-4">1. Overview</h2>
        <p className="text-[var(--muted)] leading-relaxed mb-4">
          This section contains documentation relating to Example 5 Qubit. It covers fundamental concepts, practical application, and integration points within the Silicofeller Quantum Studio environment.
        </p>
      </section>

    </div>
  );
}
