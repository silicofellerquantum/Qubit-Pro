"""Off-screen rendering service for Palace simulation mesh and field files.

Renders the actual GMSH mesh.msh files generated during simulation into
high-quality PNG visualizations using PyVista headless rendering.
"""

from __future__ import annotations

import os
import logging
from pathlib import Path
from typing import List, Tuple

import pyvista as pv
import numpy as np

logger = logging.getLogger(__name__)

# Configure PyVista for headless/off-screen rendering
pv.OFF_SCREEN = True

# Start virtual framebuffer if running headlessly on Linux
if os.name == "posix" and not os.environ.get("DISPLAY"):
    try:
        pv.start_xvfb()
        logger.info("Started virtual framebuffer (Xvfb) for off-screen rendering.")
    except Exception as e:
        logger.warning(f"Could not start Xvfb: {e}. Rendering may fail in headless mode.")


def render_mesh_file(mesh_path: Path, output_png_path: Path, title: str = "Mesh") -> bool:
    """Render a GMSH .msh file to a PNG image using PyVista.

    Args:
        mesh_path: Path to the .msh file.
        output_png_path: Where to save the rendered PNG.
        title: Label for the render (e.g. 'Eigenmode Mesh').

    Returns:
        True if rendering succeeded, False otherwise.
    """
    if not mesh_path.exists():
        logger.warning(f"Mesh file not found: {mesh_path}")
        return False

    try:
        logger.info(f"Rendering mesh from: {mesh_path}")
        mesh = pv.read(str(mesh_path))

        plotter = pv.Plotter(off_screen=True, window_size=[1200, 900])
        plotter.set_background("white", top="aliceblue")

        # Add the mesh with a clean scientific style
        plotter.add_mesh(
            mesh,
            color="#4a90d9",
            opacity=0.85,
            show_edges=True,
            edge_color="#1a1a2e",
            line_width=0.3,
            lighting=True,
        )

        # Add title text
        plotter.add_text(
            title,
            position="upper_left",
            font_size=14,
            color="black",
            shadow=True,
        )

        # Add mesh stats
        n_cells = mesh.n_cells
        n_points = mesh.n_points
        stats_text = f"Nodes: {n_points:,}  |  Elements: {n_cells:,}"
        plotter.add_text(
            stats_text,
            position="lower_left",
            font_size=10,
            color="#555555",
        )

        plotter.view_isometric()
        plotter.reset_camera()
        plotter.screenshot(str(output_png_path))
        plotter.close()

        logger.info(f"Rendered mesh to: {output_png_path} ({output_png_path.stat().st_size} bytes)")
        return True
    except Exception as e:
        logger.warning(f"Failed to render mesh {mesh_path.name}: {e}", exc_info=True)
        return False


