import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Design Best Practices</h1>
      <p className="text-lg text-slate-600 mb-8">
        Adhering to these principles will dramatically increase the likelihood of your physical chip actually performing quantum algorithms successfully.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Parametric over Hardcoded</h2>
      <p className="text-slate-600 mb-6">
        Never hardcode absolute positions (`pos_x: 1250um`) for an entire lattice. If the foundry requires you to shrink the chip size by 10%, you will have to recalculate 100 coordinates manually. Always use the provided Lattice Macros (like `SquareGrid` or `HeavyHexTopology`) which calculate positions relatively based on a `qubit_spacing` variable.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Ground Plane Stitching</h2>
      <p className="text-slate-600 mb-6">
        When routing dense CPW lines, the ground plane becomes fractured. These massive unbroken stretches of metal can host unwanted microwave box modes.
      </p>
      
      <AlertBox type="warning" title="Vias and Airbridges">
        You must periodically "stitch" the ground planes together over the CPW traces using Airbridges, or use TSVs (Through-Silicon Vias) to connect to a backside ground plane. Silicofeller provides an "Auto-Bridge" tool that automatically places airbridges every $\lambda/8$ along transmission lines. Use it.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Mitigate Crosstalk Physically</h2>
      <p className="text-slate-600 mb-6">
        Do not route CPW lines parallel to each other over long distances. If two lines must travel parallel, keep them separated by at least 10x their gap width to prevent capacitive cross-talk, or route them orthogonally to each other.
      </p>
    </div>
  );
}