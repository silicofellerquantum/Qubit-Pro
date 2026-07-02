import { 
  RotateCw, 
  Sliders, 
  Activity, 
  Cpu, 
  Maximize2, 
  Info,
  Loader2,
  AlertCircle,
  Flame,
  Eye,
  EyeOff
} from "lucide-react";
import { fetch3DVisualization } from "@/lib/api/backend";

/**
 * EnergyDensityVisualization component
 * Displays U_m (magnetic energy density) on a 3D surface mesh.
 * Visualised as a premium blue heat map showing energy concentration.
 */
export default function EnergyDensityVisualization({ 
  simId, 
  mode = 1,
  vertices: initialVertices,
  faces: initialFaces,
  normals: initialNormals,
  uMValues: initialUMValues
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

  // Visual customisation state
  const [opacity, setOpacity] = useState(0.9);
  const [showEdges, setShowEdges] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
  const [maxEnergyVal, setMaxEnergyVal] = useState(0);

  // HUD & Legend display states
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [legendCollapsed, setLegendCollapsed] = useState(false);

  // Load and initialize data
  useEffect(() => {
    let active = true;

    // Case 1: Props are provided directly
    if (initialVertices && initialFaces && initialUMValues) {
      setLoading(false);
      initThree({
        mesh: {
          vertices: initialVertices,
          faces: initialFaces,
          normals: initialNormals || []
        },
        field: {
          values: initialUMValues,
          name: "U_m",
          unit: "J/m³"
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

    // Fetch U_m specifically using our backend query additions
    fetch3DVisualization(simId, mode, "U_m")
      .then(response => {
        if (!active) return;
        setMetadata(response.metadata);
        initThree(response);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading energy density visualization:", err);
        if (active) {
          setError(err.message || "Failed to load 3D energy density visualization data.");
          setLoading(false);
        }
      });

    return () => {
      active = false;
      cleanupThree();
    };
  }, [simId, mode, initialVertices, initialFaces, initialUMValues]);

  // Handle autoRotate update dynamically
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  // Handle opacity update dynamically
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.material.opacity = opacity;
      meshRef.current.material.needsUpdate = true;
    }
  }, [opacity]);

  // Handle edges visibility dynamically
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
    scene.background = new THREE.Color("#070714");
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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
    keyLight.position.set(1, 1.5, 1).normalize();
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x5577ff, 0.5);
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

    // 7. Calculate Color Scale: Blue Heat Map (Dark Slate Blue -> Deep Blue -> Cyan -> White)
    // - Active components (attributes >= 10) = Very Dark Charcoal
    const values = field.values;
    const attributes = mesh.attributes || [];
    const maxVal = Math.max(...values, 1e-15);
    setMaxEnergyVal(maxVal);

    const logMax = Math.log10(maxVal);
    const logMin = logMax - 6.0; // 6 decades floor

    const colorsFlat = new Float32Array(values.length * 3);
    for (let i = 0; i < values.length; i++) {
      const attr = attributes[i] || 0;
      if (attr >= 200) {
        // Josephson Junction -> render as bright metallic gold/orange
        colorsFlat[i * 3] = 1.0;
        colorsFlat[i * 3 + 1] = 0.73;
        colorsFlat[i * 3 + 2] = 0.2;
      } else if (attr >= 10) {
        // Active component or connection -> render as very dark slate / charcoal
        colorsFlat[i * 3] = 0.06;
        colorsFlat[i * 3 + 1] = 0.06;
        colorsFlat[i * 3 + 2] = 0.08;
      } else {
        const val = values[i];
        // Logarithmic scaling for energy density to prevent swamping
        const logVal = Math.log10(Math.max(val, 1e-25));
        const t = Math.min(Math.max((logVal - logMin) / (logMax - logMin), 0.0), 1.0);

        // Interpolation steps
        let r = 0, g = 0, b = 0;
        if (t < 0.3) {
          // Dark slate blue to deep blue
          const u = t / 0.3;
          r = 0.02;
          g = 0.05 + 0.1 * u;
          b = 0.15 + 0.5 * u;
        } else if (t < 0.7) {
          // Deep blue to bright cyan
          const u = (t - 0.3) / 0.4;
          r = 0.02 + 0.08 * u;
          g = 0.15 + 0.75 * u;
          b = 0.65 + 0.35 * u;
        } else {
          // Bright cyan to white
          const u = (t - 0.7) / 0.3;
          r = 0.1 + 0.9 * u;
          g = 0.9 + 0.1 * u;
          b = 1.0;
        }

        colorsFlat[i * 3] = r;
        colorsFlat[i * 3 + 1] = g;
        colorsFlat[i * 3 + 2] = b;
      }
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colorsFlat, 3));

    // 8. Create Material and Mesh
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.3,
      metalness: 0.15,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: opacity
    });

    const threeMesh = new THREE.Mesh(geometry, material);
    scene.add(threeMesh);
    meshRef.current = threeMesh;

    // 9. Add Wireframe Edges Overlay
    const edgeGeom = new THREE.EdgesGeometry(geometry, 25);
    const edgeMat = new THREE.LineBasicMaterial({
      color: new THREE.Color("#050514"),
      transparent: true,
      opacity: 0.25,
      linewidth: 1
    });
    const edgeSegments = new THREE.LineSegments(edgeGeom, edgeMat);
    edgeSegments.visible = showEdges;
    scene.add(edgeSegments);
    edgesRef.current = edgeSegments;

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
    <div className="relative w-full h-[750px] bg-[#050512] border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col font-sans text-white">
      {/* Header bar */}
      <div className="flex justify-between items-center px-4 py-3 bg-[#0d0d1f] border-b border-slate-800 z-10">
        <div className="flex items-center space-x-2">
          <div className="p-2 bg-indigo-950/40 text-indigo-400 rounded-lg border border-indigo-900/40">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-sm flex items-center">
              Magnetic Energy Density (U_m)
              <span className="ml-2.5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-indigo-900/30 text-indigo-400 rounded-full border border-indigo-750/30">
                Palace Solver
              </span>
            </h3>
            <p className="text-[10px] text-slate-400">Visualization of magnetic energy concentrations</p>
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
      <div className="relative flex-1 bg-[#050512]">
        <div ref={containerRef} className="w-full h-full" />

        {loading && (
          <div className="absolute inset-0 bg-[#050512]/95 flex flex-col justify-center items-center z-20">
            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
            <p className="text-xs text-slate-300">Extracting U_m field values...</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 bg-[#050512] flex flex-col justify-center items-center px-6 text-center z-20">
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
            <div className="absolute bottom-4 left-4 z-10 bg-slate-900/90 backdrop-blur-md p-3.5 rounded-xl border border-slate-800/80 w-48 shadow-lg transition-all">
              <div className="flex justify-between items-center mb-1.5 border-b border-slate-800/60 pb-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Energy Density (U_m)</div>
                <button 
                  onClick={() => setLegendCollapsed(true)} 
                  className="text-slate-500 hover:text-slate-350 text-xs px-1.5 py-0.5 rounded hover:bg-slate-800/60"
                  title="Hide Legend"
                >
                  ✕
                </button>
              </div>
              <div className="h-3 w-full rounded bg-gradient-to-r from-blue-900 via-cyan-400 to-white border border-slate-950" />
              <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-1 mb-2">
                <span>0 (Low)</span>
                <span>{maxEnergyVal.toExponential(2)} J/m³</span>
              </div>
              <div className="space-y-1 text-[9px] font-semibold text-slate-300 pt-1.5 border-t border-slate-800/60">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-[#111115] rounded-sm border border-slate-700" />
                  <span>Metallic PEC Traces</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-[#ffba33] rounded-sm border border-amber-500" />
                  <span>Josephson Junctions (Gold)</span>
                </div>
              </div>
            </div>
          )
        )}

        {/* Control HUD (Top Left) */}
        {!loading && !error && (
          controlsCollapsed ? (
            <button 
              onClick={() => setControlsCollapsed(false)}
              className="absolute top-4 left-4 z-10 bg-[#0d0d1f]/90 backdrop-blur-md p-2 rounded-lg border border-slate-800 shadow-lg hover:bg-slate-800 transition-all text-indigo-400 flex items-center space-x-1"
              title="Show Controls"
            >
              <Sliders className="w-4 h-4" />
              <span className="text-[10px] font-semibold pr-1">Show Controls</span>
            </button>
          ) : (
            <div className="absolute top-4 left-4 z-10 bg-[#0d0d1f]/90 backdrop-blur-md p-3.5 rounded-xl border border-slate-800/80 w-48 shadow-lg flex flex-col space-y-2.5 transition-all">
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
                <span>Show Edges</span>
                <input 
                  type="checkbox" 
                  checked={showEdges} 
                  onChange={e => setShowEdges(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-indigo-600 h-3 w-3 focus:ring-0"
                />
              </label>

              <div className="space-y-1">
                <div className="flex justify-between text-[9px] text-slate-400">
                  <span>Opacity</span>
                  <span>{Math.round(opacity * 100)}%</span>
                </div>
                <input 
                  type="range" 
                  min="0.1" 
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
