import sys
import os

# ── Must be set BEFORE any matplotlib/Qt imports ────────────────────────────
os.environ["MPLBACKEND"] = "Agg"
os.environ["QISKIT_METAL_HEADLESS"] = "1"
os.environ["QT_QPA_PLATFORM"] = "offscreen"

import json
import inspect
import math
import logging
from types import ModuleType

# Setup logging to sys.stderr so it doesn't pollute sys.stdout (used for JSON IPC)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stderr
)
log = logging.getLogger("qiskit_metal_worker")

# Bulletproof PySide2 Mocking: Inject mocks if PySide2 is not present (e.g. Python 3.11+)
try:
    import PySide2
    log.info("Native PySide2 is available.")
except ImportError:
    log.info("Native PySide2 not found. Injecting mock modules for headless execution...")
    
    class QtMeta(type):
        def __getattr__(cls, name):
            if name and name[0].isupper():
                class SubMeta(type):
                    def __getattr__(self, sub_name):
                        return 0
                class Sub(metaclass=SubMeta):
                    pass
                return Sub
            return 0

    class Qt(metaclass=QtMeta):
        AA_ShareOpenGLContexts = 1
        AA_EnableHighDpiScaling = 2
        AA_UseHighDpiPixmaps = 3

    class QCoreApplication:
        @staticmethod
        def instance(): return None
        @staticmethod
        def testAttribute(attr): return False
        @staticmethod
        def setAttribute(attr, val=True): pass

    class QApplication(QCoreApplication):
        @staticmethod
        def instance(): return None
        @staticmethod
        def testAttribute(attr): return False
        @staticmethod
        def setAttribute(attr, val=True): pass
        def __init__(self, *a, **k): pass

    class QFileDialog:
        @staticmethod
        def getSaveFileName(*args, **kwargs): return ("", "")
        @staticmethod
        def getOpenFileName(*args, **kwargs): return ("", "")
        @staticmethod
        def getOpenFileNames(*args, **kwargs): return ([], "")
        @staticmethod
        def getExistingDirectory(*args, **kwargs): return ""
        def __init__(self, *a, **k): pass

    class QVersionNumber:
        @staticmethod
        def segments(): return (5, 15, 2)

    class QLibraryInfo:
        @staticmethod
        def version(): return QVersionNumber()

    class Signal:
        def __init__(self, *args, **kwargs): pass
        def connect(self, slot): pass
        def emit(self, *args, **kwargs): pass

    def Slot(*args, **kwargs):
        return lambda f: f

    class MockModule(ModuleType):
        def __getattr__(self, name):
            full_name = self.__name__ + "." + name
            if full_name in sys.modules:
                return sys.modules[full_name]
            
            if name == 'Qt': return Qt
            if name == 'QCoreApplication': return QCoreApplication
            if name == 'QApplication': return QApplication
            if name == 'QFileDialog': return QFileDialog
            if name == 'QVersionNumber': return QVersionNumber
            if name == 'QLibraryInfo': return QLibraryInfo
            if name == 'Signal': return Signal
            if name == 'Slot': return Slot
            
            class DummyClass:
                def __init__(self, *args, **kwargs): pass
                def __getattr__(self, n): return lambda *a, **k: None
                @classmethod
                def __class_getitem__(cls, item): return cls
            DummyClass.__name__ = name
            # Make static method calls work on DummyClass attributes
            DummyClass.__getattr__ = lambda self, n: (lambda *a, **k: None)
            return DummyClass

    pyside2 = MockModule("PySide2")
    pyside2.__version__ = "5.15.2"
    sys.modules["PySide2"] = pyside2

    qtcore = MockModule("PySide2.QtCore")
    qtcore.__version__ = "5.15.2"
    sys.modules["PySide2.QtCore"] = qtcore
    setattr(pyside2, "QtCore", qtcore)

    qtgui = MockModule("PySide2.QtGui")
    qtgui.__version__ = "5.15.2"
    sys.modules["PySide2.QtGui"] = qtgui
    setattr(pyside2, "QtGui", qtgui)

    qtwidgets = MockModule("PySide2.QtWidgets")
    qtwidgets.__version__ = "5.15.2"
    sys.modules["PySide2.QtWidgets"] = qtwidgets
    setattr(pyside2, "QtWidgets", qtwidgets)

    shiboken2 = MockModule("PySide2.shiboken2")
    shiboken2.__version__ = "5.15.2"
    sys.modules["PySide2.shiboken2"] = shiboken2
    sys.modules["shiboken2"] = shiboken2
    setattr(pyside2, "shiboken2", shiboken2)

    # ── Pre-stub matplotlib Qt backends so qiskit_metal's GUI imports don't fail
    # qiskit_metal/_gui explicitly imports backend_qt5agg regardless of MPLBACKEND.
    # We stub out the entire backend chain so it becomes a no-op.
    class _FakeCanvas:
        def __init__(self, *a, **k): pass
        def draw(self, *a, **k): pass
        def get_renderer(self, *a, **k): return None

    class _FakeBackendQT5Agg(ModuleType):
        FigureCanvasQTAgg = _FakeCanvas
        FigureCanvasQT = _FakeCanvas
        NavigationToolbar2QT = type("NavigationToolbar2QT", (), {"__init__": lambda s, *a, **k: None})
        def __getattr__(self, name):
            return _FakeCanvas

    for _mpl_mod in [
        "matplotlib.backends.backend_qt5agg",
        "matplotlib.backends.backend_qtagg",
        "matplotlib.backends.backend_qt",
        "matplotlib.backends.qt_compat",
    ]:
        if _mpl_mod not in sys.modules:
            sys.modules[_mpl_mod] = _FakeBackendQT5Agg(_mpl_mod)

