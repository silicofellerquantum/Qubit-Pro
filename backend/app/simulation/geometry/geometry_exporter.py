"""Geometry Exporter for serializing design layouts and CAD/GEO files."""

from __future__ import annotations

import json
import logging
import math
from pathlib import Path
from typing import Any, Dict, List

from app.simulation.workspace.workspace_models import WorkspaceMetadata
from app.simulation.geometry.constants import (
    EXPORT_DESIGN_FILENAME,
    EXPORT_GEO_FILENAME,
    EXPORT_METADATA_FILENAME,
    EXPORT_STEP_FILENAME,
)
from app.simulation.geometry.exceptions import GeometryExportError
from app.simulation.geometry.geometry_models import GeometryComponent, GeometryComponentKind, GeometryMetadata, LogicalPort
from app.simulation.workspace.workspace_utils import timestamp_now, write_json_atomic

logger = logging.getLogger(__name__)


class GeometryExporter:
    """Serializes chip geometries to JSON, GMSH .geo scripts, and 3D STEP CAD files."""

    @staticmethod
    def export_geometry(
        workspace: WorkspaceMetadata,
        design_id: str,
        components: List[GeometryComponent],
        ports: List[LogicalPort],
        chip_width_mm: float,
        chip_height_mm: float,
        raw_payload: Dict[str, Any],
    ) -> GeometryMetadata:
        """Export all geometry artifacts into the sandboxed workspace.

        Args:
            workspace: The WorkspaceMetadata destination.
            design_id: The identifier of the design.
            components: List of placed components.
            ports: List of logical ports.
            chip_width_mm: Width of the chip.
            chip_height_mm: Height of the chip.
            raw_payload: The original design payload to archive.

        Returns:
            The created GeometryMetadata model.

        Raises:
            GeometryExportError: If writing to the workspace fails.
        """
        geometry_dir = Path(workspace.geometry_path)
        logger.info("Exporting geometry artifacts to: %s", geometry_dir)

        try:
            # 1. Archive the raw design payload
            design_file = geometry_dir / EXPORT_DESIGN_FILENAME
            write_json_atomic(design_file, raw_payload)

            # 2. Write the executable GMSH .geo script
            geo_file = geometry_dir / EXPORT_GEO_FILENAME
            GeometryExporter._write_geo_script(
                geo_file, components, chip_width_mm, chip_height_mm
            )

            # 3. Write 3D CAD STEP file using GMSH OCC kernel (non-blocking, wrapped in try-catch)
            step_file = geometry_dir / EXPORT_STEP_FILENAME
            step_generated = False
            try:
                GeometryExporter._generate_step_cad(
                    step_file, components, chip_width_mm, chip_height_mm
                )
                step_generated = True
            except Exception as e:
                logger.warning(
                    "Optional 3D STEP CAD generation skipped or failed: %s. "
                    "Valid GEO and JSON files are still exported successfully.",
                    e,
                )

            # 4. Compile and write the geometry metadata
            active_layers = sorted(list(set(c.layer for c in components)))
            active_materials = sorted(list(set(c.material for c in components)))
            
            # Find total bounding box of all components on the chip
            g_xmin = min(c.bounding_box[0] for c in components if c.bounding_box)
            g_ymin = min(c.bounding_box[1] for c in components if c.bounding_box)
            g_xmax = max(c.bounding_box[2] for c in components if c.bounding_box)
            g_ymax = max(c.bounding_box[3] for c in components if c.bounding_box)

            generated_files = [EXPORT_DESIGN_FILENAME, EXPORT_GEO_FILENAME]
            if step_generated:
                generated_files.append(EXPORT_STEP_FILENAME)
            generated_files.append(EXPORT_METADATA_FILENAME)

            geom_metadata = GeometryMetadata(
                design_id=design_id,
                component_count=len(components),
                bounding_box=(g_xmin, g_ymin, g_xmax, g_ymax),
                layers=active_layers,
                ports=ports,
                materials=active_materials,
                coordinate_system="cartesian_mm",
                generated_files=generated_files,
                created_at=timestamp_now(),
            )

            metadata_file = geometry_dir / EXPORT_METADATA_FILENAME
            write_json_atomic(metadata_file, geom_metadata.model_dump())

            logger.info("Geometry export completed successfully.")
            return geom_metadata

        except Exception as e:
            logger.error("Failed to export geometry to workspace: %s", e)
            raise GeometryExportError(f"Failed to write geometry artifacts: {e}") from e

    @staticmethod
    def _to_float(val: Any, default: float) -> float:
        """Safely convert a parameter value (which might be a float, int, or string with units) to float."""
        if val is None:
            return default
        if isinstance(val, (int, float)):
            return float(val)
        if isinstance(val, str):
            cleaned = val.strip().lower()
            for unit in ["um", "mm", "ghz", "mhz", "khz", "hz"]:
                if cleaned.endswith(unit):
                    cleaned = cleaned[:-len(unit)].strip()
                    break
            try:
                return float(cleaned)
            except ValueError:
                return default
        return default

    @staticmethod
    def _write_geo_script(
        file_path: Path,
        components: List[GeometryComponent],
        chip_width: float,
        chip_height: float,
    ) -> None:
        """Write a highly structured, executable GMSH .geo script with OpenCASCADE support.

        Args:
            file_path: Path to write the .geo file.
            components: List of components.
            chip_width: Width of chip.
            chip_height: Height of chip.
        """
        lines = [
            "// GMSH Geometry Script generated by Quantum Studio Geometry Builder",
            'SetFactory("OpenCASCADE");',
            "",
            f"W = {chip_width};",
            f"H = {chip_height};",
            "H_sub = 0.5; // Substrate thickness (mm)",
            "H_air = 1.0; // Air box thickness (mm)",
            "",
            "// Ground Die Plane",
            "ground = newreg;",
            "Rectangle(ground) = {-W/2, -H/2, 0, W, H};",
            "",
            "// Instantiated Components",
        ]

        # Write out drawing commands for each component type
        for idx, c in enumerate(components):
            lines.append(f"// --- Component: {c.id} ({c.kind.value}) ---")
            x, y, rot = c.x_mm, c.y_mm, c.orientation_deg
            p = c.params

            # Helper for local vars to prevent name collision in GMSH script
            suffix = f"_{idx}"

            if c.kind == GeometryComponentKind.QUBIT:
                pad_w = GeometryExporter._to_float(p.get("cross_width") or p.get("pad_width_um") or p.get("pad_width"), 455.0) / 1000.0
                pad_h = GeometryExporter._to_float(p.get("cross_length") or p.get("pad_height_um") or p.get("pad_height"), 90.0) / 1000.0
                pad_g = GeometryExporter._to_float(p.get("cross_gap") or p.get("pad_gap_um") or p.get("pad_gap"), 30.0) / 1000.0
                pocket_w = GeometryExporter._to_float(p.get("pocket_width_um") or p.get("pocket_width"), 650.0) / 1000.0
                pocket_h = GeometryExporter._to_float(p.get("pocket_height_um") or p.get("pocket_height"), 650.0) / 1000.0
                j_w = 0.04  # 40 um junction width

                lines.extend([
                    f"pocket{suffix} = newreg; Rectangle(pocket{suffix}) = {{{-pocket_w/2}, {-pocket_h/2}, 0, {pocket_w}, {pocket_h}}};",
                    f"pad1{suffix} = newreg; Rectangle(pad1{suffix}) = {{{-pad_w/2}, {pad_g/2}, 0, {pad_w}, {pad_h}}};",
                    f"pad2{suffix} = newreg; Rectangle(pad2{suffix}) = {{{-pad_w/2}, {-pad_g/2 - pad_h}, 0, {pad_w}, {pad_h}}};",
                    f"junc{suffix} = newreg; Rectangle(junc{suffix}) = {{{-j_w/2}, {-pad_g/2}, 0, {j_w}, {pad_g}}};",
                    f"// Transform Qubit {c.id}",
                    f"Rotate {{{{0, 0, 1}}, {{0, 0, 0}}, {math.radians(rot)}}} {{ Surface{{pocket{suffix}, pad1{suffix}, pad2{suffix}, junc{suffix}}}; }}",
                    f"Translate {{{x}, {y}, 0}} {{ Surface{{pocket{suffix}, pad1{suffix}, pad2{suffix}, junc{suffix}}}; }}",
                    "",
                ])
            elif c.kind in (GeometryComponentKind.RESONATOR, GeometryComponentKind.COUPLER, GeometryComponentKind.FEEDLINE):
                path_points = p.get("path_points")
                w = GeometryExporter._to_float(p.get("cpw_width_um") or p.get("cpw_width"), 10.0) / 1000.0
                g = GeometryExporter._to_float(p.get("cpw_gap_um") or p.get("cpw_gap"), 5.0) / 1000.0

                if path_points and len(path_points) >= 2:
                    lines.append(f"// Meandered path for line {c.id}")
                    trace_segs = []
                    gap_segs = []
                    
                    for s_idx in range(len(path_points) - 1):
                        p1 = path_points[s_idx]
                        p2 = path_points[s_idx + 1]
                        
                        dx = p2[0] - p1[0]
                        dy = p2[1] - p1[1]
                        dist = math.sqrt(dx**2 + dy**2)
                        if dist < 1e-6:
                            continue
                            
                        mx = (p1[0] + p2[0]) / 2.0
                        my = (p1[1] + p2[1]) / 2.0
                        angle = math.atan2(dy, dx)
                        
                        seg_suffix = f"{suffix}_{s_idx}"
                        trace_var = f"trace{seg_suffix}"
                        gap_var = f"gap{seg_suffix}"
                        trace_segs.append(trace_var)
                        gap_segs.append(gap_var)
                        
                        lines.extend([
                            f"{trace_var} = newreg; Rectangle({trace_var}) = {{{-dist/2}, {-w/2}, 0, {dist}, {w}}};",
                            f"{gap_var} = newreg; Rectangle({gap_var}) = {{{-dist/2}, {-(w/2 + g)}, 0, {dist}, {w + 2*g}}};",
                            f"Rotate {{{{0, 0, 1}}, {{0, 0, 0}}, {angle}}} {{ Surface{{{trace_var}, {gap_var}}}; }}",
                            f"Translate {{{mx}, {my}, 0}} {{ Surface{{{trace_var}, {gap_var}}}; }}",
                        ])
                    
                    if len(trace_segs) >= 2:
                        lines.extend([
                            f"trace{suffix}[] = BooleanUnion{{ Surface{{{trace_segs[0]}}}; Delete; }}{{ Surface{{{', '.join(trace_segs[1:])}}}; Delete; }};",
                            f"gap{suffix}[] = BooleanUnion{{ Surface{{{gap_segs[0]}}}; Delete; }}{{ Surface{{{', '.join(gap_segs[1:])}}}; Delete; }};",
                            ""
                        ])
                    elif len(trace_segs) == 1:
                        lines.extend([
                            f"trace{suffix} = {trace_segs[0]};",
                            f"gap{suffix} = {gap_segs[0]};",
                            ""
                        ])
                else:
                    # Fallback to straight line
                    length_val = p.get("length_um") or p.get("length")
                    if "length_mm" in p and p["length_mm"] is not None:
                        length_um = GeometryExporter._to_float(p["length_mm"], 2.0) * 1000.0
                    else:
                        length_um = GeometryExporter._to_float(length_val, 2000.0)
                    
                    L = length_um / 1000.0
                    lines.extend([
                        f"trace{suffix} = newreg; Rectangle(trace{suffix}) = {{{-L/2}, {-w/2}, 0, {L}, {w}}};",
                        f"gap{suffix} = newreg; Rectangle(gap{suffix}) = {{{-L/2}, {-(w/2 + g)}, 0, {L}, {w + 2*g}}};",
                        f"// Transform Line {c.id}",
                        f"Rotate {{{{0, 0, 1}}, {{0, 0, 0}}, {math.radians(rot)}}} {{ Surface{{trace{suffix}, gap{suffix}}}; }}",
                        f"Translate {{{x}, {y}, 0}} {{ Surface{{trace{suffix}, gap{suffix}}}; }}",
                        "",
                    ])
            elif c.kind == GeometryComponentKind.LAUNCHPAD:
                pad_w = GeometryExporter._to_float(p.get("pad_width_um") or p.get("pad_width"), 250.0) / 1000.0
                pad_l = GeometryExporter._to_float(p.get("pad_length_um") or p.get("pad_length"), 300.0) / 1000.0
                pad_g = GeometryExporter._to_float(p.get("pad_gap_um") or p.get("pad_gap"), 100.0) / 1000.0
                total_w = pad_w + 2.0 * pad_g

                lines.extend([
                    f"pad{suffix} = newreg; Rectangle(pad{suffix}) = {{{-pad_l/2}, {-total_w/2}, 0, {pad_l}, {total_w}}};",
                    f"// Transform Launchpad {c.id}",
                    f"Rotate {{{{0, 0, 1}}, {{0, 0, 0}}, {math.radians(rot)}}} {{ Surface{{pad{suffix}}}; }}",
                    f"Translate {{{x}, {y}, 0}} {{ Surface{{pad{suffix}}}; }}",
                    "",
                ])

        # Write to file
        with open(file_path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines))

    @staticmethod
    def _generate_step_cad(
        file_path: Path,
        components: List[GeometryComponent],
        chip_width: float,
        chip_height: float,
    ) -> None:
        """Draw 3D solid geometries and write them to a STEP file using GMSH's OCC kernel.

        This runs entirely within the geometry generation phase, without generating meshes
        or executing any solver steps.

        Args:
            file_path: Output STEP file path.
            components: Placed components.
            chip_width: Chip die width.
            chip_height: Chip die height.
        """
        import gmsh
        
        # Initialize GMSH if not already done
        initialized_by_us = False
        if not gmsh.isInitialized():
            gmsh.initialize()
            initialized_by_us = True

        try:
            # Suppress terminal messages
            gmsh.option.setNumber("General.Terminal", 0)
            gmsh.model.add("step_export_model")

            W = chip_width if chip_width > 0 else 10.0
            H = chip_height if chip_height > 0 else 10.0
            H_sub = 0.5  # Substrate thickness (mm)
            H_air = 1.0  # Air box thickness (mm)

            # Draw die and substrates
            sub_vol = gmsh.model.occ.addBox(-W / 2, -H / 2, -H_sub, W, H, H_sub)
            air_vol = gmsh.model.occ.addBox(-W / 2, -H / 2, 0, W, H, H_air)

            # Synchronize the OCC shapes to the GMSH model
            gmsh.model.occ.synchronize()
            
            # Export GMSH CAD representations as a STEP file
            # This exports the exact 3D solid volumes (substrate and air box)
            gmsh.write(str(file_path))
            logger.info("Successfully generated 3D solid STEP file: %s", file_path)

        finally:
            if initialized_by_us and gmsh.isInitialized():
                gmsh.finalize()
