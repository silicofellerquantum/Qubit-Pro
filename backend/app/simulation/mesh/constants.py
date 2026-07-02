"""Constants for the simulation mesh generator package."""

from __future__ import annotations

# Standard filenames for exported mesh artifacts
EXPORT_MSH_FILENAME = "mesh.msh"
EXPORT_METADATA_FILENAME = "mesh_metadata.json"
EXPORT_QUALITY_FILENAME = "mesh_quality.json"
EXPORT_LOG_FILENAME = "mesh.log"

# Physical Group attributes and names (Palace compatibility)
AIR_VOLUME_TAG = 1
AIR_VOLUME_NAME = "air"

SUBSTRATE_VOLUME_TAG = 2
SUBSTRATE_VOLUME_NAME = "substrate"

PEC_SURFACE_TAG = 3
PEC_SURFACE_NAME = "pec"

ABSORBING_SURFACE_TAG = 4
ABSORBING_SURFACE_NAME = "absorbing"

# Attributes start boundaries
PORT_START_ATTR = 200
PORT_NAME_PREFIX = "port_"

TERMINAL_START_ATTR = 10
TERMINAL_NAME_PREFIX = "terminal_"

# Dimension constants
DIM_POINT = 0
DIM_LINE = 1
DIM_SURFACE = 2
DIM_VOLUME = 3
