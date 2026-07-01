"""Automated validation rules for Palace electromagnetic simulation results."""

from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

def validate_eigenmode_results(
    modes: List[Dict[str, Any]], 
    freq_ceiling_ghz: float = 500.0, 
    epr_floor: float = 1e-6
) -> Dict[str, Any]:
    """Validate parsed eigenmode simulation results.

    Checks:
        (a) Frequencies are strictly ascending.
        (b) Frequencies are below a physical ceiling (e.g. 500 GHz).
        (c) Non-zero EPR values are above a physical floor (e.g. 1e-6).
        (d) Quality factor Q >= 1.0.

    Args:
        modes: List of dicts representing parsed modes.
        freq_ceiling_ghz: Sane frequency ceiling (GHz).
        epr_floor: Sane EPR floor.

    Returns:
        A dict with keys: 'is_valid' (bool), 'errors' (list of str), 'warnings' (list of str).
    """
    errors = []
    warnings = []

    if not modes:
        warnings.append("No modes found to validate.")
        return {"is_valid": True, "errors": errors, "warnings": warnings}

    prev_freq = -1.0
    for idx, mode in enumerate(modes):
        mode_idx = mode.get("mode_index", idx + 1)
        freq = mode.get("frequency_ghz", 0.0)
        q = mode.get("quality_factor", 0.0)
        epr = mode.get("epr", {})

        # (a) Frequencies strictly ascending
        if freq <= prev_freq:
            errors.append(
                f"Frequency sort violation: Mode #{mode_idx} ({freq:.6f} GHz) is not strictly greater than "
                f"previous mode ({prev_freq:.6f} GHz)."
            )
        prev_freq = freq

        # (b) No mode exceeds a sane frequency ceiling
        if freq > freq_ceiling_ghz:
            warnings.append(
                f"Spurious high-frequency mode detected: Mode #{mode_idx} is at {freq:.3f} GHz "
                f"(exceeds physical ceiling of {freq_ceiling_ghz} GHz)."
            )

        # (c) No EPR value is below a physical floor (non-zero underflow)
        for element, val in epr.items():
            if val != 0.0 and abs(val) < epr_floor:
                warnings.append(
                    f"EPR underflow detected: Mode #{mode_idx} element '{element}' has EPR value "
                    f"{val:.2e} which is below the physical floor of {epr_floor:.1e}."
                )

        # (d) Flags any Q < 1
        if q < 1.0:
            warnings.append(
                f"Low quality factor detected: Mode #{mode_idx} has Q = {q:.3f} (Q < 1.0 indicating high radiation/numerical leak)."
            )

    is_valid = len(errors) == 0
    return {
        "is_valid": is_valid,
        "errors": errors,
        "warnings": warnings
    }
