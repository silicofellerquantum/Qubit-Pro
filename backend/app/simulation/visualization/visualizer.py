"""VisualizationService — main orchestrator for all visualization operations."""

from __future__ import annotations

import logging
import re
import time
from pathlib import Path
from typing import List, Optional

from app.simulation.visualization.camera_manager import get_all_presets
from app.simulation.visualization.exceptions import RenderError, VTUNotFoundError
from app.simulation.visualization.field_renderer import render_field_to_png
from app.simulation.visualization.image_exporter import (
    cache_get,
    cache_put,
    generate_thumbnail,
    make_render_key,
)
from app.simulation.visualization.mesh_renderer import render_mesh_to_png
from app.simulation.visualization.slice_generator import generate_orthogonal_slice
from app.simulation.visualization.visualization_models import (
    ArrayListResponse,
    CameraPreset,
    FieldInfo,
    MeshDisplayMode,
    PreRenderedImage,
    RenderRequest,
    RenderResponse,
    SliceRequest,
    VisualizationManifest,
)
from app.simulation.visualization.vtu_loader import (
    extract_field_info,
    find_mesh_files,
    find_vtu_files,
    get_boundary_vtu_path,
    get_dataset_bounds,
    load_dataset,
    pick_primary_vtu,
)

logger = logging.getLogger(__name__)

# Base URL for serving visualization images
_VIS_BASE_URL = "/api/simulations/{sim_id}/visualization/images"


def _mode_index(path: Path) -> Optional[int]:
    """Extract Cycle/mode index from a VTU path."""
    for part in path.parts:
        m = re.search(r"[Cc]ycle(\d+)", part)
        if m:
            return int(m.group(1))
    return None


def _solver_from_path(path: Path) -> str:
    """Infer solver name (eigenmode, electrostatic, …) from artifact path."""
    parts_lower = [p.lower() for p in path.parts]
    for solver in ("eigenmode", "electrostatic", "magnetostatic", "driven"):
        if solver in parts_lower:
            return solver
    return "unknown"


