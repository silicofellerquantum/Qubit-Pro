import os
import json

TARGET_DIR = r"C:\Users\ASUS\Desktop\Qubit-Pro-main\frontend\src\components\documentation"

SECTIONS = [
    # Get Started
    ("introduction", "Introduction", "DOCUMENTATION"),
    ("quick-start", "Quick Start", "DOCUMENTATION"),
    ("installation", "Installation", "DOCUMENTATION"),
    ("running-locally", "Running Locally", "DOCUMENTATION"),
    ("first-project", "First Project", "DOCUMENTATION"),
    ("first-chip-design", "First Chip Design", "DOCUMENTATION"),
    ("first-validation", "First Validation", "DOCUMENTATION"),
    ("first-export", "First Export", "DOCUMENTATION"),
    ("changelog", "Changelog", "DOCUMENTATION"),

    # Silicofeller Design Studio
    ("designer-introduction", "Introduction to Designer", "SILICOFELLER DESIGN STUDIO"),
    ("chip-composer", "Chip Composer", "SILICOFELLER DESIGN STUDIO"),
    ("designer-qubits", "Qubits", "SILICOFELLER DESIGN STUDIO"),
    ("designer-couplers", "Couplers", "SILICOFELLER DESIGN STUDIO"),
    ("designer-resonators", "Resonators", "SILICOFELLER DESIGN STUDIO"),
    ("designer-feedlines", "Feedlines", "SILICOFELLER DESIGN STUDIO"),
    ("properties-panel", "Properties Panel", "SILICOFELLER DESIGN STUDIO"),
    ("validation-panel", "Validation Panel", "SILICOFELLER DESIGN STUDIO"),
    ("metrics-panel", "Metrics Panel", "SILICOFELLER DESIGN STUDIO"),
    ("placement-tools", "Placement Tools", "SILICOFELLER DESIGN STUDIO"),
    ("routing-tools", "Routing Tools", "SILICOFELLER DESIGN STUDIO"),
    ("alignment-tools", "Alignment Tools", "SILICOFELLER DESIGN STUDIO"),
    ("snap-system", "Snap System", "SILICOFELLER DESIGN STUDIO"),
    ("export-json", "JSON", "SILICOFELLER DESIGN STUDIO"),
    ("export-svg", "SVG", "SILICOFELLER DESIGN STUDIO"),
    ("export-gdsii", "GDSII", "SILICOFELLER DESIGN STUDIO"),
    ("export-dxf", "DXF", "SILICOFELLER DESIGN STUDIO"),

    # QCLang
    ("qclang-introduction", "Introduction to QCLang", "QCLANG"),
    ("install-qclang", "Install QCLang Tools", "QCLANG"),
    ("qclang-syntax", "Syntax", "QCLANG"),
    ("qclang-components", "Components", "QCLANG"),
    ("qclang-constraints", "Constraints", "QCLANG"),
    ("qclang-directives", "Directives", "QCLANG"),
    ("qclang-validation-rules", "Validation Rules", "QCLANG"),
    ("lang-qubits", "Qubits", "QCLANG"),
    ("lang-couplers", "Couplers", "QCLANG"),
    ("lang-resonators", "Resonators", "QCLANG"),
    ("lang-feedlines", "Feedlines", "QCLANG"),
    ("parametric-designs", "Parametric Designs", "QCLANG"),
    ("reusable-modules", "Reusable Modules", "QCLANG"),
    ("custom-topologies", "Custom Topologies", "QCLANG"),
    ("syntax-errors", "Syntax Errors", "QCLANG"),
    ("validation-errors", "Validation Errors", "QCLANG"),
    ("constraint-errors", "Constraint Errors", "QCLANG"),
    ("language-reference", "Language Reference", "QCLANG"),

    # Compiler & Synthesis
    ("compiler-overview", "Compiler Overview", "COMPILER & SYNTHESIS"),
    ("compiler-lexer", "Lexer", "COMPILER & SYNTHESIS"),
    ("compiler-parser", "Parser", "COMPILER & SYNTHESIS"),
    ("ast-generation", "AST Generation", "COMPILER & SYNTHESIS"),
    ("constraint-builder", "Constraint Builder", "COMPILER & SYNTHESIS"),
    ("design-graph", "Design Graph", "COMPILER & SYNTHESIS"),
    ("placement-engine", "Placement Engine", "COMPILER & SYNTHESIS"),
    ("routing-engine", "Routing Engine", "COMPILER & SYNTHESIS"),
    ("optimization-engine", "Optimization Engine", "COMPILER & SYNTHESIS"),
    ("heavy-hex", "Heavy Hex", "COMPILER & SYNTHESIS"),
    ("grid", "Grid", "COMPILER & SYNTHESIS"),
    ("kagome", "Kagome", "COMPILER & SYNTHESIS"),
    ("linear", "Linear", "COMPILER & SYNTHESIS"),
    ("star", "Star", "COMPILER & SYNTHESIS"),
    ("error-codes", "Error Codes", "COMPILER & SYNTHESIS"),
    ("validation-reports", "Validation Reports", "COMPILER & SYNTHESIS"),
    ("debugging-compilation", "Debugging Compilation", "COMPILER & SYNTHESIS"),

    # Four Domain DRC
    ("drc-introduction", "Introduction to DRC", "FOUR DOMAIN DRC"),
    ("spacing-rules", "Spacing Rules", "FOUR DOMAIN DRC"),
    ("overlap-detection", "Overlap Detection", "FOUR DOMAIN DRC"),
    ("collision-detection", "Collision Detection", "FOUR DOMAIN DRC"),
    ("frequency-planning", "Frequency Planning", "FOUR DOMAIN DRC"),
    ("frequency-collisions", "Frequency Collisions", "FOUR DOMAIN DRC"),
    ("frequency-separation", "Frequency Separation", "FOUR DOMAIN DRC"),
    ("manufacturing-constraints", "Manufacturing Constraints", "FOUR DOMAIN DRC"),
    ("foundry-rules", "Foundry Rules", "FOUR DOMAIN DRC"),
    ("layer-rules", "Layer Rules", "FOUR DOMAIN DRC"),
    ("graph-integrity", "Graph Integrity", "FOUR DOMAIN DRC"),
    ("missing-connections", "Missing Connections", "FOUR DOMAIN DRC"),
    ("invalid-couplings", "Invalid Couplings", "FOUR DOMAIN DRC"),
    ("severity-levels", "Severity Levels", "FOUR DOMAIN DRC"),
    ("resolution-suggestions", "Resolution Suggestions", "FOUR DOMAIN DRC"),
    ("validation-workflow", "Validation Workflow", "FOUR DOMAIN DRC"),

    # Physics & Simulation
    ("physics-introduction", "Introduction", "PHYSICS & SIMULATION"),
    ("analytical-models", "Analytical Models", "PHYSICS & SIMULATION"),
    ("physics-grounding-core", "Physics Grounding", "PHYSICS & SIMULATION"),
    ("parameter-extraction", "Parameter Extraction", "PHYSICS & SIMULATION"),
    ("integration-workflow", "Integration Workflow", "PHYSICS & SIMULATION"),
    ("code-generation", "Code Generation", "PHYSICS & SIMULATION"),
    ("layout-conversion", "Layout Conversion", "PHYSICS & SIMULATION"),
    ("electromagnetic-analysis", "Electromagnetic Analysis", "PHYSICS & SIMULATION"),
    ("simulation-setup", "Simulation Setup", "PHYSICS & SIMULATION"),
    ("result-processing", "Result Processing", "PHYSICS & SIMULATION"),
    ("frequency-analysis", "Frequency Analysis", "PHYSICS & SIMULATION"),
    ("coupling-analysis", "Coupling Analysis", "PHYSICS & SIMULATION"),
    ("noise-analysis", "Noise Analysis", "PHYSICS & SIMULATION"),
    ("coherence-analysis", "Coherence Analysis", "PHYSICS & SIMULATION"),
    ("frequency-charts", "Frequency Charts", "PHYSICS & SIMULATION"),
    ("coupling-graphs", "Coupling Graphs", "PHYSICS & SIMULATION"),
    ("noise-plots", "Noise Plots", "PHYSICS & SIMULATION"),

    # AI Design Assistant
    ("ai-introduction", "Introduction", "AI DESIGN ASSISTANT"),
    ("prompt-processing", "Prompt Processing", "AI DESIGN ASSISTANT"),
    ("design-understanding", "Design Understanding", "AI DESIGN ASSISTANT"),
    ("architecture-generation", "Architecture Generation", "AI DESIGN ASSISTANT"),
    ("rule-based-ai", "Rule-Based AI", "AI DESIGN ASSISTANT"),
    ("claude-integration", "Claude Integration (Optional)", "AI DESIGN ASSISTANT"),
    ("pytorch-intent-model", "PyTorch Intent Model (Optional)", "AI DESIGN ASSISTANT"),
    ("sqdmetal-knowledge", "SQDMetal Knowledge", "AI DESIGN ASSISTANT"),
    ("squadds-integration", "SQuADDS Integration", "AI DESIGN ASSISTANT"),
    ("constraint-understanding", "Constraint Understanding", "AI DESIGN ASSISTANT"),
    ("beginner-prompts", "Beginner Prompts", "AI DESIGN ASSISTANT"),
    ("design-prompts", "Design Prompts", "AI DESIGN ASSISTANT"),
    ("optimization-prompts", "Optimization Prompts", "AI DESIGN ASSISTANT"),
    ("routing-prompts", "Routing Prompts", "AI DESIGN ASSISTANT"),
    ("ai-workflow", "AI Workflow", "AI DESIGN ASSISTANT"),

    # API Reference
    ("authentication", "Authentication", "API REFERENCE"),
    ("create-project", "Create Project", "API REFERENCE"),
    ("update-project", "Update Project", "API REFERENCE"),
    ("delete-project", "Delete Project", "API REFERENCE"),
    ("compile-design", "Compile Design", "API REFERENCE"),
    ("generate-graph", "Generate Graph", "API REFERENCE"),
    ("validate-design", "Validate Design", "API REFERENCE"),
    ("run-analysis", "Run Analysis", "API REFERENCE"),
    ("frequency-study", "Frequency Study", "API REFERENCE"),
    ("coupling-study", "Coupling Study", "API REFERENCE"),
    ("export-json-api", "JSON Export", "API REFERENCE"),
    ("export-svg-api", "SVG Export", "API REFERENCE"),
    ("export-gdsii-api", "GDSII Export", "API REFERENCE"),
    ("export-dxf-api", "DXF Export", "API REFERENCE"),
    ("api-error-codes", "API Error Codes", "API REFERENCE"),

    # System Architecture
    ("architecture-overview", "Platform Overview", "SYSTEM ARCHITECTURE"),
    ("react-19", "React 19", "SYSTEM ARCHITECTURE"),
    ("typescript", "TypeScript", "SYSTEM ARCHITECTURE"),
    ("vite", "Vite", "SYSTEM ARCHITECTURE"),
    ("tanstack-start", "TanStack Start", "SYSTEM ARCHITECTURE"),
    ("tanstack-router", "TanStack Router", "SYSTEM ARCHITECTURE"),
    ("tanstack-query", "TanStack Query", "SYSTEM ARCHITECTURE"),
    ("tailwind-css-v4", "Tailwind CSS v4", "SYSTEM ARCHITECTURE"),
    ("radix-ui", "Radix UI", "SYSTEM ARCHITECTURE"),
    ("react-flow", "React Flow", "SYSTEM ARCHITECTURE"),
    ("recharts", "Recharts", "SYSTEM ARCHITECTURE"),
    ("monaco-editor", "Monaco Editor", "SYSTEM ARCHITECTURE"),
    ("fastapi", "FastAPI", "SYSTEM ARCHITECTURE"),
    ("uvicorn", "Uvicorn", "SYSTEM ARCHITECTURE"),
    ("pydantic", "Pydantic", "SYSTEM ARCHITECTURE"),
    ("sqlalchemy", "SQLAlchemy", "SYSTEM ARCHITECTURE"),
    ("alembic", "Alembic", "SYSTEM ARCHITECTURE"),
    ("jwt-authentication", "JWT Authentication", "SYSTEM ARCHITECTURE"),
    ("rest-apis", "REST APIs", "SYSTEM ARCHITECTURE"),
    ("sqlite", "SQLite", "SYSTEM ARCHITECTURE"),
    ("postgresql", "PostgreSQL", "SYSTEM ARCHITECTURE"),
    ("redis", "Redis", "SYSTEM ARCHITECTURE"),
    ("docker", "Docker", "SYSTEM ARCHITECTURE"),
    ("docker-compose", "Docker Compose", "SYSTEM ARCHITECTURE"),
    ("production-setup", "Production Setup", "SYSTEM ARCHITECTURE"),

    # Interactive Tools
    ("qclang-playground", "QCLang Playground", "INTERACTIVE TOOLS"),
    ("quantum-chip-viewer", "Quantum Chip Viewer", "INTERACTIVE TOOLS"),
    ("topology-explorer", "Topology Explorer", "INTERACTIVE TOOLS"),
    ("compiler-pipeline-viewer", "Compiler Pipeline Viewer", "INTERACTIVE TOOLS"),
    ("drc-visualizer", "DRC Visualizer", "INTERACTIVE TOOLS"),
    ("architecture-explorer", "Architecture Explorer", "INTERACTIVE TOOLS"),
    ("api-explorer", "API Explorer", "INTERACTIVE TOOLS"),

    # Deployment
    ("local-development", "Local Development", "DEPLOYMENT"),
    ("docker-installation", "Docker Installation", "DEPLOYMENT"),
    ("docker-compose-deploy", "Docker Compose", "DEPLOYMENT"),
    ("database-configuration", "Database Configuration", "DEPLOYMENT"),
    ("environment-variables", "Environment Variables", "DEPLOYMENT"),
    ("production-configuration", "Production Configuration", "DEPLOYMENT"),
    ("security-configuration", "Security Configuration", "DEPLOYMENT"),
    ("monitoring", "Monitoring", "DEPLOYMENT"),

    # Release Notes
    ("latest-release", "Latest Release", "RELEASE NOTES"),
    ("new-features", "New Features", "RELEASE NOTES"),
    ("improvements", "Improvements", "RELEASE NOTES"),
    ("bug-fixes", "Bug Fixes", "RELEASE NOTES"),
    ("migration-guides", "Migration Guides", "RELEASE NOTES"),
    ("version-history", "Version History", "RELEASE NOTES"),

    # Support
    ("faq", "FAQ", "SUPPORT"),
    ("common-errors", "Common Errors", "SUPPORT"),
    ("troubleshooting", "Troubleshooting", "SUPPORT"),
    ("best-practices", "Best Practices", "SUPPORT"),
    ("community-resources", "Community Resources", "SUPPORT"),
    ("contact-support", "Contact Support", "SUPPORT"),
]

search_items = []
for id, title, domain in SECTIONS:
    text = f"This page provides an in-depth look at {title} within the {domain} domain. Silicofeller Quantum Studio is engineered from the ground up to handle complex quantum processor design tasks."
    search_items.append(f"""  {{
    id: "{id}",
    title: "{title}",
    text: "{text}",
  }}""")

file_content = "import { SearchItem } from \"./search-assistant-modal\";\n\nexport const SEARCH_ITEMS: SearchItem[] = [\n" + ",\n".join(search_items) + "\n];\n"

with open(os.path.join(TARGET_DIR, "sections-data.tsx"), "w", encoding="utf-8") as f:
    f.write(file_content)

print("Created sections-data.tsx")
