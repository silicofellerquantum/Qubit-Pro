"""Visualization REST API router.

All endpoints are mounted at /api/simulations/{sim_id}/visualization/

Thin router: no business logic — all work delegated to VisualizationService.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.routers.simulations import _authorize_simulation
from app.services.visualization import extract_3d_visualization
from app.services.palace_mesh_parser import parse_palace_mesh
from app.simulation.visualization import (
    ArrayListResponse,
    CameraPreset,
    RenderRequest,
    RenderResponse,
    SliceRequest,
    VisualizationManifest,
    VisualizationService,
)
from app.simulation.visualization.exceptions import (
    FieldNotFoundError,
    RenderError,
    VTUNotFoundError,
)
from app.simulation.visualization.visualization_models import (
    CameraPresetName,
    ColormapName,
    MeshDisplayMode,
    SliceAxis,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/simulations",
    tags=["visualization"],
)

# Project root — used to resolve artifact_path stored in DB as relative path
_PROJECT_ROOT = Path(__file__).resolve().parents[3]


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_sim_and_service(
    sim_id: str,
    db: AsyncSession,
    user: User,
) -> "tuple[object, VisualizationService]":
    """Authorize and return (simulation, VisualizationService)."""
    sim = await _authorize_simulation(db, sim_id, user.id)

    if not sim.artifact_retained or not sim.artifact_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No artifacts available for this simulation. Ensure artifact_retained=True.",
        )

    artifact_dir = _PROJECT_ROOT / sim.artifact_path
    if not artifact_dir.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Artifact directory does not exist on disk: {sim.artifact_path}",
        )

    return sim, VisualizationService(artifact_dir=artifact_dir, sim_id=sim_id)


def _handle_vis_error(exc: Exception) -> HTTPException:
    """Map visualization exceptions to HTTP errors."""
    if isinstance(exc, VTUNotFoundError):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    if isinstance(exc, FieldNotFoundError):
        return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    if isinstance(exc, RenderError):
        return HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
    return HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/{sim_id}/visualization")
async def get_3d_visualization(
    sim_id: str,
    mode: int = Query(1, ge=1, description="Eigenmode index (1-based) to visualize"),
    field: Optional[str] = Query(None, description="Field array name to visualize (e.g. E, B, U_e, U_m)"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Extracts and returns the 3D surface mesh vertices, faces, normals, and specified field magnitude.

    This data is formatted specifically for direct rendering in a Three.js scene.
    """
    sim = await _authorize_simulation(db, sim_id, user.id)

    if not sim.artifact_retained or not sim.artifact_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No artifacts available for this simulation. Ensure artifact_retained=True.",
        )

    artifact_dir = _PROJECT_ROOT / sim.artifact_path
    if not artifact_dir.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Artifact directory does not exist on disk: {sim.artifact_path}",
        )

    try:
        data = extract_3d_visualization(
            artifact_dir=artifact_dir,
            sim_solver=sim.solver,
            sim_results=sim.results,
            mode=mode,
            field_name=field,
        )
        if sim.runtime_seconds:
            data["metadata"]["runtime_seconds"] = int(sim.runtime_seconds)
        return data
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to extract 3D visualization")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal visualization error: {str(exc)}",
        )


