"""Palace eigenmode simulation output validation & diagnostic system for Silicofeller Quantum Studio."""

from __future__ import annotations

import logging
import os
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np
import pyvista as pv

logger = logging.getLogger(__name__)


def read_pvtu_header(filepath: Path) -> dict:
    """Reads a .pvtu file's XML header to extract point and cell fields without loading full arrays."""
    try:
        tree = ET.parse(filepath)
        root = tree.getroot()
        
        point_fields = []
        point_data_elem = root.find(".//PPointData")
        if point_data_elem is not None:
            for array in point_data_elem.findall("PDataArray"):
                name = array.get("Name")
                if name:
                    point_fields.append(name)
                    
        cell_fields = []
        cell_data_elem = root.find(".//PCellData")
        if cell_data_elem is not None:
            for array in cell_data_elem.findall("PDataArray"):
                name = array.get("Name")
                if name:
                    cell_fields.append(name)
                    
        pieces = []
        unstructured_grid = root.find(".//PUnstructuredGrid")
        if unstructured_grid is not None:
            for piece in unstructured_grid.findall("Piece"):
                src = piece.get("Source")
                if src:
                    pieces.append(src)
                    
        return {
            "point_fields": point_fields,
            "cell_fields": cell_fields,
            "pieces": pieces
        }
    except Exception as e:
        logger.error(f"Failed to parse PVTU header for {filepath}: {e}")
        return {"point_fields": [], "cell_fields": [], "pieces": []}


