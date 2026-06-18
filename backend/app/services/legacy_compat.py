"""
legacy_compat.py — Pure utility helpers shared between chip_generator (V1) and
design_pipeline (V2) without creating a circular import.

Rules:
- No imports from chip_generator or design_pipeline.
- Only pure functions; no side effects; no I/O.
"""
from __future__ import annotations


def chip_name(topology: str, n: int) -> str:
    """Return a human-readable chip name for a topology + qubit count."""
    names = {
        "heavy_hex":    "HeavyHex",
        "heavy-hex":    "HeavyHex",
        "ring":         "Ring",
        "chain":        "Linear",
        "line":         "Linear",
        "surface-code": "SurfaceCode",
        "star":         "Star",
        "all-to-all":   "FullyConnected",
        "grid":         "Grid",
    }
    return names.get(topology, "Custom")
