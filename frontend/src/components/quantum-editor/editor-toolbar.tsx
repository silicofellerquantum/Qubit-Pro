import { type RefObject, useCallback, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Undo2,
  Redo2,
  MousePointer2,
  Hand,
  Code2,
  Maximize,
  Layers,
  Save,
  Download,
  ChevronDown,
  FileCode2,
  PenLine,
  Trash2,
  Upload,
  FileJson,
  Map,
  RefreshCw,
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  Circle,
  Hexagon,
  Minus,
  LayoutGrid,
  Cpu,
  ChevronUp,
  Loader2,
} from "lucide-react";
import { useFeatureGate, type FeatureKey } from "@/lib/hooks/use-feature-gate";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { type Tool, type AlignLayout, CHIP_SIZE_PRESETS } from "@/lib/editor/design-store";
import { useWorkspace } from "@/lib/editor/workspace-store";
import type { CodePanelMode } from "./code-ide-panel";
import type { EditorCanvasHandle } from "./editor-canvas";
import { SaveStatus } from "./save-status";

interface Props {
  libOpen: boolean;
  onToggleLib: () => void;
  onFitView: () => void;
  onShowCode: (mode: CodePanelMode) => void;
  canvasRef: RefObject<EditorCanvasHandle | null>;
  onSave?: () => void;
}

