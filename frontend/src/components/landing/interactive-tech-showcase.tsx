import React, { useState } from "react";
import {
  Cpu,
  MessageSquare,
  Download,
  ArrowRight,
  Zap,
  CheckCircle2,
  Terminal,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface Annotation {
  label: string;
  desc: string;
  short: string;
  x: number; // percentage from left
  y: number; // percentage from top
  tooltipPos: "top" | "bottom" | "left" | "right";
}

interface TabData {
  id: string;
  label: string;
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  docsUrl: string;
  icon: React.ComponentType<any>;
  annotations: Annotation[];
}

const TABS: TabData[] = [
  {
    id: "schematic",
    label: "Schematic Editor",
    eyebrow: "Interactive Layout Canvas",
    title: "Drag-and-drop quantum layout",
    description:
      "Compose transmons, couplers, and resonators on a live canvas with a synced Qiskit Metal IDE. Layout geometries compile instantly to code.",
    image: "/tech/schematic-editor.png",
    docsUrl: "/docs/schematic-editor",
    icon: Cpu,
    annotations: [
      {
        label: "Drag-drop component palette",
        desc: "Access a pre-configured library of superconducting qubits, couplers, and transmission lines.",
        short: "Pre-configured transmon, coupler, and readout launchpad elements.",
        x: 8,
        y: 35,
        tooltipPos: "right",
      },
      {
        label: "Live canvas",
        desc: "View the physical layer layout in real-time with drag-and-drop node snapping.",
        short: "Interactive layout editor showing qubit and coupler physical placements.",
        x: 50,
        y: 50,
        tooltipPos: "top",
      },
      {
        label: "Qiskit sync",
        desc: "Direct sync compiles layout geometries directly into standard Qiskit Metal Python code.",
        short: "Generates python scripts automatically compiled to Qiskit Metal geometries.",
        x: 88,
        y: 65,
        tooltipPos: "left",
      },
    ],
  },
  {
    id: "chatbot",
    label: "AI Chatbot",
    eyebrow: "AI-Powered Co-Designer",
    title: "Natural-language chip synthesis",
    description:
      "Prompt the AI to synthesize full QPUs — qubit topologies, resonant frequencies, and design rule checks are generated and validated in seconds.",
    image: "/tech/chatbot.png",
    docsUrl: "/docs/chatbot",
    icon: MessageSquare,
    annotations: [
      {
        label: "Natural language input",
        desc: "Instruct the assistant in plain English to build or modify layouts (e.g., 'add a transmon').",
        short: "Type design queries in plain English to alter layout parameters.",
        x: 18,
        y: 82,
        tooltipPos: "top",
      },
      {
        label: "Generated QPU topology",
        desc: "Instantly visualize generated transmon qubits and coupling resonators on the interactive screen.",
        short: "Real-time graphic visualization of transmons and bus resonators.",
        x: 58,
        y: 48,
        tooltipPos: "top",
      },
      {
        label: "DRC rules",
        desc: "Real-time design rule checking flags crossing lines or invalid component spacing constraints.",
        short: "Continuous verification flagging component overlap or spacing warnings.",
        x: 88,
        y: 22,
        tooltipPos: "left",
      },
    ],
  },
  {
    id: "export",
    label: "Export & Reports",
    eyebrow: "Fabrication Hand-off",
    title: "Tapeout-ready packages",
    description:
      "Design summaries, frequency plans, DRC reports, and Qiskit Metal code packages. Prepared automatically and compiled for foundry hand-off.",
    image: "/tech/export-reports.png",
    docsUrl: "/docs/export-reports",
    icon: Download,
    annotations: [
      {
        label: "Design summary",
        desc: "Review global metrics including total qubits, coupler properties, and total chip footprint size.",
        short: "Table listing chip dimensions, total qubit count, and coupling layers.",
        x: 22,
        y: 32,
        tooltipPos: "right",
      },
      {
        label: "Frequency plans",
        desc: "Analyze simulated qubit and readout frequencies to avoid frequency crowding and crosstalk.",
        short: "Plot showing qubit anharmonicities and readout resonator spacings.",
        x: 62,
        y: 55,
        tooltipPos: "top",
      },
      {
        label: "Tapeout package",
        desc: "One-click download of GDSII files, design rule check logs, and simulation scripts.",
        short: "One-click download of GDSII files, parameters, and simulation logs.",
        x: 86,
        y: 25,
        tooltipPos: "left",
      },
    ],
  },
];

export function InteractiveTechShowcase() {
  const [activeTabIdx, setActiveTabIdx] = useState(0);
  const [activeAnnIdx, setActiveAnnIdx] = useState<number | null>(null);

  const activeTab = TABS[activeTabIdx];

  return (
    <div className="mt-8 select-none">
      {/* ── DESKTOP TABS SELECTOR (Hidden on Mobile) ── */}
      <div className="hidden md:flex items-center gap-2 mb-8 border-b border-black/10 pb-4">
        {TABS.map((tab, idx) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTabIdx(idx);
                setActiveAnnIdx(null);
              }}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-full border transition-all duration-200 cursor-pointer ${
                activeTabIdx === idx
                  ? "bg-[#7C3AED] text-white border-[#7C3AED]"
                  : "bg-white text-foreground/70 border-black/10 hover:border-black/25 hover:bg-neutral-50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── DESKTOP INTERACTIVE SCREEN (Hidden on Mobile) ── */}
      <div className="hidden md:grid grid-cols-[1.1fr_2fr] gap-8 items-start">
        {/* Left Side: Information & Feature List */}
        <div className="flex flex-col gap-6 h-full justify-between py-2">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7C3AED]">
              {activeTab.eyebrow}
            </span>
            <h3 className="mt-2 text-2xl font-bold text-foreground">{activeTab.title}</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
              {activeTab.description}
            </p>

            {/* Link-checked Annotations List */}
            <div className="mt-6 flex flex-col gap-3">
              {activeTab.annotations.map((ann, idx) => (
                <div
                  key={idx}
                  onMouseEnter={() => setActiveAnnIdx(idx)}
                  onMouseLeave={() => setActiveAnnIdx(null)}
                  className={`p-4 border transition-all duration-200 rounded-xl cursor-pointer ${
                    activeAnnIdx === idx
                      ? "border-[#7C3AED] bg-[#7C3AED]/5"
                      : "border-black/10 bg-white hover:border-black/20"
                  }`}
                >
                  <div className="flex gap-3 items-start">
                    <span
                      className={`flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full font-mono text-xs font-bold transition-all duration-200 ${
                        activeAnnIdx === idx
                          ? "bg-[#7C3AED] text-white"
                          : "bg-neutral-100 text-neutral-600 border border-neutral-200"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div>
                      <h4 className="font-semibold text-sm text-foreground">{ann.label}</h4>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        {ann.desc}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>


        </div>

        {/* Right Side: High-Resolution Screenshot with Dot Overlays */}
        <div className="relative border border-black/15 rounded-2xl bg-white overflow-hidden aspect-[16/10]">
          <img
            src={activeTab.image}
            alt={activeTab.title}
            className="w-full h-full object-cover object-left-top"
          />

          {/* Annotation Coordinates Overlays */}
          {activeTab.annotations.map((ann, idx) => {
            const isActive = activeAnnIdx === idx;

            // Positioning class for Tooltip
            let tooltipClass = "";
            switch (ann.tooltipPos) {
              case "right":
                tooltipClass = "left-10 top-1/2 -translate-y-1/2";
                break;
              case "left":
                tooltipClass = "right-10 top-1/2 -translate-y-1/2";
                break;
              case "top":
                tooltipClass = "bottom-10 left-1/2 -translate-x-1/2";
                break;
              case "bottom":
                tooltipClass = "top-10 left-1/2 -translate-x-1/2";
                break;
            }

            return (
              <div
                key={idx}
                className="absolute transition-transform duration-200"
                style={{ left: `${ann.x}%`, top: `${ann.y}%` }}
              >
                {/* Connector Dot */}
                <button
                  onMouseEnter={() => setActiveAnnIdx(idx)}
                  onMouseLeave={() => setActiveAnnIdx(null)}
                  className={`flex items-center justify-center w-7 h-7 rounded-full font-mono text-xs font-bold transition-all duration-200 cursor-pointer ${
                    isActive
                      ? "bg-[#7C3AED] text-white ring-4 ring-[#7C3AED]/25 scale-110 z-30"
                      : "bg-white text-[#7C3AED] border-2 border-[#7C3AED] scale-100 z-20 hover:scale-105"
                  }`}
                  aria-label={`Highlight feature ${idx + 1}`}
                >
                  {idx + 1}
                </button>

                {/* Annotation Detail Tooltip */}
                <div
                  className={`absolute w-48 bg-white border border-black/15 p-2.5 rounded-lg pointer-events-none transition-all duration-200 z-40 ${
                    isActive
                      ? "opacity-100 translate-y-0 scale-100"
                      : "opacity-0 translate-y-1 scale-95"
                  } ${tooltipClass}`}
                >
                  <p className="font-semibold text-[11px] text-foreground uppercase tracking-wider mb-0.5 text-[#7C3AED]">
                    0{idx + 1}. {ann.label}
                  </p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground font-normal">
                    {ann.short}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── MOBILE SCROLLING PREVIEW (Hidden on Desktop) ── */}
      <div className="md:hidden flex flex-col gap-16">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <div key={tab.id} className="flex flex-col gap-4">
              <div>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7C3AED]">
                  <Icon className="w-3.5 h-3.5" /> {tab.eyebrow}
                </span>
                <h3 className="mt-1 text-xl font-bold text-foreground">{tab.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {tab.description}
                </p>
              </div>

              {/* Mobile Image Container */}
              <div className="relative border border-black/15 rounded-xl bg-white overflow-hidden aspect-[16/10]">
                <img
                  src={tab.image}
                  alt={tab.title}
                  className="w-full h-full object-cover object-left-top"
                />

                {/* Overlaid numeric indicators on mobile */}
                {tab.annotations.map((ann, idx) => (
                  <div
                    key={idx}
                    className="absolute flex items-center justify-center w-6 h-6 rounded-full font-mono text-[10px] font-bold bg-[#7C3AED] text-white border border-white z-20"
                    style={{ left: `${ann.x}%`, top: `${ann.y}%` }}
                  >
                    {idx + 1}
                  </div>
                ))}
              </div>

              {/* Mobile Card Key Checklist */}
              <div className="flex flex-col gap-2">
                {tab.annotations.map((ann, idx) => (
                  <div
                    key={idx}
                    className="flex gap-3 p-3 border border-black/10 rounded-xl bg-white"
                  >
                    <span className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full bg-[#7C3AED] text-white font-mono text-[11px] font-bold">
                      {idx + 1}
                    </span>
                    <div>
                      <h4 className="font-semibold text-xs text-foreground">{ann.label}</h4>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        {ann.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>


            </div>
          );
        })}
      </div>
    </div>
  );
}
