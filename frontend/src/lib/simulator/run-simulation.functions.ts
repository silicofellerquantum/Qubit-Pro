import { createServerFn } from "@tanstack/react-start";
import { deriveAll, defaultSeedFromDesign, type DerivedAll } from "./derive-parameters";
import type { SolverId } from "./solver-registry";

export type RunSimulationInput = {
  designId: string;
  numQubits: number;
  solver: SolverId;
  variation: number;
};

export type RunSimulationResult = {
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  solver: SolverId;
  derived: DerivedAll;
  logs: { time: string; text: string; kind?: "ok" | "warn" }[];
};

function nowTs(offsetMs = 0): string {
  const d = new Date(Date.now() + offsetMs);
  return d.toTimeString().slice(0, 8);
}

function validate(input: unknown): RunSimulationInput {
  const i = input as Partial<RunSimulationInput>;
  if (!i || typeof i.designId !== "string") throw new Error("designId required");
  return {
    designId: i.designId || "demo",
    numQubits: Number(i.numQubits) || 5,
    solver: (i.solver as SolverId) || "eigenmode",
    variation: Number(i.variation) || 0,
  };
}

export const runSimulation = createServerFn({ method: "POST" })
  .inputValidator(validate)
  .handler(async ({ data }) => {
    const startedAt = nowTs();
    // Simulate compute time (kept short for snappy UX)
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));

    const seedId = `${data.designId}::v${data.variation}::${data.solver}`;
    const seed = defaultSeedFromDesign(seedId, data.numQubits);
    // Add a little physical jitter on the seed frequencies per variation
    seed.qubitFreqsGHz = seed.qubitFreqsGHz.map(
      (f) => f * (1 + ((data.variation * 0.0137) % 0.05) - 0.02),
    );
    seed.resonatorFreqsGHz = seed.resonatorFreqsGHz.map(
      (f) => f * (1 + ((data.variation * 0.0091) % 0.04) - 0.015),
    );
    const derived = deriveAll(seed);

    const logs: RunSimulationResult["logs"] = [
      { time: startedAt, text: `Initializing ${data.solver} solver…` },
      { time: nowTs(80), text: "Reading geometry and mesh…" },
      { time: nowTs(160), text: `Loaded ${derived.geometry.via_count} vias, ${derived.geometry.wirebond_count} wirebonds.` },
      { time: nowTs(240), text: "Adaptive pass 1 completed." },
      { time: nowTs(320), text: "Adaptive pass 2 completed." },
      { time: nowTs(400), text: "Adaptive pass 3 completed." },
      { time: nowTs(480), text: `Convergence achieved (residual ${derived.eigenmode.residual.toFixed(4)}).`, kind: "ok" },
      { time: nowTs(560), text: `Solved ${derived.eigenmode.modes.length} eigenmodes.` },
      { time: nowTs(620), text: `f₀ = ${derived.eigenmode.modes[0].f_GHz.toFixed(4)} GHz, Q = ${derived.eigenmode.modes[0].Q_loaded.toExponential(2)}` },
      { time: nowTs(680), text: `T₁ estimate: ${derived.coherence.T1_us.toFixed(1)} µs · T₂: ${derived.coherence.T2_us.toFixed(1)} µs` },
      { time: nowTs(720), text: `${data.solver} solution completed successfully.`, kind: "ok" },
    ];

    const finishedAt = nowTs(720);
    return {
      runId: `run_${Date.now().toString(36)}_${data.variation}`,
      startedAt,
      finishedAt,
      durationMs: 720,
      solver: data.solver,
      derived,
      logs,
    } satisfies RunSimulationResult;
  });
