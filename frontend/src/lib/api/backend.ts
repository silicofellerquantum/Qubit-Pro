/**
 * Silicofeller Quantum Studio — Backend API client
 * All requests go to VITE_BACKEND_URL (default http://localhost:5000)
 */

import type { DesignDocument } from "@/lib/bridge/types";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? "").replace(
  /\/$/,
  "",
);

// ── Generic fetch helper ──────────────────────────────────────────────────────

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("qs_token") : null;
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((options.headers ?? {}) as Record<string, string>),
    },
    ...options,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "Unknown error");
    throw new Error(`API ${res.status}: ${msg}`);
  }
  if (res.status === 204) {
    return null as unknown as T;
  }
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DRCReport {
  passed: boolean;
  violations: Array<{
    severity: "error" | "warning";
    rule: string;
    message: string;
  }>;
}

export interface FrequencyPlan {
  epsilon_eff: number;
  qubit_frequencies_GHz: Record<string, number>;
  qubit_groups: Record<string, number | string>;
  EJ_GHz: Record<string, number>;
  EC_GHz: Record<string, number>;
  resonator_frequencies_GHz: Record<string, number>;
  resonator_lengths_mm: Record<string, number>;
  detunings_GHz: Record<string, number>;
  warnings: string[];
  substrate?: string;
  metal?: string;
}

export interface PlacementQubit {
  name: string;
  x: number;
  y: number;
  orientation_deg?: number;
}

export interface PlacementEdge {
  qubit_a: string;
  pin_a?: string;
  qubit_b: string;
  pin_b?: string;
  label?: string;
}

export interface Placement {
  solver: string;
  qubits: PlacementQubit[];
  edges?: PlacementEdge[];
  topology?: string;
  cols?: number;
  rows?: number;
  pitch_mm?: number;
}

export interface MLPrediction {
  qubits: number;
  topology: string;
  class_index: number | null;
  confidence: number | null;
  method: string;
  ml_skipped?: boolean;
  reason?: string;
}

export interface GenerateResponse {
  label: string;
  num_qubits: number;
  topology: string;
  engine: string;
  interpretation: string;
  chip_image?: string;
  fabricated_image?: string;
  drc?: DRCReport;
  frequency_plan?: FrequencyPlan;
  placement?: Placement;
  code?: string;
  qclang_source?: string;
  material?: { substrate: string; metal: string };
  ml_prediction?: MLPrediction;
  error_hint?: string;
  /** Full DesignDocument for lossless round-trip persistence */
  design?: DesignDocument;
}

export interface HealthResponse {
  status: string;
  version: string;
  max_qubits: number;
  qiskit_metal: string;
  metal_version: string;
  ml_intent: string;
  pipeline: string[];
  error?: string;
}

