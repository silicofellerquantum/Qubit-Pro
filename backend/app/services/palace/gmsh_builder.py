"""GMSH mesh generator for AWS Palace electromagnetic simulations."""

from __future__ import annotations

import math
import time
import logging
from pathlib import Path
from typing import List, Dict, Any, Tuple
import gmsh

from app.services.palace.models import EMGeometry, GeometryElement, GeometryElementKind
from app.services.palace.exceptions import GmshBuilderError

logger = logging.getLogger(__name__)


def parse_dim_to_um(val: Any, default: float) -> float:
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        val_clean = val.strip().lower()
        if val_clean.endswith("um"):
            val_clean = val_clean[:-2].strip()
        elif val_clean.endswith("mm"):
            try:
                return float(val_clean[:-2].strip()) * 1000.0
            except ValueError:
                pass
        try:
            return float(val_clean)
        except ValueError:
            return default
    return default


class GmshBuilder:
    """Helper to build 3D tetrahedral GMSH meshes for AWS Palace."""

    @staticmethod
    def generate_mesh(geometry: EMGeometry, output_path: Path, coarse: bool = False) -> None:
        """Generate a 3D conformal mesh from EMGeometry using GMSH OCC kernel.

        Args:
            geometry: The normalized EMGeometry representation of the chip.
            output_path: Path to write the resulting mesh.msh file.
            coarse: If True, or if GMSH_COARSE_TEST environment variable is set to 'true',
                    generate a coarse mesh suitable for fast tests.

        Raises:
            GmshBuilderError: If mesh generation or physical group assignment fails.
        """
        import os
        is_coarse = coarse or os.getenv("GMSH_COARSE_TEST", "").lower() in ("true", "1", "yes")
        start_time = time.perf_counter()
        logger.info(
            "Starting GMSH mesh generation for design_id=%s (coarse=%s). Target path: %s",
            geometry.design_id,
            is_coarse,
            output_path,
        )

        # Ensure output directory exists
        output_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            # 1. Initialize GMSH
            if not gmsh.isInitialized():
                gmsh.initialize()

            # Enable console logging redirection to python if needed, or suppress
            gmsh.option.setNumber("General.Terminal", 0)  # Suppress GMSH terminal output noise

            # Use a fresh model
            gmsh.model.add("quantum_chip")

            # 2. Dimensions & Materials
            W = geometry.chip_width_mm if geometry.chip_width_mm > 0 else 10.0
            H = geometry.chip_height_mm if geometry.chip_height_mm > 0 else 10.0
            H_sub = 0.5  # Substrate thickness in mm
            H_air = 1.0  # Air box thickness in mm

            logger.info("Chip dimensions: W=%.2f mm, H=%.2f mm. Substrate=0.5mm, Air=1.0mm", W, H)

            # Ground plane rectangle on Z=0
            ground_tag = gmsh.model.occ.addRectangle(-W / 2, -H / 2, 0, W, H)

            # Track CAD entities
            pocket_surfaces: List[int] = []
            qubit_pads_map: Dict[str, Tuple[int, int]] = {}
            qubit_junction_map: Dict[str, int] = {}
            trace_map: Dict[str, int] = {}

            # 3. Draw Elements on Z=0 surface
            for el in geometry.elements:
                x = el.x_mm
                y = el.y_mm
                rot = el.orientation_deg
                params = el.params

                if el.kind == GeometryElementKind.QUBIT:
                    # Retrieve transmon pad params (in mm)
                    # Support both TransmonPocket names (pad_width_um) and TransmonCross names (cross_width)
                    pad_width = parse_dim_to_um(
                        params.get("cross_width") or params.get("pad_width_um") or params.get("pad_width"),
                        455.0
                    ) / 1000.0
                    pad_height = parse_dim_to_um(
                        params.get("cross_length") or params.get("pad_height_um") or params.get("pad_height"),
                        90.0
                    ) / 1000.0
                    pad_gap = parse_dim_to_um(
                        params.get("cross_gap") or params.get("pad_gap_um") or params.get("pad_gap"),
                        30.0
                    ) / 1000.0
                    pocket_width = parse_dim_to_um(
                        params.get("pocket_width_um") or params.get("pocket_width"),
                        max(650.0, pad_width * 1000.0 * 1.5)  # Pocket must be larger than pad
                    ) / 1000.0
                    pocket_height = parse_dim_to_um(
                        params.get("pocket_height_um") or params.get("pocket_height"),
                        max(650.0, (pad_height * 2 + pad_gap) * 1000.0 * 1.5)  # Must contain both pads + gap
                    ) / 1000.0

                    # A. Ground Pocket cutout
                    pocket = gmsh.model.occ.addRectangle(
                        -pocket_width / 2, -pocket_height / 2, 0, pocket_width, pocket_height
                    )

                    # B. Qubit pads
                    pad1 = gmsh.model.occ.addRectangle(
                        -pad_width / 2, pad_gap / 2, 0, pad_width, pad_height
                    )
                    pad2 = gmsh.model.occ.addRectangle(
                        -pad_width / 2, -pad_gap / 2 - pad_height, 0, pad_width, pad_height
                    )

                    # C. Josephson junction (2D rectangle bridging the pads)
                    j_width = 40.0 / 1000.0  # 40 um wide junction sheet
                    j_rect = gmsh.model.occ.addRectangle(-j_width / 2, -pad_gap / 2, 0.0, j_width, pad_gap)

                    # Rotate & translate to center x, y
                    entities = [(2, pocket), (2, pad1), (2, pad2), (2, j_rect)]
                    angle_rad = rot * math.pi / 180.0
                    gmsh.model.occ.rotate(entities, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, angle_rad)
                    gmsh.model.occ.translate(entities, x, y, 0.0)

                    # Store
                    pocket_surfaces.append(pocket)
                    qubit_pads_map[el.id] = (pad1, pad2)
                    qubit_junction_map[el.id] = j_rect

                else:
                    # Resonators, Couplers, Feedlines, Launchpads
                    len_mm = params.get("length_mm")
                    if len_mm is not None:
                        try:
                            if isinstance(len_mm, str) and len_mm.strip().lower().endswith("mm"):
                                len_mm = len_mm.strip().lower()[:-2].strip()
                            L = float(len_mm)
                        except ValueError:
                            L = 2.0
                    else:
                        L = parse_dim_to_um(params.get("length"), 2000.0) / 1000.0
                        
                    width_val = params.get("cpw_width_um") or params.get("cpw_width") or params.get("line_width") or params.get("trace_width") or params.get("pad_width")
                    w = parse_dim_to_um(width_val, 10.0) / 1000.0
                    
                    gap_val = params.get("cpw_gap_um") or params.get("cpw_gap") or params.get("gap") or params.get("trace_gap") or params.get("pad_gap")
                    g = parse_dim_to_um(gap_val, 5.0) / 1000.0

                    trace = gmsh.model.occ.addRectangle(-L / 2, -w / 2, 0, L, w)
                    
                    # Create the gap to cut out of the ground plane
                    gap = gmsh.model.occ.addRectangle(-L / 2, -(w / 2 + g), 0, L, w + 2 * g)

                    # Rotate & translate
                    entities = [(2, trace), (2, gap)]
                    angle_rad = rot * math.pi / 180.0
                    gmsh.model.occ.rotate(entities, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0, angle_rad)
                    gmsh.model.occ.translate(entities, x, y, 0.0)

                    trace_map[el.id] = trace
                    pocket_surfaces.append(gap)

            # 4. Perform boolean cut to isolate ground plane from cutouts
            # We ONLY cut the empty pocket spaces. We do NOT cut the traces because
            # fragment will automatically embed the traces into the ground plane and resolve boundaries!
            cutouts = []
            for p in pocket_surfaces:
                cutouts.append((2, p))

            if cutouts:
                out_ground, _ = gmsh.model.occ.cut([(2, ground_tag)], cutouts)
                final_ground_tags = [tag for dim, tag in out_ground if dim == 2]
            else:
                final_ground_tags = [ground_tag]

            # 5. Create substrate and air volumes
            sub_vol = gmsh.model.occ.addBox(-W / 2, -H / 2, -H_sub, W, H, H_sub)
            air_vol = gmsh.model.occ.addBox(-W / 2, -H / 2, 0, W, H, H_air)

            # 6. Conformal fragment (conformal interface nodes between everything)
            object_entities = [(3, sub_vol), (3, air_vol)]
            tool_entities = []

            for tag in final_ground_tags:
                tool_entities.append((2, tag))

            for pads in qubit_pads_map.values():
                tool_entities.append((2, pads[0]))
                tool_entities.append((2, pads[1]))

            for t in trace_map.values():
                tool_entities.append((2, t))

            for jr in qubit_junction_map.values():
                tool_entities.append((2, jr))

            logger.info("Performing OCC boolean fragment for all 3D/2D/1D entities...")
            inputs = object_entities + tool_entities
            out, out_map = gmsh.model.occ.fragment(object_entities, tool_entities)
            gmsh.model.occ.synchronize()

            # Helper to map input tags to output tags
            def get_output_tags(dim: int, input_entity: Tuple[int, int]) -> List[int]:
                try:
                    idx = inputs.index(input_entity)
                    return [t for d, t in out_map[idx] if d == dim]
                except ValueError:
                    return []

            # 7. Formulate physical groups
            air_vol_tags = set(get_output_tags(3, (3, air_vol)))
            sub_vol_tags = set(get_output_tags(3, (3, sub_vol)))

            # Verify that volumes don't overlap
            overlap_vol = air_vol_tags.intersection(sub_vol_tags)
            if overlap_vol:
                logger.warning("Overlapping 3D volume tags detected: %s. Cleaning substrate group.", overlap_vol)
                sub_vol_tags = sub_vol_tags - overlap_vol

            # Define 3D physical groups
            gmsh.model.addPhysicalGroup(3, list(air_vol_tags), 1, "air")
            gmsh.model.addPhysicalGroup(3, list(sub_vol_tags), 2, "substrate")

            # Collect raw sets for ports, terminals, and PEC
            port_groups: Dict[int, Tuple[set[int], str]] = {}
            terminal_groups: Dict[int, Tuple[set[int], str]] = {}
            
            # 1. Ports (Josephson junctions) - highest priority
            curr_port_attr = 100
            for qubit in geometry.qubits:
                jr = qubit_junction_map[qubit.id]
                j_rect_tags = set(get_output_tags(2, (2, jr)))
                port_groups[curr_port_attr] = (j_rect_tags, f"port_{qubit.id}")
                curr_port_attr += 1

            # 2. Terminals (Qubits pads, Resonators and Connections) - second priority
            curr_attr = 10
            for el in geometry.elements:
                if el.kind == GeometryElementKind.QUBIT:
                    pads = qubit_pads_map[el.id]
                    pad_tags = set(get_output_tags(2, (2, pads[0])) + get_output_tags(2, (2, pads[1])))
                    terminal_groups[curr_attr] = (pad_tags, f"terminal_{el.id}")
                    curr_attr += 1
                elif el.kind in (GeometryElementKind.RESONATOR, GeometryElementKind.COUPLER, GeometryElementKind.FEEDLINE, GeometryElementKind.LAUNCHPAD):
                    trace_tag = trace_map[el.id]
                    trace_tags = set(get_output_tags(2, (2, trace_tag)))
                    terminal_groups[curr_attr] = (trace_tags, f"terminal_{el.id}")
                    curr_attr += 1

            # 3. PEC ground plane - lowest priority
            ground_tags_raw = set()
            for g_tag in final_ground_tags:
                ground_tags_raw.update(get_output_tags(2, (2, g_tag)))

            # Get the boundaries of all 3D volumes. Any 2D surface must belong to this set
            # to be inside the physical simulation domain. This discards any parts of 2D tool
            # entities that extend outside the chip boundaries.
            all_vols = [(3, t) for t in air_vol_tags] + [(3, t) for t in sub_vol_tags]
            boundary_surfs = gmsh.model.getBoundary(all_vols, combined=False, oriented=False, recursive=False)
            valid_surface_tags = set(tag for dim, tag in boundary_surfs if dim == 2)

            # Ensure strict mutual exclusivity across 2D boundary surfaces
            assigned_surfaces = set()
            
            # Define Ports (highest priority)
            for attr, (tags, name) in port_groups.items():
                tags = tags.intersection(valid_surface_tags)
                unique_tags = tags - assigned_surfaces
                if unique_tags:
                    gmsh.model.addPhysicalGroup(2, list(unique_tags), attr, name)
                    logger.info("Assigned Port '%s' (attr %d) with %d surfaces", name, attr, len(unique_tags))
                    assigned_surfaces.update(unique_tags)
                else:
                    logger.warning("Port '%s' (attr %d) has no unique surfaces inside the chip!", name, attr)

            # Define Terminals (second priority)
            for attr, (tags, name) in terminal_groups.items():
                tags = tags.intersection(valid_surface_tags)
                unique_tags = tags - assigned_surfaces
                if unique_tags:
                    gmsh.model.addPhysicalGroup(2, list(unique_tags), attr, name)
                    logger.info("Assigned Terminal '%s' (attr %d) with %d surfaces", name, attr, len(unique_tags))
                    assigned_surfaces.update(unique_tags)
                else:
                    logger.warning("Terminal '%s' (attr %d) has no unique surfaces inside the chip!", name, attr)

            # Define PEC (lowest priority)
            pec_tags = (ground_tags_raw & valid_surface_tags) - assigned_surfaces
            if pec_tags:
                gmsh.model.addPhysicalGroup(2, list(pec_tags), 3, "pec")
                logger.info("Assigned PEC 'pec' (attr 3) with %d surfaces", len(pec_tags))
                assigned_surfaces.update(pec_tags)
            else:
                logger.warning("PEC group has no unique surfaces!")

            # Validate physical groups
            GmshBuilder._validate_mesh_groups()

            # 8. Adaptive Mesh Sizing Fields
            v_in = 0.25 if is_coarse else 0.05
            v_out = 2.5 if is_coarse else 0.5
            size_min = 0.05 if is_coarse else 0.01
            size_max = 0.25 if is_coarse else 0.05
            dist_min = 0.10 if is_coarse else 0.02
            dist_max = 0.50 if is_coarse else 0.10

            # Field 1: Box around the chip plane Z=0
            gmsh.model.mesh.field.add("Box", 1)
            gmsh.model.mesh.field.setNumber(1, "VIn", v_in)   # Fine size inside box
            gmsh.model.mesh.field.setNumber(1, "VOut", v_out) # Coarse size outside box
            gmsh.model.mesh.field.setNumber(1, "XMin", -W / 2)
            gmsh.model.mesh.field.setNumber(1, "XMax", W / 2)
            gmsh.model.mesh.field.setNumber(1, "YMin", -H / 2)
            gmsh.model.mesh.field.setNumber(1, "YMax", H / 2)
            gmsh.model.mesh.field.setNumber(1, "ZMin", -0.05)
            gmsh.model.mesh.field.setNumber(1, "ZMax", 0.05)

            fields_list = [1]

            # Collect all junction boundary curves (1D) for mesh refinement
            all_j_lines = []
            for jr in qubit_junction_map.values():
                j_surfs = get_output_tags(2, (2, jr))
                for js in j_surfs:
                    boundary = gmsh.model.getBoundary([(2, js)], combined=True, oriented=False, recursive=False)
                    all_j_lines.extend([tag for dim, tag in boundary if dim == 1])

            if all_j_lines:
                # Field 2: Distance from junction lines
                gmsh.model.mesh.field.add("Distance", 2)
                gmsh.model.mesh.field.setNumbers(2, "CurvesList", all_j_lines)

                # Field 3: Threshold based on distance
                gmsh.model.mesh.field.add("Threshold", 3)
                gmsh.model.mesh.field.setNumber(3, "InField", 2)
                gmsh.model.mesh.field.setNumber(3, "SizeMin", size_min)   # Extra fine near junction
                gmsh.model.mesh.field.setNumber(3, "SizeMax", size_max)   # Fine
                gmsh.model.mesh.field.setNumber(3, "DistMin", dist_min)
                gmsh.model.mesh.field.setNumber(3, "DistMax", dist_max)
                fields_list.append(3)

            # Field 4: Minimum sizing combination
            gmsh.model.mesh.field.add("Min", 4)
            gmsh.model.mesh.field.setNumbers(4, "FieldsList", fields_list)
            gmsh.model.mesh.field.setAsBackgroundMesh(4)

            # Allow GMSH to propagate sizing from points and boundaries to avoid Delaunay conflict
            gmsh.option.setNumber("Mesh.CharacteristicLengthFromPoints", 1)
            gmsh.option.setNumber("Mesh.CharacteristicLengthFromCurvature", 1)
            gmsh.option.setNumber("Mesh.CharacteristicLengthExtendFromBoundary", 1)

            # 9. Mesh Generation
            logger.info("Generating 3D tetrahedral mesh...")
            gmsh.model.mesh.generate(3)

            # Save mesh using GMSH MSH version 2.2 for maximum compatibility
            gmsh.option.setNumber("Mesh.MshFileVersion", 2.2)
            gmsh.write(str(output_path))

            # Retrieve final mesh statistics
            node_count = gmsh.model.mesh.getNodes()[0].size
            element_count = gmsh.model.mesh.getElementsByType(4)[0].size  # Type 4 represents tetrahedra (3D)
            runtime = time.perf_counter() - start_time

            logger.info(
                "Mesh generation succeeded in %.2f seconds. Nodes=%d, 3D Elements=%d",
                runtime,
                node_count,
                element_count,
            )

        except Exception as e:
            logger.exception("GMSH mesh generation failed.")
            raise GmshBuilderError(f"Failed to generate GMSH mesh: {e}") from e

        finally:
            if gmsh.isInitialized():
                gmsh.finalize()
                logger.info("GMSH workspace finalized.")

    @staticmethod
    def _validate_mesh_groups() -> None:
        """Validate all GMSH physical groups to ensure mutual exclusivity and no duplicates.

        Raises:
            GmshBuilderError: If validation fails.
        """
        physical_groups = gmsh.model.getPhysicalGroups()
        all_tags_assigned: Dict[Tuple[int, int], List[str]] = {} # (dim, tag) -> list of physical group names

        for dim, tag in physical_groups:
            name = gmsh.model.getPhysicalName(dim, tag)
            entities = list(gmsh.model.getEntitiesForPhysicalGroup(dim, tag))
            
            # Check for duplicates in the tags list of this group
            if len(entities) != len(set(entities)):
                duplicates = [t for t in set(entities) if entities.count(t) > 1]
                raise GmshBuilderError(
                    f"Physical group '{name}' (dim={dim}, tag={tag}) contains duplicate entity tags: {duplicates}"
                )

            # For 2D groups, check for overlapping assignments across different groups
            if dim == 2:
                for entity_tag in entities:
                    key = (dim, entity_tag)
                    if key not in all_tags_assigned:
                        all_tags_assigned[key] = []
                    all_tags_assigned[key].append(name)

        # Report any overlapping assignments
        overlaps = {k: v for k, v in all_tags_assigned.items() if len(v) > 1}
        if overlaps:
            overlap_details = ", ".join(f"Entity {k[1]} (dim={k[0]}) in {v}" for k, v in overlaps.items())
            raise GmshBuilderError(
                f"Boundary assignment conflict: One or more entities are assigned to multiple physical groups: {overlap_details}"
            )
        
        logger.info("Mesh validation succeeded. All physical groups are mutually exclusive and have no duplicates.")
