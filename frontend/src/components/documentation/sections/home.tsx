import React, { useState } from "react";
import { ChevronRight, Play, ArrowRight, Compass, Search } from "lucide-react";
import { NAVIGATION_DATA, NavGroup, NavItem } from "../sections-data";

export default function HomeLanding() {
  const [searchTerm, setSearchTerm] = useState("");

  const handleNav = (id: string) => {
    window.dispatchEvent(new CustomEvent("change-doc-section", { detail: id }));
  };

  return (
    <div className="landing-page flex flex-col gap-16 pb-12">
      {/* Landing Hero */}
      <section className="hero flex flex-col xl:flex-row gap-12 items-center bg-slate-50 border border-slate-200 rounded-2xl p-8 lg:p-12 shadow-sm">
        <div className="flex-1 max-w-2xl">
          <div className="flex items-center gap-2 text-indigo-600 font-medium mb-6 text-sm">
            <span>Documentation</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-slate-500">Home</span>
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold text-slate-900 leading-tight mb-6 tracking-tight">
            Build superconducting quantum processors with confidence
          </h1>
          <p className="text-lg text-slate-600 mb-8 leading-relaxed">
            Silicofeller Quantum Studio provides a constraint-driven path from abstract topologies to fabrication-ready GDSII layouts. Explore the guides below to master the design, validation, and physics analysis pipelines.
          </p>
          <div className="flex flex-wrap gap-4">
            <button 
              onClick={() => handleNav("5-qubit-design")}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              Start with your first design
            </button>
            <button 
              onClick={() => handleNav("understand-pipeline")}
              className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold py-3 px-6 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
            >
              <Compass className="w-4 h-4" />
              Explore the design workflow
            </button>
          </div>
        </div>
        <div className="flex-1 w-full max-w-xl">
          <img 
            src="/assets/screens/design-copilot-overview.webp" 
            alt="Design Copilot showing a generated topology and material controls" 
            className="w-full h-auto rounded-xl shadow-lg border border-slate-200 object-cover aspect-[16/9]"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" fill="%23f1f5f9"><rect width="100%" height="100%"/><text x="50%" y="50%" fill="%2394a3b8" font-family="sans-serif" font-size="24" text-anchor="middle">Screenshot Placeholder (Design Copilot)</text></svg>';
            }}
          />
        </div>
      </section>

      {/* Start-here Strip */}
      <section>
        <h2 className="text-2xl font-bold text-slate-900 mb-6">Quick Start</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div 
            onClick={() => handleNav("5-qubit-design")}
            className="cursor-pointer group border border-slate-200 rounded-xl p-6 bg-white hover:border-indigo-300 hover:shadow-md transition-all relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 bg-indigo-50 text-indigo-700 font-bold text-xl px-4 py-2 rounded-bl-xl border-b border-l border-indigo-100">1</div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Generate a design</h3>
            <p className="text-slate-600 text-sm mb-4">Prompt the Copilot to create a topology.</p>
            <img src="/assets/screens/design-copilot-overview.webp" alt="Generate design" className="w-full h-24 object-cover rounded border border-slate-100 mb-4 opacity-80 group-hover:opacity-100 transition-opacity" 
              onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="150" fill="%23f1f5f9"><rect width="100%" height="100%"/></svg>'; }}
            />
            <span className="text-indigo-600 font-medium text-sm flex items-center gap-1 group-hover:underline">
              View guide <ArrowRight className="w-4 h-4" />
            </span>
          </div>
          
          <div 
            onClick={() => handleNav("schematic-editor")}
            className="cursor-pointer group border border-slate-200 rounded-xl p-6 bg-white hover:border-indigo-300 hover:shadow-md transition-all relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 bg-indigo-50 text-indigo-700 font-bold text-xl px-4 py-2 rounded-bl-xl border-b border-l border-indigo-100">2</div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Edit its schematic</h3>
            <p className="text-slate-600 text-sm mb-4">Place components and connect pins.</p>
            <img src="/assets/screens/schematic-editor-overview.webp" alt="Edit schematic" className="w-full h-24 object-cover rounded border border-slate-100 mb-4 opacity-80 group-hover:opacity-100 transition-opacity" 
              onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="150" fill="%23f1f5f9"><rect width="100%" height="100%"/></svg>'; }}
            />
            <span className="text-indigo-600 font-medium text-sm flex items-center gap-1 group-hover:underline">
              View guide <ArrowRight className="w-4 h-4" />
            </span>
          </div>

          <div 
            onClick={() => handleNav("four-domain-drc")}
            className="cursor-pointer group border border-slate-200 rounded-xl p-6 bg-white hover:border-indigo-300 hover:shadow-md transition-all relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 bg-indigo-50 text-indigo-700 font-bold text-xl px-4 py-2 rounded-bl-xl border-b border-l border-indigo-100">3</div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Validate and export</h3>
            <p className="text-slate-600 text-sm mb-4">Run 4-domain DRC and export outputs.</p>
            <img src="/assets/screens/design-validation.webp" alt="Validate design" className="w-full h-24 object-cover rounded border border-slate-100 mb-4 opacity-80 group-hover:opacity-100 transition-opacity" 
              onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="150" fill="%23f1f5f9"><rect width="100%" height="100%"/></svg>'; }}
            />
            <span className="text-indigo-600 font-medium text-sm flex items-center gap-1 group-hover:underline">
              View guide <ArrowRight className="w-4 h-4" />
            </span>
          </div>
        </div>
      </section>

      {/* Guide Directory */}
      <section>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <h2 className="text-2xl font-bold text-slate-900">Guide Directory</h2>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Filter guides..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white shadow-sm"
            />
          </div>
        </div>

        <div className="flex flex-col gap-12">
          {NAVIGATION_DATA.map((category: NavGroup, idx: number) => {
            const filteredItems = category.items.filter((item: NavItem) => 
              item.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
              (item.outcome && item.outcome.toLowerCase().includes(searchTerm.toLowerCase()))
            );

            if (filteredItems.length === 0) return null;

            return (
              <div key={idx} className="category-block">
                <h3 className="text-xl font-bold text-slate-800 mb-6 border-b border-slate-200 pb-2">{category.title}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredItems.map((item: NavItem) => (
                    <div 
                      key={item.id} 
                      onClick={() => handleNav(item.id)}
                      className="cursor-pointer group flex flex-col border border-slate-200 rounded-xl bg-white hover:border-indigo-300 hover:shadow-md transition-all overflow-hidden"
                    >
                      {item.image && (
                        <div className="w-full h-32 bg-slate-100 border-b border-slate-200 overflow-hidden">
                          <img src={item.image} alt={item.label} className="w-full h-full object-cover opacity-90 group-hover:opacity-100 group-hover:scale-105 transition-all duration-300" 
                            onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="150" fill="%23f1f5f9"><rect width="100%" height="100%"/></svg>'; }}
                          />
                        </div>
                      )}
                      <div className="p-5 flex-1 flex flex-col">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h4 className="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">{item.label}</h4>
                          <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded ${
                            item.level === 'Beginner' ? 'bg-emerald-100 text-emerald-800' :
                            item.level === 'Intermediate' ? 'bg-amber-100 text-amber-800' :
                            'bg-rose-100 text-rose-800'
                          }`}>
                            {item.level || "Beginner"}
                          </span>
                        </div>
                        <p className="text-slate-600 text-sm mb-4 flex-1">
                          {item.outcome || `Learn how to ${item.label.toLowerCase()} in Quantum Studio.`}
                        </p>
                        <div className="flex items-center justify-between text-xs font-medium mt-auto">
                          <span className="text-slate-500">{item.time} read</span>
                          <span className="text-indigo-600 flex items-center gap-1 group-hover:underline">
                            Read guide <ArrowRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
