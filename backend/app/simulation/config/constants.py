"""Constants and default settings for the Palace Configuration Generator package."""

from __future__ import annotations

# Standard filenames for exported configuration artifacts
EXPORT_CONFIG_FILENAME = "config.json"
EXPORT_CONFIG_METADATA_FILENAME = "config_metadata.json"

# Material defaults (SI / standard units)
DEFAULT_AIR_PERMITTIVITY = 1.0
DEFAULT_SUBSTRATE_PERMITTIVITY = 11.7  # Silicon default
DEFAULT_SUBSTRATE_LOSS_TANGENT = 1.0e-6
DEFAULT_METAL_CONDUCTIVITY = 3.8e7     # Aluminum default (S/m)

# Solver defaults
DEFAULT_SOLVER_ORDER = 1
DEFAULT_LINEAR_TOLERANCE = 1.0e-8
DEFAULT_LINEAR_MAX_ITS = 100

# Solver-specific defaults
DEFAULT_EIGENMODE_N = 5
DEFAULT_EIGENMODE_TARGET_GHZ = 5.0

# Port and Junction defaults
DEFAULT_JUNCTION_L_NH = 10.0
DEFAULT_JUNCTION_R_OHM = 0.0
DEFAULT_PORT_R_OHM = 50.0  # Transmission line ports default to 50 Ohm
