"""Main Mesh Generator orchestrator service for the simulation backend."""

from __future__ import annotations

import json
import logging
import math
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple
import gmsh

from app.simulation.workspace import WorkspaceManager
from app.simulation.workspace.workspace_models import WorkspaceMetadata
from app.simulation.workspace.workspace_utils import timestamp_now
from app.simulation.geometry.geometry_models import GeometryComponent, GeometryComponentKind
from app.simulation.geometry.constants import (
    EXPORT_GEO_FILENAME,
    EXPORT_DESIGN_FILENAME,
    EXPORT_METADATA_FILENAME,
)
from app.simulation.geometry.coordinate_transform import simplify_path

from app.simulation.mesh.exceptions import (
    MeshError,
    MeshGenerationError,
    MeshImportError,
)
from app.simulation.mesh.mesh_settings import MeshSettings
from app.simulation.mesh.mesh_models import MeshMetadata
from app.simulation.mesh.mesh_quality import MeshQualityAnalyzer
from app.simulation.mesh.mesh_validator import MeshValidator
from app.simulation.mesh.boundary_manager import BoundaryManager
from app.simulation.mesh.physical_groups import PhysicalGroupManager
from app.simulation.mesh.mesh_exporter import MeshExporter

logger = logging.getLogger(__name__)


