import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Architecture</p>
          <h2>Chip Synthesis Engine</h2>
        </div>
      </div>
      <p>
        The Silicofeller Synthesis Engine is responsible for the automatic placement and structural generation of quantum chip architectures from QCLang constraints.
      </p>

      <h3>Supported Topologies</h3>
      <p>The engine natively supports automated placement for several advanced quantum topologies:</p>
      <ul>
        <li><strong>Heavy Hex:</strong> The industry standard for surface-code error correction, minimizing crosstalk by placing couplers on hexagonal edges.</li>
        <li><strong>Grid:</strong> A standard 2D lattice topology often used for theoretical array scaling.</li>
        <li><strong>Kagome:</strong> A specialized lattice structure for unique quantum interference and spin-liquid research.</li>
        <li><strong>Hexagonal:</strong> Standard honeycomb lattice architectures.</li>
        <li><strong>Linear:</strong> 1D qubit chains typically used for basic entanglement demonstrations and testing.</li>
        <li><strong>Star:</strong> Centralized resonator coupling for multi-qubit interactions.</li>
      </ul>

      <h3>Placement Algorithms</h3>
      <p>The synthesis engine utilizes simulated annealing and force-directed graph algorithms to optimally place qubits and readout resonators on the die while minimizing the required lengths for CPW (Coplanar Waveguide) routing.</p>

      <AlertBox type="info" title="Automatic Padding">
        The synthesis engine automatically calculates required ground-plane spacing, boundary boxes, and port launching pads for wirebonding.
      </AlertBox>

      <h3>Constraint Solving</h3>
      <p>Users can specify exact coordinates for anchor qubits in QCLang. The constraint solver will resolve all other component positions relative to these anchors, ensuring design rule checking (DRC) minimum spacing rules are strictly followed.</p>
    </>
  );
}
