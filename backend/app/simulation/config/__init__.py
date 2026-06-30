"""Palace configuration generation subsystem package.

Provides modular services to dynamically map GMSH mesh metadata and design payloads
to type-safe, schema-validated Palace solver JSON configuration structures.
"""

from __future__ import annotations

from app.simulation.config.config_generator import PalaceConfigGenerator
from app.simulation.config.config_models import PalaceConfig
from app.simulation.config.exceptions import (
    ConfigError,
    ConfigGenerationError,
    ConfigValidationError,
)

__all__ = [
    "PalaceConfigGenerator",
    "PalaceConfig",
    "ConfigError",
    "ConfigGenerationError",
    "ConfigValidationError",
]
