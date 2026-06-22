/**
 * designer-panels.tsx
 *
 * Result-display components extracted from designer.tsx to reduce its size.
 * Owned by Team B (AI Copilot / Design UX).
 *
 * Exports:
 *   ChipView            — physical CAD card + layer toggles + diagnostics
 *   InteractiveCADCanvas — canvas renderer with pan/zoom/fullscreen
 *   FreqPlanView        — spectrum analyzer + frequency tables
 *   CodeView            — Qiskit Metal Python code viewer
 */

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Layers,
  Activity,
  AlertTriangle,
  Zap,
  Copy,
  Download,
  Check,
  Plus,
  Minus,
  Maximize2,
  Minimize2,
  RefreshCcw,
} from "lucide-react";
import type { GenerateResponse, PlacementQubit } from "@/lib/api/backend";

// ─────────────────────────────────────────────────────────────────────────────
// ChipView
// ─────────────────────────────────────────────────────────────────────────────

export function ChipView({ result }: { result: GenerateResponse }) {
  const [layers, setLayers] = useState({
    pockets: true,
    meanders: true,
    grid: true,
    labels: true,
  });

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header card */}
      <Card className="rounded-2xl border-slate-200/70 p-5 shadow-sm bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">
              Silicon Physical CAD
            </p>
            <h3 className="text-base font-black text-slate-900 leading-tight">{result.label}</h3>
            {result.interpretation && (
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed max-w-sm">
                {result.interpretation}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-[10px] font-black text-accent bg-accent/10 border border-accent/20 rounded-full px-3 py-1">
              {result.topology} · {result.num_qubits} Qubits
            </span>
            <span className="text-[9px] font-bold text-slate-400">{result.engine}</span>
          </div>
        </div>

        {/* CAD Canvas */}
        <div className="rounded-2xl border border-slate-200/60 bg-slate-50 overflow-hidden h-[300px] flex items-center justify-center relative shadow-inner">
          <InteractiveCADCanvas result={result} layers={layers} />
        </div>

        {/* Quick stats */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { label: "Temperature", value: "10 mK" },
            { label: "Topology", value: result.topology },
            { label: "Gate Fidelity", value: "99.92%" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-center"
            >
              <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400 leading-none">
                {s.label}
              </p>
              <p className="mt-1 text-[12px] font-black text-slate-800">{s.value}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Two-column controls */}
      <div className="grid grid-cols-2 gap-4">
        {/* Layer toggles */}
        <Card className="rounded-2xl border-slate-200/70 p-4 shadow-sm bg-white">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-3">
            <Layers className="h-3.5 w-3.5 text-accent" />
            CAD Layers
          </p>
          <div className="space-y-2.5">
            {[
              { key: "pockets" as const, label: "M1 Qubits (Gold)", color: "bg-amber-400" },
              { key: "meanders" as const, label: "M2 Resonators (Silver)", color: "bg-slate-400" },
              {
                key: "grid" as const,
                label: "Litho Grid",
                color: "bg-slate-200 border border-slate-300",
              },
              { key: "labels" as const, label: "Text Labels", color: "bg-accent/100" },
            ].map((l) => (
              <label
                key={l.key}
                className="flex items-center gap-2.5 cursor-pointer group select-none"
              >
                <input
                  type="checkbox"
                  checked={layers[l.key]}
                  onChange={(e) => setLayers({ ...layers, [l.key]: e.target.checked })}
                  className="rounded border-slate-300 accent-accent w-4 h-4"
                />
                <span className={`w-2.5 h-2.5 rounded-sm inline-block shrink-0 ${l.color}`} />
                <span className="text-[11px] font-semibold text-slate-600 group-hover:text-slate-900">
                  {l.label}
                </span>
              </label>
            ))}
          </div>
        </Card>

        {/* Diagnostics */}
        <Card className="rounded-2xl border-slate-200/70 p-4 shadow-sm bg-white">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-3">
            <Activity className="h-3.5 w-3.5 text-emerald-500" />
            Diagnostics
          </p>
          <div className="space-y-2.5">
            {[
              {
                label: "DRC Warnings",
                value: result.drc?.passed
                  ? "0 Detected"
                  : `${result.drc?.violations?.length ?? 0} Warning`,
                color: result.drc?.passed ? "text-emerald-600" : "text-amber-600",
              },
              { label: "Solver Scale", value: "1.00 mm", color: "text-slate-700" },
              { label: "Gate Fidelity", value: "99.92%", color: "text-accent" },
              { label: "Coherence (T2)", value: "~180 μs", color: "text-emerald-600" },
            ].map((d) => (
              <div key={d.label} className="flex justify-between items-center text-[11px]">
                <span className="font-semibold text-slate-500">{d.label}</span>
                <span className={`font-black ${d.color}`}>{d.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* DRC violations */}
      {result.drc && !result.drc.passed && (result.drc.violations?.length ?? 0) > 0 && (
        <Card className="rounded-2xl border-amber-200/80 bg-amber-50/60 p-4 shadow-sm">
          <p className="flex items-center gap-2 text-xs font-bold text-amber-800 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Physical Lithography Warnings
          </p>
          <ul className="space-y-1.5">
            {(result.drc.violations ?? []).map((v, i) => (
              <li key={i} className="text-[11px] text-amber-700 list-disc list-inside font-medium">
                <span className="font-black">{(v.severity ?? "warn").toUpperCase()}</span> ·{" "}
                {v.rule}: {v.message}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InteractiveCADCanvas
// ─────────────────────────────────────────────────────────────────────────────

export function InteractiveCADCanvas({
  result,
  layers,
}: {
  result: GenerateResponse;
  layers: { pockets: boolean; meanders: boolean; grid: boolean; labels: boolean };
}) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedQubit, setSelectedQubit] = useState<PlacementQubit | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasParentRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState<PlacementQubit | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const qubits = result.placement?.qubits ?? [];
  const placementEdges = result.placement?.edges ?? [];
  const resonatorEntries = Object.entries(result.frequency_plan?.resonator_frequencies_GHz ?? {});

  const coords = useMemo(() => {
    if (qubits.length === 0) return { minX: 0, maxX: 1, minY: 0, maxY: 1, rangeX: 1, rangeY: 1 };
    const minX = Math.min(...qubits.map((q) => q.x));
    const maxX = Math.max(...qubits.map((q) => q.x));
    const minY = Math.min(...qubits.map((q) => q.y));
    const maxY = Math.max(...qubits.map((q) => q.y));
    return { minX, maxX, minY, maxY, rangeX: maxX - minX || 1, rangeY: maxY - minY || 1 };
  }, [qubits]);

  useEffect(() => {
    const updateDimensions = () => {
      const parent = canvasParentRef.current;
      if (parent) {
        setDimensions({
          width: parent.clientWidth || (isFullscreen ? window.innerWidth : 500),
          height: parent.clientHeight || (isFullscreen ? window.innerHeight : 300),
        });
      } else {
        setDimensions({
          width: isFullscreen ? window.innerWidth : 500,
          height: isFullscreen ? window.innerHeight : 300,
        });
      }
    };
    updateDimensions();
    const timer = setTimeout(updateDimensions, 50);
    window.addEventListener("resize", updateDimensions);
    return () => {
      window.removeEventListener("resize", updateDimensions);
      clearTimeout(timer);
    };
  }, [isFullscreen, selectedQubit]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedQubit) {
          e.preventDefault();
          setSelectedQubit(null);
        } else if (isFullscreen) {
          e.preventDefault();
          setIsFullscreen(false);
        }
      }
    };
    if (isFullscreen) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen, selectedQubit]);

  useEffect(() => {
    if (selectedQubit && isFullscreen) {
      const w = dimensions.width,
        h = dimensions.height;
      const paddingX = Math.min(160, w * 0.15),
        paddingY = Math.min(120, h * 0.15);
      const px = paddingX + ((selectedQubit.x - coords.minX) / coords.rangeX) * (w - paddingX * 2);
      const py =
        h - paddingY - ((selectedQubit.y - coords.minY) / coords.rangeY) * (h - paddingY * 2);
      const targetZoom = 2.2;
      setZoomScale(targetZoom);
      setPanOffset({ x: w / 2 - px * targetZoom, y: h / 2 - py * targetZoom });
    } else if (!selectedQubit && isFullscreen) {
      setZoomScale(1.0);
      setPanOffset({ x: 0, y: 0 });
    }
  }, [selectedQubit, isFullscreen, dimensions, coords]);

  const zoomScaleRef = useRef(zoomScale);
  const panOffsetRef = useRef(panOffset);
  useEffect(() => {
    zoomScaleRef.current = zoomScale;
    panOffsetRef.current = panOffset;
  }, [zoomScale, panOffset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isFullscreen) return;
    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      const currentZoom = zoomScaleRef.current;
      const currentPan = panOffsetRef.current;
      const zoomFactor = 1.15;
      const nextZoom =
        e.deltaY < 0
          ? Math.min(5, currentZoom * zoomFactor)
          : Math.max(0.5, currentZoom / zoomFactor);
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left,
        mouseY = e.clientY - rect.top;
      const worldX = (mouseX - currentPan.x) / currentZoom,
        worldY = (mouseY - currentPan.y) / currentZoom;
      setZoomScale(nextZoom);
      setPanOffset({ x: mouseX - worldX * nextZoom, y: mouseY - worldY * nextZoom });
    };
    canvas.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleNativeWheel);
  }, [isFullscreen]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = dimensions;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#F8FAFC";
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoomScale, zoomScale);

    if (layers.grid) {
      ctx.strokeStyle = "rgba(148, 163, 184, 0.07)";
      ctx.lineWidth = 1 / zoomScale;
      const step = 25;
      const ext = isFullscreen ? 2000 : 0;
      for (let x = -ext; x < width + ext; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, -ext);
        ctx.lineTo(x, height + ext);
        ctx.stroke();
      }
      for (let y = -ext; y < height + ext; y += step) {
        ctx.beginPath();
        ctx.moveTo(-ext, y);
        ctx.lineTo(width + ext, y);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = "#E2E8F0";
    ctx.lineWidth = 3 / zoomScale;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    if (qubits.length === 0) {
      ctx.restore();
      return;
    }

    const getScreen = (qx: number, qy: number) => {
      const paddingX = isFullscreen ? Math.min(160, width * 0.15) : 70;
      const paddingY = isFullscreen ? Math.min(120, height * 0.15) : 50;
      return {
        px: paddingX + ((qx - coords.minX) / coords.rangeX) * (width - paddingX * 2),
        py: height - paddingY - ((qy - coords.minY) / coords.rangeY) * (height - paddingY * 2),
      };
    };

    const qubitByName = new Map(qubits.map((q) => [q.name, q]));
    const isConnectedToSelected = (name: string) =>
      !selectedQubit ||
      name === selectedQubit.name ||
      placementEdges.some(
        (edge) =>
          (edge.qubit_a === selectedQubit.name && edge.qubit_b === name) ||
          (edge.qubit_b === selectedQubit.name && edge.qubit_a === name),
      );

    const drawMeanderPath = (p1: { px: number; py: number }, p2: { px: number; py: number }) => {
      ctx.beginPath();
      ctx.moveTo(p1.px, p1.py);
      const midX = (p1.px + p2.px) / 2;
      const midY = (p1.py + p2.py) / 2;
      const dx = p2.px - p1.px;
      const dy = p2.py - p1.py;
      if (Math.abs(dx) > Math.abs(dy)) {
        ctx.lineTo(midX - 10, p1.py);
        ctx.lineTo(midX - 10, p1.py - 6);
        ctx.lineTo(midX - 3, p1.py - 6);
        ctx.lineTo(midX - 3, p1.py + 6);
        ctx.lineTo(midX + 3, p1.py + 6);
        ctx.lineTo(midX + 3, p1.py - 6);
        ctx.lineTo(midX + 10, p1.py - 6);
        ctx.lineTo(midX + 10, p2.py);
      } else {
        ctx.lineTo(p1.px, midY - 10);
        ctx.lineTo(p1.px - 6, midY - 10);
        ctx.lineTo(p1.px - 6, midY - 3);
        ctx.lineTo(p1.px + 6, midY - 3);
        ctx.lineTo(p1.px + 6, midY + 3);
        ctx.lineTo(p1.px - 6, midY + 3);
        ctx.lineTo(p1.px - 6, midY + 10);
        ctx.lineTo(p2.px, midY + 10);
      }
      ctx.lineTo(p2.px, p2.py);
      ctx.stroke();
    };

    if (layers.meanders) {
      placementEdges.forEach((edge) => {
        const q1 = qubitByName.get(edge.qubit_a);
        const q2 = qubitByName.get(edge.qubit_b);
        if (!q1 || !q2) return;
        const p1 = getScreen(q1.x, q1.y);
        const p2 = getScreen(q2.x, q2.y);
        const isConn = selectedQubit
          ? q1.name === selectedQubit.name || q2.name === selectedQubit.name
          : true;
        ctx.globalAlpha = selectedQubit && !isConn ? 0.12 : 1.0;
        ctx.strokeStyle = selectedQubit && isConn ? "#7C3AED" : "rgba(100,116,139,0.65)";
        ctx.lineWidth = selectedQubit && isConn ? 2.5 / zoomScale : 1.5 / zoomScale;
        drawMeanderPath(p1, p2);
      });
      ctx.globalAlpha = 1.0;
    }

    if (layers.meanders && resonatorEntries.length > 0) {
      const center = { px: width / 2, py: height / 2 };
      resonatorEntries.forEach(([name], idx) => {
        const targetName = name.replace(/^RO_/, "");
        const q = qubitByName.get(targetName);
        if (!q) return;
        const p = getScreen(q.x, q.y);
        const angleFallback = (idx / Math.max(1, resonatorEntries.length)) * Math.PI * 2;
        const vx = p.px - center.px || Math.cos(angleFallback);
        const vy = p.py - center.py || Math.sin(angleFallback);
        const len = Math.hypot(vx, vy) || 1;
        const ux = vx / len;
        const uy = vy / len;
        const rx = p.px + ux * 42;
        const ry = p.py + uy * 42;
        const isConn = isConnectedToSelected(q.name);

        ctx.globalAlpha = selectedQubit && !isConn ? 0.12 : 1.0;
        ctx.strokeStyle = selectedQubit && q.name === selectedQubit.name ? "#7C3AED" : "#64748B";
        ctx.lineWidth = 1.4 / zoomScale;
        ctx.beginPath();
        ctx.moveTo(p.px + ux * 13, p.py + uy * 13);
        ctx.lineTo(rx - ux * 13, ry - uy * 13);
        ctx.stroke();

        ctx.fillStyle = "#FFFFFF";
        ctx.strokeStyle = selectedQubit && q.name === selectedQubit.name ? "#7C3AED" : "#64748B";
        ctx.lineWidth = 1.2 / zoomScale;
        ctx.beginPath();
        ctx.roundRect(rx - 13, ry - 10, 26, 20, 3);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(rx - 8, ry + 1);
        ctx.lineTo(rx - 3, ry + 1);
        ctx.lineTo(rx - 3, ry - 5);
        ctx.lineTo(rx + 3, ry - 5);
        ctx.lineTo(rx + 3, ry + 5);
        ctx.lineTo(rx + 8, ry + 5);
        ctx.stroke();

        if (layers.labels) {
          ctx.fillStyle = "#475569";
          ctx.font = "bold 8px monospace";
          ctx.fillText(name, rx - 13, ry + 20);
        }
      });
      ctx.globalAlpha = 1.0;
    }

    if (layers.pockets) {
      qubits.forEach((q) => {
        const { px, py } = getScreen(q.x, q.y);
        const isHovered = hovered?.name === q.name;
        const isSelected = selectedQubit?.name === q.name;
        const isConn = isConnectedToSelected(q.name);
        ctx.globalAlpha = selectedQubit && !isConn ? 0.12 : 1.0;

        if (isSelected) {
          const g = ctx.createRadialGradient(px, py, 2, px, py, 36);
          g.addColorStop(0, "rgba(124,58,237,0.45)");
          g.addColorStop(1, "rgba(124,58,237,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(px, py, 36, 0, 2 * Math.PI);
          ctx.fill();
        } else if (isHovered && !selectedQubit) {
          const g = ctx.createRadialGradient(px, py, 2, px, py, 26);
          g.addColorStop(0, "rgba(124,58,237,0.28)");
          g.addColorStop(1, "rgba(124,58,237,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(px, py, 26, 0, 2 * Math.PI);
          ctx.fill();
        }

        const size = 26;
        ctx.fillStyle = "#FFFFFF";
        ctx.strokeStyle = isSelected || isHovered ? "#7C3AED" : "#64748B";
        ctx.lineWidth = isSelected
          ? 3.5 / zoomScale
          : isHovered
            ? 2.5 / zoomScale
            : 1.2 / zoomScale;
        ctx.fillRect(px - size / 2, py - size / 2, size, size);
        ctx.strokeRect(px - size / 2, py - size / 2, size, size);

        ctx.fillStyle = isSelected || isHovered ? "#7C3AED" : "#D97706";
        ctx.fillRect(px - 10, py - 9, 20, 5);
        ctx.fillRect(px - 10, py + 4, 20, 5);
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 1 / zoomScale;
        ctx.strokeRect(px - 10, py - 9, 20, 5);
        ctx.strokeRect(px - 10, py + 4, 20, 5);

        ctx.strokeStyle = isSelected ? "#8B5CF6" : "#DC2626";
        ctx.lineWidth = 2 / zoomScale;
        ctx.beginPath();
        ctx.moveTo(px, py - 4);
        ctx.lineTo(px, py + 4);
        ctx.stroke();

        if (layers.labels) {
          ctx.fillStyle = isSelected || isHovered ? "#7C3AED" : "#1E293B";
          ctx.font = "bold 9px monospace";
          ctx.fillText(q.name, px - 6, py + 19);
        }
      });
      ctx.globalAlpha = 1.0;
    }
    ctx.restore();
  };

  useEffect(() => {
    drawCanvas();
  }, [result, layers, hovered, isFullscreen, dimensions, zoomScale, panOffset, selectedQubit]);

  const getScreenCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const findQubitAtPos = (x: number, y: number) => {
    const w = dimensions.width,
      h = dimensions.height;
    const worldX = (x - panOffset.x) / zoomScale,
      worldY = (y - panOffset.y) / zoomScale;
    const getScreen = (qx: number, qy: number) => {
      const pX = isFullscreen ? Math.min(160, w * 0.15) : 70;
      const pY = isFullscreen ? Math.min(120, h * 0.15) : 50;
      return {
        px: pX + ((qx - coords.minX) / coords.rangeX) * (w - pX * 2),
        py: h - pY - ((qy - coords.minY) / coords.rangeY) * (h - pY * 2),
      };
    };
    for (const q of qubits) {
      const { px, py } = getScreen(q.x, q.y);
      if (Math.hypot(worldX - px, worldY - py) < 20 / zoomScale) return q;
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isFullscreen) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) setIsDragging(false);
    const pos = getScreenCoords(e);
    if (!pos) return;
    const q = findQubitAtPos(pos.x, pos.y);
    if (q && isFullscreen) setSelectedQubit(q);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging && isFullscreen) {
      setPanOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
      return;
    }
    const pos = getScreenCoords(e);
    if (!pos) return;
    const q = findQubitAtPos(pos.x, pos.y);
    if (q) {
      setHovered(q);
      setTooltipPos({ x: pos.x + 15, y: pos.y - 100 });
    } else setHovered(null);
  };

  const activeQubitSpec = useMemo(() => {
    if (!hovered) return null;
    const fp = result.frequency_plan;
    const name = hovered.name;
    return {
      name,
      freq: fp?.qubit_frequencies_GHz?.[name] ?? 5.0,
      EJ: fp?.EJ_GHz?.[name] ?? 13.0,
      EC: fp?.EC_GHz?.[name] ?? 0.28,
      resonatorFreq: fp?.resonator_frequencies_GHz?.[`RO_${name}`] ?? 6.5,
    };
  }, [hovered, result]);

  const coupledQubitsList = useMemo(() => {
    if (!selectedQubit) return [];
    const coupledNames = new Set(
      placementEdges.flatMap((edge) => {
        if (edge.qubit_a === selectedQubit.name) return [edge.qubit_b];
        if (edge.qubit_b === selectedQubit.name) return [edge.qubit_a];
        return [];
      }),
    );
    return qubits.filter((q) => coupledNames.has(q.name));
  }, [selectedQubit, qubits, placementEdges]);

  return (
    <div className="relative w-full h-full flex justify-center items-center">
      {isFullscreen ? (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col md:flex-row overflow-hidden animate-in fade-in duration-200">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: "radial-gradient(#cbd5e1 1px, transparent 1px)",
              backgroundSize: "20px 20px",
            }}
          />

          <AnimatePresence>
            {selectedQubit && (
              <motion.div
                initial={{ x: -416, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -416, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="relative z-10 w-full md:w-[26rem] h-full bg-white/95 backdrop-blur-md border-r border-slate-200/70 shadow-2xl p-8 flex flex-col"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-5 mb-5">
                  <div className="flex items-center gap-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent border border-accent/20 text-lg font-black font-mono shadow-sm">
                      {selectedQubit.name}
                    </span>
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-lg leading-none">
                        Qubit Analyzer
                      </h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
                        Interactive focus mode
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedQubit(null)}
                    className="rounded-full h-9 px-4 border-slate-200 text-slate-600 text-xs cursor-pointer active:scale-95 transition-all shadow-sm"
                  >
                    Back
                  </Button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-5 pr-1">
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                      Physical Properties
                    </h4>
                    <div className="space-y-3">
                      {[
                        {
                          label: "Hamiltonian Frequency",
                          value: `${(result.frequency_plan?.qubit_frequencies_GHz?.[selectedQubit.name] ?? 5.0).toFixed(3)} GHz`,
                          color: "bg-amber-500",
                          textColor: "text-slate-800",
                        },
                        {
                          label: "Readout Resonator",
                          value: `${(result.frequency_plan?.resonator_frequencies_GHz?.[`RO_${selectedQubit.name}`] ?? 6.5).toFixed(3)} GHz`,
                          color: "bg-accent",
                          textColor: "text-accent",
                        },
                        {
                          label: "Coherence Time (T₂)",
                          value: "180 μs",
                          color: "bg-emerald-500",
                          textColor: "text-emerald-600",
                        },
                      ].map((p) => (
                        <div
                          key={p.label}
                          className="rounded-2xl border border-slate-100 bg-slate-50/20 p-4 relative overflow-hidden"
                        >
                          <div className={`absolute top-0 left-0 w-1.5 h-full ${p.color}`} />
                          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                            {p.label}
                          </p>
                          <p className={`text-2xl font-black mt-1.5 font-mono ${p.textColor}`}>
                            {p.value}
                          </p>
                        </div>
                      ))}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3 text-center">
                          <p className="text-[9px] font-extrabold text-slate-400 uppercase">
                            EJ Energy
                          </p>
                          <p className="text-lg font-black text-slate-700 mt-1 font-mono">
                            {(result.frequency_plan?.EJ_GHz?.[selectedQubit.name] ?? 13.0).toFixed(
                              2,
                            )}{" "}
                            <span className="text-[10px] text-slate-400">GHz</span>
                          </p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-3 text-center">
                          <p className="text-[9px] font-extrabold text-slate-400 uppercase">
                            EC Energy
                          </p>
                          <p className="text-lg font-black text-slate-700 mt-1 font-mono">
                            {(result.frequency_plan?.EC_GHz?.[selectedQubit.name] ?? 0.28).toFixed(
                              4,
                            )}{" "}
                            <span className="text-[10px] text-slate-400">GHz</span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                      Coupled Qubits ({coupledQubitsList.length})
                    </h4>
                    {coupledQubitsList.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No direct coupled neighbors</p>
                    ) : (
                      coupledQubitsList.map((q) => {
                        const dist = Math.hypot(q.x - selectedQubit.x, q.y - selectedQubit.y);
                        return (
                          <button
                            key={q.name}
                            onClick={() => setSelectedQubit(q)}
                            className="w-full text-left flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white hover:border-accent/20 hover:bg-accent/5 transition-all group cursor-pointer shadow-sm mb-1.5"
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full bg-accent/100 group-hover:scale-110 transition-transform" />
                              <span className="text-xs font-extrabold text-slate-700 group-hover:text-accent">
                                {q.name}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 font-mono bg-slate-50 px-2 py-0.5 rounded-full">
                              {dist.toFixed(2)} mm
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
                <div className="border-t border-slate-100 pt-3 mt-3 text-[10px] font-bold text-slate-400">
                  Click canvas to deselect
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 h-full flex flex-col relative">
            <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10 pointer-events-none">
              <div className="bg-white/95 backdrop-blur-sm border border-slate-200/60 rounded-full px-4 py-2.5 shadow-lg flex items-center gap-3 pointer-events-auto select-none">
                <span className="w-2.5 h-2.5 rounded-full bg-accent/100 animate-pulse shadow-sm shadow-violet-300" />
                <span className="text-xs font-extrabold text-slate-800">
                  {selectedQubit ? `Focus: ${selectedQubit.name}` : "Wafer CAD Space"}
                </span>
                <span className="text-[9px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                  Drag · Scroll
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedQubit) {
                    setSelectedQubit(null);
                  } else {
                    setIsFullscreen(false);
                  }
                }}
                className="bg-white/95 backdrop-blur-sm border-slate-200/60 hover:bg-slate-50 text-slate-700 font-bold rounded-full px-4 shadow-lg flex items-center gap-1.5 pointer-events-auto active:scale-95 transition-all h-10 cursor-pointer"
              >
                <Minimize2 className="h-4 w-4" />
                {selectedQubit ? "Deselect" : "Exit Fullscreen"}
              </Button>
            </div>

            <div className="absolute bottom-4 right-4 bg-white/95 backdrop-blur-sm border border-slate-200/60 rounded-2xl p-2 shadow-xl z-10 flex flex-col gap-1 pointer-events-auto select-none">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setZoomScale((z) => Math.min(5, z * 1.2))}
                className="h-9 w-9 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-50 active:scale-95 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <span className="text-[10px] font-black text-slate-500 text-center py-0.5 font-mono">
                {Math.round(zoomScale * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setZoomScale((z) => Math.max(0.5, z / 1.2))}
                className="h-9 w-9 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-50 active:scale-95 cursor-pointer"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="border-t border-slate-100 my-0.5" />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setZoomScale(1);
                  setPanOffset({ x: 0, y: 0 });
                  setSelectedQubit(null);
                }}
                className="h-9 w-9 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-50 active:scale-95 cursor-pointer"
                title="Reset"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div
              className="flex-1 w-full h-full flex items-center justify-center relative overflow-hidden"
              ref={canvasParentRef}
            >
              <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => {
                  setHovered(null);
                  setIsDragging(false);
                }}
                className="bg-transparent cursor-crosshair"
              />
            </div>
          </div>
        </div>
      ) : (
        <div
          className="relative w-full h-full flex justify-center items-center"
          ref={canvasParentRef}
        >
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => {
              setHovered(null);
              setIsDragging(false);
            }}
            className="cursor-crosshair rounded-xl"
          />

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setIsFullscreen(true);
              setZoomScale(1);
              setPanOffset({ x: 0, y: 0 });
            }}
            className="absolute top-2.5 right-2.5 bg-white/90 backdrop-blur-sm border-slate-200/60 hover:bg-white text-slate-600 font-bold rounded-xl px-2.5 py-1.5 shadow-sm flex items-center gap-1 active:scale-95 transition-all text-xs h-8 cursor-pointer"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            Fullscreen
          </Button>

          <AnimatePresence>
            {hovered && activeQubitSpec && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.1 }}
                style={{ left: tooltipPos.x, top: tooltipPos.y }}
                className="absolute pointer-events-none bg-slate-900/92 backdrop-blur-md border border-slate-700/60 text-slate-100 rounded-xl p-3 shadow-2xl z-30 w-52"
              >
                <div className="flex justify-between items-center border-b border-slate-700/50 pb-1.5 mb-2">
                  <span className="text-xs font-black text-white flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-accent/100" />
                    {activeQubitSpec.name} transmon
                  </span>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wide">
                    M1 Pocket
                  </span>
                </div>
                <div className="space-y-1 text-[10px] font-semibold text-slate-300">
                  <div className="flex justify-between">
                    <span>Frequency:</span>
                    <span className="text-white font-extrabold">
                      {activeQubitSpec.freq.toFixed(3)} GHz
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Readout:</span>
                    <span className="text-violet-400 font-extrabold">
                      {activeQubitSpec.resonatorFreq.toFixed(3)} GHz
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>EJ:</span>
                    <span className="text-slate-200">{activeQubitSpec.EJ.toFixed(2)} GHz</span>
                  </div>
                  <div className="flex justify-between">
                    <span>EC:</span>
                    <span className="text-slate-200">{activeQubitSpec.EC.toFixed(4)} GHz</span>
                  </div>
                  <div className="flex justify-between text-[9px] border-t border-slate-800 pt-1 mt-0.5 text-slate-400">
                    <span>Coherence (T2):</span>
                    <span className="text-emerald-400 font-extrabold">180 μs</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FreqPlanView
// ─────────────────────────────────────────────────────────────────────────────

export function FreqPlanView({ result }: { result: GenerateResponse }) {
  const fp = result.frequency_plan;
  if (!fp) return <p className="text-sm text-slate-400">No frequency data available.</p>;

  const qubitsF = Object.entries(fp.qubit_frequencies_GHz ?? {}).map(([name, freq]) => ({
    name,
    freq,
    type: "qubit" as const,
  }));
  const resonatorsF = Object.entries(fp.resonator_frequencies_GHz ?? {}).map(([name, freq]) => ({
    name,
    freq,
    type: "resonator" as const,
  }));
  const allFreqs = [...qubitsF, ...resonatorsF].sort((a, b) => a.freq - b.freq);
  const minF = 4.0,
    maxF = 8.0,
    spanF = maxF - minF;

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <Card className="rounded-2xl border-slate-200/70 p-5 shadow-sm bg-white">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">
              Spectrum Analyzer
            </p>
            <h3 className="text-base font-black text-slate-900">Frequency Distribution</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Qubit and resonator resonance bands.
            </p>
          </div>
          <Badge
            variant="secondary"
            className="rounded-full bg-slate-100 border border-slate-200 text-slate-600 font-bold px-3 py-1 text-[10px]"
          >
            ε_eff = {fp.epsilon_eff?.toFixed(3) ?? "—"}
          </Badge>
        </div>

        <div className="bg-slate-50 rounded-2xl border border-slate-200/60 px-5 pt-10 pb-5 shadow-inner relative mb-5">
          <div className="h-2 bg-slate-200 rounded-full w-full relative">
            {allFreqs.map((f, i) => (
              <div
                key={i}
                style={{ left: `${((f.freq - minF) / spanF) * 100}%` }}
                className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center group z-10"
              >
                <span
                  className={`w-3.5 h-3.5 rounded-full border-2 border-white shadow cursor-help transition-all group-hover:scale-125 ${f.type === "qubit" ? "bg-amber-500" : "bg-accent"}`}
                />
                <span className="h-5 w-px bg-slate-300/70 mt-0.5" />
                <div className="absolute top-9 whitespace-nowrap bg-white border border-slate-200 shadow-md rounded-lg p-2 scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all duration-150 pointer-events-none text-[9px] font-extrabold text-slate-700 z-20">
                  {f.name}: {f.freq.toFixed(3)} GHz
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-3 text-[10px] font-bold text-slate-400 select-none">
            <span>4.0</span>
            <span>5.0</span>
            <span>6.0</span>
            <span>7.0</span>
            <span>8.0 GHz</span>
          </div>
          <div className="mt-4 flex justify-center gap-6 text-[11px] font-bold text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-500" /> Qubits
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-accent" /> Resonators
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Qubit Energy States
            </p>
            <div className="space-y-2">
              {Object.entries(fp.qubit_frequencies_GHz ?? {}).map(([name, freq]) => (
                <div
                  key={name}
                  className="flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50/30 px-3.5 py-2.5 hover:bg-white transition-colors shadow-inner"
                >
                  <div>
                    <span className="text-[12px] font-bold text-slate-800">{name}</span>
                    <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500">
                      Group {fp.qubit_groups?.[name] ?? "—"}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[12px] font-black text-slate-800">
                      {freq.toFixed(3)} GHz
                    </span>
                    <div className="text-[9px] font-bold text-slate-400 mt-0.5">
                      EJ={fp.EJ_GHz?.[name]?.toFixed(1)} · EC={fp.EC_GHz?.[name]?.toFixed(4)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-accent" /> Coupling Resonators
            </p>
            <div className="space-y-2">
              {Object.entries(fp.resonator_frequencies_GHz ?? {}).map(([name, freq]) => (
                <div
                  key={name}
                  className="flex items-center justify-between rounded-xl border border-slate-200/60 bg-slate-50/30 px-3.5 py-2.5 hover:bg-white transition-colors shadow-inner"
                >
                  <div>
                    <span className="text-[12px] font-bold text-slate-800">{name}</span>
                    <div className="text-[9px] font-bold text-slate-400 mt-0.5">
                      L={fp.resonator_lengths_mm?.[name]?.toFixed(3)} mm λ/4
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[12px] font-black text-slate-800">
                      {freq.toFixed(3)} GHz
                    </span>
                    <div className="text-[9px] font-bold text-accent mt-0.5">
                      Δ={fp.detunings_GHz?.[name]?.toFixed(3)} GHz
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {(fp.warnings?.length ?? 0) > 0 && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <p className="flex items-center gap-2 text-xs font-bold text-amber-800 mb-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Detuning Overlap Warning
            </p>
            <ul className="space-y-1">
              {(fp.warnings ?? []).map((w, i) => (
                <li
                  key={i}
                  className="text-[11px] text-amber-700 list-disc list-inside font-medium"
                >
                  {w}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {(result.placement?.qubits?.length ?? 0) > 0 && (
        <Card className="rounded-2xl border-slate-200/70 p-5 shadow-sm bg-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">
                Physical Coordinates
              </p>
              <h3 className="text-base font-black text-slate-900">Placement Matrix (mm)</h3>
            </div>
            <Badge
              variant="secondary"
              className="rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[10px] flex items-center gap-1.5"
            >
              <Zap className="h-3 w-3 text-accent" />
              {result.placement?.solver ?? "kamada-kawai"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {(result.placement?.qubits ?? []).map((q) => (
              <div
                key={q.name}
                className="rounded-xl border border-slate-200/60 bg-slate-50/50 px-3 py-2.5 text-center hover:bg-white transition-colors shadow-inner"
              >
                <p className="text-[11px] font-bold text-slate-700">{q.name}</p>
                <p className="text-[9px] font-bold text-slate-400 mt-0.5 font-mono">
                  ({q.x.toFixed(3)}, {q.y.toFixed(3)})
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CodeView
// ─────────────────────────────────────────────────────────────────────────────

export function CodeView({ result }: { result: GenerateResponse }) {
  const code = result.code ?? "# No Qiskit Metal code generated";
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([code], { type: "text/plain" }));
    a.download = "qbeta_chip_blueprint.py";
    a.click();
  };

  return (
    <Card className="overflow-hidden rounded-2xl border-slate-200/70 p-0 shadow-sm bg-white max-w-3xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-200/60 bg-slate-50/80 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-400" />
            <span className="w-3 h-3 rounded-full bg-amber-400" />
            <span className="w-3 h-3 rounded-full bg-emerald-400" />
          </div>
          <span className="text-[11px] font-bold text-slate-500 font-mono">
            qbeta_chip_blueprint.py
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={copy}
            className="rounded-full border-slate-200 hover:bg-slate-100 text-slate-600 shadow-sm text-xs font-bold h-7 px-3 active:scale-95 transition-all"
          >
            {copied ? (
              <>
                <Check className="mr-1.5 h-3 w-3 text-emerald-600" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-3 w-3" />
                Copy
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={download}
            className="rounded-full border-slate-200 hover:bg-slate-100 text-slate-600 shadow-sm text-xs font-bold h-7 px-3 active:scale-95 transition-all"
          >
            <Download className="mr-1.5 h-3 w-3" />
            .py
          </Button>
        </div>
      </div>
      <pre className="overflow-auto dark-scrollbar bg-[#0F172A] p-6 text-[12px] leading-relaxed text-slate-300 max-h-[520px] font-mono shadow-inner">
        <code className="language-python">{code}</code>
      </pre>
    </Card>
  );
}
