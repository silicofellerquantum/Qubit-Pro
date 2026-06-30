"""Boundary Manager for extracting and classifying conformal boundary surfaces in GMSH meshes."""

from __future__ import annotations

import logging
from typing import Dict, List, Set, Tuple
import gmsh

from app.simulation.geometry.geometry_models import GeometryComponent, GeometryComponentKind
from app.simulation.mesh.exceptions import BoundaryDetectionError
from app.simulation.mesh.constants import (
    PEC_SURFACE_TAG,
    ABSORBING_SURFACE_TAG,
    PORT_START_ATTR,
    TERMINAL_START_ATTR,
)

logger = logging.getLogger(__name__)


class BoundaryManager:
    """Manages classification and mapping of conformal 2D boundary surfaces for Palace simulations."""

    @staticmethod
    def extract_boundaries(
        components: List[GeometryComponent],
        entity_map: Dict[str, List[Tuple[int, int]]],
        air_vol_tag: int,
        sub_vol_tag: int,
        out_map: List[List[Tuple[int, int]]],
        inputs: List[Tuple[int, int]],
    ) -> Dict[str, Tuple[int, List[int]]]:
        """Extract and classify all boundary surfaces on the mesh.

        Args:
            components: List of geometry components in the layout.
            entity_map: Map from component/entity name to their raw (dim, tag) pairs.
            air_vol_tag: Tag of the 3D air box volume.
            sub_vol_tag: Tag of the 3D substrate volume.
            out_map: The output map returned by the OCC fragment operation.
            inputs: The input entity list passed to the OCC fragment operation.

        Returns:
            A dictionary mapping group names to their (dimension, list of tags) pairs.
            Example: {"pec": (2, [12, 15]), "port_q0": (2, [45]), ...}

        Raises:
            BoundaryDetectionError: If boundary extraction or classification fails.
        """
        logger.info("Extracting conformal boundary surfaces from GMSH OCC model...")

        try:
            # Helper to map input (dim, tag) to its fragmented output tags
            def get_output_tags(dim: int, input_entity: Tuple[int, int]) -> List[int]:
                try:
                    idx = inputs.index(input_entity)
                    return [t for d, t in out_map[idx] if d == dim]
                except ValueError:
                    return []

            # 1. Gather all output volume tags
            air_vol_tags = set(get_output_tags(3, (3, air_vol_tag)))
            sub_vol_tags = set(get_output_tags(3, (3, sub_vol_tag)))

            if not air_vol_tags or not sub_vol_tags:
                raise BoundaryDetectionError("Failed to resolve fragmented 3D volume tags for air or substrate.")

            # 2. Get the boundaries of all 3D volumes
            # Any valid 2D surface must belong to this set to be on the exterior of the simulation domain.
            all_vols = [(3, t) for t in air_vol_tags] + [(3, t) for t in sub_vol_tags]
            boundary_surfs = gmsh.model.getBoundary(all_vols, combined=False, oriented=False, recursive=False)
            valid_surface_tags = set(tag for dim, tag in boundary_surfs if dim == 2)

            logger.info("Total exterior boundary surfaces found: %d", len(valid_surface_tags))

            # 3. Classify boundaries with strict priority (mutual exclusivity)
            assigned_surfaces: Set[int] = set()
            boundary_groups: Dict[str, Tuple[int, List[int]]] = {}

            # Prioritized Group A: Ports (Josephson junctions) - attribute 100+
            port_idx = 0
            for comp in components:
                if comp.kind == GeometryComponentKind.QUBIT:
                    junc_key = f"junc_{comp.id}"
                    if junc_key not in entity_map:
                        continue
                    
                    junc_entity = entity_map[junc_key][0]
                    junc_tags = set(get_output_tags(2, junc_entity))
                    
                    # Intersect with valid exterior surfaces and subtract already assigned surfaces
                    valid_junc_tags = junc_tags.intersection(valid_surface_tags) - assigned_surfaces
                    
                    if valid_junc_tags:
                        group_name = f"port_{comp.id}"
                        attr = PORT_START_ATTR + port_idx
                        boundary_groups[group_name] = (attr, list(valid_junc_tags))
                        assigned_surfaces.update(valid_junc_tags)
                        logger.info("Assigned Port '%s' (attr %d) with %d surfaces.", group_name, attr, len(valid_junc_tags))
                        port_idx += 1
                    else:
                        logger.warning("Qubit junction '%s' has no unique surfaces on the exterior boundary.", comp.id)

            # Prioritized Group B: Terminals (Qubit pads and Resonator traces) - attribute 10+
            terminal_idx = 0
            for comp in components:
                if comp.kind == GeometryComponentKind.QUBIT:
                    pad1_key = f"pad1_{comp.id}"
                    pad2_key = f"pad2_{comp.id}"
                    
                    pad_tags = set()
                    if pad1_key in entity_map:
                        pad_tags.update(get_output_tags(2, entity_map[pad1_key][0]))
                    if pad2_key in entity_map:
                        pad_tags.update(get_output_tags(2, entity_map[pad2_key][0]))
                    
                    valid_pad_tags = pad_tags.intersection(valid_surface_tags) - assigned_surfaces
                    if valid_pad_tags:
                        group_name = f"terminal_{comp.id}"
                        attr = TERMINAL_START_ATTR + terminal_idx
                        boundary_groups[group_name] = (attr, list(valid_pad_tags))
                        assigned_surfaces.update(valid_pad_tags)
                        logger.info("Assigned Qubit Terminal '%s' (attr %d) with %d surfaces.", group_name, attr, len(valid_pad_tags))
                        terminal_idx += 1

                elif comp.kind in (
                    GeometryComponentKind.RESONATOR,
                    GeometryComponentKind.COUPLER,
                    GeometryComponentKind.FEEDLINE,
                    GeometryComponentKind.LAUNCHPAD,
                ):
                    # Launchpads use 'pad_', couplers/feedlines/resonators use 'trace_'
                    trace_key = f"trace_{comp.id}" if comp.kind != GeometryComponentKind.LAUNCHPAD else f"pad_{comp.id}"
                    if trace_key in entity_map:
                        trace_tags = set(get_output_tags(2, entity_map[trace_key][0]))
                        valid_trace_tags = trace_tags.intersection(valid_surface_tags) - assigned_surfaces
                        
                        if valid_trace_tags:
                            group_name = f"terminal_{comp.id}"
                            attr = TERMINAL_START_ATTR + terminal_idx
                            boundary_groups[group_name] = (attr, list(valid_trace_tags))
                            assigned_surfaces.update(valid_trace_tags)
                            logger.info("Assigned %s Terminal '%s' (attr %d) with %d surfaces.", comp.kind.value, group_name, attr, len(valid_trace_tags))
                            terminal_idx += 1

            # Prioritized Group C: PEC Ground Plane - attribute 3
            pec_tags_raw = set()
            
            # Ground plane cutouts output
            if "ground" in entity_map:
                for gr_entity in entity_map["ground"]:
                    pec_tags_raw.update(get_output_tags(2, gr_entity))

            # Intersect with valid exterior surfaces and subtract assigned surfaces
            pec_tags = (pec_tags_raw & valid_surface_tags) - assigned_surfaces
            if pec_tags:
                boundary_groups["pec"] = (PEC_SURFACE_TAG, list(pec_tags))
                assigned_surfaces.update(pec_tags)
                logger.info("Assigned PEC 'pec' (attr %d) with %d surfaces.", PEC_SURFACE_TAG, len(pec_tags))
            else:
                logger.warning("PEC ground plane group contains no unique exterior surfaces!")

            # Prioritized Group D: Absorbing Outer Boundaries (Top, sides, bottom of air box/substrate) - attribute 4
            # Any valid exterior surface that is not yet assigned belongs to the outer boundaries.
            absorbing_tags = valid_surface_tags - assigned_surfaces
            if absorbing_tags:
                boundary_groups["absorbing"] = (ABSORBING_SURFACE_TAG, list(absorbing_tags))
                assigned_surfaces.update(absorbing_tags)
                logger.info("Assigned Absorbing Outer Boundary 'absorbing' (attr %d) with %d surfaces.", ABSORBING_SURFACE_TAG, len(absorbing_tags))
            else:
                logger.warning("No absorbing boundary surfaces detected!")

            # 4. Verify 3D volumes themselves as domain physical groups
            # Air volume is attribute 1, substrate is attribute 2
            boundary_groups["air"] = (1, list(air_vol_tags))
            boundary_groups["substrate"] = (2, list(sub_vol_tags))
            
            logger.info("Boundary classification completed successfully. Total groups: %d", len(boundary_groups))
            return boundary_groups

        except Exception as e:
            logger.exception("Failed to extract or classify boundaries.")
            raise BoundaryDetectionError(f"Failed to extract boundary surfaces: {e}") from e
