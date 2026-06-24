import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Explore Topologies</h1>
      
      <p className="text-lg text-slate-600 mb-6">
        When designing a superconducting quantum processor, the topology—how qubits are spatially arranged and connected—is the most critical foundational decision. The topology dictates the types of error-correcting codes you can run, the crosstalk profile of your device, and the complexity of the classical microwave routing required to control it.
      </p>

      <div className="my-8 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <img src="/brain/63033335-280b-4630-beb9-8bb527edd274/media__1782265647392.png" alt="Topology Overview" className="w-full h-auto object-cover" />
        <div className="bg-slate-50 p-3 text-sm text-slate-500 border-t border-slate-200 text-center">
          Fig 1: Abstract representation of a graph topology in the schematic editor.
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Why Topology Matters</h2>
      <p className="text-slate-600 mb-6">
        Unlike classical chips where wires can cross over each other in multiple metal layers, superconducting qubits are largely restricted to a single 2D plane (or at most, 2-3 layers with flip-chip bonding). This planar restriction means that every connection must be carefully routed to avoid crossing lines. 
      </p>
      
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>Connectivity (Degree):</strong> Higher connectivity (e.g., each qubit connected to 4 others) allows for more efficient quantum algorithms but dramatically increases unwanted frequency collisions and crosstalk.</li>
        <li><strong>Scalability:</strong> Topologies like the <em>Heavy-Hex</em> reduce the degree of each qubit to 2 or 3, making it much easier to pack hundreds of qubits onto a single wafer without running out of physical space for readout lines.</li>
        <li><strong>Error Correction:</strong> The Surface Code requires a 2D square grid topology. If you intend to run fault-tolerant algorithms, your topology must support the required parity checks.</li>
      </ul>

      <h2 className="text-2xl font-bold mb-4 mt-10">Comparative Analysis</h2>
      
      <div className="overflow-x-auto mb-8 border border-slate-200 rounded-xl shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-900">Topology</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Max Degree</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Crosstalk Risk</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Primary Use Case</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-medium text-slate-900">Square Grid</td>
              <td className="px-6 py-4">4</td>
              <td className="px-6 py-4 text-rose-600 font-medium">High</td>
              <td className="px-6 py-4">Surface Code Error Correction</td>
            </tr>
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-medium text-slate-900">Heavy-Hex</td>
              <td className="px-6 py-4">3</td>
              <td className="px-6 py-4 text-emerald-600 font-medium">Low</td>
              <td className="px-6 py-4">Scalable NISQ Processors</td>
            </tr>
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-medium text-slate-900">Linear / Ring</td>
              <td className="px-6 py-4">2</td>
              <td className="px-6 py-4 text-emerald-600 font-medium">Very Low</td>
              <td className="px-6 py-4">Basic Academic Experiments</td>
            </tr>
          </tbody>
        </table>
      </div>

      <AlertBox type="tip" title="Automated Topology Generation">
        Silicofeller Quantum Studio includes automated generators for all these topologies. You do not need to manually place 100 qubits. Use the API or the "Generate" tool to automatically layout a lattice of any size.
      </AlertBox>
      
      <h2 className="text-2xl font-bold mb-4 mt-10">API Integration</h2>
      <p className="text-slate-600 mb-6">
        You can dynamically generate topologies using the Python client. Below is an example of instantiating a 3x3 square grid algorithmically:
      </p>
      
      <CodeBlock language="python" code={`from silicofeller import Project, Topologies

project = Project("My Lattice")
# Generates a 3x3 grid with default Transmon parameters
grid = Topologies.SquareGrid(rows=3, cols=3, qubit_spacing=1500)
project.apply_topology(grid)
project.save()
`} />
    </div>
  );
}