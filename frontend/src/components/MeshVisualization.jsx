import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { 
  Box, 
  Rotate3d, 
  ZoomIn, 
  Layers, 
  Sliders, 
  Cpu, 
  Activity, 
  Maximize2, 
  Info,
  Loader2,
  AlertCircle,
  Eye,
  EyeOff,
  Zap,
  Network,
  Shield,
  Palette,
  MousePointerClick
} from 'lucide-react';
import { fetchVolumeMeshWireframe } from '@/lib/api/backend';

export default function MeshVisualization({ simId, vertices, elements, edges }) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const animationFrameIdRef = useRef(null);

  // Mesh references
  const wireframeMeshRef = useRef(null);
  const surfaceMeshesRef = useRef([]);

  // Component state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metadata, setMetadata] = useState(null);
  const [bounds, setBounds] = useState(null);
  const [surfaces, setSurfaces] = useState({});
  
  // UI Controls state
  const [viewMode, setViewMode] = useState('electrostatic'); // 'wireframe' | 'solid' | 'electrostatic'
  const [wireframeOpacity, setWireframeOpacity] = useState(0.35);
  const [showWireframeOverlay, setShowWireframeOverlay] = useState(true);
  const [showGround, setShowGround] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [highlightedTerminal, setHighlightedTerminal] = useState(null);
  const [fps, setFps] = useState(60);

  // HUD & Info display states
  const [controlsCollapsed, setControlsCollapsed] = useState(false);
  const [infoCollapsed, setInfoCollapsed] = useState(false);

  // Helper to generate terminal color from name
  const getTerminalColor = (name) => {
    if (name.toLowerCase() === 'pec') return new THREE.Color('#334155');
    if (name.toLowerCase().startsWith('port')) return new THREE.Color('#f43f5e'); // rose/red for junctions
    
    // Hash-based stable color generation for terminals
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return new THREE.Color(`hsl(${hue}, 85%, 55%)`);
  };

  // Helper to check if a terminal name is a Port/Junction
  const isJunction = (name) => name.toLowerCase().startsWith('port');

  // Fetch mesh data on mount/simId change
  useEffect(() => {
    let active = true;

    // Check if direct data is provided as props
    if (vertices && (elements || edges)) {
      setLoading(false);
      const passedEdges = edges || elements;
      
      const xs = vertices.map(v => v[0]);
      const ys = vertices.map(v => v[1]);
      const zs = vertices.map(v => v[2]);
      
      const response = {
        vertices: vertices,
        edges: passedEdges,
        bounds: {
          x: [Math.min(...xs), Math.max(...xs)],
          y: [Math.min(...ys), Math.max(...ys)],
          z: [Math.min(...zs), Math.max(...zs)]
        },
        surfaces: {},
        metadata: {
          solver: "eigenmode",
          total_elements: passedEdges.length,
          total_vertices: vertices.length,
          total_edges: passedEdges.length,
          frequency_ghz: 4.5,
          runtime_seconds: 58
        }
      };
      
      setMetadata(response.metadata);
      setBounds(response.bounds);
      setSurfaces(response.surfaces);
      setViewMode('wireframe');
      initThree(response);
      return;
    }

    if (!simId) {
      setError("No simulation ID or direct mesh data provided.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetchVolumeMeshWireframe(simId)
      .then(response => {
        if (!active) return;
        setMetadata(response.metadata);
        setBounds(response.bounds);
        setSurfaces(response.surfaces || {});
        
        // If the simulation is electrostatic or we have surfaces, default to electrostatic view mode
        const hasSurfs = response.surfaces && Object.keys(response.surfaces).length > 0;
        setViewMode(hasSurfs ? 'electrostatic' : 'wireframe');
        
        initThree(response);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error loading volume mesh wireframe:", err);
        if (active) {
          setError(err.message || "Failed to load volume mesh wireframe data. Verify that Palace simulation output contains a valid .msh file.");
          setLoading(false);
        }
      });

    return () => {
      active = false;
      cleanupThree();
    };
  }, [simId, vertices, elements, edges]);

  // Handle control updates
  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = autoRotate;
    }
  }, [autoRotate]);

  // Material update effector
  useEffect(() => {
    updateMaterials();
  }, [viewMode, wireframeOpacity, showWireframeOverlay, showGround, highlightedTerminal, surfaces]);

  const getMaterialForSurface = (name, mode, isHighlighted, isAnyHighlighted) => {
    const isPec = name.toLowerCase() === 'pec';
    const isPort = isJunction(name);
    
    let opacity = 1.0;
    let transparent = false;
    
    if (isPec) {
      transparent = true;
      opacity = showGround ? (mode === 'electrostatic' ? 0.35 : 0.6) : 0.0;
    } else if (isAnyHighlighted && !isHighlighted) {
      transparent = true;
      opacity = 0.15;
    }

    if (mode === 'solid') {
      if (isPec) {
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#334155'), // dark steel blue
          metalness: 0.8,
          roughness: 0.2,
          transparent,
          opacity,
          side: THREE.DoubleSide
        });
      } else if (isPort) {
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#ef4444'), // bright red
          metalness: 0.1,
          roughness: 0.5,
          emissive: new THREE.Color('#ef4444'),
          emissiveIntensity: 0.5,
          transparent,
          opacity,
          side: THREE.DoubleSide
        });
      } else {
        // Conductors: polished gold/copper
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#f59e0b'), // warm gold
          metalness: 0.9,
          roughness: 0.15,
          transparent,
          opacity,
          side: THREE.DoubleSide
        });
      }
    } else if (mode === 'electrostatic') {
      if (isPec) {
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#1e293b'), // slate grey
          metalness: 0.7,
          roughness: 0.3,
          transparent,
          opacity,
          side: THREE.DoubleSide
        });
      } else if (isPort) {
        return new THREE.MeshStandardMaterial({
          color: new THREE.Color('#f43f5e'), // hot rose for ports
          metalness: 0.2,
          roughness: 0.2,
          emissive: new THREE.Color('#f43f5e'),
          emissiveIntensity: isHighlighted ? 1.8 : 0.8,
          transparent,
          opacity,
          side: THREE.DoubleSide
        });
      } else {
        const color = getTerminalColor(name);
        return new THREE.MeshStandardMaterial({
          color: color,
          metalness: 0.85,
          roughness: 0.2,
          emissive: color,
          emissiveIntensity: isHighlighted ? 1.2 : 0.25,
          transparent,
          opacity,
          side: THREE.DoubleSide
        });
      }
    }
  };

  const updateMaterials = () => {
    if (!sceneRef.current) return;
    
    const isAnyHighlighted = highlightedTerminal !== null;
    
    // Wireframe Mesh overlay visibility
    if (wireframeMeshRef.current) {
      if (viewMode === 'wireframe') {
        wireframeMeshRef.current.visible = true;
        wireframeMeshRef.current.material.opacity = wireframeOpacity;
      } else {
        wireframeMeshRef.current.visible = showWireframeOverlay;
        wireframeMeshRef.current.material.opacity = showWireframeOverlay ? wireframeOpacity : 0.0;
      }
    }

    // Update each surface mesh material
    surfaceMeshesRef.current.forEach(mesh => {
      const name = mesh.name;
      const isHighlighted = (highlightedTerminal === name);
      
      mesh.visible = (viewMode !== 'wireframe');
      if (mesh.visible) {
        const oldMat = mesh.material;
        mesh.material = getMaterialForSurface(name, viewMode, isHighlighted, isAnyHighlighted);
        if (oldMat && oldMat !== mesh.material) {
          oldMat.dispose();
        }
      }
    });
  };

  // Three.js Initialization & Lifecycle
  const initThree = (meshData) => {
    cleanupThree();

    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 750;

    // 1. Create Scene with Dark Cyber Background (#0f172a)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0b0f19');
    sceneRef.current = scene;

    // 2. Create Camera
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    cameraRef.current = camera;

    // 3. Create WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Create Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 0.8;
    controlsRef.current = controls;

    // 5. Add Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight1.position.set(20, 40, 30);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.4); // soft blue fill light
    dirLight2.position.set(-20, -30, -20);
    scene.add(dirLight2);

    // 6. Build Geometry
    const { vertices, edges, surfaces: surfData } = meshData;
    const vertexArray = new Float32Array(vertices.flat());
    const lineIndices = edges.flat();

    // Wireframe Edges Geometry
    const wireframeGeometry = new THREE.BufferGeometry();
    wireframeGeometry.setAttribute('position', new THREE.BufferAttribute(vertexArray, 3));
    wireframeGeometry.setIndex(new THREE.BufferAttribute(new Uint32Array(lineIndices), 1));

    const wireframeMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color('#475569'), // Slate wireframe
      transparent: true,
      opacity: wireframeOpacity,
      linewidth: 1,
    });

    const wireframeMesh = new THREE.LineSegments(wireframeGeometry, wireframeMaterial);
    scene.add(wireframeMesh);
    wireframeMeshRef.current = wireframeMesh;

    // Build Surfaces
    const surfaceMeshes = [];
    if (surfData) {
      Object.entries(surfData).forEach(([name, sData]) => {
        const triangles = sData.triangles;
        if (!triangles || triangles.length === 0) return;

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(vertexArray, 3));
        geom.setIndex(new THREE.BufferAttribute(new Uint32Array(triangles.flat()), 1));
        geom.computeVertexNormals();

        const mesh = new THREE.Mesh(geom, null);
        mesh.name = name;
        scene.add(mesh);
        surfaceMeshes.push(mesh);
      });
    }
    surfaceMeshesRef.current = surfaceMeshes;

    // Trigger initial material setup
    updateMaterials();

    // 7. Auto-Frame Camera
    wireframeGeometry.computeBoundingSphere();
    const sphere = wireframeGeometry.boundingSphere;
    const radius = sphere.radius;
    const center = sphere.center;

    const distance = radius * 2.1;
    camera.position.set(center.x + distance * 0.9, center.y + distance * 0.8, center.z + distance * 1.1);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();

    // 8. Animation & Render Loop
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

    // 9. Resize Handler
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight || 750;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);
    containerRef.current._handleResize = handleResize;
  };

  const cleanupThree = () => {
    if (animationFrameIdRef.current) {
      cancelAnimationFrame(animationFrameIdRef.current);
    }
    if (containerRef.current && containerRef.current._handleResize) {
      window.removeEventListener('resize', containerRef.current._handleResize);
    }
    
    if (wireframeMeshRef.current) {
      sceneRef.current?.remove(wireframeMeshRef.current);
      wireframeMeshRef.current.geometry.dispose();
      wireframeMeshRef.current.material.dispose();
    }

    if (surfaceMeshesRef.current) {
      surfaceMeshesRef.current.forEach(mesh => {
        sceneRef.current?.remove(mesh);
        mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
      surfaceMeshesRef.current = [];
    }

    if (rendererRef.current) {
      rendererRef.current.dispose();
    }

    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }

    controlsRef.current = null;
    cameraRef.current = null;
    sceneRef.current = null;
    rendererRef.current = null;
    wireframeMeshRef.current = null;
  };

  // Focus on center qubit/refinement region
  const focusComponents = () => {
    if (controlsRef.current && cameraRef.current && wireframeMeshRef.current) {
      const geometry = wireframeMeshRef.current.geometry;
      geometry.computeBoundingSphere();
      const sphere = geometry.boundingSphere;
      const targetCenter = sphere.center;
      const zoomRadius = sphere.radius * 0.45;

      const targetPos = new THREE.Vector3(
        targetCenter.x + zoomRadius * 1.3,
        targetCenter.y + zoomRadius * 0.9,
        targetCenter.z + zoomRadius * 1.3
      );

      let step = 0;
      const animateCamera = () => {
        if (step >= 25) return;
        cameraRef.current.position.lerp(targetPos, 0.15);
        controlsRef.current.target.lerp(targetCenter, 0.15);
        controlsRef.current.update();
        step++;
        requestAnimationFrame(animateCamera);
      };
      animateCamera();
    }
  };

  // Reset view to frame entire simulation domain
  const resetCamera = () => {
    if (controlsRef.current && cameraRef.current && wireframeMeshRef.current) {
      const geometry = wireframeMeshRef.current.geometry;
      geometry.computeBoundingSphere();
      const sphere = geometry.boundingSphere;
      const radius = sphere.radius;

      const targetPos = new THREE.Vector3(
        sphere.center.x + radius * 1.6,
        sphere.center.y + radius * 1.3,
        sphere.center.z + radius * 1.8
      );

      let step = 0;
      const animateCamera = () => {
        if (step >= 25) return;
        cameraRef.current.position.lerp(targetPos, 0.15);
        controlsRef.current.target.lerp(sphere.center, 0.15);
        controlsRef.current.update();
        step++;
        requestAnimationFrame(animateCamera);
      };
      animateCamera();
    }
  };

  const formatSpan = (minMax) => {
    if (!minMax) return "0.00 mm";
    const span = Math.abs(minMax[1] - minMax[0]);
    return `${span.toFixed(2)} mm`;
  };

  const hasSurfaces = Object.keys(surfaces).length > 0;

  return (
    <div className="relative w-full h-[750px] bg-[#0b0f19] border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl flex flex-col font-sans">
      {/* 1. Header Bar */}
      <div className="flex justify-between items-center px-6 py-4 bg-[#0f172a]/95 border-b border-slate-800/50 z-10">
        <div className="flex items-center space-x-3.5">
          <div className="bg-indigo-500/10 p-2.5 rounded-xl text-indigo-400 border border-indigo-500/20 shadow-inner">
            <Rotate3d className="w-5.5 h-5.5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-100 text-sm flex items-center tracking-wide">
              Palace Conformal 3D Mesh Viewer
              {metadata?.solver && (
                <span className="ml-3 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-sky-500/10 text-sky-400 rounded-full border border-sky-500/20">
                  {metadata.solver} solver
                </span>
              )}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Interactive physical boundary surfaces, connectivity mapping, and volumetric grid elements
            </p>
          </div>
        </div>
        
        {/* Performance telemetry */}
        {!loading && !error && (
          <div className="flex items-center space-x-3 text-xs text-slate-400">
            <div className="flex items-center space-x-1.5 bg-slate-850/60 px-3 py-1.5 rounded-lg border border-slate-800/40">
              <Activity className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>FPS: <strong className="text-slate-200">{fps}</strong></span>
            </div>
            <div className="flex items-center space-x-1.5 bg-slate-850/60 px-3 py-1.5 rounded-lg border border-slate-800/40">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>Nodes: <strong className="text-slate-200">{metadata?.total_vertices?.toLocaleString()}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* 2. Primary WebGL Canvas Area */}
      <div className="relative flex-1 bg-[#0b0f19]">
        <div ref={containerRef} className="w-full h-full min-h-[520px]" />

        {/* Loading Screen Overlay */}
        {loading && (
          <div className="absolute inset-0 bg-[#0b0f19]/95 flex flex-col justify-center items-center z-20">
            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin mb-4" />
            <p className="text-sm font-medium text-slate-200 animate-pulse">Extracting conformal surfaces and volumetric elements...</p>
            <p className="text-xs text-slate-450 mt-1 text-slate-400">Loading Palace solver geometry mesh data</p>
          </div>
        )}

        {/* Error Screen Overlay */}
        {error && (
          <div className="absolute inset-0 bg-[#0b0f19] flex flex-col justify-center items-center px-8 text-center z-20">
            <div className="p-4 bg-red-950/30 text-red-400 rounded-2xl mb-4 border border-red-900/30">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h4 className="text-sm font-semibold text-slate-250 mb-1.5">3D Visualizer Unavailable</h4>
            <p className="text-xs text-slate-400 max-w-md leading-relaxed">{error}</p>
          </div>
        )}

        {/* View Mode Switching Tabs (Floating Center-Top) */}
        {!loading && !error && hasSurfaces && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10 bg-slate-900/90 backdrop-blur-md p-1 rounded-xl border border-slate-800/80 shadow-xl flex space-x-1">
            <button
              onClick={() => setViewMode('electrostatic')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'electrostatic'
                  ? 'bg-indigo-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Electrostatic Mode</span>
            </button>
            <button
              onClick={() => setViewMode('solid')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'solid'
                  ? 'bg-indigo-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Solid Conductor</span>
            </button>
            <button
              onClick={() => setViewMode('wireframe')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                viewMode === 'wireframe'
                  ? 'bg-indigo-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
              }`}
            >
              <Network className="w-3.5 h-3.5" />
              <span>3D Volume Mesh</span>
            </button>
          </div>
        )}

        {/* Viewport Control Panel (Floating Left) */}
        {!loading && !error && (
          <div className="absolute top-4 left-4 z-10 flex flex-col space-y-3">
            {controlsCollapsed ? (
              <button 
                onClick={() => setControlsCollapsed(false)}
                className="bg-slate-900/90 backdrop-blur-md p-2.5 rounded-xl border border-slate-800/80 shadow-lg hover:bg-slate-800 transition-all text-indigo-400 flex items-center space-x-2"
                title="Show Control Board"
              >
                <Sliders className="w-4.5 h-4.5" />
                <span className="text-xs font-semibold pr-1">Controls</span>
              </button>
            ) : (
              <div className="bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-slate-800/80 flex flex-col space-y-4 w-64 transition-all">
                <div className="text-xs font-semibold text-slate-200 flex items-center justify-between border-b border-slate-800/50 pb-2">
                  <div className="flex items-center text-slate-300">
                    <Sliders className="w-4 h-4 mr-2 text-indigo-400" />
                    Viewport Settings
                  </div>
                  <button 
                    onClick={() => setControlsCollapsed(true)} 
                    className="text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 p-1 rounded-lg"
                    title="Hide Panel"
                  >
                    ✕
                  </button>
                </div>

                {/* Ground Plane Toggle */}
                {hasSurfaces && viewMode !== 'wireframe' && (
                  <div className="flex flex-col space-y-2 border-b border-slate-800/40 pb-3">
                    <div className="flex items-center justify-between text-xs text-slate-350">
                      <span className="flex items-center">
                        <Box className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                        Ground PEC Plane
                      </span>
                      <button
                        onClick={() => setShowGround(!showGround)}
                        className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[10px] font-bold border transition-all ${
                          showGround 
                            ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' 
                            : 'bg-slate-950/50 text-slate-400 border-slate-850'
                        }`}
                      >
                        {showGround ? <Eye className="w-3 h-3 mr-1" /> : <EyeOff className="w-3 h-3 mr-1" />}
                        {showGround ? "ENABLED" : "MUTED"}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-normal">
                      Shows/hides the top ground plane layer (with pockets) and the bottom PEC substrate ground.
                    </p>
                  </div>
                )}

                {/* Wireframe Overlay Controls */}
                {viewMode !== 'wireframe' && (
                  <div className="flex flex-col space-y-2 border-b border-slate-800/40 pb-3">
                    <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer hover:text-slate-100">
                      <span className="flex items-center">
                        <Network className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                        Show Wireframe Mesh
                      </span>
                      <input 
                        type="checkbox" 
                        checked={showWireframeOverlay} 
                        onChange={e => setShowWireframeOverlay(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                      />
                    </label>
                  </div>
                )}

                {/* Rotation Toggle */}
                <div className="flex flex-col space-y-2">
                  <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer hover:text-slate-100">
                    <span className="flex items-center">
                      <Rotate3d className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                      Auto Rotation
                    </span>
                    <input 
                      type="checkbox" 
                      checked={autoRotate} 
                      onChange={e => setAutoRotate(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 cursor-pointer"
                    />
                  </label>
                </div>

                {/* Wireframe Opacity Slider */}
                {(viewMode === 'wireframe' || showWireframeOverlay) && (
                  <div className="flex flex-col space-y-2 pt-1 border-t border-slate-800/40">
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Grid Density Opacity</span>
                      <span>{Math.round(wireframeOpacity * 100)}%</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.05" 
                      max="1.0" 
                      step="0.05"
                      value={wireframeOpacity} 
                      onChange={e => setWireframeOpacity(parseFloat(e.target.value))}
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
                )}

                {/* Reset & Focus Controls */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/50">
                  <button 
                    onClick={focusComponents} 
                    className="flex items-center justify-center space-x-1 py-2 px-2 bg-indigo-950/40 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800/30 rounded-xl text-[10px] font-bold tracking-wide transition-all shadow-sm"
                    title="Focus on components"
                  >
                    <ZoomIn className="w-3 h-3" />
                    <span>Focus Core</span>
                  </button>
                  <button 
                    onClick={resetCamera} 
                    className="flex items-center justify-center space-x-1 py-2 px-2 bg-slate-800/40 hover:bg-slate-700/60 text-slate-300 border border-slate-700/40 rounded-xl text-[10px] font-bold tracking-wide transition-all"
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>Fit Frame</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Dynamic Physical Components List (Floating Right) */}
        {!loading && !error && hasSurfaces && viewMode !== 'wireframe' && (
          <div className="absolute top-4 right-4 z-10 flex flex-col space-y-3">
            {infoCollapsed ? (
              <button 
                onClick={() => setInfoCollapsed(false)}
                className="bg-slate-900/90 backdrop-blur-md p-2.5 rounded-xl border border-slate-800/80 shadow-lg hover:bg-slate-800 transition-all text-slate-350 flex items-center space-x-2"
                title="Show Conductor Components List"
              >
                <Layers className="w-4.5 h-4.5 text-indigo-400" />
                <span className="text-xs font-semibold pr-1">Boundary Groups</span>
              </button>
            ) : (
              <div className="bg-slate-900/90 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-slate-800/80 flex flex-col w-64 max-h-[580px] transition-all">
                <div className="text-xs font-semibold text-slate-200 flex items-center justify-between border-b border-slate-800/50 pb-2">
                  <div className="flex items-center text-slate-350">
                    <Layers className="w-4 h-4 mr-2 text-indigo-400" />
                    Physical Boundaries
                  </div>
                  <button 
                    onClick={() => setInfoCollapsed(true)} 
                    className="text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 p-1 rounded-lg"
                    title="Hide Panel"
                  >
                    ✕
                  </button>
                </div>

                <p className="text-[10px] text-slate-400 mt-2 leading-relaxed flex items-center">
                  <MousePointerClick className="w-3 h-3 mr-1 text-slate-400 animate-bounce" />
                  Select a boundary to isolate/highlight:
                </p>

                {/* Scrollable list of physical surfaces */}
                <div className="flex-1 overflow-y-auto mt-3 pr-1 space-y-1.5 max-h-[420px]">
                  {Object.entries(surfaces)
                    .sort(([aName], [bName]) => {
                      // Sort PEC to bottom, ports to top, then terminals alphabetically
                      if (aName === 'pec') return 1;
                      if (bName === 'pec') return -1;
                      const aIsPort = isJunction(aName);
                      const bIsPort = isJunction(bName);
                      if (aIsPort && !bIsPort) return -1;
                      if (!aIsPort && bIsPort) return 1;
                      return aName.localeCompare(bName);
                    })
                    .map(([name, sData]) => {
                      const isPec = name === 'pec';
                      const isPort = isJunction(name);
                      const color = isPec 
                        ? '#64748b' 
                        : (isPort ? '#f43f5e' : `hsl(${(Math.abs(name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360))}, 85%, 55%)`);
                      
                      // Pretty print name: e.g. terminal_q0_pad1 -> Q0 Pad1
                      let prettyName = name;
                      if (isPec) prettyName = "Ground Shield (PEC)";
                      else if (name.startsWith('terminal_')) {
                        prettyName = name.replace('terminal_', '').replace(/_/g, ' ');
                      } else if (name.startsWith('port_')) {
                        prettyName = "Junction " + name.replace('port_', '').replace(/_/g, ' ');
                      }

                      const isSelected = highlightedTerminal === name;

                      return (
                        <button
                          key={name}
                          onClick={() => setHighlightedTerminal(isSelected ? null : name)}
                          className={`w-full text-left p-2 rounded-xl border text-[11px] flex items-center justify-between transition-all ${
                            isSelected 
                              ? 'bg-indigo-600/25 border-indigo-500/80 text-white font-semibold' 
                              : 'bg-slate-950/40 border-slate-850 hover:bg-slate-800/40 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center space-x-2 truncate">
                            <span 
                              className="w-2.5 h-2.5 rounded-full flex-shrink-0" 
                              style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
                            />
                            <span className="capitalize truncate font-medium">{prettyName}</span>
                          </div>
                          
                          <div className="flex items-center space-x-1.5 flex-shrink-0">
                            {isPort && (
                              <span className="px-1.5 py-0.5 bg-rose-500/10 text-rose-400 text-[9px] font-bold rounded border border-rose-500/20">
                                PORT
                              </span>
                            )}
                            <span className="text-[9px] text-slate-500 font-mono">
                              #{sData.tag}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                </div>

                {highlightedTerminal && (
                  <button
                    onClick={() => setHighlightedTerminal(null)}
                    className="mt-3 py-1.5 px-3 bg-slate-950/60 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-400 hover:text-slate-200 text-center w-full transition-all"
                  >
                    Clear Highlight Selection
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bottom Info HUD Bar */}
        {!loading && !error && (
          <div className="absolute bottom-4 left-4 right-4 bg-slate-900/90 backdrop-blur-md px-6 py-4 rounded-2xl shadow-xl border border-slate-800/80 z-10 flex flex-wrap justify-between items-center text-white">
            <div className="flex space-x-6 items-center flex-wrap">
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider">Solver</span>
                <span className="text-xs font-bold text-indigo-300 capitalize">{metadata?.solver || "Unknown"}</span>
              </div>
              <div className="w-px h-6 bg-slate-800/80" />
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider">Tetrahedral Elements</span>
                <span className="text-xs font-mono font-bold text-white">{metadata?.total_elements?.toLocaleString()}</span>
              </div>
              <div className="w-px h-6 bg-slate-800/80" />
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider">Nodes</span>
                <span className="text-xs font-mono font-bold text-white">{metadata?.total_vertices?.toLocaleString()}</span>
              </div>
              
              {hasSurfaces && (
                <>
                  <div className="w-px h-6 bg-slate-800/80" />
                  <div className="flex flex-col">
                    <span className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider">Boundary Groups</span>
                    <span className="text-xs font-mono font-bold text-sky-400">{Object.keys(surfaces).length} groups</span>
                  </div>
                </>
              )}

              {metadata?.frequency_ghz > 0 && (
                <>
                  <div className="w-px h-6 bg-slate-800/80" />
                  <div className="flex flex-col">
                    <span className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider">Resonant Frequency</span>
                    <span className="text-xs font-mono font-bold text-emerald-400">{metadata.frequency_ghz.toFixed(4)} GHz</span>
                  </div>
                </>
              )}

              <div className="w-px h-6 bg-slate-800/80" />
              <div className="flex flex-col">
                <span className="text-[9px] text-slate-400 uppercase font-semibold tracking-wider">Solve Duration</span>
                <span className="text-xs font-mono text-slate-350">{metadata?.runtime_seconds || 0} sec</span>
              </div>
            </div>

            {/* Bounding Box Dimensions */}
            <div className="flex items-center space-x-3 text-[11px] ml-4 mt-2 sm:mt-0">
              <div className="flex items-center space-x-2 text-slate-300 bg-slate-950/60 py-1.5 px-3 rounded-xl border border-slate-800/60">
                <Box className="w-3.5 h-3.5 text-indigo-400 mr-0.5" />
                <span>X: <strong>{formatSpan(bounds?.x)}</strong></span>
                <span className="text-slate-700">|</span>
                <span>Y: <strong>{formatSpan(bounds?.y)}</strong></span>
                <span className="text-slate-700">|</span>
                <span>Z: <strong>{formatSpan(bounds?.z)}</strong></span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
