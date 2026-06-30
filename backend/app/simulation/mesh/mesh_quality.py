"""Mesh Quality Analyzer using high-performance vectorized NumPy operations."""

from __future__ import annotations

import logging
import numpy as np
import gmsh

from app.simulation.mesh.exceptions import MeshQualityError
from app.simulation.mesh.mesh_models import MeshQualityMetrics

logger = logging.getLogger(__name__)


class MeshQualityAnalyzer:
    """Computes high-fidelity quality metrics on GMSH tetrahedral meshes using vectorized NumPy math."""

    @staticmethod
    def analyze_quality() -> MeshQualityMetrics:
        """Analyze the quality of the current active GMSH 3D tetrahedral mesh.

        Returns:
            A MeshQualityMetrics object containing statistical metrics and histograms.

        Raises:
            MeshQualityError: If no tetrahedral elements exist or calculation fails.
        """
        logger.info("Starting vectorized mesh quality analysis...")
        
        try:
            # 1. Retrieve all mesh nodes
            node_tags, coords, _ = gmsh.model.mesh.getNodes()
            if len(node_tags) == 0:
                raise MeshQualityError("Cannot analyze mesh quality: GMSH model contains no nodes.")
            
            # Map node tags to their 3D coordinates using a fast O(1) NumPy array lookup
            max_node_tag = int(np.max(node_tags))
            node_coords = np.zeros((max_node_tag + 1, 3))
            node_coords[node_tags] = coords.reshape(-1, 3)

            # 2. Retrieve 3D tetrahedral elements (GMSH element type 4)
            elem_types, elem_tags, elem_node_tags = gmsh.model.mesh.getElements(dim=3)
            
            tets_nodes = None
            for e_type, e_nodes in zip(elem_types, elem_node_tags):
                if e_type == 4:  # 4-node tetrahedron
                    tets_nodes = e_nodes.reshape(-1, 4)
                    break
            
            if tets_nodes is None or len(tets_nodes) == 0:
                raise MeshQualityError("GMSH mesh contains no 3D tetrahedral elements (type 4).")

            num_tets = len(tets_nodes)
            logger.info("Analyzing %d tetrahedral elements...", num_tets)

            # 3. Retrieve coordinate matrices for the 4 vertices of each tetrahedron
            # Shapes are (num_tets, 3)
            A = node_coords[tets_nodes[:, 0]]
            B = node_coords[tets_nodes[:, 1]]
            C = node_coords[tets_nodes[:, 2]]
            D = node_coords[tets_nodes[:, 3]]

            # 4. Compute the 6 edge vectors of the tetrahedra
            AB = B - A
            AC = C - A
            AD = D - A
            BC = C - B
            BD = D - B
            CD = D - C

            # 5. Compute edge lengths
            l_AB = np.linalg.norm(AB, axis=1)
            l_AC = np.linalg.norm(AC, axis=1)
            l_AD = np.linalg.norm(AD, axis=1)
            l_BC = np.linalg.norm(BC, axis=1)
            l_BD = np.linalg.norm(BD, axis=1)
            l_CD = np.linalg.norm(CD, axis=1)

            # Accumulate edge lengths to compute min and max
            edges = np.column_stack([l_AB, l_AC, l_AD, l_BC, l_BD, l_CD])
            min_edges = np.min(edges, axis=1)
            max_edges = np.max(edges, axis=1)

            # 6. Compute element volumes: V = 1/6 * |(AB x AC) . AD|
            cross_prod = np.cross(AB, AC)
            volumes = np.abs(np.sum(cross_prod * AD, axis=1)) / 6.0

            # 7. Compute normalized volume-to-edge ratio quality:
            # q = 72 * sqrt(3) * V / (sum(l^2))^1.5
            sum_l_sq = l_AB**2 + l_AC**2 + l_AD**2 + l_BC**2 + l_BD**2 + l_CD**2
            
            # Avoid division by zero for degenerate elements
            sum_l_sq_safe = np.where(sum_l_sq == 0.0, 1e-9, sum_l_sq)
            qualities = (72.0 * np.sqrt(3.0) * volumes) / (sum_l_sq_safe**1.5)
            
            # Cap qualities between 0.0 and 1.0 (numerical precision guard)
            qualities = np.clip(qualities, 0.0, 1.0)

            # 8. Compute aspect ratios: max_edge / min_edge
            min_edges_safe = np.where(min_edges == 0.0, 1e-9, min_edges)
            aspect_ratios = max_edges / min_edges_safe

            # 9. Compute quality histogram (10 uniform bins from 0.0 to 1.0)
            hist_counts, _ = np.histogram(qualities, bins=10, range=(0.0, 1.0))
            quality_histogram = hist_counts.tolist()

            # 10. Package into Pydantic model
            metrics = MeshQualityMetrics(
                element_count=num_tets,
                min_volume=float(np.min(volumes)),
                max_volume=float(np.max(volumes)),
                mean_volume=float(np.mean(volumes)),
                min_aspect_ratio=float(np.min(aspect_ratios)),
                max_aspect_ratio=float(np.max(aspect_ratios)),
                mean_aspect_ratio=float(np.mean(aspect_ratios)),
                min_quality=float(np.min(qualities)),
                max_quality=float(np.max(qualities)),
                mean_quality=float(np.mean(qualities)),
                quality_histogram=quality_histogram,
            )
            
            logger.info(
                "Mesh quality analysis completed: min_qual=%.4f, mean_qual=%.4f, mean_aspect=%.4f",
                metrics.min_quality,
                metrics.mean_quality,
                metrics.mean_aspect_ratio,
            )
            return metrics

        except MeshQualityError:
            raise
        except Exception as e:
            logger.exception("Failed to analyze mesh quality.")
            raise MeshQualityError(f"Failed to analyze GMSH mesh quality: {e}") from e
