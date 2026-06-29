"""Decoupled Qiskit Metal rendering service using subprocess JSON IPC."""
from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Dict, Optional

from app.core.registry_cache import registry_cache
from app.core.editor_models import (
    ComponentPreview, DesignDocument, RenderResult, RouteRender,
    ValidationIssue, ValidationResult, ViewBox,
)

log = logging.getLogger(__name__)

WORKER_WARMUP_TIMEOUT = 60
COMPONENT_RENDER_TIMEOUT = 30
DESIGN_RENDER_TIMEOUT = 60


def _placeholder_svg(component_id: str, category: str = "other") -> str:
    # Clean label to fit nicely
    label = component_id
    if len(label) > 15:
        label = label[:13] + ".."
    
    # Base color definitions
    primary_color = "#5B9BD5"
    secondary_color = "#2E5FA3"
    accent_color = "#D4820A"
    
    svg_elements = []
    
    # 1. Add visual graphic based on category
    cat_lower = category.lower()
    if cat_lower == "qubits":
        if "cross" in component_id.lower():
            # Cross qubit layout
            svg_elements.append(f'<rect x="-220" y="-45" width="440" height="90" rx="15" fill="{primary_color}" fill-opacity="0.8"/>')
            svg_elements.append(f'<rect x="-45" y="-220" width="90" height="440" rx="15" fill="{primary_color}" fill-opacity="0.8"/>')
            # Junction at center
            svg_elements.append(f'<path d="M -20 -20 L 20 20 M -20 20 L 20 -20" stroke="{accent_color}" stroke-width="6"/>')
        else:
            # Pocket/pocket6 qubit layout (standard TransmonPocket)
            svg_elements.append(f'<rect x="-300" y="-300" width="600" height="600" rx="30" fill="none" stroke="{primary_color}" stroke-width="8" opacity="0.4"/>')
            svg_elements.append(f'<rect x="-220" y="-230" width="440" height="160" rx="15" fill="{primary_color}" fill-opacity="0.85"/>')
            svg_elements.append(f'<rect x="-220" y="70" width="440" height="160" rx="15" fill="{primary_color}" fill-opacity="0.85"/>')
            # Junction lines between the pads (around Y=0)
            svg_elements.append(f'<path d="M -15 -45 L 15 45 M -15 45 L 15 -45 M 0 -45 L 0 45" stroke="{accent_color}" stroke-width="6"/>')
            
    elif cat_lower == "resonators":
        # Meandered coil layout
        svg_elements.append(f'<rect x="-250" y="-150" width="500" height="300" rx="20" fill="none" stroke="{secondary_color}" stroke-width="4" stroke-dasharray="10 8" opacity="0.3"/>')
        svg_elements.append(f'<path d="M -230 0 L -170 0 L -170 -110 L -90 -110 L -90 110 L -10 110 L -10 -110 L 70 -110 L 70 110 L 150 110 L 150 0 L 230 0" fill="none" stroke="{secondary_color}" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>')
        
    elif cat_lower == "couplers":
        # SQUID loop layout
        svg_elements.append(f'<rect x="-120" y="-180" width="240" height="360" rx="25" fill="none" stroke="{primary_color}" stroke-width="10"/>')
        # Two junctions on left & right branches
        svg_elements.append(f'<path d="M -140 -20 L -100 20 M -140 20 L -100 -20 M -120 -30 L -120 30" stroke="{accent_color}" stroke-width="5"/>')
        svg_elements.append(f'<path d="M 100 -20 L 140 20 M 100 20 L 140 -20 M 120 -30 L 120 30" stroke="{accent_color}" stroke-width="5"/>')
        
    elif cat_lower in ("launchpads", "terminations"):
        # Launchpad layout
        svg_elements.append(f'<rect x="-160" y="-160" width="320" height="320" rx="25" fill="{primary_color}" fill-opacity="0.85"/>')
        svg_elements.append(f'<rect x="-200" y="-200" width="400" height="400" rx="35" fill="none" stroke="{primary_color}" stroke-width="8" opacity="0.4"/>')
        svg_elements.append(f'<polygon points="160,-60 260,-15 260,15 160,60" fill="{primary_color}"/>')
        
    elif cat_lower == "routes":
        # CPW line layout
        svg_elements.append(f'<path d="M -300 0 L 300 0" fill="none" stroke="{secondary_color}" stroke-width="12" stroke-linecap="round"/>')
        
    else:
        # Default placeholder/other layout
        svg_elements.append(f'<rect x="-200" y="-200" width="400" height="400" rx="20" fill="none" stroke="{primary_color}" stroke-width="6"/>')
        svg_elements.append(f'<circle cx="0" cy="0" r="100" fill="{primary_color}" fill-opacity="0.4"/>')
        svg_elements.append(f'<path d="M -80 0 L 80 0 M 0 -80 L 0 80" stroke="{primary_color}" stroke-width="6"/>')

    # 2. Add text label wrapped in scale(1, -1) to prevent mirroring/upside-down rendering
    svg_elements.append(
        f'<g transform="scale(1, -1)">'
        f'<text x="0" y="6" text-anchor="middle" font-size="32" font-family="sans-serif" font-weight="bold" fill="#ffffff" style="user-select: none;">{label}</text>'
        f'</g>'
    )
    
    return "".join(svg_elements)


