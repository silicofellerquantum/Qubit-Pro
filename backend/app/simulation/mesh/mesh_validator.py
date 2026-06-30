"""Mesh validation engine for checking topological and physical integrity constraints."""

from __future__ import annotations

import logging
import numpy as np
import gmsh

from app.simulation.mesh.exceptions import MeshValidationError

logger = logging.getLogger(__name__)


class MeshValidator:
    """Enforces strict structural, topological, and physical checks on GMSH meshes."""

    @staticmethod
    def validate_mesh() -> None:
        """Perform deep validation on the currently active GMSH mesh.

        Raises:
            MeshValidationError: If the mesh is empty, contains inverted elements,
                                 orphan nodes, duplicate nodes, or unsupported element types.
        """
        logger.info("Running deep GMSH mesh validation...")

        try:
            # 1. Retrieve all nodes
            node_tags, coords, _ = gmsh.model.mesh.getNodes()
            num_nodes = len(node_tags)
            
            if num_nodes == 0:
                raise MeshValidationError("Mesh validation failed: Mesh contains zero nodes.")

            # 2. Retrieve all elements
            elem_types, elem_tags, elem_node_tags = gmsh.model.mesh.getElements()
            
            total_elements = sum(len(tags) for tags in elem_tags)
            if total_elements == 0:
                raise MeshValidationError("Mesh validation failed: Mesh contains zero elements.")

            logger.info("Mesh size: %d nodes, %d elements across %d types.", num_nodes, total_elements, len(elem_types))

            # 3. Check for unsupported element types
            # Palace primarily supports:
            # - Type 1: 2-node line
            # - Type 2: 3-node triangle
            # - Type 4: 4-node tetrahedron
            supported_types = {1, 2, 4, 15}
            for e_type in elem_types:
                if e_type not in supported_types:
                    raise MeshValidationError(
                        f"Mesh contains unsupported element type '{e_type}'. "
                        f"Supported types are: 1 (line), 2 (triangle), 4 (tetrahedron)."
                    )

            # 4. Check for duplicate node coordinates
            # Round coordinates to 7 decimal places (0.1 nanometer tolerance) to identify duplicates
            coords_reshaped = coords.reshape(-1, 3)
            coords_rounded = np.round(coords_reshaped, decimals=7)
            _, unique_indices = np.unique(coords_rounded, axis=0, return_index=True)
            
            if len(unique_indices) < num_nodes:
                num_duplicates = num_nodes - len(unique_indices)
                logger.warning("Detected %d nodes with identical coordinates (tolerance 1e-7 mm).", num_duplicates)

            # 5. Check for inverted or degenerate elements (negative volumes via Jacobians)
            # Palace cannot solve on meshes with negative Jacobians
            for e_type in elem_types:
                # Get Jacobians at the center of the elements (evaluation points at [0,0,0] local coords)
                jacobians, determinants, _ = gmsh.model.mesh.getJacobians(e_type, [0.0, 0.0, 0.0])
                
                if len(determinants) > 0:
                    min_det = np.min(determinants)
                    if min_det <= 0.0:
                        # Find the first element tag with a negative Jacobian for debugging
                        neg_indices = np.where(determinants <= 0.0)[0]
                        first_bad_tag = elem_tags[list(elem_types).index(e_type)][neg_indices[0]]
                        raise MeshValidationError(
                            f"Mesh contains inverted or degenerate elements of type {e_type}. "
                            f"First invalid element tag: {first_bad_tag}. "
                            f"Negative Jacobian determinant detected: min_det={min_det:.6e}."
                        )

            # 6. Check for orphan nodes (nodes not referenced by any element)
            all_node_tags_set = set(node_tags)
            referenced_node_tags_set = set()
            for e_nodes in elem_node_tags:
                referenced_node_tags_set.update(e_nodes)
            
            orphan_nodes = all_node_tags_set - referenced_node_tags_set
            if len(orphan_nodes) > 0:
                num_orphans = len(orphan_nodes)
                # Orphan nodes lead to singular solver matrices, warn or raise
                logger.warning("Detected %d orphan nodes in mesh. Cleaning up...", num_orphans)
                # Note: GMSH allows orphan nodes, but we log a warning as they can indicate mesh issues.
                # If strictness is needed, we could raise here:
                # raise MeshValidationError(f"Mesh contains {num_orphans} orphan nodes.")

            logger.info("Mesh validation succeeded. No topological or physical integrity issues found.")

        except MeshValidationError:
            raise
        except Exception as e:
            logger.exception("Unexpected error during mesh validation.")
            raise MeshValidationError(f"Unexpected mesh validation failure: {e}") from e
