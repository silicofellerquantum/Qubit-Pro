import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Save and Restore Designs</h1>
      <p className="text-lg text-slate-600 mb-8">
        Silicofeller provides robust state management to ensure you never lose a massive chip layout.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Auto-Save Mechanism</h2>
      <p className="text-slate-600 mb-6">
        As you work in the Schematic Editor, the application automatically serializes the AST state to your browser's `IndexedDB` every 5 seconds. If your browser crashes or tab is accidentally closed, the exact state of the canvas will be restored immediately upon reopening the project.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Cloud Syncing</h2>
      <p className="text-slate-600 mb-6">
        When you explicitly click the <strong>Save</strong> button (or press Ctrl+S), the exact JSON representation of the layout is POSTed to the backend database. This creates a hard checkpoint in the project's version history.
      </p>

      <AlertBox type="tip" title="Version Control">
        Every cloud save generates a new immutable revision. You can open the <strong>History panel</strong> to view a timeline of saves, allowing you to instantly revert the schematic back to a previous working state if a routing experiment fails.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Offline Export</h2>
      <p className="text-slate-600 mb-6">
        For air-gapped environments, you can export the raw project state as a `.sqproj` file. This is a compressed JSON payload that can be re-imported into any Silicofeller Studio instance.
      </p>
    </div>
  );
}