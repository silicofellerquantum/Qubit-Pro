from __future__ import annotations
import csv
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field

from app.services.palace.exceptions import ResultParsingError

logger = logging.getLogger(__name__)


class ParsedEigenmode(BaseModel):
    mode_index: int
    frequency_ghz: float
    quality_factor: float
    epr: Dict[str, float] = Field(default_factory=dict)


class ParsedCapacitance(BaseModel):
    terminal_ids: List[str]
    matrix: List[List[float]]


class ParsedInductance(BaseModel):
    element_id: str
    inductance_nh: float


class PalaceSimulationOutputs(BaseModel):
    eigenmodes: List[ParsedEigenmode] = Field(default_factory=list)
    capacitance: Optional[ParsedCapacitance] = None
    inductances: List[ParsedInductance] = Field(default_factory=list)


class PalaceResultParser:
    """Parses AWS Palace simulation output CSV files."""

    def parse_eigenmodes(self, eig_csv_path: Path, epr_csv_path: Optional[Path] = None) -> List[ParsedEigenmode]:
        """Parse eigenmode frequencies from eig.csv and optionally EPR ratios from epr.csv."""
        if not eig_csv_path.exists():
            raise ResultParsingError(f"Eigenmode CSV file does not exist: {eig_csv_path}")

        modes_map: Dict[int, ParsedEigenmode] = {}

        try:
            with open(eig_csv_path, mode="r", encoding="utf-8") as f:
                # Palace CSV files might contain spaces in headers or comments.
                # Clean headers and find index columns
                reader = csv.reader(f)
                headers = [h.strip() for h in next(reader)]
                
                # Normalize headers to lowercase for flexible matching
                headers_lower = [h.lower() for h in headers]
                
                mode_idx = self._find_header_index(headers_lower, ["mode", "idx"])
                freq_idx = self._find_header_index(headers_lower, ["f (ghz)", "freq (ghz)", "frequency (ghz)", "imag part (rad/s)"])
                q_idx = self._find_header_index(headers_lower, ["q", "quality factor", "q-factor"], optional=True)

                for row in reader:
                    if not row or row[0].startswith("%") or row[0].startswith("#"):
                        continue
                    row = [r.strip() for r in row]
                    m_val = int(row[mode_idx])
                    
                    # Frequency calculation: if Imag Part (rad/s), divide by 2*pi*1e9 to get GHz
                    freq_raw = float(row[freq_idx])
                    if "rad/s" in headers_lower[freq_idx]:
                        freq_ghz = abs(freq_raw) / (2.0 * 3.141592653589793 * 1e9)
                    else:
                        freq_ghz = freq_raw
                    
                    q_val = float(row[q_idx]) if q_idx is not None and q_idx < len(row) else 1e9
                    
                    modes_map[m_val] = ParsedEigenmode(
                        mode_index=m_val,
                        frequency_ghz=round(freq_ghz, 6),
                        quality_factor=round(q_val, 2),
                        epr={},
                    )
        except Exception as e:
            raise ResultParsingError(f"Failed to parse eigenmodes CSV: {e}") from e

        # Optionally parse EPR
        if epr_csv_path and epr_csv_path.exists():
            try:
                with open(epr_csv_path, mode="r", encoding="utf-8") as f:
                    reader = csv.reader(f)
                    headers = [h.strip() for h in next(reader)]
                    headers_lower = [h.lower() for h in headers]

                    mode_idx = self._find_header_index(headers_lower, ["mode", "idx"])

                    # All other headers contain EPR for specific ports
                    # Typical Palace header: "EPR (Port 1)" or "EPR (JJ_Q1)" or "JJ_Q1"
                    epr_ports: Dict[int, str] = {}
                    for i, h in enumerate(headers):
                        if i == mode_idx:
                            continue
                        # Clean header to extract junction/port name
                        port_name = h
                        for prefix in ["epr (", "inductive epr (", "port ("]:
                            if h.lower().startswith(prefix):
                                port_name = h[len(prefix):].rstrip(")")
                                break
                        epr_ports[i] = port_name

                    for row in reader:
                        if not row or row[0].startswith("%") or row[0].startswith("#"):
                            continue
                        row = [r.strip() for r in row]
                        m_val = int(row[mode_idx])
                        if m_val in modes_map:
                            epr_dict = {}
                            for col_idx, port_name in epr_ports.items():
                                if col_idx < len(row):
                                    epr_dict[port_name] = float(row[col_idx])
                            modes_map[m_val].epr = epr_dict
            except Exception as e:
                logger.warning("Failed to parse EPR CSV (continuing without EPR): %s", e)

        return list(modes_map.values())

    def parse_capacitance(self, cap_csv_path: Path) -> ParsedCapacitance:
        """Parse capacitance matrix from cap.csv / capacitance.csv."""
        if not cap_csv_path.exists():
            raise ResultParsingError(f"Capacitance CSV file does not exist: {cap_csv_path}")

        try:
            with open(cap_csv_path, mode="r", encoding="utf-8") as f:
                reader = csv.reader(f)
                # Parse headers: typically "Terminal", "Q1_island", "Q2_island", etc.
                headers = [h.strip() for h in next(reader)]
                
                # The first column is the row descriptor (e.g. "Terminal" or "")
                terminal_ids = headers[1:]
                n = len(terminal_ids)
                matrix = []

                for row in reader:
                    if not row or row[0].startswith("%") or row[0].startswith("#"):
                        continue
                    row = [r.strip() for r in row]
                    # The first element is the terminal name, rest are float values
                    row_vals = [float(v) for v in row[1:n+1]]
                    matrix.append(row_vals)

                if len(matrix) != n:
                    # In case of missing row descriptors or other issues, enforce square matrix
                    logger.warning(
                        "Capacitance matrix rows (%d) do not match terminals count (%d). Normalizing.",
                        len(matrix),
                        n,
                    )
                    # Let's ensure it's square
                    if len(matrix) < n:
                        # Pad with zeros
                        while len(matrix) < n:
                            matrix.append([0.0] * n)
                    else:
                        matrix = matrix[:n]

                return ParsedCapacitance(
                    terminal_ids=terminal_ids,
                    matrix=matrix,
                )
        except Exception as e:
            raise ResultParsingError(f"Failed to parse capacitance CSV: {e}") from e

    def _find_header_index(self, headers: List[str], matches: List[str], optional: bool = False) -> Optional[int]:
        for match in matches:
            for idx, h in enumerate(headers):
                if match in h:
                    return idx
        if optional:
            return None
        raise ResultParsingError(f"Could not find matching column for {matches} in headers: {headers}")