# Headless environment already set at top of file.

try:
    import importlib
    import pkgutil

    # ── geopandas compatibility shim ─────────────────────────────────────────
    # qiskit-metal pins geopandas==0.12.2 but any modern version works fine for
    # our headless rendering use-case. Patch the version string so the import
    # constraint check passes, then let the real package load normally.
    try:
        import geopandas as _geopandas_real
        if _geopandas_real.__version__ != "0.12.2":
            _geopandas_real.__version__ = "0.12.2"
            log.info("geopandas version spoofed to 0.12.2 for qiskit-metal compatibility.")
    except ImportError:
        pass

    import qiskit_metal.qlibrary as _qlibrary
    from qiskit_metal import designs as _designs
    from qiskit_metal.qlibrary.core import QComponent as _QComponent

    _CLASS_MAP: dict[str, type] = {}
    for _, modname, _ in pkgutil.walk_packages(path=_qlibrary.__path__, prefix=_qlibrary.__name__ + ".", onerror=lambda _: None):
        try:
            mod = importlib.import_module(modname)
        except Exception:
            continue
        for _, cls in inspect.getmembers(mod, inspect.isclass):
            if issubclass(cls, _QComponent) and cls is not _QComponent and cls.__module__ == modname:
                _CLASS_MAP[cls.__name__] = cls
    log.info(f"Loaded {len(_CLASS_MAP)} component classes successfully.")

    # ── Load custom components not shipped with qiskit-metal ─────────────────
    try:
        import sys as _sys, pathlib as _pathlib
        _backend_root = _pathlib.Path(__file__).parent.parent  # app/services -> app -> backend/app
        if str(_backend_root.parent) not in _sys.path:
            _sys.path.insert(0, str(_backend_root.parent))
        from app.services.custom_components.readout_res_fc import ReadoutResFC as _ReadoutResFC
        _CLASS_MAP["ReadoutResFC"] = _ReadoutResFC
        log.info("Registered custom component: ReadoutResFC")
    except Exception as _e:
        log.warning("Could not register custom ReadoutResFC: %s", _e)
except Exception as e:
    log.exception("Failed to initialize Qiskit Metal libraries inside worker.")
    sys.exit(1)


# ── Geometry & SVG Helpers ──────────────────────────────────────────────────

def _make_default_connection_pads(cls: type) -> dict:
    """Build default connection_pads by checking cls and parent default_options."""
    # Walk MRO to find _default_connection_pads (may be in parent class)
    base = None
    for klass in cls.__mro__:
        default_opts = getattr(klass, "default_options", {})
        if "_default_connection_pads" in default_opts:
            base = dict(default_opts["_default_connection_pads"])
            break
    if base is None:
        return {}
    if "connector_location" in base:
        base.pop("connector_location", None)
        return {
            "readout": {**base, "connector_location": "0"},
            "bus_01":  {**base, "connector_location": "180"},
            "bus_02":  {**base, "connector_location": "90"},
        }
    if "loc_W" in base and "loc_H" in base:
        return {
            "a": {**base, "loc_W": "+1", "loc_H": "+1"},
            "b": {**base, "loc_W": "-1", "loc_H": "+1"},
            "c": {**base, "loc_W": "+1", "loc_H": "-1"},
            "d": {**base, "loc_W": "-1", "loc_H": "-1"},
        }
    return {name: dict(base) for name in ("a", "b", "c", "d")}


def fillet_polyline(coords: list[tuple[float, float]], radius: float, num_points: int = 16) -> list[tuple[float, float]]:
    if not coords or len(coords) < 3 or radius <= 0:
        return coords
    
    new_coords = [coords[0]]
    for i in range(1, len(coords) - 1):
        p0 = coords[i-1]
        p1 = coords[i]
        p2 = coords[i+1]
        
        v1 = (p0[0] - p1[0], p0[1] - p1[1])
        v2 = (p2[0] - p1[0], p2[1] - p1[1])
        
        l1 = math.hypot(*v1)
        l2 = math.hypot(*v2)
        
        if l1 < 1e-9 or l2 < 1e-9:
            new_coords.append(p1)
            continue
            
        u1 = (v1[0]/l1, v1[1]/l1)
        u2 = (v2[0]/l2, v2[1]/l2)
        
        dot = u1[0]*u2[0] + u1[1]*u2[1]
        dot = max(-1.0, min(1.0, dot))
        angle = math.acos(dot)
        
        if angle > math.pi - 1e-4 or angle < 1e-4:
            new_coords.append(p1)
            continue
            
        half_angle = angle / 2.0
        d = radius / math.tan(half_angle)
        
        max_d = min(l1 / 2.0, l2 / 2.0)
        if d > max_d:
            d = max_d
            
        t1 = (p1[0] + d * u1[0], p1[1] + d * u1[1])
        t2 = (p1[0] + d * u2[0], p1[1] + d * u2[1])
        
        bisect = (u1[0] + u2[0], u1[1] + u2[1])
        lb = math.hypot(*bisect)
        if lb < 1e-9:
            new_coords.append(p1)
            continue
        u_bisect = (bisect[0]/lb, bisect[1]/lb)
        
        h = d / math.cos(half_angle)
        c = (p1[0] + h * u_bisect[0], p1[1] + h * u_bisect[1])
        
        r_actual = d * math.tan(half_angle)
        
        a1 = math.atan2(t1[1] - c[1], t1[0] - c[0])
        a2 = math.atan2(t2[1] - c[1], t2[0] - c[0])
        
        diff = a2 - a1
        while diff < -math.pi: diff += 2 * math.pi
        while diff > math.pi: diff -= 2 * math.pi
        
        new_coords.append(t1)
        for j in range(1, num_points):
            alpha = a1 + (j / num_points) * diff
            new_coords.append((c[0] + r_actual * math.cos(alpha), c[1] + r_actual * math.sin(alpha)))
        new_coords.append(t2)
        
    new_coords.append(coords[-1])
    return new_coords


