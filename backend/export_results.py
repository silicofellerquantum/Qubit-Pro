"""
Export all Palace simulation results into a single clean folder on the Desktop.

Run with:
    python export_results.py

Output:
    ~/Desktop/simulation_results/
        ├── README.txt                     ← explains every file
        ├── sim_<short_id>_electrostatic/  ← capacitance matrix sim
        │   ├── results/                   ← CSV physics outputs
        │   ├── config/                    ← Palace config.json
        │   ├── mesh/                      ← mesh metadata & quality
        │   ├── logs/                      ← solver stdout/stderr
        │   └── summary.txt               ← human-readable summary
        ├── sim_<short_id>_eigenmode/      ← main qubit/resonator sim
        │   └── ...
        └── simulation_results.zip         ← single zip of everything
"""

import csv
import json
import os
import re
import shutil
import textwrap
from pathlib import Path
from datetime import datetime

# ─── CONFIG ──────────────────────────────────────────────────────────────────
SIM_DATA_ROOT = Path("/home/drdo/simulations-data/tmp")
OUTPUT_DIR    = Path("/home/drdo/Desktop/simulation_results")
DB_PATH       = Path("/home/drdo/Desktop/sim-spack/backend/dev.db")
# ─────────────────────────────────────────────────────────────────────────────


