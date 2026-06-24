import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Saving & Restoring</h1>
      <p className="text-lg text-slate-600 mb-8">
        Silicofeller utilizes an optimistic auto-save architecture. Every action on the canvas is instantly recorded as a differential patch to your project's AST graph.
      </p>

      <AlertBox type="info" title="Version History">
        The backend maintains an immutable append-only log of your layout changes. You can instantly rewind the canvas state to any previous second.
      </AlertBox>

      <h2 className="text-2xl font-bold mt-10 mb-4">Manual Snapshots</h2>
      <p className="text-slate-600">
        Press <strong>Ctrl + S</strong> to create a named snapshot. Named snapshots are preserved indefinitely and can be used as base templates for future projects.
      </p>
    </div>
  );
}
