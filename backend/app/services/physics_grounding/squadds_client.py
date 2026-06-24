"""
squadds_client.py — SQuADDS dataset client (Increment 2).

Provides a pure-pandas nearest-neighbour + interpolation lookup against a
locally mirrored copy of the SQuADDS dataset (no remote calls at generation
time).  The mirror is populated once by ``ensure_mirror()``.

Dataset used
------------
``qubit-TransmonCross-cap_matrix.json``
    1 934 Ansys-HFSS-simulated (cross_length, claw_length, ground_spacing,
    claw_width) → capacitance matrix entries (fF).  Each entry carries the
    full Qiskit Metal ``design_options`` dict.

Qubit frequency derivation
--------------------------
The dataset stores capacitance-matrix entries, not Hamiltonian parameters
directly.  We estimate:

    C_Σ  ≈ cross_to_cross (fF)           total qubit capacitance
    EC   ≈ e² / (2 C_Σ)                  charging energy (GHz via h)
    EJ   ≈ (f_q + EC)² / (8·EC)          Josephson energy for target f_q

The cap-matrix rows let us find which geometry yields a target EC (i.e.
cross_to_cross value), from which cross_length and claw parameters follow.

Nearest-neighbour search
------------------------
We normalise `cross_to_cross` and `claw_to_claw` (both in fF) so that each
dimension contributes equally, then do a Euclidean nearest-neighbour search
over the normalised space.  Top-K results are linearly interpolated to hit
the target more precisely.

Units
-----
All ``design_options`` values are returned with Qiskit Metal unit suffixes
(``"um"``), matching the format expected by ``SchematicCompiler``.
"""
from __future__ import annotations

import json
import logging
import math
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Physical constants
# ---------------------------------------------------------------------------
_E_CHARGE  = 1.602e-19    # C
_H_PLANCK  = 6.626e-34    # J·s
_F_TO_F    = 1e-15        # fF → F

# ---------------------------------------------------------------------------
# Dataset constants
# ---------------------------------------------------------------------------
_REPO_ID       = "SQuADDS/SQuADDS_DB"
_QC_FNAME      = "qubit-TransmonCross-cap_matrix.json"
_HWC_FNAME     = "qubit_half-wave-cavity_df.parquet"
_DEFAULT_MIRROR = Path(__file__).parent.parent.parent.parent / "squadds_mirror"

# Number of neighbours used for interpolation
_K_NEIGHBOURS = 5


# ---------------------------------------------------------------------------
# Utility: fF capacitance → EC in GHz
# ---------------------------------------------------------------------------
def _cap_to_EC_GHz(cap_fF: float) -> float:
    """Convert total capacitance (fF) to charging energy EC (GHz units)."""
    C = max(cap_fF, 1e-3) * _F_TO_F
    EC_J = (_E_CHARGE ** 2) / (2.0 * C)
    return EC_J / _H_PLANCK / 1e9


def _target_cross_to_cross(f_q_ghz: float, alpha_mhz: float) -> float:
    """
    Given target f_q and alpha, return the cross_to_cross capacitance (fF)
    that yields those parameters.

    For a transmon:
        EC  ≈ -alpha         (alpha is negative, EC > 0)
        So   EC_GHz ≈ |alpha_mhz| / 1000
        C_Σ = e² / (2 · EC)
    """
    if alpha_mhz is None or abs(alpha_mhz) < 1.0:
        alpha_mhz = -340.0  # IBM typical
    EC_GHz = abs(alpha_mhz) / 1000.0
    EC_J = EC_GHz * 1e9 * _H_PLANCK
    C_fF = (_E_CHARGE ** 2) / (2.0 * EC_J) / _F_TO_F
    return C_fF


# ---------------------------------------------------------------------------
# SquaddsRecord — lightweight in-memory record
# ---------------------------------------------------------------------------
class SquaddsRecord:
    """One row from the SQuADDS qubit cap-matrix dataset."""
    __slots__ = ("cross_to_cross", "claw_to_claw", "claw_length_um",
                 "cross_length_um", "ground_spacing_um", "claw_width_um",
                 "design_options")

    def __init__(
        self,
        cross_to_cross: float,
        claw_to_claw: float,
        cross_length_um: float,
        claw_length_um: float,
        ground_spacing_um: float,
        claw_width_um: float,
        design_options: Dict[str, Any],
    ) -> None:
        self.cross_to_cross    = cross_to_cross
        self.claw_to_claw      = claw_to_claw
        self.cross_length_um   = cross_length_um
        self.claw_length_um    = claw_length_um
        self.ground_spacing_um = ground_spacing_um
        self.claw_width_um     = claw_width_um
        self.design_options    = design_options