def _geom_to_svg_subtract(geom, color: str, scale: float, out: list) -> None:
    """Render subtract-flagged geometry as a faint dashed outline (pocket indicator)."""
    gtype = geom.geom_type
    if gtype == "Polygon":
        if geom.is_empty:
            return
        # Draw only the exterior ring as a dashed outline
        coords = list(geom.exterior.coords)
        if len(coords) >= 2:
            pts = " ".join(f"{x*scale:.1f},{y*scale:.1f}" for x, y in coords)
            out.append(
                f'<polygon points="{pts}" fill="{color}" fill-opacity="0.08" '
                f'stroke="{color}" stroke-opacity="0.35" stroke-width="4" '
                f'stroke-dasharray="12 6"/>'
            )
    elif gtype in ("MultiPolygon", "GeometryCollection"):
        for g in geom.geoms:
            _geom_to_svg_subtract(g, color, scale, out)


def _geom_to_svg(geom, color: str, scale: float, out: list, width=None, fillet=None) -> None:
    gtype = geom.geom_type
    if gtype == "Polygon":
        d = _poly_d(geom, scale)
        if d:
            out.append(f'<path d="{d}" fill="{color}" fill-opacity="0.85" stroke="none"/>')
    elif gtype in ("MultiPolygon", "GeometryCollection"):
        for g in geom.geoms:
            _geom_to_svg(g, color, scale, out, width=width, fillet=fillet)
    elif gtype == "LineString":
        coords = list(geom.coords)
        if len(coords) >= 2:
            stroke_w = 10.0  # default in screen pixels (um scaled)
            if width is not None:
                try:
                    w_val = float(width)
                    if not math.isnan(w_val) and w_val > 0:
                        stroke_w = w_val * scale
                except (ValueError, TypeError):
                    pass
            
            fillet_r = 0.0
            if fillet is not None:
                try:
                    f_val = float(fillet)
                    if not math.isnan(f_val) and f_val > 0:
                        fillet_r = f_val
                except (ValueError, TypeError):
                    pass
            
            if fillet_r > 0:
                try:
                    coords = fillet_polyline(coords, fillet_r)
                except Exception as exc:
                    log.warning("Fillet polyline failed: %s", exc)
                    
            pts = " ".join(f"{x*scale:.1f},{y*scale:.1f}" for x, y in coords)
            out.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="{stroke_w:.1f}" stroke-linecap="round" stroke-linejoin="round"/>')
    elif gtype == "MultiLineString":
        for g in geom.geoms:
            _geom_to_svg(g, color, scale, out, width=width, fillet=fillet)


def _poly_d(poly, scale: float) -> str:
    if poly.is_empty:
        return ""
    def ring(coords):
        pts = [(x*scale, y*scale) for x, y in coords]
        if len(pts) < 2:
            return ""
        d = f"M {pts[0][0]:.1f} {pts[0][1]:.1f}"
        for x, y in pts[1:]:
            d += f" L {x:.1f} {y:.1f}"
        return d + " Z"
    parts = [ring(poly.exterior.coords)]
    for interior in poly.interiors:
        parts.append(ring(interior.coords))
    return " ".join(p for p in parts if p)


# ── Job Handlers ─────────────────────────────────────────────────────────────