class MeshGenerator:
    """Orchestrates loading geometry, programmatic GMSH meshing, tagging, validation, and export."""

    def __init__(self, workspace_manager: WorkspaceManager) -> None:
        """Initialize the Mesh Generator.

        Args:
            workspace_manager: WorkspaceManager instance to access sandboxed workspaces.
        """
        self.workspace_manager = workspace_manager

    def generate_mesh(
        self,
        simulation_id: str,
        settings: MeshSettings | None = None,
        coarse: bool = False,
    ) -> MeshMetadata:
        """Generate, validate, and export a conformal 3D finite-element mesh for a simulation.

        Args:
            simulation_id: The UUID of the simulation workspace.
            settings: Optional custom MeshSettings configuration.
            coarse: If True, generate a coarse mesh for fast testing.

        Returns:
            The schema-validated MeshMetadata written to the workspace.

        Raises:
            WorkspaceNotFoundError: If the workspace does not exist.
            MeshImportError: If reading input geometry files fails.
            MeshGenerationError: If GMSH mesh generation fails.
            MeshValidationError: If mesh validation fails.
            MeshQualityError: If quality metrics calculation fails.
            MeshExportError: If exporting mesh files fails.
        """
        start_time = time.perf_counter()
        logger.info("MeshGenerator starting mesh generation for simulation: %s", simulation_id)

        # 1. Retrieve the sandboxed workspace
        workspace = self.workspace_manager.get_workspace(simulation_id)
        
        geom_dir = Path(workspace.geometry_path)
        geo_file = geom_dir / EXPORT_GEO_FILENAME
        design_file = geom_dir / EXPORT_DESIGN_FILENAME
        geom_meta_file = geom_dir / EXPORT_METADATA_FILENAME

        # Assert input geometry files exist
        if not geo_file.exists():
            raise MeshImportError(f"Missing required geometry script: '{geo_file}'")
        if not design_file.exists():
            raise MeshImportError(f"Missing archived design layout: '{design_file}'")
        if not geom_meta_file.exists():
            raise MeshImportError(f"Missing geometry metadata file: '{geom_meta_file}'")

        # 2. Parse design.json to reconstruct the components list in the exact exported order
        components = self._reconstruct_components(design_file)
        
        # Read geometry metadata for chip dimensions
        with open(geom_meta_file, "r", encoding="utf-8") as f:
            geom_meta = json.load(f)
            geom_version = geom_meta.get("geometry_version", "1.0.0")

        # 3. Resolve mesh settings
        if settings is None:
            settings = MeshSettings()
        
        # If coarse flag is set (manually or via env), adjust settings for coarse elements
        import os
        is_coarse = coarse or os.getenv("GMSH_COARSE_TEST", "").lower() in ("true", "1", "yes")
        if is_coarse:
            logger.info("Coarse mesh mode activated. Adjusting element sizes for speed.")
            settings = MeshSettings(
                mesh_size=0.30,
                min_element_size=0.05,
                max_element_size=1.20,
                boundary_refinement_factor=0.50,
            )

        # 4. Initialize GMSH & Start Logger Redirect
        initialized_by_us = False
        if not gmsh.isInitialized():
            gmsh.initialize()
            initialized_by_us = True

        try:
            gmsh.option.setNumber("General.Terminal", 0)  # Suppress GMSH stdout noise
            gmsh.option.setNumber("Mesh.MshFileVersion", 2.2)  # Force MSH 2.2 format for MFEM compatibility
            gmsh.logger.start()  # Start capturing GMSH internal logs

            # Create a fresh GMSH model
            gmsh.model.add("quantum_chip_mesh")

            # 5. Load the raw geometry surfaces from the .geo script
            logger.info("Loading GMSH geometry script: %s", geo_file)
            try:
                gmsh.open(str(geo_file))
            except Exception as e:
                raise MeshGenerationError(f"GMSH failed to open and run geometry script: {e}")

            # 6. Map the loaded OCC 2D surfaces to our components list deterministically
            # GMSH returns entities sorted by their creation tags.
            # Since tags are allocated sequentially in the script, this order perfectly matches our drawing sequence.
            surfaces = [tag for dim, tag in gmsh.model.getEntities(dim=2)]
            if not surfaces:
                raise MeshGenerationError("No 2D surfaces found in the loaded GMSH geometry model.")

            # The very first surface drawn is always the ground plane
            ground_tag = surfaces[0]
            entity_map: Dict[str, List[Tuple[int, int]]] = {
                "ground": [(2, ground_tag)]
            }

            # Map remaining sequential surfaces to components
            idx = 1
            for comp in components:
                if comp.kind == GeometryComponentKind.QUBIT:
                    # Qubits draw: pocket, pad1, pad2, junc (4 surfaces)
                    if idx + 3 >= len(surfaces):
                        raise MeshGenerationError(f"Mesh mapping error: Insufficient surfaces for Qubit '{comp.id}'")
                    entity_map[f"pocket_{comp.id}"] = [(2, surfaces[idx])]
                    entity_map[f"pad1_{comp.id}"] = [(2, surfaces[idx + 1])]
                    entity_map[f"pad2_{comp.id}"] = [(2, surfaces[idx + 2])]
                    entity_map[f"junc_{comp.id}"] = [(2, surfaces[idx + 3])]
                    idx += 4
                elif comp.kind in (
                    GeometryComponentKind.RESONATOR,
                    GeometryComponentKind.COUPLER,
                    GeometryComponentKind.FEEDLINE,
                ):
                    # Lines draw: trace, gap (2 surfaces)
                    if idx + 1 >= len(surfaces):
                        raise MeshGenerationError(f"Mesh mapping error: Insufficient surfaces for Line '{comp.id}'")
                    entity_map[f"trace_{comp.id}"] = [(2, surfaces[idx])]
                    entity_map[f"gap_{comp.id}"] = [(2, surfaces[idx + 1])]
                    idx += 2
                elif comp.kind == GeometryComponentKind.LAUNCHPAD:
                    # Launchpad draws: pad (1 surface)
                    if idx >= len(surfaces):
                        raise MeshGenerationError(f"Mesh mapping error: Insufficient surfaces for Launchpad '{comp.id}'")
                    entity_map[f"pad_{comp.id}"] = [(2, surfaces[idx])]
                    idx += 1

            # 7. Construct 3D dielectric substrate and vacuum air volumes
            # Read bounding box limits from metadata, default to 10x10 mm
            bbox = geom_meta.get("bounding_box", (-5.0, -5.0, 5.0, 5.0))
            xmin, ymin, xmax, ymax = bbox
            W = xmax - xmin
            H = ymax - ymin
            
            H_sub = 0.5  # Substrate thickness (mm)
            H_air = 1.0  # Air box thickness (mm)
            
            logger.info("Creating 3D volumes: Substrate (height=0.5mm), Air Box (height=1.0mm) for W=%.2f, H=%.2f", W, H)
            
            sub_vol = gmsh.model.occ.addBox(xmin, ymin, -H_sub, W, H, H_sub)
            air_vol = gmsh.model.occ.addBox(xmin, ymin, 0, W, H, H_air)

            # 8. Conformal OCC Boolean Cut & Fragment
            # A. Subtract all ground pockets and line gaps from the ground plane
            pocket_surfaces = []
            for name, entities in entity_map.items():
                if name.startswith("pocket_") or name.startswith("gap_"):
                    pocket_surfaces.append(entities[0])

            if pocket_surfaces:
                logger.info("Performing boolean cut: subtracting %d pocket/gap cutouts from ground plane", len(pocket_surfaces))
                out_ground, _ = gmsh.model.occ.cut([(2, ground_tag)], pocket_surfaces)
                final_ground_tags = [tag for dim, tag in out_ground if dim == 2]
            else:
                final_ground_tags = [ground_tag]

            entity_map["ground"] = [(2, tag) for tag in final_ground_tags]

            # B. Compile tool entities for conformal fragmentation
            tool_entities: List[Tuple[int, int]] = []
            for tag in final_ground_tags:
                tool_entities.append((2, tag))

            for comp in components:
                if comp.kind == GeometryComponentKind.QUBIT:
                    tool_entities.append(entity_map[f"pad1_{comp.id}"][0])
                    tool_entities.append(entity_map[f"pad2_{comp.id}"][0])
                    tool_entities.append(entity_map[f"junc_{comp.id}"][0])
                elif comp.kind in (
                    GeometryComponentKind.RESONATOR,
                    GeometryComponentKind.COUPLER,
                    GeometryComponentKind.FEEDLINE,
                ):
                    tool_entities.append(entity_map[f"trace_{comp.id}"][0])
                elif comp.kind == GeometryComponentKind.LAUNCHPAD:
                    # Launchpad is a solid conductor (like a qubit pad) — must be
                    # conformally embedded into the substrate/air volumes via fragment().
                    # It is NOT added to the pocket/gap cutout loop above.
                    tool_entities.append(entity_map[f"pad_{comp.id}"][0])

            # C. Execute OCC boolean fragment
            object_entities = [(3, sub_vol), (3, air_vol)]
            inputs = object_entities + tool_entities
            
            logger.info("Executing conformal OCC fragment on 3D volumes and 2D components...")
            out, out_map = gmsh.model.occ.fragment(object_entities, tool_entities)
            gmsh.model.occ.synchronize()

            # 9. Local Mesh Sizing Fields (Refinement)
            logger.info("Configuring GMSH mesh sizing and local refinement fields...")
            
            # Collect all active boundary surface tags to apply refinement
            refinement_surfaces: List[int] = []
            for comp in components:
                if comp.kind == GeometryComponentKind.QUBIT:
                    # Josephson junctions and qubit pads need high density
                    junc_ent = entity_map[f"junc_{comp.id}"][0]
                    refinement_surfaces.extend([t for d, t in out_map[inputs.index(junc_ent)] if d == 2])
                    
                    pad1_ent = entity_map[f"pad1_{comp.id}"][0]
                    pad2_ent = entity_map[f"pad2_{comp.id}"][0]
                    refinement_surfaces.extend([t for d, t in out_map[inputs.index(pad1_ent)] if d == 2])
                    refinement_surfaces.extend([t for d, t in out_map[inputs.index(pad2_ent)] if d == 2])
                elif comp.kind in (GeometryComponentKind.RESONATOR, GeometryComponentKind.COUPLER, GeometryComponentKind.FEEDLINE):
                    trace_ent = entity_map[f"trace_{comp.id}"][0]
                    refinement_surfaces.extend([t for d, t in out_map[inputs.index(trace_ent)] if d == 2])
                elif comp.kind == GeometryComponentKind.LAUNCHPAD:
                    pad_ent = entity_map[f"pad_{comp.id}"][0]
                    refinement_surfaces.extend([t for d, t in out_map[inputs.index(pad_ent)] if d == 2])

            if refinement_surfaces:
                # A. Distance field calculates distance to the active component surfaces
                f_dist = gmsh.model.mesh.field.add("Distance")
                gmsh.model.mesh.field.setNumbers(f_dist, "SurfacesList", refinement_surfaces)
                
                # B. Threshold field refines elements near components based on distance
                f_thres = gmsh.model.mesh.field.add("Threshold")
                gmsh.model.mesh.field.setNumber(f_thres, "IField", f_dist)
                
                # Refinement mesh size = default_mesh_size * boundary_refinement_factor
                lc_min = settings.mesh_size * settings.boundary_refinement_factor
                lc_min = max(lc_min, settings.min_element_size)
                
                gmsh.model.mesh.field.setNumber(f_thres, "LcMin", lc_min)
                gmsh.model.mesh.field.setNumber(f_thres, "LcMax", settings.mesh_size)
                gmsh.model.mesh.field.setNumber(f_thres, "DistMin", 0.04)  # Refine within 40 um
                gmsh.model.mesh.field.setNumber(f_thres, "DistMax", 0.20)  # Grow back to bulk within 200 um
                
                gmsh.model.mesh.field.setAsBackgroundMesh(f_thres)
                logger.info("Local refinement configured: Min size=%.4f mm, Max size=%.4f mm", lc_min, settings.mesh_size)
            else:
                logger.warning("No active components found for local refinement. Using uniform size.")

            # 10. Configure Sizing Options and Generate Mesh
            gmsh.option.setNumber("Mesh.CharacteristicLengthMin", settings.min_element_size)
            gmsh.option.setNumber("Mesh.CharacteristicLengthMax", settings.max_element_size)
            gmsh.option.setNumber("Mesh.MeshSizeFromCurvature", settings.curvature_refinement)
            
            # GMSH 3D Mesh Generation
            logger.info("Generating 3D tetrahedral finite-element mesh...")
            gmsh.model.mesh.generate(3)
            
            # Mesh optimization to eliminate slivers and high-skew elements
            logger.info("Optimizing mesh quality...")
            gmsh.model.mesh.optimize("Netgen")

            # 11. Conformal Boundary Mapping & Physical Group Assignment
            # Extract boundary tags
            boundary_groups = BoundaryManager.extract_boundaries(
                components=components,
                entity_map=entity_map,
                air_vol_tag=air_vol,
                sub_vol_tag=sub_vol,
                out_map=out_map,
                inputs=inputs,
            )
            
            # Register them in GMSH
            physical_groups_meta = PhysicalGroupManager.assign_physical_groups(boundary_groups)

            # 12. Run Mesh Validation & Quality Analysis
            MeshValidator.validate_mesh()
            quality_metrics = MeshQualityAnalyzer.analyze_quality()

            # 13. Compile Mesh Metadata
            # Extract 3D bounding box from GMSH model
            g_bbox = gmsh.model.getBoundingBox(-1, -1)
            
            # Query element counts by dimension
            _, node_tags, _ = gmsh.model.mesh.getNodes()
            node_count = len(node_tags)
            
            # Count elements of specific dimensions
            elem_types, _, _ = gmsh.model.mesh.getElements()
            total_elements = 0
            tet_count = 0
            triangle_count = 0
            line_count = 0
            
            for e_type in elem_types:
                # GMSH element types: 4 = tet, 2 = triangle, 1 = line
                tags, _ = gmsh.model.mesh.getElementsByType(e_type)
                count = len(tags)
                total_elements += count
                if e_type == 4:
                    tet_count = count
                elif e_type == 2:
                    triangle_count = count
                elif e_type == 1:
                    line_count = count

            generation_time = time.perf_counter() - start_time
            logger.info("Mesh generation succeeded in %.2f seconds. Element count: %d", generation_time, total_elements)

            mesh_metadata = MeshMetadata(
                workspace_id=simulation_id,
                geometry_version=geom_version,
                node_count=node_count,
                element_count=total_elements,
                tet_count=tet_count,
                triangle_count=triangle_count,
                line_count=line_count,
                bounding_box=g_bbox,
                physical_groups=physical_groups_meta,
                mesh_settings=settings,
                generation_time_seconds=generation_time,
                created_at=timestamp_now(),
            )

            # 14. Export Mesh and Metadata to Workspace
            gmsh_log = "\n".join(gmsh.logger.get())
            gmsh.logger.stop()

            MeshExporter.export_mesh(
                workspace=workspace,
                metadata=mesh_metadata,
                quality=quality_metrics,
                gmsh_log=gmsh_log,
            )

            # 15. Update simulation workspace metadata state
            # Note: We can mark the workspace as meshed/active in metadata
            logger.info("MeshGenerator completed layout mesh for simulation: %s", simulation_id)
            return mesh_metadata

        except MeshError:
            if gmsh.isInitialized():
                gmsh.logger.stop()
            raise
        except Exception as e:
            if gmsh.isInitialized():
                gmsh.logger.stop()
            logger.exception("Unexpected error in mesh generation pipeline.")
            raise MeshGenerationError(f"Unexpected mesh generation failure: {e}") from e
        finally:
            if initialized_by_us and gmsh.isInitialized():
                gmsh.finalize()
                logger.info("GMSH finalized successfully.")

    def _reconstruct_components(self, design_file: Path) -> List[GeometryComponent]:
        """Load design.json and reconstruct components in the exact order they were exported.

        Args:
            design_file: Path to the archived design.json file.

        Returns:
            List of reconstructed GeometryComponents.

        Raises:
            MeshImportError: If the design.json is missing or corrupted.
        """
        try:
            with open(design_file, "r", encoding="utf-8") as f:
                payload = json.load(f)
        except Exception as e:
            raise MeshImportError(f"Failed to load archived design file: {e}")

        components: List[GeometryComponent] = []

        # 1. Parse V2 Design Graph
        v2_data = payload.get("v2", {})
        graph_dict = v2_data.get("graph")
        if graph_dict:
            # We reconstruct components in the exact same order as GeometryBuilder:
            # Qubits, Resonators, Couplers, Feedlines, Launchpads.
            # To avoid loading the entire DesignGraph type in the mesh generator (and keep it decoupled),
            # we can parse the raw nodes list of the graph dict directly!
            nodes = graph_dict.get("nodes", [])
            
            # Group nodes by kind
            qubits = [n for n in nodes if n.get("kind") == "qubit"]
            resonators = [n for n in nodes if n.get("kind") == "resonator"]
            couplers = [n for n in nodes if n.get("kind") == "coupler"]
            feedlines = [n for n in nodes if n.get("kind") == "feedline"]
            launchpads = [n for n in nodes if n.get("kind") == "launchpad"]
            
            # Map kinds to kind Enum
            from app.simulation.geometry.geometry_models import GeometryComponentKind
            
            for n in qubits:
                components.append(GeometryComponent(
                    id=n["id"], kind=GeometryComponentKind.QUBIT,
                    x_mm=float(n.get("x_mm", 0.0)), y_mm=float(n.get("y_mm", 0.0)),
                    orientation_deg=float(n.get("orientation_deg", 0.0)),
                    layer="metal", material="aluminum", params=n.get("design_options") or n
                ))
            for n in resonators:
                components.append(GeometryComponent(
                    id=n["id"], kind=GeometryComponentKind.RESONATOR,
                    x_mm=float(n.get("x_mm", 0.0)), y_mm=float(n.get("y_mm", 0.0)),
                    orientation_deg=float(n.get("orientation_deg", 0.0)),
                    layer="metal", material="aluminum", params=n.get("design_options") or n
                ))
            for n in couplers:
                components.append(GeometryComponent(
                    id=n["id"], kind=GeometryComponentKind.COUPLER,
                    x_mm=float(n.get("x_mm", 0.0)), y_mm=float(n.get("y_mm", 0.0)),
                    orientation_deg=float(n.get("orientation_deg", 0.0)),
                    layer="metal", material="aluminum", params=n.get("design_options") or n
                ))
            for n in feedlines:
                components.append(GeometryComponent(
                    id=n["id"], kind=GeometryComponentKind.FEEDLINE,
                    x_mm=float(n.get("x_mm", 0.0)), y_mm=float(n.get("y_mm", 0.0)),
                    orientation_deg=float(n.get("orientation_deg", 0.0)),
                    layer="metal", material="aluminum", params=n.get("design_options") or n
                ))
            for n in launchpads:
                components.append(GeometryComponent(
                    id=n["id"], kind=GeometryComponentKind.LAUNCHPAD,
                    x_mm=float(n.get("x_mm", 0.0)), y_mm=float(n.get("y_mm", 0.0)),
                    orientation_deg=float(n.get("orientation_deg", 0.0)),
                    layer="metal", material="aluminum", params=n.get("design_options") or n
                ))

            # Reconstruct connections (edges) from graph dict edges
            edges = graph_dict.get("edges", [])
            
            # Map node ID to coordinates
            node_coords = {}
            for n in nodes:
                node_coords[n["id"]] = (float(n.get("x_mm", 0.0)), float(n.get("y_mm", 0.0)))
                
            # Helper to parse meander points from cachedSvg
            def _parse_svg_path_points(svg_str: str | None) -> list[tuple[float, float]] | None:
                import re
                if not svg_str:
                    return None
                match = re.search(r'points=["\']([^"\']+)["\']', svg_str)
                if not match:
                    return None
                points_str = match.group(1)
                tokens = points_str.strip().split()
                points = []
                for token in tokens:
                    parts = token.split(',')
                    if len(parts) == 2:
                        try:
                            x = float(parts[0]) / 1000.0
                            y = float(parts[1]) / 1000.0
                            points.append((x, y))
                        except ValueError:
                            continue
                if len(points) >= 2:
                    return simplify_path(points)
                return None

            # Look up flat connections from design_payload to get cachedSvg
            flat_connections = payload.get("design", {}).get("connections", [])
            flat_conn_map = {}
            
            def clean_id(pid: str) -> str:
                if pid.startswith("comp_"):
                    return pid[len("comp_"):]
                return pid

            for conn in flat_connections:
                cid = conn.get("id") or ""
                flat_conn_map[cid] = conn
                
                from_placement = clean_id(conn.get("from", {}).get("placementId", ""))
                to_placement = clean_id(conn.get("to", {}).get("placementId", ""))
                flat_conn_map[f"{from_placement}->{to_placement}"] = conn
                flat_conn_map[f"{to_placement}->{from_placement}"] = conn

            for edge in edges:
                edge_id = edge.get("label") or f"conn_{edge.get('source_id')}_{edge.get('target_id')}"
                src_id = edge.get("source_id")
                tgt_id = edge.get("target_id")

                if src_id in node_coords and tgt_id in node_coords:
                    ax, ay = node_coords[src_id]
                    bx, by = node_coords[tgt_id]
                    mx = (ax + bx) / 2.0
                    my = (ay + by) / 2.0
                    dist = math.sqrt((bx - ax)**2 + (by - ay)**2)
                    angle = math.degrees(math.atan2(by - ay, bx - ax))

                    kind = GeometryComponentKind.RESONATOR

                    conn_params = {
                        "length_mm": dist,
                        "cpw_width_um": 10.0,
                        "cpw_gap_um": 5.0,
                    }
                    
                    matching_conn = flat_conn_map.get(edge_id) or flat_conn_map.get(f"{src_id}->{tgt_id}")
                    if matching_conn:
                        if matching_conn.get("params"):
                            conn_params.update(matching_conn.get("params"))
                        
                        path_points = _parse_svg_path_points(matching_conn.get("cachedSvg"))
                        if path_points:
                            conn_params["path_points"] = path_points

                    components.append(GeometryComponent(
                        id=edge_id,
                        kind=kind,
                        x_mm=round(mx, 4),
                        y_mm=round(my, 4),
                        orientation_deg=round(angle, 2),
                        layer="metal",
                        material="aluminum",
                        params=conn_params
                    ))
            
            return components

        # 2. Parse Legacy Design Layout
        design = payload.get("design", {})
        placements = design.get("placements", [])
        if placements:
            from app.simulation.geometry.geometry_models import GeometryComponentKind
            placement_map = {}
            
            for p in placements:
                inst_id = p.get("instanceId") or p.get("instance_id") or p.get("id") or p.get("name") or ""
                comp_id = p.get("componentId") or p.get("component_id") or ""
                
                # Reconstruct coordinates
                if "x" in p and "y" in p:
                    x = float(p["x"])
                    y = float(p["y"])
                elif "location" in p and isinstance(p["location"], dict):
                    x = float(p["location"].get("x", 0.0))
                    y = float(p["location"].get("y", 0.0))
                else:
                    x = 0.0
                    y = 0.0
                    
                rot = float(p.get("rotation" or "orientation_deg", 0.0))
                placement_map[inst_id] = (x, y)
                
                # Classify kind based on component ID name (exact same logic as GeometryBuilder)
                inst_lower = inst_id.lower()
                comp_lower = comp_id.lower()
                
                if "qubit" in inst_lower or "qubit" in comp_lower or "transmon" in comp_lower:
                    kind = GeometryComponentKind.QUBIT
                elif "resonator" in inst_lower or "meander" in comp_lower or "res" in inst_lower:
                    kind = GeometryComponentKind.RESONATOR
                elif "coupler" in inst_lower or "coupler" in comp_lower:
                    kind = GeometryComponentKind.COUPLER
                elif "feed" in inst_lower or "line" in inst_lower:
                    kind = GeometryComponentKind.FEEDLINE
                else:
                    kind = GeometryComponentKind.LAUNCHPAD
                
                components.append(GeometryComponent(
                    id=inst_id,
                    kind=kind,
                    x_mm=x,
                    y_mm=y,
                    orientation_deg=rot,
                    layer="metal",
                    material="aluminum",
                    params=p.get("params") or {},
                ))
                
            # Reconstruct connections in legacy fallback flow
            connections = design.get("connections", [])
            for conn in connections:
                conn_id = conn.get("id") or ""
                from_data = conn.get("from", {})
                to_data = conn.get("to", {})
                from_id = from_data.get("placementId")
                to_id = to_data.get("placementId")

                if from_id in placement_map and to_id in placement_map:
                    ax, ay = placement_map[from_id]
                    bx, by = placement_map[to_id]
                    mx = (ax + bx) / 2.0
                    my = (ay + by) / 2.0
                    dist = math.sqrt((bx - ax)**2 + (by - ay)**2)
                    angle = math.degrees(math.atan2(by - ay, bx - ax))

                    kind = GeometryComponentKind.RESONATOR

                    components.append(GeometryComponent(
                        id=conn_id,
                        kind=kind,
                        x_mm=round(mx, 4),
                        y_mm=round(my, 4),
                        orientation_deg=round(angle, 2),
                        layer="metal",
                        material="aluminum",
                        params=conn.get("params") or {
                            "length_mm": dist,
                            "cpw_width_um": 10.0,
                            "cpw_gap_um": 5.0,
                        },
                    ))
                
            return components

        raise MeshImportError("Archived design layout contains neither valid V2 Design Graph nor legacy placements.")
