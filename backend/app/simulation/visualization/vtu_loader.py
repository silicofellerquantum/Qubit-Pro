"""VTU/mesh file loader with LRU caching to avoid redundant I/O."""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

from app.simulation.visualization.exceptions import UnsupportedFormatError, VTUNotFoundError
from app.simulation.visualization.visualization_models import FieldInfo, FieldType

logger = logging.getLogger(__name__)

# Supported formats
SUPPORTED_EXTENSIONS = {".vtu", ".pvtu", ".pvd", ".vtm", ".msh", ".vtk"}

# Well-known Palace field names and their metadata
FIELD_METADATA: Dict[str, Dict] = {
    # Electric field variants
    "E":       {"units": "V/m",    "description": "Electric field (complex)", "label": "Electric Field"},
    "E_Real":  {"units": "V/m",    "description": "Electric field (real part)", "label": "Electric Field (Re)"},
    "E_Imag":  {"units": "V/m",    "description": "Electric field (imaginary part)", "label": "Electric Field (Im)"},
    "E_mag":   {"units": "V/m",    "description": "Electric field magnitude", "label": "|E|"},
    # Magnetic field variants
    "B":       {"units": "T",      "description": "Magnetic flux density", "label": "Magnetic Field"},
    "B_Real":  {"units": "T",      "description": "Magnetic field (real part)", "label": "Magnetic Field (Re)"},
    "B_Imag":  {"units": "T",      "description": "Magnetic field (imaginary part)", "label": "Magnetic Field (Im)"},
    "B_mag":   {"units": "T",      "description": "Magnetic flux magnitude", "label": "|B|"},
    "H":       {"units": "A/m",    "description": "Magnetic field intensity", "label": "H Field"},
    # Current / potential
    "J":       {"units": "A/m²",   "description": "Current density", "label": "Current Density"},
    "J_Real":  {"units": "A/m²",   "description": "Current density (real part)", "label": "Current Density (Re)"},
    "V":       {"units": "V",      "description": "Electric potential", "label": "Potential"},
    "Phi":     {"units": "V",      "description": "Electric scalar potential", "label": "Potential"},
    # Energy
    "U_e":     {"units": "J/m³",   "description": "Electric energy density", "label": "Electric Energy Density"},
    "U_m":     {"units": "J/m³",   "description": "Magnetic energy density", "label": "Magnetic Energy Density"},
    "S":       {"units": "W/m²",   "description": "Poynting vector magnitude", "label": "Power Flow"},
    # Participation
    "EPR":     {"units": "",       "description": "Energy participation ratio", "label": "EPR"},
    # Material / mesh
    "material_id":   {"units": "",  "description": "Material region identifier", "label": "Material ID"},
    "mesh_quality":  {"units": "",  "description": "Element quality metric", "label": "Mesh Quality"},
}


def _get_mtime(path: Path) -> float:
    """Return file modification time; returns 0 if path doesn't exist."""
    try:
        return os.path.getmtime(path)
    except OSError:
        return 0.0


# ── Private cached loader ─────────────────────────────────────────────────────

@lru_cache(maxsize=32)
def _load_dataset_cached(path_str: str, mtime: float):
    """Cache-keyed by (path, mtime) so stale files are automatically reloaded."""
    import pyvista as pv
    logger.info("Loading VTU dataset from: %s (mtime=%.0f)", path_str, mtime)
    return pv.read(path_str)


# ── Public API ────────────────────────────────────────────────────────────────

def load_dataset(path: Path):
    """Load a VTU/PVTU/PVD/MSH dataset with LRU caching.

    Args:
        path: Path to the file.

    Returns:
        A PyVista DataSet.

    Raises:
        UnsupportedFormatError: If the file extension is not supported.
        FileNotFoundError: If the file does not exist.
    """
    # Check format first — even for non-existent files this is the cleaner error
    if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        raise UnsupportedFormatError(str(path))
    if not path.exists():
        raise FileNotFoundError(f"Dataset file not found: {path}")
    mtime = _get_mtime(path)
    return _load_dataset_cached(str(path), mtime)


