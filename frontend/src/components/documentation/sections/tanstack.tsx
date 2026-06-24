import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">TanStack Libraries</h1>
      <p className="text-lg text-slate-600 mb-8">
        We utilize the TanStack ecosystem to provide enterprise-grade routing, data fetching, and table rendering.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
          <h3 className="font-bold text-slate-900 text-lg mb-2">TanStack Router</h3>
          <p className="text-slate-600 text-sm">Provides fully type-safe routing. When navigating to `/project/123/simulate`, the router guarantees that `123` is available as a string parameter, preventing runtime crashes in the simulation panel.</p>
        </div>

        <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
          <h3 className="font-bold text-slate-900 text-lg mb-2">TanStack Query</h3>
          <p className="text-slate-600 text-sm">Replaces `useEffect` data fetching. It caches project lists, automatically deduplicates API requests, and handles the polling logic required to check if a long-running FEA simulation has finished.</p>
        </div>
      </div>
    </div>
  );
}