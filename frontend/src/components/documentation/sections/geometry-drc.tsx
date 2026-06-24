import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Four-Domain DRC: Geometry</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Design Rule Check (DRC) is the most computationally intensive part of the visual pipeline. It relies on a fast Rust-based WebAssembly backend to perform 2D polygon intersection tests.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Intersection and Overlap Checks</h2>
      <p className="text-slate-600 mb-6">
        The Geometry DRC enforces physical spacing rules to prevent unwanted parasitic coupling. 
      </p>
      
      <ul className="space-y-4 mb-8">
        <li className="bg-slate-50 p-5 rounded-lg border border-slate-200 shadow-sm">
          <strong className="text-slate-900 block mb-2 text-lg">Minimum Spacing ($S_{min}$)</strong>
          <span className="text-slate-600">No two uncoupled ground plane cutouts may be closer than the $S_{min}$ threshold (default 5µm). Proximity below this threshold risks creating a capacitive bridge during etching variations.</span>
        </li>
        <li className="bg-slate-50 p-5 rounded-lg border border-slate-200 shadow-sm">
          <strong className="text-slate-900 block mb-2 text-lg">Bounding Box Overlap</strong>
          <span className="text-slate-600">Two distinct QComponents cannot have overlapping bounding boxes unless explicitly connected by an authorized pin-to-pin joint. Overlaps are highlighted in bright red on the canvas.</span>
        </li>
      </ul>

      <AlertBox type="info" title="Performance Optimization">
        Instead of evaluating every polygon against every other polygon $O(N^2)$, the Rust engine uses a <strong>Sweep-line Algorithm</strong> and R-Trees to achieve $O(N \log N)$ performance, allowing real-time DRC checking even for 100+ qubit chips.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Overriding Rules</h2>
      <p className="text-slate-600 mb-6">
        You can configure the global DRC spacing thresholds using the Python API:
      </p>
      <CodeBlock language="python" code={`# Adjust global DRC rules
design.setup.drc.spacing_min = '10um'
design.setup.drc.allow_overlap = False
`} />
    </div>
  );
}