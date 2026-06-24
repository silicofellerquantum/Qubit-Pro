import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Resonators</h1>
      <p className="text-lg text-slate-600 mb-8">
        Resonators act as intermediaries. They are used for state readout (measuring the qubit) or acting as quantum memory buses.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Quarter-Wave ($lambda/4$) Resonators</h2>
      <p className="text-slate-600 mb-6">
        The standard readout resonator. One end is capacitively coupled to the multiplexed feedline, while the other end is shorted to ground (or coupled to the qubit).
      </p>

      <div className="bg-slate-900 text-white p-8 rounded-xl text-center mb-10 shadow-lg">
        <h3 className="text-indigo-300 font-bold mb-2">Length Calculation</h3>
        <p className="text-2xl font-serif">{"L = v_{ph} / (4 * f_{target})"}</p>
        <p className="text-sm mt-4 text-slate-400">Where v_ph is the phase velocity of light in the substrate medium.</p>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Purcell Filters</h2>
      <p className="text-slate-600 mb-6">
        When a qubit is strongly coupled to a readout resonator, the qubit's energy can leak out into the 50-ohm environment of the feedline, destroying its $T_1$ coherence time.
      </p>

      <AlertBox type="tip" title="Purcell Mitigation">
        You can insert a Purcell Filter—a secondary, low-Q resonator—between the readout resonator and the feedline. This creates a bandpass filter that allows the readout tone to pass but suppresses the qubit's transition frequency from leaking into the transmission line.
      </AlertBox>
    </div>
  );
}