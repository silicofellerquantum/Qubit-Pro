import React from "react";

export interface BlogPost {
  slug: string;
  tag: string;
  title: string;
  excerpt: string;
  date: string;
  authors: string;
  publishMeta: string;
  content: React.ReactNode;
  authorProfile?: React.ReactNode;
  comments?: React.ReactNode;
}

// ── Shared Author Profile ──────────────────────────────────────────────────
const SilicofellerAuthor = () => (
  <>
    <h3>About the Authors</h3>
    <div className="author-card">
      <div
        className="author-card-avatar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg,#7C3AED,#6D28D9)",
          color: "white",
          fontWeight: 700,
          fontSize: "1.25rem",
        }}
      >
        SF
      </div>
      <div className="author-card-info">
        <h4>Silicofeller Engineering Team</h4>
        <p>
          The Silicofeller team specialises in superconducting quantum chip design automation,
          electromagnetic simulation, and VLSI-grade layout tooling. Our mission is to make quantum
          hardware design accessible, reproducible, and physics-grounded.
        </p>
      </div>
    </div>
  </>
);

// ── Priority Badge Helper ──────────────────────────────────────────────────
const Badge = ({
  priority,
  children,
}: {
  priority: "crit" | "high" | "med" | "low";
  children: React.ReactNode;
}) => {
  const styles = {
    crit: { background: "#FEE2E2", color: "#991B1B" },
    high: { background: "#FEF3C7", color: "#92400E" },
    med: { background: "#E0F2FE", color: "#075985" },
    low: { background: "#F3F4F6", color: "#374151" },
  };
  return (
    <span
      style={{
        ...styles[priority],
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "0.75rem",
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
};

const HfssGuideContent = () => (
  <>
    <p>
      HFSS (High Frequency Structure Simulator) is a full-wave 3D electromagnetic field solver
      developed by Ansys. It uses the <strong>Finite Element Method (FEM)</strong> to compute field
      distributions in arbitrary 3D geometries—making it the industry-standard tool for RF,
      microwave, antenna, and increasingly, <strong>superconducting quantum circuit</strong> design.
    </p>
    <p>
      HFSS is critically important because it allows engineers to test and analyse electromagnetic
      designs <em>before</em> manufacturing. This dramatically improves performance, reduces design
      errors, and saves both time and cost—factors that are especially consequential in the
      cryogenic fabrication pipelines used for quantum processors.
    </p>

    <div className="callout-box">
      <p>
        "HFSS solves Maxwell's equations without low-frequency approximations, ensuring accuracy
        across broad frequency ranges. It is widely adopted in aerospace, defence, and semiconductor
        industries for RF and microwave design verification—and is now indispensable for
        superconducting qubit engineering."
      </p>
    </div>

    <h2>What Is HFSS?</h2>
    <p>
      At its core, HFSS is a <strong>full-wave 3D electromagnetic field solver</strong>. Unlike
      circuit-level simulators that rely on lumped-element approximations, HFSS directly solves the
      complete Maxwell's equations using the Finite Element Method. The geometry is discretised into
      tetrahedral mesh elements, and the full E-field and H-field distributions are computed at
      every point in the structure.
    </p>
    <ul>
      <li>
        <strong>Industry Standard:</strong> Widely adopted in aerospace, defence, and semiconductor
        industries for RF and microwave design verification.
      </li>
      <li>
        <strong>Full-Wave Accuracy:</strong> Solves Maxwell's equations without low-frequency
        approximations, ensuring accuracy across broad frequency ranges.
      </li>
      <li>
        <strong>Quantum-Ready:</strong> Eigenmode analysis and Energy Participation Ratio (EPR)
        extraction make HFSS the go-to solver for transmon qubit and resonator design.
      </li>
    </ul>

    <h2>Core Simulation Workflow</h2>
    <p>
      Every HFSS simulation follows a structured six-step pipeline. Understanding this workflow is
      essential for producing reliable, converged results.
    </p>

    <table>
      <thead>
        <tr>
          <th>Step</th>
          <th>Action</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td> 1</td>
          <td>
            <strong>Create Geometry</strong>
          </td>
          <td>
            Build or import the 3D model of the device to be analysed—coplanar waveguides, transmon
            pads, Josephson junctions, cavities, etc.
          </td>
        </tr>
        <tr>
          <td> 2</td>
          <td>
            <strong>Assign Materials</strong>
          </td>
          <td>
            Assign dielectric constants, conductivity, and loss tangent to each volume. For
            superconducting circuits, set perfect-E boundaries or impedance sheets with surface
            resistance.
          </td>
        </tr>
        <tr>
          <td> 3</td>
          <td>
            <strong>Apply Boundary Conditions</strong>
          </td>
          <td>
            Define how electromagnetic waves interact with the surroundings—radiation boundaries,
            symmetry planes, PEC/PMC walls, lumped ports, or wave ports.
          </td>
        </tr>
        <tr>
          <td> 4</td>
          <td>
            <strong>Generate Mesh</strong>
          </td>
          <td>
            Divide the model into tetrahedral elements. HFSS uses adaptive mesh refinement (AMR) to
            automatically concentrate elements where fields vary rapidly.
          </td>
        </tr>
        <tr>
          <td> 5</td>
          <td>
            <strong>Run Simulation</strong>
          </td>
          <td>
            Solve Maxwell's equations across the mesh. The solver iterates through adaptive passes
            until the convergence criterion (ΔS or Δf) is met.
          </td>
        </tr>
        <tr>
          <td> 6</td>
          <td>
            <strong>Analyse Results</strong>
          </td>
          <td>
            View and evaluate outputs: S-parameters, resonant frequencies, Q-factors, field
            distributions, participation ratios, and radiation patterns.
          </td>
        </tr>
      </tbody>
    </table>

    <h2>Types of Analysis in HFSS</h2>
    <p>
      HFSS supports three primary solution types, each suited to different classes of
      electromagnetic problems. Selecting the correct analysis type is the first critical design
      decision in any simulation project.
    </p>

    <h3>Driven Modal Analysis</h3>
    <p>
      Driven Modal Analysis is used to study how electromagnetic signals travel through devices such
      as antennas, filters, and waveguides. It solves for S-parameters by exciting waveguide modal
      ports and is one of the most commonly used analysis types in HFSS.
    </p>
    <ul>
      <li>Best for antenna feeds, waveguide components, and RF filters</li>
      <li>Outputs: S-parameters, field overlays, radiation patterns, gain</li>
      <li>Supports Floquet ports for periodic structures and phased arrays</li>
    </ul>

    <h3>Driven Terminal Analysis</h3>
    <p>
      Driven Terminal Analysis is designed for PCB traces, connectors, cables, and electronic
      circuits. Instead of focusing on electromagnetic modes, it analyses electrical
      quantities—voltage, current, and impedance—at circuit terminals. This makes it directly
      compatible with circuit simulators for co-simulation workflows.
    </p>
    <ul>
      <li>
        <strong>Multi-Conductor Systems:</strong> Handles coupled microstrip lines, differential
        pairs, and connector pin arrays
      </li>
      <li>
        <strong>PCB and Package Design:</strong> Directly compatible with circuit simulators for
        co-simulation workflows
      </li>
    </ul>

    <h3>Eigenmode Analysis</h3>
    <p>
      Eigenmode analysis solves the source-free Maxwell's equations to find natural resonant
      frequencies and field patterns of closed or periodic structures—
      <strong>no ports required</strong>. This is the primary analysis type used for superconducting
      quantum circuit design.
    </p>
    <ul>
      <li>
        <strong>Resonant Frequency:</strong> Identifies cavity modes, waveguide cutoff frequencies,
        and dielectric resonator modes
      </li>
      <li>
        <strong>Unloaded Q-Factor:</strong> Computes quality factor accounting for conductor and
        dielectric losses
      </li>
      <li>
        <strong>EPR Extraction:</strong> Energy Participation Ratio analysis extracts qubit
        parameters (anharmonicity, dispersive shift, T₁) directly from the eigenmode solution
      </li>
    </ul>

    <h2>S-Parameters and Field Visualisation</h2>
    <p>
      S-Parameters quantify how well a device transmits and reflects electromagnetic signals. They
      are the primary output of Driven Modal and Driven Terminal analyses.
    </p>
    <table>
      <thead>
        <tr>
          <th>Parameter</th>
          <th>Meaning</th>
          <th>Design Guidance</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <strong>S11 (Reflection)</strong>
          </td>
          <td>Fraction of signal reflected back from the device input port</td>
          <td>Lower S11 = better impedance match. Target: &lt; −20 dB at operating frequency</td>
        </tr>
        <tr>
          <td>
            <strong>S21 (Transmission)</strong>
          </td>
          <td>Fraction of signal passed through the device from input to output</td>
          <td>Higher S21 = better transmission efficiency. Target: &gt; −0.1 dB in passband</td>
        </tr>
      </tbody>
    </table>
    <p>
      HFSS also provides rich 3D field visualisations—electric field magnitude, magnetic field
      vectors, surface currents, and power flow—enabling engineers to identify hotspots, coupling
      mechanisms, and radiation leakage paths directly in the design geometry.
    </p>

    <h2>Application: Superconducting Quantum Circuits</h2>
    <p>
      HFSS has become the <em>de facto</em> electromagnetic solver for superconducting quantum
      circuit design. A typical quantum chip simulation includes:
    </p>

    <ul>
      <li>
        <strong>(a)</strong> The complete quantum chip layout—transmon qubits, readout resonators,
        coupling buses, and control lines
      </li>
      <li>
        <strong>(b)</strong> Enlarged view of the transmon qubit and λ/2 resonator, showing
        capacitor pad geometry and coupling finger dimensions
      </li>
      <li>
        <strong>(c)</strong> Josephson junctions (JJ1, JJ2, JJ3)—the core nonlinear elements that
        provide quantum anharmonicity
      </li>
      <li>
        <strong>(d)</strong> Simulated field distributions obtained through eigenmode analysis, used
        for EPR extraction
      </li>
      <li>
        <strong>(e)</strong> Cross-sectional view showing the different material layers (substrate,
        metal, oxide) used in fabrication
      </li>
    </ul>
    <p>
      The HFSS eigenmode solution feeds directly into the{" "}
      <strong>Energy Participation Ratio (EPR)</strong> framework developed by Zlatko Minev,
      enabling extraction of the full circuit-QED Hamiltonian—including qubit frequency,
      anharmonicity, dispersive shifts, Purcell decay rates, and T₁ predictions—all from the
      simulated electromagnetic fields.
    </p>

    <h2>Key Takeaways</h2>
    <ul>
      <li>
        HFSS plays a vital role in modern engineering by allowing engineers to test and validate
        complex electromagnetic designs in a virtual environment before manufacturing.
      </li>
      <li>
        The software helps improve product reliability and performance by identifying potential
        design issues early in the development process, reducing the risk of costly failures.
      </li>
      <li>
        With the growing demand for advanced technologies such as 5G communication, autonomous
        vehicles, satellite systems, and quantum computing, the need for accurate electromagnetic
        simulation tools continues to increase.
      </li>
      <li>
        As engineering systems become more complex and operate at higher frequencies, simulation
        tools like HFSS will remain essential for designing next-generation communication and
        computing technologies.
      </li>
    </ul>
  </>
);

const HfssParamsContent = () => (
  <>
    <p>
      Designing superconducting quantum processors requires precise control over dozens of
      electromagnetic parameters—each of which must fall within tightly specified ranges to achieve
      the coherence, fidelity, and scalability demanded by fault-tolerant quantum computing. This
      reference catalogues <strong> 52 output parameters</strong> extracted from HFSS simulations,
      organised into 7 categories, with design rules sourced from IEEE/APS research papers and
      doctoral theses spanning 2004–2026.
    </p>

    <div className="callout-box">
      <p>
        "Each parameter includes its ideal value, acceptable range, and the physical consequence of
        deviation. Of the 52 parameters, 26 are classified as Critical—meaning that falling outside
        their acceptable range will directly compromise qubit performance, readout fidelity, or gate
        accuracy."
      </p>
    </div>

    <h2>Parameter Category Overview</h2>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>Parameters</th>
          <th>Critical</th>
          <th>High</th>
          <th>Medium</th>
          <th>Low</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td> 1. S-Parameters &amp; RF Performance</td>
          <td> 8</td>
          <td> 3</td>
          <td> 3</td>
          <td> 2</td>
          <td>—</td>
        </tr>
        <tr>
          <td> 2. Resonator &amp; Cavity Parameters</td>
          <td> 10</td>
          <td> 5</td>
          <td> 2</td>
          <td> 2</td>
          <td> 1</td>
        </tr>
        <tr>
          <td> 3. Electromagnetic Field Outputs</td>
          <td> 7</td>
          <td> 3</td>
          <td> 3</td>
          <td> 1</td>
          <td>—</td>
        </tr>
        <tr>
          <td> 4. Qubit Performance Metrics</td>
          <td> 9</td>
          <td> 9</td>
          <td>—</td>
          <td>—</td>
          <td>—</td>
        </tr>
        <tr>
          <td> 5. Crosstalk &amp; Isolation</td>
          <td> 6</td>
          <td> 2</td>
          <td> 3</td>
          <td> 1</td>
          <td>—</td>
        </tr>
        <tr>
          <td> 6. Thermal &amp; Loss Parameters</td>
          <td> 7</td>
          <td> 2</td>
          <td> 3</td>
          <td> 2</td>
          <td>—</td>
        </tr>
        <tr>
          <td> 7. Simulation Convergence Metrics</td>
          <td> 5</td>
          <td> 1</td>
          <td> 1</td>
          <td> 2</td>
          <td> 1</td>
        </tr>
        <tr style={{ fontWeight: 700, background: "rgba(124,58,237,0.03)" }}>
          <td>Total</td>
          <td> 52</td>
          <td> 25</td>
          <td> 15</td>
          <td> 10</td>
          <td> 2</td>
        </tr>
      </tbody>
    </table>

    <h2> 1. S-Parameters &amp; RF Performance</h2>
    <p>
      S-parameters quantify signal transmission, reflection, and isolation across the microwave
      readout and control chain. Poor S-parameter performance degrades qubit readout SNR, causes
      impedance mismatch, and allows noise back-action from amplifiers to reach the qubit.
    </p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Parameter</th>
          <th>Priority</th>
          <th>Ideal Value</th>
          <th>Acceptable Range</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>HFSS-S-001</td>
          <td>Return Loss (S11)</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td>&lt; −20 dB</td>
          <td>−15 to −25 dB</td>
        </tr>
        <tr>
          <td>HFSS-S-002</td>
          <td>Insertion Loss (S21)</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td>&lt; −0.1 dB</td>
          <td>−0.1 to −1 dB</td>
        </tr>
        <tr>
          <td>HFSS-S-003</td>
          <td>Transmission |S21|</td>
          <td>
            <Badge priority="high">High</Badge>
          </td>
          <td>&approx; 1.0 (unity)</td>
          <td> 0.9 – 1.0</td>
        </tr>
        <tr>
          <td>HFSS-S-004</td>
          <td>Port Isolation</td>
          <td>
            <Badge priority="high">High</Badge>
          </td>
          <td>&lt; −30 dB</td>
          <td>−20 to −40 dB</td>
        </tr>
        <tr>
          <td>HFSS-S-005</td>
          <td>Forward Isolation (S12)</td>
          <td>
            <Badge priority="high">High</Badge>
          </td>
          <td>&lt; −20 dB</td>
          <td>−15 to −30 dB</td>
        </tr>
        <tr>
          <td>HFSS-S-006</td>
          <td>Phase of S21 (GDD)</td>
          <td>
            <Badge priority="med">Medium</Badge>
          </td>
          <td>Linear phase</td>
          <td>&lt; 5° deviation</td>
        </tr>
        <tr>
          <td>HFSS-S-007</td>
          <td>Coupling Coefficient κ</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td> 1 – 5 MHz</td>
          <td> 0.5 – 20 MHz</td>
        </tr>
        <tr>
          <td>HFSS-S-008</td>
          <td>VSWR</td>
          <td>
            <Badge priority="med">Medium</Badge>
          </td>
          <td>&lt; 1.1 : 1</td>
          <td> 1.1 – 1.5 : 1</td>
        </tr>
      </tbody>
    </table>

    <h2> 2. Resonator &amp; Cavity Parameters</h2>
    <p>
      Resonator parameters govern the readout chain performance. The resonant frequency, quality
      factors (loaded, internal, external), and coupling strength determine measurement speed,
      Purcell-limited T₁, and single-shot readout fidelity.
    </p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Parameter</th>
          <th>Priority</th>
          <th>Ideal Value</th>
          <th>Acceptable Range</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>HFSS-R-001</td>
          <td>Resonant Frequency f₀</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td> 5 – 7 GHz</td>
          <td> 4 – 8 GHz</td>
        </tr>
        <tr>
          <td>HFSS-R-002</td>
          <td>Loaded Q (Q_L)</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td> 5,000 – 20,000</td>
          <td> 1,000 – 50,000</td>
        </tr>
        <tr>
          <td>HFSS-R-003</td>
          <td>Internal Q (Q_i)</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td>&gt; 10⁶</td>
          <td> 10⁵ – 10⁷</td>
        </tr>
        <tr>
          <td>HFSS-R-004</td>
          <td>External Q (Q_e)</td>
          <td>
            <Badge priority="high">High</Badge>
          </td>
          <td> 2,000 – 20,000</td>
          <td> 500 – 100,000</td>
        </tr>
        <tr>
          <td>HFSS-R-005</td>
          <td>Coupling Strength g</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td> 50 – 150 MHz</td>
          <td> 10 – 300 MHz</td>
        </tr>
        <tr>
          <td>HFSS-R-006</td>
          <td>Dispersive Shift χ</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td> 1 – 5 MHz</td>
          <td> 0.1 – 20 MHz</td>
        </tr>
        <tr>
          <td>HFSS-R-007</td>
          <td>Photon Decay Rate κ</td>
          <td>
            <Badge priority="high">High</Badge>
          </td>
          <td> 1 – 5 MHz</td>
          <td> 0.1 – 20 MHz</td>
        </tr>
        <tr>
          <td>HFSS-R-008</td>
          <td>Impedance Z₀</td>
          <td>
            <Badge priority="med">Medium</Badge>
          </td>
          <td> 50 Ω</td>
          <td> 45 – 55 Ω</td>
        </tr>
        <tr>
          <td>HFSS-R-009</td>
          <td>Frequency Pulling Δf</td>
          <td>
            <Badge priority="med">Medium</Badge>
          </td>
          <td>&lt; 0.5 MHz</td>
          <td>&lt; 2 MHz</td>
        </tr>
        <tr>
          <td>HFSS-R-010</td>
          <td>Kinetic Inductance α</td>
          <td>
            <Badge priority="low">Low</Badge>
          </td>
          <td> 0.05 – 0.2</td>
          <td> 0.001 – 0.5</td>
        </tr>
      </tbody>
    </table>

    <h2> 3. Electromagnetic Field Outputs</h2>
    <p>
      Field outputs from HFSS eigenmode simulations are the foundation of the Energy Participation
      Ratio (EPR) method. Interface participation ratios (p_SA, p_MA, p_MS) multiplied by their
      respective loss tangents predict qubit T₁ with remarkable accuracy.
    </p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Parameter</th>
          <th>Priority</th>
          <th>Ideal Value</th>
          <th>Acceptable Range</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>HFSS-E-001</td>
          <td>Peak E-Field |E|max</td>
          <td>
            <Badge priority="high">High</Badge>
          </td>
          <td>&lt; 10⁵ V/m</td>
          <td>&lt; 10⁷ V/m</td>
        </tr>
        <tr>
          <td>HFSS-E-002</td>
          <td>H-Field Distribution |H|</td>
          <td>
            <Badge priority="med">Medium</Badge>
          </td>
          <td>&lt; 500 A/m</td>
          <td>&lt; 5,000 A/m</td>
        </tr>
        <tr>
          <td>HFSS-E-003</td>
          <td>Interface Participation pᵢ</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td>&lt; 10⁻³</td>
          <td> 10⁻³ – 10⁻²</td>
        </tr>
        <tr>
          <td>HFSS-E-004</td>
          <td>Surface Participation p_MA</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td>&lt; 10⁻⁴</td>
          <td> 10⁻⁴ – 10⁻³</td>
        </tr>
        <tr>
          <td>HFSS-E-005</td>
          <td>Bulk Participation p_bulk</td>
          <td>
            <Badge priority="high">High</Badge>
          </td>
          <td>&lt; 5×10⁻³</td>
          <td> 10⁻² – 5×10⁻²</td>
        </tr>
        <tr>
          <td>HFSS-E-006</td>
          <td>Junction EPR</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td> 0.95 – 1.0</td>
          <td> 0.8 – 1.0</td>
        </tr>
        <tr>
          <td>HFSS-E-007</td>
          <td>Radiation Q (Q_rad)</td>
          <td>
            <Badge priority="high">High</Badge>
          </td>
          <td>&gt; 10⁶</td>
          <td>&gt; 10⁵</td>
        </tr>
      </tbody>
    </table>

    <h2> 4. Qubit Performance Metrics</h2>
    <p>
      Every parameter in this category is classified as <strong>Critical</strong>. These metrics
      define the fundamental quantum performance of the transmon qubit—frequency, anharmonicity,
      coherence times, and gate fidelities. All are derived from HFSS eigenmode solutions combined
      with junction parameters.
    </p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Parameter</th>
          <th>Priority</th>
          <th>Ideal Value</th>
          <th>Acceptable Range</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>HFSS-Q-001</td>
          <td>Anharmonicity α</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td>−200 to −300 MHz</td>
          <td>−100 to −500 MHz</td>
        </tr>
        <tr>
          <td>HFSS-Q-002</td>
          <td>Qubit Frequency f_q</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td> 4 – 6 GHz</td>
          <td> 3 – 8 GHz</td>
        </tr>
        <tr>
          <td>HFSS-Q-003</td>
          <td>Josephson Energy E_J</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td> 15 – 30 GHz</td>
          <td> 5 – 60 GHz</td>
        </tr>
        <tr>
          <td>HFSS-Q-004</td>
          <td>Charging Energy E_C</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td> 200 – 350 MHz</td>
          <td> 100 – 500 MHz</td>
        </tr>
        <tr>
          <td>HFSS-Q-005</td>
          <td>Purcell Decay Rate γ_P</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td>&lt; 500 Hz</td>
          <td>&lt; 10 kHz</td>
        </tr>
        <tr>
          <td>HFSS-Q-006</td>
          <td>Predicted T₁</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td>&gt; 100 µs (2D) / &gt; 500 µs (3D)</td>
          <td> 50 – 500 µs</td>
        </tr>
        <tr>
          <td>HFSS-Q-007</td>
          <td>Predicted T₂</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td>&gt; 100 µs</td>
          <td> 20 – 300 µs</td>
        </tr>
        <tr>
          <td>HFSS-Q-008</td>
          <td> 1Q Gate Fidelity F₁Q</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td>&gt; 99.9%</td>
          <td> 99 – 99.99%</td>
        </tr>
        <tr>
          <td>HFSS-Q-009</td>
          <td> 2Q Gate Fidelity F₂Q</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td>&gt; 99.5%</td>
          <td> 98 – 99.9%</td>
        </tr>
      </tbody>
    </table>

    <h2> 5. Crosstalk &amp; Isolation</h2>
    <p>
      Crosstalk parameters quantify unwanted electromagnetic coupling between qubits, control lines,
      and spurious package modes. Insufficient isolation causes always-on ZZ errors, driven
      rotations on idle qubits, and leakage to non-computational states.
    </p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Parameter</th>
          <th>Priority</th>
          <th>Ideal Value</th>
          <th>Acceptable Range</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>HFSS-C-001</td>
          <td>ZZ Coupling ζ (idle)</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td>&lt; 1 kHz</td>
          <td> 1 – 100 kHz</td>
        </tr>
        <tr>
          <td>HFSS-C-002</td>
          <td>Nearest Neighbour Isolation</td>
          <td>
            <Badge priority="high">High</Badge>
          </td>
          <td>&lt; −40 dB</td>
          <td>−30 to −50 dB</td>
        </tr>
        <tr>
          <td>HFSS-C-003</td>
          <td>Next-Nearest Isolation</td>
          <td>
            <Badge priority="high">High</Badge>
          </td>
          <td>&lt; −60 dB</td>
          <td>−50 to −70 dB</td>
        </tr>
        <tr>
          <td>HFSS-C-004</td>
          <td>Leakage to |2⟩ (L₁)</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td>&lt; 0.01%</td>
          <td> 0.01 – 0.1%</td>
        </tr>
        <tr>
          <td>HFSS-C-005</td>
          <td>Spurious Mode Gap Δf_spur</td>
          <td>
            <Badge priority="high">High</Badge>
          </td>
          <td>&gt; 1 GHz</td>
          <td> 0.5 – 2 GHz</td>
        </tr>
        <tr>
          <td>HFSS-C-006</td>
          <td>Package Mode Density</td>
          <td>
            <Badge priority="med">Medium</Badge>
          </td>
          <td>&lt; 0.5 modes/GHz</td>
          <td>&lt; 5 modes/GHz</td>
        </tr>
      </tbody>
    </table>

    <h2> 6. Thermal &amp; Loss Parameters</h2>
    <p>
      Thermal and loss parameters govern the intrinsic energy dissipation mechanisms in the quantum
      chip. Dielectric loss tangent, surface resistance, and TLS defect densities set the
      fundamental floor on qubit coherence times.
    </p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Parameter</th>
          <th>Priority</th>
          <th>Ideal Value</th>
          <th>Acceptable Range</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>HFSS-T-001</td>
          <td>Dielectric Loss Tangent</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td>&lt; 10⁻⁶</td>
          <td> 10⁻⁷ – 10⁻⁵</td>
        </tr>
        <tr>
          <td>HFSS-T-002</td>
          <td>Surface Resistance Rs</td>
          <td>
            <Badge priority="high">High</Badge>
          </td>
          <td>&lt; 0.005 mΩ/□</td>
          <td> 0.001 – 0.1 mΩ/□</td>
        </tr>
        <tr>
          <td>HFSS-T-003</td>
          <td>Dissipated Power P_sub</td>
          <td>
            <Badge priority="high">High</Badge>
          </td>
          <td>&lt; 0.1 pW</td>
          <td> 0.1 – 100 pW</td>
        </tr>
        <tr>
          <td>HFSS-T-004</td>
          <td>Thermal NEP</td>
          <td>
            <Badge priority="med">Medium</Badge>
          </td>
          <td>&lt; 10⁻²⁰ W/√Hz</td>
          <td> 10⁻²⁰ – 10⁻¹⁸</td>
        </tr>
        <tr>
          <td>HFSS-T-005</td>
          <td>TLS Loss Rate 1/T₁_TLS</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td>&lt; 0.5 kHz</td>
          <td> 0.5 – 10 kHz</td>
        </tr>
        <tr>
          <td>HFSS-T-006</td>
          <td>Conductor Loss α_c</td>
          <td>
            <Badge priority="med">Medium</Badge>
          </td>
          <td>&lt; 0.0001 dB/m</td>
          <td> 0.0001 – 0.1 dB/m</td>
        </tr>
        <tr>
          <td>HFSS-T-007</td>
          <td>Package Radiation Loss 1/Q_rad</td>
          <td>
            <Badge priority="high">High</Badge>
          </td>
          <td>&lt; 10⁻⁷</td>
          <td> 10⁻⁷ – 10⁻⁵</td>
        </tr>
      </tbody>
    </table>

    <h2> 7. Simulation Convergence Metrics</h2>
    <p>
      Convergence metrics ensure the HFSS solution is reliable. An unconverged simulation produces
      inaccurate S-parameters, Q-factors, and participation ratios—leading to incorrect qubit
      frequency and T₁ predictions.
    </p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Parameter</th>
          <th>Priority</th>
          <th>Ideal Value</th>
          <th>Acceptable Range</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>HFSS-V-001</td>
          <td>Delta S Convergence (ΔS)</td>
          <td>
            <Badge priority="crit">Critical</Badge>
          </td>
          <td>&lt; 0.001</td>
          <td> 0.001 – 0.005</td>
        </tr>
        <tr>
          <td>HFSS-V-002</td>
          <td>Adaptive Pass Count</td>
          <td>
            <Badge priority="med">Medium</Badge>
          </td>
          <td> 6 – 12 passes</td>
          <td> 6 – 25 passes</td>
        </tr>
        <tr>
          <td>HFSS-V-003</td>
          <td>Mesh Element Count</td>
          <td>
            <Badge priority="med">Medium</Badge>
          </td>
          <td> 20k – 100k</td>
          <td> 10k – 500k</td>
        </tr>
        <tr>
          <td>HFSS-V-004</td>
          <td>Energy Error Δε/ε</td>
          <td>
            <Badge priority="high">High</Badge>
          </td>
          <td>&lt; 0.2%</td>
          <td> 0.2 – 1%</td>
        </tr>
        <tr>
          <td>HFSS-V-005</td>
          <td>Simulation RAM Usage</td>
          <td>
            <Badge priority="low">Low</Badge>
          </td>
          <td>&lt; 16 GB</td>
          <td> 16 – 64 GB</td>
        </tr>
      </tbody>
    </table>

    <h2>Key Takeaways</h2>
    <ul>
      <li>
        <strong> 25 of 52 parameters are Critical</strong>—deviating from their acceptable ranges
        will directly compromise qubit performance or readout fidelity.
      </li>
      <li>
        <strong>Qubit Performance Metrics</strong> is the only category where every parameter is
        Critical (9/9), reflecting the tight design tolerances required for fault-tolerant quantum
        computing.
      </li>
      <li>
        <strong>Participation ratios</strong> (p_SA, p_MA, p_bulk) are the primary design levers for
        maximising T₁—they connect geometry choices to loss mechanisms through the EPR framework.
      </li>
      <li>
        <strong>Convergence must be verified</strong>: ΔS &lt; 0.002 and energy error &lt; 0.5%
        before any parameter extraction is considered reliable.
      </li>
    </ul>
    <p style={{ fontSize: "0.85rem", color: "#64748B", marginTop: "2rem" }}>
      Sources: IEEE / APS Research Papers &amp; Doctoral Theses (2004–2026) · HFSS Quantum
      Silicofeller Format
    </p>
  </>
);

const Q3dParamsContent = () => (
  <>
    <p>
      Q3D Extractor by ANSYS is the industry-standard tool for parasitic extraction in
      superconducting quantum circuits. It computes the <strong>RLGC matrices</strong>—Resistance,
      Inductance, Conductance, and Capacitance—for arbitrary conductor geometries on layered
      substrates. These matrices are the primary inputs to circuit Hamiltonian models that predict
      qubit frequency, anharmonicity, coupling strengths, and coherence times.
    </p>
    <p>
      This reference catalogues <strong> 47+ output parameters</strong> across 11 categories, with
      design rules derived from ANSYS Q3D documentation, IBM Quantum, Google AI Quantum, Krantz
      2019, and Blais RMP 2021.
    </p>

    <div className="callout-box">
      <p>
        "Even small parasitic entries in the RLGC matrices shift qubit frequencies by 10–100 MHz. At
        4K, aluminium and niobium become superconducting (R → 0), and kinetic inductance dominates.
        Normal-metal values from Q3D need temperature-dependent correction before use in the quantum
        Hamiltonian."
      </p>
    </div>

    <h2>Parameter Category Overview</h2>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>Parameters</th>
          <th>Key Focus</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td> 1. Resistance Matrix (R)</td>
          <td> 5</td>
          <td>Ohmic loss, ground plane, via resistance</td>
        </tr>
        <tr>
          <td> 2. Inductance Matrix (L)</td>
          <td> 5</td>
          <td>Self/mutual inductance, kinetic inductance, Josephson L_J</td>
        </tr>
        <tr>
          <td> 3. Conductance Matrix (G)</td>
          <td> 4</td>
          <td>Substrate leakage, surface conductance</td>
        </tr>
        <tr>
          <td> 4. Capacitance Matrix (C)</td>
          <td> 6</td>
          <td>Qubit C_Σ, coupling caps, pad-to-ground parasitics</td>
        </tr>
        <tr>
          <td> 5. Parasitic Resistance</td>
          <td> 4</td>
          <td>JJ series R, shunt R, wirebond/bump R</td>
        </tr>
        <tr>
          <td> 6. Parasitic Inductance</td>
          <td> 4</td>
          <td>Wirebond L, lead L, slot L, package L</td>
        </tr>
        <tr>
          <td> 7. Parasitic Capacitance</td>
          <td> 5</td>
          <td>Trace-to-ground, substrate, inter-layer, fringe</td>
        </tr>
        <tr>
          <td> 8. Electromagnetic Coupling</td>
          <td> 6</td>
          <td>Q_ext, Q_int, Q_L, Z₀, ε_eff, coupling k²</td>
        </tr>
        <tr>
          <td> 9. Substrate &amp; Dielectric Loss</td>
          <td> 5</td>
          <td>tan δ_bulk, tan δ_MA, tan δ_SA, tan δ_MS, SPR</td>
        </tr>
        <tr>
          <td> 10. Skin Effect &amp; Frequency-Dependent</td>
          <td> 7</td>
          <td>Skin depth, R_ac/R_dc, propagation, RLGC per-unit-length</td>
        </tr>
        <tr>
          <td> 11. Post-Processing Derived Outputs</td>
          <td> 7</td>
          <td>E_C, E_J, g, χ, ζ, α, Γ_P</td>
        </tr>
      </tbody>
    </table>

    <h2> 1. Resistance Matrix (R)</h2>
    <p>
      The resistance matrix captures ohmic losses in the conductor network. At room temperature
      these values are used for fabrication quality assessment; at cryogenic temperatures Al becomes
      superconducting (R → 0) and the normal-state resistance R_N serves as a junction quality
      proxy.
    </p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Parameter</th>
          <th>Ideal</th>
          <th>Good Range</th>
          <th>Key Design Note</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td> 1</td>
          <td>DC Self-Resistance R_ii</td>
          <td>&lt; 1 mΩ</td>
          <td> 0.5 – 5 mΩ</td>
          <td>Al superconducting at 4K → R→0; use R_N·A as fab quality proxy</td>
        </tr>
        <tr>
          <td> 2</td>
          <td>AC Self-Resistance (5–6 GHz)</td>
          <td>&lt; 5 mΩ (SC at 4K)</td>
          <td> 5 – 20 mΩ</td>
          <td>Skin effect: R_ac ∝ √f for bulk; &approx; R_dc for thin film &lt; δ_s</td>
        </tr>
        <tr>
          <td> 3</td>
          <td>Mutual Resistance R_ij</td>
          <td>&approx; 0</td>
          <td>&lt; 50 μΩ</td>
          <td>Non-zero R_ij reveals overlapping ground return paths</td>
        </tr>
        <tr>
          <td> 4</td>
          <td>Contact / Via Resistance</td>
          <td>&lt; 1 mΩ</td>
          <td> 1 – 5 mΩ</td>
          <td>Critical for multi-chip modules; oxidation is the main failure mode</td>
        </tr>
        <tr>
          <td> 5</td>
          <td>Ground Plane Sheet Resistance</td>
          <td>&lt; 0.1 mΩ/sq</td>
          <td> 0.1 – 0.5 mΩ/sq</td>
          <td>Perforated ground planes add ~5–10 pH/sq for vortex pinning</td>
        </tr>
      </tbody>
    </table>

    <h2> 2. Inductance Matrix (L)</h2>
    <p>
      The inductance matrix sets the Josephson energy E_J = Φ₀²/2L, which directly determines qubit
      frequency. Both geometric and kinetic inductance contributions must be accounted for in the
      design model.
    </p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Parameter</th>
          <th>Ideal</th>
          <th>Good Range</th>
          <th>Key Design Note</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td> 6</td>
          <td>Self-Inductance L_ii</td>
          <td> 1 – 3 nH</td>
          <td> 0.5 – 5 nH</td>
          <td>L = L_geo + L_kinetic; target E_J/E_C ~ 50–80</td>
        </tr>
        <tr>
          <td> 7</td>
          <td>Mutual Inductance M_ij</td>
          <td>&lt; 5 pH (idle)</td>
          <td> 5 – 50 pH</td>
          <td>Intentional M_ij in flux-tunable couplers; unintentional sets ZZ floor</td>
        </tr>
        <tr>
          <td> 8</td>
          <td>Geometric Inductance</td>
          <td>&lt; 0.5 pH/μm</td>
          <td> 0.5 – 1 pH/μm</td>
          <td>Slot cuts in ground plane drastically increase L_geo</td>
        </tr>
        <tr>
          <td> 9</td>
          <td>Kinetic Inductance L_k</td>
          <td>&lt; 2 pH/sq (Al)</td>
          <td> 1 – 10 pH/sq</td>
          <td>High-L_k materials (NbTiN, TiN) used for KI qubit designs</td>
        </tr>
        <tr>
          <td> 10</td>
          <td>Josephson Inductance L_J</td>
          <td> 8 – 12 nH</td>
          <td> 5 – 20 nH</td>
          <td>The ONLY nonlinear element; L_J/C_Σ ratio sets anharmonicity</td>
        </tr>
      </tbody>
    </table>

    <h2> 3. Conductance Matrix (G)</h2>
    <p>
      Conductance matrix entries represent leakage current paths through the substrate and along
      surfaces. On high-resistivity silicon at 4K, these should be negligible—any measurable
      conductance indicates substrate quality or surface contamination issues.
    </p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Parameter</th>
          <th>Ideal</th>
          <th>Good Range</th>
          <th>Key Design Note</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td> 11</td>
          <td>Self-Conductance G_ii</td>
          <td>&lt; 0.1 nS</td>
          <td> 0.1 – 1 nS</td>
          <td>G_ii = 1/R_leak; appears as parallel resistance in resonator model</td>
        </tr>
        <tr>
          <td> 12</td>
          <td>Substrate Bulk Conductance</td>
          <td>&lt; 0.01 nS</td>
          <td> 0.01 – 0.5 nS</td>
          <td>Use HR-Si (&gt; 10 kΩ·cm) or sapphire; resistivity ↑ 100× at 4K</td>
        </tr>
        <tr>
          <td> 13</td>
          <td>Surface / Interface Conductance</td>
          <td>&lt; 0.001 nS/μm</td>
          <td> 0.001 – 0.05 nS/μm</td>
          <td>Adsorbed water and organics increase G_surf; HF dip before cooldown</td>
        </tr>
        <tr>
          <td> 14</td>
          <td>Mutual Conductance G_ij</td>
          <td>&lt; 1 pS</td>
          <td> 1 – 50 pS</td>
          <td>Non-zero in presence of surface water; fixed by clean or guard rings</td>
        </tr>
      </tbody>
    </table>

    <h2> 4. Capacitance Matrix (C)</h2>
    <p>
      The capacitance matrix is arguably the most important Q3D output for transmon design. The
      total qubit self-capacitance C_Σ sets the charging energy E_C = e²/2C_Σ, which determines the
      E_J/E_C ratio, anharmonicity, and charge noise sensitivity.
    </p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Parameter</th>
          <th>Ideal</th>
          <th>Good Range</th>
          <th>Key Design Note</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td> 15</td>
          <td>Qubit Self-Capacitance C_Σ</td>
          <td> 60 – 100 fF</td>
          <td> 40 – 200 fF</td>
          <td>C_Σ = Σ|C_ij| from Maxwell matrix; target E_J/E_C = 50–80</td>
        </tr>
        <tr>
          <td> 16</td>
          <td>Readout Resonator Cap C_r</td>
          <td> 200 – 500 fF</td>
          <td> 100 – 600 fF</td>
          <td>Sets ω_r = 1/√(L_r C_r); target 6.5–8 GHz window</td>
        </tr>
        <tr>
          <td> 17</td>
          <td>Qubit–Resonator Coupling C_g</td>
          <td> 1 – 10 fF</td>
          <td> 0.5 – 15 fF</td>
          <td>g/2π target 50–150 MHz; Purcell decay ∝ (g/Δ)² × κ</td>
        </tr>
        <tr>
          <td> 18</td>
          <td>Qubit–Qubit Coupling C_J</td>
          <td> 0.5 – 5 fF</td>
          <td> 0.2 – 10 fF</td>
          <td>Modern heavy-hex lattice uses tunable couplers to cancel residual ZZ</td>
        </tr>
        <tr>
          <td> 19</td>
          <td>Pad-to-Ground Parasitic Cap</td>
          <td>&lt; 5 fF</td>
          <td> 1 – 20 fF</td>
          <td>Each 1 fF of parasitic shifts f_qubit by ~10–30 MHz</td>
        </tr>
        <tr>
          <td> 20</td>
          <td>Trace Mutual Capacitance C_ij</td>
          <td>&lt; 1 fF</td>
          <td> 1 – 5 fF</td>
          <td>Overlapping traces on adjacent layers is the primary source</td>
        </tr>
      </tbody>
    </table>

    <h2> 5. Parasitic Resistance</h2>
    <p>
      Parasitic resistances in the qubit circuit cause energy dissipation that directly limits T₁.
      At millikelvin temperatures, the dominant sources are quasiparticle conductance in JJ leads
      and substrate leakage through lithography residues.
    </p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Parameter</th>
          <th>Ideal</th>
          <th>Good Range</th>
          <th>Key Design Note</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td> 21</td>
          <td>Series JJ Parasitic R</td>
          <td>&lt; 0.01 Ω</td>
          <td> 0.01 – 0.1 Ω</td>
          <td>Quasiparticle poisoning transiently raises R_ser; shielding critical</td>
        </tr>
        <tr>
          <td> 22</td>
          <td>Shunt Parasitic R (R_p)</td>
          <td>&gt; 1 MΩ</td>
          <td> 100 kΩ – 1 MΩ</td>
          <td>Substrate residues from lithography most common cause; O₂ plasma clean</td>
        </tr>
        <tr>
          <td> 23</td>
          <td>Wirebond / Bump R</td>
          <td>&lt; 5 mΩ</td>
          <td> 2 – 20 mΩ</td>
          <td>Au–Au bonds have lower R than Al wedge bonds</td>
        </tr>
        <tr>
          <td> 24</td>
          <td>Metal Interface Contact R</td>
          <td>&lt; 1 mΩ</td>
          <td> 1 – 10 mΩ</td>
          <td>Native Al₂O₃ must be removed by Ar ion milling before deposition</td>
        </tr>
      </tbody>
    </table>

    <h2> 6. Parasitic Inductance</h2>
    <p>
      Parasitic inductance creates impedance discontinuities that shift resonator frequencies, cause
      reflections, and introduce AC flux errors in bias lines. Flip-chip integration reduces
      wirebond inductance by 10–20× compared to traditional wire bonding.
    </p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Parameter</th>
          <th>Ideal</th>
          <th>Good Range</th>
          <th>Key Design Note</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td> 25</td>
          <td>Wirebond / Bump L</td>
          <td>&lt; 1 nH</td>
          <td> 0.3 – 3 nH</td>
          <td>Flip-chip In bumps reduce to ~0.1 nH; key for 3D scaling</td>
        </tr>
        <tr>
          <td> 26</td>
          <td>Control Line Lead L</td>
          <td>&lt; 100 pH</td>
          <td> 50 – 500 pH</td>
          <td>Long coax adds 1–10 nH; de-embed by calibration</td>
        </tr>
        <tr>
          <td> 27</td>
          <td>Ground Plane Slot L</td>
          <td>&lt; 1 pH/sq</td>
          <td> 1 – 5 pH/sq</td>
          <td>Vortex-pinning holes add ~5–10 pH/sq but necessary at B &gt; 0</td>
        </tr>
        <tr>
          <td> 28</td>
          <td>Package / Board L</td>
          <td>&lt; 0.5 nH</td>
          <td> 0.5 – 2 nH</td>
          <td>SMP connectors (&lt; 0.3 nH) preferred over SMA (~0.5–1 nH) for cryo</td>
        </tr>
      </tbody>
    </table>

    <h2> 7. Parasitic Capacitance</h2>
    <p>
      Parasitic capacitances shift qubit frequencies from design targets and create unwanted
      coupling paths. Fringe capacitance at conductor edges accounts for 30–50% of total coupling
      capacitance in typical transmon designs.
    </p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Parameter</th>
          <th>Ideal</th>
          <th>Good Range</th>
          <th>Key Design Note</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td> 29</td>
          <td>Trace-to-Ground C</td>
          <td> 0.1 – 0.4 fF/μm</td>
          <td> 0.1 – 1 fF/μm</td>
          <td>Sets CPW Z₀ = √(L/C); target 50 Ω</td>
        </tr>
        <tr>
          <td> 30</td>
          <td>Pad-to-Substrate C</td>
          <td>&lt; 10 fF</td>
          <td> 5 – 30 fF</td>
          <td>Thinning substrate 500→200 μm reduces by ~2.5×</td>
        </tr>
        <tr>
          <td> 31</td>
          <td>Inter-Layer Cap (3D)</td>
          <td>&lt; 5 fF</td>
          <td> 1 – 20 fF</td>
          <td>Bump height variation (σ ~ 1–2 μm) causes ~0.5–1 fF spread</td>
        </tr>
        <tr>
          <td> 32</td>
          <td>Fringe Capacitance</td>
          <td> 0.02 – 0.1 fF/μm</td>
          <td> 0.05 – 0.5 fF/μm</td>
          <td>~30–50% of C_g comes from fringe; underestimating shifts f by 50+ MHz</td>
        </tr>
        <tr>
          <td> 33</td>
          <td>Wirebond Pad Parasitic Cap</td>
          <td>&lt; 50 fF</td>
          <td> 20 – 150 fF</td>
          <td>Reducing pad 150→80 μm cuts C by ~2.5× with no yield penalty</td>
        </tr>
      </tbody>
    </table>

    <h2> 8. Electromagnetic Coupling</h2>
    <p>
      Coupling parameters bridge the gap between Q3D parasitic extraction and the quantum
      Hamiltonian. External quality factor Q_ext sets readout bandwidth, while Z₀ and ε_eff
      determine transmission line geometry for target frequencies.
    </p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Parameter</th>
          <th>Ideal</th>
          <th>Good Range</th>
          <th>Key Design Note</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td> 34</td>
          <td>External Quality Factor Q_ext</td>
          <td> 5×10³ – 2×10⁴</td>
          <td> 10³ – 10⁵</td>
          <td>T₁_Purcell = Q_ext/ω_r × (Δ/g)²; Purcell filter relaxes trade-off</td>
        </tr>
        <tr>
          <td> 35</td>
          <td>Internal Quality Factor Q_int</td>
          <td>&gt; 10⁶</td>
          <td> 10⁵ – 10⁶</td>
          <td>Requires HR-Si or sapphire, clean deposition, minimal surface TLS</td>
        </tr>
        <tr>
          <td> 36</td>
          <td>Loaded Quality Factor Q_L</td>
          <td> 10³ – 10⁴</td>
          <td> 500 – 2×10⁴</td>
          <td>In practice Q_L &approx; Q_ext when Q_int ≫ Q_ext (under-coupled limit)</td>
        </tr>
        <tr>
          <td> 37</td>
          <td>CPW Characteristic Impedance Z₀</td>
          <td> 50 Ω ± 1 Ω</td>
          <td> 45 – 55 Ω</td>
          <td>On 500 μm Si: 10 μm trace / 6 μm gap → Z₀ &approx; 50 Ω</td>
        </tr>
        <tr>
          <td> 38</td>
          <td>Effective Permittivity ε_eff</td>
          <td> 6.0 – 6.5</td>
          <td> 5.5 – 7.0</td>
          <td>ε_eff &approx; (1 + εr)/2 for CPW in air on substrate</td>
        </tr>
        <tr>
          <td> 39</td>
          <td>Coupling Coefficient k²</td>
          <td> 1 – 10 ×10⁻³</td>
          <td> 0.5 – 20 ×10⁻³</td>
          <td>Etch depth variation of 0.1 μm → δk²/k² ~ 5%</td>
        </tr>
      </tbody>
    </table>

    <h2> 9. Substrate &amp; Dielectric Loss</h2>
    <p>
      Dielectric loss is the dominant T₁ limiter in planar transmon designs. The loss tangent at
      each interface (metal-air, substrate-air, metal-substrate) multiplied by the surface
      participation ratio determines the contribution to qubit decay.
    </p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Parameter</th>
          <th>Ideal</th>
          <th>Good Range</th>
          <th>Key Design Note</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td> 40</td>
          <td>Substrate Bulk Loss tan δ_bulk</td>
          <td>&lt; 10⁻⁶</td>
          <td> 10⁻⁶ – 10⁻⁵</td>
          <td>tan δ improves by 10–100× on cooling from 300K to 4K</td>
        </tr>
        <tr>
          <td> 41</td>
          <td>Metal-Air Interface tan δ_MA</td>
          <td>&lt; 10⁻³</td>
          <td> 10⁻³ – 5×10⁻³</td>
          <td>Dominant T₁ source in planar transmons; HF vapor clean reduces by 10×</td>
        </tr>
        <tr>
          <td> 42</td>
          <td>Substrate-Air Interface tan δ_SA</td>
          <td>&lt; 5×10⁻⁴</td>
          <td> 5×10⁻⁴ – 5×10⁻³</td>
          <td>H-passivated Si surface (HF dip) shows 5× lower tan δ_SA</td>
        </tr>
        <tr>
          <td> 43</td>
          <td>Metal-Substrate Interface tan δ_MS</td>
          <td>&lt; 5×10⁻³</td>
          <td> 5×10⁻³ – 10⁻²</td>
          <td>Amorphous SiOx layer (1–2 nm) is primary TLS host; HF clean removes it</td>
        </tr>
        <tr>
          <td> 44</td>
          <td>Surface Participation Ratio (SPR)</td>
          <td>&lt; 5 ppm</td>
          <td> 5 – 50 ppm</td>
          <td> 1/Q_TLS = Σ pᵢ × tan δᵢ; SPR is the design lever, tan δ is the material lever</td>
        </tr>
      </tbody>
    </table>

    <h2> 10. Skin Effect &amp; Frequency-Dependent Parameters</h2>
    <p>
      These parameters characterise the frequency-dependent behaviour of the conductor network. At
      cryogenic temperatures the skin depth concept is replaced by the London penetration depth λ_L,
      but room-temperature Q3D values remain essential for pre-cooldown verification.
    </p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Parameter</th>
          <th>Ideal</th>
          <th>Good Range</th>
          <th>Key Design Note</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td> 45</td>
          <td>Skin Depth at 5 GHz (δ_s)</td>
          <td> 0.5 – 2 μm</td>
          <td> 0.5 – 3 μm</td>
          <td>At 4K SC: replaced by London λ_L &approx; 60–163 nm for thin-film Al</td>
        </tr>
        <tr>
          <td> 46</td>
          <td>AC/DC Resistance Ratio</td>
          <td>&approx; 1.0 (thin film)</td>
          <td> 1.0 – 2.0</td>
          <td>Thin-film qubits (100–200 nm) operate below skin-depth limit</td>
        </tr>
        <tr>
          <td> 47</td>
          <td>Propagation Constant γ</td>
          <td>α &lt; 0.1 dB/m</td>
          <td>α 0.1 – 1 dB/m</td>
          <td>For interconnects &gt; 10 mm even 0.1 dB/m causes measurable loss</td>
        </tr>
        <tr>
          <td> 48</td>
          <td>Phase Velocity v_ph</td>
          <td> 1.2 – 1.4 ×10⁸ m/s</td>
          <td> 1.0 – 1.6 ×10⁸ m/s</td>
          <td>λ/4 at 7 GHz on Si &approx; 4.25 mm</td>
        </tr>
        <tr>
          <td> 49</td>
          <td>Per-Unit-Length R'</td>
          <td>&lt; 0.1 mΩ/mm</td>
          <td> 0.1 – 2 mΩ/mm</td>
          <td>At 4K Al is SC: R' → 0 below T_c</td>
        </tr>
        <tr>
          <td> 50</td>
          <td>Per-Unit-Length L'</td>
          <td> 0.3 – 0.5 nH/mm</td>
          <td> 0.2 – 0.8 nH/mm</td>
          <td>L'_kinetic small for Al (~0.01–0.05 nH/mm)</td>
        </tr>
        <tr>
          <td> 51</td>
          <td>Per-Unit-Length C'</td>
          <td> 0.1 – 0.2 pF/mm</td>
          <td> 0.05 – 0.3 pF/mm</td>
          <td>Check: Z₀ = √(L'/C') &approx; 50 Ω as consistency verification</td>
        </tr>
      </tbody>
    </table>

    <h2> 11. Post-Processing Derived Outputs</h2>
    <p>
      These parameters are computed from the raw RLGC matrices and represent the quantum Hamiltonian
      parameters that ultimately determine device performance. The standard design loop is:{" "}
      <strong>Q3D → Hamiltonian → Optimise → Iterate</strong>.
    </p>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Parameter</th>
          <th>Ideal</th>
          <th>Good Range</th>
          <th>Key Design Note</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td> 52</td>
          <td>Charging Energy E_C/h</td>
          <td> 200 – 350 MHz</td>
          <td> 150 – 400 MHz</td>
          <td>E_C/h = 200 MHz → C_Σ = 91 fF; critical Hamiltonian input</td>
        </tr>
        <tr>
          <td> 53</td>
          <td>Josephson Energy E_J/h</td>
          <td> 10 – 30 GHz</td>
          <td> 5 – 50 GHz</td>
          <td>E_J tunable via flux in split-junction transmons</td>
        </tr>
        <tr>
          <td> 54</td>
          <td>Qubit–Resonator Coupling g/2π</td>
          <td> 50 – 150 MHz</td>
          <td> 20 – 300 MHz</td>
          <td>g/Δ &lt; 0.1 ensures dispersive limit; Γ_P ∝ g²</td>
        </tr>
        <tr>
          <td> 55</td>
          <td>Dispersive Shift χ/2π</td>
          <td> 1 – 5 MHz</td>
          <td> 0.5 – 10 MHz</td>
          <td>Single-shot readout SNR ∝ χ/κ; Purcell filter allows larger g</td>
        </tr>
        <tr>
          <td> 56</td>
          <td>ZZ Coupling Rate ζ/2π</td>
          <td>&lt; 10 kHz</td>
          <td> 10 – 50 kHz</td>
          <td>Central challenge of transmon scaling; tunable coupler pushes ζ &lt; 1 kHz</td>
        </tr>
        <tr>
          <td> 57</td>
          <td>Anharmonicity α/2π</td>
          <td>−300 to −150 MHz</td>
          <td>−350 to −100 MHz</td>
          <td>Gate BW &lt; |α|/(2π) to avoid leakage; |α| = 200 MHz → t_gate &gt; 5 ns</td>
        </tr>
        <tr>
          <td> 58</td>
          <td>Purcell Decay Rate Γ_P/2π</td>
          <td>&lt; 1 kHz</td>
          <td> 1 – 10 kHz</td>
          <td>Purcell filter reduces Γ_P by 10–100× without affecting readout</td>
        </tr>
      </tbody>
    </table>

    <h2>Key Takeaways</h2>
    <ul>
      <li>
        <strong>RLGC Matrices</strong> from Q3D are the primary inputs to circuit Hamiltonian
        models. Even small parasitic entries shift qubit frequencies by 10–100 MHz.
      </li>
      <li>
        <strong>Superconducting Regime:</strong> At 4K, Al and Nb become superconducting → R → 0,
        L_kinetic dominates. Normal-metal values from Q3D need temperature-dependent correction.
      </li>
      <li>
        <strong>Surface Participation:</strong> SPR × tan δ controls T₁. Design rule: minimise p_MA
        below 5 ppm via thick metal, wider CPW gaps, and clean interfaces.
      </li>
      <li>
        <strong>Derived Outputs:</strong> E_C, E_J, g, χ, ζ, Γ_P are all computed from Q3D matrices.
        Iterating Q3D → Hamiltonian → Optimise is the standard qubit design loop.
      </li>
    </ul>
    <p style={{ fontSize: "0.85rem", color: "#64748B", marginTop: "2rem" }}>
      Sources: ANSYS Q3D · IBM Quantum · Google AI · Krantz 2019 · Blais RMP 2021 · Q3D Analysis —
      QuantumChipGen Reference Deck
    </p>
  </>
);

const EprContent = () => (
  <>
    <p>
      The Energy Participation Ratio (EPR) method is a semi-classical technique for characterizing
      superconducting qubit circuits. It extracts quantum Hamiltonian parameters from classical EM
      simulations (HFSS/FEM), bridging the gap between physical layout and quantum behavior.
    </p>

    <h2>EPR Core Parameters</h2>
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Symbol (Unit)</th>
            <th>Optimal</th>
            <th>Acceptable</th>
            <th>Poor</th>
            <th>Physical Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Energy Participation Ratio</strong>
            </td>
            <td>
              p_mj <br />
              <em>(Dimensionless)</em>
            </td>
            <td>
              <Badge priority="low"> 0.90 – 0.99</Badge>
            </td>
            <td>
              <Badge priority="med"> 0.70 – 0.84</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 0.70 or === 1.0</Badge>
            </td>
            <td>
              Fraction of mode j energy stored in junction m. A value close to 1 means the junction
              dominates the mode (strong nonlinearity). A value exactly equal to 1 is unphysical.
              This is the central quantity in the EPR method — it links classical EM simulation
              results to quantum circuit parameters.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Josephson Inductance</strong>
            </td>
            <td>
              L_J <br />
              <em>(nH (nanohenry))</em>
            </td>
            <td>
              <Badge priority="low"> 8 – 15 nH</Badge>
            </td>
            <td>
              <Badge priority="med"> 3–6 or 18–25 nH</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 3 nH or &gt; 25 nH</Badge>
            </td>
            <td>
              Kinetic inductance of the Josephson junction. Sets the qubit frequency together with
              geometric capacitance. Too small → high frequency, hard to control; too large → low
              frequency, susceptible to thermal errors. Typical range 5–20 nH for transmon qubits.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Josephson Energy</strong>
            </td>
            <td>
              E_J <br />
              <em>(GHz (h units))</em>
            </td>
            <td>
              <Badge priority="low"> 15 – 40 GHz</Badge>
            </td>
            <td>
              <Badge priority="med"> 5–12 or 45–60 GHz</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 5 GHz or &gt; 60 GHz</Badge>
            </td>
            <td>
              Energy scale of Josephson coupling between the two superconductors in the junction.
              The ratio E_J/E_C determines the qubit regime — for transmon operation we need E_J/E_C
              &gt; 50. Too small → charge sensitive; too large → reduced anharmonicity.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Charging Energy</strong>
            </td>
            <td>
              E_C <br />
              <em>(GHz (h units))</em>
            </td>
            <td>
              <Badge priority="low"> 0.15 – 0.30 GHz</Badge>
            </td>
            <td>
              <Badge priority="med"> 0.05–0.12 or 0.35–0.5 GHz</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 0.05 or &gt; 0.5 GHz</Badge>
            </td>
            <td>
              Electrostatic energy scale — energy cost to add one Cooper pair to the island.
              Controls charge sensitivity and anharmonicity. In transmon regime, small E_C reduces
              charge noise but also reduces anharmonicity. Must balance noise immunity vs. qubit
              addressability.
            </td>
          </tr>
          <tr>
            <td>
              <strong>E_J / E_C Ratio</strong>
            </td>
            <td>
              E_J/E_C <br />
              <em>(Dimensionless)</em>
            </td>
            <td>
              <Badge priority="low"> 80 – 120</Badge>
            </td>
            <td>
              <Badge priority="med"> 40–60 or 130–200</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 40 or &gt; 200</Badge>
            </td>
            <td>
              The key regime parameter for transmon qubits. Values &gt; 50 → transmon regime (charge
              insensitive). Values &gt; 150 → very low anharmonicity with leakage risk. This ratio
              must be carefully tuned to balance charge noise suppression against sufficient
              anharmonicity for gate operations.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Plasma Frequency</strong>
            </td>
            <td>
              ω_p / 2π <br />
              <em>(GHz)</em>
            </td>
            <td>
              <Badge priority="low"> 5 – 8 GHz</Badge>
            </td>
            <td>
              <Badge priority="med"> 3–4.5 or 9–12 GHz</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 3 GHz or &gt; 12 GHz</Badge>
            </td>
            <td>
              Small-oscillation frequency of the Josephson junction. Related to qubit frequency in
              the linear limit. Sets the frequency hierarchy of the circuit — must be above qubit
              frequency and below parasitic modes. Determines the cut-off for junction dynamics.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Participation Loss Rate</strong>
            </td>
            <td>
              κ_m = p_mj · Γ_m <br />
              <em>(kHz)</em>
            </td>
            <td>
              <Badge priority="low">&lt; 10 kHz</Badge>
            </td>
            <td>
              <Badge priority="med"> 50 – 200 kHz</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 200 kHz</Badge>
            </td>
            <td>
              Contribution of each lossy element to mode decay rate, weighted by its EPR. This is
              the EPR method's way of attributing loss: each element contributes proportionally to
              how much energy it stores. Lower values mean that element is not a dominant loss
              channel for the mode.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Cross-Mode EPR</strong>
            </td>
            <td>
              p_cross <br />
              <em>(Dimensionless)</em>
            </td>
            <td>
              <Badge priority="low">&lt; 0.01</Badge>
            </td>
            <td>
              <Badge priority="med"> 0.02 – 0.05</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 0.05</Badge>
            </td>
            <td>
              Energy leakage of a mode into unintended junctions. High values indicate unwanted mode
              hybridization — a mode that should be purely a qubit mode has significant overlap with
              other junctions. This can cause unexpected coupling and frequency shifts in
              multi-junction circuits.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Inductive Participation (Linear)</strong>
            </td>
            <td>
              p_L <br />
              <em>(Dimensionless)</em>
            </td>
            <td>
              <Badge priority="low">&lt; 0.10</Badge>
            </td>
            <td>
              <Badge priority="med"> 0.20 – 0.40</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 0.40</Badge>
            </td>
            <td>
              Fraction of mode energy stored in linear inductors (e.g. geometric/kinetic inductance
              of wiring). Higher values mean the mode is more distributed in linear elements and has
              weaker nonlinearity per mode. Ideally most energy should be in the Josephson junction,
              not in linear inductors.
            </td>
          </tr>
          <tr>
            <td>
              <strong>EPR Convergence Error</strong>
            </td>
            <td>
              Δp_mj <br />
              <em>(Dimensionless)</em>
            </td>
            <td>
              <Badge priority="low">&lt; 0.001</Badge>
            </td>
            <td>
              <Badge priority="med"> 0.005 – 0.02</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 0.02</Badge>
            </td>
            <td>
              Simulation convergence criterion for the EPR extraction. Poor convergence leads to
              unreliable Hamiltonian parameters. The energy sum must satisfy Σ p_mj ≤ 1. This is a
              quality-control metric for your HFSS simulation — if this is large, your mesh or
              simulation settings need improvement.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2>Qubit Parameters</h2>
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Symbol (Unit)</th>
            <th>Optimal</th>
            <th>Acceptable</th>
            <th>Poor</th>
            <th>Physical Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Qubit Transition Frequency</strong>
            </td>
            <td>
              f_01 (ω_01/2π) <br />
              <em>(GHz)</em>
            </td>
            <td>
              <Badge priority="low"> 5 – 6 GHz</Badge>
            </td>
            <td>
              <Badge priority="med"> 3–4.5 or 7–9 GHz</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 3 GHz or &gt; 9 GHz</Badge>
            </td>
            <td>
              The 0→1 transition frequency. Must be well below the readout resonator and above
              thermal energy (kT). The sweet spot of 5–6 GHz is ideal for dilution fridge operation
              (~20 mK). Frequencies below 3 GHz risk thermal excitation; above 9 GHz control
              electronics become challenging.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Anharmonicity</strong>
            </td>
            <td>
              α = ω_12 − ω_01 <br />
              <em>(MHz)</em>
            </td>
            <td>
              <Badge priority="low">−300 to −200 MHz</Badge>
            </td>
            <td>
              <Badge priority="med">−150 to −180 or −320 to −400 MHz</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; −100 MHz or &gt; +50 MHz</Badge>
            </td>
            <td>
              Frequency difference between the 1→2 and 0→1 transitions. Negative in transmon
              (straddling regime). Must be large enough in magnitude for selective qubit addressing
              — |α| must exceed gate bandwidth. Too small → leakage to |2⟩ during gates. Too large →
              charge sensitivity increases.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Relative Anharmonicity</strong>
            </td>
            <td>
              α_r = α/ω_01 <br />
              <em>(%)</em>
            </td>
            <td>
              <Badge priority="low">−4.5% to −3.5%</Badge>
            </td>
            <td>
              <Badge priority="med">−6% to −5% or −3% to −2%</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; −7% or &gt; −1.5%</Badge>
            </td>
            <td>
              Normalized anharmonicity as a fraction of the qubit frequency. Provides a
              dimensionless figure of merit that is independent of qubit frequency. Too small →
              leakage to |2⟩ state during gate pulses; too large → return to charge sensitivity
              regime. Target: −4.5% to −3.5%.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Energy Relaxation Time</strong>
            </td>
            <td>
              T1 <br />
              <em>(μs (microseconds))</em>
            </td>
            <td>
              <Badge priority="low">&gt; 300 μs</Badge>
            </td>
            <td>
              <Badge priority="med"> 50 – 100 μs</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 10 μs</Badge>
            </td>
            <td>
              Time for qubit to decay from excited |1⟩ to ground |0⟩ state. Primary coherence limit
              — sets the maximum circuit depth. Related to total quality factor: T1 = Q/ω_01.
              State-of-the-art transmons now exceed 500 μs. The revised excellent target from recent
              literature is &gt; 300 μs.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Pure Dephasing Time</strong>
            </td>
            <td>
              T_φ <br />
              <em>(μs (microseconds))</em>
            </td>
            <td>
              <Badge priority="low">&gt; 200 μs</Badge>
            </td>
            <td>
              <Badge priority="med"> 10 – 100 μs</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 10 μs</Badge>
            </td>
            <td>
              Dephasing from low-frequency noise sources (flux noise, charge noise) without the
              contribution of energy relaxation. Echo sequences can extend the effective dephasing
              time by refocusing quasi-static noise. A long T_φ indicates good magnetic shielding
              and stable fabrication.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Ramsey / T2* Time</strong>
            </td>
            <td>
              T2* <br />
              <em>(μs (microseconds))</em>
            </td>
            <td>
              <Badge priority="low">&gt; 100 μs</Badge>
            </td>
            <td>
              <Badge priority="med"> 20 – 50 μs</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 5 μs</Badge>
            </td>
            <td>
              Free-precession coherence time including effects of low-frequency noise. Satisfies T2*
              ≤ 2T1. Often limited by flux noise or two-level system (TLS) defects. Directly impacts
              algorithm performance as gates must complete within T2*. The revised excellent target
              is &gt; 100 μs.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Echo Coherence Time</strong>
            </td>
            <td>
              T2_echo <br />
              <em>(μs (microseconds))</em>
            </td>
            <td>
              <Badge priority="low">&gt; 100 μs</Badge>
            </td>
            <td>
              <Badge priority="med"> 10 – 50 μs</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 10 μs</Badge>
            </td>
            <td>
              Hahn-echo decoupled coherence time. Dynamical decoupling removes quasi-static noise
              contributions. Should approach 2T1 in well-designed qubits. The gap between T2_echo
              and 2T1 reveals the magnitude of non-Markovian (quasi-static) noise in your device.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Quality Factor</strong>
            </td>
            <td>
              Q = ω · T1 <br />
              <em>(Dimensionless)</em>
            </td>
            <td>
              <Badge priority="low">&gt; 10⁶</Badge>
            </td>
            <td>
              <Badge priority="med"> 10⁴ – 5×10⁵</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 10⁴</Badge>
            </td>
            <td>
              Dimensionless coherence figure of merit combining frequency and T1. Includes all loss
              channels weighted by EPR: Q_total = (Σ p_mj/Q_mj)⁻¹. This EPR-weighted sum tells you
              which physical element limits your coherence. Higher Q means more oscillations before
              decoherence.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Thermal Occupation</strong>
            </td>
            <td>
              n_th <br />
              <em>(Photons)</em>
            </td>
            <td>
              <Badge priority="low">&lt; 0.005</Badge>
            </td>
            <td>
              <Badge priority="med"> 0.01 – 0.05</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 0.05</Badge>
            </td>
            <td>
              Mean thermal photon number in the qubit mode. Calculated as n_th = 1/(exp(hf/kT)−1).
              Causes state preparation errors — a thermally excited qubit starts in mixed state.
              Requires temperature T &lt; 30 mK for a 5 GHz qubit to keep n_th below 0.01. Sensitive
              to infrared radiation leakage.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Sweet Spot Sensitivity (∂f/∂Φ)</strong>
            </td>
            <td>
              ∂f/∂Φ <br />
              <em>(MHz/mΦ₀)</em>
            </td>
            <td>
              <Badge priority="low">0 (at sweet spot)</Badge>
            </td>
            <td>
              <Badge priority="med"> 1 – 5 MHz/mΦ₀</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 10 MHz/mΦ₀</Badge>
            </td>
            <td>
              Flux sensitivity at the operating point. Zero at the sweet spot (Φ = 0 or Φ₀/2) →
              first-order insensitive to flux noise. This is why transmons are operated at the flux
              sweet spot. Flux qubits operated away from sweet spot trade coherence for tunability.
              Lower value = better noise immunity.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2>Coupling Parameters</h2>
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Symbol (Unit)</th>
            <th>Optimal</th>
            <th>Acceptable</th>
            <th>Poor</th>
            <th>Physical Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Resonator Frequency</strong>
            </td>
            <td>
              f_r (ω_r/2π) <br />
              <em>(GHz)</em>
            </td>
            <td>
              <Badge priority="low"> 7 – 8 GHz</Badge>
            </td>
            <td>
              <Badge priority="med"> 5–6.5 or 8.5–10 GHz</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 5 GHz or &gt; 10 GHz</Badge>
            </td>
            <td>
              Readout/coupling resonator frequency. Must be detuned from the qubit by Δ &gt;&gt; g
              to remain in the dispersive regime. Higher frequency enables faster readout but
              requires more demanding fabrication. The resonator acts as the 'antenna' for reading
              out qubit state.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Qubit-Resonator Coupling</strong>
            </td>
            <td>
              g / 2π <br />
              <em>(MHz)</em>
            </td>
            <td>
              <Badge priority="low"> 100 – 200 MHz</Badge>
            </td>
            <td>
              <Badge priority="med"> 30–80 or 250–400 MHz</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 30 MHz or &gt; 400 MHz</Badge>
            </td>
            <td>
              Vacuum Rabi coupling strength between the qubit and resonator. Determines
              hybridization and the dispersive shift magnitude. Must satisfy g &lt;&lt; Δ for
              dispersive regime validity. Too small → weak dispersive shift, slow readout; too large
              → strong hybridization, increased Purcell loss.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Qubit-Resonator Detuning</strong>
            </td>
            <td>
              Δ = f_r − f_01 <br />
              <em>(GHz)</em>
            </td>
            <td>
              <Badge priority="low"> 1.0 – 2.0 GHz</Badge>
            </td>
            <td>
              <Badge priority="med"> 0.3–0.8 or 2.5–4 GHz</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 0.3 GHz (resonant!)</Badge>
            </td>
            <td>
              Frequency detuning between qubit and resonator. Must be &gt;&gt; g for dispersive
              regime. Too small → hybridization (resonant regime — catastrophic for readout!); too
              large → dispersive shift becomes negligible and readout SNR suffers. Optimal 1–2 GHz
              balances both constraints.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Dispersive Shift (χ)</strong>
            </td>
            <td>
              χ/2π = g²α/[Δ(Δ+α)] <br />
              <em>(MHz)</em>
            </td>
            <td>
              <Badge priority="low"> 1 – 5 MHz</Badge>
            </td>
            <td>
              <Badge priority="med"> 0.1–0.5 or 8–15 MHz</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 0.1 MHz or &gt; 15 MHz</Badge>
            </td>
            <td>
              State-dependent resonator frequency shift — the resonator frequency shifts by +χ or −χ
              depending on qubit state. Sets readout SNR. Must satisfy κ &lt; χ for quantum
              non-demolition (QND) readout. Larger χ → faster readout but also more Purcell-induced
              qubit decay. Balance is critical.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Coupling Ratio (g/Δ)</strong>
            </td>
            <td>
              g/Δ <br />
              <em>(Dimensionless)</em>
            </td>
            <td>
              <Badge priority="low"> 0.05 – 0.10</Badge>
            </td>
            <td>
              <Badge priority="med"> 0.12 – 0.20</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 0.20 (non-dispersive!)</Badge>
            </td>
            <td>
              Ratio of coupling strength to detuning. Must be ≪ 1 for dispersive approximation
              validity. Values &gt; 0.1 introduce significant higher-order corrections to the
              dispersive Hamiltonian. This is the single most important check for whether your
              circuit is truly in the dispersive regime.
            </td>
          </tr>
          <tr>
            <td>
              <strong>ZZ Coupling (always-on)</strong>
            </td>
            <td>
              ζ / 2π <br />
              <em>(kHz)</em>
            </td>
            <td>
              <Badge priority="low">&lt; 10 kHz</Badge>
            </td>
            <td>
              <Badge priority="med"> 20 – 50 kHz</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 100 kHz</Badge>
            </td>
            <td>
              Residual always-on qubit-qubit interaction causing correlated errors. A major source
              of crosstalk in multi-qubit processors. ZZ ∝ g²J²/(Δ·α). This interaction cannot be
              turned off and causes phase errors on neighboring qubits during single-qubit gates.
              The revised acceptable target is &lt; 10 kHz.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Qubit-Qubit Exchange Coupling</strong>
            </td>
            <td>
              J / 2π <br />
              <em>(MHz)</em>
            </td>
            <td>
              <Badge priority="low"> 5–50 MHz (tunable range)</Badge>
            </td>
            <td>
              <Badge priority="med"> 0.5–2 MHz (off) / 100–200 MHz (on)</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 100 kHz off or uncontrollable</Badge>
            </td>
            <td>
              Direct qubit-qubit coupling used for 2-qubit gates. Tunable couplers allow on/off
              ratio &gt; 1000. When 'off', static coupling should be &lt; 1 MHz for low crosstalk.
              When 'on', 5–50 MHz enables fast gates. The ability to switch this coupling is key to
              scalable multi-qubit architectures.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Purcell Decay Rate</strong>
            </td>
            <td>
              κ_Purcell <br />
              <em>(kHz)</em>
            </td>
            <td>
              <Badge priority="low">&lt; 100 Hz</Badge>
            </td>
            <td>
              <Badge priority="med"> 0.5 – 5 kHz</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 5 kHz</Badge>
            </td>
            <td>
              Qubit relaxation rate via photon emission through the resonator into the transmission
              line. κ_Purcell = (g/Δ)² · κ_r. This is loss caused by the coupling itself — the
              resonator acts as a decay channel. Mitigated by Purcell filter (a bandpass filter
              blocking qubit frequency from reaching the line).
            </td>
          </tr>
          <tr>
            <td>
              <strong>Readout Resonator Linewidth</strong>
            </td>
            <td>
              κ_r / 2π <br />
              <em>(MHz)</em>
            </td>
            <td>
              <Badge priority="low"> 1 – 5 MHz</Badge>
            </td>
            <td>
              <Badge priority="med"> 0.1–0.5 or 8–20 MHz</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 0.1 MHz or &gt; 20 MHz</Badge>
            </td>
            <td>
              Resonator photon decay rate — determines readout speed vs. Purcell limit trade-off.
              Fast readout needs large κ (ring-up and ring-down quickly). But large κ increases
              Purcell loss. High-fidelity readout requires κ &lt; χ. Optimal design uses a Purcell
              filter to decouple these constraints.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Critical Photon Number</strong>
            </td>
            <td>
              n_crit = (Δ/2g)² <br />
              <em>(Photons)</em>
            </td>
            <td>
              <Badge priority="low">&gt; 100 photons</Badge>
            </td>
            <td>
              <Badge priority="med"> 10 – 50 photons</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 10 photons</Badge>
            </td>
            <td>
              Maximum resonator photon number before the dispersive approximation breaks down.
              Readout pulses must use far fewer than n_crit photons. Larger n_crit provides a more
              robust readout window. Below n_crit, you're safely in the linear dispersive regime;
              above it, nonlinear effects corrupt readout.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2>Loss &amp; Dissipation</h2>
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Symbol (Unit)</th>
            <th>Optimal</th>
            <th>Acceptable</th>
            <th>Poor</th>
            <th>Physical Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Dielectric Loss Tangent (Bulk)</strong>
            </td>
            <td>
              tan δ_bulk <br />
              <em>(Dimensionless)</em>
            </td>
            <td>
              <Badge priority="low">&lt; 10⁻⁷</Badge>
            </td>
            <td>
              <Badge priority="med"> 10⁻⁶ – 10⁻⁵</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 10⁻⁵</Badge>
            </td>
            <td>
              Bulk substrate dielectric loss. Sapphire: ~10⁻⁸; high-resistivity silicon: ~10⁻⁷;
              standard silicon: ~10⁻⁶. The EPR method weights this loss by the fraction of energy in
              the substrate. Sapphire is preferred for highest-coherence devices. Substrate choice
              has a large impact on T1.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Surface Dielectric Loss Tangent</strong>
            </td>
            <td>
              tan δ_surf <br />
              <em>(Dimensionless)</em>
            </td>
            <td>
              <Badge priority="low">&lt; 10⁻⁴</Badge>
            </td>
            <td>
              <Badge priority="med"> 5×10⁻⁴ – 10⁻³</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 10⁻³</Badge>
            </td>
            <td>
              Surface/interface oxide loss at the metal-air (MA), metal-substrate (MS), and
              substrate-air (SA) interfaces. Dominant loss mechanism at low drive power due to
              two-level system (TLS) defects in native oxides. Reduced by surface cleaning,
              encapsulation, and geometric redesign (trenching).
            </td>
          </tr>
          <tr>
            <td>
              <strong>Surface Participation Ratio</strong>
            </td>
            <td>
              p_SA, p_MS, p_MA <br />
              <em>(Dimensionless)</em>
            </td>
            <td>
              <Badge priority="low">&lt; 10⁻⁴</Badge>
            </td>
            <td>
              <Badge priority="med"> 5×10⁻⁴ – 10⁻³</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 10⁻³</Badge>
            </td>
            <td>
              Fraction of electric field energy at each interface layer. Lower values mean less
              field is concentrated at lossy surfaces. Reduced by geometry optimization: larger
              electrode gap, thicker ground plane, and surface trenching all reduce surface
              participation. This is where EPR simulation guides fabrication choices.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Conductor (Resistive) Loss</strong>
            </td>
            <td>
              {" "}
              1/Q_cond <br />
              <em>(Dimensionless)</em>
            </td>
            <td>
              <Badge priority="low">&lt; 10⁻⁸</Badge>
            </td>
            <td>
              <Badge priority="med"> 10⁻⁷ – 10⁻⁶</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 10⁻⁶</Badge>
            </td>
            <td>
              Ohmic losses in the superconducting film caused by quasiparticles (vortices, sub-gap
              states). Sensitive to film quality, film thickness, and magnetic shielding. Magnetic
              vortices trapped in the superconductor during cool-down are a major source. Requires
              careful magnetic shielding and field-free cooling.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Radiation Loss Rate</strong>
            </td>
            <td>
              {" "}
              1/Q_rad <br />
              <em>(Dimensionless)</em>
            </td>
            <td>
              <Badge priority="low">&lt; 10⁻⁸</Badge>
            </td>
            <td>
              <Badge priority="med"> 10⁻⁷ – 10⁻⁵</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 10⁻⁵</Badge>
            </td>
            <td>
              Electromagnetic radiation from open structures — energy escaping the circuit as EM
              waves. Minimized by full 3D enclosure, ground vias, and controlled impedance
              environments. Particularly important for planar circuits where radiation into the
              substrate or free space can be significant.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Internal Quality Factor (Resonator)</strong>
            </td>
            <td>
              Q_int <br />
              <em>(Dimensionless)</em>
            </td>
            <td>
              <Badge priority="low">&gt; 3×10⁶</Badge>
            </td>
            <td>
              <Badge priority="med"> 10⁵ – 10⁶</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 10⁵</Badge>
            </td>
            <td>
              Resonator quality factor excluding coupling to external transmission line. Reflects
              material and fabrication quality. Q_int = ω_r · T1_resonator. Best 3D aluminum
              cavities exceed 10⁹. Planar resonators typically 10⁶–10⁷. This metric tells you about
              your material quality independent of circuit design.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Coupled (Loaded) Quality Factor</strong>
            </td>
            <td>
              Q_c <br />
              <em>(Dimensionless)</em>
            </td>
            <td>
              <Badge priority="low"> 10³ – 10⁴</Badge>
            </td>
            <td>
              <Badge priority="med"> 100–500 or 3×10⁴–10⁵</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 100 or &gt; 10⁵</Badge>
            </td>
            <td>
              Coupling quality factor to external transmission line. Determines readout bandwidth κ
              = ω_r/Q_c. Must be designed so Q_c &lt;&lt; Q_int to minimize readout backaction. This
              is the intentional coupling designed into the circuit — it sets how strongly the
              resonator is coupled to the readout amplifier chain.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Two-Level System (TLS) Loss</strong>
            </td>
            <td>
              F_TLS · tan δ_TLS <br />
              <em>(Dimensionless)</em>
            </td>
            <td>
              <Badge priority="low">&lt; 10⁻⁶</Badge>
            </td>
            <td>
              <Badge priority="med"> 5×10⁻⁶ – 10⁻⁵</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 10⁻⁵</Badge>
            </td>
            <td>
              Loss from amorphous oxide TLS defects — quantum two-level systems in surface oxides
              that absorb energy. Saturates at high drive power (advantageous for readout at high
              power). Filling factor F_TLS from EPR simulation, tan δ from measurement. Dominant
              loss at single-photon level.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Quasiparticle Loss Rate</strong>
            </td>
            <td>
              Γ_qp <br />
              <em>(kHz)</em>
            </td>
            <td>
              <Badge priority="low">&lt; 1 kHz</Badge>
            </td>
            <td>
              <Badge priority="med"> 10 – 100 kHz</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 100 kHz</Badge>
            </td>
            <td>
              Qubit relaxation from non-equilibrium quasiparticles tunneling across the junction.
              Even at millikelvin temperatures, stray radiation generates excess quasiparticles
              above the BCS gap. Requires careful infrared shielding and phonon trapping to
              suppress. One of the harder loss channels to eliminate.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Flux Noise Spectral Density</strong>
            </td>
            <td>
              √S_Φ(1Hz) <br />
              <em>(μΦ₀/√Hz)</em>
            </td>
            <td>
              <Badge priority="low">&lt; 1 μΦ₀/√Hz</Badge>
            </td>
            <td>
              <Badge priority="med"> 2 – 5 μΦ₀/√Hz</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 5 μΦ₀/√Hz</Badge>
            </td>
            <td>
              {" "}
              1/f flux noise amplitude — low-frequency magnetic flux fluctuations that dephase
              flux-sensitive qubits. Limits T2 for qubits operated away from the flux sweet spot.
              Reduced by larger junction loop area (more flux per noise unit) and better magnetic
              shielding of the dilution refrigerator.
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <h2>Gate Fidelity &amp; Readout</h2>
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Parameter</th>
            <th>Symbol (Unit)</th>
            <th>Optimal</th>
            <th>Acceptable</th>
            <th>Poor</th>
            <th>Physical Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <strong>Single-Qubit Gate Fidelity</strong>
            </td>
            <td>
              F_1Q <br />
              <em>(%)</em>
            </td>
            <td>
              <Badge priority="low">&gt; 99.9%</Badge>
            </td>
            <td>
              <Badge priority="med"> 99 – 99.5%</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 99%</Badge>
            </td>
            <td>
              Average single-qubit gate fidelity via randomized benchmarking. Error budget: T1/T2
              decoherence errors + leakage to |2⟩ + control errors. NISQ threshold: &gt; 99%.
              Fault-tolerant threshold (surface code): &gt; 99.9%. State-of-the-art demonstrations
              now exceed 99.99%.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Two-Qubit Gate Fidelity</strong>
            </td>
            <td>
              F_2Q <br />
              <em>(%)</em>
            </td>
            <td>
              <Badge priority="low">&gt; 99.5%</Badge>
            </td>
            <td>
              <Badge priority="med"> 97 – 99%</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 97%</Badge>
            </td>
            <td>
              Average two-qubit (CZ/CNOT) gate fidelity. Limited by ZZ coupling, leakage to higher
              levels, and finite coherence. Fault-tolerant threshold for surface code: &gt; 99%. The
              most challenging performance metric to achieve — 2-qubit gates are typically 10–50×
              slower than single-qubit gates.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Single-Qubit Gate Duration</strong>
            </td>
            <td>
              t_gate_1Q <br />
              <em>(ns (nanoseconds))</em>
            </td>
            <td>
              <Badge priority="low"> 10 – 20 ns</Badge>
            </td>
            <td>
              <Badge priority="med"> 30 – 80 ns</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 100 ns</Badge>
            </td>
            <td>
              Gaussian pulse duration for π rotation. Must satisfy t_gate &gt;&gt; 1/|α| to avoid
              leakage to |2⟩. DRAG (Derivative Removal via Adiabatic Gate) pulse shapes allow
              shorter durations while suppressing leakage. Faster gates → deeper circuits within
              coherence time.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Two-Qubit Gate Duration</strong>
            </td>
            <td>
              t_gate_2Q <br />
              <em>(ns (nanoseconds))</em>
            </td>
            <td>
              <Badge priority="low"> 20 – 50 ns</Badge>
            </td>
            <td>
              <Badge priority="med"> 80 – 200 ns</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 200 ns</Badge>
            </td>
            <td>
              Duration for CZ/iSWAP gate. Limited by coupling strength J and the need for adiabatic
              evolution. Fast gates require strong tunable coupling. Longer duration → more
              decoherence error. The product of gate duration and decoherence rate sets the gate
              error floor.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Leakage Rate (per gate)</strong>
            </td>
            <td>
              L1 <br />
              <em>(%)</em>
            </td>
            <td>
              <Badge priority="low">&lt; 0.05%</Badge>
            </td>
            <td>
              <Badge priority="med"> 0.1 – 0.5%</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 0.5%</Badge>
            </td>
            <td>
              Probability of leaving the computational subspace &#123;|0⟩, |1⟩&#125; per gate —
              landing in |2⟩ or higher. Caused by insufficient anharmonicity or excessively fast
              gate pulses. DRAG pulses can suppress leakage to &lt; 0.01%. Leakage is particularly
              dangerous as it doesn't decay quickly and can spread.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Readout Assignment Fidelity</strong>
            </td>
            <td>
              F_readout <br />
              <em>(%)</em>
            </td>
            <td>
              <Badge priority="low">&gt; 99%</Badge>
            </td>
            <td>
              <Badge priority="med"> 95 – 98%</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 95%</Badge>
            </td>
            <td>
              Probability of correctly assigning the qubit state (0→0 and 1→1). Limited by
              dispersive shift χ, resonator SNR, T1 decay during readout integration, and amplifier
              noise. State-of-the-art uses parametric amplifiers (JPA/TWPA) near quantum noise
              limit. Fast high-fidelity readout is essential for error correction.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Readout Duration</strong>
            </td>
            <td>
              t_readout <br />
              <em>(ns (nanoseconds))</em>
            </td>
            <td>
              <Badge priority="low"> 50 – 150 ns</Badge>
            </td>
            <td>
              <Badge priority="med"> 200 – 500 ns</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 500 ns</Badge>
            </td>
            <td>
              Time for resonator to ring up, integrate signal, and return sufficient SNR for state
              discrimination. Trade-off between speed and fidelity — faster readout means less
              signal but less T1 decay during measurement. Purcell filter enables faster readout by
              allowing large κ without Purcell loss penalty.
            </td>
          </tr>
          <tr>
            <td>
              <strong>State Preparation Fidelity</strong>
            </td>
            <td>
              F_prep <br />
              <em>(%)</em>
            </td>
            <td>
              <Badge priority="low">&gt; 99.5%</Badge>
            </td>
            <td>
              <Badge priority="med"> 98 – 99%</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 98%</Badge>
            </td>
            <td>
              Fidelity of preparing the |0⟩ ground state before algorithm execution. Limited by
              thermal occupation n_th and measurement-induced transitions. Active reset (conditional
              π pulse based on measurement result) can improve state preparation significantly and
              reduce cycle time compared to passive T1 decay.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Reset Time (Active Reset)</strong>
            </td>
            <td>
              t_reset <br />
              <em>(ns (nanoseconds))</em>
            </td>
            <td>
              <Badge priority="low">&lt; 100 ns</Badge>
            </td>
            <td>
              <Badge priority="med"> 200 – 500 ns</Badge>
            </td>
            <td>
              <Badge priority="high">&gt; 500 ns</Badge>
            </td>
            <td>
              Time to return qubit to |0⟩ after measurement. Passive reset is limited by T1
              (microseconds). Active reset using a conditional π pulse can achieve &lt; 200 ns — a
              100–1000× speedup. Fast reset is critical for quantum error correction where
              measurement and re-initialization happen every error correction cycle.
            </td>
          </tr>
          <tr>
            <td>
              <strong>Circuit Depth Limit (T2-limited)</strong>
            </td>
            <td>
              d_max &approx; T2/t_gate <br />
              <em>(Gates)</em>
            </td>
            <td>
              <Badge priority="low">&gt; 1000 gates</Badge>
            </td>
            <td>
              <Badge priority="med"> 100 – 500 gates</Badge>
            </td>
            <td>
              <Badge priority="high">&lt; 100 gates</Badge>
            </td>
            <td>
              Maximum coherent circuit depth = T2 / gate_duration. The most important practical
              figure of merit for NISQ algorithms. Longer coherence and faster gates
              multiplicatively increase this. d_max &gt; 1000 is needed for meaningful quantum
              advantage. This is the ultimate metric that EPR analysis helps optimize.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </>
);

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "hfss-complete-guide",
    tag: "Hardware Engineering",
    title: "HFSS: High Frequency Structure Simulator — A Complete Guide for Quantum Engineers",
    authors: "Silicofeller Engineering Team",
    publishMeta: "Published by Silicofeller · Technical Reference · June 2026",
    excerpt:
      "HFSS is a full-wave 3D electromagnetic field solver developed by Ansys. It uses the Finite Element Method (FEM) to compute field distributions in arbitrary 3D geometries—making it the industry-standard tool for superconducting quantum circuit design.",
    date: "Jun 23, 2026",
    content: <HfssGuideContent />,
    authorProfile: <SilicofellerAuthor />,
  },
  {
    slug: "hfss-quantum-parameters",
    tag: "Hardware Engineering",
    title: "HFSS Simulation Output Parameters: 52-Parameter Reference for Quantum Computing",
    authors: "Silicofeller Engineering Team",
    publishMeta: "Published by Silicofeller · Technical Reference · June 2026",
    excerpt:
      "A comprehensive reference cataloguing 52 output parameters extracted from HFSS simulations for superconducting quantum circuit design, organised into 7 categories with design rules sourced from IEEE/APS research papers spanning 2004–2026.",
    date: "Jun 23, 2026",
    content: <HfssParamsContent />,
    authorProfile: <SilicofellerAuthor />,
  },
  {
    slug: "q3d-analysis-parameters",
    tag: "Hardware Engineering",
    title:
      "Q3D Extractor Output Parameters: RLGC Matrices & Parasitic Extraction for Superconducting Qubits",
    authors: "Silicofeller Engineering Team",
    publishMeta: "Published by Silicofeller · Technical Reference · June 2026",
    excerpt:
      "Q3D Extractor is the industry-standard tool for parasitic extraction. This reference catalogues 47+ output parameters across 11 categories, with design rules for superconducting circuits.",
    date: "Jun 23, 2026",
    content: <Q3dParamsContent />,
    authorProfile: <SilicofellerAuthor />,
  },
  {
    slug: "epr-analysis-parameters",
    tag: "Hardware Engineering",
    title: "EPR Analysis Output Parameters: A Complete Reference",
    authors: "Silicofeller Engineering Team",
    publishMeta: "Published by Silicofeller · Technical Reference · June 2026",
    excerpt:
      "The Energy Participation Ratio (EPR) method extracts quantum Hamiltonian parameters from classical EM simulations. This guide details all 50 parameters across 5 categories.",
    date: "Jun 23, 2026",
    content: <EprContent />,
    authorProfile: <SilicofellerAuthor />,
  },
];
