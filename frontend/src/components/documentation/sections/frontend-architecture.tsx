import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Frontend Architecture</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Silicofeller Quantum Studio frontend is a highly performant Single Page Application (SPA) designed to handle massive computational graphs smoothly in the browser.
      </p>

      <div className="my-8 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <img src="/brain/63033335-280b-4630-beb9-8bb527edd274/system_architecture_1782265216047.png" alt="Frontend Structure" className="w-full h-auto object-cover" />
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">State Management Patterns</h2>
      <p className="text-slate-600 mb-6">
        We use a bifurcated state management approach to isolate high-frequency updates from structural application state.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
          <h3 className="font-bold text-slate-900 mb-2">Zustand for Canvas State</h3>
          <p className="text-sm text-slate-600">The position, rotation, and selection state of thousands of QCLang components change 60 times a second during a drag operation. This is stored in transient Zustand stores to bypass the React rendering lifecycle.</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
          <h3 className="font-bold text-slate-900 mb-2">React Query for Server State</h3>
          <p className="text-sm text-slate-600">Simulation progress, user permissions, and saved AST versions are handled by TanStack Query, providing automatic caching, background fetching, and optimistic UI updates.</p>
        </div>
      </div>

      <AlertBox type="tip" title="Performance Rule">
        Never place the AST (Abstract Syntax Tree) inside a top-level React Context. A single character change in the code editor would trigger a re-render of the entire DOM tree, causing fatal lag.
      </AlertBox>
    </div>
  );
}