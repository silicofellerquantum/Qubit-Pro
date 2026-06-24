import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">SVG Export</h1>
      <p className="text-lg text-slate-600 mb-8">
        Generate publication-ready vector graphics of your quantum layouts.
      </p>

      <h2 className="text-2xl font-bold mb-4">Styling Output</h2>
      <p className="text-slate-600 mb-6">
        By default, SVG exports use a high-contrast dark theme. You can toggle to a "Print-Friendly" mode in the Export modal, which renders black outlines on a white background, perfect for academic papers (e.g., Physical Review Letters).
      </p>
    </div>
  );
}