def render_vtu_file(vtu_path: Path, output_png_path: Path, variant: str = "e") -> bool:
    """Render a VTU/PVTU field file to a PNG image.

    Falls back gracefully if the file has no scalar data.
    """
    if not vtu_path.exists():
        logger.warning(f"VTU file not found: {vtu_path}")
        return False

    try:
        logger.info(f"Rendering {variant}-field from: {vtu_path}")
        mesh = pv.read(str(vtu_path))

        plotter = pv.Plotter(off_screen=True, window_size=[1200, 900])
        plotter.set_background("white", top="aliceblue")

        # Determine scalar field based on requested variant
        scalar_name = None
        bar_title = "Field Value"
        available = list(mesh.point_data.keys())

        if variant == "e":
            candidates = ["E_Real", "E Real", "E", "E_mag", "V"]
            bar_title = "Electric Field (V/m)"
        elif variant == "h":
            candidates = ["B_Real", "B Real", "B", "B_mag", "H"]
            bar_title = "Magnetic Field (T)"
        else:
            candidates = ["J_Real", "J Real", "J", "J_mag", "Current"]
            bar_title = "Current Density (A/m^2)"

        # Find the first matching candidate
        for cand in candidates:
            if cand in available:
                scalar_name = cand
                break
        
        # Absolute fallback if variant specific field is missing
        if not scalar_name and available:
            scalar_name = available[0]
            bar_title = f"{scalar_name} Field"

        if scalar_name:
            if mesh.point_data[scalar_name].ndim > 1:
                mesh.point_data["Magnitude"] = np.linalg.norm(mesh.point_data[scalar_name], axis=1)
                scalar_name = "Magnitude"

            # To match the classic AWS Palace / HFSS isometric field visualization:
            # 1. Clip the mesh at Z=0 (removes the upper air bounding box)
            # 2. This leaves the 3D substrate block, with the metal fields exposed on the top surface
            try:
                # Clip removes points where the normal vector points. 
                # normal='z' removes Z > 0 (the air box), leaving the substrate (Z <= 0).
                field_mesh = mesh.clip(normal='z', origin=(0, 0, 0), invert=True)
            except Exception as e:
                logger.warning(f"Z-clip failed: {e}. Falling back to 3D volume thresholding.")
                max_val = np.nanmax(mesh.point_data[scalar_name])
                field_mesh = mesh.threshold(value=max_val * 0.001, scalars=scalar_name) if max_val > 0 else mesh

            # Set up the strict logarithmic scale (like the AWS reference: 1e-8 to 1.0)
            # We normalize relative to the maximum field value in the domain
            max_field = np.nanmax(field_mesh.point_data[scalar_name]) if field_mesh.n_points > 0 else 1.0
            if max_field <= 0:
                max_field = 1.0
                
            min_field_limit = max_field * 1e-8
            
            if scalar_name in field_mesh.point_data:
                # Clip minimums to 1e-8 of max to prevent log(0) and standardise the color range
                field_mesh.point_data[scalar_name] = np.clip(
                    field_mesh.point_data[scalar_name], 
                    a_min=min_field_limit, 
                    a_max=max_field
                )

            plotter.add_mesh(
                field_mesh,
                scalars=scalar_name,
                cmap="coolwarm", # Coolwarm matches the AWS Palace reference documentation
                log_scale=True, 
                clim=[min_field_limit, max_field], # Lock the color limits to exactly 8 orders of magnitude
                show_scalar_bar=True,
                show_edges=False,
                scalar_bar_args={
                    "title": bar_title,
                    "color": "black",
                    "position_x": 0.05,
                    "position_y": 0.05,
                    "width": 0.15,
                    "height": 0.5,
                    "fmt": "%.1e", # Scientific notation like the reference
                },
            )
        else:
            plotter.add_mesh(mesh, color="#4a90d9", show_edges=True, opacity=0.85)

        # Restore isometric view to show the beautiful 3D block
        plotter.view_isometric()
        plotter.reset_camera()
        plotter.screenshot(str(output_png_path))
        plotter.close()
        logger.info(f"Rendered field to: {output_png_path}")
        return True
    except Exception as e:
        logger.warning(f"Failed to render field {vtu_path.name}: {e}", exc_info=True)
        return False


