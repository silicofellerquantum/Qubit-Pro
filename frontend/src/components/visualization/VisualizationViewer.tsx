import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchVisualizationManifest,
  renderVisualizationField,
  renderVisualizationMesh,
  renderVisualizationSlice,
  type VisualizationManifest,
  type FieldInfo,
  type ColormapName,
  type CameraPresetName,
  type SliceAxis,
  type MeshDisplayMode,
  type VisRenderParams,
} from "@/lib/api/backend";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? "").replace(/\/$/, "");

function authedImgSrc(url: string) {
  const token = localStorage.getItem("qs_token");
  if (!url || !token) return url;
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  return url;
}

const COLORMAPS: { id: ColormapName; label: string; colors: string[] }[] = [
  { id: "coolwarm", label: "Cool–Warm", colors: ["#3b4cc0", "#f7f7f7", "#b40426"] },
  { id: "viridis", label: "Viridis", colors: ["#440154", "#21918c", "#fde725"] },
  { id: "jet", label: "Jet", colors: ["#00008f", "#00ffff", "#ff0000"] },
  { id: "plasma", label: "Plasma", colors: ["#0d0887", "#f0f921", "#cc4778"] },
  { id: "turbo", label: "Turbo", colors: ["#30123b", "#28bbec", "#a3fd3d", "#f00"] },
  { id: "hot", label: "Hot", colors: ["#000", "#f00", "#ffff00", "#fff"] },
  { id: "grey", label: "Grey", colors: ["#000", "#888", "#fff"] },
  { id: "rainbow", label: "Rainbow", colors: ["#7f00ff", "#00ff00", "#ff0000"] },
];

const CAMERAS: { id: CameraPresetName; label: string; icon: string }[] = [
  { id: "isometric", label: "Iso", icon: "⬡" },
  { id: "top", label: "Top", icon: "⬆" },
  { id: "front", label: "Front", icon: "◼" },
  { id: "side", label: "Side", icon: "▷" },
];

type ViewMode = "field" | "mesh" | "slice" | "prerendered";

interface Props {
  simId: string;
}