def read_csv_as_dicts(path: Path) -> list[dict]:
    """Read a CSV file and return list of row dicts."""
    if not path.exists():
        return []
    try:
        with open(path, newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        return rows
    except Exception as e:
        return [{"error": str(e)}]


def format_csv_table(rows: list[dict], max_rows: int = 40) -> str:
    """Format CSV rows as a pretty-printed text table."""
    if not rows:
        return "  (no data)\n"
    headers = list(rows[0].keys())
    widths  = {h: max(len(h), max((len(str(r.get(h, ""))) for r in rows[:max_rows]), default=0))
               for h in headers}
    sep   = "  ".join("-" * widths[h] for h in headers)
    head  = "  ".join(h.ljust(widths[h]) for h in headers)
    lines = [head, sep]
    for i, row in enumerate(rows):
        if i >= max_rows:
            lines.append(f"  ... ({len(rows) - max_rows} more rows not shown)")
            break
        lines.append("  ".join(str(row.get(h, "")).ljust(widths[h]) for h in headers))
    return "\n".join(lines) + "\n"


def build_summary(sim_dir: Path, solver_type: str) -> str:
    """Build a human-readable summary.txt for a simulation workspace."""
    out_dir = sim_dir / "config" / "out"
    mesh_meta_file = sim_dir / "mesh" / "mesh_metadata.json"
    config_meta_file = sim_dir / "config" / "config_metadata.json"
    runner_meta_file = sim_dir / "logs" / "runner_metadata.json"

    lines = []
    lines.append("=" * 70)
    lines.append(f"SIMULATION RESULTS SUMMARY")
    lines.append(f"Solver: {solver_type.upper()}")
    lines.append(f"Workspace: {sim_dir.name}")
    lines.append(f"Exported: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append("=" * 70)

    # Runner metadata
    if runner_meta_file.exists():
        try:
            rm = json.loads(runner_meta_file.read_text())
            lines.append("\n── EXECUTION INFO ─────────────────────────────────────────────────")
            lines.append(f"  Status     : {rm.get('status', 'unknown').upper()}")
            lines.append(f"  Started    : {rm.get('started_at', '?')}")
            lines.append(f"  Completed  : {rm.get('completed_at', '?')}")
            rt = rm.get("runtime_seconds")
            if rt:
                lines.append(f"  Runtime    : {float(rt):.1f} seconds ({float(rt)/60:.1f} minutes)")
            lines.append(f"  MPI Ranks  : {rm.get('mpi_ranks', '?')}")
            lines.append(f"  Palace exit: {rm.get('return_code', '?')}")
        except Exception as e:
            lines.append(f"  (Could not parse runner_metadata.json: {e})")

    # Mesh info
    if mesh_meta_file.exists():
        try:
            mm = json.loads(mesh_meta_file.read_text())
            lines.append("\n── MESH INFO ──────────────────────────────────────────────────────")
            lines.append(f"  Total elements : {mm.get('element_count', '?'):,}")
            lines.append(f"  Tetrahedra     : {mm.get('tet_count', '?'):,}")
            lines.append(f"  Triangle faces : {mm.get('triangle_count', '?'):,}")
            lines.append(f"  Nodes          : {mm.get('node_count', '?'):,}")
            bb = mm.get("bounding_box", [])
            if len(bb) >= 6:
                lines.append(f"  Bounding box   : X [{bb[0]:.3f} .. {bb[3]:.3f}] mm")
                lines.append(f"                   Y [{bb[1]:.3f} .. {bb[4]:.3f}] mm")
                lines.append(f"                   Z [{bb[2]:.3f} .. {bb[5]:.3f}] mm")
            q_file = sim_dir / "mesh" / "mesh_quality.json"
            if q_file.exists():
                q = json.loads(q_file.read_text())
                lines.append(f"  Max aspect ratio: {q.get('max_aspect_ratio', '?')}")
                lines.append(f"  Min quality     : {q.get('min_quality', '?'):.2e}" if q.get('min_quality') else "")
        except Exception as e:
            lines.append(f"  (Could not parse mesh metadata: {e})")

    # Config info
    if config_meta_file.exists():
        try:
            cm = json.loads(config_meta_file.read_text())
            lines.append("\n── BOUNDARY MAPPING ───────────────────────────────────────────────")
            bounds = cm.get("mapped_boundaries", {})
            ports  = bounds.get("ports", {})
            terms  = bounds.get("terminals", {})
            if ports:
                lines.append(f"  Josephson Junction Ports ({len(ports)}):")
                for name, tag in sorted(ports.items()):
                    lines.append(f"    {name} → attribute {tag}")
            if terms:
                lines.append(f"  PEC Terminals ({len(terms)}):")
                for name, tag in sorted(terms.items()):
                    lines.append(f"    {name} → attribute {tag}")
        except Exception as e:
            lines.append(f"  (Could not parse config metadata: {e})")

    # ── Physics results ──────────────────────────────────────────────────────
    if solver_type == "eigenmode":
        eig_path = out_dir / "eig.csv"
        epr_path = out_dir / "port-EPR.csv"
        portv_path = out_dir / "port-V.csv"
        porti_path = out_dir / "port-I.csv"

        if eig_path.exists():
            lines.append("\n── EIGENMODE RESULTS (eig.csv) ────────────────────────────────────")
            rows = read_csv_as_dicts(eig_path)
            lines.append(format_csv_table(rows))
            # Flag suspicious modes
            physical = [r for r in rows if float(r.get("Re{f} (GHz)","0") or 0) < 50
                        and float(r.get("Q","0") or 0) > 5]
            spurious = [r for r in rows if float(r.get("Re{f} (GHz)","0") or 0) >= 50
                        or float(r.get("Q","0") or 0) <= 5]
            lines.append(f"  Physical modes (f<50GHz, Q>5) : {len(physical)}")
            lines.append(f"  Spurious modes                 : {len(spurious)}")

        if epr_path.exists():
            lines.append("\n── ENERGY PARTICIPATION RATIOS (port-EPR.csv) ──────────────────────")
            rows = read_csv_as_dicts(epr_path)
            lines.append(format_csv_table(rows, max_rows=10))

        if portv_path.exists():
            lines.append("\n── PORT VOLTAGES (port-V.csv) ──────────────────────────────────────")
            rows = read_csv_as_dicts(portv_path)
            lines.append(format_csv_table(rows, max_rows=10))

        if porti_path.exists():
            lines.append("\n── PORT CURRENTS (port-I.csv) ──────────────────────────────────────")
            rows = read_csv_as_dicts(porti_path)
            lines.append(format_csv_table(rows, max_rows=10))

    elif solver_type == "electrostatic":
        c_path   = out_dir / "terminal-C.csv"
        cm_path  = out_dir / "terminal-Cm.csv"
        cinv_path= out_dir / "terminal-Cinv.csv"
        v_path   = out_dir / "terminal-V.csv"

        if c_path.exists():
            lines.append("\n── CAPACITANCE MATRIX (terminal-C.csv) — units: Farads ────────────")
            rows = read_csv_as_dicts(c_path)
            lines.append(format_csv_table(rows))

        if cm_path.exists():
            lines.append("\n── MAXWELL CAPACITANCE (terminal-Cm.csv) ───────────────────────────")
            rows = read_csv_as_dicts(cm_path)
            lines.append(format_csv_table(rows))

        if cinv_path.exists():
            lines.append("\n── INVERSE CAPACITANCE (terminal-Cinv.csv) ─────────────────────────")
            rows = read_csv_as_dicts(cinv_path)
            lines.append(format_csv_table(rows))

        if v_path.exists():
            lines.append("\n── TERMINAL VOLTAGES (terminal-V.csv) ──────────────────────────────")
            rows = read_csv_as_dicts(v_path)
            lines.append(format_csv_table(rows))

    # Error indicators
    err_path = out_dir / "error-indicators.csv"
    if err_path.exists():
        lines.append("\n── MESH ERROR INDICATORS (error-indicators.csv) ───────────────────")
        rows = read_csv_as_dicts(err_path)
        lines.append(format_csv_table(rows))

    # Domain energy
    de_path = out_dir / "domain-E.csv"
    if de_path.exists():
        lines.append("\n── DOMAIN ENERGIES (domain-E.csv) ──────────────────────────────────")
        rows = read_csv_as_dicts(de_path)
        lines.append(format_csv_table(rows, max_rows=10))

    return "\n".join(lines)


def detect_solver_type(sim_dir: Path) -> str:
    """Read config_metadata.json or config.json to determine solver type."""
    cm = sim_dir / "config" / "config_metadata.json"
    if cm.exists():
        try:
            d = json.loads(cm.read_text())
            return d.get("solver_type", "unknown").lower()
        except Exception:
            pass
    cfg = sim_dir / "config" / "config.json"
    if cfg.exists():
        try:
            d = json.loads(cfg.read_text())
            t = d.get("Problem", {}).get("Type", "unknown")
            return t.lower()
        except Exception:
            pass
    return "unknown"


def export_simulation(sim_dir: Path, dest_base: Path) -> Path:
    """Copy a simulation workspace into a clean output folder, skip paraview."""
    solver = detect_solver_type(sim_dir)
    short_id = sim_dir.name.replace("simulation_", "")[:16]
    folder_name = f"sim_{short_id}_{solver}"
    dest = dest_base / folder_name
    dest.mkdir(parents=True, exist_ok=True)

    # Copy key subfolders, include paraview since space is saved now
    for section in ("config", "mesh", "geometry", "logs"):
        src = sim_dir / section
        if not src.exists():
            continue
        dst = dest / section
        if section == "config":
            dst.mkdir(parents=True, exist_ok=True)
            # Copy config.json and config_metadata.json directly
            for f in src.glob("*.json"):
                shutil.copy2(f, dst / f.name)
            # Copy out/ and include paraview/
            out_src = src / "out"
            out_dst = dst / "out"
            if out_src.exists():
                out_dst.mkdir(parents=True, exist_ok=True)
                for f in out_src.iterdir():
                    if f.is_file():
                        shutil.copy2(f, out_dst / f.name)
                    elif f.is_dir() and f.name == "paraview":
                        try:
                            dir_size = sum(fp.stat().st_size for fp in f.rglob('*') if fp.is_file())
                            if dir_size < 500 * 1024 * 1024:
                                shutil.copytree(str(f), str(out_dst / f.name), dirs_exist_ok=True)
                            else:
                                print(f"  ⚠ Skipping large paraview directory for {sim_dir.name} ({dir_size / (1024*1024):.1f} MB)")
                        except Exception:
                            pass
        else:
            shutil.copytree(str(src), str(dst), dirs_exist_ok=True)

    # Write summary
    summary_txt = build_summary(sim_dir, solver)
    (dest / "summary.txt").write_text(summary_txt, encoding="utf-8")

    print(f"  ✓ Exported {sim_dir.name} → {dest.name}/")
    return dest


def write_readme(output_dir: Path):
    readme = textwrap.dedent("""
    SIMULATION RESULTS — Quantum Chip Palace EM Simulations
    =========================================================

    This folder contains the exported results from all 3 Palace simulations.

    FOLDER STRUCTURE
    ─────────────────
    sim_<id>_eigenmode/       ← 5-qubit eigenmode analysis (main result)
      summary.txt             ← Human-readable results summary (START HERE)
      config/
        config.json           ← Palace solver input configuration
        config_metadata.json  ← Boundary/terminal/port mapping
        out/
          eig.csv             ← Eigenfrequencies (GHz) and Q-factors
          port-EPR.csv        ← Energy Participation Ratios per junction
          port-V.csv          ← Port voltages (V) for each mode
          port-I.csv          ← Port currents (A) for each mode
          domain-E.csv        ← Electric energy per subdomain per mode
          error-indicators.csv← Mesh adaptive refinement indicators
          palace.json         ← Palace internal solver timing/stats
      mesh/
        mesh_metadata.json    ← Element counts, bounding box, physical groups
        mesh_quality.json     ← Aspect ratio, min quality, poor element count
        mesh.msh              ← GMSH mesh file (open with GMSH or ParaView)
        mesh.log              ← GMSH generation log
      geometry/
        geometry.geo          ← GMSH geometry script (human-readable)
        geometry_metadata.json← Component bounding boxes, port positions
        design.json           ← Full design payload (V2 graph)
        geometry.step         ← 3D CAD solid (open with FreeCAD/Fusion 360)
      logs/
        palace_stdout.log     ← Palace solver output (convergence history)
        palace_stderr.log     ← Palace error messages (if any)
        runner.log            ← Python simulation runner log
        runner_metadata.json  ← Execution timing, MPI ranks, return code

    sim_<id>_electrostatic/   ← Capacitance matrix extraction
      config/out/
        terminal-C.csv        ← Full capacitance matrix (Farads)
        terminal-Cm.csv       ← Maxwell (partial) capacitance matrix
        terminal-Cinv.csv     ← Inverse capacitance (Elastance) matrix
        terminal-V.csv        ← Terminal voltages per excitation

    sim_<id>_unknown/         ← Third simulation (partial data)

    KEY RESULTS TO LOOK AT FIRST
    ──────────────────────────────
    1. Open summary.txt in each sim folder
    2. Open eig.csv — look for modes in the 4–8 GHz range (qubit/resonator)
    3. Open port-EPR.csv — values should be between 0 and 1 (physical range)
    4. Open terminal-C.csv — diagonal = self-capacitance in Farads

    HOW TO OPEN MESH FILES
    ────────────────────────
    • mesh.msh   → GMSH (free): https://gmsh.info/
    • geometry.step → FreeCAD (free): https://freecad.org/
    • ParaView VTU files (Included here under paraview/ in the config/out folder)

    ORIGINAL DATA LOCATION (on server)
    ─────────────────────────────────────
    /home/drdo/simulations-data/tmp/
    """).strip()
    (output_dir / "README.txt").write_text(readme, encoding="utf-8")


def main():
    print("\n🔬 Palace Simulation Results Exporter")
    print("=" * 50)

    # Clean previous export
    if OUTPUT_DIR.exists():
        print(f"  Removing old export at {OUTPUT_DIR}")
        shutil.rmtree(OUTPUT_DIR)
    OUTPUT_DIR.mkdir(parents=True)

    # Find all simulation workspaces
    sim_dirs = sorted([d for d in SIM_DATA_ROOT.iterdir() if d.is_dir() and d.name.startswith("simulation_")])
    print(f"  Found {len(sim_dirs)} simulation workspace(s)")

    exported = []
    for sim_dir in sim_dirs:
        print(f"\n  Processing: {sim_dir.name}")
        exported.append(export_simulation(sim_dir, OUTPUT_DIR))

    # Write README
    write_readme(OUTPUT_DIR)

    # Create zip archive
    zip_path = OUTPUT_DIR / "simulation_results.zip"
    print(f"\n  📦 Creating zip archive...")
    shutil.make_archive(
        str(OUTPUT_DIR / "simulation_results"),
        "zip",
        root_dir=OUTPUT_DIR.parent,
        base_dir=OUTPUT_DIR.name,
    )
    zip_size_mb = zip_path.stat().st_size / (1024 * 1024)
    print(f"  ✓ Zip created: {zip_path} ({zip_size_mb:.1f} MB)")

    # Print final summary
    print(f"\n{'=' * 50}")
    print(f"✅ EXPORT COMPLETE")
    print(f"   Folder : {OUTPUT_DIR}")
    print(f"   Zip    : {zip_path}")
    print(f"   Size   : {zip_size_mb:.1f} MB")
    print(f"\n  Contents:")
    for p in sorted(OUTPUT_DIR.iterdir()):
        if p.is_dir():
            n = sum(1 for _ in p.rglob("*") if _.is_file())
            print(f"    📁 {p.name}/  ({n} files)")
        else:
            print(f"    📄 {p.name}  ({p.stat().st_size/1024:.0f} KB)")
    print()


if __name__ == "__main__":
    main()
