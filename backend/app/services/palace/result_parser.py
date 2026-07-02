"""
Palace result parser — Phase 0 rewrite.

Parses all real AWS-Palace output files with correct headers:
  eig.csv          : m, Re{f} (GHz), Im{f} (GHz), Q, Error (Bkwd.), Error (Abs.)
  port-EPR.csv     : m, p[1] … p[N]   (mapped to port names via config_metadata)
  terminal-C.csv   : i, C[i][1] (F) … C[i][N] (F)   (terminal names from config_metadata)
  terminal-Cm.csv  : same shape as terminal-C.csv
  terminal-Cinv.csv: same shape
  terminal-V.csv   : i, V_inc[1] (V) … V_inc[N] (V)
  port-V.csv       : m, Re{V[1]} (V), Im{V[1]} (V), …
  port-I.csv       : m, Re{I[1]} (A), Im{I[1]} (A), …
  domain-E.csv     : m, E_elec (J), E_mag (J), E_cap (J), E_ind (J)
  error-indicators.csv : Norm, Minimum, Maximum, Mean  (single data row)
  palace.json      : ElapsedTime, LinearSolver, PeakMemory, Problem
  runner_metadata.json : execution_id, status, duration_seconds, …
  config.json      : full Palace solver config
  config_metadata.json : mapped_boundaries (ports + terminals)
  mesh_metadata.json   : node/element counts, bounding box, physical_groups
  mesh_quality.json    : quality statistics + histogram
"""

from __future__ import annotations

import csv
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

from app.services.palace.exceptions import ResultParsingError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Physical-mode classifier (matches Palace summary.txt logic)
# ---------------------------------------------------------------------------
PHYSICAL_MODE_FREQ_LIMIT_GHZ = 50.0
PHYSICAL_MODE_Q_MIN = 5.0


def classify_mode(freq_re_ghz: float, q: float) -> bool:
    """Return True if the mode is physical (not spurious)."""
    return freq_re_ghz < PHYSICAL_MODE_FREQ_LIMIT_GHZ and q > PHYSICAL_MODE_Q_MIN


# ---------------------------------------------------------------------------
# Pydantic result models
# ---------------------------------------------------------------------------

class ParsedEigenmode(BaseModel):
    mode_index: int
    freq_re_ghz: float
    freq_im_ghz: float = 0.0
    quality_factor: float
    error_bkwd: float = 0.0
    error_abs: float = 0.0
    is_physical: bool = False
    # per-junction EPR: {port_name: participation_ratio}
    epr: Dict[str, float] = Field(default_factory=dict)
    # per-port complex voltage: {port_name: (re, im)}
    port_voltages: Dict[str, Tuple[float, float]] = Field(default_factory=dict)
    # per-port complex current: {port_name: (re, im)}
    port_currents: Dict[str, Tuple[float, float]] = Field(default_factory=dict)
    # domain energies (J)
    E_elec_J: Optional[float] = None
    E_mag_J: Optional[float] = None
    E_cap_J: Optional[float] = None
    E_ind_J: Optional[float] = None

    # legacy alias kept for callers that still read .frequency_ghz / .epr as dict
    @property
    def frequency_ghz(self) -> float:
        return self.freq_re_ghz


class ParsedCapacitance(BaseModel):
    """N×N capacitance / Maxwell / elastance matrix."""
    terminal_names: List[str]           # human-readable names from config_metadata
    matrix_F: List[List[float]]         # values in Farads (as-parsed)


class ParsedElectrostatic(BaseModel):
    """All three capacitance representations + terminal incident voltages."""
    terminal_names: List[str]
    C: Optional[ParsedCapacitance] = None      # terminal-C.csv  (short-circuit C)
    Cm: Optional[ParsedCapacitance] = None     # terminal-Cm.csv (Maxwell partial)
    Cinv: Optional[ParsedCapacitance] = None   # terminal-Cinv.csv (elastance 1/F)
    V_inc: Dict[str, float] = Field(default_factory=dict)  # terminal-V.csv


class ParsedErrorIndicators(BaseModel):
    norm: float = 0.0
    minimum: float = 0.0
    maximum: float = 0.0
    mean: float = 0.0


class ParsedMeshQuality(BaseModel):
    node_count: int = 0
    element_count: int = 0
    tet_count: int = 0
    triangle_count: int = 0
    line_count: int = 0
    mesh_dimension: int = 3
    bounding_box: Dict[str, Any] = Field(default_factory=dict)
    physical_groups: List[Dict[str, Any]] = Field(default_factory=list)
    min_aspect_ratio: float = 0.0
    max_aspect_ratio: float = 0.0
    mean_aspect_ratio: float = 0.0
    min_quality: float = 0.0
    max_quality: float = 0.0
    mean_quality: float = 0.0
    quality_histogram: List[float] = Field(default_factory=list)


