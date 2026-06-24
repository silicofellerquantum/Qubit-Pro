import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Grid & Surface-Code Layouts</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Square Grid topology is the holy grail for fault-tolerant quantum computing because it maps directly to the Surface Code, the most promising quantum error correction scheme known today.
      </p>

      <div className="my-8 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <img src="/brain/63033335-280b-4630-beb9-8bb527edd274/media__1782263546237.png" alt="Grid Layout" className="w-full h-auto object-cover" />
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Architecture of the Surface Code</h2>
      <p className="text-slate-600 mb-6">
        In a grid layout designed for the surface code, qubits are divided into two distinct functional groups:
      </p>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>Data Qubits:</strong> These qubits hold the actual logical quantum state. They are situated at the vertices of the grid.</li>
        <li><strong>Measure (Syndrome) Qubits:</strong> Placed at the faces (centers) of the grid squares. These qubits interact with their 4 neighboring Data Qubits to measure parity (X-type or Z-type errors) without collapsing the logical state.</li>
      </ul>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-x-auto mb-10">
        <pre className="text-sm font-mono text-slate-800">
{`graph TD
    D1((Data 1)) --- M1{Measure Z}
    D2((Data 2)) --- M1
    D3((Data 3)) --- M1
    D4((Data 4)) --- M1
    style D1 fill:#3b82f6,color:#fff
    style D2 fill:#3b82f6,color:#fff
    style D3 fill:#3b82f6,color:#fff
    style D4 fill:#3b82f6,color:#fff
    style M1 fill:#f59e0b,color:#fff`}
        </pre>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Engineering Challenges</h2>
      <p className="text-slate-600 mb-6">
        While the square grid is theoretically optimal, it poses immense physical engineering challenges:
      </p>

      <AlertBox type="warning" title="Frequency Crowding">
        Because every measure qubit must couple to 4 data qubits, you are highly likely to experience "frequency collisions" (Type 1 or Type 2). The dense packing requires extreme precision in Josephson Junction fabrication to hit target frequencies exactly.
      </AlertBox>

      <AlertBox type="warning" title="Wiring Bottleneck">
        A 2D grid with N qubits requires O(N) control lines entering from the perimeter. For large grids, the lines simply cannot physically fit between the qubits on a single plane. This makes <strong>Flip-Chip 3D Integration</strong> practically mandatory for square grids larger than 5x5.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Silicofeller's Grid Generator</h2>
      <p className="text-slate-600 mb-6">
        When using the Silicofeller Square Grid generator, the system automatically assigns alternating frequency bands to the lattice in a "checkerboard" pattern to mathematically minimize nearest-neighbor frequency collisions. You can configure the detuning delta in the generator settings.
      </p>
    </div>
  );
}