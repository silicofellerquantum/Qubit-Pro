const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src/components/documentation/sections');

const files = {
  'explore-topologies.tsx': `import React from "react";
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
      
      <CodeBlock language="python" code={\`from silicofeller import Project, Topologies

project = Project("My Lattice")
# Generates a 3x3 grid with default Transmon parameters
grid = Topologies.SquareGrid(rows=3, cols=3, qubit_spacing=1500)
project.apply_topology(grid)
project.save()
\`} />
    </div>
  );
}`,

  'grid-surface.tsx': `import React from "react";
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
{\`graph TD
    D1((Data 1)) --- M1{Measure Z}
    D2((Data 2)) --- M1
    D3((Data 3)) --- M1
    D4((Data 4)) --- M1
    style D1 fill:#3b82f6,color:#fff
    style D2 fill:#3b82f6,color:#fff
    style D3 fill:#3b82f6,color:#fff
    style D4 fill:#3b82f6,color:#fff
    style M1 fill:#f59e0b,color:#fff\`}
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
}`,

  'heavy-hex.tsx': `import React from "react";
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
}`,

  'linear-ring-star.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Linear, Ring, and Star Layouts</h1>
      <p className="text-lg text-slate-600 mb-8">
        These fundamental 1D and simple 2D topologies are excellent starting points for academic research, proof-of-concept chips, and specialized analog quantum simulators.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Linear Chains</h2>
      <p className="text-slate-600 mb-6">
        A Linear layout simply places qubits in a 1D row, where each qubit (except the ends) connects only to its left and right neighbors.
      </p>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li><strong>Pros:</strong> Absolute minimum crosstalk. Trivial to route control lines from the top and bottom of the chip. Easy to fabricate on a single layer.</li>
        <li><strong>Cons:</strong> Extremely high SWAP overhead. To entangle the first and last qubit, you must perform O(N) SWAP gates, which accumulates devastating error rates.</li>
      </ul>

      <h2 className="text-2xl font-bold mb-4 mt-10">Ring Topology</h2>
      <p className="text-slate-600 mb-6">
        A Ring is a linear chain where the last qubit connects back to the first. 
      </p>
      <AlertBox type="tip" title="Quantum Simulators">
        Ring topologies are frequently used to simulate periodic boundary conditions in condensed matter physics (e.g., simulating a 1D spin chain with periodic boundaries).
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Star Topology</h2>
      <p className="text-slate-600 mb-6">
        In a Star topology, one central "hub" qubit (or a central coupling bus) connects to multiple outer "spoke" qubits. The outer qubits do not connect to each other.
      </p>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 overflow-x-auto mb-10">
        <pre className="text-sm font-mono text-slate-800">
{\`graph TD
    S1((Spoke 1)) --- H((Hub Qubit))
    S2((Spoke 2)) --- H
    S3((Spoke 3)) --- H
    S4((Spoke 4)) --- H
    style H fill:#8b5cf6,color:#fff\`}
        </pre>
      </div>
      <p className="text-slate-600 mb-6">
        <strong>Applications:</strong> Star layouts are useful for testing multi-qubit gates, implementing Quantum Random Access Memory (QRAM) primitives, or creating W-states efficiently. However, the central hub becomes a massive frequency crowding bottleneck.
      </p>
    </div>
  );
}`,

  'editor-overview.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Schematic Editor Overview</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Silicofeller Schematic Editor is a high-performance WebGL canvas where you physically drag, drop, and wire together your quantum processor. It acts as the visual front-end to the underlying QCLang Abstract Syntax Tree.
      </p>

      <div className="my-8 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <img src="/brain/63033335-280b-4630-beb9-8bb527edd274/system_architecture_1782265216047.png" alt="Architecture" className="w-full h-auto object-cover" />
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Core Interface Regions</h2>
      <p className="text-slate-600 mb-6">
        The editor is divided into four primary panels:
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
          <h3 className="font-bold text-slate-900 mb-2">1. Component Palette (Left)</h3>
          <p className="text-sm text-slate-600">Contains categorized QComponents (Qubits, Resonators, Feedlines). Drag items from here onto the central canvas.</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
          <h3 className="font-bold text-slate-900 mb-2">2. Infinite Canvas (Center)</h3>
          <p className="text-sm text-slate-600">A pannable, zoomable WebGL grid where components are placed and routed. Features automatic snapping and grid alignment.</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
          <h3 className="font-bold text-slate-900 mb-2">3. Properties Inspector (Right)</h3>
          <p className="text-sm text-slate-600">Displays the modifiable physics and geometric parameters (like frequencies, capacitance lengths) for the currently selected component.</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl">
          <h3 className="font-bold text-slate-900 mb-2">4. Toolbar (Top)</h3>
          <p className="text-sm text-slate-600">Houses controls for validation, DRC execution, simulation launching, and GDSII export.</p>
        </div>
      </div>

      <AlertBox type="info" title="Bi-directional Sync">
        Any changes made in the visual editor instantly update the underlying QCLang code, and vice versa. There is no "compilation step" required to see visual updates.
      </AlertBox>
    </div>
  );
}`,

  'place-components.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Place Components</h1>
      <p className="text-lg text-slate-600 mb-8">
        Learn how to accurately instantiate and position QComponents onto the chip canvas.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Drag and Drop Workflow</h2>
      <ol className="list-decimal pl-6 space-y-4 text-slate-600 mb-10">
        <li>
          <strong className="text-slate-900">Select a Component:</strong> Open the left-hand Component Library. Find the desired component (e.g., \`TransmonCross\`).
        </li>
        <li>
          <strong className="text-slate-900">Drag to Canvas:</strong> Click and hold the component icon, drag it over the central grid, and release.
        </li>
        <li>
          <strong className="text-slate-900">Grid Snapping:</strong> By default, the component's origin will snap to the nearest 100µm grid intersection. This ensures that coplanar waveguide routing remains perfectly rectilinear.
        </li>
      </ol>

      <h2 className="text-2xl font-bold mb-4 mt-10">Precise Coordinate Entry</h2>
      <p className="text-slate-600 mb-6">
        While drag-and-drop is useful for prototyping, high-fidelity designs often require exact positioning.
      </p>
      <p className="text-slate-600 mb-6">
        With a component selected, locate the <strong>Position (X, Y)</strong> and <strong>Rotation (θ)</strong> fields in the right-hand Properties Inspector. You can manually type exact micrometer coordinates here. Rotation is applied around the component's defined origin point (usually its geometric center).
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Duplication and Arrays</h2>
      <p className="text-slate-600 mb-6">
        To rapidly populate a grid:
      </p>
      <ul className="list-disc pl-6 space-y-3 text-slate-600 mb-8">
        <li>Select an existing configured component.</li>
        <li>Press <kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs font-sans">Ctrl</kbd> + <kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs font-sans">D</kbd> to duplicate it. The duplicate will spawn slightly offset, preserving all physics parameters.</li>
      </ul>
    </div>
  );
}`,

  'connect-pins.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Connect Component Pins</h1>
      <p className="text-lg text-slate-600 mb-8">
        Wiring components together establishes the graph connectivity required for both DRC checks and physical Coplanar Waveguide (CPW) generation.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Understanding Pins</h2>
      <p className="text-slate-600 mb-6">
        Every connectable QComponent exposes "Pins". A pin represents a physical coordinate and a normal vector pointing outward from the component. For example, a \`TransmonCross\` typically has 4 pins (North, South, East, West) extending from its cross arms.
      </p>

      <div className="my-8 rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <img src="/brain/63033335-280b-4630-beb9-8bb527edd274/validation_drc_1782265191432.png" alt="Validation" className="w-full h-auto object-cover" />
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">The Wire Tool</h2>
      <p className="text-slate-600 mb-6">
        To draw a connection:
      </p>
      <ol className="list-decimal pl-6 space-y-4 text-slate-600 mb-10">
        <li>Activate the Wire Tool by pressing <kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs font-sans">W</kbd> or clicking the Wire icon in the top toolbar.</li>
        <li>Hover over a component. Valid connection pins will highlight as glowing blue dots.</li>
        <li>Click a starting pin.</li>
        <li>Click along the canvas to create routing waypoints (corners). The engine enforces Manhattan routing (90-degree angles).</li>
        <li>Click the target pin on the destination component to complete the route.</li>
      </ol>

      <AlertBox type="warning" title="Auto-Meandering">
        When connecting a Resonator, the length of the wire dictates its resonance frequency. Silicofeller includes an "Auto-Meander" feature. If you define a target frequency in the route properties, the engine will automatically fold the wire into a serpentine pattern to achieve the exact required electrical length.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Direct Coupling</h2>
      <p className="text-slate-600 mb-6">
        Not all connections require a wire. You can physically abut two components (e.g., placing a Qubit's readout pin directly adjacent to a Feedline's coupling pin) to create a direct capacitive coupling. The DRC engine automatically detects proximate pins and infers the connection.
      </p>
    </div>
  );
}`,

  'properties-inspector.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Use the Properties Inspector</h1>
      <p className="text-lg text-slate-600 mb-8">
        The Properties Inspector is the control center for fine-tuning the physics and geometries of individual components.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Dynamic Parameter Injection</h2>
      <p className="text-slate-600 mb-6">
        The inspector fields are dynamically generated based on the selected component's QCLang schema. This means a Transmon will display completely different properties than a Quarter-Wave Resonator.
      </p>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-10">
        <h3 className="font-bold text-slate-900 mb-4 border-b pb-2">Common Property Categories</h3>
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="font-bold text-indigo-700 text-base">Physics Targets</dt>
            <dd className="text-slate-600 mt-1">High-level goals like <code>target_freq</code> or <code>target_anharmonicity</code>. Modifying these will cause the solver to automatically recalculate required geometry.</dd>
          </div>
          <div>
            <dt className="font-bold text-indigo-700 text-base">Geometry Dimensions</dt>
            <dd className="text-slate-600 mt-1">Explicit physical sizes like <code>cross_width</code>, <code>pad_gap</code>, or <code>trace_width</code>. Overriding these manually will lock the component out of automated physics solving.</dd>
          </div>
          <div>
            <dt className="font-bold text-indigo-700 text-base">Material Overrides</dt>
            <dd className="text-slate-600 mt-1">Allows you to specify specific loss tangents or dielectric constants for a single component, overriding the global chip substrate settings.</dd>
          </div>
        </dl>
      </div>

      <h2 className="text-2xl font-bold mb-4 mt-10">Variables and Expressions</h2>
      <p className="text-slate-600 mb-6">
        You do not have to enter hardcoded numbers. The properties inspector supports mathematical expressions and referencing global variables. 
        For example, instead of typing <code>20um</code> for a gap width, you can type <code>global_cpw_gap * 1.5</code>. If the global variable changes, the component automatically updates.
      </p>
    </div>
  );
}`,

  'keyboard-shortcuts.tsx': `import React from "react";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Keyboard Shortcuts</h1>
      <p className="text-lg text-slate-600 mb-8">
        Accelerate your layout workflow by mastering the canvas hotkeys.
      </p>

      <div className="overflow-x-auto mb-8 border border-slate-200 rounded-xl shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 font-semibold text-slate-900">Action</th>
              <th className="px-6 py-4 font-semibold text-slate-900">Windows / Linux</th>
              <th className="px-6 py-4 font-semibold text-slate-900">macOS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-medium text-slate-900">Pan Canvas</td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">Middle-Click Drag</kbd></td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">Space + Drag</kbd></td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-medium text-slate-900">Zoom Canvas</td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">Mouse Wheel</kbd></td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">Pinch Trackpad</kbd></td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-medium text-slate-900">Select Tool (Pointer)</td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">V</kbd></td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">V</kbd></td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-medium text-slate-900">Wire Tool (Route)</td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">W</kbd></td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">W</kbd></td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-medium text-slate-900">Duplicate Selection</td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">Ctrl + D</kbd></td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">Cmd + D</kbd></td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-medium text-slate-900">Rotate Component 90°</td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">R</kbd></td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">R</kbd></td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className="px-6 py-4 font-medium text-slate-900">Run Quick DRC</td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">F5</kbd></td>
              <td className="px-6 py-4"><kbd className="bg-slate-100 border border-slate-300 rounded px-2 py-1 text-xs">Cmd + R</kbd></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}`,

  'save-restore.tsx': `import React from "react";