function triggerDownload(url: string, filename: string) {
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}
export function EditorToolbar({
  libOpen,
  onToggleLib,
  onFitView,
  onShowCode,
  canvasRef,
  onSave,
}: Props) {
  const featureGate = useFeatureGate();
  const { data: featureAllowed = { import_json: true, export_json: true } } = useQuery({
    queryKey: ["feature-usage"],
    queryFn: async () => {
      const token = localStorage.getItem("qs_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const backendUrl = (import.meta.env.VITE_BACKEND_URL ?? "http://localhost:5000").replace(
        /\/$/,
        "",
      );
      
      const keys: FeatureKey[] = ["import_json", "export_json"];
      const results = await Promise.all(
        keys.map(async (key) => {
          try {
            const res = await fetch(`${backendUrl}/api/feature-usage/${key}`, { headers });
            if (res.ok) {
              const data = await res.json();
              return { key, allowed: data.allowed };
            }
          } catch (e) {
            console.error(e);
          }
          return { key, allowed: true };
        })
      );
      
      const usageMap: Record<string, boolean> = {};
      results.forEach((r) => {
        usageMap[r.key] = r.allowed;
      });
      return usageMap;
    },
    refetchOnWindowFocus: false,
    staleTime: 60000,
  });
  const { activeTab, dispatchActive, saveAll } = useWorkspace();
  const state = activeTab.state;
  const dispatch = dispatchActive;
  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;
  const qc = useQueryClient();
  const [showClearDialog, setShowClearDialog] = useState(false);

  const setTool = (t: Tool) => dispatch({ type: "SET_TOOL", tool: t });

  const handleSave = useCallback(() => {
    if (onSave) {
      onSave();
    } else {
      saveAll();
      toast.success("Design saved");
    }
  }, [onSave, saveAll]);

  const confirmClear = useCallback(() => {
    dispatch({ type: "LOAD", doc: { placements: [], connections: [] } });
    dispatch({ type: "ZOOM", zoom: 1 });
    dispatch({ type: "PAN", x: 0, y: 0 });
    dispatch({ type: "SELECT", selection: [] });
    qc.removeQueries({ queryKey: ["bridge", "render"] });
    toast.success("Canvas cleared");
    setShowClearDialog(false);
  }, [dispatch, qc]);

  const downloadSVG = useCallback(() => {
    const svg = canvasRef.current?.getSvgElement();
    if (!svg) {
      toast.error("Nothing to export");
      return;
    }
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    triggerDownload(
      URL.createObjectURL(new Blob([clone.outerHTML], { type: "image/svg+xml" })),
      "schematic.svg",
    );
    toast.success("SVG downloaded");
  }, [canvasRef]);

  const downloadRaster = useCallback(
    (format: "png" | "jpg") => {
      const svg = canvasRef.current?.getSvgElement();
      if (!svg) {
        toast.error("Nothing to export");
        return;
      }
      const { width, height } = svg.getBoundingClientRect();
      const scale = 2;
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("width", String(width * scale));
      clone.setAttribute("height", String(height * scale));
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext("2d")!;
        if (format === "jpg") {
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (!blob) return;
            triggerDownload(URL.createObjectURL(blob), `schematic.${format}`);
            toast.success(`${format.toUpperCase()} downloaded`);
          },
          format === "jpg" ? "image/jpeg" : "image/png",
          0.95,
        );
      };
      img.src =
        "data:image/svg+xml;charset=utf-8," +
        encodeURIComponent(new XMLSerializer().serializeToString(clone));
    },
    [canvasRef],
  );

  const exportDoc = useCallback(() => {
    const doc = { placements: state.placements, connections: state.connections };
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    triggerDownload(URL.createObjectURL(blob), `${activeTab.name.replace(/\s+/g, "_")}.json`);
    toast.success("Design JSON exported");
  }, [state.placements, state.connections, activeTab.name]);

  const importDoc = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const doc = JSON.parse(String(reader.result));
          if (!Array.isArray(doc.placements) || !Array.isArray(doc.connections)) {
            throw new Error("Invalid design file: missing placements or connections");
          }
          dispatch({ type: "LOAD", doc });
          toast.success(`Imported "${file.name}"`);
        } catch (err) {
          toast.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [dispatch]);

  return (
    <TooltipProvider delayDuration={250}>
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border bg-card px-3">
        <TB
          icon={MousePointer2}
          label="Select"
          active={state.tool === "select"}
          onClick={() => setTool("select")}
        />
        <TB icon={Hand} label="Pan" active={state.tool === "pan"} onClick={() => setTool("pan")} />
        <Separator orientation="vertical" className="h-6" />
        <TB
          icon={Undo2}
          label="Undo (Ctrl+Z)"
          onClick={() => dispatch({ type: "UNDO" })}
          disabled={!canUndo}
        />
        <TB
          icon={Redo2}
          label="Redo (Ctrl+Shift+Z)"
          onClick={() => dispatch({ type: "REDO" })}
          disabled={!canRedo}
        />

        <Separator orientation="vertical" className="h-6" />

        {/* ── Qubit Count Input ────────────────────────────────────────── */}
        <QubitCountControl />

        {/* ── Chip Size Selector ───────────────────────────────────────── */}
        <ChipSizeControl />

        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={libOpen ? "secondary" : "ghost"}
                size="sm"
                onClick={onToggleLib}
                className={cn(
                  "h-8 gap-1.5 text-[11px]",
                  libOpen && "bg-primary/10 text-primary hover:bg-primary/15",
                )}
              >
                <Layers className="h-3.5 w-3.5" />{" "}
                <span className="hidden md:inline">Components</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{libOpen ? "Hide library" : "Show library"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onFitView}
                className="h-8 gap-1.5 text-[11px]"
              >
                <Maximize className="h-3.5 w-3.5" />{" "}
                <span className="hidden md:inline">Fit View</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fit all components into view (F)</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-[11px]"
                    disabled={state.placements.length === 0}
                  >
                    <AlignCenter className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">Auto Align</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Choose an auto-align layout for qubits</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" className="w-52">
              {(
                [
                  {
                    layout: "grid" as AlignLayout,
                    label: "Grid",
                    desc: "Balanced rows × cols",
                    Icon: LayoutGrid,
                  },
                  {
                    layout: "horizontal" as AlignLayout,
                    label: "Horizontal",
                    desc: "Single row left → right",
                    Icon: AlignHorizontalJustifyCenter,
                  },
                  {
                    layout: "vertical" as AlignLayout,
                    label: "Vertical",
                    desc: "Single column top → bottom",
                    Icon: AlignVerticalJustifyCenter,
                  },
                  {
                    layout: "rhombus" as AlignLayout,
                    label: "Rhombus",
                    desc: "Diamond / rhombus pattern",
                    Icon: Hexagon,
                  },
                  {
                    layout: "u-shape" as AlignLayout,
                    label: "U-Shape",
                    desc: "Three sides — open bottom",
                    Icon: Minus,
                  },
                  {
                    layout: "circle" as AlignLayout,
                    label: "Circle",
                    desc: "Equidistant ring",
                    Icon: Circle,
                  },
                  {
                    layout: "h-shape" as AlignLayout,
                    label: "H-Shape",
                    desc: "Two staggered rows (heavy-hex style)",
                    Icon: AlignCenter,
                  },
                ] as const
              ).map(({ layout, label, desc, Icon }) => (
                <DropdownMenuItem
                  key={layout}
                  className="flex items-start gap-2 py-2 cursor-pointer"
                  onClick={() => {
                    const qubits = state.placements.filter(
                      (p) =>
                        !p.locked &&
                        /transmon|qubit|JJ_Dolan|JJ_Manhattan|SNAIL|SQUID|star_qubit/i.test(
                          p.componentId,
                        ),
                    );
                    if (qubits.length === 0) {
                      toast.info("No unlocked qubits to align.");
                      return;
                    }
                    dispatch({ type: "AUTO_ALIGN", layout });
                    dispatch({ type: "CLEAR_ROUTE_CACHE" });
                    qc.removeQueries({ queryKey: ["bridge", "render-route"] });
                    toast.success(
                      `${label}: aligned ${qubits.length} qubit${qubits.length > 1 ? "s" : ""} — resonators won't overlap`,
                    );
                  }}
                >
                  <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex flex-col leading-tight">
                    <span className="font-medium text-[12px]">{label}</span>
                    <span className="text-[10px] text-muted-foreground">{desc}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  dispatch({ type: "CLEAR_ROUTE_CACHE" });
                  qc.removeQueries({ queryKey: ["bridge", "render-route"] });
                  toast.success("Routes refreshed");
                }}
                className="h-8 gap-1.5 text-[11px]"
                disabled={state.connections.length === 0}
              >
                <RefreshCw className="h-3.5 w-3.5" />{" "}
                <span className="hidden md:inline">Refresh Routes</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Re-render all route connections</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={state.showMiniMap ? "secondary" : "ghost"}
                size="sm"
                onClick={() => dispatch({ type: "TOGGLE_MINIMAP" })}
                className={cn(
                  "h-8 gap-1.5 text-[11px]",
                  state.showMiniMap && "bg-primary/10 text-primary hover:bg-primary/15",
                )}
              >
                <Map className="h-3.5 w-3.5" /> <span className="hidden md:inline">Top View</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{state.showMiniMap ? "Hide Top View" : "Show Top View"}</TooltipContent>
          </Tooltip>

          <Separator orientation="vertical" className="h-6" />

          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSave}
                  className="h-8 gap-1.5 text-[11px]"
                >
                  <Save className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Save</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Save design (Ctrl+S)</TooltipContent>
            </Tooltip>
            <SaveStatus />
          </div>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={featureGate.isChecking}
                    className="h-8 gap-1.5 text-[11px]"
                  >
                    {featureGate.isChecking ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    <span className="hidden md:inline">Download</span>{" "}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Export canvas as image</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem
                className="gap-2 text-[12px] cursor-pointer"
                onSelect={() => featureGate.checkAndRun("download_svg", downloadSVG)}
              >
                <Download className="h-3.5 w-3.5" /> SVG
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 text-[12px] cursor-pointer"
                onSelect={() =>
                  featureGate.checkAndRun("download_png", () => downloadRaster("png"))
                }
              >
                <Download className="h-3.5 w-3.5" /> PNG
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-2 text-[12px] cursor-pointer"
                onSelect={() =>
                  featureGate.checkAndRun("download_jpeg", () => downloadRaster("jpg"))
                }
              >
                <Download className="h-3.5 w-3.5" /> JPG
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "gap-2 text-[12px] cursor-pointer transition-all duration-200",
                  !featureAllowed.export_json && "blur-[1.5px] hover:blur-none"
                )}
                onSelect={() => featureGate.checkAndRun("export_json", exportDoc)}
              >
                <FileJson className="h-3.5 w-3.5" /> Export JSON
              </DropdownMenuItem>
              <DropdownMenuItem
                className={cn(
                  "gap-2 text-[12px] cursor-pointer transition-all duration-200",
                  !featureAllowed.import_json && "blur-[1.5px] hover:blur-none"
                )}
                onSelect={() => featureGate.checkAndRun("import_json", importDoc)}
              >
                <Upload className="h-3.5 w-3.5" /> Import JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="h-6" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowClearDialog(true)}
                className="h-8 gap-1.5 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />{" "}
                <span className="hidden md:inline">Clear All</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear entire canvas (all components + connections)</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 text-[11px]">
                <Code2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Code</span>{" "}
                <ChevronDown className="h-3 w-3 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                className="gap-2 text-[12px]"
                onSelect={() => onShowCode("generate")}
              >
                <FileCode2 className="h-3.5 w-3.5 text-primary" />
                <div>
                  <div className="font-semibold">Generate Code</div>
                  <div className="text-[10px] text-muted-foreground">Design → Python</div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-[12px]" onSelect={() => onShowCode("write")}>
                <PenLine className="h-3.5 w-3.5 text-emerald-600" />
                <div>
                  <div className="font-semibold">Write Code</div>
                  <div className="text-[10px] text-muted-foreground">Python → Canvas</div>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear entire canvas?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all placements and connections. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowClearDialog(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmClear}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <featureGate.GateDialog />
    </TooltipProvider>
  );
}

