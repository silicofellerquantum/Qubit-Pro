import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Browse the Component Library</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Component Library is the repository of all available parametric geometric primitives. It contains both standard foundry-proven components and user-defined macros.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Library Architecture</h2>
      <p className="text-slate-600 mb-6">
        Silicofeller components are not static drawing files (like GDS cells). They are parametric Python classes compiled to WebAssembly. This means a single "TransmonCross" component can generate infinite geometric variations based on the parameters you feed it.
      </p>

      <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl mb-10">
        <h3 className="text-lg font-bold text-slate-900 mb-4">Standard Categories</h3>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <li className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center text-blue-600 font-bold">Q</div> <span><strong>Qubits:</strong> Transmons, Fluxoniums</span></li>
          <li className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-purple-100 flex items-center justify-center text-purple-600 font-bold">C</div> <span><strong>Couplers:</strong> Tunable Bus, Static Capacitors</span></li>
          <li className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">R</div> <span><strong>Resonators:</strong> Quarter-wave, Half-wave, Purcell</span></li>
          <li className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-orange-100 flex items-center justify-center text-orange-600 font-bold">T</div> <span><strong>Transmission:</strong> CPW Lines, Splitters</span></li>
          <li className="flex items-center gap-3"><div className="w-8 h-8 rounded bg-slate-200 flex items-center justify-center text-slate-600 font-bold">P</div> <span><strong>Pads:</strong> Wirebond, Flip-chip bumps</span></li>
        </ul>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Importing Custom Qiskit Components</h2>
      <p className="text-slate-600 mb-6">
        Because Silicofeller's backend uses Qiskit Metal for geometric translation, you can directly import custom Python component classes.
      </p>

      <CodeBlock language="python" code={`# Custom QComponent Example
from qiskit_metal import draw, Dict
from qiskit_metal.qlibrary.core import QComponent

class MyCustomPad(QComponent):
    default_options = Dict(width='500um', height='500um')
    
    def make(self):
        p = self.p  # Parsed parameters
        rect = draw.rectangle(p.width, p.height, 0, 0)
        self.add_qgeometry('poly', {'pad': rect})
`} />
    </div>
  );
}