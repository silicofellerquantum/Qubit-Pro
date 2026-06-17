"""AWS Palace EM Simulation backend integration package.

Exposes geometry extraction, configuration generation, solver runner, result parsing,
and Pydantic adapters to interface with the downstream Physics Analysis Pipeline.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Add the physics analysis engine to the sys.path dynamically
_PHYSICS_SRC = str(Path(__file__).resolve().parents[3] / "physics_analysis" / "src")
if _PHYSICS_SRC not in sys.path:
    sys.path.insert(0, _PHYSICS_SRC)

from app.services.palace.exceptions import (
    PalaceError,
    GeometryError,
    ConfigGeneratorError,
    PalaceRunnerError,
    ResultParserError,
    AdapterError,
)
from app.services.palace.models import (
    PalaceSolverType,
    GeometryElementKind,
    GeometryElement,
    EMGeometry,
    PalaceEigenmodeMode,
    PalaceEigenmodeOutput,
    PalaceElectrostaticOutput,
    PalaceSimulationOutput,
)
from app.services.palace.geometry_builder import GeometryBuilder
from app.services.palace.config_generator import ConfigGenerator
from app.services.palace.palace_runner import PalaceRunner
from app.services.palace.result_parser import ResultParser
from app.services.palace.em_adapter import EMAdapter

__all__ = [
    # Exceptions
    "PalaceError",
    "GeometryError",
    "ConfigGeneratorError",
    "PalaceRunnerError",
    "ResultParserError",
    "AdapterError",
    # Models
    "PalaceSolverType",
    "GeometryElementKind",
    "GeometryElement",
    "EMGeometry",
    "PalaceEigenmodeMode",
    "PalaceEigenmodeOutput",
    "PalaceElectrostaticOutput",
    "PalaceSimulationOutput",
    # Core Classes
    "GeometryBuilder",
    "ConfigGenerator",
    "PalaceRunner",
    "ResultParser",
    "EMAdapter",
]
