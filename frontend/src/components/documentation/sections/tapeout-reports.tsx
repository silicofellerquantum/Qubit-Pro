import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Tapeout Review</h1>
      <p className="text-lg text-slate-600 mb-8">
        The final pre-flight checklist before foundry submission.
      </p>

      <h2 className="text-2xl font-bold mb-4">Approval Chains</h2>
      <p className="text-slate-600 mb-6">
        Enterprise users can configure required approval signatures. A tapeout report cannot be finalized until all requested Principal Engineers have signed off cryptographically.
      </p>
    </div>
  );
}
