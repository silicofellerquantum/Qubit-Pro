import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Transmission Lines (Feedlines)</h1>
      <p className="text-lg text-slate-600 mb-8">
        Feedlines are the primary microwave highways that carry signals from your cryogenic cabling into the quantum chip and back out.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Coplanar Waveguides (CPW)</h2>
      <p className="text-slate-600 mb-6">
        All transmission lines in Silicofeller are modeled as Coplanar Waveguides. This means a central metallic trace is separated from infinite ground planes by two symmetric etched gaps.
      </p>

      <div className="overflow-x-auto mb-8 border border-slate-200 rounded-xl shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-900">Parameter</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Standard Value</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Purpose</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-medium text-slate-900 text-mono">trace_width</td>
              <td className="px-6 py-4">10 µm</td>
              <td className="px-6 py-4">Width of the center conductor.</td>
            </tr>
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-medium text-slate-900 text-mono">gap_width</td>
              <td className="px-6 py-4">6 µm</td>
              <td className="px-6 py-4">Width of the etched dielectric separating the trace from ground.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <AlertBox type="warning" title="Impedance Matching">
        The default 10µm / 6µm geometry on a standard Silicon substrate yields exactly $Z_0 approx 50\Omega$. If you change these parameters arbitrarily, you will create impedance mismatches causing massive signal reflections (standing waves) at the wirebond launches.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Programmatic Routing</h2>
      <CodeBlock language="python" code={`# Example of routing a feedline between two launch pads
route_1 = RouteMeander(
    design, 'Feedline_Main',
    options=Dict(
        pin_inputs=Dict(start_pin=Dict(component='Pad_In', pin='tie'),
                        end_pin=Dict(component='Pad_Out', pin='tie')),
        lead=Dict(start_straight='0.1mm', end_straight='0.1mm'),
        meander=Dict(spacing='200um', asymmetry='0um')
    )
)`} />
    </div>
  );
}