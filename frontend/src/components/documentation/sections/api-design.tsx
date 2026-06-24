import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Design API</h1>
      <p className="text-lg text-slate-600 mb-8">
        Modify the layout graph directly.
      </p>
      
      <div className="mb-4">
        <span className="bg-blue-100 text-blue-800 font-bold px-3 py-1 rounded-md text-sm">POST</span>
        <code className="ml-3 text-lg font-bold text-slate-800">/v1/designs/:id/components</code>
      </div>
      <p className="text-slate-600">Instantiates a new QComponent via the API.</p>
    </div>
  );
}
