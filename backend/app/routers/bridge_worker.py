"""bridge_worker.py - Subprocess executor for running python chip designs."""
from __future__ import annotations

import multiprocessing
import logging

log = logging.getLogger(__name__)


def run_code_subprocess(code: str) -> dict:
    from queue import Empty
    queue: multiprocessing.Queue = multiprocessing.Queue()
    proc = multiprocessing.Process(target=_worker_run_code, args=(queue, code))
    try:
        proc.start()
        proc.join(45)
        if proc.is_alive():
            proc.terminate()
            proc.join(5)
            return {"ok": False, "design": None, "error": "Code execution timed out (45s)."}
        try:
            return queue.get_nowait()
        except Empty:
            return {"ok": False, "design": None, "error": "No result returned."}
    finally:
        if proc.is_alive():
            proc.terminate()
            proc.join(5)
        queue.close()
        queue.join_thread()
        proc.close()


def _worker_run_code(queue: multiprocessing.Queue, code: str) -> None:
    import os
    import sys
    from types import ModuleType
    os.environ["QISKIT_METAL_HEADLESS"] = "1"
    os.environ["MPLBACKEND"] = "Agg"

    # Bulletproof PySide2 Mocking: Inject mocks if PySide2 is not present (e.g. Python 3.11+)
    try:
        # pyrefly: ignore [missing-import]
        import PySide2
    except ImportError:
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
                if name == 'QVersionNumber': return QVersionNumber
                if name == 'QLibraryInfo': return QLibraryInfo
                if name == 'Signal': return Signal
                if name == 'Slot': return Slot
                
                class DummyClass:
                    def __init__(self, *args, **kwargs): pass
                DummyClass.__name__ = name
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

    try:
        import importlib
        import inspect
        import pkgutil
        from qiskit_metal import designs
        from qiskit_metal.qlibrary.core import QComponent, QRoute
        import qiskit_metal.qlibrary as qlibrary

        class_map: dict[str, type] = {}
        for _, modname, _ in pkgutil.walk_packages(path=qlibrary.__path__, prefix=qlibrary.__name__ + ".", onerror=lambda _: None):
            try:
                mod = importlib.import_module(modname)
            except Exception:
                continue
            for _, cls in inspect.getmembers(mod, inspect.isclass):
                if issubclass(cls, QComponent) and cls is not QComponent and cls.__module__ == modname:
                    class_map[cls.__name__] = cls

        design = designs.DesignPlanar(enable_renderers=False)
        design.overwrite_enabled = True

        import qiskit_metal as qm
        namespace: dict = {"__builtins__": __builtins__, "design": design, "qiskit_metal": qm, "designs": designs, **class_map}

        exec(compile(code, "<write_code>", "exec"), namespace)  # nosec

        try:
            design.rebuild()
        except Exception:
            pass

        placements: list[dict] = []
        placement_id_map: dict[str, str] = {}

        def parse_mm(val: object) -> float:
            s = str(val).strip()
            try:
                if s.endswith("mm"):  return float(s[:-2])
                if s.endswith("um"):  return float(s[:-2]) * 0.001
                return float(s)
            except (ValueError, TypeError):
                return 0.0

        for inst_name, comp in design.components.items():
            if comp is None or isinstance(comp, QRoute):
                continue
            pl_id = f"pl_{inst_name}"
            placement_id_map[inst_name] = pl_id
            opts = dict(getattr(comp, "options", {}))
            pos_x = parse_mm(opts.pop("pos_x", "0mm"))
            pos_y = parse_mm(opts.pop("pos_y", "0mm"))
            rotation = float(str(opts.pop("orientation", "0")).strip() or "0")
            placements.append({
                "id": pl_id, "componentId": comp.__class__.__name__, "name": inst_name,
                "x": round(pos_x, 4), "y": round(pos_y, 4), "rotation": rotation,
                "params": {k: str(v) for k, v in opts.items() if not k.startswith("_") and k not in ("connection_pads", "chip", "layer")},
            })

        connections: list[dict] = []
        for inst_name, comp in design.components.items():
            if not isinstance(comp, QRoute):
                continue
            opts = dict(getattr(comp, "options", {}))
            pin_inputs = opts.get("pin_inputs", {})
            start = dict(pin_inputs.get("start_pin", {}))
            end   = dict(pin_inputs.get("end_pin",   {}))
            src_name = str(start.get("component", ""))
            src_pin  = str(start.get("pin", ""))
            tgt_name = str(end.get("component", ""))
            tgt_pin  = str(end.get("pin", ""))
            if src_name not in placement_id_map or tgt_name not in placement_id_map:
                continue
            connections.append({
                "id": f"conn_{inst_name}",
                "from": {"placementId": placement_id_map[src_name], "pinName": src_pin},
                "to":   {"placementId": placement_id_map[tgt_name], "pinName": tgt_pin},
                "routeComponentId": comp.__class__.__name__,
                "routeOverrides": {},
            })

        queue.put({"ok": True, "design": {"placements": placements, "connections": connections}, "error": None})

    except Exception:
        import traceback
        import sys
        err_msg = traceback.format_exc(limit=12)
        sys_path_msg = "\n\nWorker sys.path:\n" + "\n".join(sys.path)
        sys_exe_msg = f"\nWorker sys.executable: {sys.executable}\n"
        queue.put({"ok": False, "design": None, "error": err_msg + sys_exe_msg + sys_path_msg})
