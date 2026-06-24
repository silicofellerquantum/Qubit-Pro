import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Linear & Ring Layouts</h1>
      <p className="text-lg text-slate-600 mb-8">
        Linear chains are primarily used for small-scale physical prototyping, academic studies on 1D spin chains, and calibration baselines.
      </p>

      <h2 className="text-2xl font-bold mb-4">Characteristics</h2>
      <p className="text-slate-600 mb-6">
        Degree is uniformly 2 (except for endpoints). Cross-talk is practically non-existent, but logical error correction is impossible.
      </p>

      <h2 className="text-2xl font-bold mb-4">Ring Topology</h2>
      <p className="text-slate-600 mb-4">
        Connecting the ends of a linear chain produces a Ring, restoring translation symmetry.
      </p>

      <CodeBlock language="qclang" code={`// Generate a 12-qubit ring
topology "Ring12" {
  type: linear;
  qubit_count: 12;
  close_loop: true;
}`} />
    </div>
  );
}