class ParsedRunnerMetadata(BaseModel):
    execution_id: str = ""
    workspace_id: str = ""
    runner_version: str = ""
    palace_version: str = ""
    mpi_version: str = ""
    start_time: str = ""
    end_time: str = ""
    duration_seconds: float = 0.0
    exit_code: int = 0
    termination_reason: str = ""
    command: str = ""
    processor_count: int = 0
    mpi_ranks: int = 0
    status: str = ""


class ParsedPalacePerf(BaseModel):
    """Subset of palace.json: timings, memory, solver stats, DOF."""
    elapsed_total_s: float = 0.0
    elapsed_solve_s: float = 0.0
    elapsed_construction_s: float = 0.0
    linear_solver_total_its: int = 0
    linear_solver_total_solves: int = 0
    peak_memory_mb_max: float = 0.0
    peak_memory_mb_avg: float = 0.0
    degrees_of_freedom: int = 0
    mesh_elements: int = 0
    mpi_size: int = 0
    raw: Dict[str, Any] = Field(default_factory=dict)


class ParsedSolverConfig(BaseModel):
    """Relevant fields from config.json."""
    problem_type: str = ""
    mesh_path: str = ""
    model_L0: float = 1e-3
    solver_order: int = 1
    linear_type: str = ""
    linear_tol: float = 1e-6
    linear_max_its: int = 100
    eigenmode_n: int = 0
    eigenmode_target_hz: float = 0.0
    eigenmode_save: int = 0
    pec_attributes: List[int] = Field(default_factory=list)
    absorbing_attributes: List[int] = Field(default_factory=list)
    absorbing_order: int = 1
    lumped_ports: List[Dict[str, Any]] = Field(default_factory=list)
    materials: List[Dict[str, Any]] = Field(default_factory=list)
    raw: Dict[str, Any] = Field(default_factory=dict)


class ParsedBoundaryMap(BaseModel):
    """config_metadata.json boundary mapping."""
    ports: Dict[str, int] = Field(default_factory=dict)       # port_name -> attribute id
    terminals: Dict[str, int] = Field(default_factory=dict)   # terminal_name -> attribute id
    mapped_materials: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = ""
    raw: Dict[str, Any] = Field(default_factory=dict)


class PalaceSimulationOutputs(BaseModel):
    """
    Full parsed outputs for one Palace run directory.
    Covers both eigenmode and electrostatic solver types.
    """
    # ── solver type ─────────────────────────────────────────────────────────
    solver_type: str = ""                       # "eigenmode" | "electrostatic"

    # ── eigenmode results ────────────────────────────────────────────────────
    eigenmodes: List[ParsedEigenmode] = Field(default_factory=list)
    physical_mode_count: int = 0
    spurious_mode_count: int = 0

    # ── electrostatic results ────────────────────────────────────────────────
    electrostatic: Optional[ParsedElectrostatic] = None

    # ── shared per-run metadata ──────────────────────────────────────────────
    error_indicators: Optional[ParsedErrorIndicators] = None
    mesh: Optional[ParsedMeshQuality] = None
    runner: Optional[ParsedRunnerMetadata] = None
    perf: Optional[ParsedPalacePerf] = None
    solver_config: Optional[ParsedSolverConfig] = None
    boundary_map: Optional[ParsedBoundaryMap] = None

    # ── legacy compat fields (kept so existing callers don't break) ──────────
    @property
    def capacitance(self) -> Optional[ParsedCapacitance]:
        return self.electrostatic.C if self.electrostatic else None

    inductances: List[Any] = Field(default_factory=list)   # not used by Palace


# ---------------------------------------------------------------------------
# CSV helpers
# ---------------------------------------------------------------------------

def _read_csv_rows(path: Path) -> Tuple[List[str], List[List[str]]]:
    """Return (headers, data_rows) skipping blank/comment lines."""
    with open(path, encoding="utf-8") as f:
        reader = csv.reader(f)
        headers: List[str] = []
        rows: List[List[str]] = []
        for raw in reader:
            stripped = [c.strip() for c in raw]
            if not stripped or all(c == "" for c in stripped):
                continue
            if stripped[0].startswith("%") or stripped[0].startswith("#"):
                continue
            if not headers:
                headers = stripped
            else:
                rows.append(stripped)
    return headers, rows


def _col(headers: List[str], *candidates: str, optional: bool = False) -> Optional[int]:
    """
    Case-insensitive column index finder.
    Tries each candidate as a substring of each header.
    Returns None when optional=True and nothing matches; raises otherwise.
    """
    hl = [h.lower() for h in headers]
    for cand in candidates:
        cl = cand.lower()
        for i, h in enumerate(hl):
            if cl in h:
                return i
    if optional:
        return None
    raise ResultParsingError(
        f"Could not find column matching {list(candidates)} in headers: {headers}"
    )


