import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Routing Coplanar Waveguides</h1>
      <p className="text-lg text-slate-600 mb-8">
        Silicofeller provides an intelligent CPW (Coplanar Waveguide) router that generates meandering paths to hit specific electrical lengths.
      </p>

      <h2 className="text-2xl font-bold mb-4">Meander Algorithm</h2>
      <p className="text-slate-600 mb-6">
        When you connect two pins, the router evaluates the required resonator frequency, calculates the target physical length (accounting for effective dielectric constant), and generates a meander.
      </p>

      <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl font-mono text-sm text-slate-800 mb-10">
        <p className="text-indigo-600 font-bold mb-2">Constraint Logic:</p>
        <p>L_target = c / (2 * f_res * sqrt(e_eff))</p>
        <p>If L_euclidean &lt; L_target:</p>
        <p className="pl-4">Generate N meander turns where N * turn_length ≈ L_target - L_euclidean</p>
      </div>

      <h2 className="text-2xl font-bold mb-4">Manual Routing</h2>
      <CodeBlock language="qclang" code={`// Override auto-router with specific waypoints
route(Q1.pin_east, Res1.pin_in) {
  waypoints: [(100, 0), (100, 50), (200, 50)];
  meander_asymmetry: 0.1;
}`} />
    </div>
  );
}