# ── Worker manager (singleton subprocess JSON IPC) ────────────────────────────

class _WorkerManager:
    def __init__(self) -> None:
        self._proc: Optional[subprocess.Popen] = None
        self._lock = threading.Lock()
        self._write_lock = threading.Lock()
        self._ready = False
        self._pending_jobs: Dict[str, dict] = {}
        self._jobs_lock = threading.Lock()
        self._job_conditions: Dict[str, threading.Condition] = {}
        self._reader_thread: Optional[threading.Thread] = None

    def _start(self) -> bool:
        # Determine Python executable to run the worker.
        # Priority order:
        #   1. METAL_WORKER_PYTHON env var (explicit override)
        #   2. The venv Python co-located with this package (most reliable)
        #   3. sys.executable fallback
        py_exe = os.getenv("METAL_WORKER_PYTHON")
        if not py_exe:
            # Resolve the venv Python relative to this file:
            # .../backend/app/services/render_service.py
            #   → .../backend/.venv/Scripts/python.exe  (Windows)
            #   → .../backend/.venv/bin/python           (Linux/Mac)
            backend_root = Path(__file__).parent.parent.parent  # .../backend
            venv_win  = backend_root / ".venv" / "Scripts" / "python.exe"
            venv_unix = backend_root / ".venv" / "bin" / "python"
            if venv_win.exists():
                py_exe = str(venv_win)
            elif venv_unix.exists():
                py_exe = str(venv_unix)
            else:
                py_exe = sys.executable
        
        worker_script = Path(__file__).parent / "worker.py"
        log.info("Starting background Qiskit Metal worker subprocess with %s ...", py_exe)
        
        try:
            self._proc = subprocess.Popen(
                [py_exe, "-u", str(worker_script)],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1, # Line buffered
            )
        except Exception as e:
            log.error("Failed to spawn Qiskit Metal worker subprocess: %s", e)
            return False

        # Asynchronously redirect stderr to python logs
        def _read_stderr():
            while self._proc and self._proc.poll() is None:
                try:
                    line = self._proc.stderr.readline()
                    if line:
                        log.info("Worker: %s", line.strip())
                except Exception:
                    break
        threading.Thread(target=_read_stderr, daemon=True, name="worker-stderr-reader").start()

        # Wait for the ready message on stdout
        try:
            ready_line = self._proc.stdout.readline()
            if not ready_line:
                log.error("Worker process stdout closed early.")
                return False
            
            ready_msg = json.loads(ready_line)
            if ready_msg.get("type") == "ready":
                log.info("Qiskit Metal worker online. %d component classes loaded.", ready_msg.get("classes", 0))
                self._ready = True
                
                # Start background stdout reader thread for subsequent responses
                self._reader_thread = threading.Thread(target=self._stdout_reader, daemon=True, name="worker-stdout-reader")
                self._reader_thread.start()
                return True
            log.error("Worker sent unexpected ready payload: %s", ready_msg)
            return False
        except Exception as exc:
            log.error("Timeout or exception waiting for worker ready state: %s", exc)
            return False

    def _stdout_reader(self) -> None:
        while self._proc and self._proc.poll() is None:
            try:
                line = self._proc.stdout.readline()
                if not line:
                    break
                
                msg = json.loads(line)
                job_id = msg.get("id")
                if job_id:
                    with self._jobs_lock:
                        self._pending_jobs[job_id] = msg
                        cond = self._job_conditions.get(job_id)
                        if cond:
                            cond.notify_all()
            except Exception as e:
                log.error("Error reading from worker stdout: %s", e)
                break

    def _ensure(self) -> bool:
        with self._lock:
            if self._proc is None or self._proc.poll() is not None or not self._ready:
                self._ready = False
                return self._start()
            return True

    def call(self, job: dict, timeout: int) -> dict:
        import uuid
        if not self._ensure():
            return {"error": "Render worker unavailable."}

        job_id = uuid.uuid4().hex
        job["id"] = job_id

        try:
            payload = json.dumps(job) + "\n"
            with self._write_lock:
                self._proc.stdin.write(payload)
                self._proc.stdin.flush()
        except Exception as e:
            log.error("Failed to write job to worker stdin: %s", e)
            self._ready = False
            return {"error": f"Failed to send job to worker: {e}"}

        cond = threading.Condition(self._jobs_lock)
        with self._jobs_lock:
            self._job_conditions[job_id] = cond

        try:
            with cond:
                # Check if result already arrived (reader may have beaten us)
                if job_id in self._pending_jobs:
                    return self._pending_jobs.pop(job_id)
                cond.wait(timeout=timeout)
                if job_id in self._pending_jobs:
                    return self._pending_jobs.pop(job_id)
        finally:
            with self._jobs_lock:
                self._job_conditions.pop(job_id, None)

        if self._proc.poll() is not None:
            self._ready = False
            return {"error": "Render worker crashed during job execution."}

        return {"error": f"Render timed out after {timeout}s."}

    def stop(self) -> None:
        with self._lock:
            if self._proc and self._proc.poll() is None:
                try:
                    self._proc.stdin.write(json.dumps({"type": "stop"}) + "\n")
                    self._proc.stdin.flush()
                    self._proc.wait(timeout=2.0)
                except Exception:
                    self._proc.kill()
            self._ready = False


