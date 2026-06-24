const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/components/documentation/sections');

const files = {
  'designer-qubits.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Qubits</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Qubit is the fundamental unit of quantum information processing. Silicofeller currently supports two primary topologies of superconducting qubits: The Transmon and the Fluxonium.
      </p>

      <div className="my-8 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <img src="/brain/63033335-280b-4630-beb9-8bb527edd274/media__1782265647392.png" alt="Qubit Close-up" className="w-full h-auto object-cover" />
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Transmon Variations</h2>
      <p className="text-slate-600 mb-6">
        A transmon is essentially an LC oscillator where the inductor is replaced by a non-linear Josephson Junction. We offer three pre-parameterized shapes:
      </p>
      
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>Transmon Cross:</strong> IBM's signature design. Highly symmetric, excellent for 4-way coupling.</li>
        <li><strong>Transmon Pocket:</strong> A rectangular pad design. Useful when space is constrained or when coupling to a single adjacent resonator.</li>
        <li><strong>Xmon:</strong> Google's signature cross-shaped transmon. Similar to the Transmon Cross but optimized for nearest-neighbor tunable coupling.</li>
      </ul>

      <AlertBox type="warning" title="Anharmonicity">
        Transmons suffer from inherently weak anharmonicity (~-300 MHz). If you drive your 0→1 transition too hard, you risk leaking into the |2⟩ state. Always check the calculated $\\alpha$ in the Properties Inspector.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Geometric Parameters</h2>
      <p className="text-slate-600 mb-6">
        When dragging a Qubit onto the canvas, you can tweak its fundamental geometry to alter its quantum properties:
      </p>
      
      <div className="overflow-x-auto mb-8 border border-slate-200 rounded-xl shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-900">Parameter</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Effect on Physics</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-medium text-slate-900 text-mono">cross_width</td>
              <td className="px-6 py-4">Increases the total shunt capacitance ($C_s$), lowering both $f_{01}$ and $E_C$.</td>
            </tr>
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-medium text-slate-900 text-mono">L_j (Junction Inductance)</td>
              <td className="px-6 py-4">Inversely proportional to $f_{01}$. Governed by the physical size of the Al-AlOx-Al junction during e-beam lithography.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}`,

  'designer-couplers.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Couplers</h1>
      <p className="text-lg text-slate-600 mb-8">
        Couplers mediate the entanglement operations (two-qubit gates) between adjacent qubits.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Static Capacitive Coupling</h2>
      <p className="text-slate-600 mb-6">
        The simplest way to entangle two transmons is to let their electric fields overlap. You can achieve this by routing a CPW line between them or physically placing their capacitor pads near each other. This results in an always-on $ZZ$ interaction.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-x-auto mb-10">
        <pre className="text-sm font-mono text-slate-800">
{\`graph LR
    Q1((Qubit 1)) ---|C_g| Q2((Qubit 2))
    style Q1 fill:#3b82f6,color:#fff
    style Q2 fill:#3b82f6,color:#fff\`}
        </pre>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Tunable Couplers</h2>
      <p className="text-slate-600 mb-6">
        To prevent spectator errors in dense lattices, modern chips use Tunable Couplers (essentially a smaller, heavily detuned qubit) placed between the main computational qubits.
      </p>
      
      <AlertBox type="tip" title="Flux Bias Lines">
        Tunable couplers require a dedicated flux bias line (Fast-Z control) to rapidly tune their frequency. When using a Tunable Coupler from the library, ensure you route a \`FluxLine\` to its Z-control pin.
      </AlertBox>

      <p className="text-slate-600 mb-6 mt-6">
        By pulsing the tunable coupler, the effective coupling $J$ between the data qubits can be pushed to exactly 0 (idle state) or ramped up for high-fidelity CZ or iSWAP gates.
      </p>
    </div>
  );
}`,

  'designer-feedlines.tsx': `import React from "react";
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
        The default 10µm / 6µm geometry on a standard Silicon substrate yields exactly $Z_0 \approx 50\\Omega$. If you change these parameters arbitrarily, you will create impedance mismatches causing massive signal reflections (standing waves) at the wirebond launches.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Programmatic Routing</h2>
      <CodeBlock language="python" code={\`# Example of routing a feedline between two launch pads
route_1 = RouteMeander(
    design, 'Feedline_Main',
    options=Dict(
        pin_inputs=Dict(start_pin=Dict(component='Pad_In', pin='tie'),
                        end_pin=Dict(component='Pad_Out', pin='tie')),
        lead=Dict(start_straight='0.1mm', end_straight='0.1mm'),
        meander=Dict(spacing='200um', asymmetry='0um')
    )
)\`} />
    </div>
  );
}`,

  'designer-resonators.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Resonators</h1>
      <p className="text-lg text-slate-600 mb-8">
        Resonators act as intermediaries. They are used for state readout (measuring the qubit) or acting as quantum memory buses.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Quarter-Wave ($\lambda/4$) Resonators</h2>
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
}`,

  'designer-terminations.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Terminations and Lumped Elements</h1>
      <p className="text-lg text-slate-600 mb-8">
        Proper termination of CPW lines is critical to prevent microwave reflections.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Available Terminations</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
          <h3 className="font-bold text-slate-900 mb-2">Open Circuit (Open)</h3>
          <p className="text-sm text-slate-600">The center trace abruptly stops. Due to the gap, the microwave signal sees a near-infinite impedance and reflects back completely. Used at the end of $\\lambda/2$ resonators.</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
          <h3 className="font-bold text-slate-900 mb-2">Short Circuit (Short)</h3>
          <p className="text-sm text-slate-600">The center trace merges directly into the ground plane. The signal sees 0 impedance. Used at the termination of $\\lambda/4$ resonators and flux lines.</p>
        </div>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Lumped Elements</h2>
      <p className="text-slate-600 mb-6">
        For specialized RF simulations, you can instantiate lumped element ports. These are mathematically perfect $50\\Omega$ resistors used purely for S-parameter extraction in Palace or Ansys HFSS. They do not generate physical lithography masks.
      </p>
    </div>
  );
}`,

  'copy-qiskit.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Copy Qiskit Metal Snippets</h1>
      <p className="text-lg text-slate-600 mb-8">
        If you prefer working in Jupyter Notebooks rather than the visual GUI, you can instantly extract the Qiskit Metal Python code for any selected component or your entire graph.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Component Extraction</h2>
      <p className="text-slate-600 mb-6">
        Right-click any component on the canvas and select <strong>Copy Python Snippet</strong>. This copies a fully instantiated Qiskit Metal class definition to your clipboard, perfectly matching the visual parameters you set.
      </p>

      <CodeBlock language="python" code={\`# Copied from Silicofeller GUI
from qiskit_metal.qlibrary.qubits.transmon_pocket import TransmonPocket

q1 = TransmonPocket(design, 'Q1', options=dict(
    pos_x='-1.5mm', 
    pos_y='0.0mm', 
    pad_width='425um', 
    pad_gap='30um'
))
gui.rebuild()
\`} />

      <AlertBox type="info" title="Full Project Export">
        To export the entire project graph (including all nets, routing logic, and global variables), use the <strong>Export &gt; Qiskit Metal Script</strong> function from the main toolbar.
      </AlertBox>
    </div>
  );
}`,

  'understand-pipeline.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Design Pipeline Overview</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Silicofeller Validation Pipeline ensures that your visual schematic translates correctly into physical physics without disastrous manufacturing errors.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-x-auto mb-10">
        <pre className="text-sm font-mono text-slate-800">
{\`graph TD
    A[Visual Graph (AST)] --> B{1. Graph Validation}
    B -->|Passed| C{2. Geometry DRC}
    C -->|Passed| D{3. Frequency DRC}
    D -->|Passed| E{4. Fabrication DRC}
    B -.->|Failed| F[Error Report]
    C -.->|Failed| F
    D -.->|Failed| F
    E -.->|Failed| F
    E -->|Passed| G[Simulation Ready]\`}
        </pre>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Why Sequential?</h2>
      <p className="text-slate-600 mb-6">
        The pipeline is strictly sequential. If Graph Validation fails (e.g., a component points to a non-existent pin), the engine will not attempt Geometry DRC. This saves immense cloud compute resources and prevents confusing, cascading false-positive errors.
      </p>

      <AlertBox type="warning" title="Halt on Failure">
        A Severity 2 (Violation) or Severity 3 (Fatal) error will immediately halt the pipeline. You cannot export a GDSII mask or trigger a Palace FEA simulation until all Severity 2+ errors are resolved.
      </AlertBox>
    </div>
  );
}`,

  'design-graph.tsx': `import React from "react";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Graph Validation</h1>
      <p className="text-lg text-slate-600 mb-8">
        Before processing physical polygons, the engine validates the underlying Abstract Syntax Tree (AST) as a pure mathematical graph.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Acyclic Verification</h2>
      <p className="text-slate-600 mb-6">
        The routing graph must be valid. While you can create physical feedback loops with transmission lines, the logical netlist must not contain unresolvable infinite topological cycles.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Extracting the Adjacency Matrix</h2>
      <p className="text-slate-600 mb-6">
        You can export the pure topological state of your design as a JSON adjacency matrix. This is incredibly useful for interfacing with external quantum compiling tools that need to know the connectivity graph (e.g., for SWAP mapping).
      </p>
      
      <CodeBlock language="json" code={\`{
  "project_id": "Falcon_V1",
  "nodes": ["Q1", "Q2", "Q3", "Res1"],
  "adjacency": [
    [0, 1, 0, 1],
    [1, 0, 1, 0],
    [0, 1, 0, 0],
    [1, 0, 0, 0]
  ]
}\`} />
      <p className="text-sm text-slate-500 mt-2">A '1' indicates a direct capacitive coupling or a CPW route between components.</p>
    </div>
  );
}`,

  'validate-connectivity.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Validate Connectivity</h1>
      <p className="text-lg text-slate-600 mb-8">
        Once the abstract graph is validated, the pipeline checks the physical routing constraints of your Coplanar Waveguides.
      </p>

      <div className="my-8 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <img src="/brain/63033335-280b-4630-beb9-8bb527edd274/media__1782263546237.png" alt="Routing Grid" className="w-full h-auto object-cover" />
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Dangling Nets and T-Junctions</h2>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>Dangling Nets:</strong> An open transmission line (a line connected to a pin on one end but floating in empty space on the other) acts as a massive antenna, drastically altering the chip's capacitance matrix. These are immediately flagged.</li>
        <li><strong>T-Junctions:</strong> Drawing a wire that intersects the middle of another wire creates a T-Junction. This causes severe impedance mismatch and scattering. The DRC engine forbids arbitrary T-junctions; you must instantiate an explicit \`Splitter\` component instead.</li>
      </ul>

      <AlertBox type="tip" title="Pin Snapping">
        If a route fails connectivity validation but visually appears connected, the route may be off by a few micrometers. Ensure you use the automated "Pin Snap" feature when completing a wire trace.
      </AlertBox>
    </div>
  );
}`,

  'invalid-couplings.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Correct Invalid Couplings</h1>
      <p className="text-lg text-slate-600 mb-8">
        The physics engine enforces strict rules about what component classes are allowed to directly interact.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Error Resolution Matrix</h2>
      <div className="overflow-x-auto mb-8 border border-slate-200 rounded-xl shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-900">Error Code</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Invalid Connection</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Why it's Invalid</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Resolution</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-mono text-rose-600 font-bold">ERR_CP_01</td>
              <td className="px-6 py-4 font-medium text-slate-900">Qubit → Qubit</td>
              <td className="px-6 py-4 text-slate-600">Direct geometric abutment creates unmanageably high fixed $J$ coupling, preventing single-qubit addressing.</td>
              <td className="px-6 py-4">Insert a Tunable Coupler or a CPW bus between them.</td>
            </tr>
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-mono text-rose-600 font-bold">ERR_CP_02</td>
              <td className="px-6 py-4 font-medium text-slate-900">Resonator → Resonator</td>
              <td className="px-6 py-4 text-slate-600">Creates a massive hybridized mode that completely ruins readout multiplexing.</td>
              <td className="px-6 py-4">Route them to a common Feedline separately.</td>
            </tr>
            <tr className="hover:bg-slate-50 transition-colors">
              <td className="px-6 py-4 font-mono text-rose-600 font-bold">ERR_CP_03</td>
              <td className="px-6 py-4 font-medium text-slate-900">Feedline → Feedline</td>
              <td className="px-6 py-4 text-slate-600">Shorts your input lines together, destroying the scattering matrix.</td>
              <td className="px-6 py-4">Remove connection or use an RF Diplexer.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}`,

  'geometry-drc.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";
import { CodeBlock } from "../CodeBlock";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Four-Domain DRC: Geometry</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Design Rule Check (DRC) is the most computationally intensive part of the visual pipeline. It relies on a fast Rust-based WebAssembly backend to perform 2D polygon intersection tests.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Intersection and Overlap Checks</h2>
      <p className="text-slate-600 mb-6">
        The Geometry DRC enforces physical spacing rules to prevent unwanted parasitic coupling. 
      </p>
      
      <ul className="space-y-4 mb-8">
        <li className="bg-slate-50 p-5 rounded-lg border border-slate-200 shadow-sm">
          <strong className="text-slate-900 block mb-2 text-lg">Minimum Spacing ($S_{min}$)</strong>
          <span className="text-slate-600">No two uncoupled ground plane cutouts may be closer than the $S_{min}$ threshold (default 5µm). Proximity below this threshold risks creating a capacitive bridge during etching variations.</span>
        </li>
        <li className="bg-slate-50 p-5 rounded-lg border border-slate-200 shadow-sm">
          <strong className="text-slate-900 block mb-2 text-lg">Bounding Box Overlap</strong>
          <span className="text-slate-600">Two distinct QComponents cannot have overlapping bounding boxes unless explicitly connected by an authorized pin-to-pin joint. Overlaps are highlighted in bright red on the canvas.</span>
        </li>
      </ul>

      <AlertBox type="info" title="Performance Optimization">
        Instead of evaluating every polygon against every other polygon $O(N^2)$, the Rust engine uses a <strong>Sweep-line Algorithm</strong> and R-Trees to achieve $O(N \\log N)$ performance, allowing real-time DRC checking even for 100+ qubit chips.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Overriding Rules</h2>
      <p className="text-slate-600 mb-6">
        You can configure the global DRC spacing thresholds using the Python API:
      </p>
      <CodeBlock language="python" code={\`# Adjust global DRC rules
design.setup.drc.spacing_min = '10um'
design.setup.drc.allow_overlap = False
\`} />
    </div>
  );
}`,

  'frequency-drc.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Four-Domain DRC: Frequency Planning</h1>
      <p className="text-lg text-slate-600 mb-8">
        Frequency Design Rule Checking verifies that the analytical Hamiltonian estimates for your components do not result in catastrophic frequency crowding.
      </p>

      <div className="bg-indigo-950 text-indigo-100 p-6 rounded-xl font-mono text-sm mb-10 shadow-lg">
        <p className="text-indigo-300 font-bold mb-3">// Default Collision Thresholds</p>
        <p className="mb-1"><span className="text-emerald-400">let</span> NN_DETUNING_MIN = 100_000_000; <span className="text-indigo-400"># 100 MHz</span></p>
        <p className="mb-1"><span className="text-emerald-400">let</span> NNN_DETUNING_MIN = 15_000_000;  <span className="text-indigo-400"># 15 MHz</span></p>
        <p><span className="text-emerald-400">let</span> READOUT_SPACING_MIN = 20_000_000; <span className="text-indigo-400"># 20 MHz</span></p>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Nearest Neighbor (NN) Detuning</h2>
      <p className="text-slate-600 mb-6">
        Two directly coupled qubits (e.g., $Q_1$ and $Q_2$) must have a frequency difference ($\\Delta$) significantly larger than their coupling strength ($J$). If $\\Delta < 100$ MHz, the static $ZZ$ interaction becomes dominating, destroying single-qubit gate fidelities. The DRC engine scans the graph and flags any $Q_i, Q_j$ pairs that violate this.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Next-Nearest Neighbor (NNN) Spectator</h2>
      <p className="text-slate-600 mb-6">
        When driving a cross-resonance gate between $Q_1$ and $Q_2$, any qubit $Q_3$ coupled to $Q_2$ becomes a "spectator." If $Q_1$ and $Q_3$ have similar frequencies, driving the gate will accidentally drive $Q_3$. The Frequency DRC mandates at least a 15 MHz gap between any NNN pairs.
      </p>

      <AlertBox type="warning" title="Iterative Physics">
        Frequency DRC operates on <strong>analytical estimates</strong>. If the engine throws a warning, you must alter your layout (e.g., change the Transmon cross width) to shift the estimated frequencies before proceeding to heavy FEM simulations.
      </AlertBox>
    </div>
  );
}`
};

Object.keys(files).forEach(file => {
  fs.writeFileSync(path.join(dir, file), files[file], 'utf8');
});
console.log('Batch 2 expanded');
