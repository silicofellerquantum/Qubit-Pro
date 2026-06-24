/**
 * Curated content for the first two Documentation navigation groups.
 * Every guide owns distinct copy; article components should render this data
 * rather than falling back to generic section descriptions.
 */

export type GuideLevel = "Beginner" | "Intermediate";

export interface GuideStep {
  title: string;
  body: string;
}

export interface GuideContent {
  id: string;
  href: string;
  group: "Get started" | "Product updates";
  title: string;
  eyebrow: string;
  summary: string;
  level: GuideLevel;
  readingTime: string;
  image: {
    src: string;
    alt: string;
    caption: string;
  };
  outcome: string;
  prerequisites: string[];
  sections: Array<{
    heading: string;
    body: string;
    bullets?: string[];
  }>;
  steps?: GuideStep[];
  note?: string;
  troubleshooting?: Array<{ issue: string; resolution: string }>;
  related: Array<{ label: string; href: string }>;
}

export const GETTING_STARTED_CONTENT: GuideContent[] = [
  {
    id: "introduction",
    href: "/guides/getting-started/introduction",
    group: "Get started",
    title: "Introduction",
    eyebrow: "Get started",
    summary: "Learn how Quantum Studio turns processor intent into an inspectable superconducting-chip design workflow.",
    level: "Beginner",
    readingTime: "4 min read",
    image: {
      src: "/quantum-chip-3d.png",
      alt: "A rendered superconducting quantum chip used to introduce the Quantum Studio design workflow.",
      caption: "Quantum Studio connects architectural intent, physical design checks, and engineering outputs in one workspace.",
    },
    outcome: "You will understand where to begin and which parts of the workspace are used at each design stage.",
    prerequisites: ["A modern desktop browser", "A Quantum Studio account"],
    sections: [
      {
        heading: "What Quantum Studio is for",
        body: "Silicofeller Quantum Studio is a constraint-driven engineering workspace for superconducting quantum processors. It helps you express a processor goal, construct or inspect its design graph, and produce technical outputs for further review.",
      },
      {
        heading: "How a design moves through the platform",
        body: "A typical design starts with constraints or a natural-language request. The platform creates a topology and placement, plans frequencies, routes connections, performs validation, and prepares code or exportable representations.",
        bullets: [
          "Define the intended qubit count, topology, substrate, metal, and target frequency.",
          "Inspect or refine the generated graph in the Schematic Editor.",
          "Use validation and analysis results to decide what should be changed next.",
        ],
      },
      {
        heading: "What the platform does not replace",
        body: "Generated layouts and analytical results are engineering aids. They require review against the process design kit, foundry rules, simulation evidence, and your organisation’s release process before fabrication decisions are made.",
      },
    ],
    related: [
      { label: "Quickstart", href: "/guides/getting-started/quickstart" },
      { label: "Generate a 5-qubit design", href: "/guides/getting-started/first-design" },
    ],
  },
  {
    id: "quickstart",
    href: "/guides/getting-started/quickstart",
    group: "Get started",
    title: "Quickstart",
    eyebrow: "Get started",
    summary: "Follow the shortest practical path from signing in to reviewing a generated processor concept.",
    level: "Beginner",
    readingTime: "6 min read",
    image: {
      src: "/tech/chatbot.png",
      alt: "The Design Copilot interface where a user can enter a quantum processor design request.",
      caption: "Design Copilot is the fastest way to create a starting point for a new chip concept.",
    },
    outcome: "You will have an active project with a generated design available for inspection.",
    prerequisites: ["A signed-in Quantum Studio account", "Access to the backend service"],
    sections: [
      {
        heading: "The five-minute workflow",
        body: "This path intentionally avoids detailed manual layout work. It is designed to give a new user a concrete design result before they learn the deeper editors and analysis tools.",
      },
      {
        heading: "Use a bounded first request",
        body: "Start with a small topology and a familiar material configuration. Smaller designs make it easier to trace each qubit, coupling relationship, and frequency result when you open the output.",
      },
    ],
    steps: [
      { title: "Open Projects", body: "Create a project with a clear experiment or device name so its saved designs and versions remain identifiable later." },
      { title: "Enter Design Copilot", body: "Choose the Design Copilot from the Design area of the workspace." },
      { title: "Describe a processor", body: "Ask for a five-qubit transmon chain with nearest-neighbour coupling; include a topology rather than relying on an ambiguous request." },
      { title: "Inspect the response", body: "Check the generated qubit count, topology, placement, frequency plan, and validation result before making any design decision." },
      { title: "Continue in the editor", body: "Open the resulting design in the Schematic Editor when you need to alter components or pin-level connections." },
    ],
    troubleshooting: [
      { issue: "The generation request does not return a design.", resolution: "Confirm that the backend is reachable and simplify the request to a qubit count and one supported topology." },
      { issue: "The result has an unexpected structure.", resolution: "State the topology explicitly and review the interpreted design details before requesting another generation." },
    ],
    related: [
      { label: "Create your first project", href: "/guides/getting-started/first-project" },
      { label: "Choose a topology", href: "/guides/getting-started/choose-topology" },
    ],
  },
  {
    id: "first-project",
    href: "/guides/getting-started/first-project",
    group: "Get started",
    title: "Create your first project",
    eyebrow: "Get started",
    summary: "Set up a project as the durable home for a chip concept, its saved design payloads, and later versions.",
    level: "Beginner",
    readingTime: "3 min read",
    image: {
      src: "/tech/schematic-editor.png",
      alt: "A Quantum Studio design workspace illustrating the project context behind an editable chip design.",
      caption: "Projects provide the context used to save and revisit design work.",
    },
    outcome: "You will create a named project and understand how it relates to the active design.",
    prerequisites: ["A signed-in Quantum Studio account"],
    sections: [
      {
        heading: "Why projects matter",
        body: "A project is more than a folder. It associates the design payload, simulation records, generated reports, and version history with a single engineering effort.",
      },
      {
        heading: "Name for the decision you are making",
        body: "Use a name that identifies the architecture or experiment rather than a temporary UI task. For example, use “HH-16 readout study” instead of “New chip”. A useful description records the scope that later reviewers need to understand.",
      },
      {
        heading: "Active project versus active design",
        body: "The active project is the workspace container. The active design is the currently selected generation or edited schematic inside that context. Switching projects changes the data that later save, simulation, and report actions can reference.",
      },
    ],
    related: [
      { label: "Quickstart", href: "/guides/getting-started/quickstart" },
      { label: "Generate a 5-qubit design", href: "/guides/getting-started/first-design" },
    ],
  },
  {
    id: "first-design",
    href: "/guides/getting-started/first-design",
    group: "Get started",
    title: "Generate a 5-qubit design",
    eyebrow: "Get started",
    summary: "Create a small transmon processor from a plain-language request and learn how to read its first outputs.",
    level: "Beginner",
    readingTime: "8 min read",
    image: {
      src: "/tech/chatbot.png",
      alt: "Design Copilot displaying a quantum-chip prompt and generated result areas.",
      caption: "A small linear design makes topology, placement, and frequency outputs easy to inspect side by side.",
    },
    outcome: "You will generate a five-qubit nearest-neighbour processor and know what each returned result represents.",
    prerequisites: ["An active project", "Backend connectivity", "Basic familiarity with transmon qubits"],
    sections: [
      {
        heading: "Sample design request",
        body: "Use this natural-language request in Design Copilot: “Design a 5-qubit transmon quantum processor with nearest-neighbour coupling in a linear topology.” This is a Design Copilot prompt, not QCLang source code.",
      },
      {
        heading: "What the generated result contains",
        body: "The result combines architectural and physical-design information. Treat it as a starting design record that can be checked and edited, rather than a final device release.",
        bullets: [
          "Topology: the requested relationship between qubits.",
          "Placement: coordinates and orientation used by the physical layout workflow.",
          "Frequency plan: proposed qubit and resonator frequency values and warnings.",
          "DRC: validation output for the generated design.",
          "Generated code: an output for Qiskit Metal-oriented layout work.",
        ],
      },
    ],
    steps: [
      { title: "Select Design Copilot", body: "Open the Design Copilot from the workspace navigation while your target project is active." },
      { title: "Choose a material context", body: "Select the substrate and metal choices that should inform the frequency and physics-oriented calculations." },
      { title: "Submit the sample request", body: "Paste the five-qubit linear transmon request and wait for the design response to finish loading." },
      { title: "Verify the topology", body: "Confirm that five qubits appear in a chain and that the intended nearest-neighbour relationships are represented." },
      { title: "Open the next engineering view", body: "Move to the Schematic Editor for manual changes or to validation and physics tools for further review." },
    ],
    note: "Do not interpret generated frequency values or layout output as measured device performance or as foundry approval.",
    troubleshooting: [
      { issue: "A topology name is not reflected in the result.", resolution: "Use a supported topology term such as grid, heavy-hex, line, ring, star, or custom and submit a focused request." },
      { issue: "The result is incomplete.", resolution: "Retry after checking the backend health endpoint; then reduce the request to the qubit count, topology, substrate, and metal." },
    ],
    related: [
      { label: "Choose materials", href: "/guides/getting-started/choose-materials" },
      { label: "Edit in the Schematic Editor", href: "/guides/design/schematic-editor" },
    ],
  },
  {
    id: "choose-topology",
    href: "/guides/getting-started/choose-topology",
    group: "Get started",
    title: "Choose a topology",
    eyebrow: "Get started",
    summary: "Match the processor’s connection pattern to the engineering question you want to explore.",
    level: "Beginner",
    readingTime: "5 min read",
    image: {
      src: "/tech/schematic-editor.png",
      alt: "A schematic canvas showing a quantum-chip topology as components and connections.",
      caption: "Topology describes which qubits are connected; it is separate from the later physical placement details.",
    },
    outcome: "You will select a topology based on connectivity goals instead of visual preference alone.",
    prerequisites: ["A target qubit count", "A high-level use case for the device"],
    sections: [
      {
        heading: "Grid",
        body: "A grid uses local horizontal and vertical neighbours. It is a natural starting structure for two-dimensional layouts and surface-code-oriented exploration, where qubits can have up to four local relationships.",
      },
      {
        heading: "Heavy-hex",
        body: "Heavy-hex constrains connectivity more tightly, with a maximum degree of three. Use it when you want to study a sparse lattice associated with scalable low-crosstalk design choices.",
      },
      {
        heading: "Line and ring",
        body: "A line is the simplest nearest-neighbour structure for small devices and experiments. A ring adds a final connection between the endpoints, making it useful when periodic adjacency is part of the question.",
      },
      {
        heading: "Star and custom",
        body: "A star concentrates relationships around a central qubit. Choose custom when the connection graph is dictated by a specific experiment and should be built directly in the schematic workflow.",
      },
    ],
    related: [
      { label: "Generate a 5-qubit design", href: "/guides/getting-started/first-design" },
      { label: "Explore architecture options", href: "/guides/design/architecture-explorer" },
    ],
  },
  {
    id: "choose-materials",
    href: "/guides/getting-started/choose-materials",
    group: "Get started",
    title: "Choose materials",
    eyebrow: "Get started",
    summary: "Set substrate and metal assumptions before interpreting the platform’s design and physics-oriented calculations.",
    level: "Beginner",
    readingTime: "4 min read",
    image: {
      src: "/quantum-chip-3d.png",
      alt: "A superconducting quantum-chip rendering used to illustrate that material assumptions are part of the device model.",
      caption: "Material selection provides context for generated design and analytical physics outputs.",
    },
    outcome: "You will know which material choices belong in a design request and how to communicate their limitations.",
    prerequisites: ["A preliminary device concept", "Process information from your team when available"],
    sections: [
      {
        heading: "Substrate selection",
        body: "The selected substrate is passed into the design and physics workflow. It supplies a material assumption for calculations such as effective dielectric behaviour; it is not a substitute for a calibrated fabrication-stack model.",
      },
      {
        heading: "Metal selection",
        body: "The selected metal records the intended superconducting-material context. Use the option that matches the current design study, then document any process-specific stack details outside the simplified selector.",
      },
      {
        heading: "How to report the choice",
        body: "Include substrate and metal with every shared design result. This prevents others from treating estimates generated under one material assumption as though they apply to a different fabrication stack.",
      },
    ],
    related: [
      { label: "Generate a 5-qubit design", href: "/guides/getting-started/first-design" },
      { label: "Run physics analysis", href: "/guides/analyse/physics" },
    ],
  },
  {
    id: "changelog",
    href: "/guides/updates/changelog",
    group: "Product updates",
    title: "Changelog",
    eyebrow: "Product updates",
    summary: "Track shipped improvements, fixed behaviour, and documentation corrections in a concise release history.",
    level: "Beginner",
    readingTime: "2 min read",
    image: {
      src: "/tech/export-reports.png",
      alt: "A Quantum Studio output interface illustrating the kind of product capability that release notes can describe.",
      caption: "Changelog entries should explain user-visible changes, not internal implementation trivia.",
    },
    outcome: "You will know how to read a change entry and decide whether it affects your saved designs or workflow.",
    prerequisites: [],
    sections: [
      {
        heading: "What appears in the changelog",
        body: "Use this page for released behaviour: new user-facing capabilities, corrected design results, usability improvements, and changes that require users to revisit an output.",
      },
      {
        heading: "How entries are written",
        body: "Each entry should name the affected area, state what changed, explain the impact, and identify any required action. Avoid vague notes such as “performance improvements” without a user-visible consequence.",
      },
      {
        heading: "When to re-run a design",
        body: "Re-run generated designs when a release changes topology generation, frequency planning, validation, routing, exports, or the physics model used by your result. Keep the previous version available for comparison.",
      },
    ],
    related: [
      { label: "Release notes", href: "/guides/updates/release-notes" },
      { label: "Version control", href: "/guides/workspace/version-control" },
    ],
  },
  {
    id: "release-notes",
    href: "/guides/updates/release-notes",
    group: "Product updates",
    title: "Release notes",
    eyebrow: "Product updates",
    summary: "Read a release as an engineering migration note: what is available, what changed, and what still needs validation.",
    level: "Intermediate",
    readingTime: "3 min read",
    image: {
      src: "/tech/export-reports.png",
      alt: "A report-oriented Quantum Studio screen representing the review discipline needed after a product release.",
      caption: "Release notes help teams decide whether a new platform behaviour changes their review process.",
    },
    outcome: "You will be able to assess a release before applying it to an in-progress hardware study.",
    prerequisites: ["Awareness of the projects or generated results your team is actively reviewing"],
    sections: [
      {
        heading: "Release scope",
        body: "A release note gives context that a changelog line cannot: feature availability, important constraints, configuration requirements, and the parts of the workflow that were exercised during validation.",
      },
      {
        heading: "Upgrade assessment",
        body: "Before adopting a release in an active study, identify whether it changes generated graphs, numerical estimates, output formats, authentication behaviour, or deployment configuration. Test it on a copy of a representative project first.",
      },
      {
        heading: "Known limitations",
        body: "Keep limitations visible beside features. If a simulator is optional, a UI is preview-only, or an output still needs external verification, state that directly rather than burying it in a footnote.",
      },
    ],
    note: "A release note records product behaviour; it does not certify a device design or replace your team’s engineering sign-off.",
    related: [
      { label: "Changelog", href: "/guides/updates/changelog" },
      { label: "Troubleshooting", href: "/guides/resources/troubleshooting" },
    ],
  },
];

export const GETTING_STARTED_BY_ID = Object.fromEntries(
  GETTING_STARTED_CONTENT.map((guide) => [guide.id, guide]),
) as Record<string, GuideContent>;