def render_chip_efield_overlay(
    vtu_path: Path,
    output_png_path: Path,
    geometry: "EMGeometry | None" = None,
    variant: str = "e",
    title: str = "",
) -> bool:
    """Render a 2D chip-design E-field overlay image.

    Slices the VTU at Z=0 (chip surface), interpolates field data onto a
    regular grid, and overlays the chip design artwork (qubit pockets, pads,
    junctions, chip boundary).

    Args:
        vtu_path: Path to a VTU or PVTU file from Palace.
        output_png_path: Where to save the rendered PNG.
        geometry: Optional EMGeometry for chip design overlay.
        variant: Field variant to render ('e', 'h', or 'j').
        title: Title for the plot.

    Returns:
        True if rendering succeeded, False otherwise.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import matplotlib.patches as patches
    from matplotlib.colors import LogNorm
    from matplotlib.lines import Line2D

    try:
        from scipy.interpolate import griddata as scipy_griddata
    except ImportError:
        logger.warning("scipy not available — cannot render chip E-field overlay.")
        return False

    if not vtu_path.exists():
        logger.warning(f"VTU file not found: {vtu_path}")
        return False

    try:
        logger.info(f"Rendering chip-design {variant}-field overlay from: {vtu_path}")
        mesh = pv.read(str(vtu_path))

        # Determine which field to render
        if variant == "e":
            vec_candidates = ["E_real", "E Real", "E"]
            scalar_candidates = ["U_e"]
            bar_label = "|E| (V/m)"
        elif variant == "h":
            vec_candidates = ["B_real", "B Real", "B"]
            scalar_candidates = ["U_m"]
            bar_label = "|B| (T)"
        else:
            vec_candidates = ["J_real", "J Real", "J"]
            scalar_candidates = ["S"]
            bar_label = "|J| (A/m²)"

        # Find vector field and compute magnitude
        field_name = None
        available = list(mesh.point_data.keys())
        for cand in vec_candidates:
            if cand in available:
                field_name = cand
                break
        if not field_name:
            for cand in scalar_candidates:
                if cand in available:
                    field_name = cand
                    break
        if not field_name and available:
            field_name = available[0]

        if not field_name:
            logger.warning("No field data found in VTU.")
            return False

        data = mesh.point_data[field_name]
        if data.ndim > 1:
            magnitude = np.linalg.norm(data, axis=1)
        else:
            magnitude = data.copy()
        mesh.point_data["_field_mag"] = magnitude

        # Slice at Z=0.001 (just above chip surface)
        chip_slice = mesh.slice(normal="z", origin=(0, 0, 0.001))
        if chip_slice.n_points < 10:
            # Try other Z values near the surface
            for z_try in [0.0, 0.005, 0.01, -0.001, 0.002]:
                chip_slice = mesh.slice(normal="z", origin=(0, 0, z_try))
                if chip_slice.n_points >= 10:
                    break

        if chip_slice.n_points < 10:
            logger.warning(f"Chip surface slice has too few points ({chip_slice.n_points}).")
            return False

        pts = chip_slice.points
        x_pts = pts[:, 0]
        y_pts = pts[:, 1]
        e_vals = chip_slice.point_data["_field_mag"]

        # Interpolate onto regular 2D grid
        x_min, x_max = float(np.min(x_pts)), float(np.max(x_pts))
        y_min, y_max = float(np.min(y_pts)), float(np.max(y_pts))
        grid_res = 800
        xi = np.linspace(x_min, x_max, grid_res)
        yi = np.linspace(y_min, y_max, grid_res)
        XI, YI = np.meshgrid(xi, yi)
        EI = scipy_griddata((x_pts, y_pts), e_vals, (XI, YI), method="linear", fill_value=0.01)

        max_e = float(np.nanmax(EI))
        if max_e <= 0:
            max_e = 1.0
        min_e = max_e * 1e-6
        EI = np.clip(EI, a_min=min_e, a_max=max_e)

        logger.info(f"Field range: {min_e:.2e} to {max_e:.2e}")

        # Render with matplotlib
        fig, ax = plt.subplots(1, 1, figsize=(14, 12), dpi=150)
        fig.patch.set_facecolor("#0a0a1a")
        ax.set_facecolor("#0a0a1a")

        im = ax.imshow(
            EI,
            extent=[x_min, x_max, y_min, y_max],
            origin="lower",
            cmap="jet",
            norm=LogNorm(vmin=min_e, vmax=max_e),
            interpolation="bilinear",
            aspect="equal",
        )

        cbar = fig.colorbar(im, ax=ax, shrink=0.75, pad=0.02)
        cbar.set_label(bar_label, color="white", fontsize=14, fontweight="bold")
        cbar.ax.tick_params(colors="white", labelsize=10)

        # Overlay chip design geometry
        if geometry is not None:
            from app.services.palace.models import GeometryElementKind as GEK

            chip_w = geometry.chip_width_mm or 10.0
            chip_h = geometry.chip_height_mm or 10.0

            # Chip boundary
            chip_rect = patches.Rectangle(
                (-chip_w / 2, -chip_h / 2), chip_w, chip_h,
                linewidth=2.5, edgecolor="white", facecolor="none", linestyle="-",
            )
            ax.add_patch(chip_rect)

            for el in geometry.elements:
                if el.kind == GEK.QUBIT:
                    x, y = el.x_mm, el.y_mm
                    p = el.params

                    pocket_w = float(p.get("pocket_width_um", 650)) / 1000.0
                    pocket_h = float(p.get("pocket_height_um", 650)) / 1000.0
                    pad_w = float(p.get("pad_width_um", 455)) / 1000.0
                    pad_h = float(p.get("pad_height_um", 90)) / 1000.0
                    pad_gap = float(p.get("pad_gap_um", 30)) / 1000.0

                    # Ground pocket outline
                    pocket = patches.Rectangle(
                        (x - pocket_w / 2, y - pocket_h / 2), pocket_w, pocket_h,
                        linewidth=1.8, edgecolor="#00ff88", facecolor="none",
                        linestyle="--", alpha=0.9,
                    )
                    ax.add_patch(pocket)

                    # Top pad
                    pad1 = patches.Rectangle(
                        (x - pad_w / 2, y + pad_gap / 2), pad_w, pad_h,
                        linewidth=1.5, edgecolor="cyan", facecolor="none", alpha=0.95,
                    )
                    ax.add_patch(pad1)

                    # Bottom pad
                    pad2 = patches.Rectangle(
                        (x - pad_w / 2, y - pad_gap / 2 - pad_h), pad_w, pad_h,
                        linewidth=1.5, edgecolor="cyan", facecolor="none", alpha=0.95,
                    )
                    ax.add_patch(pad2)

                    # Josephson junction line
                    ax.plot(
                        [x, x], [y - pad_gap / 2, y + pad_gap / 2],
                        color="yellow", linewidth=2, alpha=0.9,
                    )

                    # Qubit label
                    ax.text(
                        x, y + pocket_h / 2 + 0.15, el.id,
                        ha="center", va="bottom", fontsize=11, fontweight="bold",
                        color="white",
                        bbox=dict(
                            boxstyle="round,pad=0.2",
                            facecolor="#00000088", edgecolor="#00ff88", linewidth=0.8,
                        ),
                    )

                elif el.kind in (GEK.RESONATOR, GEK.COUPLER, GEK.FEEDLINE):
                    x, y = el.x_mm, el.y_mm
                    p = el.params
                    length = float(p.get("length_mm", 2.0))
                    width = float(p.get("cpw_width_um", 10.0)) / 1000.0

                    trace = patches.Rectangle(
                        (x - length / 2, y - width / 2), length, width,
                        linewidth=1.2, edgecolor="#ff8800", facecolor="none",
                        linestyle="-", alpha=0.8,
                    )
                    ax.add_patch(trace)
                    ax.text(
                        x, y + width / 2 + 0.1, el.id,
                        ha="center", va="bottom", fontsize=9, color="#ff8800", alpha=0.8,
                    )

            # Legend
            legend_elements = [
                Line2D([0], [0], color="#00ff88", linewidth=1.5, linestyle="--", label="Ground Pocket"),
                Line2D([0], [0], color="cyan", linewidth=1.5, label="Transmon Pads"),
                Line2D([0], [0], color="yellow", linewidth=2, label="Josephson Junction"),
                Line2D([0], [0], color="white", linewidth=2, label="Chip Boundary"),
            ]
            leg = ax.legend(
                handles=legend_elements, loc="lower left", fontsize=9,
                facecolor="#1a1a2e", edgecolor="#444444", labelcolor="white",
            )

        # Axes styling
        margin = max(x_max - x_min, y_max - y_min) * 0.05
        ax.set_xlim(x_min - margin, x_max + margin)
        ax.set_ylim(y_min - margin, y_max + margin)
        ax.set_xlabel("X (mm)", color="white", fontsize=13)
        ax.set_ylabel("Y (mm)", color="white", fontsize=13)
        ax.tick_params(colors="white", labelsize=10)
        for spine in ax.spines.values():
            spine.set_color("#444444")
        ax.grid(True, alpha=0.15, color="white")

        plot_title = title or f"Eigenmode {bar_label} on Chip Design — AWS Palace"
        ax.set_title(plot_title, color="white", fontsize=16, fontweight="bold", pad=15)

        plt.tight_layout()
        plt.savefig(
            str(output_png_path), dpi=150, bbox_inches="tight",
            facecolor=fig.get_facecolor(), edgecolor="none",
        )
        plt.close()

        logger.info(f"Rendered chip-design field overlay to: {output_png_path}")
        return True

    except Exception as e:
        logger.warning(f"Failed to render chip E-field overlay: {e}", exc_info=True)
        return False


def generate_field_visualizations(
    simulation_id: str,
    artifact_path: str,
    geometry: "EMGeometry | None" = None,
) -> List[str]:
    """Scan simulation output artifacts and render visualizations.

    Priority order:
      1. Chip-design E-field overlay (2D heatmap with chip geometry)
      2. VTU/PVTU field files (from Palace paraview output) — if they exist
      3. mesh.msh files (always exist from GMSH) — guaranteed fallback

    Returns:
        List of served image URLs (e.g. ['/simulation-files/<id>/images/eigenmode_mesh.png'])
    """
    artifact_dir = Path(artifact_path)
    if not artifact_dir.exists():
        logger.warning(f"Artifact directory missing: {artifact_dir}")
        return []

    images_dir = artifact_dir / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    image_urls: List[str] = []

    for solver in ["eigenmode", "electrostatic", "magnetostatic", "driven"]:
        solver_dir = artifact_dir / solver
        if not solver_dir.exists():
            continue

        # --- Try VTU field files first ---
        paraview_dir = solver_dir / "out" / "paraview"
        vtu_rendered = False

        if paraview_dir.exists():
            # Palace writes: paraview/<solver_name>/Cycle<N>/data.pvtu
            # Exclude "_boundary" subfolders (surface data only, not volumetric fields)
            
            # Collect all .pvtu files not inside boundary dirs
            def is_boundary(p: Path) -> bool:
                return any("boundary" in part.lower() for part in p.parts)

            vtu_files: List[Path] = sorted([
                p for p in paraview_dir.rglob("*.pvtu")
                if not is_boundary(p)
            ])

            # Fallback to .vtu if no .pvtu
            if not vtu_files:
                vtu_files = sorted([
                    p for p in paraview_dir.rglob("*.vtu")
                    if not is_boundary(p)
                ])

            logger.info(f"Found {len(vtu_files)} VTU field file(s) in {paraview_dir}")

            import re
            def get_mode_index(path: Path) -> int | None:
                for part in path.parts:
                    match = re.search(r"Cycle(\d+)", part, re.IGNORECASE)
                    if match:
                        return int(match.group(1))
                return None

            logger.info(f"Found {len(vtu_files)} VTU field file(s) in {paraview_dir}")

            for vtu_file in vtu_files:
                mode_idx = get_mode_index(vtu_file)
                mode_suffix = f"_{mode_idx}" if mode_idx is not None else ""

                # --- Chip-design overlay (primary, best quality) ---
                for variant in ["e", "h"]:
                    overlay_name = f"{solver}_chip_{variant}{mode_suffix}.png"
                    overlay_path = images_dir / overlay_name
                    variant_label = {"e": "Electric Field |E|", "h": "Magnetic Field |B|"}.get(variant, variant)
                    mode_label = f" (Mode {mode_idx})" if mode_idx is not None else ""
                    plot_title = f"{solver.title()} {variant_label}{mode_label} on Chip Design — AWS Palace"
                    if render_chip_efield_overlay(
                        vtu_file, overlay_path,
                        geometry=geometry, variant=variant, title=plot_title,
                    ):
                        image_urls.append(f"/simulation-files/{simulation_id}/images/{overlay_name}")
                        vtu_rendered = True

                        # Save default copy for Mode 1
                        if mode_idx == 1 or mode_idx is None:
                            default_overlay_name = f"{solver}_chip_{variant}.png"
                            import shutil
                            shutil.copy2(overlay_path, images_dir / default_overlay_name)
                            if f"/simulation-files/{simulation_id}/images/{default_overlay_name}" not in image_urls:
                                image_urls.append(f"/simulation-files/{simulation_id}/images/{default_overlay_name}")

                # --- 3D isometric views (secondary) ---
                for variant in ["e", "h", "j"]:
                    png_name = f"{solver}_field_{variant}{mode_suffix}.png"
                    png_path = images_dir / png_name
                    if render_vtu_file(vtu_file, png_path, variant=variant):
                        image_urls.append(f"/simulation-files/{simulation_id}/images/{png_name}")
                        vtu_rendered = True

                        # Save default copy for Mode 1
                        if mode_idx == 1 or mode_idx is None:
                            default_png_name = f"{solver}_field_{variant}.png"
                            import shutil
                            shutil.copy2(png_path, images_dir / default_png_name)
                            if f"/simulation-files/{simulation_id}/images/{default_png_name}" not in image_urls:
                                image_urls.append(f"/simulation-files/{simulation_id}/images/{default_png_name}")

        # --- Fallback: render mesh.msh (always exists) ---
        mesh_path = solver_dir / "mesh.msh"
        if mesh_path.exists():
            png_name = f"{solver}_mesh.png"
            png_path = images_dir / png_name
            title = f"{solver.title()} — 3D Tetrahedral Mesh"
            if render_mesh_file(mesh_path, png_path, title=title):
                image_urls.append(f"/simulation-files/{simulation_id}/images/{png_name}")

    logger.info(f"Generated {len(image_urls)} visualization(s) for simulation {simulation_id}.")
    return image_urls