def _map_resonator_options(component_id: str, opts: dict) -> dict:
    """Map frontend generic resonator parameter keys to component-specific keys."""
    res = dict(opts)
    
    import re
    def div_length(val, factor=2.0):
        if val is None or val == "":
            return None
        s = str(val).strip()
        m = re.search(r'([a-zA-Z]+)$', s)
        unit = m.group(1) if m else ""
        num_part = s[:-len(unit)] if unit else s
        try:
            num = float(num_part) / factor
            return f"{num:.6f}{unit}"
        except ValueError:
            return val

    # 1. ReadoutResFC (custom folded CPW resonator)
    # Only map generic frontend param names → real class option names.
    # Strip stale catalog params (readout_radius, arc_step, subtract, layer_subtract)
    # that don't exist in ReadoutResFC.default_options.
    if component_id == "ReadoutResFC":
        # Generic CPW key aliases → real option names
        trace_w = res.pop("trace_width", None)
        trace_g = res.pop("trace_gap", None)
        if trace_w is not None and "readout_cpw_width" not in res:
            res["readout_cpw_width"] = trace_w
        if trace_g is not None and "readout_cpw_gap" not in res:
            res["readout_cpw_gap"] = trace_g

        # fillet / meander_pitch → turn radius
        pitch_val = res.pop("meander_pitch", None) or res.pop("meander_spacing", None)
        fillet_val = res.pop("fillet", None)
        if pitch_val is not None:
            half_tr = div_length(pitch_val, 2.0)
            if "readout_cpw_turnradius" not in res:
                res["readout_cpw_turnradius"] = half_tr
        elif fillet_val is not None and "readout_cpw_turnradius" not in res:
            res["readout_cpw_turnradius"] = fillet_val

        # Strip every key that is NOT in ReadoutResFC.default_options
        _valid = {
            "pos_x", "pos_y", "orientation", "chip", "layer",
            "readout_cpw_width", "readout_cpw_gap", "readout_cpw_turnradius",
            "readout_l1", "readout_l2", "readout_l3", "readout_l4", "readout_l5",
        }
        for stale_key in list(res.keys()):
            if stale_key not in _valid:
                res.pop(stale_key, None)
            
    # 2. ResonatorCoilRect (rectangular spiral coil)
    elif component_id == "ResonatorCoilRect":
        trace_w = res.pop("trace_width", None)
        if trace_w is not None:
            res["line_width"] = trace_w
            
        trace_g = res.pop("trace_gap", None)
        if trace_g is not None:
            res["gap"] = trace_g
            
        m_pitch = res.pop("meander_pitch", None) or res.pop("meander_spacing", None)
        if m_pitch is not None:
            res["gap"] = m_pitch
            
        r_width = res.pop("resonator_width", None) or res.pop("meander_width", None)
        if r_width is not None:
            res["height"] = r_width
            
    return res


def handle_component_preview(job: dict) -> dict:
    component_id = job["component_id"]
    options = job.get("params", {})
    cls = _CLASS_MAP.get(component_id)
    if cls is None:
        return {"error": f"Unknown component: {component_id}"}

    design = _designs.DesignPlanar(enable_renderers=False)
    design.overwrite_enabled = True

    mapped_opts = _map_resonator_options(component_id, options)
    clean = {k: v for k, v in mapped_opts.items() if k not in ("pos_x", "pos_y", "orientation")}
    clean["pos_x"] = "0mm"
    clean["pos_y"] = "0mm"
    # Force subtract=False so subtraction-layer components (e.g. ReadoutResFC)
    # still render visible geometry in the preview instead of returning empty.
    clean["subtract"] = False
    if "connection_pads" not in clean:
        pc = _make_default_connection_pads(cls)
        if pc:
            clean["connection_pads"] = pc

    instance = cls(design, "preview", options=clean)
    design.rebuild()

    tables = design.qgeometry.tables
    if not any(len(gdf) > 0 for gdf in tables.values()):
        try:
            instance.rebuild()
        except Exception:
            pass

    MM = 1000.0
    COLORS = {"poly": "#5B9BD5", "path": "#2E5FA3", "junction": "#D4820A"}
    # Subtract geometry (e.g. pocket outlines, etch gaps) rendered as ghost
    # outlines so they don't visually bury the actual metal layers.
    SUBTRACT_COLORS = {"poly": "#5B9BD5", "path": "#2E5FA3", "junction": "#D4820A"}
    cid = instance.id
    bounds = []
    metal_paths: list[str] = []    # non-subtract geometry (rendered first)
    subtract_paths: list[str] = [] # subtract geometry (rendered last as ghost)

    for tname, gdf in tables.items():
        if gdf is None or len(gdf) == 0:
            continue
        color = COLORS.get(tname, "#5B9BD5")
        sub_color = SUBTRACT_COLORS.get(tname, "#5B9BD5")
        rows = gdf[gdf["component"] == cid] if "component" in gdf.columns else gdf
        for _, row in rows.iterrows():
            g = row.get("geometry")
            if g is None or g.is_empty:
                continue
            bounds.append(g.bounds)
            width = row.get("width") if "width" in row else None
            fillet = row.get("fillet") if "fillet" in row else None
            is_subtract = bool(row.get("subtract", False))
            if is_subtract:
                # Render subtract geometry as a faint dashed outline so it shows
                # the pocket/etch extent without covering the metal geometry.
                _geom_to_svg_subtract(g, sub_color, MM, subtract_paths)
            else:
                _geom_to_svg(g, color, MM, metal_paths, width=width, fillet=fillet)

    paths = metal_paths + subtract_paths

    if not paths or not bounds:
        # Fallback: try rendering without subtract filtering at all
        log.warning("No geometry for %s preview — returning placeholder", component_id)
        label = component_id[:14]
        svg = (f'<rect x="-280" y="-180" width="560" height="360" rx="20" '
               f'fill="#1e3a5f" fill-opacity="0.15" stroke="#5B9BD5" stroke-width="8"/>'
               f'<text x="0" y="8" text-anchor="middle" font-size="40" '
               f'font-family="monospace" fill="#5B9BD5" font-weight="bold">{label}</text>')
        return {"fragment": svg, "vb": [-300, -200, 600, 400]}

    xmin = min(b[0] for b in bounds) * MM
    ymin = min(b[1] for b in bounds) * MM
    xmax = max(b[2] for b in bounds) * MM
    ymax = max(b[3] for b in bounds) * MM
    pad = max((xmax - xmin) * 0.1, (ymax - ymin) * 0.1, 20)
    # Clamp viewBox: some components (ReadoutResFC) have geometry that extends
    # far off-centre. Centre the vb on (0,0) so the glyph renders sensibly.
    half_w = max((xmax - xmin) / 2 + pad, 100)
    half_h = max((ymax - ymin) / 2 + pad, 100)
    return {"fragment": "\n".join(paths), "vb": [-half_w, -half_h, half_w * 2, half_h * 2]}


