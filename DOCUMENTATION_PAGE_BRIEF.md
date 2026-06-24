# Silicofeller Quantum Studio — Documentation Redesign Brief

## Ground truth used for this brief

This brief deliberately excludes the current documentation implementation. It is based on the production interfaces and source-backed capabilities elsewhere in the application.

### Product identity

**Silicofeller Quantum Studio** is an AI-assisted, constraint-driven EDA workspace for superconducting quantum-chip design. Its user journey is:

`describe or define a processor → create the topology/design graph → inspect or edit the schematic → validate and plan frequencies → route/export → analyse physics or run simulations → prepare a report/tapeout package`

### Current, source-backed product capabilities

| Area | What the documentation should describe |
|---|---|
| Projects and workspace | Authenticated projects, saved design payloads, versions, dashboard activity, active design context. |
| Design Copilot | Natural-language chip design prompts, presets for linear, heavy-hex, surface-code and ring designs, material choice, generated topology, placement, frequency plan, code and DRC results. |
| Architecture Explorer | Visual exploration of generated topologies and resource/wafer-routing information; can seed the designer or schematic editor. |
| Schematic Editor | Multi-tab visual canvas, component placement, pin-aware connections, property inspection, code panel, save state, keyboard shortcuts and lossless design-graph round trip. |
| Component Library | Searchable Qiskit Metal component catalogue: qubits, couplers, transmission lines, resonators, terminations, lumped components and sample shapes; shows parameters and Python snippets. |
| Design pipeline | Constraint → graph → validation → frequency plan → placement → routing → four-domain DRC → Qiskit Metal code → export. |
| Verification | Structural graph validation plus geometry, frequency, fabrication and connectivity DRC. |
| Physics and simulation | Analytical transmon properties (frequency, anharmonicity, EJ/EC, T1/T2, Purcell limit and estimated gate fidelities); persisted simulation jobs support analytic or PALACE workflows. |
| Materials | Substrate and metal choices flow into design and physics calculations. |
| Exports and tapeout | JSON, QCLang, SVG, GDS, DXF and PDF export interfaces; reports for design, verification, simulation and tapeout. |
| QCLang/API | QCLang parse, compile, examples, templates and save APIs; FastAPI OpenAPI/Swagger and ReDoc endpoints. |
| Platform | React 19 + TypeScript + TanStack Start/Router/Query + Tailwind v4 + Radix + React Flow + Recharts + Monaco; FastAPI + Pydantic + SQLAlchemy + Alembic; SQLite for local development, PostgreSQL in Docker deployment, optional Redis queue infrastructure. |

### Honesty rule

The app navigation marks a number of interfaces as **Coming soon**. Do not position locked UI as an available workflow. If an otherwise useful route is included, mark it as **Preview**, **Planned**, or hide it from the primary documentation nav until it is released. In particular, do not promise team collaboration, billing, full report automation, fault-tolerance studio, layout viewer, or integrations as generally available solely because a route/component exists.

---

## Copy/paste implementation prompt

