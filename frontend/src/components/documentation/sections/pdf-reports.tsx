import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">PDF Generation</h1>
      <p className="text-lg text-slate-600 mb-8">
        Compile comprehensive PDF dossiers combining schematic views, DRC results, and physics simulation charts.
      </p>

      <h2 className="text-2xl font-bold mb-4">Customizing Reports</h2>
      <p className="text-slate-600">
        You can append custom Markdown notes to the Design Summary section before triggering the PDF compilation engine.
      </p>
    </div>
  );
}
