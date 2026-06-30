"""Constants for the simulation workspace manager."""

from __future__ import annotations

# Workspace directory names
DIR_CONFIG = "config"
DIR_GEOMETRY = "geometry"
DIR_MESH = "mesh"
DIR_OUTPUT = "output"
DIR_VISUALIZATION = "visualization"
DIR_LOGS = "logs"
DIR_METADATA = "metadata"
DIR_TEMP = "temp"

# List of all required workspace subdirectories
REQUIRED_SUBDIRS = [
    DIR_CONFIG,
    DIR_GEOMETRY,
    DIR_MESH,
    DIR_OUTPUT,
    DIR_VISUALIZATION,
    DIR_LOGS,
    DIR_METADATA,
    DIR_TEMP,
]

# Metadata constants
METADATA_FILENAME = "workspace.json"
WORKSPACE_VERSION = "1.0.0"

# Default cleanup options
DEFAULT_RETENTION_DAYS = 7
DEFAULT_CLEANUP_TIMEOUT_SECONDS = 86400.0  # 24 hours
