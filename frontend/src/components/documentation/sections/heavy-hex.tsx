import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Heavy-Hex Layouts</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Heavy-Hex topology is an IBM-pioneered lattice designed to strike a balance between the high connectivity needed for error correction and the low connectivity needed to prevent physical crosstalk and frequency collisions.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">What is a Heavy-Hex Graph?</h2>
      <p className="text-slate-600 mb-6">
        A standard hexagonal (honeycomb) lattice has a degree of 3 at every node. A "heavy" hex lattice modifies this by placing an additional qubit on every edge of the hexagons. 
      </p>
      
      <p className="text-slate-600 mb-6">
        This creates two distinct types of qubits in the lattice:
      </p>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>Vertex Qubits:</strong> Situated at the corners of the hexagons. These have a connectivity degree of 3.</li>
        <li><strong>Edge Qubits:</strong> Situated on the lines connecting the vertices. These have a connectivity degree of 2.</li>
      </ul>

      <AlertBox type="info" title="Reduced Crosstalk">
        By reducing the maximum degree from 4 (in a square grid) down to 3, the Heavy-Hex lattice drastically reduces the probability of spectator errors and frequency crowding. It is the topology of choice for scaling beyond 100 qubits without flip-chip integration.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Routing Advantages</h2>
      <p className="text-slate-600 mb-6">
        Because the lattice is "sparser" than a square grid, there is significantly more physical real estate on the silicon chip. This extra space allows engineers to:
      </p>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li>Meander readout resonators comfortably without overlapping.</li>
        <li>Route control lines (XY drive and Z flux-bias) through the center of the hexagons to reach the inner qubits without needing 3D through-silicon vias (TSVs).</li>
        <li>Increase the spacing between components, inherently reducing stray parasitic capacitance.</li>
      </ul>

      <h2 className="text-2xl font-bold mb-4 mt-10">Running the Heavy-Hex Generator</h2>
      <p className="text-slate-600 mb-6">
        The Silicofeller Heavy-Hex macro takes a single parameter distance. A distance-3 heavy hex lattice contains 12 qubits, while a distance-5 contains 43 qubits.
      </p>
      <div className="bg-slate-900 text-slate-300 p-4 rounded-xl font-mono text-sm mb-8">
        <span className="text-emerald-400"># Generate a 127-qubit Eagle-style processor</span><br/>
        const lattice = new HeavyHexTopology(&#123; distance: 9 &#125;);<br/>
        workspace.apply(lattice);
      </div>
    </div>
  );
}