export interface Material {
  key: string;
  label: string;
  description: string;
  epsilon_r?: number;
  loss_tangent?: number;
  substrate_thickness_um?: number;
  Tc_K?: number;
  london_penetration_depth_nm?: number;
  sheet_resistance_mOhm?: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  topology: string;
  num_qubits: number;
  target_frequency_ghz: number;
  status: string;
  substrate_material: string;
  metal_layer: string;
  has_design: boolean;
  created_at: string;
  updated_at: string;
  owner_id: string;
  design_payload?: GenerateResponse;
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<HealthResponse> {
  try {
    return await api<HealthResponse>("/health");
  } catch {
    return {
      status: "offline",
      version: "—",
      max_qubits: 0,
      qiskit_metal: "—",
      metal_version: "—",
      ml_intent: "—",
      pipeline: [],
      error: "Backend unreachable",
    };
  }
}

// ── Chip generation ───────────────────────────────────────────────────────────

export async function generateChip(
  prompt: string,
  substrate?: string,
  metal?: string,
): Promise<GenerateResponse> {
  return api<GenerateResponse>("/generate", {
    method: "POST",
    body: JSON.stringify({ prompt, substrate, metal }),
  });
}

export async function generateChipFromPrompt(
  prompt: string,
  substrate?: string,
  metal?: string,
): Promise<GenerateResponse> {
  return api<GenerateResponse>("/api/design/from-prompt", {
    method: "POST",
    body: JSON.stringify({ prompt, substrate, metal }),
  });
}

// ── QCLang ────────────────────────────────────────────────────────────────────

export interface QCLangParseResult {
  success: boolean;
  errors: Array<{ severity: string; message: string; line?: number }>;
  ast: unknown;
  num_chips: number;
  num_qubits: number;
}

export async function parseQCLang(source: string): Promise<QCLangParseResult> {
  return api<QCLangParseResult>("/api/qclang/parse", {
    method: "POST",
    body: JSON.stringify({ source }),
  });
}

export async function compileQCLang(
  source: string,
  options?: {
    target_freq_ghz?: number;
    substrate?: string;
    metal?: string;
    chip_size_mm?: number;
  },
): Promise<{ success: boolean; errors: unknown[]; result: GenerateResponse | null }> {
  return api("/api/qclang/compile", {
    method: "POST",
    body: JSON.stringify({ source, ...options }),
  });
}

export interface MetalCodeRequest {
  components: Array<Record<string, unknown>>;
  connections: Array<Record<string, unknown>>;
  variables: Record<string, unknown>;
}

export interface MetalCodeResponse {
  success: boolean;
  code: string;
  warnings: string[];
  component_count: number;
}

export async function generateMetalCode(payload: MetalCodeRequest): Promise<MetalCodeResponse> {
  return api<MetalCodeResponse>("/api/generate/metal-code", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getQCLangTemplates(): Promise<
  Array<{ name: string; description: string; source: string }>
> {
  try {
    return await api("/api/qclang/templates");
  } catch {
    return [];
  }
}

// ── Materials ─────────────────────────────────────────────────────────────────

export async function fetchMaterials(): Promise<{
  substrates: Record<string, Material>;
  metals: Record<string, Material>;
}> {
  return api("/api/materials");
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<Project[]> {
  return api<Project[]>("/api/projects");
}

export async function fetchProject(id: string): Promise<Project> {
  return api<Project>(`/api/projects/${id}`);
}

export async function createProject(data: {
  name: string;
  description?: string;
  topology?: string;
  num_qubits?: number;
  target_frequency_ghz?: number;
  substrate_material?: string;
  metal_layer?: string;
}): Promise<Project> {
  return api<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateProject(id: string, data: Partial<Project>): Promise<Project> {
  return api<Project>(`/api/projects/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteProject(id: string): Promise<void> {
  await api(`/api/projects/${id}`, { method: "DELETE" });
}

export async function saveDesignToProject(
  projectId: string,
  payload: GenerateResponse,
): Promise<void> {
  await api(`/api/projects/${projectId}/save-design`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── Verification ──────────────────────────────────────────────────────────────

export interface VerificationReport {
  id?: string;
  status: "passed" | "failed" | "warning" | "pending";
  drc_passed: boolean;
  violations: unknown[];
  frequency_collisions: unknown[];
  crosstalk_warnings: unknown[];
  summary: {
    total_issues: number;
    critical: number;
    major: number;
    minor: number;
    yield_estimate: number;
    coherence_budget?: { T1_us: number; T2_us: number };
    num_qubits?: number;
  };
}

export async function runVerification(payload: GenerateResponse): Promise<VerificationReport> {
  return api<VerificationReport>("/api/verification/check", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ── Simulations ───────────────────────────────────────────────────────────────

export type RollbackPolicy = "DELETE_ALL" | "KEEP_ALL" | "DELETE_ON_SUCCESS";
export type SimulationStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type SolverType = "eigenmode" | "driven" | "electrostatic" | "magnetostatic";

export interface SimulationConfig {
  project_id: string;
  solver_type: SolverType;
  user_settings?: Record<string, unknown>;
  terminal_names?: string[];
  qubits?: Record<string, unknown>[];
  port_names?: string[];
  mesh_settings?: Record<string, unknown>;
  coarse_mesh?: boolean;
  rollback_policy?: RollbackPolicy;
}

export interface RetrySimulationRequest {
  coarse_mesh?: boolean;
  rollback_policy?: RollbackPolicy;
}

export interface Simulation {
  id: string;
  project_id: string;
  solver: string;
  status: string;
  config: Record<string, unknown>;
  results?: Record<string, unknown> | null;
  error_message?: string | null;
  runtime_seconds?: number | null;
  memory_gb?: number | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
}

export interface SimulationStatusResponse {
  simulation_id: string;
  status: string;
  current_phase?: string | null;
  progress: number;
  runtime: number;
  warnings: string[];
  errors: string[];
}

export interface SimulationHistoryResponse {
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  items: Simulation[];
}

export interface SimulationHistoryParams {
  page?: number;
  page_size?: number;
  project_id?: string;
  status?: string;
  solver?: string;
  sort_by?: string;
  sort_dir?: "asc" | "desc";
}

export interface SimulationArtifact {
  id: string;
  file_name: string;
  size: number;
  checksum: string;
  artifact_type: string;
  created_at: string;
}

export interface SimulationLog {
  id: string;
  log_type: string;
  content: string;
  created_at: string;
}

export interface SimulationMetrics {
  metrics: Record<string, number>;
}

export interface SimulationWorkspace {
  workspace_id: string;
  files_count: number;
  total_size_bytes: number;
  rollback_policy: string;
}

// ── Simulation API Functions ──────────────────────────────────────────────────

export async function fetchSimulations(params?: SimulationHistoryParams): Promise<SimulationHistoryResponse> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  if (params?.project_id) qs.set("project_id", params.project_id);
  if (params?.status) qs.set("status", params.status);
  if (params?.solver) qs.set("solver", params.solver);
  if (params?.sort_by) qs.set("sort_by", params.sort_by);
  if (params?.sort_dir) qs.set("sort_dir", params.sort_dir);
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return api<SimulationHistoryResponse>(`/api/simulations${query}`);
}

export async function runSimulation(body: SimulationConfig): Promise<Simulation> {
  return api<Simulation>("/api/simulations/run", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchSimulationDetails(id: string): Promise<Simulation> {
  return api<Simulation>(`/api/simulations/${id}`);
}

export async function fetchSimulationStatus(id: string): Promise<SimulationStatusResponse> {
  return api<SimulationStatusResponse>(`/api/simulations/${id}/status`);
}

export async function fetchSimulationResults(id: string): Promise<Record<string, unknown>> {
  return api<Record<string, unknown>>(`/api/simulations/${id}/results`);
}

export async function cancelSimulation(id: string): Promise<{ message: string }> {
  return api<{ message: string }>(`/api/simulations/${id}/cancel`, { method: "POST" });
}

export async function retrySimulation(id: string, body?: RetrySimulationRequest): Promise<Simulation> {
  return api<Simulation>(`/api/simulations/${id}/retry`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export async function deleteSimulation(
  id: string,
  hardDelete = true,
  cleanupWorkspace = true,
): Promise<void> {
  await api(`/api/simulations/${id}?hard_delete=${hardDelete}&cleanup_workspace=${cleanupWorkspace}`, {
    method: "DELETE",
  });
}

export async function listSimulationArtifacts(id: string): Promise<SimulationArtifact[]> {
  return api<SimulationArtifact[]>(`/api/simulations/${id}/artifacts`);
}

export function getArtifactDownloadUrl(simId: string, artifactId: string): string {
  const token = typeof window !== "undefined" ? localStorage.getItem("qs_token") : null;
  const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? "").replace(/\/$/, "");
  return `${BACKEND_URL}/api/simulations/${simId}/artifacts/${artifactId}${token ? `?token=${token}` : ""}`;
}

export async function getSimulationLogs(id: string, logType?: string): Promise<SimulationLog[]> {
  const qs = logType ? `?log_type=${encodeURIComponent(logType)}` : "";
  return api<SimulationLog[]>(`/api/simulations/${id}/logs${qs}`);
}

export async function getSimulationMetrics(id: string): Promise<SimulationMetrics> {
  return api<SimulationMetrics>(`/api/simulations/${id}/metrics`);
}

export async function getSimulationWorkspace(id: string): Promise<SimulationWorkspace> {
  return api<SimulationWorkspace>(`/api/simulations/${id}/workspace`);
}

// ── Claude ────────────────────────────────────────────────────────────────────

export async function askClaude(
  message: string,
  contextType: string = "general",
  contextData?: unknown,
  history?: Array<{ role: string; content: string }>,
): Promise<{ role: string; content: string }> {
  try {
    return await api("/api/claude/chat", {
      method: "POST",
      body: JSON.stringify({
        message,
        context_type: contextType,
        context_data: contextData,
        history,
      }),
    });
  } catch {
    return {
      role: "assistant",
      content:
        "I'm currently unavailable (backend offline). " +
        "Run `cd backend && python run.py` to start the server.",
    };
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function loginUser(email: string, password: string) {
  const formData = new FormData();
  formData.append("username", email);
  formData.append("password", password);
  const res = await fetch(`${BACKEND_URL}/api/auth/token`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error("Login failed");
  const data = await res.json();
  if (data.access_token && typeof window !== "undefined") {
    localStorage.setItem("qs_token", data.access_token);
  }
  return data;
}

export async function registerUser(
  name: string,
  email: string,
  password: string,
  organization: string,
  role?: string,
) {
  const data = await api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password, organization, role }),
  });
  const d = data as { access_token?: string };
  if (d.access_token && typeof window !== "undefined") {
    localStorage.setItem("qs_token", d.access_token);
  }
  return data;
}


// ── Phase 12: Visualization API ───────────────────────────────────────────────

export type FieldType = "scalar" | "vector";
export type ColormapName = "viridis" | "coolwarm" | "jet" | "plasma" | "turbo" | "rainbow" | "grey" | "hot";
export type SliceAxis = "x" | "y" | "z";
export type CameraPresetName = "isometric" | "top" | "front" | "side" | "bottom" | "perspective";
export type MeshDisplayMode = "surface" | "wireframe" | "surface_edges" | "points";

export interface FieldInfo {
  name: string;
  field_type: FieldType;
  n_components: number;
  value_min: number | null;
  value_max: number | null;
  units: string;
  description: string;
}

export interface PreRenderedImage {
  filename: string;
  url: string;
  label: string;
  solver: string;
  variant: string;
  mode_index: number | null;
}

export interface VisualizationManifest {
  simulation_id: string;
  has_vtu: boolean;
  has_mesh: boolean;
  vtu_files: string[];
  mesh_files: string[];
  pre_rendered_images: PreRenderedImage[];
  available_fields: FieldInfo[];
  solvers: string[];
  n_modes: number;
  bounds: number[] | null;
}

export interface ArrayListResponse {
  simulation_id: string;
  vtu_path: string;
  point_arrays: FieldInfo[];
  cell_arrays: FieldInfo[];
  n_points: number;
  n_cells: number;
  bounds: number[] | null;
}

export interface RenderResponse {
  image_url: string;
  width: number;
  height: number;
  field_name: string | null;
  field_min: number | null;
  field_max: number | null;
  render_time_ms: number;
  cached: boolean;
}

export interface CameraPreset {
  name: CameraPresetName;
  label: string;
  position: number[];
  focal_point: number[];
  up_vector: number[];
  description: string;
}

export interface VisRenderParams {
  field?: string;
  colormap?: ColormapName;
  log_scale?: boolean;
  opacity?: number;
  show_edges?: boolean;
  camera?: CameraPresetName;
  mode?: number;
  width?: number;
  height?: number;
  transparent?: boolean;
  show_boundaries?: boolean;
  high_fidelity?: boolean;
}

export interface VisSliceParams {
  axis?: SliceAxis;
  position?: number;  // normalized [0, 1]
  field?: string;
  colormap?: ColormapName;
  log_scale?: boolean;
  width?: number;
  height?: number;
}

function _visParams(params: Record<string, unknown>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  return q ? `?${q}` : "";
}

export async function fetchVisualizationManifest(simId: string): Promise<VisualizationManifest> {
  return api(`/api/simulations/${simId}/visualization/manifest`);
}

export async function fetchVisualizationArrays(
  simId: string,
  vtuPath?: string,
): Promise<ArrayListResponse> {
  const q = vtuPath ? `?vtu_path=${encodeURIComponent(vtuPath)}` : "";
  return api(`/api/simulations/${simId}/visualization/arrays${q}`);
}

export async function renderVisualizationField(
  simId: string,
  params: VisRenderParams = {},
): Promise<RenderResponse> {
  return api(`/api/simulations/${simId}/visualization/render${_visParams(params as Record<string, unknown>)}`);
}

export async function renderVisualizationMesh(
  simId: string,
  params: { display_mode?: MeshDisplayMode; opacity?: number; camera?: CameraPresetName; width?: number; height?: number; show_boundaries?: boolean } = {},
): Promise<RenderResponse> {
  return api(`/api/simulations/${simId}/visualization/mesh-render${_visParams(params as Record<string, unknown>)}`);
}

export async function renderVisualizationSlice(
  simId: string,
  params: VisSliceParams = {},
): Promise<RenderResponse> {
  return api(`/api/simulations/${simId}/visualization/slice${_visParams(params as Record<string, unknown>)}`);
}

export async function fetchVisualizationPreview(simId: string): Promise<string> {
  // Returns a direct image URL (blob URL after fetching)
  const token = typeof window !== "undefined" ? localStorage.getItem("qs_token") : null;
  const res = await fetch(
    `${BACKEND_URL}/api/simulations/${simId}/visualization/preview`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!res.ok) throw new Error(`Preview fetch failed: ${res.status}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function fetchVisualizationCameraPresets(simId: string): Promise<CameraPreset[]> {
  return api(`/api/simulations/${simId}/visualization/presets`);
}

/** Build a full backend URL for a pre-rendered visualization image filename. */
export function getVisualizationImageUrl(simId: string, filename: string): string {
  const token = typeof window !== "undefined" ? localStorage.getItem("qs_token") : null;
  // Note: auth is enforced on backend; for <img> tags we need a fetch-proxy approach
  return `${BACKEND_URL}/api/simulations/${simId}/visualization/images/${encodeURIComponent(filename)}`;
}

// ── 3D Mesh & Field Visualization (Palace Eigenmode) ─────────────────────────

export interface Mesh3D {
  vertices: number[][];
  faces: number[][];
  normals: number[][];
}

export interface Field3D {
  name: string;
  unit: string;
  values: number[];
  colors: number[][];
  min: number;
  max: number;
  colorMap: string;
}

export interface Visualization3DResponse {
  mesh: Mesh3D;
  field: Field3D;
  metadata: {
    solver: string;
    frequency_ghz: number;
    modes: number;
    mesh_nodes: number;
    runtime_seconds: number;
  };
}

export async function fetch3DVisualization(
  simId: string,
  mode = 1,
  field?: string,
): Promise<Visualization3DResponse> {
  const url = field 
    ? `/api/simulations/${simId}/visualization?mode=${mode}&field=${encodeURIComponent(field)}`
    : `/api/simulations/${simId}/visualization?mode=${mode}`;
  return api<Visualization3DResponse>(url);
}

// ── 3D Volume Mesh Visualization ─────────────────────────────────────────────

export interface VolumeMesh {
  vertices: number[][];
  elements: number[][];
  bounds: {
    x: [number, number];
    y: [number, number];
    z: [number, number];
  };
}

export interface VolumeMeshResponse {
  mesh: VolumeMesh;
  metadata: {
    solver: string;
    total_elements: number;
    total_vertices: number;
    frequency_ghz: number;
    runtime_seconds: number;
  };
}

export async function fetchVolumeMesh(simId: string): Promise<VolumeMeshResponse> {
  return api<VolumeMeshResponse>(`/api/simulations/${simId}/mesh`);
}

export async function fetchVolumeMeshWireframe(simId: string): Promise<any> {
  return api<any>(`/api/simulations/${simId}/mesh-wireframe`);
}