@router.get("/{sim_id}/mesh")
async def get_3d_mesh(
    sim_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Extracts and returns the 3D volume tetrahedral mesh for rendering.

    This data is formatted specifically for line wireframe rendering in a Three.js scene.
    """
    sim = await _authorize_simulation(db, sim_id, user.id)

    if not sim.artifact_retained or not sim.artifact_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No artifacts available for this simulation. Ensure artifact_retained=True.",
        )

    artifact_dir = _PROJECT_ROOT / sim.artifact_path
    if not artifact_dir.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Artifact directory does not exist on disk: {sim.artifact_path}",
        )

    try:
        data = parse_palace_mesh(
            artifact_dir=artifact_dir,
            sim_solver=sim.solver,
            sim_results=sim.results,
        )
        if sim.runtime_seconds:
            data["metadata"]["runtime_seconds"] = int(sim.runtime_seconds)
        return data
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        logger.exception("Failed to parse volume mesh")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Internal mesh parsing error: {str(exc)}",
        )


@router.get("/{sim_id}/visualization/manifest", response_model=VisualizationManifest)
async def get_visualization_manifest(
    sim_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> VisualizationManifest:
    """Return the complete visualization manifest for a simulation.

    Includes available VTU files, pre-rendered images, field arrays, and mode count.
    """
    _, svc = await _get_sim_and_service(sim_id, db, user)
    try:
        return svc.get_manifest()
    except Exception as exc:
        logger.exception("Error building manifest for sim %s", sim_id)
        raise _handle_vis_error(exc)


@router.get("/{sim_id}/visualization/arrays", response_model=ArrayListResponse)
async def list_visualization_arrays(
    sim_id: str,
    vtu_path: Optional[str] = Query(None, description="Relative VTU path within artifact dir"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ArrayListResponse:
    """List all field arrays (point and cell data) available in the primary VTU file."""
    _, svc = await _get_sim_and_service(sim_id, db, user)
    try:
        return svc.list_arrays(vtu_rel_path=vtu_path)
    except Exception as exc:
        logger.exception("Error listing arrays for sim %s", sim_id)
        raise _handle_vis_error(exc)


@router.get("/{sim_id}/visualization/render", response_model=RenderResponse)
async def render_visualization_field(
    sim_id: str,
    field: Optional[str]   = Query(None,               description="Field array name (e.g. E_Real)"),
    colormap: ColormapName = Query(ColormapName.COOLWARM, description="Matplotlib colormap"),
    log_scale: bool        = Query(False,               description="Use logarithmic color scale"),
    opacity: float         = Query(1.0,                 ge=0.0, le=1.0),
    show_edges: bool       = Query(False),
    camera: CameraPresetName = Query(CameraPresetName.ISOMETRIC),
    mode: Optional[int]    = Query(None,                description="Eigenmode index (1-based)"),
    width: int             = Query(1200,                ge=256, le=4096),
    height: int            = Query(900,                 ge=256, le=4096),
    transparent: bool      = Query(False),
    show_boundaries: bool  = Query(True,                description="Overlay physical chip boundaries (qubits, resonators, couplers)"),
    high_fidelity: bool    = Query(True,                description="Render high-fidelity surface fields directly on boundary geometry"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RenderResponse:
    """Render a field array from the primary VTU file and return the image URL.

    The rendered PNG is cached by parameter hash to avoid redundant re-renders.
    """
    _, svc = await _get_sim_and_service(sim_id, db, user)
    request = RenderRequest(
        field=field,
        colormap=colormap,
        log_scale=log_scale,
        opacity=opacity,
        show_edges=show_edges,
        camera_preset=camera,
        mode_index=mode,
        width=width,
        height=height,
        transparent_background=transparent,
        show_boundaries=show_boundaries,
        high_fidelity=high_fidelity,
    )
    try:
        return svc.render_field(request)
    except Exception as exc:
        logger.exception("Field render failed for sim %s", sim_id)
        raise _handle_vis_error(exc)


@router.get("/{sim_id}/visualization/mesh-render", response_model=RenderResponse)
async def render_visualization_mesh(
    sim_id: str,
    display_mode: MeshDisplayMode = Query(MeshDisplayMode.SURFACE_EDGES),
    opacity: float                = Query(0.9, ge=0.0, le=1.0),
    camera: CameraPresetName      = Query(CameraPresetName.ISOMETRIC),
    width: int                    = Query(1200, ge=256, le=4096),
    height: int                   = Query(900, ge=256, le=4096),
    show_boundaries: bool         = Query(True, description="Overlay physical chip boundaries (qubits, resonators, couplers)"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RenderResponse:
    """Render the FEM mesh to a styled PNG."""
    _, svc = await _get_sim_and_service(sim_id, db, user)
    request = RenderRequest(
        opacity=opacity,
        camera_preset=camera,
        width=width,
        height=height,
        show_boundaries=show_boundaries,
    )
    try:
        return svc.render_mesh(request, display_mode=display_mode)
    except Exception as exc:
        logger.exception("Mesh render failed for sim %s", sim_id)
        raise _handle_vis_error(exc)


@router.get("/{sim_id}/visualization/slice", response_model=RenderResponse)
async def render_visualization_slice(
    sim_id: str,
    axis: SliceAxis         = Query(SliceAxis.Z,          description="Slice plane normal axis"),
    position: float         = Query(0.5, ge=0.0, le=1.0,  description="Normalised position [0,1] along axis"),
    field: Optional[str]    = Query(None,                  description="Field array to display"),
    colormap: ColormapName  = Query(ColormapName.COOLWARM),
    log_scale: bool         = Query(False),
    width: int              = Query(1200, ge=256, le=4096),
    height: int             = Query(900, ge=256, le=4096),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RenderResponse:
    """Generate an orthogonal slice of the simulation volume at the specified position."""
    _, svc = await _get_sim_and_service(sim_id, db, user)
    request = SliceRequest(
        axis=axis,
        position=position,
        field=field,
        colormap=colormap,
        log_scale=log_scale,
        width=width,
        height=height,
    )
    try:
        return svc.render_slice(request)
    except Exception as exc:
        logger.exception("Slice render failed for sim %s", sim_id)
        raise _handle_vis_error(exc)


@router.get("/{sim_id}/visualization/preview")
async def get_visualization_preview(
    sim_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return the best available preview image for a simulation (fast path).

    Prefers pre-rendered chip overlay → 3D field → mesh.
    """
    _, svc = await _get_sim_and_service(sim_id, db, user)
    manifest = svc.get_manifest()

    # Priority order for preview selection
    preview_priority = [
        lambda img: "chip_e" in img.variant,
        lambda img: "chip_h" in img.variant,
        lambda img: "field_e" in img.variant,
        lambda img: "field" in img.variant,
        lambda img: True,  # Any image
    ]

    for predicate in preview_priority:
        candidates = [img for img in manifest.pre_rendered_images if predicate(img)]
        if candidates:
            # Prefer mode 1
            candidates.sort(key=lambda img: (img.mode_index or 999))
            img_path = svc.get_image_path(candidates[0].filename)
            if img_path:
                return FileResponse(str(img_path), media_type="image/png")

    # Fallback: render on demand
    try:
        resp = svc.render_field(RenderRequest(width=800, height=600))
        img_path = svc.get_image_path(resp.image_url.split("/")[-1])
        if img_path:
            return FileResponse(str(img_path), media_type="image/png")
    except Exception:
        pass

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="No preview image available. Run a simulation with Paraview output enabled.",
    )


@router.get("/{sim_id}/visualization/presets")
async def get_camera_presets(
    sim_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[CameraPreset]:
    """Return all available named camera presets."""
    await _get_sim_and_service(sim_id, db, user)  # Auth check only
    return VisualizationService.get_camera_presets()


@router.get("/{sim_id}/visualization/images/{filename}")
async def serve_visualization_image(
    sim_id: str,
    filename: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Serve a pre-rendered or on-demand visualization image by filename."""
    _, svc = await _get_sim_and_service(sim_id, db, user)
    img_path = svc.get_image_path(filename)
    if not img_path:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Image '{filename}' not found for simulation {sim_id}.",
        )
    media_type = "image/jpeg" if filename.lower().endswith(".jpg") else "image/png"
    return FileResponse(str(img_path), media_type=media_type)