function TB({
  icon: Icon,
  label,
  active,
  onClick,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "h-8 w-8 rounded-md",
            active && "bg-primary/10 text-primary hover:bg-primary/15",
          )}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// ── Qubit Count Control ───────────────────────────────────────────────────────
// Shows a compact "Qubits" numeric stepper. Typing N and pressing Enter (or
// clicking ± buttons) calls PLACE_N_QUBITS which removes unlocked qubits and
// places exactly N new ones in a grid layout that fills the current chip.
function QubitCountControl() {
  const { activeTab, dispatchActive } = useWorkspace();
  const state = activeTab.state;

  // Count currently placed unlocked qubits for the initial value
  const QUBIT_RE = /transmon|qubit|JJ_Dolan|JJ_Manhattan|SNAIL|SQUID|star_qubit/i;
  const currentCount = state.placements.filter(
    (p) => QUBIT_RE.test(p.componentId) && !p.locked,
  ).length;

  const [inputVal, setInputVal] = useState<string>(String(currentCount));

  // Sync when external changes happen (e.g. undo, load)
  useEffect(() => {
    setInputVal(String(currentCount));
  }, [currentCount]);

  const commit = (raw: string) => {
    const n = Math.max(0, Math.min(200, parseInt(raw, 10)));
    if (!isNaN(n)) {
      dispatchActive({ type: "PLACE_N_QUBITS", n });
      toast.success(
        n === 0
          ? "Qubits cleared from canvas"
          : `Placing ${n} qubit${n !== 1 ? "s" : ""} on canvas`,
      );
    }
    setInputVal(String(isNaN(n) ? currentCount : n));
  };

  const step = (delta: number) => {
    const cur = parseInt(inputVal, 10);
    const next = Math.max(0, Math.min(200, (isNaN(cur) ? 0 : cur) + delta));
    setInputVal(String(next));
    dispatchActive({ type: "PLACE_N_QUBITS", n: next });
    toast.success(
      next === 0
        ? "Qubits cleared from canvas"
        : `Placing ${next} qubit${next !== 1 ? "s" : ""} on canvas`,
    );
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-muted/30 px-1.5 h-8">
          <Cpu className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-[10px] font-semibold text-muted-foreground mx-1 hidden sm:inline">
            Qubits
          </span>
          <div className="flex flex-col -my-0.5">
            <button
              className="h-3.5 w-3.5 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => step(1)}
              aria-label="Increase qubit count"
              tabIndex={-1}
            >
              <ChevronUp className="h-2.5 w-2.5" />
            </button>
            <button
              className="h-3.5 w-3.5 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => step(-1)}
              aria-label="Decrease qubit count"
              tabIndex={-1}
            >
              <ChevronDown className="h-2.5 w-2.5" />
            </button>
          </div>
          <Input
            type="number"
            min={0}
            max={200}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                (e.currentTarget as HTMLInputElement).blur();
                commit((e.currentTarget as HTMLInputElement).value);
              }
            }}
            className="h-6 w-12 border-0 bg-transparent p-0 text-center text-[11px] font-bold focus-visible:ring-0 focus-visible:ring-offset-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            aria-label="Qubit count"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="font-semibold">Place N qubits</p>
        <p className="text-[10px] text-muted-foreground">
          Type a number or use ± buttons — replaces unlocked qubits with a grid layout
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