_manager = _WorkerManager()


def warmup_worker() -> None:
    _manager._ensure()



# ── RenderService ─────────────────────────────────────────────────────────────

class RenderService:

    def render_component_preview(self, component_id: str, params: Optional[Dict[str, object]] = None) -> ComponentPreview:
        from app.services.component_registry import component_registry_service
        summary = component_registry_service.get_component(component_id)
        category = summary.category if summary else "other"
        
        # Choose dynamic viewBox based on category
        cat_lower = category.lower()
        if cat_lower == "resonators":
            vb = ViewBox(x=-300, y=-200, w=600, h=400)
        elif cat_lower == "routes":
            vb = ViewBox(x=-350, y=-100, w=700, h=200)
        else:
            vb = ViewBox(x=-350, y=-350, w=700, h=700)

        if summary is None:
            log.warning("Preview requested for unknown component %s. Returning placeholder.", component_id)
            return ComponentPreview(id=component_id, svg=_placeholder_svg(component_id, category), viewBox=vb, units="um")

        result = _manager.call({"type": "component_preview", "component_id": component_id, "module": summary.module, "params": params or {}}, timeout=COMPONENT_RENDER_TIMEOUT)

        if result.get("error"):
            log.warning("Preview failed for %s: %s", component_id, result["error"])
            return ComponentPreview(id=component_id, svg=_placeholder_svg(component_id, category), viewBox=vb, units="um")

        svg = str(result.get("fragment", ""))
        raw = result.get("vb", [-500, -500, 1000, 1000])
        vb_result = ViewBox(x=float(raw[0]), y=float(raw[1]), w=float(raw[2]), h=float(raw[3])) if isinstance(raw, list) and len(raw) == 4 else ViewBox(x=-500, y=-500, w=1000, h=1000)

        if not svg.strip():
            svg = _placeholder_svg(component_id, category)
            vb_result = vb

        return ComponentPreview(id=component_id, svg=svg, viewBox=vb_result, units="um")

    def render_route(self, design: DesignDocument, connection_id: str) -> Optional[RouteRender]:
        """Render a single route in isolation."""
        conn = next((c for c in design.connections if c.id == connection_id), None)
        if not conn:
            log.warning("render_route: connection '%s' not found in design", connection_id)
            return None

        _EXCLUDE = frozenset({"connection_pads", "pos_x", "pos_y", "chip", "layer"})
        placement_names = {p.id: p.name for p in design.placements}

        graph = {
            "components": [
                {
                    "instanceName": p.name,
                    "componentId": p.componentId,
                    "options": {k: str(v) for k, v in p.params.items() if k not in _EXCLUDE},
                    "position": {"x": p.x, "y": p.y},
                    "rotation": p.rotation,   # always pass; worker sets orientation=
                }
                for p in design.placements
            ],
            "connections": [
                {
                    "id": conn.id,
                    "sourceComponentName": placement_names.get(conn.from_.placementId, conn.from_.placementId),
                    "sourcePinName": conn.from_.pinName,
                    "targetComponentName": placement_names.get(conn.to.placementId, conn.to.placementId),
                    "targetPinName": conn.to.pinName,
                    "routeComponentId": conn.routeComponentId or "RouteMeander",
                    "routeOverrides": {k: str(v) for k, v in conn.routeOverrides.items()},
                }
            ],
        }

        result = _manager.call({"type": "full_design", "graph": graph}, timeout=DESIGN_RENDER_TIMEOUT)

        if result.get("error"):
            log.warning("Route render failed for %s: %s", connection_id, result["error"])
            return None

        # Log any per-route errors returned by the worker
        for cid, err in result.get("route_errors", {}).items():
            log.warning("Worker route error for %s: %s", cid, err)

        routes = result.get("routes", {})
        svg = routes.get(connection_id, "")
        if not svg:
            re = result.get("route_errors", {}).get(connection_id, "empty SVG")
            log.warning("Route %s produced no SVG: %s", connection_id, re)
            return None
        resolved_opts = result.get("resolved_route_options", {}).get(connection_id)
        resolved_pts = result.get("resolved_path_points", {}).get(connection_id)
        return RouteRender(
            connectionId=connection_id,
            svg=svg,
            resolvedRouteOptions=resolved_opts,
            resolvedPathPoints=resolved_pts,
        )

    def render_design(self, design: DesignDocument) -> RenderResult:
        if not design.placements:
            return RenderResult(svg="", viewBox=ViewBox(x=-4500, y=-3000, w=9000, h=6000), units="um", layers=[], routes=[])

        _EXCLUDE = frozenset({"connection_pads", "pos_x", "pos_y", "chip", "layer"})
        placement_names = {p.id: p.name for p in design.placements}
        
        unlocked_connections = [c for c in design.connections if not c.locked]
        
        graph = {
            "components": [
                {
                    "instanceName": p.name,
                    "componentId": p.componentId,
                    "options": {k: str(v) for k, v in p.params.items() if k not in _EXCLUDE},
                    "position": {"x": p.x, "y": p.y},
                    "rotation": p.rotation,
                }
                for p in design.placements
            ],
            "connections": [
                {
                    "id": c.id,
                    "sourceComponentName": placement_names.get(c.from_.placementId, c.from_.placementId),
                    "sourcePinName": c.from_.pinName,
                    "targetComponentName": placement_names.get(c.to.placementId, c.to.placementId),
                    "targetPinName": c.to.pinName,
                    "routeComponentId": c.routeComponentId or "RouteMeander",
                    "routeOverrides": {k: str(v) for k, v in c.routeOverrides.items()},
                }
                for c in unlocked_connections
            ],
        }

        result = _manager.call({"type": "full_design", "graph": graph}, timeout=DESIGN_RENDER_TIMEOUT)

        if result.get("error"):
            log.warning("Design render failed: %s", result["error"])
            return RenderResult(svg="", viewBox=ViewBox(x=-4500, y=-3000, w=9000, h=6000), units="um", layers=[], routes=[])

        svg = result.get("svg", "")
        raw = result.get("vb", [-4500, -3000, 9000, 6000])
        vb  = ViewBox(x=float(raw[0]), y=float(raw[1]), w=float(raw[2]), h=float(raw[3]))
        
        routes = [RouteRender(
            connectionId=cid,
            svg=s,
            resolvedRouteOptions=result.get("resolved_route_options", {}).get(cid),
            resolvedPathPoints=result.get("resolved_path_points", {}).get(cid),
        ) for cid, s in result.get("routes", {}).items() if s]
        
        for c in design.connections:
            if c.locked and c.cachedSvg:
                routes.append(RouteRender(connectionId=c.id, svg=c.cachedSvg))
        
        return RenderResult(svg=svg, viewBox=vb, units="um", layers=[], routes=routes)

    def validate_design(self, design: DesignDocument) -> ValidationResult:
        issues: list[ValidationIssue] = []
        ids = {p.id for p in design.placements}
        if not design.placements:
            issues.append(ValidationIssue(severity="warning", rule="non-empty", message="Design has no placements."))
        for c in design.connections:
            if c.from_.placementId not in ids:
                issues.append(ValidationIssue(severity="error", rule="dangling-from", message=f"Connection {c.id}: source '{c.from_.placementId}' does not exist."))
            if c.to.placementId not in ids:
                issues.append(ValidationIssue(severity="error", rule="dangling-to", message=f"Connection {c.id}: target '{c.to.placementId}' does not exist."))
            if c.from_.placementId == c.to.placementId:
                issues.append(ValidationIssue(severity="error", rule="no-self-loop", message=f"Connection {c.id} connects a component to itself."))
        return ValidationResult(valid=not any(i.severity == "error" for i in issues), issues=issues)


render_service = RenderService()