import { AlertBox } from "../AlertBox";

export default function Section() {
  return (
    <div className="documentation-page-content max-w-4xl">
      <h1 className="text-4xl font-extrabold mb-6">Save and Restore Designs</h1>
      <p className="text-lg text-slate-600 mb-8">
        Silicofeller provides robust state management to ensure you never lose a massive chip layout.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Auto-Save Mechanism</h2>
      <p className="text-slate-600 mb-6">
        As you work in the Schematic Editor, the application automatically serializes the AST state to your browser's \`IndexedDB\` every 5 seconds. If your browser crashes or tab is accidentally closed, the exact state of the canvas will be restored immediately upon reopening the project.
      </p>

      <h2 className="text-2xl font-bold mb-4 mt-10">Cloud Syncing</h2>
      <p className="text-slate-600 mb-6">
        When you explicitly click the <strong>Save</strong> button (or press Ctrl+S), the exact JSON representation of the layout is POSTed to the backend database. This creates a hard checkpoint in the project's version history.
      </p>

      <AlertBox type="tip" title="Version Control">
        Every cloud save generates a new immutable revision. You can open the <strong>History panel</strong> to view a timeline of saves, allowing you to instantly revert the schematic back to a previous working state if a routing experiment fails.
      </AlertBox>

      <h2 className="text-2xl font-bold mb-4 mt-10">Offline Export</h2>
      <p className="text-slate-600 mb-6">
        For air-gapped environments, you can export the raw project state as a \`.sqproj\` file. This is a compressed JSON payload that can be re-imported into any Silicofeller Studio instance.
      </p>
    </div>
  );
}`,

  'browse-components.tsx': `import React from "react";
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
      
      <CodeBlock language="python" code={\`# Custom QComponent Example
from qiskit_metal import draw, Dict
from qiskit_metal.qlibrary.core import QComponent

class MyCustomPad(QComponent):
    default_options = Dict(width='500um', height='500um')
    
    def make(self):
        p = self.p  # Parsed parameters
        rect = draw.rectangle(p.width, p.height, 0, 0)
        self.add_qgeometry('poly', {'pad': rect})
\`} />
    </div>
  );
}`
};

Object.keys(files).forEach(file => {
  fs.writeFileSync(path.join(dir, file), files[file], 'utf8');
});
console.log('Batch 1 expanded');
