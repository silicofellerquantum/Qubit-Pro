import { SearchItem } from "./search-assistant-modal";

export type NavStatus = "active" | "preview" | "deprecated";

export interface NavItem {
  id: string;
  label: string;
  href?: string;
  children?: NavItem[];
  badge?: string;
  status?: NavStatus | "hidden";
  icon?: any; // lucide react icon component reference if needed
  time?: string;
  outcome?: string;
  level?: string;
  image?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAVIGATION_DATA: NavGroup[] = [
  {
    title: "DOCUMENTATION",
    items: [
      {
        id: "get-started",
        label: "Get started",
        children: [
          { id: "home", label: "Introduction", time: "5 min", outcome: "Welcome to Silicofeller Quantum Studio." },
          { id: "quick-start", label: "Quickstart", time: "5 min" },
          { id: "create-first-project", label: "Create your first project", time: "3 min" },
          { id: "5-qubit-design", label: "Generate a 5-qubit design", time: "10 min" },
          { id: "choose-topology", label: "Choose a topology", time: "4 min" },
          { id: "choose-materials", label: "Choose materials", time: "4 min" }
        ]
      },
      {
        id: "product-updates",
        label: "Product updates",
        children: [
          { id: "changelog", label: "Changelog" },
          { id: "latest-release", label: "Release notes" }
        ]
      }
    ]
  },
  {
    title: "DESIGN WORKSPACE",
    items: [
      { id: "designer-introduction", label: "Introduction to Quantum Studio" },
      { id: "projects-api", label: "Projects and workspace" },
      {
        id: "design-copilot",
        label: "Design Copilot",
        children: [
          { id: "design-prompts", label: "Write effective design prompts" },
          { id: "ai-workflow", label: "Generate a design from a prompt" },
          { id: "review-topology", label: "Review generated topology" },
          { id: "review-placement", label: "Review placement and frequency plan" }
        ]
      },
      {
        id: "architecture-explorer",
        label: "Architecture Explorer",
        children: [
          { id: "topology-explorer", label: "Explore topologies" },
          { id: "grid", label: "Grid and surface-code layouts" },
          { id: "heavy-hex", label: "Heavy-hex layouts" },
          { id: "linear", label: "Linear, ring, and star layouts" }
        ]
      },
      {
        id: "schematic-editor",
        label: "Schematic Editor",
        children: [
          { id: "chip-composer", label: "Editor overview" },
          { id: "placement-tools", label: "Place components" },
          { id: "routing-tools", label: "Connect component pins" },
          { id: "properties-panel", label: "Use the properties inspector" },
          { id: "keyboard-shortcuts", label: "Navigate and use keyboard shortcuts" },
          { id: "save-designs", label: "Save and restore designs" }
        ]
      },
      {
        id: "component-library",
        label: "Component Library",
        children: [
          { id: "browse-components", label: "Browse components" },
          { id: "designer-qubits", label: "Qubits" },
          { id: "designer-couplers", label: "Couplers" },
          { id: "designer-feedlines", label: "Transmission lines" },
          { id: "designer-resonators", label: "Resonators" },
          { id: "designer-terminations", label: "Terminations and lumped elements" },
          { id: "copy-qiskit", label: "Copy Qiskit Metal snippets" }
        ]
      }
    ]
  },
  {
    title: "VALIDATE AND ANALYSE",
    items: [
      { id: "understand-pipeline", label: "Design pipeline overview" },
      {
        id: "graph-validation",
        label: "Graph validation",
        children: [
          { id: "design-graph", label: "Design graph concepts" },
          { id: "validate-connectivity", label: "Validate connectivity" },
          { id: "invalid-couplings", label: "Correct invalid couplings" }
        ]
      },
      {
        id: "four-domain-drc",
        label: "Four-domain DRC",
        children: [
          { id: "geometry-drc", label: "Geometry checks" },
          { id: "frequency-drc", label: "Frequency checks" },
          { id: "fabrication-drc", label: "Fabrication checks" },
          { id: "connectivity-drc", label: "Connectivity checks" },
          { id: "severity-levels", label: "Understand violations and severity" }
        ]
      },
      {
        id: "frequency-planning",
        label: "Frequency planning",
        children: [
          { id: "target-frequencies", label: "Target frequencies" },
          { id: "frequency-collisions", label: "Detuning and collision avoidance" },
          { id: "resonator-planning", label: "Resonator planning" }
        ]
      },
      {
        id: "physics-analysis",
        label: "Physics analysis",
        children: [
          { id: "transmon-properties", label: "Transmon properties" },
          { id: "coherence-analysis", label: "Coherence estimates: T1, T2, T2*" },
          { id: "anharmonicity", label: "Anharmonicity and EJ/EC" },
          { id: "gate-fidelity", label: "Estimated gate fidelity" }
        ]
      },
      {
        id: "simulations",
        label: "Simulations",
        status: "preview",
        badge: "Preview",
        children: [
          { id: "create-simulation", label: "Create a simulation" },
          { id: "run-analytical", label: "Run analytical simulation" },
          { id: "palace-adapter", label: "PALACE simulation workflow" },
          { id: "review-simulation", label: "Review simulation status and results" }
        ]
      }
    ]
  },
  {
    title: "EXPORT AND TAPEOUT",
    items: [
      {
        id: "export-design",
        label: "Export a design",
        children: [
          { id: "export-json", label: "JSON export" },
          { id: "export-qclang", label: "QCLang export" },
          { id: "export-svg", label: "SVG export" },
          { id: "export-gdsii", label: "GDS export" },
          { id: "export-dxf", label: "DXF export" },
          { id: "pdf-reports", label: "PDF export" }
        ]
      },
      { id: "export-qiskit-metal", label: "Generated Qiskit Metal code" },
      {
        id: "reports",
        label: "Reports",
        children: [
          { id: "design-summary", label: "Design summary" },
          { id: "validation-reports", label: "Verification report" },
          { id: "results-reports", label: "Simulation report" },
          { id: "tapeout-reports", label: "Tapeout report" }
        ]
      },
      {
        id: "tapeout-package",
        label: "Tapeout package",
        status: "preview",
        badge: "Preview",
        children: [
          { id: "generate-package", label: "Generate package" },
          { id: "foundry-rules", label: "Foundry review checklist" }
        ]
      }
    ]
  },
  {
    title: "QCLANG AND API",
    items: [
      { id: "qclang-overview", label: "QCLang overview" },
      {
        id: "work-with-qclang",
        label: "Work with QCLang",
        children: [
          { id: "qclang-examples", label: "Examples and templates" },
          { id: "parser", label: "Parse QCLang" },
          { id: "compile-design", label: "Compile QCLang" },
          { id: "save-qclang", label: "Save QCLang designs" }
        ]
      },
      {
        id: "api-reference",
        label: "API reference",
        children: [
          { id: "authentication", label: "Authentication" },
          { id: "api-projects", label: "Projects API" },
          { id: "api-design", label: "Design API" },
          { id: "api-qclang", label: "QCLang API" },
          { id: "simulation-api", label: "Simulations API" },
          { id: "api-verification", label: "Verification API" },
          { id: "api-materials", label: "Materials API" },
          { id: "api-tapeout", label: "Tapeout API" },
          { id: "api-component", label: "Component Bridge API" }
        ]
      },
      {
        id: "api-tools",
        label: "API tools",
        children: [
          { id: "api-explorer", label: "Swagger UI" },
          { id: "redoc", label: "ReDoc" }
        ]
      }
    ]
  },
  {
    title: "DEVELOPMENT AND DEPLOYMENT",
    items: [
      {
        id: "system-architecture",
        label: "System architecture",
        children: [
          { id: "frontend-architecture", label: "Frontend architecture" },
          { id: "backend-architecture", label: "Backend architecture" },
          { id: "design-physics-services", label: "Design and physics services" },
          { id: "database-architecture", label: "Database layer" }
        ]
      },
      { id: "running-locally", label: "Run locally" },
      { id: "environment-variables", label: "Environment variables" },
      { id: "docker-compose-deploy", label: "Docker Compose deployment" },
      {
        id: "technology-stack",
        label: "Technology stack",
        children: [
          { id: "react-typescript", label: "React and TypeScript" },
          { id: "tanstack", label: "TanStack Start, Router, and Query" },
          { id: "tailwind", label: "Tailwind CSS and Radix UI" },
          { id: "fastapi", label: "FastAPI and Pydantic" },
          { id: "sqlalchemy", label: "SQLAlchemy and Alembic" },
          { id: "databases", label: "SQLite, PostgreSQL, and Redis" },
          { id: "qiskit", label: "Qiskit Metal, NetworkX, and physics tooling" }
        ]
      }
    ]
  },
  {
    title: "ADDITIONAL RESOURCES",
    items: [
      {
        id: "troubleshooting",
        label: "Troubleshooting",
        children: [
          { id: "backend-unavailable", label: "Backend unavailable" },
          { id: "no-design", label: "No design generated" },
          { id: "validation-failures", label: "Validation failures" },
          { id: "simulation-failures", label: "Simulation failures" }
        ]
      },
      { id: "best-practices", label: "Best practices" },
      { id: "support", label: "Support and FAQ" },
      { id: "security-configuration", label: "Security and deployment guidance" }
    ]
  }
];

export const SEARCH_ITEMS: SearchItem[] = NAVIGATION_DATA.flatMap(category => {
  const allItems: SearchItem[] = [];
  category.items.forEach(item => {
    allItems.push({ id: item.id, title: item.label, text: item.outcome || `Documentation for ${item.label}` });
    if (item.children) {
      item.children.forEach(child => {
        allItems.push({ id: child.id, title: child.label, text: child.outcome || `Documentation for ${child.label}` });
      });
    }
  });
  return allItems;
});