def extract_field_info(dataset) -> Tuple[List[FieldInfo], List[FieldInfo]]:
    """Extract FieldInfo for all point and cell arrays in a dataset.

    Returns:
        (point_fields, cell_fields)
    """
    point_fields: List[FieldInfo] = []
    cell_fields: List[FieldInfo] = []

    def _make_field_info(name: str, arr) -> FieldInfo:
        meta = FIELD_METADATA.get(name, {})
        n_components = arr.shape[1] if arr.ndim > 1 else 1
        ftype = FieldType.VECTOR if n_components > 1 else FieldType.SCALAR

        # Compute magnitude for value range on vectors
        if ftype == FieldType.VECTOR:
            magnitudes = np.linalg.norm(arr, axis=1)
            vmin = float(np.nanmin(magnitudes))
            vmax = float(np.nanmax(magnitudes))
        else:
            flat = arr.ravel()
            finite = flat[np.isfinite(flat)]
            vmin = float(np.nanmin(finite)) if len(finite) else 0.0
            vmax = float(np.nanmax(finite)) if len(finite) else 1.0

        return FieldInfo(
            name=name,
            field_type=ftype,
            n_components=n_components,
            value_min=vmin,
            value_max=vmax,
            units=meta.get("units", ""),
            description=meta.get("description", name),
        )

    for name in dataset.point_data.keys():
        try:
            arr = np.asarray(dataset.point_data[name])
            if arr.size == 0:
                continue
            point_fields.append(_make_field_info(name, arr))
        except Exception as exc:
            logger.debug("Could not introspect point array '%s': %s", name, exc)

    for name in dataset.cell_data.keys():
        try:
            arr = np.asarray(dataset.cell_data[name])
            if arr.size == 0:
                continue
            cell_fields.append(_make_field_info(name, arr))
        except Exception as exc:
            logger.debug("Could not introspect cell array '%s': %s", name, exc)

    return point_fields, cell_fields


def find_vtu_files(artifact_dir: Path) -> List[Path]:
    """Scan artifact directory for all VTU/PVTU files, excluding boundary files."""
    results: List[Path] = []

    # Priority: .pvtu > .vtu > .pvd
    for ext in ("*.pvtu", "*.vtu", "*.pvd"):
        found = list(artifact_dir.rglob(ext))
        # Filter out boundary files
        found = [p for p in found if not any("boundary" in part.lower() for part in p.parts)]
        results.extend(sorted(found))

    # Deduplicate while preserving order
    seen = set()
    unique: List[Path] = []
    for p in results:
        key = str(p)
        if key not in seen:
            seen.add(key)
            unique.append(p)

    return unique


def find_mesh_files(artifact_dir: Path) -> List[Path]:
    """Scan artifact directory for all GMSH mesh files."""
    return sorted(artifact_dir.rglob("*.msh"))


def pick_primary_vtu(vtu_files: List[Path]) -> Optional[Path]:
    """Select the best VTU file for initial display.

    Prefers non-boundary parallel datasets, then Mode 1.
    """
    if not vtu_files:
        return None

    # Filter out boundary files first for the primary view
    non_boundary = [p for p in vtu_files if not any("boundary" in part.lower() for part in p.parts)]
    candidates = non_boundary or vtu_files

    # Helper to check if a file is a parallel dataset
    def is_parallel(p: Path) -> bool:
        return p.suffix.lower() == ".pvtu"

    # 1. Prefer parallel Cycle 1 (Mode 1)
    for p in candidates:
        if ("cycle0001" in str(p).lower() or "cycle1" in str(p).lower()) and is_parallel(p):
            return p

    # 2. Prefer any parallel dataset
    for p in candidates:
        if is_parallel(p):
            return p

    # 3. Prefer Cycle 1
    for p in candidates:
        if "cycle0001" in str(p).lower() or "cycle1" in str(p).lower():
            return p

    # 4. Prefer eigenmode over others
    for p in candidates:
        if "eigenmode" in str(p).lower():
            return p

    return candidates[0]


def get_boundary_vtu_path(primary_vtu_path: Path) -> Optional[Path]:
    """Find the corresponding boundary VTU/PVTU file for a given primary volumetric dataset."""
    # Replace solver name directory with solver_name_boundary in the path parts
    parts = list(primary_vtu_path.parts)
    for i in range(len(parts) - 1, -1, -1):
        p_lower = parts[i].lower()
        if p_lower in ("eigenmode", "electrostatic", "driven", "magnetostatic"):
            parts[i] = parts[i] + "_boundary"
            boundary_path = Path(*parts)
            if boundary_path.exists():
                return boundary_path
            break

    # Fallback: search the artifact directory for files containing "boundary" and matching the Cycle folder
    try:
        cycle_dir = primary_vtu_path.parent.name  # e.g., Cycle000001
        # Go up to the paraview output dir
        # E.g., /config/out/paraview/eigenmode/Cycle000001/data.pvtu -> /config/out/paraview
        artifact_dir = primary_vtu_path.parents[2]
        for p in artifact_dir.rglob("*.pvtu"):
            if "boundary" in str(p).lower() and cycle_dir.lower() in str(p).lower():
                return p
        for p in artifact_dir.rglob("*.vtu"):
            if "boundary" in str(p).lower() and cycle_dir.lower() in str(p).lower():
                return p
    except Exception:
        pass

    return None


def get_dataset_bounds(dataset) -> List[float]:
    """Return [xmin, xmax, ymin, ymax, zmin, zmax] bounds of the dataset."""
    b = dataset.bounds
    return [float(v) for v in b]
