import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">AI Generation Workflow</h1>
      <p className="text-lg text-slate-600 mb-8">
        Understand the data transformation pipeline from your initial prompt down to the rendered graphical layout.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-x-auto mb-10">
        <pre className="text-sm font-mono text-slate-800">
{`graph TD
    A[Natural Language Prompt] -->|NLP Engine| B(Intent Extraction)
    B --> C{Topology Match?}
    C -->|Yes| D[QCLang Generation]
    C -->|No| E[Prompt for Clarification]
    D --> F[AST Compilation]
    F --> G[Layout Synthesis]
    G --> H[Interactive Schematic Viewer]`}
        </pre>
      </div>

      <h2 className="text-2xl font-bold mb-4">Intermediate Abstract Syntax Tree (AST)</h2>
      <p className="text-slate-600">
        Between the NLP phase and the visual layout, the system generates a JSON AST representing the design graph. You can inspect this AST directly using the Developer Tools panel.
      </p>
    </div>
  );
}
