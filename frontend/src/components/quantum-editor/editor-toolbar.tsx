import { type RefObject, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Undo2, Redo2, MousePointer2, Hand, Code2, Maximize,
  Layers, Save, Download, ChevronDown, FileCode2, PenLine, Trash2, Upload, FileJson, Map, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { type Tool } from "@/lib/editor/design-store";
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
}
 
function triggerDownload(url: string, filename: string) {
  Object.assign(document.createElement("a"), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}
 
export function EditorToolbar({ libOpen, onToggleLib, onFitView, onShowCode, canvasRef }: Props) {
  const { activeTab, dispatchActive, saveAll } = useWorkspace();
  const state    = activeTab.state;
  const dispatch = dispatchActive;
  const canUndo  = state.past.length > 0;
  const canRedo  = state.future.length > 0;
  const qc       = useQueryClient();
  const [showClearDialog, setShowClearDialog] = useState(false);

  const setTool = (t: Tool) => dispatch({ type: "SET_TOOL", tool: t });

  const handleSave = useCallback(() => { saveAll(); toast.success("Design saved"); }, [saveAll]);

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
    if (!svg) { toast.error("Nothing to export"); return; }
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    triggerDownload(URL.createObjectURL(new Blob([clone.outerHTML], { type: "image/svg+xml" })), "schematic.svg");
    toast.success("SVG downloaded");
  }, [canvasRef]);

  const downloadRaster = useCallback((format: "png" | "jpg") => {
    const svg = canvasRef.current?.getSvgElement();
    if (!svg) { toast.error("Nothing to export"); return; }
    const { width, height } = svg.getBoundingClientRect();
    const scale = 2;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(width * scale));
    clone.setAttribute("height", String(height * scale));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width * scale; canvas.height = height * scale;
      const ctx = canvas.getContext("2d")!;
      if (format === "jpg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => { if (!blob) return; triggerDownload(URL.createObjectURL(blob), `schematic.${format}`); toast.success(`${format.toUpperCase()} downloaded`); }, format === "jpg" ? "image/jpeg" : "image/png", 0.95);
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  }, [canvasRef]);

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
        <TB icon={MousePointer2} label="Select" active={state.tool === "select"} onClick={() => setTool("select")} />
        <TB icon={Hand}          label="Pan"    active={state.tool === "pan"}    onClick={() => setTool("pan")} />
        <Separator orientation="vertical" className="h-6" />
        <TB icon={Undo2} label="Undo (Ctrl+Z)"       onClick={() => dispatch({ type: "UNDO" })} disabled={!canUndo} />
        <TB icon={Redo2} label="Redo (Ctrl+Shift+Z)" onClick={() => dispatch({ type: "REDO" })} disabled={!canRedo} />

        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={libOpen ? "secondary" : "ghost"} size="sm" onClick={onToggleLib}
                className={cn("h-8 gap-1.5 text-[11px]", libOpen && "bg-primary/10 text-primary hover:bg-primary/15")}>
                <Layers className="h-3.5 w-3.5" /> <span className="hidden md:inline">Components</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{libOpen ? "Hide library" : "Show library"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onFitView} className="h-8 gap-1.5 text-[11px]">
                <Maximize className="h-3.5 w-3.5" /> <span className="hidden md:inline">Fit View</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Fit all components into view (F)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" size="sm"
                onClick={() => {
                  dispatch({ type: "CLEAR_ROUTE_CACHE" });
                  qc.removeQueries({ queryKey: ["bridge", "render-route"] });
                  toast.success("Routes refreshed");
                }}
                className="h-8 gap-1.5 text-[11px]"
                disabled={state.connections.length === 0}
              >
                <RefreshCw className="h-3.5 w-3.5" /> <span className="hidden md:inline">Refresh Routes</span>
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
                className={cn("h-8 gap-1.5 text-[11px]", state.showMiniMap && "bg-primary/10 text-primary hover:bg-primary/15")}
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
                <Button variant="ghost" size="sm" onClick={handleSave} className="h-8 gap-1.5 text-[11px]">
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
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-[11px]">
                    <Download className="h-3.5 w-3.5" /> <span className="hidden md:inline">Download</span> <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Export canvas as image</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem className="gap-2 text-[12px]" onSelect={downloadSVG}><Download className="h-3.5 w-3.5" /> SVG</DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-[12px]" onSelect={() => downloadRaster("png")}><Download className="h-3.5 w-3.5" /> PNG</DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-[12px]" onSelect={() => downloadRaster("jpg")}><Download className="h-3.5 w-3.5" /> JPG</DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-[12px]" onSelect={exportDoc}><FileJson className="h-3.5 w-3.5" /> Export JSON</DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-[12px]" onSelect={importDoc}><Upload className="h-3.5 w-3.5" /> Import JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="h-6" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={() => setShowClearDialog(true)} className="h-8 gap-1.5 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" /> <span className="hidden md:inline">Clear All</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear entire canvas (all components + connections)</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 text-[11px]">
                <Code2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Code</span> <ChevronDown className="h-3 w-3 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem className="gap-2 text-[12px]" onSelect={() => onShowCode("generate")}>
                <FileCode2 className="h-3.5 w-3.5 text-primary" />
                <div><div className="font-semibold">Generate Code</div><div className="text-[10px] text-muted-foreground">Design → Python</div></div>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-[12px]" onSelect={() => onShowCode("write")}>
                <PenLine className="h-3.5 w-3.5 text-emerald-600" />
                <div><div className="font-semibold">Write Code</div><div className="text-[10px] text-muted-foreground">Python → Canvas</div></div>
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
            <AlertDialogAction onClick={confirmClear} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Clear All
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

function TB({ icon: Icon, label, active, onClick, disabled }: { icon: React.ComponentType<{ className?: string }>; label: string; active?: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" onClick={onClick} disabled={disabled}
          className={cn("h-8 w-8 rounded-md", active && "bg-primary/10 text-primary hover:bg-primary/15")}>
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