class PalaceOutputValidator:
    """Validator class for post-processing results from the Palace electromagnetic solver."""

    def __init__(self, project_id: str, output_dir: Optional[Union[str, Path]] = None):
        self.project_id = project_id
        self.project_root = self._get_project_root()
        self.simulation_dir = None
        
        if output_dir:
            self.output_dir = Path(output_dir)
            if self.output_dir.name == "out" and self.output_dir.parent.name == "config":
                self.simulation_dir = self.output_dir.parent.parent
            else:
                self.simulation_dir = self.output_dir.parent
        else:
            # Resolve simulation directory automatically
            self.simulation_dir = self._resolve_simulation_dir(project_id)
            if self.simulation_dir:
                self.output_dir = self.simulation_dir / "config" / "out"
            else:
                self.simulation_dir = self.project_root / "backend" / "tmp" / "simulations" / f"simulation_{project_id.replace('-', '')}"
                self.output_dir = self.simulation_dir / "config" / "out"

    def _get_project_root(self) -> Path:
        current_dir = Path(__file__).resolve().parent
        for parent in [current_dir] + list(current_dir.parents):
            if (parent / "backend").exists() and (parent / "frontend").exists():
                return parent
        return Path("/home/drdo/Desktop/sim-spack")

    def _resolve_simulation_dir(self, project_id: str) -> Optional[Path]:
        # Try finding DB relative to project root
        db_paths = [
            self.project_root / "backend" / "dev.db",
            self.project_root / "dev.db"
        ]
        
        artifact_path = None
        for db_path in db_paths:
            if db_path.exists():
                try:
                    import sqlite3
                    conn = sqlite3.connect(str(db_path))
                    cursor = conn.cursor()
                    # Query for matching project_id OR simulation ID
                    cursor.execute(
                        "SELECT artifact_path FROM simulations WHERE project_id = ? OR id = ? ORDER BY created_at DESC LIMIT 1",
                        (project_id, project_id)
                    )
                    row = cursor.fetchone()
                    conn.close()
                    if row and row[0]:
                        artifact_path = row[0]
                        break
                except Exception as e:
                    logger.debug(f"Failed to query DB at {db_path}: {e}")
                    
        if artifact_path:
            full_path = self.project_root / artifact_path
            if full_path.exists():
                return full_path
            full_path_backend = self.project_root / "backend" / artifact_path
            if full_path_backend.exists():
                return full_path_backend
                
        # Fallback filesystem search
        clean_id = project_id.replace("-", "")
        simulations_dir = self.project_root / "backend" / "tmp" / "simulations"
        if simulations_dir.exists():
            for path in simulations_dir.iterdir():
                if path.is_dir() and (clean_id in path.name.replace("-", "")):
                    return path
                    
        return None

    def validate_simulation_completion(self) -> bool:
        """Checks if the simulation directory contains files indicating a successful completion."""
        if not self.output_dir.exists():
            return False
            
        # Verify exit code in runner metadata
        logs_dir = self.simulation_dir / "logs"
        runner_metadata = logs_dir / "runner_metadata.json"
        
        if runner_metadata.exists():
            try:
                import json
                with open(runner_metadata, "r") as f:
                    meta = json.load(f)
                if meta.get("exit_code") == 0:
                    return True
            except Exception:
                pass
                
        # Check stderr for any crash indicator
        stderr_file = logs_dir / "palace_stderr.log"
        if stderr_file.exists() and stderr_file.stat().st_size > 0:
            try:
                with open(stderr_file, "r") as f:
                    stderr_content = f.read().lower()
                if "error" in stderr_content or "abort" in stderr_content:
                    return False
            except Exception:
                pass
                
        # Fallback to checking logs text
        palace_stdout = logs_dir / "palace_stdout.log"
        if palace_stdout.exists():
            try:
                with open(palace_stdout, "r") as f:
                    content = f.read()
                if "Linear eigensolve converged" in content or "Elapsed Time Report" in content:
                    return True
            except Exception:
                pass
                
        # Verify if eig.csv exists and is populated
        eig_file = self.output_dir / "eig.csv"
        if eig_file.exists() and eig_file.stat().st_size > 0:
            return True
            
        return False

    def check_mesh_files(self) -> dict:
        """Scans the output directories for mesh files and reports sizes and field metadata."""
        pvtu_files = list(self.output_dir.rglob("*.pvtu"))
        vtu_files = list(self.output_dir.rglob("*.vtu"))
        
        files_info = []
        total_size = 0
        point_fields_detected = set()
        cell_fields_detected = set()
        
        for p in pvtu_files:
            size_bytes = p.stat().st_size
            total_size += size_bytes
            header = read_pvtu_header(p)
            
            point_fields_detected.update(header.get("point_fields", []))
            cell_fields_detected.update(header.get("cell_fields", []))
            
            files_info.append({
                "name": p.name,
                "relative_path": str(p.relative_to(self.output_dir)),
                "size_mb": round(size_bytes / (1024 * 1024), 2),
                "point_fields": header.get("point_fields", []),
                "cell_fields": header.get("cell_fields", []),
                "pieces_count": len(header.get("pieces", []))
            })
            
        return {
            "count": len(pvtu_files),
            "vtu_count": len(vtu_files),
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "point_fields": list(point_fields_detected),
            "cell_fields": list(cell_fields_detected),
            "files": files_info
        }

    def _verify_pvtu_data_non_zero(self, filepath: Path, keys: List[str]) -> str:
        try:
            dataset = pv.read(str(filepath))
            target_key = None
            for key in keys:
                if key in dataset.point_data:
                    target_key = key
                    break
            if not target_key:
                return "Missing"
                
            arr = np.asarray(dataset.point_data[target_key])
            norm = np.linalg.norm(arr)
            if norm > 1e-12:
                return "Valid"
            else:
                return "Zero Data"
        except Exception as e:
            logger.error(f"Error checking data integrity for {filepath}: {e}")
            return "Corrupted/Read Error"

    def check_field_data(self) -> dict:
        """Verifies presence and validity of primary simulation fields."""
        pvtu_files = list(self.output_dir.rglob("*.pvtu"))
        if not pvtu_files:
            return {"E": "Missing", "B": "Missing", "U_e": "Missing", "U_m": "Missing", "error": "No pvtu files found"}
            
        e_field_status = "Missing"
        b_field_status = "Missing"
        ue_status = "Missing"
        um_status = "Missing"
        
        # Check if separate files exist
        has_separate_e = any("-E.pvtu" in p.name or "_E.pvtu" in p.name for p in pvtu_files)
        
        if has_separate_e:
            for p in pvtu_files:
                name = p.name.lower()
                if "e.pvtu" in name:
                    e_field_status = self._verify_pvtu_data_non_zero(p, ["E", "E_real", "E_imag"])
                elif "b.pvtu" in name:
                    b_field_status = self._verify_pvtu_data_non_zero(p, ["B", "B_real", "B_imag"])
                elif "u_e.pvtu" in name or "ue.pvtu" in name:
                    ue_status = self._verify_pvtu_data_non_zero(p, ["U_e", "U_s"])
                elif "u_m.pvtu" in name or "um.pvtu" in name:
                    um_status = self._verify_pvtu_data_non_zero(p, ["U_m"])
        else:
            # Unified data.pvtu files - check fields inside first non-boundary file
            target_pvtu = None
            for p in pvtu_files:
                if "boundary" not in p.parts and "boundary" not in p.name.lower():
                    target_pvtu = p
                    break
            if not target_pvtu:
                target_pvtu = pvtu_files[0]
                
            header = read_pvtu_header(target_pvtu)
            point_fields = header.get("point_fields", [])
            
            if any(f in point_fields for f in ["E", "E_real", "E_imag"]):
                e_field_status = self._verify_pvtu_data_non_zero(target_pvtu, ["E", "E_real", "E_imag"])
            if any(f in point_fields for f in ["B", "B_real", "B_imag"]):
                b_field_status = self._verify_pvtu_data_non_zero(target_pvtu, ["B", "B_real", "B_imag"])
            if "U_e" in point_fields:
                ue_status = self._verify_pvtu_data_non_zero(target_pvtu, ["U_e"])
            if "U_m" in point_fields:
                um_status = self._verify_pvtu_data_non_zero(target_pvtu, ["U_m"])
                
        return {
            "E": e_field_status,
            "B": b_field_status,
            "U_e": ue_status,
            "U_m": um_status
        }

    def parse_frequencies(self) -> dict:
        """Parses solved eigenvalues to extract frequency values in GHz and Quality factors."""
        eig_file = None
        for name in ["eig.csv", "eigenvalues.csv"]:
            path = self.output_dir / name
            if path.exists():
                eig_file = path
                break
                
        if not eig_file:
            return {
                "count": 0,
                "values": [],
                "q_factors": [],
                "range_ghz": (0.0, 0.0),
                "error": "No eigenvalues file found (eig.csv / eigenvalues.csv)"
            }
            
        try:
            frequencies = []
            q_factors = []
            with open(eig_file, "r") as f:
                lines = f.readlines()
                
            for line in lines:
                line = line.strip()
                if not line or line.startswith("m,") or line.startswith("Re{f}"):
                    continue
                parts = [p.strip() for p in line.split(",") if p.strip()]
                if len(parts) >= 4:
                    try:
                        re_f = float(parts[1])
                        q = float(parts[3])
                        
                        # Convert Hz to GHz
                        freq_ghz = re_f
                        if freq_ghz > 1e6:
                            freq_ghz = freq_ghz / 1e9
                            
                        frequencies.append(freq_ghz)
                        q_factors.append(q)
                    except ValueError:
                        continue
                        
            if not frequencies:
                return {
                    "count": 0,
                    "values": [],
                    "q_factors": [],
                    "range_ghz": (0.0, 0.0),
                    "error": "Eigenvalues file contains no valid rows"
                }
                
            return {
                "count": len(frequencies),
                "values": frequencies,
                "q_factors": q_factors,
                "range_ghz": (min(frequencies), max(frequencies))
            }
        except Exception as e:
            return {
                "count": 0,
                "values": [],
                "q_factors": [],
                "range_ghz": (0.0, 0.0),
                "error": f"Failed to parse eigenvalues file: {e}"
            }

    def check_mesh_geometry(self) -> dict:
        """Extracts statistics about mesh vertices and elements."""
        pvtu_files = list(self.output_dir.rglob("*.pvtu"))
        if not pvtu_files:
            return {"vertices": 0, "elements": 0, "error": "No pvtu mesh files found"}
            
        target_pvtu = None
        for p in pvtu_files:
            if "boundary" not in p.parts and "boundary" not in p.name.lower():
                target_pvtu = p
                break
        if not target_pvtu:
            target_pvtu = pvtu_files[0]
            
        try:
            dataset = pv.read(str(target_pvtu))
            vertices = dataset.n_points
            elements = dataset.n_cells
            
            # Check for mesh refinement ratio
            try:
                sizes_ds = dataset.compute_cell_sizes()
                if "Volume" in sizes_ds.cell_data:
                    cell_sizes = sizes_ds.cell_data["Volume"]
                elif "Area" in sizes_ds.cell_data:
                    cell_sizes = sizes_ds.cell_data["Area"]
                else:
                    cell_sizes = None
                
                if cell_sizes is not None and len(cell_sizes) > 0:
                    min_size = float(np.min(cell_sizes))
                    max_size = float(np.max(cell_sizes))
                    size_ratio = max_size / max(min_size, 1e-20)
                    refinement_visible = size_ratio > 10.0
                else:
                    size_ratio = 1.0
                    refinement_visible = False
            except Exception:
                size_ratio = 1.0
                refinement_visible = False
                
            return {
                "vertices": vertices,
                "elements": elements,
                "type": type(dataset).__name__,
                "size_ratio": round(size_ratio, 2),
                "refinement_visible": refinement_visible
            }
        except Exception as e:
            return {"vertices": 0, "elements": 0, "error": f"Failed to parse mesh geometry: {e}"}

    def check_port_data(self) -> dict:
        """Validates outputs for quality factors, currents, and voltages at ports."""
        port_files = {
            "Q": ["port-Q.csv", "eig.csv"],
            "V": ["port-V.csv"],
            "I": ["port-I.csv"]
        }
        
        status = {}
        for key, names in port_files.items():
            found = False
            for name in names:
                path = self.output_dir / name
                if path.exists() and path.stat().st_size > 0:
                    found = True
                    break
            status[f"{key}_file_exists"] = found
            
        all_found = all(status.values())
        status["status"] = "Valid" if all_found else ("Partial" if any(status.values()) else "Missing")
        return status

    def assess_visualization_readiness(self) -> dict:
        """Determines which frontend tabs can render with the available data."""
        field_status = self.check_field_data()
        freq_status = self.parse_frequencies()
        geom_status = self.check_mesh_geometry()
        
        has_e = field_status.get("E") == "Valid"
        has_freqs = freq_status.get("count", 0) > 0
        has_geom = geom_status.get("vertices", 0) > 100
        has_energy = field_status.get("U_e") == "Valid" or field_status.get("U_m") == "Valid"
        
        return {
            "e_field_3d": has_e and has_geom,
            "mesh_wireframe": has_geom,
            "energy_density": has_energy and has_geom,
            "results_table": has_freqs
        }

    def generate_report(self) -> dict:
        """Generates a structured dictionary containing all validation metrics and reports."""
        errors = []
        warnings = []
        
        # 1. Completion checks
        completion_status = self.validate_simulation_completion()
        if not completion_status:
            errors.append("Simulation never ran or failed before completion.")
            
        # 2. Check mesh files
        mesh_status = self.check_mesh_files()
        if mesh_status.get("count", 0) == 0:
            errors.append("No mesh output generated.")
            
        large_files = [f for f in mesh_status.get("files", []) if f.get("size_mb", 0.0) >= 5.0]
        # Ignore boundary files when checking for large volumetric files
        vol_files = [f for f in mesh_status.get("files", []) if "boundary" not in f["name"].lower()]
        if vol_files and not any(f.get("size_mb", 0.0) >= 5.0 for f in vol_files):
            warnings.append("Output incomplete: all volumetric mesh files are smaller than 5MB.")
            
        # 3. Check field data
        field_status = self.check_field_data()
        if field_status.get("E") == "Missing":
            errors.append("CRITICAL: Cannot visualize E-field (E-field data missing).")
        elif field_status.get("E") in ["Zero Data", "Corrupted/Read Error"]:
            errors.append(f"CRITICAL: E-field data is invalid ({field_status.get('E')}).")
            
        if field_status.get("B") == "Missing":
            warnings.append("Optional but recommended B-field data is missing.")
        if field_status.get("U_e") == "Missing" and field_status.get("U_m") == "Missing":
            warnings.append("Optional energy density data is missing (can still view E-field).")
            
        # 4. Parse frequencies
        freq_status = self.parse_frequencies()
        if freq_status.get("count", 0) == 0:
            errors.append("No frequencies computed (eigenvalues.csv or eig.csv missing/empty).")
        else:
            invalid_freqs = [f for f in freq_status.get("values", []) if not (0.0 < f < 20.0)]
            if len(invalid_freqs) == freq_status.get("count", 0):
                warnings.append("All frequencies are outside the standard 0-20 GHz range.")
                
        # 5. Check mesh geometry
        geom_status = self.check_mesh_geometry()
        vertices = geom_status.get("vertices", 0)
        elements = geom_status.get("elements", 0)
        if vertices < 100 and mesh_status.get("count", 0) > 0:
            errors.append(f"Mesh too coarse or corrupted (vertices = {vertices} < 100).")
        elif vertices < 1000 and mesh_status.get("count", 0) > 0:
            warnings.append(f"Mesh is relatively coarse (vertices = {vertices} < 1000).")
            
        # 6. Check port data
        port_status = self.check_port_data()
        if port_status.get("status") == "Missing":
            warnings.append("Optional port data (voltage/current/Q) is missing.")
            
        # 7. Assess visualization readiness
        viz_readiness = self.assess_visualization_readiness()
        
        # Determine overall status
        if errors:
            status = "FAIL"
        elif warnings:
            status = "PARTIAL"
        else:
            status = "PASS"
            
        # Generate next steps
        next_steps = []
        if status == "FAIL":
            for err in errors:
                next_steps.append(err)
            next_steps.append("Check solver logs under logs/ directory for compiler or runtime errors.")
        elif status == "PARTIAL":
            for warn in warnings:
                next_steps.append(warn)
            next_steps.append("Review Palace simulation configuration to enable optional exports (B-field, energy densities, etc.).")
        else:
            next_steps.append("All diagnostic checks passed. Output is ready for high-fidelity 3D visualization.")
            
        # File inventory
        file_inventory = []
        if self.output_dir.exists():
            for p in self.output_dir.rglob("*"):
                if p.is_file():
                    file_inventory.append({
                        "name": p.name,
                        "relative_path": str(p.relative_to(self.output_dir)),
                        "size_bytes": p.stat().st_size,
                        "size_mb": round(p.stat().st_size / (1024 * 1024), 2)
                    })
                    
        return {
            "project_id": self.project_id,
            "status": status,
            "completion_status": "completed" if completion_status else "failed/incomplete",
            "modes_computed": freq_status.get("count", 0),
            "visualization_readiness": viz_readiness,
            "mesh_statistics": geom_status,
            "field_status": field_status,
            "frequencies": freq_status.get("values", []),
            "q_factors": freq_status.get("q_factors", []),
            "file_inventory": file_inventory,
            "errors": errors,
            "warnings": warnings,
            "next_steps": next_steps
        }

    def print_report(self) -> None:
        """Outputs a beautiful, formatted console validation report."""
        report = self.generate_report()
        
        # Colors
        GREEN = "\033[92m"
        YELLOW = "\033[93m"
        RED = "\033[91m"
        CYAN = "\033[96m"
        BOLD = "\033[1m"
        RESET = "\033[0m"
        
        status = report["status"]
        status_color = GREEN if status == "PASS" else (YELLOW if status == "PARTIAL" else RED)
        
        print("\n" + "=" * 60)
        print(f" {BOLD}PALACE SIMULATION OUTPUT DIAGNOSTIC REPORT{RESET} ")
        print("=" * 60)
        print(f"Project ID:       {report['project_id']}")
        print(f"Overall Status:   {status_color}{BOLD}{status}{RESET}")
        print(f"Solver Outcome:   {report['completion_status'].upper()}")
        print("-" * 60)
        
        # Visualization Readiness
        print(f"{BOLD}Visualization Readiness:{RESET}")
        for tab, ready in report["visualization_readiness"].items():
            marker = f"{GREEN}✓ YES{RESET}" if ready else f"{RED}✗ NO{RESET}"
            print(f"  - {tab:<20}: {marker}")
        print("-" * 60)
        
        # Mesh Statistics
        mesh_stats = report["mesh_statistics"]
        if mesh_stats.get("vertices", 0) > 0:
            print(f"{BOLD}Mesh Statistics:{RESET}")
            print(f"  - Vertices    : {mesh_stats['vertices']}")
            print(f"  - Elements    : {mesh_stats['elements']}")
            print(f"  - Mesh Type   : {mesh_stats['type']}")
            print(f"  - Size Ratio  : {mesh_stats['size_ratio']}")
            print(f"  - Refined Mesh: {GREEN}YES{RESET}" if mesh_stats['refinement_visible'] else f"  - Refined Mesh: {YELLOW}NO{RESET}")
        else:
            print(f"{RED}No mesh data could be loaded.{RESET}")
        print("-" * 60)
        
        # Field Status
        print(f"{BOLD}Fields Integrity:{RESET}")
        for field, f_status in report["field_status"].items():
            if f_status == "Valid":
                color = GREEN
            elif f_status in ["Zero Data", "Missing"]:
                color = RED if field == "E" else YELLOW
            else:
                color = RED
            print(f"  - {field:<4}: {color}{f_status}{RESET}")
        print("-" * 60)
        
        # Frequencies
        print(f"{BOLD}Eigenmodes Resolved:{RESET}")
        print(f"  - Total Modes: {report['modes_computed']}")
        if report["frequencies"]:
            for idx, (freq, q) in enumerate(zip(report["frequencies"], report["q_factors"]), 1):
                print(f"    Mode {idx}: {freq:.4f} GHz (Q = {q:.2e})")
        print("-" * 60)
        
        # Next Steps
        print(f"{BOLD}Next Action Steps:{RESET}")
        for step in report["next_steps"]:
            print(f"  * {step}")
        print("=" * 60 + "\n")
