import { useMemo, useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trash2, Plug, Lock, Unlock, RotateCcw, Box } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  componentMetadataQueryOptions,
  componentPinsQueryOptions,
  validateDesignQueryOptions,
} from "@/lib/bridge/queries";
import { defaultParamsFromMetadata } from "@/lib/bridge/adapters";
import { useWorkspace } from "@/lib/editor/workspace-store";
import { getSingleSelection } from "@/lib/editor/design-store";
import { metadataToFields } from "@/lib/bridge/adapters";
import { QISKIT_CATALOG } from "./qiskit-metal-catalog";
import { getRouteDefaults, buildInitialRouteOverrides } from "@/lib/editor/route-defaults";
import type {
  Placement,
  Connection,
  ValidationResult,
  ComponentPreview,
  ComponentPins,
} from "@/lib/bridge/types";

// â”€â”€â”€ Resonator detection & physics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/** Component IDs that are CPW resonators (geometry driven by electrical length) */
const RESONATOR_CLASS_IDS = new Set([
  "ResonatorCoilRect",
  "ReadoutResFC",
  // ResonatorLumped is LC â€” no CPW length physics
]);

/**
 * Parse a Qiskit Metal length string like "7mm", "6000um", "0.007m" â†’ millimetres.
 * Returns 0 for empty / unparseable inputs.
 */
function parseLengthMm(val: string | number | undefined): number {
  if (val === undefined || val === "") return 0;
  const s = String(val).trim();
  const num = parseFloat(s);
  if (isNaN(num)) return 0;
  if (s.endsWith("mm")) return num;
  if (s.endsWith("um")) return num * 0.001;
  if (s.endsWith("nm")) return num * 1e-6;
  // bare "m" â€” but guard against "mm" / "um" already handled above
  if (/\d+m$/.test(s)) return num * 1000;
  return num; // bare number â†’ assume mm
}

/**
 * Normalize length input values.
 * If the value is a bare number (e.g. "1" or "99"), appends the default unit.
 * Keeps "0" as "0".
 */
function normalizeLengthInput(val: string, defaultUnit: "mm" | "um" = "um"): string {
  const trimmed = val.trim();
  if (!trimmed) return "";
  if (trimmed === "0") return "0";
  // Check if it's a bare number (e.g. "12", "0.5", "-3")
  const isBareNumber = /^-?\d*\.?\d+$/.test(trimmed);
  if (isBareNumber) {
    return `${trimmed}${defaultUnit}`;
  }
  return trimmed;
}

interface ResonatorDiagnostics {
  lengthMm: number;
  freqGHz: number;
  turnCount: number;
  footprintWum: number;
  footprintHum: number;
  traceWidthMm: number;
  traceGapMm: number;
  filletMm: number;
  leadMm: number;
  pitchMm: number;
  colWidthMm: number;
}

/**
 * Compute resonator diagnostics from placement params.
 * All calculations are rough estimates â€” not a substitute for EM simulation.
 *
 * Physics:
 *   CPW effective permittivity on silicon  Îµ_eff â‰ˆ 6.2
 *   Î»/2 resonant frequency  f = v_ph / (2L)  where v_ph = c / âˆšÎµ_eff
 */
function computeResonatorDiagnostics(
  params: Record<string, string | number>,
  componentId: string,
): ResonatorDiagnostics {
  const isCoil = componentId === "ResonatorCoilRect";

  // ResonatorCoilRect uses "length"; ReadoutResFC may use "total_length"
  const lengthVal = params.total_length ?? params.length ?? (isCoil ? "2mm" : "1.5mm");
  const lengthMm = parseLengthMm(lengthVal);

  const traceWidthMm = parseLengthMm(
    params.trace_width ?? params.line_width ?? params.readout_cpw_width ?? (isCoil ? "1um" : "5um"),
  );
  const traceGapMm = parseLengthMm(
    params.trace_gap ?? params.gap ?? params.readout_cpw_gap ?? (isCoil ? "4um" : "5um"),
  );

  // Meander pitch (controls turn spacing)
  // For ReadoutResFC: pitch = 2 * turnradius
  // For ResonatorCoilRect: pitch = gap
  const pitchMm = parseLengthMm(
    params.meander_pitch ??
      params.meander_spacing ??
      params.gap ??
      (params.fillet ? String(parseLengthMm(params.fillet) * 2) + "mm" : isCoil ? "4um" : "100um"),
  );

  // Fillet
  const filletMm = isCoil
    ? 0
    : parseLengthMm(
        params.fillet ??
          params.readout_cpw_turnradius ??
          (params.meander_pitch ? String(parseLengthMm(params.meander_pitch) / 2) + "mm" : "50um"),
      );

  const leadMm = isCoil ? 0 : parseLengthMm(params.lead_length ?? params.readout_l1 ?? "150um");

  const colWidthMm = parseLengthMm(
    params.resonator_width ?? params.height ?? params.readout_l2 ?? (isCoil ? "40um" : "200um"),
  );

  // Turn count
  let turnCount = 1;
  let footprintWum = 0;
  let footprintHum = 0;

  if (isCoil) {
    const n = 3; // default turns
    turnCount = n;
    const x_n = lengthMm / (2 * n) - (colWidthMm + 2 * (traceGapMm + traceWidthMm) * (2 * n - 1));
    const widthMm = Math.max(0.1, x_n + 2 * n * (traceWidthMm + traceGapMm));
    footprintWum = widthMm * 1000;
    footprintHum = (colWidthMm + 2 * n * (traceWidthMm + traceGapMm)) * 1000;
  } else {
    const turn_unit_len = colWidthMm + Math.PI * filletMm;
    const body_len = lengthMm - 2 * leadMm;
    if (body_len > 0 && turn_unit_len > 0) {
      const N_ideal = (body_len + colWidthMm) / turn_unit_len;
      turnCount = Math.max(2, Math.round(N_ideal));
    } else {
      turnCount = 1;
    }
    footprintWum = (colWidthMm + 2 * traceWidthMm + 2 * traceGapMm) * 1000;
    footprintHum = (turnCount * pitchMm + 2 * leadMm) * 1000;
  }

  // Î»/2 resonant frequency on silicon substrate
  const C0 = 299_792_458; // m/s
  const EPS_EFF = 6.2; // CPW on silicon, typical value
  const vPh = C0 / Math.sqrt(EPS_EFF);
  const freqGHz = lengthMm > 0 ? vPh / (2 * lengthMm * 1e-3) / 1e9 : 0;

  return {
    lengthMm,
    freqGHz,
    turnCount,
    footprintWum,
    footprintHum,
    traceWidthMm,
    traceGapMm,
    filletMm,
    leadMm,
    pitchMm,
    colWidthMm,
  };
}

