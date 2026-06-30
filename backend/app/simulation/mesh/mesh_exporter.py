"""Mesh Exporter for writing GMSH mesh files, quality metrics, and metadata to the workspace."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict

from app.simulation.workspace.workspace_models import WorkspaceMetadata
from app.simulation.workspace.workspace_utils import write_json_atomic
from app.simulation.mesh.exceptions import MeshExportError
from app.simulation.mesh.mesh_models import MeshMetadata, MeshQualityMetrics
from app.simulation.mesh.constants import (
    EXPORT_MSH_FILENAME,
    EXPORT_METADATA_FILENAME,
    EXPORT_QUALITY_FILENAME,
    EXPORT_LOG_FILENAME,
)

logger = logging.getLogger(__name__)


class MeshExporter:
    """Handles serialization and exporting of mesh assets, quality records, and log archives."""

    @staticmethod
    def export_mesh(
        workspace: WorkspaceMetadata,
        metadata: MeshMetadata,
        quality: MeshQualityMetrics,
        gmsh_log: str,
    ) -> None:
        """Export the mesh and all associated validation and metadata files to the workspace.

        Args:
            workspace: The sandboxed WorkspaceMetadata destination.
            metadata: The compiled MeshMetadata model.
            quality: The calculated MeshQualityMetrics model.
            gmsh_log: Log string containing GMSH output or execution logs.

        Raises:
            MeshExportError: If writing to the workspace fails.
        """
        mesh_dir = Path(workspace.mesh_path)
        logger.info("Exporting mesh artifacts to workspace: %s", mesh_dir)

        try:
            # 1. Write the GMSH .msh file
            # GMSH writes the currently active model to the specified path
            import gmsh
            msh_path = mesh_dir / EXPORT_MSH_FILENAME
            
            try:
                gmsh.write(str(msh_path))
                logger.info("Successfully wrote GMSH mesh file: %s", msh_path)
            except Exception as e:
                raise MeshExportError(f"GMSH failed to write mesh file to '{msh_path}': {e}")

            # 2. Write the mesh metadata JSON (atomic write)
            metadata_path = mesh_dir / EXPORT_METADATA_FILENAME
            write_json_atomic(metadata_path, metadata.model_dump())
            logger.info("Successfully wrote mesh metadata: %s", metadata_path)

            # 3. Write the mesh quality metrics JSON (atomic write)
            quality_path = mesh_dir / EXPORT_QUALITY_FILENAME
            write_json_atomic(quality_path, quality.model_dump())
            logger.info("Successfully wrote mesh quality metrics: %s", quality_path)

            # 4. Write the mesh generation execution log
            log_path = mesh_dir / EXPORT_LOG_FILENAME
            try:
                with open(log_path, "w", encoding="utf-8") as f:
                    f.write(gmsh_log)
                logger.info("Successfully wrote mesh execution log: %s", log_path)
            except Exception as e:
                logger.warning("Failed to write optional mesh log file: %s", e)

            logger.info("Mesh artifacts export completed successfully.")

        except Exception as e:
            logger.error("Failed to export mesh to workspace: %s", e)
            raise MeshExportError(f"Failed to write mesh artifacts: {e}") from e