def handle_full_design(job: dict) -> dict:
    graph = job["graph"]
    design = _designs.DesignPlanar(enable_renderers=False)
    design.overwrite_enabled = True

    # orientation must NOT be in _EXCLUDE — it controls component rotation.
    # pos_x/pos_y are set explicitly below; connection_pads is rebuilt from defaults.
    _EXCLUDE = frozenset({"connection_pads", "pos_x", "pos_y", "chip", "layer"})
    inst_id_map: dict[str, int] = {}

    for comp in graph["components"]:
        cls = _CLASS_MAP.get(comp["componentId"])
        if cls is None:
            log.warning("Unknown component in design: %s", comp["componentId"])
            continue
        mapped_opts = _map_resonator_options(comp["componentId"], comp.get("options", {}))
        opts = {k: v for k, v in mapped_opts.items() if k not in _EXCLUDE}
        pos = comp.get("position", {})
        opts["pos_x"] = f"{pos.get('x', 0)}mm"
        opts["pos_y"] = f"{pos.get('y', 0)}mm"
        # Always set orientation from the placement rotation so Qiskit Metal
        # rotates the geometry and updates pin positions accordingly.
        rotation = comp.get("rotation", 0) or 0
        opts["orientation"] = str(float(rotation))
        log.debug(
            "Placing %s '%s' at (%.4f, %.4f) mm, orientation=%.1f°",
            comp["componentId"], comp.get("instanceName", "?"),
            pos.get("x", 0), pos.get("y", 0), rotation,
        )
        ep = opts.get("connection_pads")
        if not isinstance(ep, dict) or not ep or any(not isinstance(v, dict) for v in ep.values()):
            pc = _make_default_connection_pads(cls)
            if pc:
                opts["connection_pads"] = pc
            else:
                opts.pop("connection_pads", None)
        try:
            inst = cls(design, comp["instanceName"], options=opts)
            inst_id_map[comp["instanceName"]] = inst.id
            # Log actual pin positions after instantiation for debugging
            for pname, pdata in inst.pins.items():
                mid = pdata.get("middle", None)
                nrm = pdata.get("normal", None)
                log.debug(
                    "  pin '%s': middle=%s, normal=%s",
                    pname, mid, nrm,
                )
        except Exception as exc:
            log.warning("Could not place %s: %s", comp["instanceName"], exc)

    route_id_map: dict[str, int] = {}
    route_errors: dict[str, str] = {}

    # Canonical fabrication defaults — single source of truth for RouteMeander.
    # These MUST match what Qiskit Metal expects and what codegen_service.py emits.
    _DEFAULT_FILLET    = "50um"   # bend radius
    _DEFAULT_LEAD      = "100um"  # start_straight and end_straight
    _DEFAULT_MEANDER_SPACING = "200um"

    for conn in graph["connections"]:
        route_cls = _CLASS_MAP.get(conn["routeComponentId"])
        if route_cls is None:
            log.warning("Unknown route component: %s", conn["routeComponentId"])
            continue
        src_name  = conn["sourceComponentName"]
        src_pin   = conn["sourcePinName"]
        tgt_name  = conn["targetComponentName"]
        tgt_pin   = conn["targetPinName"]
        log.debug(
            "Routing %s: %s.%s → %s.%s",
            conn["routeComponentId"], src_name, src_pin, tgt_name, tgt_pin,
        )
        # Validate that source and target components + pins exist
        src_inst = design.components[src_name] if src_name in design.components else None
        tgt_inst = design.components[tgt_name] if tgt_name in design.components else None
        if src_inst is None:
            log.warning("Route %s: source component '%s' not found in design", conn["id"], src_name)
            route_errors[conn["id"]] = f"Source component '{src_name}' not found"
            continue
        if tgt_inst is None:
            log.warning("Route %s: target component '%s' not found in design", conn["id"], tgt_name)
            route_errors[conn["id"]] = f"Target component '{tgt_name}' not found"
            continue
        if src_pin not in src_inst.pins:
            available = list(src_inst.pins.keys())
            log.warning("Route %s: pin '%s' not on '%s' (available: %s)", conn["id"], src_pin, src_name, available)
            route_errors[conn["id"]] = f"Pin '{src_pin}' not on '{src_name}' (available: {available})"
            continue
        if tgt_pin not in tgt_inst.pins:
            available = list(tgt_inst.pins.keys())
            log.warning("Route %s: pin '%s' not on '%s' (available: %s)", conn["id"], tgt_pin, tgt_name, available)
            route_errors[conn["id"]] = f"Pin '{tgt_pin}' not on '{tgt_name}' (available: {available})"
            continue

        # ── Build route options — Qiskit Metal parity ────────────────────────
        # Start from routeOverrides as passed in from the frontend.
        opts = dict(conn.get("routeOverrides", {}))

        # ── 1. Handle legacy lead_length scalar (backward compat) ─────────────
        # If the frontend sent a bare 'lead_length' key, promote it into the
        # nested lead dict.  This must happen before the lead injection below.
        legacy_lead_len = opts.pop("lead_length", None)
        if legacy_lead_len is not None and "lead" not in opts:
            opts["lead"] = {
                "start_straight": str(legacy_lead_len),
                "end_straight":   str(legacy_lead_len),
            }

        # ── 2. Normalise the lead dict ────────────────────────────────────────
        # The frontend may store lead as a JSON string (e.g. '{"start_straight": "100um"}')
        # or as a native Python dict.  Qiskit Metal requires a plain dict with
        # string values for start_straight and end_straight.
        # If no lead is set at all, inject the canonical default so the route
        # starts and ends with a proper straight exit segment from the pin.
        import json as _json
        lead_val = opts.get("lead")
        if lead_val is None:
            # No lead specified — use canonical defaults on both sides.
            opts["lead"] = {
                "start_straight": _DEFAULT_LEAD,
                "end_straight":   _DEFAULT_LEAD,
            }
        elif isinstance(lead_val, str):
            # May be a JSON object string or a plain value.
            try:
                parsed_lead = _json.loads(lead_val)
                if isinstance(parsed_lead, dict):
                    lead_dict = {k: str(v) for k, v in parsed_lead.items()}
                    # Ensure both sides are present.
                    lead_dict.setdefault("start_straight", _DEFAULT_LEAD)
                    lead_dict.setdefault("end_straight",   _DEFAULT_LEAD)
                    opts["lead"] = lead_dict
                else:
                    # Scalar string — treat as both start and end straight.
                    opts["lead"] = {"start_straight": lead_val, "end_straight": lead_val}
            except Exception:
                # Not parseable as JSON — treat as a raw length string for both sides.
                opts["lead"] = {"start_straight": lead_val, "end_straight": lead_val}
        elif isinstance(lead_val, dict):
            lead_dict = {k: str(v) for k, v in lead_val.items()}
            lead_dict.setdefault("start_straight", _DEFAULT_LEAD)
            lead_dict.setdefault("end_straight",   _DEFAULT_LEAD)
            opts["lead"] = lead_dict
        # If lead_val is any other type, leave it unchanged and let Metal handle it.

        # ── 3. Inject fillet (bend radius) ────────────────────────────────────
        # Qiskit Metal defaults fillet to '0' (sharp corners).  We MUST always
        # pass the canonical fillet value so the arc-length correction in
        # length_excess_corner_rounding() operates correctly and the geometry
        # matches the Qiskit Metal reference output exactly.
        if "fillet" not in opts or not opts["fillet"] or opts["fillet"] == "0":
            opts["fillet"] = _DEFAULT_FILLET

        # ── 4. prevent_short_edges — preserve Qiskit Metal default ('true') ──
        # Do NOT override this.  The Qiskit Metal default is 'true'; forcing it
        # to False disables the short-edge elimination pass that removes dogleg
        # artefacts at the first/last bend, causing visible geometry divergence.
        # We simply remove any accidental False override injected previously.
        opts.pop("prevent_short_edges", None)

        # ── 5. snap — preserve Qiskit Metal default ('true') ─────────────────
        # Snap aligns the meander to the axis-aligned grid, which is required
        # for the geometry to match Qiskit Metal's output when the pins point
        # along cardinal directions (the overwhelmingly common case).
        if "snap" not in opts:
            opts["snap"] = "true"

        # ── 6. Inject pin_inputs (must always be set) ─────────────────────────
        opts["pin_inputs"] = {
            "start_pin": {"component": src_name, "pin": src_pin},
            "end_pin":   {"component": tgt_name, "pin": tgt_pin},
        }

        # ── Pre-route diagnostic log (P0 requirement) ─────────────────────────
        log.info(
            "[RouteMeander PRE-ROUTE] conn=%s  component=%s  %s.%s → %s.%s  "
            "total_length=%s  fillet=%s  lead=%s  meander=%s  snap=%s",
            conn["id"], conn["routeComponentId"],
            src_name, src_pin, tgt_name, tgt_pin,
            opts.get("total_length", "(not set)"),
            opts.get("fillet"),
            opts.get("lead"),
            opts.get("meander", "(default)"),
            opts.get("snap"),
        )

        rname = f"route_{conn['id'][:8]}"
        try:
            ri = route_cls(design, rname, options=opts)
            route_id_map[conn["id"]] = ri.id
        except Exception as exc:
            log.warning("Could not create route %s: %s", conn["id"], exc)
            route_errors[conn["id"]] = str(exc)

    # Rebuild the design — catch per-route failures gracefully
    try:
        design.rebuild()
    except Exception as exc:
        log.warning("design.rebuild() raised; attempting partial SVG extraction: %s", exc)

    MM = 1000.0
    COLORS = {"poly": "#5B9BD5", "path": "#3a7abf", "junction": "#D4820A"}
    RCOLS  = {"poly": "#2E5FA3", "path": "#2E5FA3"}
    tables = design.qgeometry.tables
    bounds: list = []
    comp_svg: list[str] = []
    route_svgs: dict[str, list[str]] = {cid: [] for cid in route_id_map}

    for tname, gdf in tables.items():
        if gdf is None or len(gdf) == 0:
            continue
        color  = COLORS.get(tname, "#5B9BD5")
        rcolor = RCOLS.get(tname, "#2E5FA3")
        for _, row in gdf.iterrows():
            g = row.get("geometry")
            if g is None or g.is_empty:
                continue
            cnum = row.get("component")
            bounds.append(g.bounds)
            matched = next((cid for cid, rid in route_id_map.items() if cnum == rid), None)
            width = row.get("width") if "width" in row else None
            fillet = row.get("fillet") if "fillet" in row else None
            if matched is not None:
                _geom_to_svg(g, rcolor, MM, route_svgs[matched], width=width, fillet=fillet)
            else:
                _geom_to_svg(g, color, MM, comp_svg, width=width, fillet=fillet)

    if not bounds:
        return {"svg": "", "vb": [-4500, -3000, 9000, 6000], "routes": {}, "route_errors": route_errors}

    xmin = min(b[0] for b in bounds) * MM
    ymin = min(b[1] for b in bounds) * MM
    xmax = max(b[2] for b in bounds) * MM
    ymax = max(b[3] for b in bounds) * MM
    pad = max((xmax - xmin) * 0.08, (ymax - ymin) * 0.08, 200)

    # ── Extract resolved RouteMeander options AND path points after rebuild ───
    # These are the authoritative values that produced the SVG geometry.
    # Path points are the exact (x, y) vertices Qiskit Metal computed in metres;
    # the frontend must render these directly without any rounding, snapping,
    # or re-computation of fillets/arcs.
    resolved_route_options: dict[str, dict] = {}
    resolved_path_points: dict[str, list] = {}

    _ROUTE_OPTION_KEYS = (
        "total_length", "fillet",
        "lead", "meander",
        "trace_width", "trace_gap",
        "asymmetry", "snap",
    )

    for conn_id, inst_id in route_id_map.items():
        try:
            # Find the route component instance by its numeric id
            route_inst = next(
                (c for c in design.components.values() if c.id == inst_id),
                None,
            )
            if route_inst is None:
                continue

            # ── 1. Extract resolved options ───────────────────────────────────
            opts = getattr(route_inst, "options", None)
            if opts is not None:
                extracted: dict = {}
                for key in _ROUTE_OPTION_KEYS:
                    val = opts.get(key)
                    if val is not None:
                        # Convert nested Dict objects to plain Python dicts so
                        # they serialise cleanly through json.dumps
                        try:
                            from qiskit_metal import Dict as QDict
                            if isinstance(val, QDict):
                                extracted[key] = dict(val)
                            else:
                                extracted[key] = val
                        except Exception:
                            extracted[key] = str(val)
                # Also capture _actual_length set by make_elements() — this is
                # the authoritative post-build electrical path length.
                actual_len = opts.get("_actual_length")
                if actual_len is not None:
                    extracted["_actual_length"] = str(actual_len)
                if extracted:
                    resolved_route_options[conn_id] = extracted

            # ── 2. Extract resolved path points (x, y) ───────────────────────
            # QRoute.get_points() returns a numpy array in Qiskit Metal internal
            # units (metres for the DesignPlanar coordinate system).
            # We store raw metre values to maximum precision so the frontend
            # can verify exact pin alignment without floating-point degradation.
            pts: list = []
            try:
                if hasattr(route_inst, "get_points"):
                    raw_pts = route_inst.get_points()
                    import numpy as np
                    if raw_pts is not None and hasattr(raw_pts, "__len__") and len(raw_pts) > 0:
                        arr = np.asarray(raw_pts, dtype=float)
                        if arr.ndim == 2 and arr.shape[1] >= 2:
                            pts = [
                                {"x": round(float(p[0]), 9), "y": round(float(p[1]), 9)}
                                for p in arr
                            ]
            except Exception as exc:
                log.debug("get_points() failed for %s: %s", conn_id, exc)

            # Fallback: extract from QGeometry path table as LineString coords.
            # Coordinates in the path table are also in metres.
            if not pts:
                try:
                    path_tbl = design.qgeometry.tables.get("path")
                    if path_tbl is not None and len(path_tbl) > 0:
                        rows = path_tbl[path_tbl["component"] == inst_id]
                        for _, row in rows.iterrows():
                            g = row.get("geometry")
                            if g is not None and not g.is_empty:
                                coords = list(g.coords)
                                pts = [
                                    {"x": round(float(c[0]), 9), "y": round(float(c[1]), 9)}
                                    for c in coords
                                ]
                                break
                except Exception as exc:
                    log.debug("Path table extraction failed for %s: %s", conn_id, exc)

            if pts:
                resolved_path_points[conn_id] = pts

            # ── 3. Extract port pin anchors ───────────────────────────────────
            # Read the actual resolved pin positions (metres) from the placed
            # components so the frontend can verify exact alignment.
            try:
                port_anchors: dict = {}
                if opts is not None:
                    pin_inputs = opts.get("pin_inputs", {})
                    for side, key in [("start", "start_pin"), ("end", "end_pin")]:
                        pin_ref = pin_inputs.get(key, {})
                        comp_name = pin_ref.get("component", "")
                        pin_name = pin_ref.get("pin", "")
                        if comp_name and pin_name and comp_name in design.components:
                            comp_inst = design.components[comp_name]
                            if pin_name in comp_inst.pins:
                                pin_data = comp_inst.pins[pin_name]
                                mid = pin_data.get("middle")
                                nrm = pin_data.get("normal")
                                if mid is not None:
                                    import numpy as np
                                    mid_arr = np.asarray(mid, dtype=float)
                                    nrm_arr = np.asarray(nrm, dtype=float) if nrm is not None else None
                                    port_anchors[side] = {
                                        "x": round(float(mid_arr[0]), 9),
                                        "y": round(float(mid_arr[1]), 9),
                                        "normal_x": round(float(nrm_arr[0]), 9) if nrm_arr is not None else 0.0,
                                        "normal_y": round(float(nrm_arr[1]), 9) if nrm_arr is not None else 0.0,
                                    }
                if port_anchors:
                    if conn_id not in resolved_route_options:
                        resolved_route_options[conn_id] = {}
                    resolved_route_options[conn_id]["_port_anchors"] = port_anchors
            except Exception as exc:
                log.debug("Port anchor extraction failed for %s: %s", conn_id, exc)

            # ── 4. P0 Instrumentation: post-build diagnostic log ──────────────
            # Log all 10 required fields for every RouteMeander route so that
            # values can be compared directly against Qiskit Metal reference output.
            try:
                _resolved = resolved_route_options.get(conn_id, {})
                _lead_dict = _resolved.get("lead", {})
                if isinstance(_lead_dict, str):
                    try: _lead_dict = _json.loads(_lead_dict)
                    except Exception: _lead_dict = {}
                _meander_dict = _resolved.get("meander", {})
                if isinstance(_meander_dict, str):
                    try: _meander_dict = _json.loads(_meander_dict)
                    except Exception: _meander_dict = {}

                # Bounding box from geometry table (metres → mm)
                _bb = None
                try:
                    path_tbl2 = design.qgeometry.tables.get("path")
                    if path_tbl2 is not None and len(path_tbl2) > 0:
                        rows2 = path_tbl2[path_tbl2["component"] == inst_id]
                        if len(rows2) > 0:
                            from shapely.ops import unary_union
                            geoms2 = [r.geometry for _, r in rows2.iterrows() if r.geometry is not None and not r.geometry.is_empty]
                            if geoms2:
                                merged = unary_union(geoms2)
                                bx = merged.bounds  # (minx, miny, maxx, maxy) in metres
                                _bb = {
                                    "xmin_mm": round(bx[0]*1000, 6), "ymin_mm": round(bx[1]*1000, 6),
                                    "xmax_mm": round(bx[2]*1000, 6), "ymax_mm": round(bx[3]*1000, 6),
                                    "w_mm": round((bx[2]-bx[0])*1000, 6), "h_mm": round((bx[3]-bx[1])*1000, 6),
                                }
                except Exception:
                    pass

                log.info(
                    "[RouteMeander POST-BUILD] conn=%s\n"
                    "  requested_total_length : %s\n"
                    "  actual_path_length     : %s\n"
                    "  start_lead_straight    : %s\n"
                    "  end_lead_straight      : %s\n"
                    "  fillet_radius          : %s\n"
                    "  meander_spacing        : %s\n"
                    "  meander_asymmetry      : %s\n"
                    "  meander_num_pts        : %s  (≈turns)\n"
                    "  snap                   : %s\n"
                    "  bounding_box           : %s",
                    conn_id,
                    _resolved.get("total_length", "(not set)"),
                    _resolved.get("_actual_length", "(not extracted)"),
                    _lead_dict.get("start_straight", "(not set)"),
                    _lead_dict.get("end_straight", "(not set)"),
                    _resolved.get("fillet", "(not set)"),
                    _meander_dict.get("spacing", "(default 200um)"),
                    _meander_dict.get("asymmetry", "(default 0um)"),
                    len(pts) if pts else 0,
                    _resolved.get("snap", "(not set)"),
                    _bb if _bb else "(unavailable)",
                )
            except Exception as exc:
                log.debug("Post-build diagnostic log failed for %s: %s", conn_id, exc)

        except Exception as exc:
            log.debug("Could not extract resolved data for route %s: %s", conn_id, exc)

    return {
        "svg": "\n".join(comp_svg),
        "vb":  [xmin-pad, ymin-pad, (xmax-xmin)+2*pad, (ymax-ymin)+2*pad],
        "routes": {cid: "\n".join(svgs) for cid, svgs in route_svgs.items()},
        "route_errors": route_errors,
        "resolved_route_options": resolved_route_options,
        "resolved_path_points": resolved_path_points,
    }


# ── IPC Main Loop ────────────────────────────────────────────────────────────

def main():
    log.info("Qiskit Metal JSON IPC worker initialized. Listening on stdin...")
    
    # Notify parent process that we are loaded and ready
    print(json.dumps({"type": "ready", "classes": len(_CLASS_MAP)}))
    sys.stdout.flush()

    for line in sys.stdin:
        if not line.strip():
            continue
        
        try:
            job = json.loads(line)
        except Exception as e:
            log.error(f"Malformed JSON message: {e}")
            continue

        job_id = job.get("id", "")
        jtype = job.get("type")

        if jtype == "stop":
            log.info("Received stop request. Terminating.")
            break

        log.info(f"Processing job {job_id} of type {jtype}...")
        try:
            if jtype == "component_preview":
                res = handle_component_preview(job)
            elif jtype == "full_design":
                res = handle_full_design(job)
            else:
                res = {"error": f"Unknown job type: {jtype}"}
        except Exception:
            import traceback
            res = {"error": traceback.format_exc(limit=8)}

        res["id"] = job_id
        
        # Output result to parent process
        print(json.dumps(res))
        sys.stdout.flush()

if __name__ == "__main__":
    main()