export function PropertyInspector() {
  const { activeTab, dispatchActive: dispatch } = useWorkspace();
  const state = activeTab.state;
  const sel = getSingleSelection(state.selection);

  if (state.selection.length === 0) {
    return <ValidationPanel />;
  }
  if (state.selection.length > 1) {
    const selPlacements = state.selection
      .filter((s) => s.kind === "placement")
      .map((s) => state.placements.find((p) => p.id === s.id))
      .filter(Boolean) as Placement[];
    if (selPlacements.length > 1) {
      return <MultiPlacementInspector placements={selPlacements} />;
    }
    return <EmptyState text={`${state.selection.length} objects selected.`} />;
  }
  if (sel?.kind === "placement") {
    const placement = state.placements.find((p) => p.id === sel.id);
    if (!placement) return <EmptyState text="Placement no longer exists." />;
    return <PlacementInspector placement={placement} />;
  }
  const conn = state.connections.find((c) => c.id === sel!.id);
  if (!conn) return <EmptyState text="Connection no longer exists." />;
  return <ConnectionInspector connection={conn} />;
}

function useLocalValue<T>(propValue: T, onCommit: (v: T) => void) {
  const [local, setLocal] = useState<T>(propValue);
  useEffect(() => setLocal(propValue), [propValue]);
  const commit = useCallback(() => onCommit(local), [local, onCommit]);
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") commit();
    },
    [commit],
  );
  return { local, setLocal, commit, onKeyDown };
}