class VisualizationService:
    """Orchestrates VTU loading, rendering, and image caching for a simulation artifact directory."""

    def __init__(self, artifact_dir: Path, sim_id: str) -> None:
        self._dir = artifact_dir
        self._sim_id = sim_id
        self._images_dir = artifact_dir / "images"
        self._images_dir.mkdir(parents=True, exist_ok=True)

    # ── Manifest ─────────────────────────────────────────────────────────────

    def get_manifest(self) -> VisualizationManifest:
        """Scan the artifact directory and return the full visualization manifest."""
        vtu_files = find_vtu_files(self._dir)
        mesh_files = find_mesh_files(self._dir)

        # Collect pre-rendered images
        pre_rendered: List[PreRenderedImage] = []
        if self._images_dir.exists():
            for img in sorted(self._images_dir.glob("*.png")):
                name = img.stem
                # Parse label from filename: e.g. eigenmode_chip_e_1.png
                parts = name.split("_")
                solver = parts[0] if parts else ""
                variant = "_".join(parts[1:]) if len(parts) > 1 else name
                mode = _mode_index(img)
                pre_rendered.append(PreRenderedImage(
                    filename=img.name,
                    url=f"{_VIS_BASE_URL.format(sim_id=self._sim_id)}/{img.name}",
                    label=name.replace("_", " ").title(),
                    solver=solver,
                    variant=variant,
                    mode_index=mode,
                ))

        # Collect available field arrays from primary VTU
        available_fields: List[FieldInfo] = []
        bounds: Optional[List[float]] = None
        n_modes = 0

        primary = pick_primary_vtu(vtu_files)
        if primary:
            try:
                ds = load_dataset(primary)
                pf, cf = extract_field_info(ds)
                available_fields = pf + cf
                bounds = get_dataset_bounds(ds)
            except Exception as exc:
                logger.warning("Could not introspect primary VTU %s: %s", primary, exc)

        # Count modes (unique Cycle indices)
        mode_indices = set()
        for p in vtu_files:
            idx = _mode_index(p)
            if idx is not None:
                mode_indices.add(idx)
        n_modes = len(mode_indices)

        solvers = list({_solver_from_path(p) for p in vtu_files + mesh_files} - {"unknown"})

        return VisualizationManifest(
            simulation_id=self._sim_id,
            has_vtu=len(vtu_files) > 0,
            has_mesh=len(mesh_files) > 0,
            vtu_files=[str(p.relative_to(self._dir)) for p in vtu_files],
            mesh_files=[str(p.relative_to(self._dir)) for p in mesh_files],
            pre_rendered_images=pre_rendered,
            available_fields=available_fields,
            solvers=solvers,
            n_modes=n_modes,
            bounds=bounds,
        )

    # ── Array listing ─────────────────────────────────────────────────────────

    def list_arrays(self, vtu_rel_path: Optional[str] = None) -> ArrayListResponse:
        """List all field arrays in the primary (or specified) VTU file."""
        vtu_files = find_vtu_files(self._dir)
        if not vtu_files:
            raise VTUNotFoundError(str(self._dir))

        if vtu_rel_path:
            target = self._dir / vtu_rel_path
        else:
            target = pick_primary_vtu(vtu_files) or vtu_files[0]

        ds = load_dataset(target)
        pf, cf = extract_field_info(ds)
        return ArrayListResponse(
            simulation_id=self._sim_id,
            vtu_path=str(target.relative_to(self._dir)),
            point_arrays=pf,
            cell_arrays=cf,
            n_points=ds.n_points,
            n_cells=ds.n_cells,
            bounds=get_dataset_bounds(ds),
        )

    # ── Field rendering ───────────────────────────────────────────────────────

    def render_field(self, request: RenderRequest) -> RenderResponse:
        """Render a field array to PNG, using cache when possible."""
        cache_key = make_render_key(
            self._sim_id,
            field=str(request.field),
            cmap=request.colormap.value,
            log_scale=str(request.log_scale),
            opacity=str(request.opacity),
            mode=str(request.mode_index),
            camera=request.camera_preset.value,
            w=str(request.width),
            h=str(request.height),
            boundaries=str(request.show_boundaries),
            high_fidelity=str(request.high_fidelity),
        )

        if cache_get(cache_key) is not None:
            fn = f"render_{cache_key[:16]}.png"
            url = f"{_VIS_BASE_URL.format(sim_id=self._sim_id)}/{fn}"
            output_path = self._images_dir / fn
            if not output_path.exists():
                output_path.write_bytes(cache_get(cache_key))
            return RenderResponse(image_url=url, width=request.width, height=request.height, cached=True)

        vtu_files = find_vtu_files(self._dir)
        if not vtu_files:
            raise VTUNotFoundError(str(self._dir))

        # Select VTU by mode index
        target = None
        if request.mode_index is not None:
            for p in vtu_files:
                if _mode_index(p) == request.mode_index:
                    target = p
                    break
        target = target or pick_primary_vtu(vtu_files) or vtu_files[0]

        ds = load_dataset(target)
        fn = f"render_{cache_key[:16]}.png"
        output_path = self._images_dir / fn

        # Resolve boundary path for overlay
        boundary_path = get_boundary_vtu_path(target) if request.show_boundaries else None

        t_ms = render_field_to_png(ds, output_path, request, boundary_path=boundary_path)

        if output_path.exists():
            cache_put(cache_key, output_path.read_bytes())

        # Generate thumbnail
        thumb_path = self._images_dir / f"thumb_{fn}"
        generate_thumbnail(output_path, thumb_path)

        # Collect field range from dataset
        field_name = request.field
        field_min = field_max = None
        if field_name and field_name in ds.point_data:
            import numpy as np
            arr = ds.point_data[field_name]
            if arr.ndim > 1:
                mag = np.linalg.norm(arr, axis=1)
            else:
                mag = arr
            finite = mag[np.isfinite(mag)]
            if len(finite):
                field_min = float(finite.min())
                field_max = float(finite.max())

        url = f"{_VIS_BASE_URL.format(sim_id=self._sim_id)}/{fn}"
        return RenderResponse(
            image_url=url,
            width=request.width,
            height=request.height,
            field_name=field_name,
            field_min=field_min,
            field_max=field_max,
            render_time_ms=t_ms,
            cached=False,
        )

    # ── Mesh rendering ────────────────────────────────────────────────────────

    def render_mesh(self, request: RenderRequest, display_mode: MeshDisplayMode = MeshDisplayMode.SURFACE_EDGES) -> RenderResponse:
        """Render the simulation mesh to PNG."""
        cache_key = make_render_key(
            self._sim_id, mode=display_mode.value,
            opacity=str(request.opacity), camera=request.camera_preset.value,
            w=str(request.width), h=str(request.height), _type="mesh",
            boundaries=str(request.show_boundaries),
        )

        mesh_files = find_mesh_files(self._dir)
        vtu_files = find_vtu_files(self._dir)
        if not mesh_files and not vtu_files:
            raise RenderError("No mesh or VTU files found in artifact directory")

        fn = f"mesh_{cache_key[:16]}.png"
        output_path = self._images_dir / fn

        if cache_get(cache_key) and output_path.exists():
            return RenderResponse(image_url=f"{_VIS_BASE_URL.format(sim_id=self._sim_id)}/{fn}",
                                  width=request.width, height=request.height, cached=True)

        source = mesh_files[0] if mesh_files else (pick_primary_vtu(vtu_files) or vtu_files[0])
        ds = load_dataset(source)
        solver = _solver_from_path(source)
        title = f"{solver.title()} — 3D {('Tetrahedral Mesh' if mesh_files else 'FEM Mesh')}"

        # Resolve boundary path for overlay
        boundary_path = None
        if request.show_boundaries:
            if vtu_files:
                primary_vtu = pick_primary_vtu(vtu_files) or vtu_files[0]
                boundary_path = get_boundary_vtu_path(primary_vtu)

        t_ms = render_mesh_to_png(ds, output_path, request, title=title, display_mode=display_mode, boundary_path=boundary_path)
        if output_path.exists():
            cache_put(cache_key, output_path.read_bytes())

        return RenderResponse(
            image_url=f"{_VIS_BASE_URL.format(sim_id=self._sim_id)}/{fn}",
            width=request.width, height=request.height,
            render_time_ms=t_ms, cached=False,
        )

    # ── Slice rendering ───────────────────────────────────────────────────────

    def render_slice(self, request: SliceRequest) -> RenderResponse:
        """Render an orthogonal slice to PNG."""
        cache_key = make_render_key(
            self._sim_id,
            axis=request.axis.value,
            pos=str(request.position),
            field=str(request.field),
            cmap=request.colormap.value,
            log=str(request.log_scale),
            w=str(request.width),
            h=str(request.height),
        )

        vtu_files = find_vtu_files(self._dir)
        if not vtu_files:
            raise VTUNotFoundError(str(self._dir))

        fn = f"slice_{cache_key[:16]}.png"
        output_path = self._images_dir / fn

        if cache_get(cache_key) and output_path.exists():
            return RenderResponse(image_url=f"{_VIS_BASE_URL.format(sim_id=self._sim_id)}/{fn}",
                                  width=request.width, height=request.height, cached=True)

        primary = pick_primary_vtu(vtu_files) or vtu_files[0]
        ds = load_dataset(primary)
        t_ms = generate_orthogonal_slice(ds, output_path, request)

        if output_path.exists():
            cache_put(cache_key, output_path.read_bytes())

        return RenderResponse(
            image_url=f"{_VIS_BASE_URL.format(sim_id=self._sim_id)}/{fn}",
            width=request.width, height=request.height,
            render_time_ms=t_ms, cached=False,
        )

    # ── Camera presets ────────────────────────────────────────────────────────

    @staticmethod
    def get_camera_presets() -> List[CameraPreset]:
        return get_all_presets()

    # ── Image serving ─────────────────────────────────────────────────────────

    def get_image_path(self, filename: str) -> Optional[Path]:
        """Resolve a rendered image filename to its absolute path."""
        safe = Path(filename).name  # strip any path traversal
        candidate = self._images_dir / safe
        return candidate if candidate.exists() else None
