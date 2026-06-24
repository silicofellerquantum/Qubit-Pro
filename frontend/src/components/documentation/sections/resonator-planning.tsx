import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Resonator Multiplexing</h1>
      <p className="text-lg text-slate-600 mb-8">
        Cryogenic wiring is a massive physical bottleneck. To reduce the number of coaxial cables going down into the dilution refrigerator, multiple readout resonators are multiplexed onto a single feedline.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Frequency Domain Multiplexing (FDM)</h2>
      <p className="text-slate-600 mb-6">
        By assigning slightly different resonant lengths to 4-6 resonators, they can all couple to the same CPW feedline. You send a broadband microwave pulse containing all 6 frequencies down the line, and the reflected signal is digitized and demultiplexed via Fast Fourier Transform (FFT) at room temperature.
      </p>

      <div className="overflow-hidden rounded-xl border border-slate-200 mb-10 shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 text-slate-900 font-bold">Multiplex Group</th>
              <th className="px-6 py-4 text-slate-900 font-bold">Resonator Q1</th>
              <th className="px-6 py-4 text-slate-900 font-bold">Resonator Q2</th>
              <th className="px-6 py-4 text-slate-900 font-bold">Resonator Q3</th>
              <th className="px-6 py-4 text-slate-900 font-bold">DRC Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-mono font-bold text-slate-700">Line A</td>
              <td className="px-6 py-4">6.12 GHz</td>
              <td className="px-6 py-4">6.25 GHz</td>
              <td className="px-6 py-4">6.38 GHz</td>
              <td className="px-6 py-4 text-emerald-600 font-bold">Passed (Optimal)</td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-mono font-bold text-slate-700">Line B</td>
              <td className="px-6 py-4">7.05 GHz</td>
              <td className="px-6 py-4 text-rose-600 font-bold">7.08 GHz</td>
              <td className="px-6 py-4 text-rose-600 font-bold">7.11 GHz</td>
              <td className="px-6 py-4 text-rose-600 font-bold">Failed: Purcell Overlap</td>
            </tr>
          </tbody>
        </table>
      </div>

      <AlertBox type="warning" title="Bandwidth Requirements">
        Ensure at least 50 MHz separation between resonators on the same feedline. If they are closer, the "tails" of their Lorentzian line shapes will overlap, making it impossible for the room-temperature ADC to distinguish which qubit was measured.
      </AlertBox>
    </div>
  );
}