export function VisualizationViewer({ simId }: Props) {
  const [manifest, setManifest] = useState<VisualizationManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("prerendered");
  const [selectedField, setSelectedField] = useState<string>("");
  const [colormap, setColormap] = useState<ColormapName>("coolwarm");
  const [logScale, setLogScale] = useState(false);
  const [showEdges, setShowEdges] = useState(false);
  const [opacity, setOpacity] = useState(1.0);
  const [camera, setCamera] = useState<CameraPresetName>("isometric");
  const [modeIndex, setModeIndex] = useState<number>(1);
  const [sliceAxis, setSliceAxis] = useState<SliceAxis>("z");
  const [slicePos, setSlicePos] = useState(0.5);
  const [meshMode, setMeshMode] = useState<MeshDisplayMode>("surface_edges");
  const [previewIdx, setPreviewIdx] = useState(0);
  const [showBoundaries, setShowBoundaries] = useState(true);
  const [highFidelity, setHighFidelity] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [renderTime, setRenderTime] = useState<number | null>(null);
  const [cached, setCached] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchVisualizationManifest(simId)
      .then((m) => {
        if (cancelled) return;
        setManifest(m);
        if (m.available_fields.length > 0) setSelectedField(m.available_fields[0].name);
        if (m.pre_rendered_images.length > 0) {
          setViewMode("prerendered");
        } else if (m.has_vtu) {
          setViewMode("field");
        } else if (m.has_mesh) {
          setViewMode("mesh");
        }
      })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [simId]);

  const handleRender = useCallback(async () => {
    if (!manifest) return;
    setRendering(true);
    setError(null);
    try {
      let resp;
      if (viewMode === "field") {
        const params: VisRenderParams = {
          field: selectedField || undefined,
          colormap, log_scale: logScale, opacity,
          show_edges: showEdges, camera,
          mode: modeIndex > 0 ? modeIndex : undefined,
          show_boundaries: showBoundaries,
          high_fidelity: highFidelity,
        };
        resp = await renderVisualizationField(simId, params);
      } else if (viewMode === "mesh") {
        resp = await renderVisualizationMesh(simId, { display_mode: meshMode, opacity, camera, show_boundaries: showBoundaries });
      } else {
        resp = await renderVisualizationSlice(simId, {
          axis: sliceAxis, position: slicePos,
          field: selectedField || undefined, colormap, log_scale: logScale,
        });
      }
      // Build authenticated fetch URL
      const token = localStorage.getItem("qs_token");
      const filename = resp.image_url.split("/").pop()!;
      const fetchUrl = `${BACKEND_URL}/api/simulations/${simId}/visualization/images/${encodeURIComponent(filename)}`;
      const res = await fetch(fetchUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
      const blob = await res.blob();
      setImageUrl(URL.createObjectURL(blob));
      setRenderTime(resp.render_time_ms);
      setCached(resp.cached);
    } catch (e) {
      setError(String(e));
    } finally {
      setRendering(false);
    }
  }, [manifest, viewMode, simId, selectedField, colormap, logScale, opacity, showEdges, camera, modeIndex, sliceAxis, slicePos, meshMode, showBoundaries, highFidelity]);

  const loadPrerendered = useCallback(async (filename: string) => {
    setRendering(true);
    setError(null);
    try {
      const token = localStorage.getItem("qs_token");
      const fetchUrl = `${BACKEND_URL}/api/simulations/${simId}/visualization/images/${encodeURIComponent(filename)}`;
      const res = await fetch(fetchUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
      const blob = await res.blob();
      setImageUrl(URL.createObjectURL(blob));
      setRenderTime(null);
      setCached(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setRendering(false);
    }
  }, [simId]);

  useEffect(() => {
    if (viewMode === "prerendered" && manifest?.pre_rendered_images.length) {
      const img = manifest.pre_rendered_images[previewIdx];
      if (img) loadPrerendered(img.filename);
    }
  }, [viewMode, previewIdx, manifest, loadPrerendered]);

  const handleDownload = () => {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = `simulation_${simId}_visualization.png`;
    a.click();
  };

  if (loading) {
    return (
      <div className="vis-loading">
        <div className="vis-spinner" />
        <p>Loading visualization data…</p>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div className="vis-empty">
        <div className="vis-empty-icon">🔬</div>
        <h3>No Visualization Data</h3>
        <p>Run a simulation with Paraview output enabled to generate field visualizations.</p>
      </div>
    );
  }

  const hasData = manifest.has_vtu || manifest.has_mesh || manifest.pre_rendered_images.length > 0;
  if (!hasData) {
    return (
      <div className="vis-empty">
        <div className="vis-empty-icon">📊</div>
        <h3>No Output Files</h3>
        <p>Simulation completed but no VTU or mesh files were retained. Enable artifact retention and re-run.</p>
      </div>
    );
  }

  const allFields: FieldInfo[] = manifest.available_fields;

  return (
    <div className={`vis-container${fullscreen ? " vis-fullscreen" : ""}`}>
      {/* ── Toolbar ── */}
      <div className="vis-toolbar">
        <div className="vis-mode-tabs">
          {manifest.pre_rendered_images.length > 0 && (
            <button className={`vis-tab${viewMode === "prerendered" ? " active" : ""}`} onClick={() => setViewMode("prerendered")}>
              🖼 Gallery
            </button>
          )}
          {manifest.has_vtu && (
            <button className={`vis-tab${viewMode === "field" ? " active" : ""}`} onClick={() => setViewMode("field")}>
              ⚡ Field
            </button>
          )}
          {(manifest.has_vtu || manifest.has_mesh) && (
            <button className={`vis-tab${viewMode === "mesh" ? " active" : ""}`} onClick={() => setViewMode("mesh")}>
              🔷 Mesh
            </button>
          )}
          {manifest.has_vtu && (
            <button className={`vis-tab${viewMode === "slice" ? " active" : ""}`} onClick={() => setViewMode("slice")}>
              ✂ Slice
            </button>
          )}
        </div>
        <div className="vis-toolbar-actions">
          {renderTime !== null && (
            <span className="vis-render-badge">{cached ? "⚡ cached" : `${renderTime.toFixed(0)} ms`}</span>
          )}
          <button className="vis-icon-btn" title="Download" onClick={handleDownload} disabled={!imageUrl}>⬇</button>
          <button className="vis-icon-btn" title="Fullscreen" onClick={() => setFullscreen(f => !f)}>
            {fullscreen ? "⊠" : "⛶"}
          </button>
        </div>
      </div>

      <div className="vis-body">
        {/* ── Controls panel ── */}
        <div className="vis-controls">
          {/* Pre-rendered gallery */}
          {viewMode === "prerendered" && manifest.pre_rendered_images.length > 0 && (
            <div className="vis-control-group">
              <label className="vis-label">Image</label>
              <div className="vis-gallery-list">
                {manifest.pre_rendered_images.map((img, i) => (
                  <button
                    key={img.filename}
                    className={`vis-gallery-item${previewIdx === i ? " active" : ""}`}
                    onClick={() => setPreviewIdx(i)}
                    title={img.label}
                  >
                    <span className="vis-gallery-label">{img.label}</span>
                    {img.mode_index && <span className="vis-gallery-mode">M{img.mode_index}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Field selector */}
          {(viewMode === "field" || viewMode === "slice") && allFields.length > 0 && (
            <div className="vis-control-group">
              <label className="vis-label">Field Array</label>
              <select className="vis-select" value={selectedField} onChange={e => setSelectedField(e.target.value)}>
                <option value="">Auto-detect</option>
                {allFields.map(f => (
                  <option key={f.name} value={f.name}>
                    {f.name} {f.units ? `(${f.units})` : ""} {f.field_type === "vector" ? "→" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Mode selector */}
          {viewMode === "field" && manifest.n_modes > 1 && (
            <div className="vis-control-group">
              <label className="vis-label">Mode</label>
              <div className="vis-mode-buttons">
                {Array.from({ length: manifest.n_modes }, (_, i) => i + 1).map(m => (
                  <button
                    key={m}
                    className={`vis-mode-btn${modeIndex === m ? " active" : ""}`}
                    onClick={() => setModeIndex(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Colormap */}
          {(viewMode === "field" || viewMode === "slice") && (
            <div className="vis-control-group">
              <label className="vis-label">Colormap</label>
              <div className="vis-cmap-grid">
                {COLORMAPS.map(cm => (
                  <button
                    key={cm.id}
                    title={cm.label}
                    className={`vis-cmap-btn${colormap === cm.id ? " active" : ""}`}
                    onClick={() => setColormap(cm.id)}
                    style={{ background: `linear-gradient(to right, ${cm.colors.join(", ")})` }}
                  />
                ))}
              </div>
              <div className="vis-cmap-label">{COLORMAPS.find(c => c.id === colormap)?.label}</div>
            </div>
          )}

          {/* Log scale */}
          {(viewMode === "field" || viewMode === "slice") && (
            <div className="vis-control-group">
              <label className="vis-toggle-label">
                <input type="checkbox" checked={logScale} onChange={e => setLogScale(e.target.checked)} />
                <span>Log scale</span>
              </label>
            </div>
          )}

          {/* Show edges */}
          {viewMode === "field" && (
            <div className="vis-control-group">
              <label className="vis-toggle-label">
                <input type="checkbox" checked={showEdges} onChange={e => setShowEdges(e.target.checked)} />
                <span>Show edges</span>
              </label>
            </div>
          )}

          {/* Show boundaries */}
          {(viewMode === "field" || viewMode === "mesh") && (
            <div className="vis-control-group">
              <label className="vis-toggle-label">
                <input type="checkbox" checked={showBoundaries} onChange={e => setShowBoundaries(e.target.checked)} />
                <span>Show Chip Boundaries</span>
              </label>
            </div>
          )}

          {/* High Fidelity */}
          {viewMode === "field" && (
            <div className="vis-control-group">
              <label className="vis-toggle-label">
                <input type="checkbox" checked={highFidelity} onChange={e => setHighFidelity(e.target.checked)} />
                <span style={{ color: "#3fb950", fontWeight: 600 }}>High-Fidelity Surface</span>
              </label>
            </div>
          )}

          {/* Opacity */}
          {viewMode !== "prerendered" && (
            <div className="vis-control-group">
              <label className="vis-label">Opacity — {(opacity * 100).toFixed(0)}%</label>
              <input
                type="range" min={0} max={1} step={0.05}
                value={opacity} onChange={e => setOpacity(Number(e.target.value))}
                className="vis-slider"
              />
            </div>
          )}

          {/* Camera presets */}
          {(viewMode === "field" || viewMode === "mesh") && (
            <div className="vis-control-group">
              <label className="vis-label">Camera</label>
              <div className="vis-camera-grid">
                {CAMERAS.map(c => (
                  <button
                    key={c.id}
                    title={c.label}
                    className={`vis-camera-btn${camera === c.id ? " active" : ""}`}
                    onClick={() => setCamera(c.id)}
                  >
                    <span>{c.icon}</span>
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Mesh mode */}
          {viewMode === "mesh" && (
            <div className="vis-control-group">
              <label className="vis-label">Display Mode</label>
              <select className="vis-select" value={meshMode} onChange={e => setMeshMode(e.target.value as MeshDisplayMode)}>
                <option value="surface_edges">Surface + Edges</option>
                <option value="surface">Surface</option>
                <option value="wireframe">Wireframe</option>
                <option value="points">Points</option>
              </select>
            </div>
          )}

          {/* Slice controls */}
          {viewMode === "slice" && (
            <>
              <div className="vis-control-group">
                <label className="vis-label">Slice Axis</label>
                <div className="vis-axis-btns">
                  {(["x", "y", "z"] as SliceAxis[]).map(a => (
                    <button key={a} className={`vis-axis-btn${sliceAxis === a ? " active" : ""}`} onClick={() => setSliceAxis(a)}>
                      {a.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="vis-control-group">
                <label className="vis-label">Position — {(slicePos * 100).toFixed(0)}%</label>
                <input
                  type="range" min={0} max={1} step={0.01}
                  value={slicePos} onChange={e => setSlicePos(Number(e.target.value))}
                  className="vis-slider"
                />
              </div>
            </>
          )}

          {/* Render button */}
          {viewMode !== "prerendered" && (
            <button
              className="vis-render-btn"
              onClick={handleRender}
              disabled={rendering}
            >
              {rendering ? <span className="vis-spinner-sm" /> : "▶"} Render
            </button>
          )}

          {/* Stats */}
          {manifest.has_vtu && (
            <div className="vis-stats">
              <div className="vis-stat"><span>Modes</span><strong>{manifest.n_modes || "—"}</strong></div>
              <div className="vis-stat"><span>Fields</span><strong>{allFields.length}</strong></div>
              <div className="vis-stat"><span>Solvers</span><strong>{manifest.solvers.join(", ") || "—"}</strong></div>
            </div>
          )}
        </div>

        {/* ── Image viewer ── */}
        <div className="vis-viewport">
          {error && (
            <div className="vis-error">
              <span>⚠</span>
              <p>{error}</p>
              <button onClick={() => setError(null)}>Dismiss</button>
            </div>
          )}

          {rendering && (
            <div className="vis-render-overlay">
              <div className="vis-spinner-lg" />
              <p>Rendering…</p>
            </div>
          )}

          {imageUrl ? (
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Simulation visualization"
              className="vis-image"
              draggable={false}
            />
          ) : !rendering && !error ? (
            <div className="vis-placeholder">
              <div className="vis-placeholder-icon">🔬</div>
              {viewMode === "prerendered"
                ? <p>Select an image from the gallery</p>
                : <p>Configure options and click <strong>Render</strong> to generate a visualization</p>
              }
            </div>
          ) : null}
        </div>
      </div>

      <style>{`
        .vis-container { display:flex; flex-direction:column; height:100%; background:#0d1117; border-radius:12px; overflow:hidden; }
        .vis-fullscreen { position:fixed; inset:0; z-index:9999; border-radius:0; }
        .vis-toolbar { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; background:#161b22; border-bottom:1px solid #30363d; gap:12px; flex-shrink:0; }
        .vis-mode-tabs { display:flex; gap:6px; }
        .vis-tab { padding:5px 12px; border-radius:6px; border:1px solid #30363d; background:transparent; color:#8b949e; cursor:pointer; font-size:12px; transition:all .15s; }
        .vis-tab.active,.vis-tab:hover { background:#21262d; color:#e6edf3; border-color:#58a6ff; }
        .vis-toolbar-actions { display:flex; align-items:center; gap:8px; }
        .vis-render-badge { font-size:11px; color:#3fb950; background:#1a2e1a; padding:3px 8px; border-radius:4px; border:1px solid #2ea043; }
        .vis-icon-btn { width:30px; height:30px; border-radius:6px; border:1px solid #30363d; background:#21262d; color:#8b949e; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center; transition:all .15s; }
        .vis-icon-btn:hover:not(:disabled) { color:#e6edf3; border-color:#58a6ff; }
        .vis-icon-btn:disabled { opacity:.4; cursor:not-allowed; }
        .vis-body { display:flex; flex:1; overflow:hidden; }
        .vis-controls { width:220px; flex-shrink:0; background:#161b22; border-right:1px solid #30363d; padding:14px 12px; overflow-y:auto; display:flex; flex-direction:column; gap:14px; }
        .vis-control-group { display:flex; flex-direction:column; gap:6px; }
        .vis-label { font-size:11px; color:#8b949e; text-transform:uppercase; letter-spacing:.05em; font-weight:600; }
        .vis-select { background:#21262d; border:1px solid #30363d; color:#e6edf3; border-radius:6px; padding:6px 8px; font-size:12px; width:100%; }
        .vis-slider { width:100%; accent-color:#58a6ff; }
        .vis-toggle-label { display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px; color:#c9d1d9; }
        .vis-toggle-label input { accent-color:#58a6ff; }
        .vis-gallery-list { display:flex; flex-direction:column; gap:4px; max-height:180px; overflow-y:auto; }
        .vis-gallery-item { display:flex; align-items:center; justify-content:space-between; padding:5px 8px; border-radius:5px; border:1px solid transparent; background:#21262d; cursor:pointer; text-align:left; font-size:11px; color:#8b949e; transition:all .1s; }
        .vis-gallery-item.active,.vis-gallery-item:hover { border-color:#58a6ff; color:#e6edf3; }
        .vis-gallery-label { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .vis-gallery-mode { font-size:10px; background:#0d419d; color:#58a6ff; padding:1px 5px; border-radius:3px; flex-shrink:0; }
        .vis-cmap-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:4px; }
        .vis-cmap-btn { height:20px; border-radius:4px; border:2px solid transparent; cursor:pointer; transition:border-color .1s; }
        .vis-cmap-btn.active { border-color:#58a6ff; }
        .vis-cmap-label { font-size:11px; color:#8b949e; text-align:center; }
        .vis-mode-buttons,.vis-axis-btns { display:flex; gap:4px; flex-wrap:wrap; }
        .vis-mode-btn,.vis-axis-btn { padding:3px 8px; border-radius:4px; border:1px solid #30363d; background:#21262d; color:#8b949e; cursor:pointer; font-size:12px; transition:all .1s; }
        .vis-mode-btn.active,.vis-mode-btn:hover,.vis-axis-btn.active,.vis-axis-btn:hover { background:#0d419d; color:#58a6ff; border-color:#58a6ff; }
        .vis-camera-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:4px; }
        .vis-camera-btn { display:flex; flex-direction:column; align-items:center; padding:5px 4px; border-radius:6px; border:1px solid #30363d; background:#21262d; color:#8b949e; cursor:pointer; font-size:10px; gap:2px; transition:all .1s; }
        .vis-camera-btn.active,.vis-camera-btn:hover { border-color:#58a6ff; color:#58a6ff; }
        .vis-camera-btn span:first-child { font-size:14px; }
        .vis-render-btn { display:flex; align-items:center; justify-content:center; gap:6px; padding:8px; border-radius:8px; border:none; background:linear-gradient(135deg,#1f6feb,#388bfd); color:#fff; font-size:13px; font-weight:600; cursor:pointer; transition:opacity .15s; }
        .vis-render-btn:hover:not(:disabled) { opacity:.85; }
        .vis-render-btn:disabled { opacity:.5; cursor:not-allowed; }
        .vis-stats { border-top:1px solid #30363d; padding-top:12px; display:flex; flex-direction:column; gap:6px; }
        .vis-stat { display:flex; justify-content:space-between; font-size:11px; color:#8b949e; }
        .vis-stat strong { color:#e6edf3; }
        .vis-viewport { flex:1; position:relative; background:#0d1117; display:flex; align-items:center; justify-content:center; overflow:hidden; }
        .vis-image { max-width:100%; max-height:100%; object-fit:contain; border-radius:4px; }
        .vis-render-overlay { position:absolute; inset:0; background:#0d1117cc; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; z-index:10; }
        .vis-render-overlay p { color:#8b949e; font-size:14px; }
        .vis-placeholder,.vis-empty,.vis-loading { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:12px; color:#8b949e; text-align:center; padding:32px; flex:1; }
        .vis-placeholder-icon,.vis-empty-icon { font-size:48px; opacity:.5; }
        .vis-placeholder p,.vis-empty p { font-size:14px; max-width:280px; line-height:1.6; }
        .vis-empty h3 { color:#c9d1d9; font-size:16px; margin:0; }
        .vis-error { position:absolute; top:12px; left:50%; transform:translateX(-50%); background:#2d1117; border:1px solid #f85149; border-radius:8px; padding:10px 16px; display:flex; align-items:center; gap:10px; z-index:20; font-size:13px; color:#f85149; }
        .vis-error button { background:transparent; border:none; color:#f85149; cursor:pointer; font-size:16px; padding:0; }
        .vis-spinner { width:32px; height:32px; border:3px solid #30363d; border-top-color:#58a6ff; border-radius:50%; animation:vis-spin .7s linear infinite; }
        .vis-spinner-sm { width:14px; height:14px; border:2px solid #ffffff55; border-top-color:#fff; border-radius:50%; animation:vis-spin .7s linear infinite; }
        .vis-spinner-lg { width:48px; height:48px; border:4px solid #30363d; border-top-color:#58a6ff; border-radius:50%; animation:vis-spin .7s linear infinite; }
        @keyframes vis-spin { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}