# ---------------------------------------------------------------------------
# PalaceResultParser
# ---------------------------------------------------------------------------

class PalaceResultParser:
    """
    Parses all AWS-Palace output files from a run directory.

    Typical usage (from a full run folder root):
        parser = PalaceResultParser()
        outputs = parser.parse_run(run_dir)

    Individual parsers are also public for unit-testing.
    """

    # ── top-level entry point ────────────────────────────────────────────────

    def parse_run(self, run_dir: Path) -> PalaceSimulationOutputs:
        """
        Parse everything under *run_dir*.

        Expected layout:
            run_dir/
              config/
                config.json
                config_metadata.json
                out/
                  eig.csv, port-EPR.csv, port-V.csv, port-I.csv,
                  domain-E.csv, error-indicators.csv,
                  terminal-C.csv, terminal-Cm.csv, terminal-Cinv.csv,
                  terminal-V.csv, palace.json
              mesh/
                mesh_metadata.json
                mesh_quality.json
              logs/
                runner_metadata.json
        """
        out_dir  = run_dir / "config" / "out"
        cfg_dir  = run_dir / "config"
        mesh_dir = run_dir / "mesh"
        logs_dir = run_dir / "logs"

        # 1. Boundary map & solver config (needed for name resolution)
        boundary_map   = self.parse_boundary_map(cfg_dir / "config_metadata.json")
        solver_config  = self.parse_solver_config(cfg_dir / "config.json")

        # 2. Determine solver type
        solver_type = solver_config.problem_type.lower() if solver_config else ""

        # 3. Metadata
        runner = self.parse_runner_metadata(logs_dir / "runner_metadata.json")
        perf   = self.parse_palace_perf(out_dir / "palace.json")
        mesh   = self.parse_mesh(mesh_dir / "mesh_metadata.json",
                                 mesh_dir / "mesh_quality.json")
        error_indicators = self.parse_error_indicators(out_dir / "error-indicators.csv")

        outputs = PalaceSimulationOutputs(
            solver_type=solver_type,
            runner=runner,
            perf=perf,
            mesh=mesh,
            error_indicators=error_indicators,
            solver_config=solver_config,
            boundary_map=boundary_map,
        )

        if solver_type == "eigenmode":
            eigenmodes = self.parse_eigenmodes(
                eig_csv=out_dir / "eig.csv",
                epr_csv=out_dir / "port-EPR.csv",
                port_v_csv=out_dir / "port-V.csv",
                port_i_csv=out_dir / "port-I.csv",
                domain_e_csv=out_dir / "domain-E.csv",
                boundary_map=boundary_map,
                solver_config=solver_config,
            )
            outputs.eigenmodes = eigenmodes
            outputs.physical_mode_count = sum(1 for m in eigenmodes if m.is_physical)
            outputs.spurious_mode_count = sum(1 for m in eigenmodes if not m.is_physical)

        elif solver_type == "electrostatic":
            outputs.electrostatic = self.parse_electrostatic(
                out_dir=out_dir,
                boundary_map=boundary_map,
            )

        return outputs

    # ── eigenmode CSV parsers ─────────────────────────────────────────────────

    def parse_eigenmodes(
        self,
        eig_csv: Path,
        epr_csv: Optional[Path] = None,
        port_v_csv: Optional[Path] = None,
        port_i_csv: Optional[Path] = None,
        domain_e_csv: Optional[Path] = None,
        boundary_map: Optional[ParsedBoundaryMap] = None,
        solver_config: Optional[ParsedSolverConfig] = None,
    ) -> List[ParsedEigenmode]:
        """
        Parse all eigenmode output CSVs and merge into a list of ParsedEigenmode.
        Safe to call when files are absent — returns [] for missing eig.csv,
        skips optional files silently.
        """
        if not eig_csv.exists():
            logger.info("eig.csv not found at %s — returning empty mode list", eig_csv)
            return []

        modes: Dict[int, ParsedEigenmode] = {}

        # --- eig.csv ---
        try:
            modes = self._parse_eig_csv(eig_csv)
        except Exception as exc:
            raise ResultParsingError(f"Failed to parse {eig_csv}: {exc}") from exc

        # --- port-EPR.csv ---
        if epr_csv and epr_csv.exists():
            try:
                self._merge_epr(modes, epr_csv, boundary_map, solver_config)
            except Exception as exc:
                logger.warning("EPR parse failed (continuing without EPR): %s", exc)

        # --- port-V.csv ---
        if port_v_csv and port_v_csv.exists():
            try:
                self._merge_port_complex(modes, port_v_csv, "voltages",
                                         boundary_map, solver_config)
            except Exception as exc:
                logger.warning("port-V parse failed: %s", exc)

        # --- port-I.csv ---
        if port_i_csv and port_i_csv.exists():
            try:
                self._merge_port_complex(modes, port_i_csv, "currents",
                                         boundary_map, solver_config)
            except Exception as exc:
                logger.warning("port-I parse failed: %s", exc)

        # --- domain-E.csv ---
        if domain_e_csv and domain_e_csv.exists():
            try:
                self._merge_domain_e(modes, domain_e_csv)
            except Exception as exc:
                logger.warning("domain-E parse failed: %s", exc)

        return list(modes.values())

    def _parse_eig_csv(self, path: Path) -> Dict[int, ParsedEigenmode]:
        """
        Real Palace eig.csv headers:
          m, Re{f} (GHz), Im{f} (GHz), Q, Error (Bkwd.), Error (Abs.)
        """
        headers, rows = _read_csv_rows(path)

        i_m    = _col(headers, "m")
        i_re   = _col(headers, "re{f}", "re{f} (ghz)", "re{f}(ghz)")
        i_im   = _col(headers, "im{f}", "im{f} (ghz)", "im{f}(ghz)", optional=True)
        i_q    = _col(headers, "q", optional=True)
        i_ebk  = _col(headers, "error (bkwd", "bkwd", optional=True)
        i_eabs = _col(headers, "error (abs", "abs.)", optional=True)

        modes: Dict[int, ParsedEigenmode] = {}
        for row in rows:
            if len(row) <= i_m:
                continue
            try:
                m      = int(float(row[i_m]))
                f_re   = float(row[i_re])
                f_im   = float(row[i_im])   if i_im   is not None and i_im   < len(row) else 0.0
                q      = float(row[i_q])    if i_q    is not None and i_q    < len(row) else 0.0
                e_bk   = float(row[i_ebk])  if i_ebk  is not None and i_ebk  < len(row) else 0.0
                e_abs  = float(row[i_eabs]) if i_eabs is not None and i_eabs < len(row) else 0.0
                modes[m] = ParsedEigenmode(
                    mode_index=m,
                    freq_re_ghz=f_re,
                    freq_im_ghz=f_im,
                    quality_factor=q,
                    error_bkwd=e_bk,
                    error_abs=e_abs,
                    is_physical=classify_mode(f_re, q),
                )
            except (ValueError, IndexError) as exc:
                logger.debug("Skipping malformed eig.csv row %s: %s", row, exc)

        return modes

    def _resolve_port_names(
        self,
        n_ports: int,
        boundary_map: Optional[ParsedBoundaryMap],
        solver_config: Optional[ParsedSolverConfig],
    ) -> List[str]:
        """
        Build an ordered list of port names for p[1]…p[N].

        Priority:
          1. LumpedPort array in solver_config (ordered by Index field).
          2. boundary_map.ports (dict, sorted by attribute id value).
          3. Fallback: "port_1", "port_2", …
        """
        if solver_config and solver_config.lumped_ports:
            sorted_ports = sorted(solver_config.lumped_ports,
                                  key=lambda p: p.get("Index", 0))
            names = [str(p.get("Index", i + 1)) for i, p in enumerate(sorted_ports)]
            # prefer human-readable names from boundary_map if available
            if boundary_map and boundary_map.ports:
                attr_to_name = {v: k for k, v in boundary_map.ports.items()}
                resolved = []
                for lp in sorted_ports:
                    attrs = lp.get("Attributes", [])
                    if isinstance(attrs, list) and attrs:
                        name = attr_to_name.get(attrs[0], str(lp.get("Index", "")))
                    else:
                        name = str(lp.get("Index", ""))
                    resolved.append(name)
                names = resolved
            return names[:n_ports]

        if boundary_map and boundary_map.ports:
            ordered = sorted(boundary_map.ports.items(), key=lambda kv: kv[1])
            return [k for k, _ in ordered][:n_ports]

        return [f"port_{i + 1}" for i in range(n_ports)]

    def _merge_epr(
        self,
        modes: Dict[int, ParsedEigenmode],
        path: Path,
        boundary_map: Optional[ParsedBoundaryMap],
        solver_config: Optional[ParsedSolverConfig],
    ) -> None:
        """
        Real Palace port-EPR.csv headers:
          m, p[1], p[2], … p[N]
        Map p[n] → junction port name using _resolve_port_names.
        """
        headers, rows = _read_csv_rows(path)
        i_m = _col(headers, "m")

        # Collect p[n] column indices in order
        epr_cols: List[Tuple[int, str]] = []
        raw_p_headers = [(i, h) for i, h in enumerate(headers)
                         if i != i_m and h.lower().startswith("p[")]
        # Sort by numeric index inside p[...]
        def _p_idx(h: str) -> int:
            try:
                return int(h.strip().lower().lstrip("p[").rstrip("]"))
            except ValueError:
                return 0
        raw_p_headers.sort(key=lambda t: _p_idx(t[1]))

        n_ports = len(raw_p_headers)
        port_names = self._resolve_port_names(n_ports, boundary_map, solver_config)

        for col_i, _ in raw_p_headers:
            name_idx = len(epr_cols)
            port_name = port_names[name_idx] if name_idx < len(port_names) else f"p_{name_idx+1}"
            epr_cols.append((col_i, port_name))

        for row in rows:
            try:
                m = int(float(row[i_m]))
                if m not in modes:
                    continue
                epr_dict: Dict[str, float] = {}
                for col_i, pname in epr_cols:
                    if col_i < len(row):
                        epr_dict[pname] = float(row[col_i])
                modes[m].epr = epr_dict
            except (ValueError, IndexError) as exc:
                logger.debug("Skipping EPR row %s: %s", row, exc)

    def _merge_port_complex(
        self,
        modes: Dict[int, ParsedEigenmode],
        path: Path,
        field: str,                          # "voltages" or "currents"
        boundary_map: Optional[ParsedBoundaryMap],
        solver_config: Optional[ParsedSolverConfig],
    ) -> None:
        """
        Parse port-V.csv or port-I.csv.

        Real Palace headers:
          m, Re{V[1]} (V), Im{V[1]} (V), Re{V[2]} (V), Im{V[2]} (V), …
          m, Re{I[1]} (A), Im{I[1]} (A), Re{I[2]} (A), Im{I[2]} (A), …

        Groups Re/Im pairs by port index; maps to port names via
        _resolve_port_names.
        """
        headers, rows = _read_csv_rows(path)
        i_m = _col(headers, "m")

        # Detect which quantity label: V or I
        qty = "v" if field == "voltages" else "i"

        # Find Re/Im pairs for each port index
        import re as _re
        pair_pattern = _re.compile(
            rf"re\{{{qty}\[(\d+)\]|im\{{{qty}\[(\d+)\]",
            _re.IGNORECASE
        )
        # Map port_number -> (re_col_idx, im_col_idx)
        port_pairs: Dict[int, List[Optional[int]]] = {}
        for ci, h in enumerate(headers):
            if ci == i_m:
                continue
            hl = h.lower()
            # match "re{v[1]" or "re{i[2]" etc.
            m_re = _re.search(rf"re\{{{qty}\[(\d+)\]", hl)
            m_im = _re.search(rf"im\{{{qty}\[(\d+)\]", hl)
            if m_re:
                pn = int(m_re.group(1))
                port_pairs.setdefault(pn, [None, None])[0] = ci
            elif m_im:
                pn = int(m_im.group(1))
                port_pairs.setdefault(pn, [None, None])[1] = ci

        sorted_ports = sorted(port_pairs.keys())
        n_ports = len(sorted_ports)
        port_names = self._resolve_port_names(n_ports, boundary_map, solver_config)
        pn_map = {pnum: port_names[i] if i < len(port_names) else f"port_{pnum}"
                  for i, pnum in enumerate(sorted_ports)}

        for row in rows:
            try:
                m = int(float(row[i_m]))
                if m not in modes:
                    continue
                result: Dict[str, Tuple[float, float]] = {}
                for pnum, (re_ci, im_ci) in port_pairs.items():
                    re_v = float(row[re_ci]) if re_ci is not None and re_ci < len(row) else 0.0
                    im_v = float(row[im_ci]) if im_ci is not None and im_ci < len(row) else 0.0
                    result[pn_map[pnum]] = (re_v, im_v)
                if field == "voltages":
                    modes[m].port_voltages = result
                else:
                    modes[m].port_currents = result
            except (ValueError, IndexError) as exc:
                logger.debug("Skipping port-%s row %s: %s", qty.upper(), row, exc)

    def _merge_domain_e(
        self, modes: Dict[int, ParsedEigenmode], path: Path
    ) -> None:
        """
        Real Palace domain-E.csv headers:
          m, E_elec (J), E_mag (J), E_cap (J), E_ind (J)
        """
        headers, rows = _read_csv_rows(path)
        i_m    = _col(headers, "m")
        i_elec = _col(headers, "e_elec", "elec", optional=True)
        i_mag  = _col(headers, "e_mag",  "mag",  optional=True)
        i_cap  = _col(headers, "e_cap",  "cap",  optional=True)
        i_ind  = _col(headers, "e_ind",  "ind",  optional=True)

        for row in rows:
            try:
                m = int(float(row[i_m]))
                if m not in modes:
                    continue
                def _get(idx: Optional[int]) -> Optional[float]:
                    return float(row[idx]) if idx is not None and idx < len(row) else None
                modes[m].E_elec_J = _get(i_elec)
                modes[m].E_mag_J  = _get(i_mag)
                modes[m].E_cap_J  = _get(i_cap)
                modes[m].E_ind_J  = _get(i_ind)
            except (ValueError, IndexError) as exc:
                logger.debug("Skipping domain-E row %s: %s", row, exc)

    # ── electrostatic parsers ─────────────────────────────────────────────────

    def parse_electrostatic(
        self,
        out_dir: Path,
        boundary_map: Optional[ParsedBoundaryMap] = None,
    ) -> ParsedElectrostatic:
        """Parse all electrostatic output CSVs from out_dir."""
        terminal_names = self._resolve_terminal_names(out_dir, boundary_map)

        return ParsedElectrostatic(
            terminal_names=terminal_names,
            C=self._parse_cap_matrix(out_dir / "terminal-C.csv", terminal_names),
            Cm=self._parse_cap_matrix(out_dir / "terminal-Cm.csv", terminal_names),
            Cinv=self._parse_cap_matrix(out_dir / "terminal-Cinv.csv", terminal_names),
            V_inc=self._parse_terminal_V(out_dir / "terminal-V.csv", terminal_names),
        )

    def _resolve_terminal_names(
        self,
        out_dir: Path,
        boundary_map: Optional[ParsedBoundaryMap],
    ) -> List[str]:
        """
        Determine terminal names from config_metadata.json terminal mapping.
        Real Palace terminal-C.csv has numeric row index (i), NOT terminal names.
        Names must come from boundary_map.terminals, sorted by attribute id.
        Fallback: detect N from the CSV header and use "terminal_1", "terminal_2", …
        """
        if boundary_map and boundary_map.terminals:
            ordered = sorted(boundary_map.terminals.items(), key=lambda kv: kv[1])
            return [k for k, _ in ordered]

        # Fallback: count columns from CSV
        cap_csv = out_dir / "terminal-C.csv"
        if cap_csv.exists():
            headers, _ = _read_csv_rows(cap_csv)
            # headers: i, C[i][1] (F), C[i][2] (F), …
            n = sum(1 for h in headers if h.lower().startswith("c[i]["))
            if n:
                return [f"terminal_{k + 1}" for k in range(n)]
        return []

    def _parse_cap_matrix(
        self,
        path: Path,
        terminal_names: List[str],
    ) -> Optional[ParsedCapacitance]:
        """
        Real Palace terminal-C.csv / terminal-Cm.csv / terminal-Cinv.csv:
          i, C[i][1] (F), C[i][2] (F), …, C[i][N] (F)

        Row index i in column 0 is numeric; values are Farads.
        terminal_names must be supplied (comes from config_metadata.json).
        """
        if not path.exists():
            return None
        try:
            headers, rows = _read_csv_rows(path)

            # Collect C[i][j] column indices in numeric order
            import re as _re
            cap_cols: List[int] = []
            for ci, h in enumerate(headers):
                if _re.search(r"c\[i\]\[(\d+)\]", h, _re.IGNORECASE):
                    cap_cols.append(ci)
            # Sort by the j index
            def _j(ci: int) -> int:
                m = _re.search(r"c\[i\]\[(\d+)\]", headers[ci], _re.IGNORECASE)
                return int(m.group(1)) if m else ci
            cap_cols.sort(key=_j)

            n = len(cap_cols)
            matrix: List[List[float]] = []
            for row in rows:
                vals = []
                for ci in cap_cols:
                    vals.append(float(row[ci]) if ci < len(row) else 0.0)
                matrix.append(vals)

            # Pad / trim names
            names = list(terminal_names[:n])
            while len(names) < n:
                names.append(f"terminal_{len(names) + 1}")

            return ParsedCapacitance(terminal_names=names, matrix_F=matrix)
        except Exception as exc:
            logger.warning("Failed to parse %s: %s", path.name, exc)
            return None

    def _parse_terminal_V(
        self,
        path: Path,
        terminal_names: List[str],
    ) -> Dict[str, float]:
        """
        terminal-V.csv headers:
          i, V_inc[1] (V), V_inc[2] (V), …
        Returns {terminal_name: voltage_V}.
        """
        if not path.exists():
            return {}
        try:
            headers, rows = _read_csv_rows(path)
            import re as _re
            v_cols: List[Tuple[int, int]] = []  # (col_index, port_number)
            for ci, h in enumerate(headers):
                m = _re.search(r"v_inc\[(\d+)\]", h, _re.IGNORECASE)
                if m:
                    v_cols.append((ci, int(m.group(1))))
            v_cols.sort(key=lambda t: t[1])

            result: Dict[str, float] = {}
            # terminal-V has one data row per terminal excitation
            for row in rows:
                for ci, pnum in v_cols:
                    name_idx = pnum - 1
                    name = (terminal_names[name_idx]
                            if name_idx < len(terminal_names)
                            else f"terminal_{pnum}")
                    if ci < len(row):
                        result[name] = float(row[ci])
            return result
        except Exception as exc:
            logger.warning("Failed to parse terminal-V.csv: %s", exc)
            return {}

    # ── shared parsers ────────────────────────────────────────────────────────

    def parse_error_indicators(self, path: Path) -> Optional[ParsedErrorIndicators]:
        """
        error-indicators.csv headers:
          Norm, Minimum, Maximum, Mean   (single data row)
        """
        if not path.exists():
            return None
        try:
            headers, rows = _read_csv_rows(path)
            if not rows:
                return ParsedErrorIndicators()
            row = rows[0]
            i_norm = _col(headers, "norm",    optional=True)
            i_min  = _col(headers, "minimum", optional=True)
            i_max  = _col(headers, "maximum", optional=True)
            i_mean = _col(headers, "mean",    optional=True)
            def _g(idx: Optional[int]) -> float:
                return float(row[idx]) if idx is not None and idx < len(row) else 0.0
            return ParsedErrorIndicators(
                norm=_g(i_norm), minimum=_g(i_min),
                maximum=_g(i_max), mean=_g(i_mean),
            )
        except Exception as exc:
            logger.warning("Failed to parse error-indicators.csv: %s", exc)
            return None

    def parse_mesh(
        self,
        meta_path: Path,
        quality_path: Path,
    ) -> Optional[ParsedMeshQuality]:
        """Merge mesh_metadata.json + mesh_quality.json into ParsedMeshQuality."""
        if not meta_path.exists() and not quality_path.exists():
            return None
        result = ParsedMeshQuality()
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                result.node_count      = meta.get("node_count", 0)
                result.element_count   = meta.get("element_count", 0)
                result.tet_count       = meta.get("tet_count", 0)
                result.triangle_count  = meta.get("triangle_count", 0)
                result.line_count      = meta.get("line_count", 0)
                result.mesh_dimension  = meta.get("mesh_dimension", 3)
                result.bounding_box    = meta.get("bounding_box", {})
                result.physical_groups = meta.get("physical_groups", [])
            except Exception as exc:
                logger.warning("Failed to parse mesh_metadata.json: %s", exc)

        if quality_path.exists():
            try:
                q = json.loads(quality_path.read_text(encoding="utf-8"))
                result.min_aspect_ratio  = q.get("min_aspect_ratio", 0.0)
                result.max_aspect_ratio  = q.get("max_aspect_ratio", 0.0)
                result.mean_aspect_ratio = q.get("mean_aspect_ratio", 0.0)
                result.min_quality       = q.get("min_quality", 0.0)
                result.max_quality       = q.get("max_quality", 0.0)
                result.mean_quality      = q.get("mean_quality", 0.0)
                result.quality_histogram = q.get("quality_histogram", [])
            except Exception as exc:
                logger.warning("Failed to parse mesh_quality.json: %s", exc)

        return result

    def parse_runner_metadata(self, path: Path) -> Optional[ParsedRunnerMetadata]:
        """Parse logs/runner_metadata.json."""
        if not path.exists():
            return None
        try:
            d = json.loads(path.read_text(encoding="utf-8"))
            return ParsedRunnerMetadata(
                execution_id       = d.get("execution_id", ""),
                workspace_id       = d.get("workspace_id", ""),
                runner_version     = d.get("runner_version", ""),
                palace_version     = d.get("palace_version", ""),
                mpi_version        = d.get("mpi_version", ""),
                start_time         = str(d.get("start_time", "")),
                end_time           = str(d.get("end_time", "")),
                duration_seconds   = float(d.get("duration_seconds", 0)),
                exit_code          = int(d.get("exit_code", 0)),
                termination_reason = d.get("termination_reason", ""),
                command            = d.get("command", ""),
                processor_count    = int(d.get("processor_count", 0)),
                mpi_ranks          = int(d.get("mpi_ranks", d.get("mpi_size", 0))),
                status             = d.get("status", ""),
            )
        except Exception as exc:
            logger.warning("Failed to parse runner_metadata.json: %s", exc)
            return None

    def parse_palace_perf(self, path: Path) -> Optional[ParsedPalacePerf]:
        """Parse config/out/palace.json for timing, memory, and solver stats."""
        if not path.exists():
            return None
        try:
            d = json.loads(path.read_text(encoding="utf-8"))
            et = d.get("ElapsedTime", {})
            dur = et.get("Durations", {})
            ls  = d.get("LinearSolver", {})
            mem = d.get("PeakMemoryMegabytes", {})
            prob = d.get("Problem", {})

            def _dur(key: str) -> float:
                v = dur.get(key, 0)
                # may be a list (one entry per pass) or a scalar
                if isinstance(v, list):
                    return float(v[-1]) if v else 0.0
                return float(v)

            return ParsedPalacePerf(
                elapsed_total_s          = _dur("Total"),
                elapsed_solve_s          = _dur("Solve"),
                elapsed_construction_s   = _dur("Construction"),
                linear_solver_total_its  = int(ls.get("TotalIts", 0)),
                linear_solver_total_solves = int(ls.get("TotalSolves", 0)),
                peak_memory_mb_max       = float(mem.get("Max", 0)),
                peak_memory_mb_avg       = float(mem.get("Average", 0)),
                degrees_of_freedom       = int(prob.get("DegreesOfFreedom", 0)),
                mesh_elements            = int(prob.get("MeshElements", 0)),
                mpi_size                 = int(prob.get("MPISize", 0)),
                raw                      = d,
            )
        except Exception as exc:
            logger.warning("Failed to parse palace.json: %s", exc)
            return None

    def parse_solver_config(self, path: Path) -> Optional[ParsedSolverConfig]:
        """Parse config/config.json for solver parameters."""
        if not path.exists():
            return None
        try:
            d = json.loads(path.read_text(encoding="utf-8"))
            prob    = d.get("Problem", {})
            model   = d.get("Model", {})
            solver  = d.get("Solver", {})
            linear  = solver.get("Linear", {})
            eig     = solver.get("Eigenmode", {})
            bounds  = d.get("Boundaries", {})
            pec     = bounds.get("PEC", {})
            absorb  = bounds.get("Absorbing", {})
            ports   = bounds.get("LumpedPort", [])

            return ParsedSolverConfig(
                problem_type         = prob.get("Type", ""),
                mesh_path            = model.get("Mesh", ""),
                model_L0             = float(model.get("L0", 1e-3)),
                solver_order         = int(solver.get("Order", 1)),
                linear_type          = linear.get("Type", ""),
                linear_tol           = float(linear.get("Tol", 1e-6)),
                linear_max_its       = int(linear.get("MaxIts", 100)),
                eigenmode_n          = int(eig.get("N", 0)),
                eigenmode_target_hz  = float(eig.get("Target", 0)),
                eigenmode_save       = int(eig.get("Save", 0)),
                pec_attributes       = pec.get("Attributes", []),
                absorbing_attributes = absorb.get("Attributes", []),
                absorbing_order      = int(absorb.get("Order", 1)),
                lumped_ports         = ports if isinstance(ports, list) else [ports],
                materials            = d.get("Domains", {}).get("Materials", []),
                raw                  = d,
            )
        except Exception as exc:
            logger.warning("Failed to parse config.json: %s", exc)
            return None

    def parse_boundary_map(self, path: Path) -> Optional[ParsedBoundaryMap]:
        """Parse config/config_metadata.json for boundary name→attribute mappings."""
        if not path.exists():
            return None
        try:
            d = json.loads(path.read_text(encoding="utf-8"))
            mb = d.get("mapped_boundaries", {})
            ports     = mb.get("ports", {})
            terminals = mb.get("terminals", {})
            materials = mb.get("materials", d.get("mapped_materials", {}))
            return ParsedBoundaryMap(
                ports             = {k: int(v) for k, v in ports.items()},
                terminals         = {k: int(v) for k, v in terminals.items()},
                mapped_materials  = materials,
                created_at        = str(d.get("created_at", "")),
                raw               = d,
            )
        except Exception as exc:
            logger.warning("Failed to parse config_metadata.json: %s", exc)
            return None

    # ── legacy compat (called from existing routers/simulations.py) ──────────

    def parse_eigenmodes_legacy(
        self,
        eig_csv_path: Path,
        epr_csv_path: Optional[Path] = None,
        **kwargs: Any,
    ) -> List[ParsedEigenmode]:
        """Legacy single-file entry point (backwards-compatible)."""
        return self.parse_eigenmodes(
            eig_csv=eig_csv_path,
            epr_csv=epr_csv_path,
            **kwargs,
        )

    def parse_capacitance(self, cap_csv_path: Path) -> Optional[ParsedCapacitance]:
        """Legacy single-file entry point."""
        return self._parse_cap_matrix(cap_csv_path, terminal_names=[])
