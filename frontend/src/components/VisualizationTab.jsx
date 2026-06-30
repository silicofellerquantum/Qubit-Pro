import React, { useState } from "react";
import EFieldVisualization from "@/components/visualization/EFieldVisualization";
import EnergyDensityVisualization from "@/components/visualization/EnergyDensityVisualization";
import MeshVisualization from "@/components/MeshVisualization";
import ResultsTable from "@/components/visualization/ResultsTable";
import { Zap, Flame, Grid, LayoutDashboard } from "lucide-react";

/**
 * VisualizationTab Component
 * Coordinates the full Palace solver visualization workspace.
 * Integrates:
 * - EFieldVisualization (Electric Field magnitudes)
 * - EnergyDensityVisualization (U_m Magnetic Energy Density)
 * - MeshVisualization (Gray Tetrahedral wireframe)
 * - ResultsTable (Resonant frequencies & Q-factors)
 */
export default function VisualizationTab({ simId }) {
  const [activeTab, setActiveTab] = useState("efield"); // "efield", "energy", "mesh"
  const [selectedMode, setSelectedMode] = useState(1);

  return (
    <div className="w-full h-full min-h-[820px] flex flex-col lg:flex-row bg-[#080814] text-white p-4 gap-4 overflow-y-auto">
      {/* 3D Viewer Area */}
      <div className="flex-1 flex flex-col gap-3 min-h-[750px]">
        {/* Navigation Tabs */}
        <div className="flex justify-between items-center bg-[#111124] border border-slate-800 p-1.5 rounded-xl">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab("efield")}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "efield"
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>Electric Field</span>
            </button>
            <button
              onClick={() => setActiveTab("energy")}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "energy"
                  ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              <Flame className="w-4 h-4" />
              <span>Energy Density</span>
            </button>
            <button
              onClick={() => setActiveTab("mesh")}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "mesh"
                  ? "bg-slate-800 text-slate-200 border border-slate-700"
                  : "text-slate-400 hover:text-slate-200 border border-transparent"
              }`}
            >
              <Grid className="w-4 h-4" />
              <span>Volume Mesh</span>
            </button>
          </div>
          
          <div className="flex items-center space-x-2 text-[10px] text-slate-500 pr-2 font-mono">
            <LayoutDashboard className="w-3.5 h-3.5" />
            <span>Interactive Viewer</span>
          </div>
        </div>

        {/* Dynamic 3D Viewer Rendering */}
        <div className="flex-1 min-h-[720px] relative">
          {activeTab === "efield" && (
            <EFieldVisualization simId={simId} mode={selectedMode} />
          )}
          {activeTab === "energy" && (
            <EnergyDensityVisualization simId={simId} mode={selectedMode} />
          )}
          {activeTab === "mesh" && (
            <MeshVisualization simId={simId} />
          )}
        </div>
      </div>

      {/* Metrics Table Sidebar */}
      <div className="w-full lg:w-[380px] shrink-0">
        <ResultsTable
          simId={simId}
          selectedMode={selectedMode}
          onSelectMode={setSelectedMode}
        />
      </div>
    </div>
  );
}