# ---------------------------------------------------------------------------
# SquaddsClient
# ---------------------------------------------------------------------------
class SquaddsClient:
    """
    Nearest-neighbour lookup against a locally mirrored SQuADDS dataset.

    Usage
    -----
    >>> client = SquaddsClient()
    >>> opts, confidence = client.find_transmon_cross(f_q_ghz=5.0, alpha_mhz=-340.0)
    """

    def __init__(self, mirror_dir: Optional[Path] = None) -> None:
        self._mirror_dir = Path(mirror_dir) if mirror_dir else _DEFAULT_MIRROR
        self._records: Optional[List[SquaddsRecord]] = None
        self._norm_c2c: float = 1.0   # normalisation divisors
        self._norm_c2cl: float = 1.0

    # ------------------------------------------------------------------
    # Mirror management
    # ------------------------------------------------------------------
    def mirror_exists(self) -> bool:
        """Return True if the local mirror has the required dataset file."""
        return (self._mirror_dir / _QC_FNAME).exists()

    def ensure_mirror(self) -> None:
        """Download the dataset to the local mirror if not already present."""
        self._mirror_dir.mkdir(parents=True, exist_ok=True)
        target = self._mirror_dir / _QC_FNAME
        if target.exists():
            log.debug("SQuADDS mirror already present at %s", target)
            return
        log.info("Downloading SQuADDS dataset to %s …", self._mirror_dir)
        try:
            from huggingface_hub import hf_hub_download
            hf_hub_download(
                repo_id=_REPO_ID,
                filename=_QC_FNAME,
                repo_type="dataset",
                local_dir=str(self._mirror_dir),
            )
            log.info("SQuADDS mirror download complete.")
        except Exception as exc:
            raise RuntimeError(
                f"Failed to download SQuADDS dataset: {exc}"
            ) from exc

    # ------------------------------------------------------------------
    # Dataset loading
    # ------------------------------------------------------------------
    def _load(self) -> None:
        if self._records is not None:
            return
        target = self._mirror_dir / _QC_FNAME
        if not target.exists():
            raise FileNotFoundError(
                f"SQuADDS mirror not found at {target}. "
                "Call ensure_mirror() or set squadds_dataset_dir in config."
            )
        t0 = time.monotonic()
        with open(target) as fh:
            raw: List[Dict[str, Any]] = json.load(fh)

        records: List[SquaddsRecord] = []
        for entry in raw:
            sr = entry.get("sim_results", {})
            do_raw = entry.get("design", {}).get("design_options", {})
            if not sr or not do_raw:
                continue

            cross_to_cross = float(sr.get("cross_to_cross", 0.0))
            claw_to_claw   = float(sr.get("claw_to_claw",   0.0))

            def _parse_um(v: Any) -> float:
                if isinstance(v, str):
                    return float(v.replace("um", "").replace("nm", "").strip())
                return float(v)

            cross_length   = _parse_um(do_raw.get("cross_length",  "200um"))
            cp = (do_raw.get("connection_pads") or {}).get("readout") or {}
            claw_length    = _parse_um(cp.get("claw_length",    "100um"))
            ground_spacing = _parse_um(cp.get("ground_spacing", "5um"))
            claw_width     = _parse_um(cp.get("claw_width",     "15um"))

            # Rebuild design_options in canonical Qiskit Metal form
            design_opts = _canonicalize_design_options(do_raw)

            records.append(SquaddsRecord(
                cross_to_cross    = cross_to_cross,
                claw_to_claw      = claw_to_claw,
                cross_length_um   = cross_length,
                claw_length_um    = claw_length,
                ground_spacing_um = ground_spacing,
                claw_width_um     = claw_width,
                design_options    = design_opts,
            ))

        if not records:
            raise ValueError("SQuADDS mirror loaded 0 records — file may be corrupt.")

        self._records = records
        # Compute normalisation divisors from dataset range
        all_c2c  = [r.cross_to_cross for r in records]
        all_c2cl = [r.claw_to_claw   for r in records]
        self._norm_c2c  = max(all_c2c)  - min(all_c2c)  or 1.0
        self._norm_c2cl = max(all_c2cl) - min(all_c2cl) or 1.0

        log.info(
            "SQuADDS client loaded %d records in %.2fs",
            len(records), time.monotonic() - t0,
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def find_transmon_cross(
        self,
        f_q_ghz: Optional[float]  = None,
        alpha_mhz: Optional[float] = None,
    ) -> Tuple[Dict[str, Any], float]:
        """
        Find the best-matching TransmonCross geometry for the given targets.

        Parameters
        ----------
        f_q_ghz   : target qubit frequency (GHz)
        alpha_mhz : target anharmonicity (MHz, negative for transmon)

        Returns
        -------
        (design_options, confidence)
            design_options : Qiskit Metal parameter dict
            confidence     : float 0–1 (1 = exact match in DB)
        """
        self._load()
        assert self._records is not None

        target_c2c = _target_cross_to_cross(
            f_q_ghz   or 5.0,
            alpha_mhz or -340.0,
        )

        # We weight cross_to_cross heavily (it controls qubit freq) and
        # claw_to_claw moderately (it controls g/kappa).
        W_C2C  = 0.7
        W_C2CL = 0.3

        def _dist(r: SquaddsRecord) -> float:
            d1 = (r.cross_to_cross - target_c2c) / self._norm_c2c
            d2 = (r.claw_to_claw   - 0.0)        / self._norm_c2cl
            return math.sqrt(W_C2C * d1*d1 + W_C2CL * d2*d2)

        # Sort by distance, take top-K
        ranked = sorted(self._records, key=_dist)[:_K_NEIGHBOURS]

        # Compute normalised distances for confidence + interpolation weights
        dists = [_dist(r) for r in ranked]
        max_d = max(dists) if dists else 1.0

        if max_d < 1e-9:
            # Exact match
            return ranked[0].design_options, 1.0

        # Inverse-distance weights
        inv = [1.0 / (d + 1e-9) for d in dists]
        total = sum(inv)
        weights = [w / total for w in inv]

        # Interpolate numeric design_options
        interpolated = _interpolate_design_options(
            [r.design_options for r in ranked],
            weights,
        )

        # Confidence: 1 − (distance to nearest / max observed distance)
        # Clamp to [0, 1]
        confidence = max(0.0, min(1.0, 1.0 - dists[0] / (max_d + 1e-9)))

        return interpolated, confidence


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _canonicalize_design_options(raw: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert a raw SQuADDS design_options dict into the canonical Qiskit Metal
    format: string values with unit suffixes (``"um"``).
    """
    def _to_um(v: Any) -> str:
        if isinstance(v, str):
            return v  # already has suffix
        return f"{float(v):.3f}um"

    cp_raw = (raw.get("connection_pads") or {}).get("readout") or {}

    connection_pads: Dict[str, Any] = {
        "connector_type":    cp_raw.get("connector_type", "0"),
        "claw_length":       _to_um(cp_raw.get("claw_length",    "100um")),
        "ground_spacing":    _to_um(cp_raw.get("ground_spacing",  "5um")),
        "claw_width":        _to_um(cp_raw.get("claw_width",      "15um")),
        "claw_gap":          _to_um(cp_raw.get("claw_gap",        "5um")),
        "claw_cpw_length":   _to_um(cp_raw.get("claw_cpw_length", "40um")),
        "claw_cpw_width":    _to_um(cp_raw.get("claw_cpw_width",  "10um")),
        "connector_location": str(cp_raw.get("connector_location", "90")),
    }

    return {
        "cross_width":       _to_um(raw.get("cross_width",  "30um")),
        "cross_length":      _to_um(raw.get("cross_length", "200um")),
        "cross_gap":         _to_um(raw.get("cross_gap",    "30um")),
        "connection_pads":   {"readout": connection_pads},
    }


def _parse_um_value(v: Any) -> Optional[float]:
    """Parse a ``'200um'`` or float into a float (um)."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace("um", "").replace("nm", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def _interpolate_design_options(
    opts_list: List[Dict[str, Any]],
    weights: List[float],
) -> Dict[str, Any]:
    """
    Weighted interpolation of numeric Qiskit Metal design_options fields.
    Connection_pads sub-dict is also interpolated.
    """
    if not opts_list:
        return {}

    result: Dict[str, Any] = {}
    base = opts_list[0]

    for key, base_val in base.items():
        if key == "connection_pads":
            # Recurse into connection_pads.readout
            result["connection_pads"] = {
                "readout": _interpolate_design_options(
                    [
                        (o.get("connection_pads") or {}).get("readout") or {}
                        for o in opts_list
                    ],
                    weights,
                )
            }
            continue

        num = _parse_um_value(base_val)
        if num is None:
            # Non-numeric / non-parseable — keep from best match
            result[key] = base_val
            continue

        interp = 0.0
        for w, o in zip(weights, opts_list):
            v = _parse_um_value(o.get(key, base_val))
            if v is not None:
                interp += w * v

        # Re-attach unit suffix if original had it
        if isinstance(base_val, str) and "um" in base_val:
            result[key] = f"{interp:.3f}um"
        else:
            result[key] = round(interp, 4)

    return result


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
_client: Optional[SquaddsClient] = None


def get_squadds_client(mirror_dir: Optional[Path] = None) -> SquaddsClient:
    """Return the module-level singleton ``SquaddsClient``."""
    global _client
    if _client is None:
        _client = SquaddsClient(mirror_dir=mirror_dir)
    return _client
