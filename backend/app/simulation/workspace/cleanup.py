"""Automated cleanup service for expired simulation workspaces."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from app.config import settings
from app.simulation.workspace.types import WorkspaceState
from app.simulation.workspace.workspace_manager import WorkspaceManager

logger = logging.getLogger(__name__)


def cleanup_expired_workspaces(
    manager: Optional[WorkspaceManager] = None, 
    force: bool = False
) -> int:
    """Scan the workspace root, identify expired workspaces, and clean them up securely.

    This utility parses workspace expiration times (`cleanup_after`) and executes cleanups,
    skipping any workspaces that are actively `IN_USE` unless the `force` flag is set.

    Args:
        manager: Optional WorkspaceManager instance. If None, a new one is created.
        force: If True, clean up workspaces even if their state is 'IN_USE' or 'CREATED'.

    Returns:
        The number of successfully cleaned up (archived or deleted) workspaces.
    """
    mgr = manager or WorkspaceManager()
    logger.info("Starting sweep for expired simulation workspaces...")

    now_dt = datetime.utcnow()
    cleaned_count = 0
    workspaces = mgr.list_workspaces()

    for ws in workspaces:
        # Skip workspaces that have already been cleaned up or archived
        if ws.status in (WorkspaceState.CLEANED, WorkspaceState.ARCHIVED):
            continue

        # Check if the workspace has an expiration time set
        if not ws.cleanup_after:
            continue

        try:
            # Parse ISO 8601 string (strip trailing 'Z' if present for datetime parsing)
            clean_time_str = ws.cleanup_after.rstrip("Z")
            expire_dt = datetime.fromisoformat(clean_time_str)
        except ValueError as e:
            logger.warning(
                "Invalid expiration timestamp format '%s' in workspace %s: %s",
                ws.cleanup_after,
                ws.workspace_id,
                e,
            )
            continue

        # Check if the workspace has expired
        if now_dt >= expire_dt:
            # Safeguard: Do not delete active simulations unless forced
            if ws.status == WorkspaceState.IN_USE and not force:
                logger.info(
                    "Workspace %s is expired but currently marked IN_USE. Skipping cleanup.",
                    ws.workspace_id,
                )
                continue

            logger.info("Workspace %s has expired (expired at: %s). Cleaning up...", ws.workspace_id, ws.cleanup_after)
            
            try:
                # Retrieve simulation ID from workspace ID or metadata
                sim_id = ws.simulation_id
                
                # Determine cleanup strategy based on settings
                if settings.keep_simulation_artifacts:
                    logger.info("Archiving expired workspace: %s", ws.workspace_id)
                    mgr.archive_workspace(sim_id)
                else:
                    logger.info("Deleting expired workspace: %s", ws.workspace_id)
                    mgr.delete_workspace(sim_id)
                    
                cleaned_count += 1
            except Exception as e:
                logger.error("Failed to clean up expired workspace %s: %s", ws.workspace_id, e)

    logger.info("Sweep complete. Cleaned up %d expired workspace(s).", cleaned_count)
    return cleaned_count
