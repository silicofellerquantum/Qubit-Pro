import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { 
  RotateCw, 
  Sliders, 
  Activity, 
  Cpu, 
  Maximize2, 
  Info,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff
} from "lucide-react";
import { fetch3DVisualization } from "@/lib/api/backend";

/**
 * EFieldVisualization component
 * Displays E-field intensity thresholds on a 3D surface mesh with a wireframe layer.
 * Shows CPWs/qubits (dense mesh, high E-field > 60% as Red), coupling structures (20-60% as Orange),
 * and substrate (sparse mesh, < 20% as Blue) simultaneously.
 */
export default function EFieldVisualization({ 
  simId, 
  mode = 1,
  vertices: initialVertices,
  faces: initialFaces,
  normals: initialNormals,
  eFieldValues: initialEFieldValues
}) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const meshRef = useRef(null);
  const edgesRef = useRef(null);
  const animationFrameIdRef = useRef(null);

  // Component state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fps, setFps] = useState(60);
  const [metadata, setMetadata] = useState(null);

  // Visual customisation state: Opacity controls the wireframe overlay layer
  const [opacity, setOpacity] = useState(0.25);
  const [showEdges, setShowEdges] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [maxFieldVal, setMaxFieldVal] = useState(0);

  // HUD & Legend display states
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [legendCollapsed, setLegendCollapsed] = useState(false);

  // Load and initialize data
  useEffect(() => {
    let active = true;

    // Case 1: Props are provided directly
    if (initialVertices && initialFaces && initialEFieldValues) {
      setLoading(false);
      initThree({
        mesh: {
          vertices: initialVertices,
          faces: initialFaces,
          normals: initialNormals || []
        },
        field: {
          values: initialEFieldValues,
          name: "E_field",
          unit: "V/m"
        },
        metadata: {
          solver: "eigenmode",
          frequency_ghz: 4.5,
          modes: 9,
          mesh_nodes: initialVertices.length,
          runtime_seconds: 58
        }
      });
      return;
    }

    // Case 2: Fetch via simId and mode
    if (!simId) {
      setError("No simulation ID or direct mesh data provided.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetch3DVisualization(simId, mode)
      .then(response => {
        if (!active) return;
        setMetadata(response.metadata);
        initThree(response);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading E-field visualization:", err);
        if (active) {
          setError(err.message || "Failed to load 3D E-field visualization data.");
          setLoading(false);
        }
      });

    return () => {
      active = false;
      cleanupThree();
    };
  }, [simId, mode, initialVertices, initialFaces, initialEFieldValues]);

  // Handle autoRotate update dynamically
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  // Handle opacity update dynamically for wireframe overlay
  useEffect(() => {
    if (edgesRef.current) {
      edgesRef.current.material.opacity = opacity;
      edgesRef.current.material.needsUpdate = true;
    }
  }, [opacity]);

  // Handle wireframe visibility dynamically
  useEffect(() => {
    if (edgesRef.current) {
      edgesRef.current.visible = showEdges;
    }
  }, [showEdges]);

  // Initialize Three.js scene
  const initThree = (data) => {
    cleanupThree();
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 720;

    // 1. Create Scene with dark background
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0a0a16");
    sceneRef.current = scene;

    // 2. Create Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    cameraRef.current = camera;

    // 3. Create WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Create Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.0;
    controlsRef.current = controls;

    // 5. Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
    keyLight.position.set(1, 1.5, 1).normalize();
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x8899ff, 0.4);
    fillLight.position.set(-1, -1, -1).normalize();
    scene.add(fillLight);

    // 6. Build Geometry
    const { mesh, field } = data;
    const verticesFlat = new Float32Array(mesh.vertices.flat());
    const facesFlat = new Uint32Array(mesh.faces.flat());

    // Fallback normals if not provided
    let normalsFlat;
    if (mesh.normals && mesh.normals.length > 0) {
      normalsFlat = new Float32Array(mesh.normals.flat());
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(verticesFlat, 3));
    if (normalsFlat) {
      geometry.setAttribute("normal", new THREE.BufferAttribute(normalsFlat, 3));
    }
    geometry.setIndex(new THREE.BufferAttribute(facesFlat, 1));

    if (!normalsFlat) {
      geometry.computeVertexNormals();
    }

    // 7. Calculate Color Scale based on threshold rules:
    // - Active components (attributes >= 10) = Very Dark Charcoal
    // - Dielectric/ground plane = Proper continuous E-field Rainbow Colormap
    const values = field.values;
    const colors = field.colors || [];
    const attributes = mesh.attributes || [];
    const maxVal = Math.max(...values, 1e-10);
    setMaxFieldVal(maxVal);

    const colorsFlat = new Float32Array(values.length * 3);
    for (let i = 0; i < values.length; i++) {
      const attr = attributes[i] || 0;

      if (attr >= 10) {
        // Active component or connection -> render as very dark slate / charcoal
        colorsFlat[i * 3] = 0.06;
        colorsFlat[i * 3 + 1] = 0.06;
        colorsFlat[i * 3 + 2] = 0.08;
      } else {
        // Dielectric substrate / ground plane -> render with continuous E-field Jet/Rainbow
        if (colors && colors[i]) {
          colorsFlat[i * 3] = colors[i][0] / 255.0;
          colorsFlat[i * 3 + 1] = colors[i][1] / 255.0;
          colorsFlat[i * 3 + 2] = colors[i][2] / 255.0;
        } else {
          const val = values[i];
          const ratio = val / maxVal;
          let r = 0, g = 0, b = 0;
          if (ratio < 0.25) {
            const u = ratio / 0.25;
            r = 0.0; g = u; b = 1.0;
          } else if (ratio < 0.5) {
            const u = (ratio - 0.25) / 0.25;
            r = 0.0; g = 1.0; b = 1.0 - u;
          } else if (ratio < 0.75) {
            const u = (ratio - 0.5) / 0.25;
            r = u; g = 1.0; b = 0.0;
          } else {
            const u = (ratio - 0.75) / 0.25;
            r = 1.0; g = 1.0 - u; b = 0.0;
          }
          colorsFlat[i * 3] = r;
          colorsFlat[i * 3 + 1] = g;
          colorsFlat[i * 3 + 2] = b;
        }
      }
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colorsFlat, 3));

    // 8. Create Material and Mesh (Solid Colored Surface)
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.4,
      metalness: 0.1,
      side: THREE.DoubleSide,
      transparent: false // Colored surface is fully opaque
    });

    const threeMesh = new THREE.Mesh(geometry, material);
    scene.add(threeMesh);
    meshRef.current = threeMesh;

    // 9. Add THREE.WireframeGeometry layer (Light Gray)
    const wireframeGeom = new THREE.WireframeGeometry(geometry);
    const wireframeMat = new THREE.LineBasicMaterial({
      color: new THREE.Color("#d1d5db"), // light gray
      transparent: true,
      opacity: opacity, // default 0.25, controlled by slider
      linewidth: 1
    });
    const wireframeLines = new THREE.LineSegments(wireframeGeom, wireframeMat);
    wireframeLines.visible = showEdges;
    scene.add(wireframeLines);
    edgesRef.current = wireframeLines;

    // 10. Frame Camera dynamically
    geometry.computeBoundingSphere();
    const sphere = geometry.boundingSphere;
    if (sphere) {
      const center = sphere.center;
      const radius = sphere.radius;
      controls.target.copy(center);

      camera.position.set(
        center.x + radius * 1.4,
        center.y + radius * 1.4,
        center.z + radius * 1.4
      );
      camera.lookAt(center);
      controls.update();
    }

    // 11. Run Animation Loop
    let lastTime = performance.now();
    let frames = 0;

    const animate = () => {
      animationFrameIdRef.current = requestAnimationFrame(animate);

      // Measure FPS
      frames++;
      const now = performance.now();
      if (now >= lastTime + 1000) {
        setFps(Math.round((frames * 1000) / (now - lastTime)));
        frames = 0;
        lastTime = now;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // 12. Resize Handler
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight || 720;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);
    containerRef.current._handleResize = handleResize;
  };

  const cleanupThree = () => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
    }
    if (containerRef.current && containerRef.current._handleResize) {
      window.removeEventListener("resize", containerRef.current._handleResize);
    }
    if (meshRef.current) {
      sceneRef.current?.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      meshRef.current.material.dispose();
    }
    if (edgesRef.current) {
      sceneRef.current?.remove(edgesRef.current);
      edgesRef.current.geometry.dispose();
      edgesRef.current.material.dispose();
    }
    if (rendererRef.current) {
      rendererRef.current.dispose();
    }
    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }
    controlsRef.current = null;
    cameraRef.current = null;
    sceneRef.current = null;
    rendererRef.current = null;
    meshRef.current = null;
    edgesRef.current = null;
  };

  const resetView = () => {
    if (meshRef.current && cameraRef.current && controlsRef.current) {
      const geometry = meshRef.current.geometry;
      geometry.computeBoundingSphere();
      const sphere = geometry.boundingSphere;
      if (sphere) {
        const center = sphere.center;
        const radius = sphere.radius;
        controlsRef.current.target.copy(center);
        cameraRef.current.position.set(
          center.x + radius * 1.4,
          center.y + radius * 1.4,
          center.z + radius * 1.4
        );
        cameraRef.current.lookAt(center);
        controlsRef.current.update();
      }
    }
  };

  return (
    <div className="relative w-full h-[750px] bg-[#0c0c16] border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col font-sans text-white">
      {/* Header bar */}
      <div className="flex justify-between items-center px-4 py-3 bg-[#111124] border-b border-slate-800 z-10">
        <div className="flex items-center space-x-2">
          <div className="p-2 bg-red-950/40 text-red-400 rounded-lg border border-red-900/40">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm flex items-center">
              Electric Field (E-field) Visualization
              <span className="ml-2.5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-red-900/30 text-red-400 rounded-full border border-red-750/30">
                Palace Solver
              </span>
            </h3>
            <p className="text-[10px] text-slate-400">High-fidelity surface field mapping</p>
          </div>
        </div>

        {!loading && !error && (
          <div className="flex items-center space-x-3 text-[11px] text-slate-400">
            <span className="bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">FPS: {fps}</span>
            {metadata && (
              <span className="bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                Mode Frequency: {metadata.frequency_ghz.toFixed(4)} GHz
              </span>
            )}
          </div>
        )}
      </div>

      {/* Render Canvas */}
      <div className="relative flex-1 bg-[#0a0a16]">
        <div ref={containerRef} className="w-full h-full" />

        {loading && (
          <div className="absolute inset-0 bg-[#0a0a16]/95 flex flex-col justify-center items-center z-20">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
            <p className="text-xs text-slate-300">Extracting 3D field attributes...</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 bg-[#0a0a16] flex flex-col justify-center items-center px-6 text-center z-20">
            <AlertCircle className="w-8 h-8 text-red-500 mb-3" />
            <h4 className="text-xs font-semibold text-slate-200">Visualization Failed</h4>
            <p className="text-[11px] text-slate-400 max-w-sm mt-1">{error}</p>
          </div>
        )}

        {/* Legend Overlay (Bottom Left) */}
        {!loading && !error && (
          legendCollapsed ? (
            <button 
              onClick={() => setLegendCollapsed(false)}
              className="absolute bottom-4 left-4 z-10 bg-slate-900/90 backdrop-blur-md p-2 rounded-lg border border-slate-800 shadow-lg hover:bg-slate-800 transition-all text-slate-300 flex items-center space-x-1"
              title="Show Legend"
            >
              <Info className="w-4 h-4 text-indigo-400" />
              <span className="text-[10px] font-semibold pr-1">Show Legend</span>
            </button>
          ) : (
            <div className="absolute bottom-4 left-4 z-10 bg-slate-900/90 backdrop-blur-md p-3.5 rounded-xl border border-slate-800/80 w-52 shadow-lg transition-all">
              <div className="flex justify-between items-center mb-2 border-b border-slate-800/60 pb-1.5">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">E-field Distribution</div>
                <button 
                  onClick={() => setLegendCollapsed(true)} 
                  className="text-slate-500 hover:text-slate-350 text-xs px-1.5 py-0.5 rounded hover:bg-slate-800/60"
                  title="Hide Legend"
                >
                  ✕
                </button>
              </div>
              
              <div className="space-y-1.5 text-[9px] font-semibold text-slate-300">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-[#111115] rounded-sm border border-slate-700" />
                  <span>Metallic PEC Traces (Qubits / CPW)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-600 rounded-sm border border-red-500" />
                  <span>Max E-field (Concentration at Edges)</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-green-500 rounded-sm border border-green-400" />
                  <span>Mid E-field</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-600 rounded-sm border border-blue-500" />
                  <span>Min E-field (Ground / Dielectric)</span>
                </div>
              </div>

              <div className="border-t border-slate-800 my-2 pt-1.5 flex justify-between text-[8px] font-mono text-slate-400">
                <span>Peak:</span>
                <span>{maxFieldVal.toExponential(2)} V/m</span>
              </div>
            </div>
          )
        )}

        {/* Control HUD (Top Left) */}
        {!loading && !error && (
          controlsCollapsed ? (
            <button 
              onClick={() => setControlsCollapsed(false)}
              className="absolute top-4 left-4 z-10 bg-[#111124]/90 backdrop-blur-md p-2 rounded-lg border border-slate-800 shadow-lg hover:bg-slate-800 transition-all text-indigo-400 flex items-center space-x-1"
              title="Show Controls"
            >
              <Sliders className="w-4 h-4" />
              <span className="text-[10px] font-semibold pr-1">Show Controls</span>
            </button>
          ) : (
            <div className="absolute top-4 left-4 z-10 bg-[#111124]/90 backdrop-blur-md p-3.5 rounded-xl border border-slate-800/80 w-48 shadow-lg flex flex-col space-y-2.5 transition-all">
              <div className="text-[10px] font-semibold text-slate-300 flex items-center justify-between border-b border-slate-800 pb-1.5">
                <div className="flex items-center">
                  <Sliders className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
                  Viewport Controls
                </div>
                <button 
                  onClick={() => setControlsCollapsed(true)} 
                  className="text-slate-500 hover:text-slate-350 text-xs px-1.5 py-0.5 rounded hover:bg-slate-800/60"
                  title="Hide Controls"
                >
                  ✕
                </button>
              </div>
              
              <label className="flex items-center justify-between text-[10px] text-slate-300 cursor-pointer">
                <span>Auto Rotate</span>
                <input 
                  type="checkbox" 
                  checked={autoRotate} 
                  onChange={e => setAutoRotate(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-indigo-600 h-3 w-3 focus:ring-0"
                />
              </label>

              <label className="flex items-center justify-between text-[10px] text-slate-300 cursor-pointer">
                <span>Show Wireframe</span>
                <input 
                  type="checkbox" 
                  checked={showEdges} 
                  onChange={e => setShowEdges(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-indigo-600 h-3 w-3 focus:ring-0"
                />
              </label>

              <div className="space-y-1">
                <div className="flex justify-between text-[9px] text-slate-400">
                  <span>Wireframe Opacity</span>
                  <span>{Math.round(opacity * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0.0" 
                  max="1.0" 
                  step="0.05"
                  value={opacity} 
                  onChange={e => setOpacity(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              <button 
                onClick={resetView} 
                className="w-full py-1.5 bg-indigo-950/50 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800/40 rounded-lg text-[9px] font-semibold transition-all flex items-center justify-center space-x-1 shadow-sm"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Reset View</span>
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}
