import React from "react";
import { DocumentationSection } from "../DocumentationSection";
import { Terminal, Lightbulb, AlertTriangle, CheckCircle, HelpCircle, ArrowRight } from "lucide-react";

export default function FirstDesignGuide() {
  const handleNav = (id: string) => {
    window.dispatchEvent(new CustomEvent("change-doc-section", { detail: id }));
  };

  return (
    <DocumentationSection id="5-qubit-design">
      <div className="prose prose-slate max-w-none">
        <div className="mb-10">
          <h1 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">Generate a 5-qubit design</h1>
          <p className="text-xl text-slate-600 leading-relaxed">
            Learn how to use the Design Copilot to automatically generate a functional 5-qubit superconducting processor topology using natural language.
          </p>
        </div>

        <h2 id="overview" className="text-2xl font-bold text-slate-900 mt-12 mb-4 scroll-mt-24 border-b border-slate-200 pb-2">Overview</h2>
        <p className="text-slate-600 mb-6">
          The Design Copilot is an AI-assisted engine that translates high-level natural language requirements into strict quantum chip architectures. Instead of placing qubits and routing feedlines manually, you describe your target parameters, and the Copilot generates a fully-connected QCLang abstract syntax tree.
        </p>

        <h2 id="what-you-will-produce" className="text-2xl font-bold text-slate-900 mt-12 mb-4 scroll-mt-24 border-b border-slate-200 pb-2">What you will produce</h2>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-8 flex items-start gap-4">
          <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg shrink-0">
            <CheckCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 mb-2">Expected Outcomes</h3>
            <ul className="list-disc pl-5 text-slate-600 space-y-2">
              <li>A star-topology 5-qubit quantum processor design.</li>
              <li>A collision-free frequency plan across all qubits and resonators.</li>
              <li>A compiled, DRC-clean layout ready for physical inspection.</li>
              <li>Raw QCLang representation of your design constraints.</li>
            </ul>
          </div>
        </div>

        <h2 id="prerequisites" className="text-2xl font-bold text-slate-900 mt-12 mb-4 scroll-mt-24 border-b border-slate-200 pb-2">Prerequisites</h2>
        <ul className="list-disc pl-5 text-slate-600 mb-8 space-y-2">
          <li>You have completed the <a onClick={() => handleNav("create-first-project")} className="text-indigo-600 hover:underline cursor-pointer">Create your first project</a> guide.</li>
          <li>The Silicofeller Quantum Studio API backend is running locally or configured correctly.</li>
          <li>You have basic familiarity with cross-resonance gate layouts (optional, but helpful for reviewing the results).</li>
        </ul>

        <h2 id="steps" className="text-2xl font-bold text-slate-900 mt-12 mb-4 scroll-mt-24 border-b border-slate-200 pb-2">Steps</h2>
        
        <div className="space-y-8 mb-12">
          {/* Step 1 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">1</div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Open the Design Copilot</h3>
              <p className="text-slate-600">
                From your project dashboard, click the <strong>"New Design"</strong> button and select <strong>"Generate with AI Copilot"</strong> from the dropdown menu. This will open the interactive prompt interface.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">2</div>
            <div className="w-full">
              <h3 className="text-lg font-bold text-slate-900 mb-2">Enter the architectural prompt</h3>
              <p className="text-slate-600 mb-4">
                Paste the following sample prompt into the text area. You can tweak parameters such as frequencies or the central qubit index to see how the Copilot reacts.
              </p>
              
              <div className="bg-slate-900 rounded-xl p-4 mb-4 relative overflow-hidden group">
                <div className="absolute top-0 right-0 bg-slate-800 text-slate-400 text-xs px-3 py-1 rounded-bl-lg font-mono">prompt</div>
                <div className="flex items-center gap-3 text-slate-300 font-mono text-sm leading-relaxed">
                  <Terminal className="w-4 h-4 shrink-0 text-indigo-400" />
                  <span>
                    "Design a 5-qubit quantum processor in a star topology. 
                    Place Qubit 3 at the center, connected to Qubits 0, 1, 2, and 4. 
                    Ensure the central qubit frequency is exactly 5.0 GHz. 
                    Generate individual readout resonators for each qubit."
                  </span>
                </div>
              </div>

              <div className="mt-6 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  Interface: Design Copilot View
                </div>
                <img 
                  src="/assets/screens/design-copilot-overview.webp" 
                  alt="Design Copilot showing the submitted prompt and processing status" 
                  className="w-full object-cover bg-white"
                  onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" fill="%23f8fafc"><rect width="100%" height="100%"/><text x="50%" y="50%" fill="%2394a3b8" font-family="sans-serif" font-size="16" text-anchor="middle">Copilot processing prompt...</text></svg>'; }}
                />
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">3</div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Review Material Selections</h3>
              <p className="text-slate-600">
                While the prompt is processing, ensure your base materials are set. By default, the Copilot assumes a <strong>Silicon (Si) substrate</strong> with <strong>Niobium (Nb) metalization</strong>. You can change these using the right-hand Configuration panel.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">4</div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Generate and Compile</h3>
              <p className="text-slate-600">
                Click <strong>"Generate Architecture"</strong>. The backend will parse the intent, map the topology, allocate frequencies to avoid cross-talk collisions, and compile the abstract constraints into a physical layout.
              </p>
            </div>
          </div>

          {/* Step 5 */}
          <div className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">5</div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Inspect the Output Tabs</h3>
              <p className="text-slate-600">
                Once compilation completes, the editor will unlock multiple result areas. Navigate through the tabs to review the generated artifacts.
              </p>
            </div>
          </div>
        </div>

        <h2 id="results" className="text-2xl font-bold text-slate-900 mt-12 mb-4 scroll-mt-24 border-b border-slate-200 pb-2">Understanding Result Areas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="border border-slate-200 rounded-xl p-5 bg-white">
            <h4 className="font-bold text-slate-900 mb-2">1. Topology Graph</h4>
            <p className="text-sm text-slate-600">A logical network graph showing Q3 at the center, ensuring the exact connectivity requested.</p>
          </div>
          <div className="border border-slate-200 rounded-xl p-5 bg-white">
            <h4 className="font-bold text-slate-900 mb-2">2. Frequency Plan</h4>
            <p className="text-sm text-slate-600">A spectrum distribution confirming Q3 is pinned to 5.0 GHz, and adjacent qubits are detuned by at least 150 MHz.</p>
          </div>
          <div className="border border-slate-200 rounded-xl p-5 bg-white">
            <h4 className="font-bold text-slate-900 mb-2">3. Physical Placement</h4>
            <p className="text-sm text-slate-600">The 2D spatial arrangement of the qubits and the meander lengths of the readout resonators.</p>
          </div>
          <div className="border border-slate-200 rounded-xl p-5 bg-white">
            <h4 className="font-bold text-slate-900 mb-2">4. DRC & QCLang</h4>
            <p className="text-sm text-slate-600">Preliminary 4-domain DRC check results, alongside the raw QCLang constraints compiled by the AI model.</p>
          </div>
        </div>

        {/* Warning Note */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-10 flex items-start gap-4">
          <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-3">
            <div>
              <h4 className="font-bold text-amber-900 mb-1">Fabrication Warning</h4>
              <p className="text-amber-800 text-sm">
                The AI-generated layout is an excellent starting point, but <strong>do not assume generated outputs are fabrication-ready without formal foundry review</strong>. Always pass the generated layout through the Schematic Editor to manually verify critical coupling geometries and run final electromagnetic simulations.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-amber-900 mb-1">Physics Estimates</h4>
              <p className="text-amber-800 text-sm">
                Any analytical physics values provided (such as T1, T2, or gate fidelities) are strictly <strong>estimates</strong> based on heuristic models, not measured hardware performance.
              </p>
            </div>
          </div>
        </div>

        <h2 id="troubleshooting" className="text-2xl font-bold text-slate-900 mt-12 mb-4 scroll-mt-24 border-b border-slate-200 pb-2">Troubleshooting</h2>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-12">
          <div className="flex items-start gap-3 mb-4">
            <HelpCircle className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-slate-900">Backend unavailable or offline?</h4>
              <p className="text-slate-600 text-sm mt-1 mb-3">
                If the Copilot spins indefinitely or throws a network error, the Python API backend might not be running.
              </p>
              <div className="bg-slate-900 text-slate-300 font-mono text-sm px-4 py-3 rounded-lg overflow-x-auto">
                $ cd backend<br/>
                $ poetry run uvicorn api.main:app --reload --port 8000
              </div>
            </div>
          </div>
          <div className="flex items-start gap-3 pt-4 border-t border-slate-200">
            <Lightbulb className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-slate-900">No layout generated?</h4>
              <p className="text-slate-600 text-sm mt-1">
                If the topology renders but the physical layout fails, the routing engine may have encountered an impossible constraint. Try lowering the number of qubits or selecting an alternate layout algorithm in the Advanced Settings tab.
              </p>
            </div>
          </div>
        </div>

        <h2 id="next-steps" className="text-2xl font-bold text-slate-900 mt-12 mb-4 scroll-mt-24 border-b border-slate-200 pb-2">Next Steps & Related Links</h2>
        <p className="text-slate-600 mb-6">Now that you have a generated design, you can refine it, validate it, or export it.</p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a onClick={() => handleNav("schematic-editor")} className="cursor-pointer group flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all bg-white">
            <div className="flex flex-col">
              <span className="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">Schematic Editor</span>
              <span className="text-sm text-slate-500">Fine-tune component placements</span>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
          </a>
          <a onClick={() => handleNav("four-domain-drc")} className="cursor-pointer group flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all bg-white">
            <div className="flex flex-col">
              <span className="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">Four-domain DRC</span>
              <span className="text-sm text-slate-500">Run strict validation checks</span>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
          </a>
          <a onClick={() => handleNav("run-physics")} className="cursor-pointer group flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all bg-white">
            <div className="flex flex-col">
              <span className="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">Physics Analysis</span>
              <span className="text-sm text-slate-500">Simulate electromagnetic behavior</span>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
          </a>
          <a onClick={() => handleNav("export-design")} className="cursor-pointer group flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition-all bg-white">
            <div className="flex flex-col">
              <span className="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">Export Designs</span>
              <span className="text-sm text-slate-500">Generate GDSII, DXF, or Qiskit code</span>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition-colors" />
          </a>
        </div>
      </div>
    </DocumentationSection>
  );
}