function PlacementInspector({ placement }: { placement: Placement }) {
  const { activeTab, dispatchActive: dispatch } = useWorkspace();
  const state = activeTab.state;
  const metaQ = useQuery(componentMetadataQueryOptions(placement.componentId));
  const pinsQ = useQuery(componentPinsQueryOptions(placement.componentId));

  const fields = useMemo(() => (metaQ.data ? metadataToFields(metaQ.data) : []), [metaQ.data]);

  const update = useCallback(
    (patch: Partial<Placement>) => dispatch({ type: "UPDATE_PLACEMENT", id: placement.id, patch }),
    [dispatch, placement.id],
  );
  const updateParam = useCallback(
    (k: string, v: string) => update({ params: { ...placement.params, [k]: v } }),
    [update, placement.params],
  );

  const nameField = useLocalValue(placement.name, (v) => update({ name: v }));
  const xField = useLocalValue(String(placement.x), (v) => update({ x: parseFloat(v) || 0 }));
  const yField = useLocalValue(String(placement.y), (v) => update({ y: parseFloat(v) || 0 }));

  const pinNets = new Map<string, string>();
  state.connections
    .filter((c) => c.from.placementId === placement.id || c.to.placementId === placement.id)
    .forEach((c) => {
      const fromP = state.placements.find((p) => p.id === c.from.placementId);
      const toP = state.placements.find((p) => p.id === c.to.placementId);
      if (c.from.placementId === placement.id && toP) {
        pinNets.set(c.from.pinName, `${toP.name}.${c.to.pinName}`);
      }
      if (c.to.placementId === placement.id && fromP) {
        pinNets.set(c.to.pinName, `${fromP.name}.${c.from.pinName}`);
      }
    });

  const isOverlapping = state.placements.some(
    (p) =>
      p.id !== placement.id && Math.sqrt((p.x - placement.x) ** 2 + (p.y - placement.y) ** 2) < 0.4,
  );

  return (
    <div className="flex flex-col gap-3 text-xs min-w-[190px]">
      {isOverlapping && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
          Warning: overlaps with another placement
        </div>
      )}
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Placement
          </p>
          <p className="text-sm font-bold text-foreground">{placement.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {placement.componentId}
            {(() => {
              const connCount = state.connections.filter(
                (c) => c.from.placementId === placement.id || c.to.placementId === placement.id,
              ).length;
              return connCount > 0 ? ` Â· ${connCount} connection${connCount > 1 ? "s" : ""}` : "";
            })()}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: "MIRROR_PLACEMENT", id: placement.id })}
            className="h-7 gap-1 px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Mirror horizontally"
          >
            <span className="text-[10px] font-bold">M</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (placement.locked) {
                dispatch({ type: "UNLOCK_PLACEMENT", id: placement.id });
              } else {
                dispatch({ type: "LOCK_PLACEMENT", id: placement.id });
              }
            }}
            className="h-7 gap-1 px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={placement.locked ? "Unlock placement" : "Lock placement"}
          >
            {placement.locked ? (
              <Lock className="h-3 w-3 text-amber-500" />
            ) : (
              <Unlock className="h-3 w-3" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (metaQ.data) {
                update({ params: defaultParamsFromMetadata(metaQ.data) });
              }
            }}
            disabled={!metaQ.data}
            className="h-7 gap-1 px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Reset parameters to defaults"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => dispatch({ type: "DUPLICATE_PLACEMENT", id: placement.id })}
            className="h-7 gap-1 px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Box className="h-3 w-3" /> Duplicate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              dispatch({ type: "DELETE_PLACEMENT", id: placement.id });
              dispatch({ type: "SELECT", selection: [] });
              (document.activeElement as HTMLElement)?.blur();
            }}
            className="h-7 gap-1 px-2 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </Button>
        </div>
      </div>

      <Section title="Position">
        <Field label="Name">
          <Input
            value={nameField.local}
            onChange={(e) => nameField.setLocal(e.target.value)}
            onBlur={nameField.commit}
            onKeyDown={nameField.onKeyDown}
            className="h-7 text-[11px]"
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="x (mm)">
            <Input
              type="number"
              step="0.05"
              value={xField.local}
              onChange={(e) => xField.setLocal(e.target.value)}
              onBlur={xField.commit}
              onKeyDown={xField.onKeyDown}
              className="h-7 text-[11px]"
            />
          </Field>
          <Field label="y (mm)">
            <Input
              type="number"
              step="0.05"
              value={yField.local}
              onChange={(e) => yField.setLocal(e.target.value)}
              onBlur={yField.commit}
              onKeyDown={yField.onKeyDown}
              className="h-7 text-[11px]"
            />
          </Field>
        </div>
        <Field label="Rotation (deg)">
          <Input
            type="number"
            step="1"
            defaultValue={placement.rotation}
            onBlur={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v)) update({ rotation: ((v % 360) + 360) % 360 });
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = parseInt((e.currentTarget as HTMLInputElement).value, 10);
                if (!isNaN(v)) update({ rotation: ((v % 360) + 360) % 360 });
              }
            }}
            className="h-7 text-[11px]"
          />
        </Field>
        <Field label="Mirror">
          <div className="flex items-center gap-2">
            <Switch
              checked={placement.mirrorX ?? false}
              onCheckedChange={() => dispatch({ type: "MIRROR_PLACEMENT", id: placement.id })}
            />
            <span className="text-[11px] text-muted-foreground">
              {placement.mirrorX ? "Mirrored" : "Normal"}
            </span>
          </div>
        </Field>
      </Section>

      <Section title="Parameters (from bridge)">
        {metaQ.isLoading && <p className="text-muted-foreground">Loading metadataâ€¦</p>}
        {metaQ.error && <p className="text-destructive">Bridge error: {String(metaQ.error)}</p>}
        {fields.length === 0 && !metaQ.isLoading && !metaQ.error && (
          <p className="text-muted-foreground">No parameters declared.</p>
        )}
        <ParamFields fields={fields} placement={placement} updateParam={updateParam} />
      </Section>

      <Section title="Pins">
        {pinsQ.isLoading && <p className="text-muted-foreground">Loading pinsâ€¦</p>}
        {pinsQ.error && <p className="text-destructive">Bridge error: {String(pinsQ.error)}</p>}
        {pinsQ.data && pinsQ.data.pins.length === 0 && (
          <p className="text-muted-foreground">No pins defined.</p>
        )}
        {pinsQ.data && pinsQ.data.pins.length > 0 && (
          <table className="w-full text-[10px]">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-1 py-1 text-left">Pin</th>
                <th className="px-1 py-1 text-left">Dir</th>
                <th className="px-1 py-1 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {pinsQ.data.pins.map((p) => (
                <tr key={p.name} className="border-t border-border">
                  <td className="px-1 py-1 font-semibold">{p.name}</td>
                  <td className="px-1 py-1 uppercase text-muted-foreground">{p.direction}</td>
                  <td className="px-1 py-1 text-right">
                    {pinNets.has(p.name) ? (
                      <span
                        className="inline-flex items-center gap-1 text-primary"
                        title={pinNets.get(p.name)}
                      >
                        <Plug className="h-3 w-3 shrink-0" />
                        <span className="max-w-[80px] truncate">{pinNets.get(p.name)}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">open</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}

function ParamFields({
  fields,
  placement,
  updateParam,
}: {
  fields: ReturnType<typeof metadataToFields>;
  placement: Placement;
  updateParam: (k: string, v: string) => void;
}) {
  const [localVals, setLocalVals] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    fields.forEach((f) => {
      init[f.name] = String(placement.params[f.name] ?? f.defaultValue);
    });
    return init;
  });

  useEffect(() => {
    const next: Record<string, string> = {};
    fields.forEach((f) => {
      next[f.name] = String(placement.params[f.name] ?? f.defaultValue);
    });
    setLocalVals(next);
  }, [fields, placement.params]);

  const commit = (name: string) => {
    updateParam(name, localVals[name] ?? "");
  };

  const setVal = (name: string, val: string) => {
    setLocalVals((prev) => ({ ...prev, [name]: val }));
  };

  const onKeyDown = (e: React.KeyboardEvent, name: string) => {
    if (e.key === "Enter") commit(name);
  };

  const affectsGeometry = (name: string) =>
    /(length|width|height|radius|size|gap|pitch|spacing|diameter|thickness|extent)/i.test(name);

  return (
    <>
      {fields.map((f) => {
        const current = localVals[f.name] ?? String(placement.params[f.name] ?? f.defaultValue);
        const isDefault = String(current) === String(f.defaultValue);
        const geo = affectsGeometry(f.name);
        return (
          <Field key={f.name} label={`${f.label}${f.unit ? ` (${f.unit})` : ""}`} geo={geo}>
            <div className="flex items-center gap-1">
              {f.kind === "enum" && f.options ? (
                <Select value={current} onValueChange={(v) => updateParam(f.name, v)}>
                  <SelectTrigger className="h-7 flex-1 text-[11px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : f.kind === "bool" ? (
                <Switch
                  checked={current === "true"}
                  onCheckedChange={(v) => updateParam(f.name, v ? "true" : "false")}
                />
              ) : (
                <Input
                  value={current}
                  onChange={(e) => setVal(f.name, e.target.value)}
                  onBlur={() => commit(f.name)}
                  onKeyDown={(e) => onKeyDown(e, f.name)}
                  className="h-7 flex-1 font-mono text-[11px]"
                />
              )}
              {!isDefault && (
                <button
                  onClick={() => {
                    setVal(f.name, String(f.defaultValue));
                    updateParam(f.name, String(f.defaultValue));
                  }}
                  title={`Reset to default (${f.defaultValue})`}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
            </div>
            {f.description && (
              <span className="text-[10px] text-muted-foreground">{f.description}</span>
            )}
          </Field>
        );
      })}
    </>
  );
}

// â”€â”€â”€ Route defaults â€” imported from @/lib/editor/route-defaults â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ROUTE_COMPONENT_DEFAULTS, getRouteDefaults, buildInitialRouteOverrides
// are imported at the top of this file.

function RouteMetricsPanel({ connection }: { connection: Connection }) {
  const svg = connection.cachedSvg ?? "";
  const overrides = connection.routeOverrides ?? {};
  const routeId = connection.routeComponentId ?? "RouteMeander";
  // Use live defaults for whatever route component is selected
  const defaults = getRouteDefaults(routeId);

  // Show the stored override value; if absent (user cleared it), show the
  // component default tagged with "Â· dflt".
  const showVal = (key: string, fallback: string) => {
    const v = overrides[key];
    if (v !== undefined && v !== "") return String(v);
    if (defaults[key]) return `${defaults[key]} \u00b7 dflt`;
    return fallback;
  };

  const targetLength = showVal("total_length", "â€”");
  const filletRadius = showVal("fillet", "dflt");
  const leadLength = showVal("lead_length", "dflt");
  const traceWidth = showVal("trace_width", "dflt");
  const traceGap = showVal("trace_gap", "dflt");

  // Parse actual rendered path length from SVG data-attributes if the backend embeds them
  const actualLength = (() => {
    if (!svg) return "â€”";
    const match = svg.match(/data-actual-length="([^"]+)"/);
    return match ? match[1] : "rendered âœ“";
  })();

  const hasGeometry = !!connection.cachedSvg;

  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
      <span className="text-muted-foreground">Target length</span>
      <span className="font-mono text-right">{targetLength}</span>
      <span className="text-muted-foreground">Actual length</span>
      <span className="font-mono text-right">{actualLength}</span>
      <span className="text-muted-foreground">Fillet radius</span>
      <span
        className={`font-mono text-right ${overrides.fillet ? "" : "text-muted-foreground/70"}`}
      >
        {filletRadius}
      </span>
      <span className="text-muted-foreground">Lead length</span>
      <span
        className={`font-mono text-right ${overrides.lead_length ? "" : "text-muted-foreground/70"}`}
      >
        {leadLength}
      </span>
      <span className="text-muted-foreground">Trace width</span>
      <span
        className={`font-mono text-right ${overrides.trace_width ? "" : "text-muted-foreground/70"}`}
      >
        {traceWidth}
      </span>
      <span className="text-muted-foreground">Trace gap</span>
      <span
        className={`font-mono text-right ${overrides.trace_gap ? "" : "text-muted-foreground/70"}`}
      >
        {traceGap}
      </span>
      <span className="text-muted-foreground">Geometry</span>
      <span className={`font-mono text-right ${hasGeometry ? "text-green-600" : "text-amber-500"}`}>
        {hasGeometry ? "cached" : "pendingâ€¦"}
      </span>
      {connection.locked && (
        <>
          <span className="text-muted-foreground">Lock</span>
          <span className="font-mono text-right text-primary">locked</span>
        </>
      )}
      <span className="col-span-2 mt-0.5 text-[9px] text-muted-foreground/60 italic">
        Â· dflt = Qiskit Metal default (field is blank)
      </span>
    </div>
  );
}

function FilletField({
  connection,
  dispatch,
  defaultValue = "99um",
}: {
  connection: Connection;
  dispatch: (a: any) => void;
  defaultValue?: string;
}) {
  // Show the stored override if present, else fall back to the component default
  const storedVal = connection.routeOverrides?.fillet;
  const rawValue = storedVal !== undefined ? String(storedVal) : defaultValue;
  const isDefault = storedVal === undefined;

  const [local, setLocal] = useState(rawValue);
  useEffect(() => setLocal(rawValue), [rawValue]);

  // Check if value is a negative number (bare or with unit)
  const isNegative = (() => {
    const num = parseFloat(local.replace(/[^0-9.\-]/g, ""));
    return !isNaN(num) && num < 0;
  })();

  const commit = () => {
    let val = local.trim();
    // If the user cleared the field entirely â†’ remove the override (revert to default)
    if (!val) {
      updateRouteOverride(connection.id, "fillet", "", dispatch, connection.routeOverrides);
      setLocal(defaultValue);
      return;
    }
    if (isNegative) {
      // Replace negative with absolute value + original unit suffix
      const unitMatch = local.match(/[a-zA-Z]+/);
      const absVal = Math.abs(parseFloat(local));
      val = unitMatch ? `${absVal}${unitMatch[0]}` : String(absVal);
    }
    const normalized = normalizeLengthInput(val, "um");
    setLocal(normalized);
    updateRouteOverride(connection.id, "fillet", normalized, dispatch, connection.routeOverrides);
  };

  return (
    <Field label="Fillet">
      <div className="flex items-center gap-1">
        <Input
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          placeholder={`e.g. ${defaultValue}`}
          className={`h-7 flex-1 font-mono text-[11px] ${isNegative ? "border-destructive ring-1 ring-destructive" : isDefault ? "text-muted-foreground" : ""}`}
          title={isDefault ? `Qiskit Metal default: ${defaultValue}` : undefined}
        />
        {!isDefault && (
          <button
            onClick={() => {
              setLocal(defaultValue);
              updateRouteOverride(connection.id, "fillet", "", dispatch, connection.routeOverrides);
            }}
            title={`Reset to default (${defaultValue})`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Reset fillet to default"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>
      {isNegative && (
        <span className="text-[10px] text-destructive">
          Fillet radius must be â‰¥ 0. Will be corrected on commit.
        </span>
      )}
      {isDefault && (
        <span className="text-[9px] text-muted-foreground/60 italic">
          Qiskit Metal default â€” edit to override
        </span>
      )}
    </Field>
  );
}

function ConnectionInspector({ connection }: { connection: Connection }) {
  const { activeTab, dispatchActive: dispatch } = useWorkspace();
  const state = activeTab.state;
  const fromP = state.placements.find((p) => p.id === connection.from.placementId);
  const toP = state.placements.find((p) => p.id === connection.to.placementId);
  // Pull supported route components from the originating placement's metadata.
  const metaQ = useQuery(componentMetadataQueryOptions(fromP?.componentId ?? ""));
  const routeOptions = metaQ.data?.supportedRouteComponents ?? [];

  // Resolved defaults for the currently selected route component
  const activeRouteId = connection.routeComponentId ?? "RouteMeander";
  const currentDefaults = getRouteDefaults(activeRouteId);

  // Descriptive hint built from the live defaults object
  const defaultsHint = [
    `length ${currentDefaults.total_length}`,
    `fillet ${currentDefaults.fillet}`,
    `lead ${currentDefaults.lead_length}`,
    `width ${currentDefaults.trace_width}`,
    `gap ${currentDefaults.trace_gap}`,
  ].join(" Â· ");

  // Helper: read override value, falling back to the component's default
  const overrideVal = (key: string): string =>
    String(connection.routeOverrides?.[key] ?? currentDefaults[key] ?? "");

  return (
    <div className="flex flex-col gap-3 text-xs min-w-[190px]">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Connection {connection.locked && <span className="text-primary">(Locked)</span>}
          </p>
          <p className="text-sm font-bold text-foreground">
            {fromP?.name ?? "?"}.{connection.from.pinName}
            <span className="mx-1 text-muted-foreground">â†’</span>
            {toP?.name ?? "?"}.{connection.to.pinName}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              dispatch({
                type: connection.locked ? "UNLOCK_CONNECTION" : "LOCK_CONNECTION",
                id: connection.id,
              })
            }
            className="h-7 gap-1 px-2"
          >
            {connection.locked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
            {connection.locked ? "Unlock" : "Lock"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              dispatch({ type: "DELETE_CONNECTION", id: connection.id });
              dispatch({ type: "SELECT", selection: [] });
              (document.activeElement as HTMLElement)?.blur();
            }}
            className="h-7 gap-1 px-2 text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3 w-3" /> Delete
          </Button>
        </div>
      </div>

      <Section title="Route component">
        {routeOptions.length === 0 ? (
          <Input
            value={connection.routeComponentId ?? ""}
            onChange={(e) => {
              const newId = e.target.value || undefined;
              // Pre-populate defaults for the newly typed component ID on blur
              dispatch({
                type: "UPDATE_CONNECTION",
                id: connection.id,
                patch: { routeComponentId: newId },
              });
            }}
            onBlur={(e) => {
              const newId = e.target.value.trim() || undefined;
              const newDefaults = buildInitialRouteOverrides(newId, connection.routeOverrides);
              dispatch({
                type: "UPDATE_CONNECTION",
                id: connection.id,
                patch: {
                  routeComponentId: newId,
                  routeOverrides: newDefaults,
                },
              });
            }}
            placeholder="e.g. RouteMeander"
            className="h-7 font-mono text-[11px]"
          />
        ) : (
          <Select
            value={connection.routeComponentId ?? ""}
            onValueChange={(v) => {
              // When route component changes: keep user-edited overrides but
              // fill in any keys that are still at the old defaults (or blank)
              // with the new component's defaults.
              const newDefaults = buildInitialRouteOverrides(v, connection.routeOverrides);
              dispatch({
                type: "UPDATE_CONNECTION",
                id: connection.id,
                patch: {
                  routeComponentId: v,
                  routeOverrides: newDefaults,
                },
              });
            }}
          >
            <SelectTrigger className="h-7 text-[11px]">
              <SelectValue placeholder="Choose route component" />
            </SelectTrigger>
            <SelectContent>
              {routeOptions.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-[10px] text-muted-foreground">
          Bridge will instantiate this QComponent to generate the route geometry.
        </p>
      </Section>

      <Section title="Route overrides">
        <p className="text-[9px] text-muted-foreground/70 -mt-1 mb-0.5">
          Pre-filled with {activeRouteId} defaults. Clear a field to reset to Qiskit Metal default.
          Defaults: {defaultsHint}
        </p>
        <RouteOverrideField
          label="Total length"
          placeholder={`e.g. ${currentDefaults.total_length}`}
          value={overrideVal("total_length")}
          onCommit={(v) =>
            updateRouteOverride(
              connection.id,
              "total_length",
              v,
              dispatch,
              connection.routeOverrides,
            )
          }
          defaultUnit="mm"
          isDefault={!connection.routeOverrides?.total_length}
          defaultValue={currentDefaults.total_length}
        />
        <FilletField
          connection={connection}
          dispatch={dispatch}
          defaultValue={currentDefaults.fillet}
        />
        <RouteOverrideField
          label="Lead length"
          placeholder={`e.g. ${currentDefaults.lead_length}`}
          value={overrideVal("lead_length")}
          onCommit={(v) =>
            updateRouteOverride(
              connection.id,
              "lead_length",
              v,
              dispatch,
              connection.routeOverrides,
            )
          }
          defaultUnit="um"
          isDefault={!connection.routeOverrides?.lead_length}
          defaultValue={currentDefaults.lead_length}
        />
        <RouteOverrideField
          label="Trace width"
          placeholder={`e.g. ${currentDefaults.trace_width}`}
          value={overrideVal("trace_width")}
          onCommit={(v) =>
            updateRouteOverride(
              connection.id,
              "trace_width",
              v,
              dispatch,
              connection.routeOverrides,
            )
          }
          defaultUnit="um"
          isDefault={!connection.routeOverrides?.trace_width}
          defaultValue={currentDefaults.trace_width}
        />
        <RouteOverrideField
          label="Trace gap"
          placeholder={`e.g. ${currentDefaults.trace_gap}`}
          value={overrideVal("trace_gap")}
          onCommit={(v) =>
            updateRouteOverride(connection.id, "trace_gap", v, dispatch, connection.routeOverrides)
          }
          defaultUnit="um"
          isDefault={!connection.routeOverrides?.trace_gap}
          defaultValue={currentDefaults.trace_gap}
        />
      </Section>
    </div>
  );
}

function MultiPlacementInspector({ placements }: { placements: Placement[] }) {
  const { activeTab, dispatchActive: dispatch } = useWorkspace();
  const ids = placements.map((p) => p.id);

  // Only show common params if all same component type
  const allSameType = placements.every((p) => p.componentId === placements[0].componentId);
  const metaQ = useQuery(
    componentMetadataQueryOptions(allSameType ? placements[0].componentId : ""),
  );
  const fields = useMemo(() => (metaQ.data ? metadataToFields(metaQ.data) : []), [metaQ.data]);

  // Compute shared value per field: single value if all same, "â€”" if mixed
  const sharedValues = useMemo(() => {
    const map = new Map<string, { value: string; mixed: boolean }>();
    fields.forEach((f) => {
      const vals = placements.map((p) => String(p.params[f.name] ?? f.defaultValue));
      const first = vals[0];
      const mixed = vals.some((v) => v !== first);
      map.set(f.name, { value: mixed ? "â€”" : first, mixed });
    });
    return map;
  }, [fields, placements]);

  const [localValues, setLocalValues] = useState<Record<string, string>>({});

  const updateParamBulk = (k: string, v: string) => {
    ids.forEach((id) => {
      const p = placements.find((pl) => pl.id === id);
      if (!p) return;
      dispatch({
        type: "UPDATE_PLACEMENT",
        id,
        patch: { params: { ...p.params, [k]: v } },
      });
    });
  };

  const commit = (k: string) => {
    const v = localValues[k];
    if (v !== undefined) updateParamBulk(k, v);
  };

  const setVal = (k: string, v: string) => {
    setLocalValues((prev) => ({ ...prev, [k]: v }));
  };

  const align = (mode: "left" | "right" | "top" | "bottom" | "centerH" | "centerV") => {
    const xs = placements.map((p) => p.x);
    const ys = placements.map((p) => p.y);
    let targetX: number | null = null;
    let targetY: number | null = null;
    if (mode === "left") targetX = Math.min(...xs);
    if (mode === "right") targetX = Math.max(...xs);
    if (mode === "top") targetY = Math.max(...ys);
    if (mode === "bottom") targetY = Math.min(...ys);
    if (mode === "centerH") targetX = (Math.min(...xs) + Math.max(...xs)) / 2;
    if (mode === "centerV") targetY = (Math.min(...ys) + Math.max(...ys)) / 2;
    ids.forEach((id) => {
      const p = placements.find((pl) => pl.id === id);
      if (!p) return;
      dispatch({
        type: "UPDATE_PLACEMENT",
        id,
        patch: {
          x: targetX !== null ? targetX : p.x,
          y: targetY !== null ? targetY : p.y,
        },
      });
    });
  };

  const distribute = (axis: "x" | "y") => {
    const sorted = [...placements].sort((a, b) => (axis === "x" ? a.x - b.x : a.y - b.y));
    const min = sorted[0][axis];
    const max = sorted[sorted.length - 1][axis];
    const step = (max - min) / (sorted.length - 1);
    sorted.forEach((p, i) => {
      dispatch({
        type: "UPDATE_PLACEMENT",
        id: p.id,
        patch: { [axis]: min + step * i },
      });
    });
  };

  return (
    <div className="flex flex-col gap-3 text-xs min-w-[190px]">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {placements.length} placements selected
          </p>
          {(() => {
            const state = activeTab.state;
            const connCount = state.connections.filter(
              (c) => ids.includes(c.from.placementId) || ids.includes(c.to.placementId),
            ).length;
            return connCount > 0 ? (
              <p className="text-[10px] text-muted-foreground">
                {connCount} connection{connCount > 1 ? "s" : ""}
              </p>
            ) : null;
          })()}
        </div>
        {allSameType && metaQ.data && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const baseDefaults = defaultParamsFromMetadata(metaQ.data!);
              const catalogEntry = QISKIT_CATALOG.find(
                (c) =>
                  c.className ===
                  activeTab.state.placements.find((p) => p.id === ids[0])?.componentId,
              );
              const defaults = catalogEntry?.defaultParams
                ? { ...baseDefaults, ...catalogEntry.defaultParams }
                : baseDefaults;
              ids.forEach((id) =>
                dispatch({ type: "UPDATE_PLACEMENT", id, patch: { params: defaults } }),
              );
            }}
            className="h-7 gap-1 px-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Reset all params to defaults"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        )}
      </div>

      {allSameType && fields.length > 0 && (
        <Section title={`Common params (${placements[0].componentId})`}>
          <div className="flex flex-col gap-2">
            {fields.map((f) => {
              const shared = sharedValues.get(f.name);
              const value = shared?.value ?? f.defaultValue;
              const mixed = shared?.mixed ?? false;
              return (
                <Field key={f.name} label={`${f.label}${f.unit ? ` (${f.unit})` : ""}`}>
                  <div className="flex items-center gap-1">
                    {f.kind === "enum" && f.options ? (
                      <Select
                        value={mixed ? "" : value}
                        onValueChange={(v) => updateParamBulk(f.name, v)}
                      >
                        <SelectTrigger className="h-7 flex-1 text-[11px]">
                          <SelectValue placeholder={mixed ? "â€” mixed â€”" : undefined} />
                        </SelectTrigger>
                        <SelectContent>
                          {f.options.map((o) => (
                            <SelectItem key={o} value={o}>
                              {o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : f.kind === "bool" ? (
                      <Switch
                        checked={!mixed && value === "true"}
                        onCheckedChange={(v) => updateParamBulk(f.name, v ? "true" : "false")}
                      />
                    ) : (
                      <Input
                        value={localValues[f.name] ?? (mixed ? "" : value)}
                        placeholder={mixed ? "â€” mixed â€”" : undefined}
                        onChange={(e) => setVal(f.name, e.target.value)}
                        onBlur={() => commit(f.name)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commit(f.name);
                        }}
                        className="h-7 flex-1 font-mono text-[11px]"
                      />
                    )}
                    {!mixed && String(value) !== String(f.defaultValue) && (
                      <button
                        onClick={() => updateParamBulk(f.name, String(f.defaultValue))}
                        title={`Reset all to default (${f.defaultValue})`}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <RotateCcw className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </Field>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Geometry">
        {(() => {
          const xs = placements.map((p) => p.x);
          const ys = placements.map((p) => p.y);
          const minX = Math.min(...xs),
            maxX = Math.max(...xs);
          const minY = Math.min(...ys),
            maxY = Math.max(...ys);
          const w = maxX - minX,
            h = maxY - minY;
          const cx = (minX + maxX) / 2,
            cy = (minY + maxY) / 2;
          return (
            <div className="grid grid-cols-2 gap-1 text-[11px]">
              <span className="text-muted-foreground">Count</span>
              <span className="font-mono text-right">{placements.length}</span>
              <span className="text-muted-foreground">Width</span>
              <span className="font-mono text-right">{w.toFixed(3)} mm</span>
              <span className="text-muted-foreground">Height</span>
              <span className="font-mono text-right">{h.toFixed(3)} mm</span>
              <span className="text-muted-foreground">Center</span>
              <span className="font-mono text-right">
                {cx.toFixed(3)}, {cy.toFixed(3)}
              </span>
            </div>
          );
        })()}
      </Section>

      <Section title="Align">
        <div className="grid grid-cols-3 gap-1">
          <AlignBtn label="Left" onClick={() => align("left")} />
          <AlignBtn label="Center H" onClick={() => align("centerH")} />
          <AlignBtn label="Right" onClick={() => align("right")} />
          <AlignBtn label="Top" onClick={() => align("top")} />
          <AlignBtn label="Center V" onClick={() => align("centerV")} />
          <AlignBtn label="Bottom" onClick={() => align("bottom")} />
        </div>
      </Section>

      <Section title="Distribute">
        <div className="grid grid-cols-2 gap-1">
          <AlignBtn label="Horizontal" onClick={() => distribute("x")} />
          <AlignBtn label="Vertical" onClick={() => distribute("y")} />
        </div>
      </Section>
    </div>
  );
}

function AlignBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-sm border border-border bg-muted/30 px-1 py-1 text-[10px] text-foreground hover:bg-muted"
    >
      {label}
    </button>
  );
}

function updateRouteOverride(
  id: string,
  key: string,
  value: string,
  dispatch: (a: any) => void,
  existingOverrides?: Record<string, string | number>,
) {
  const next = { ...existingOverrides };
  if (value.trim()) {
    next[key] = value;
  } else {
    delete next[key];
  }
  dispatch({
    type: "UPDATE_CONNECTION",
    id,
    patch: { routeOverrides: Object.keys(next).length > 0 ? next : undefined },
  });
}

function RouteOverrideField({
  label,
  placeholder,
  value,
  onCommit,
  defaultUnit = "um",
  isDefault = false,
  defaultValue,
}: {
  label: string;
  placeholder: string;
  value: string;
  onCommit: (v: string) => void;
  defaultUnit?: "mm" | "um";
  /** True when the value currently shown is the component default (not a user override) */
  isDefault?: boolean;
  /** The component's default value, shown in the reset button tooltip */
  defaultValue?: string;
}) {
  const field = useLocalValue(value, onCommit);
  return (
    <Field label={label}>
      <div className="flex items-center gap-1">
        <Input
          value={field.local}
          onChange={(e) => field.setLocal(e.target.value)}
          onBlur={field.commit}
          onKeyDown={field.onKeyDown}
          placeholder={placeholder}
          className={`h-7 flex-1 font-mono text-[11px] ${isDefault ? "text-muted-foreground" : ""}`}
          title={isDefault ? `Qiskit Metal default: ${defaultValue}` : undefined}
        />
        {!isDefault && defaultValue && (
          <button
            onClick={() => {
              field.setLocal(defaultValue);
              onCommit(defaultValue);
            }}
            title={`Reset to default (${defaultValue})`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Reset ${label} to default`}
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        )}
      </div>
      {isDefault && defaultValue && (
        <span className="text-[9px] text-muted-foreground/60 italic">
          Qiskit Metal default â€” edit to override
        </span>
      )}
    </Field>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="border-b border-border bg-muted/40 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground">
        {title}
      </div>
      <div className="flex flex-col gap-2 p-2">{children}</div>
    </div>
  );
}

function ValidationPanel() {
  const { activeTab } = useWorkspace();
  const state = activeTab.state;
  const doc = useMemo(
    () => ({ placements: state.placements, connections: state.connections }),
    [state.placements, state.connections],
  );
  const vq = useQuery(validateDesignQueryOptions(doc));
  const result = vq.data;

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of state.placements) {
      map.set(p.componentId, (map.get(p.componentId) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [state.placements]);

  const stats = useMemo(() => {
    const locked = state.placements.filter((p) => p.locked).length;
    const avgConnections =
      state.placements.length > 0 ? (state.connections.length * 2) / state.placements.length : 0;
    return { locked, avgConnections: avgConnections.toFixed(1) };
  }, [state.placements, state.connections]);

  if (vq.isLoading) {
    return <EmptyState text="Validating designâ€¦" />;
  }
  if (!result || result.issues.length === 0) {
    return (
      <div className="flex flex-col gap-3 text-xs">
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-center text-[11px] text-green-700">
          Design is valid
        </div>
        {counts.length > 0 && (
          <div className="rounded-md border border-border bg-card p-2">
            <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
              Design stats
            </p>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
              <span className="text-muted-foreground">Placements</span>
              <span className="font-mono text-right">{state.placements.length}</span>
              <span className="text-muted-foreground">Connections</span>
              <span className="font-mono text-right">{state.connections.length}</span>
              <span className="text-muted-foreground">Locked</span>
              <span className="font-mono text-right">{stats.locked}</span>
              <span className="text-muted-foreground">Avg conn/placement</span>
              <span className="font-mono text-right">{stats.avgConnections}</span>
            </div>
            <p className="mt-2 mb-1 text-[10px] font-bold uppercase text-muted-foreground">
              Component counts
            </p>
            <ul className="flex flex-col gap-0.5">
              {counts.map(([cid, count]) => (
                <li key={cid} className="flex justify-between text-[11px] text-foreground">
                  <span className="truncate">{cid}</span>
                  <span className="font-mono font-bold text-muted-foreground">{count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {state.connections.length > 0 && (
          <div className="rounded-md border border-border bg-card p-2">
            <p className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
              Connections ({state.connections.length})
            </p>
            <ul className="flex flex-col gap-0.5 max-h-40 overflow-y-auto">
              {state.connections.map((c) => {
                const fromP = state.placements.find((p) => p.id === c.from.placementId);
                const toP = state.placements.find((p) => p.id === c.to.placementId);
                return (
                  <li key={c.id} className="text-[11px] text-foreground truncate">
                    {fromP?.name ?? c.from.placementId}.{c.from.pinName} â†’{" "}
                    {toP?.name ?? c.to.placementId}.{c.to.pinName}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <EmptyState text="Select a placement or connection to inspect its properties." />
      </div>
    );
  }

  const errors = result.issues.filter((i) => i.severity === "error");
  const warnings = result.issues.filter((i) => i.severity === "warning");
  const infos = result.issues.filter((i) => i.severity === "info");

  return (
    <div className="flex flex-col gap-2 text-xs">
      {errors.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2">
          <p className="mb-1 text-[10px] font-bold uppercase text-destructive">
            Errors ({errors.length})
          </p>
          <ul className="flex flex-col gap-1">
            {errors.map((e, i) => (
              <li key={i} className="text-[11px] text-destructive">
                {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2">
          <p className="mb-1 text-[10px] font-bold uppercase text-amber-700">
            Warnings ({warnings.length})
          </p>
          <ul className="flex flex-col gap-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-[11px] text-amber-800">
                {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {infos.length > 0 && (
        <div className="rounded-md border border-blue-100 bg-blue-50 p-2">
          <p className="mb-1 text-[10px] font-bold uppercase text-blue-700">
            Info ({infos.length})
          </p>
          <ul className="flex flex-col gap-1">
            {infos.map((info, i) => (
              <li key={i} className="text-[11px] text-blue-800">
                {info.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  geo,
  children,
}: {
  label: string;
  geo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {geo && (
          <span title="Affects geometry">
            <Box className="h-2.5 w-2.5 text-primary" />
          </span>
        )}
      </Label>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
      {text}
    </div>
  );
}
