import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">QCLang Examples & Templates</h1>
      <p className="text-lg text-slate-600 mb-8">
        To rapidly jumpstart a design without clicking through the UI, you can directly inject QCLang templates into the Code Editor panel.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Basic Qubit-Resonator Pair</h2>
      <p className="text-slate-600 mb-6">
        This template instantiates a single Transmon Cross and connects its readout pin to a Quarter-Wave resonator.
      </p>
      
      <CodeBlock language="json" code={`component TransmonCross as Q1 {
  pos_x: 0mm
  pos_y: 0mm
  cross_length: 200um
}

component RouteMeander as Readout_1 {
  target_freq: 6.5 GHz
  pin_start: Q1.readout
  pin_end: Feedline.tie_in
  meander_spacing: 150um
}`} />

      <h2 className="text-2xl font-bold mb-4 mt-10">Tunable Coupler Bus</h2>
      <p className="text-slate-600 mb-6">
        This demonstrates connecting two data qubits via an intermediary tunable bus for high-fidelity CZ gates.
      </p>
      
      <CodeBlock language="json" code={`component TunableCoupler as TC_1 {
  pos_x: 1.5mm
  pos_y: 0mm
}

route Bus_A {
  pin_start: Q1.east
  pin_end: TC_1.west
}

route Bus_B {
  pin_start: TC_1.east
  pin_end: Q2.west
}`} />
    </div>
  );
}