```text
Create a polished, responsive documentation hub for “Silicofeller Quantum Studio”, an AI-assisted EDA platform for superconducting quantum-chip design. This is a new documentation experience; do not reuse the existing documentation page, its navigation hierarchy, placeholder content, or visual styles.

Use the information architecture of a strong technical documentation portal: a compact global header, a highly discoverable guide landing page, category cards, a persistent left navigation on article pages, contextual right-side table of contents, clear previous/next links, and a small “Was this helpful?” footer. Aim for the clarity and scanning rhythm of IBM Quantum Guides, but do not copy IBM branding, colours, icons, wording, layout measurements, or assets.

Brand and visual direction
- Product: Silicofeller Quantum Studio. Use “Quantum Studio” as the short name only after first mention.
- Personality: precise, calm, capable, practical; an engineering notebook with a premium EDA finish.
- Palette: ink/slate text on warm off-white, deep navy surfaces, electric indigo/blue for action, cyan as a restrained data accent, emerald for pass states, amber/red for warnings/errors. Avoid a generic purple neon AI aesthetic.
- Type: modern sans-serif with a readable mono face for code, endpoints and parameters. Use generous line height, 16px body text, strong heading hierarchy, and restrained shadows.
- Treat screenshots as evidence. Images must be real captures from this product, never stock lab imagery, generic circuit art, fake dashboard mockups, or IBM screenshots.
- Each guide landing/category has a large product screenshot or purposeful UI crop. Each detailed article gets one relevant annotated screenshot near the first actionable step. Use 16:9 image cards, rounded 12px corners, a subtle border, descriptive alt text, and an expandable “View full screen” treatment.

Layout
1. Global header: Silicofeller logo, “Documentation” label, full-text search field, links for Guides, API reference and GitHub (only display a link if configured), plus a “Open Quantum Studio” primary button.
2. Landing hero: breadcrumb “Documentation”, title “Build superconducting quantum processors with confidence”, short explanation, primary CTA “Start with your first design”, secondary CTA “Explore the design workflow”. Place a real Design Copilot or Schematic Editor screenshot on the right.
3. Start-here strip: three numbered cards — Generate a design, Edit its schematic, Validate and export — each with a small real UI crop and deep links.
4. Guide directory: searchable cards grouped by task, not by internal code modules. Every card has title, one-line outcome, approximate reading time, level badge, and a real interface thumbnail.
5. Article template: left navigation (280px), readable main column (720px), right on-this-page rail (220px). Include an overview, prerequisites, steps, notes/cautions, screenshot captions, code blocks with copy buttons, real API links where applicable, and next steps. Collapse both rails cleanly on mobile; never hide the article’s page tree.
6. End every article with related guides, previous/next navigation, “Was this helpful?”, and a factual status/date label. Do not invent release dates.

Use the following landing-page content exactly as the initial information architecture. Titles and summaries should be written in concise, active technical language.

Landing-page categories

A. Get started
- “What is Quantum Studio?” — Understand the platform’s constraint-driven path from chip intent to design graph, verification and exports.
- “Create your first project” — Create a workspace project and understand the active design context.
- “Generate a 5-qubit design” — Use Design Copilot to turn a natural-language prompt into a generated topology, frequency plan and design result.
- “Choose a topology” — Decide between grid/surface-code basis, heavy-hex, linear chain, ring, star and custom layouts.
- “Choose materials” — Set substrate and metal choices before reviewing physics-oriented results.

B. Design a quantum chip
- “Use Design Copilot” — Prompt for a superconducting transmon processor, select a material context and inspect the generated result. Include prompt examples for a 5-qubit linear processor, 16-qubit heavy-hex processor and 9-qubit ring.
- “Explore architecture options” — Compare topology shape, qubit count and routing/resource implications in Architecture Explorer before seeding a design.
- “Edit in the Schematic Editor” — Place components, create pin-aware connections, inspect properties, navigate the canvas and save the design.
- “Browse the Component Library” — Search Qiskit Metal components by category, inspect default parameters and copy a Python snippet.
- “Understand the design graph” — Explain placements, connections and how editor changes round-trip to the backend pipeline without data loss.

C. Validate, analyse and iterate
- “Understand the design pipeline” — Visualise the eight stages: Constraints → Graph → Validation → Frequency Plan → Placement → Routing → Four-domain DRC → Code and Exports.
- “Run design validation” — Explain fast structural graph validation, what passed/failed means, and how to correct disconnected or invalid coupling relationships.
- “Use four-domain DRC” — Explain geometry, frequency, fabrication and connectivity checks in practical terms; show severity and suggested resolution language only when actually returned by the API.
- “Review frequency planning” — Explain target frequency, qubit/readout bands, detuning, resonator frequency and how topology affects the plan.
- “Run physics analysis” — Describe the analytical results: f01, anharmonicity, EJ/EC, T1, T2, T2*, Purcell-limited T1 and estimated single/two-qubit fidelities. Clearly label the results as model estimates, not measured device performance.
- “Create and run simulations” — Show simulation record creation and status, analytic engine use and the optional PALACE path. State environment/dependency requirements before instructing users to select PALACE.

D. Export, share and report
- “Export a design” — Explain JSON, QCLang, SVG, GDS, DXF and PDF output; give a plain-language use case for each format.
- “Generate Qiskit Metal code” — Explain that generated Python is an output of the design pipeline and how it relates to a layout workflow.
- “Prepare a tapeout package” — Present this as a guided package-generation endpoint and review step. Do not call any output fabrication-ready without the user’s own foundry review.
- “Read design and verification reports” — Explain the purpose of design summary, verification, simulation and tapeout report types, distinguishing available reports from preview-only UI.

E. QCLang and API
- “QCLang overview” — Introduce QCLang as the platform’s quantum-chip language and point to parsing, compilation, templates and examples.
- “Parse and compile QCLang” — Use the actual API capabilities: status, examples, parse, compile, save and templates.
- “API quick reference” — Link to the live FastAPI Swagger UI at /docs and ReDoc at /redoc; include endpoint groups for auth, projects, qclang, simulations, verification, tapeout, materials, design and component bridge APIs.
- “Design API workflow” — Document the actual endpoints and purpose: POST /api/design/generate, /generate-from-graph, /from-prompt, /validate, /route, /drc, /export, /export-all, /frequency-plan; GET /api/design/topologies.

F. Develop and deploy
- “System architecture” — Present the user-visible relationship between the React web app, FastAPI API, design/physics services and database. Use a simple diagram, not a dense infrastructure poster.
- “Run locally” — Prerequisites: Python 3.10–3.11, Node 18+, npm or Bun. Backend runs on port 5000; frontend development server on 5173. Mention backend availability is required for dynamic workspace/design functions.
- “Run with Docker Compose” — Explain the containers: frontend (3000), backend (5000), PostgreSQL (5432) and Redis (6379). Include environment-variable guidance without exposing secrets.
- “Technology stack” — Group technologies by responsibility rather than showing a logo wall: interface, state/data, API/data, graph/physics and deployment.

For every category and article, apply this screenshot plan. Capture the named screen in the running application at desktop width with an anonymous demo project/design. Never use a screenshot that includes private user details, tokens, local paths, unrelated browser chrome, or fake data presented as a measurement.

Screenshot register
1. Documentation hero / First design / Design Copilot — designer screen showing prompt panel, topology/material controls and a completed generated design. File target: assets/screens/design-copilot-overview.webp. Caption: “Describe the processor you want to build, then inspect the generated architecture and design outputs.”
2. Projects / Dashboard — project list or workspace showing recent project/activity and active design. assets/screens/workspace-projects.webp.
3. Architecture Explorer — topology canvas with controls, selected topology and export/seed action visible. assets/screens/architecture-explorer.webp.
4. Schematic Editor — full editor with component rail, central canvas, inspector and code panel. assets/screens/schematic-editor-overview.webp.
5. Component Library — category filter, component grid and one component detail drawer. assets/screens/component-library.webp.
6. Design pipeline / validation — generated design result with frequency-plan and DRC/validation results. assets/screens/design-validation.webp.
7. Physics analysis — Physics Analysis screen with a generated design and metric cards/table. assets/screens/physics-analysis.webp.
8. Simulations — simulations list or create/run panel with an explicit status chip. assets/screens/simulations.webp.
9. Export/reporting — existing export/report interface. If a release-ready screen is not available, use a compact export panel crop and label the article “API workflow”; do not fabricate a report UI. assets/screens/design-export.webp.
10. QCLang/API — Swagger UI for the running backend plus optional QCLang panel. assets/screens/api-reference.webp.
11. Local/deployment — a clean terminal/code block illustration is allowed here, but it must be paired with a product/API health screenshot. assets/screens/api-health.webp.

Existing approved product assets that can supplement, never replace, product screenshots:
- /tech/schematic-editor.png
- /tech/chatbot.png
- /tech/export-reports.png
- /quantum-chip-3d.png (landing only; decorative, not instructional)
- /docs/assets/tutorials/*.png (only in solver-integration context and only if the associated integration is released/documented)

Content constraints
- Keep copy source-backed. Avoid claims such as “fabrication-ready”, “enterprise-grade”, “industry standard”, “production”, “measured fidelity” or “fully automated tapeout” unless independently validated for the deployed release.
- Use “estimated”, “analytical”, “generated”, “optional”, “preview” and “requires configuration” where the underlying product does.
- Give one concrete outcome per page before implementation detail.
- Explain unfamiliar terms (transmon, coupler, resonator, detuning, DRC) with a one-sentence inline definition on first use.
- Use accessible alt text that states what a user can learn from an image, not its decorative appearance.
- No giant walls of cards. On the landing page, show six category cards followed by a “Popular workflows” section and a “Reference” section.

Implement the first featured guide in full: “Generate a 5-qubit design.”
It needs: overview, what you will produce, prerequisites, a sample prompt, five ordered steps, relevant Design Copilot screenshot after step 2, an explanation of result areas (topology, frequency plan, placement, DRC, generated code), a note that outputs require review before fabrication, troubleshooting for backend unavailable/no result, related links to Schematic Editor, validation, physics analysis and exports, and next/previous navigation.

Deliver the page as production-quality React/TypeScript components, using the project’s TanStack Router, Tailwind CSS v4, Radix-based UI primitives and Lucide icons. Maintain responsive keyboard-accessible navigation, semantic landmarks, heading order, skip link, focus states, image loading dimensions and reduced-motion support. Do not introduce a second component library or a documentation framework that conflicts with the existing stack.
```