// ── Chip Size Control ─────────────────────────────────────────────────────────
// A popover button showing the current chip size. Opens a menu with preset
// sizes and a "Custom…" option that reveals W×H fields.
function ChipSizeControl() {
  const { activeTab, dispatchActive } = useWorkspace();
  const state = activeTab.state;
  const chipW = state.chipW ?? 40;
  const chipH = state.chipH ?? 40;

  const [open, setOpen] = useState(false);
  const [customW, setCustomW] = useState(String(chipW));
  const [customH, setCustomH] = useState(String(chipH));
  const [showCustom, setShowCustom] = useState(false);

  // Keep custom fields in sync with external changes
  useEffect(() => {
    setCustomW(String(chipW));
    setCustomH(String(chipH));
  }, [chipW, chipH]);

  const applySize = (w: number, h: number) => {
    const clampedW = Math.max(1, Math.min(200, w));
    const clampedH = Math.max(1, Math.min(200, h));
    dispatchActive({ type: "SET_CHIP_SIZE", w: clampedW, h: clampedH });
    // Re-layout qubits to fit the new boundary
    const QUBIT_RE = /transmon|qubit|JJ_Dolan|JJ_Manhattan|SNAIL|SQUID|star_qubit/i;
    const qubitCount = state.placements.filter(
      (p) => QUBIT_RE.test(p.componentId) && !p.locked,
    ).length;
    if (qubitCount > 0) {
      dispatchActive({ type: "PLACE_N_QUBITS", n: qubitCount });
    }
    toast.success(`Chip size set to ${clampedW} × ${clampedH} mm`);
    setOpen(false);
    setShowCustom(false);
  };

  const commitCustom = () => {
    const w = parseFloat(customW);
    const h = parseFloat(customH);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      applySize(w, h);
    } else {
      toast.error("Invalid chip size — enter positive numbers");
    }
  };

  // Find if the current size matches a preset
  const matchedPreset = CHIP_SIZE_PRESETS.find((p) => p.w === chipW && p.h === chipH);

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setShowCustom(false);
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-[11px] font-semibold tabular-nums"
              aria-label={`Chip size: ${chipW} × ${chipH} mm`}
            >
              <span className="text-muted-foreground hidden sm:inline text-[10px]">Chip</span>
              <span className="font-bold text-foreground">
                {chipW} × {chipH}
              </span>
              <span className="text-muted-foreground text-[10px]">mm</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Change chip physical size</TooltipContent>
      </Tooltip>

      <PopoverContent align="start" className="w-52 p-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 pb-1.5">
          Chip Size
        </p>
        <div className="flex flex-col gap-0.5">
          {CHIP_SIZE_PRESETS.map((preset) => {
            const isActive = preset.w === chipW && preset.h === chipH;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => applySize(preset.w, preset.h)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[12px] transition-colors hover:bg-muted",
                  isActive && "bg-primary/10 text-primary font-semibold",
                )}
              >
                <span>{preset.label}</span>
                {isActive && <span className="text-[10px] text-primary">✓</span>}
              </button>
            );
          })}

          <div className="my-1 border-t border-border" />

          {/* Custom size toggle */}
          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            className={cn(
              "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[12px] transition-colors hover:bg-muted",
              !matchedPreset && "bg-primary/10 text-primary font-semibold",
            )}
          >
            <span>Custom…</span>
            <ChevronDown
              className={cn("h-3 w-3 transition-transform", showCustom && "rotate-180")}
            />
          </button>

          {showCustom && (
            <div className="mt-1 flex items-center gap-1.5 px-1">
              <Input
                type="number"
                min={1}
                max={200}
                value={customW}
                onChange={(e) => setCustomW(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && commitCustom()}
                className="h-7 w-16 text-[11px] text-center px-1"
                placeholder="W"
                aria-label="Custom chip width in mm"
              />
              <span className="text-[11px] text-muted-foreground font-semibold">×</span>
              <Input
                type="number"
                min={1}
                max={200}
                value={customH}
                onChange={(e) => setCustomH(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && commitCustom()}
                className="h-7 w-16 text-[11px] text-center px-1"
                placeholder="H"
                aria-label="Custom chip height in mm"
              />
              <span className="text-[10px] text-muted-foreground">mm</span>
              <button
                type="button"
                onClick={commitCustom}
                className="ml-0.5 rounded bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
              >
                OK
              </button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
