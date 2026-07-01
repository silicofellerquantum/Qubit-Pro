"""Palace simulation result parser and physics parameter converter."""

from __future__ import annotations

import csv
import logging
import math
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.simulation.parser.constants import (
    E_CHARGE,
    FF_TO_F,
    GHZ_TO_HZ,
    H_PLANCK,
    NA_TO_A,
    NH_TO_H,
    PHI0,
)
from app.simulation.parser.exceptions import (
    FileMissingError,
    HeaderNotFoundError,
    InvalidFormatError,
    PhysicsConversionError,
    ResultParserError,
)
from app.simulation.parser.parser_models import (
    DrivenResults,
    DrivenSweepPoint,
    EigenmodeMode,
    EigenmodeResults,
    ElectrostaticResults,
    InductanceEntry,
    MagnetostaticResults,
    PalaceSolverType,
    ParsedSimulationResults,
    QubitPhysicalParameters,
)

logger = logging.getLogger(__name__)


class ResultParser:
    """Parser and parameter converter for AWS Palace simulation outputs."""

    @staticmethod
    def parse_eigenmode(
        output_dir: Path,
        port_names: Optional[List[str]] = None,
    ) -> EigenmodeResults:
        """Parse resonant frequencies, quality factors, and Energy Participation Ratios (EPR).

        Args:
            output_dir: Path to the directory containing solver CSV outputs.
            port_names: Optional ordered names of the lumped ports/junctions.

        Returns:
            An EigenmodeResults model.

        Raises:
            FileMissingError: If eig.csv is not found.
            HeaderNotFoundError: If required headers (m, Re{f}, Q) are missing.
            InvalidFormatError: If the file contains malformed data.
        """
        logger.info("Parsing eigenmode results from %s", output_dir)
        eig_path = Path(output_dir) / "eig.csv"
        if not eig_path.exists():
            raise FileMissingError(f"Required eigenmode file 'eig.csv' not found at: {eig_path}")

        modes: Dict[int, EigenmodeMode] = {}

        try:
            with open(eig_path, mode="r", newline="", encoding="utf-8") as f:
                reader = csv.reader(f)
                header = [col.strip() for col in next(reader)]

                # Resolve indices using case-insensitive lookup
                try:
                    idx_m = next(i for i, h in enumerate(header) if h.lower() in ("m", "mode"))
                except StopIteration:
                    raise HeaderNotFoundError(f"Mode index column 'm' not found in headers: {header}")

                try:
                    idx_freq = next(i for i, h in enumerate(header) if "re{f}" in h.lower() or "freq" in h.lower())
                except StopIteration:
                    raise HeaderNotFoundError(f"Frequency column 'Re{{f}}' not found in headers: {header}")

                try:
                    idx_q = next(i for i, h in enumerate(header) if h.lower() == "q" or "quality" in h.lower())
                except StopIteration:
                    raise HeaderNotFoundError(f"Quality factor column 'Q' not found in headers: {header}")

                for row in reader:
                    if not row or not row[0].strip() or row[0].startswith("#"):
                        continue
                    try:
                        m_val = int(float(row[idx_m]))
                        freq_val = float(row[idx_freq]) / 1.0e9  # Convert Hz to GHz
                        q_val = float(row[idx_q])
                    except ValueError as ve:
                        raise InvalidFormatError(f"Failed to parse numeric value in row {row}: {ve}") from ve

                    modes[m_val] = EigenmodeMode(
                        mode_index=m_val,
                        frequency_ghz=freq_val,
                        quality_factor=q_val,
                        numerical_q=q_val,
                        epr={},
                    )
        except Exception as e:
            if isinstance(e, ResultParserError):
                raise e
            raise InvalidFormatError(f"Failed to read/parse eig.csv: {e}") from e

        # Optional EPR parsing if port-EPR.csv exists
        epr_path = Path(output_dir) / "port-EPR.csv"
        if epr_path.exists():
            try:
                with open(epr_path, mode="r", newline="", encoding="utf-8") as f:
                    reader = csv.reader(f)
                    header = [col.strip() for col in next(reader)]

                    idx_m = next(i for i, h in enumerate(header) if h.lower() in ("m", "mode"))
                    port_cols = [(i, h) for i, h in enumerate(header) if i != idx_m]

                    for row in reader:
                        if not row or not row[0].strip() or row[0].startswith("#"):
                            continue
                        m_val = int(float(row[idx_m]))

                        if m_val in modes:
                            epr_dict = {}
                            for idx, col_name in port_cols:
                                val = float(row[idx])
                                port_id = col_name
                                if port_names:
                                    # Extract index from 'EPR[1]' or similar
                                    match = re.search(r"\[(\d+)\]", col_name)
                                    if match:
                                        p_idx = int(match.group(1)) - 1
                                        if 0 <= p_idx < len(port_names):
                                            port_id = port_names[p_idx]
                                epr_dict[port_id] = val
                            modes[m_val].epr = epr_dict
                logger.info("Successfully parsed Energy Participation Ratios (EPR) from port-EPR.csv")
            except Exception as e:
                logger.warning("Failed to parse EPR file %s: %s (non-fatal, continuing without EPR)", epr_path, e)

        # Sort modes strictly by ascending frequency_ghz
        sorted_modes = sorted(modes.values(), key=lambda m: m.frequency_ghz)
        
        # Reassign 1-based mode indices and apply sanity filter for spurious high-frequency modes (> 500 GHz)
        for idx, mode in enumerate(sorted_modes, start=1):
            mode.mode_index = idx
            if mode.frequency_ghz > 500.0:
                mode.label = "non-physical/numerical"
            else:
                mode.label = "physical"
                
        return EigenmodeResults(modes=sorted_modes)

    @staticmethod
    def parse_electrostatic(
        output_dir: Path,
        terminal_names: List[str],
    ) -> ElectrostaticResults:
        """Parse capacitance matrix and convert from Farads to femtofarads (fF).

        Args:
            output_dir: Path to the directory containing solver CSV outputs.
            terminal_names: Ordered list of terminal names.

        Returns:
            An ElectrostaticResults model.

        Raises:
            FileMissingError: If terminal-C.csv is not found.
            HeaderNotFoundError: If row index column 'i' is missing.
            InvalidFormatError: If the matrix is not square or contains malformed data.
        """
        logger.info("Parsing electrostatic results from %s", output_dir)
        c_path = Path(output_dir) / "terminal-C.csv"
        if not c_path.exists():
            raise FileMissingError(f"Required electrostatic file 'terminal-C.csv' not found at: {c_path}")

        try:
            with open(c_path, mode="r", newline="", encoding="utf-8") as f:
                reader = csv.reader(f)
                header = [col.strip() for col in next(reader)]

                try:
                    idx_i = next(i for i, h in enumerate(header) if h.lower() == "i")
                except StopIteration:
                    raise HeaderNotFoundError(f"Row index column 'i' not found in headers: {header}")

                val_cols = [idx for idx, h in enumerate(header) if idx != idx_i]

                raw_rows = []
                for row in reader:
                    if not row or not row[0].strip() or row[0].startswith("#"):
                        continue
                    raw_rows.append(row)

                # Sort rows by index 'i' to guarantee alignment
                raw_rows.sort(key=lambda r: int(float(r[idx_i])))

                matrix = []
                for r in raw_rows:
                    matrix_row = []
                    for col_idx in val_cols:
                        val_farad = float(r[col_idx])
                        matrix_row.append(val_farad * 1.0e15)  # Farads -> fF
                    matrix.append(matrix_row)

                num_terminals = len(matrix)
                for idx, m_row in enumerate(matrix):
                    if len(m_row) != num_terminals:
                        raise InvalidFormatError(
                            f"Inconsistent capacitance matrix dimensions: row {idx+1} has "
                            f"{len(m_row)} entries, expected {num_terminals}."
                        )

                # Construct terminal IDs mapping
                names = list(terminal_names) if terminal_names else []
                if len(names) < num_terminals:
                    for i in range(len(names), num_terminals):
                        names.append(f"terminal_{i+1}")
                else:
                    names = names[:num_terminals]

                return ElectrostaticResults(
                    terminal_ids=names,
                    matrix=matrix,
                    units="fF",
                )
        except Exception as e:
            if isinstance(e, ResultParserError):
                raise e
            raise InvalidFormatError(f"Failed to read/parse terminal-C.csv: {e}") from e

    @staticmethod
    def parse_magnetostatic(
        output_dir: Path,
        terminal_names: List[str],
    ) -> MagnetostaticResults:
        """Parse inductance matrix and convert from Henries to nanohenries (nH).

        Args:
            output_dir: Path to the directory containing solver CSV outputs.
            terminal_names: Ordered list of terminal/loop names.

        Returns:
            A MagnetostaticResults model.

        Raises:
            FileMissingError: If terminal-M.csv is not found.
            HeaderNotFoundError: If row index column 'i' is missing.
            InvalidFormatError: If the matrix is not square or contains malformed data.
        """
        logger.info("Parsing magnetostatic results from %s", output_dir)
        l_path = Path(output_dir) / "terminal-M.csv"
        if not l_path.exists():
            raise FileMissingError(f"Required magnetostatic file 'terminal-M.csv' not found at: {l_path}")

        try:
            with open(l_path, mode="r", newline="", encoding="utf-8") as f:
                reader = csv.reader(f)
                header = [col.strip() for col in next(reader)]

                try:
                    idx_i = next(i for i, h in enumerate(header) if h.lower() == "i")
                except StopIteration:
                    raise HeaderNotFoundError(f"Row index column 'i' not found in headers: {header}")

                val_cols = [idx for idx, h in enumerate(header) if idx != idx_i]

                raw_rows = []
                for row in reader:
                    if not row or not row[0].strip() or row[0].startswith("#"):
                        continue
                    raw_rows.append(row)

                # Sort rows by index 'i'
                raw_rows.sort(key=lambda r: int(float(r[idx_i])))

                matrix = []
                for r in raw_rows:
                    matrix_row = []
                    for col_idx in val_cols:
                        val_henry = float(r[col_idx])
                        matrix_row.append(val_henry * 1.0e9)  # Henries -> nH
                    matrix.append(matrix_row)

                num_terminals = len(matrix)
                for idx, m_row in enumerate(matrix):
                    if len(m_row) != num_terminals:
                        raise InvalidFormatError(
                            f"Inconsistent inductance matrix dimensions: row {idx+1} has "
                            f"{len(m_row)} entries, expected {num_terminals}."
                        )

                names = list(terminal_names) if terminal_names else []
                if len(names) < num_terminals:
                    for i in range(len(names), num_terminals):
                        names.append(f"terminal_{i+1}")
                else:
                    names = names[:num_terminals]

                # Extract self-inductances from the diagonal
                inductance_data = []
                for idx, name in enumerate(names):
                    inductance_data.append(
                        InductanceEntry(
                            element_id=name,
                            inductance_nH=matrix[idx][idx],
                        )
                    )

                return MagnetostaticResults(
                    terminal_ids=names,
                    matrix=matrix,
                    inductance_data=inductance_data,
                    units="nH",
                )
        except Exception as e:
            if isinstance(e, ResultParserError):
                raise e
            raise InvalidFormatError(f"Failed to read/parse terminal-M.csv: {e}") from e

    @staticmethod
    def parse_driven(
        output_dir: Path,
        port_names: Optional[List[str]] = None,
    ) -> DrivenResults:
        """Parse driven-mode (frequency-domain) S-parameter results from Palace output.

        Palace writes driven-mode S-parameters to ``port-S.csv`` inside the ``out/``
        directory.  The file schema is::

            f (Hz), Re{S[1][1]}, Im{S[1][1]}, Re{S[2][1]}, Im{S[2][1]}, ...

        Column headers are always present and case-insensitive.  Frequency is in Hz
        and is converted to GHz on parse.  Magnitude and phase are derived from the
        complex (Re, Im) pairs and stored under ``mag_S{i}{j}`` / ``phase_S{i}{j}``
        keys inside each :class:`DrivenSweepPoint`.

        Args:
            output_dir: Path to the directory containing solver CSV outputs.
            port_names: Optional ordered names of the lumped ports.  When supplied,
                keys in :attr:`DrivenSweepPoint.s_params` use the readable name;
                otherwise they use numeric indices (e.g. ``mag_S11``).

        Returns:
            A :class:`DrivenResults` model.

        Raises:
            FileMissingError: If ``port-S.csv`` is not found.
            HeaderNotFoundError: If the frequency column cannot be identified.
            InvalidFormatError: If the file contains malformed data.
        """
        logger.info("Parsing driven-mode (S-parameter) results from %s", output_dir)
        s_path = Path(output_dir) / "port-S.csv"
        if not s_path.exists():
            raise FileMissingError(
                f"Required driven-mode file 'port-S.csv' not found at: {s_path}"
            )

        try:
            with open(s_path, mode="r", newline="", encoding="utf-8") as f:
                reader = csv.reader(f)
                raw_header = next(reader)
                header = [col.strip() for col in raw_header]

                # Locate frequency column — Palace uses "f (Hz)" or similar
                try:
                    idx_f = next(
                        i for i, h in enumerate(header)
                        if h.lower().startswith("f") and ("hz" in h.lower() or h.lower() == "f")
                    )
                except StopIteration:
                    raise HeaderNotFoundError(
                        f"Frequency column not found in port-S.csv headers: {header}"
                    )

                # Parse S-parameter column pairs.  Each pair is (Re{S[i][j]}, Im{S[i][j]}).
                # We detect port count from the number of non-frequency columns.
                s_col_pairs: List[Tuple[int, int, int, int]] = []  # (re_idx, im_idx, port_i, port_j)
                non_f_cols = [(i, h) for i, h in enumerate(header) if i != idx_f]

                # Attempt to find structured pairs via regex first
                re_pattern = re.compile(
                    r"re\{s\s*\[?(\d+)\]?\s*\[?(\d+)\]?\}",
                    re.IGNORECASE,
                )
                im_pattern = re.compile(
                    r"im\{s\s*\[?(\d+)\]?\s*\[?(\d+)\]?\}",
                    re.IGNORECASE,
                )
                re_cols: Dict[Tuple[int, int], int] = {}  # (i,j) -> col idx
                im_cols: Dict[Tuple[int, int], int] = {}  # (i,j) -> col idx
                for col_idx, col_name in non_f_cols:
                    m = re_pattern.search(col_name)
                    if m:
                        re_cols[(int(m.group(1)), int(m.group(2)))] = col_idx
                        continue
                    m = im_pattern.search(col_name)
                    if m:
                        im_cols[(int(m.group(1)), int(m.group(2)))] = col_idx

                port_pairs_found = set(re_cols.keys()) & set(im_cols.keys())

                if not port_pairs_found:
                    # Fallback: assume alternating Re/Im pairs starting from col 1
                    logger.warning(
                        "Could not parse port-S.csv column names with regex; "
                        "assuming alternating Re/Im column layout."
                    )
                    pair_count = len(non_f_cols) // 2
                    num_ports = max(1, math.isqrt(pair_count)) if pair_count > 0 else 1
                    for k in range(pair_count):
                        re_idx = non_f_cols[k * 2][0]
                        im_idx = non_f_cols[k * 2 + 1][0]
                        port_i = k // num_ports + 1
                        port_j = k % num_ports + 1
                        re_cols[(port_i, port_j)] = re_idx
                        im_cols[(port_i, port_j)] = im_idx
                    port_pairs_found = set(re_cols.keys()) & set(im_cols.keys())

                # Build sweep
                sweep: List[DrivenSweepPoint] = []
                for row in reader:
                    if not row or not row[0].strip() or row[0].strip().startswith("#"):
                        continue
                    try:
                        freq_hz = float(row[idx_f])
                    except (ValueError, IndexError) as ve:
                        raise InvalidFormatError(
                            f"Failed to parse frequency in port-S.csv row {row}: {ve}"
                        ) from ve

                    freq_ghz = freq_hz / 1.0e9
                    s_params: Dict[str, float] = {}

                    for (pi, pj) in sorted(port_pairs_found):
                        re_val = float(row[re_cols[(pi, pj)]])
                        im_val = float(row[im_cols[(pi, pj)]])
                        mag = math.sqrt(re_val**2 + im_val**2)
                        phase_deg = math.degrees(math.atan2(im_val, re_val))

                        # Use friendly port names when available
                        if port_names and pi - 1 < len(port_names) and pj - 1 < len(port_names):
                            name_i = port_names[pi - 1]
                            name_j = port_names[pj - 1]
                            key_base = f"S_{name_i}_{name_j}"
                        else:
                            key_base = f"S{pi}{pj}"

                        s_params[f"mag_{key_base}"] = mag
                        s_params[f"phase_{key_base}"] = phase_deg

                    sweep.append(DrivenSweepPoint(frequency_ghz=freq_ghz, s_params=s_params))

        except Exception as e:
            if isinstance(e, ResultParserError):
                raise e
            raise InvalidFormatError(f"Failed to read/parse port-S.csv: {e}") from e

        f_min = sweep[0].frequency_ghz if sweep else None
        f_max = sweep[-1].frequency_ghz if sweep else None

        logger.info(
            "Parsed %d driven-mode sweep points (%.3f – %.3f GHz) with %d port pairs.",
            len(sweep),
            f_min or 0.0,
            f_max or 0.0,
            len(port_pairs_found),
        )

        return DrivenResults(
            port_names=list(port_names) if port_names else [],
            sweep=sweep,
            frequency_ghz_min=f_min,
            frequency_ghz_max=f_max,
        )


    @staticmethod
    def calculate_qubit_parameters(
        electrostatic: ElectrostaticResults,
        qubits: List[Dict[str, Any]],
        magnetostatic: Optional[MagnetostaticResults] = None,
    ) -> Dict[str, QubitPhysicalParameters]:
        """Convert capacitance/inductance matrices into derived qubit physical parameters.

        Args:
            electrostatic: The parsed ElectrostaticResults.
            qubits: List of qubit specs. Each dict must contain 'qubit_id', 'qubit_type',
                'terminal_id', and junction/frequency information.
            magnetostatic: Optional parsed MagnetostaticResults (required for fluxonium).

        Returns:
            A dictionary mapping qubit_id to QubitPhysicalParameters.

        Raises:
            PhysicsConversionError: On physical boundary violations or missing elements.
        """
        results: Dict[str, QubitPhysicalParameters] = {}

        for q_spec in qubits:
            qid = q_spec.get("qubit_id")
            qtype = q_spec.get("qubit_type", "transmon").lower()
            terminal = q_spec.get("terminal_id")

            if not qid or not terminal:
                raise PhysicsConversionError("Qubit specification must contain 'qubit_id' and 'terminal_id'.")

            # 1. Resolve terminal self-capacitance
            if terminal not in electrostatic.terminal_ids:
                raise PhysicsConversionError(
                    f"Qubit '{qid}' terminal '{terminal}' not found in capacitance matrix terminal list: "
                    f"{electrostatic.terminal_ids}"
                )

            t_idx = electrostatic.terminal_ids.index(terminal)
            self_cap_fF = electrostatic.matrix[t_idx][t_idx]

            if self_cap_fF <= 0.0:
                raise PhysicsConversionError(
                    f"Qubit '{qid}' has non-positive self-capacitance: {self_cap_fF} fF. "
                    "Capacitances must be strictly positive."
                )

            # --- Capacitance to EC (GHz) ---
            C_farad = self_cap_fF * FF_TO_F
            EC_joules = (E_CHARGE**2) / (2.0 * C_farad)
            EC_ghz = EC_joules / (H_PLANCK * GHZ_TO_HZ)

            # 2. Resolve Josephson Energy EJ (GHz)
            EJ_ghz = 0.0
            # Support multiple parameter location styles
            jp = q_spec.get("junction_params") or q_spec
            if jp.get("EJ_ghz") is not None:
                EJ_ghz = float(jp["EJ_ghz"])
            elif jp.get("critical_current_nA") is not None:
                Ic_amps = float(jp["critical_current_nA"]) * NA_TO_A
                if Ic_amps <= 0.0:
                    raise PhysicsConversionError(f"Josephson junction critical current must be positive: {Ic_amps} A")
                EJ_joules = PHI0 * Ic_amps / (2.0 * math.pi)
                EJ_ghz = EJ_joules / (H_PLANCK * GHZ_TO_HZ)
            else:
                # Default fallback or raise error
                raise PhysicsConversionError(
                    f"Qubit '{qid}': Either 'EJ_ghz' or 'critical_current_nA' must be provided."
                )

            # 3. Resolve Inductive Energy EL (GHz) for Fluxonium
            EL_ghz = None
            if qtype == "fluxonium":
                if not magnetostatic:
                    raise PhysicsConversionError(
                        f"Fluxonium qubit '{qid}' requires magnetostatic results to resolve loop inductance."
                    )
                ind_id = q_spec.get("resolved_inductance_id") or terminal
                if ind_id not in magnetostatic.terminal_ids:
                    raise PhysicsConversionError(
                        f"Fluxonium qubit '{qid}' inductance element '{ind_id}' not found in magnetostatic results."
                    )
                l_idx = magnetostatic.terminal_ids.index(ind_id)
                ind_nH = magnetostatic.matrix[l_idx][l_idx]
                if ind_nH <= 0.0:
                    raise PhysicsConversionError(f"Fluxonium loop inductance must be positive: {ind_nH} nH")

                L_henry = ind_nH * NH_TO_H
                EL_joules = (PHI0 / (2.0 * math.pi)) ** 2 / L_henry
                EL_ghz = EL_joules / (H_PLANCK * GHZ_TO_HZ)

            # 4. Extract mutual coupling capacitances and calculate coupling strengths g (GHz)
            coupling_caps: Dict[str, float] = {}
            coupling_strengths: Dict[str, float] = {}

            # Resonant frequency of current qubit (default 5.0 GHz if not provided)
            f_A = float(q_spec.get("frequency_ghz") or q_spec.get("freq_ghz", 5.0))

            for o_idx, other_term in enumerate(electrostatic.terminal_ids):
                if other_term == terminal:
                    continue

                # Mutual capacitance is the absolute value of the off-diagonal element
                mutual_fF = abs(electrostatic.matrix[t_idx][o_idx])
                coupling_caps[other_term] = mutual_fF

                # Check if other terminal represents another qubit to compute coupling strength g
                other_q = next((q for q in qubits if q.get("terminal_id") == other_term), None)
                if other_q:
                    other_qid = other_q.get("qubit_id")
                    f_B = float(other_q.get("frequency_ghz") or other_q.get("freq_ghz", 5.0))
                    self_cap_B_fF = electrostatic.matrix[o_idx][o_idx]

                    if self_cap_B_fF > 0.0:
                        # g_GHz = (C_c / 2) * sqrt((f_A * f_B) / (C_A * C_B))
                        g_ghz = (mutual_fF / 2.0) * math.sqrt((f_A * f_B) / (self_cap_fF * self_cap_B_fF))
                        coupling_strengths[other_qid] = g_ghz

            results[qid] = QubitPhysicalParameters(
                qubit_id=qid,
                qubit_type=qtype,
                EC_ghz=EC_ghz,
                EJ_ghz=EJ_ghz,
                EL_ghz=EL_ghz,
                capacitance_fF=self_cap_fF,
                coupling_caps=coupling_caps,
                coupling_strengths=coupling_strengths,
            )

        return results

    @staticmethod
    def parse_results(
        output_dir: Path,
        solver_type: PalaceSolverType | str,
        terminal_names: Optional[List[str]] = None,
        qubits: Optional[List[Dict[str, Any]]] = None,
        port_names: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Unified result parsing entrypoint.

        Processes simulation output files and returns a serializable dictionary,
        ensuring full backward-compatibility with legacy verification pipelines.

        Args:
            output_dir: Path to the directory containing solver CSV outputs.
            solver_type: The Palace solver formulation used.
            terminal_names: Ordered terminal names for capacitance/inductance.
            qubits: Optional list of qubit specifications.
            port_names: Optional ordered port names for eigenmode EPR mapping.

        Returns:
            A dictionary representation of the parsed results.
        """
        if hasattr(solver_type, "value"):
            solver_str = solver_type.value
        else:
            solver_str = str(solver_type)
        
        if "." in solver_str:
            solver_str = solver_str.split(".")[-1]
        
        solver_str = solver_str.lower()
        terminal_names = terminal_names or []

        # Construct unified results model
        parsed_obj = ParsedSimulationResults(
            solver_type=PalaceSolverType(solver_str)
        )

        if solver_str == PalaceSolverType.EIGENMODE.value:
            parsed_obj.eigenmode = ResultParser.parse_eigenmode(output_dir, port_names)

        elif solver_str == PalaceSolverType.ELECTROSTATIC.value:
            parsed_obj.electrostatic = ResultParser.parse_electrostatic(output_dir, terminal_names)
            if qubits:
                parsed_obj.qubit_parameters = ResultParser.calculate_qubit_parameters(
                    parsed_obj.electrostatic, qubits
                )

        elif solver_str == PalaceSolverType.MAGNETOSTATIC.value:
            # Parse both magnetostatic and electrostatic if both exist to do complete fluxonium derivations
            parsed_obj.magnetostatic = ResultParser.parse_magnetostatic(output_dir, terminal_names)
            
            # Check if electrostatic results exist in the same directory (often run together in pipelines)
            c_path = Path(output_dir) / "terminal-C.csv"
            if c_path.exists():
                try:
                    parsed_obj.electrostatic = ResultParser.parse_electrostatic(output_dir, terminal_names)
                except Exception:
                    pass

            if qubits and parsed_obj.electrostatic:
                parsed_obj.qubit_parameters = ResultParser.calculate_qubit_parameters(
                    parsed_obj.electrostatic, qubits, parsed_obj.magnetostatic
                )

        elif solver_str == PalaceSolverType.DRIVEN.value:
            parsed_obj.driven = ResultParser.parse_driven(output_dir, port_names)

        return parsed_obj.model_dump()