---

## Implementation data

### Document routes / metadata

| Slug | Title | Level | Screenshot |
|---|---|---:|---|
| /guides/getting-started/first-design | Generate a 5-qubit design | Beginner | design-copilot-overview.webp |
| /guides/design/schematic-editor | Edit in the Schematic Editor | Intermediate | schematic-editor-overview.webp |
| /guides/design/component-library | Browse the Component Library | Beginner | component-library.webp |
| /guides/validate/four-domain-drc | Use four-domain DRC | Intermediate | design-validation.webp |
| /guides/analyse/physics | Run physics analysis | Intermediate | physics-analysis.webp |
| /guides/analyse/simulations | Create and run simulations | Advanced | simulations.webp |
| /guides/export/export-design | Export a design | Intermediate | design-export.webp |
| /guides/api/design-workflow | Design API workflow | Advanced | api-reference.webp |
| /guides/develop/local | Run locally | Beginner | api-health.webp |

### Stack data

| Layer | Technologies |
|---|---|
| Web interface | React 19, TypeScript, Vite, TanStack Start, TanStack Router, TanStack Query, Tailwind CSS v4, Radix UI, Motion, Lucide |
| Design interaction | React Flow, Monaco Editor, Qiskit Metal component catalogue/bridge |
| Backend | FastAPI, Uvicorn, Pydantic, SQLAlchemy, Alembic, JWT/OAuth2-style token auth |
| Engineering | NetworkX design/topology algorithms, QCLang parser/compiler, design graph, auto-routing, DRC, analytical physics; optional Claude/PyTorch intent resolution |
| Data and deployment | SQLite (local), PostgreSQL (container deployment), Docker/Docker Compose, Redis infrastructure |

### Accurate API data

| Capability | Endpoint |
|---|---|
| Generate full constraint-driven design | `POST /api/design/generate` |
| Generate from a visual graph | `POST /api/design/generate-from-graph` |
| Generate from natural language | `POST /api/design/from-prompt` |
| Validate a graph | `POST /api/design/validate` |
| Route a placement | `POST /api/design/route` |
| Run four-domain DRC | `POST /api/design/drc` |
| Export one format / all formats | `POST /api/design/export`, `POST /api/design/export-all` |
| Generate a frequency plan | `POST /api/design/frequency-plan` |
| List topology metadata | `GET /api/design/topologies` |
| QCLang | `/api/qclang/status`, `/examples`, `/parse`, `/compile`, `/save`, `/templates` |
| API references | `/docs`, `/redoc` |

### Recommended first screenshot capture order

1. Design Copilot
2. Schematic Editor
3. Component Library
4. Dashboard/Projects
5. Architecture Explorer
6. Physics Analysis
7. Simulations
8. Export/Reports
9. Swagger/OpenAPI

This order makes the first release useful even if preview-only areas stay out of the documentation navigation.
