#!/usr/bin/env python3
"""Verification script for running the first real AWS Palace simulation end-to-end."""

import asyncio
import os
import sys
import json
import shutil
import logging
from pathlib import Path

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("test_real_palace")

# Ensure backend root is in PYTHONPATH
backend_dir = Path(__file__).resolve().parent
sys.path.append(str(backend_dir))

from app.services.palace.geometry_builder import GeometryBuilder
from app.services.palace.config_generator import ConfigGenerator
from app.services.palace.gmsh_builder import GmshBuilder
from app.services.palace.palace_runner import PalaceRunner
from app.services.palace.result_parser import ResultParser
from app.services.palace.models import PalaceSolverType


async def check_prerequisites():
    """Verify all system and package dependencies are met."""
    logger.info("=== Checking Prerequisites ===")
    
    # 1. Check GMSH import
    try:
        import gmsh
        logger.info("[PASS] GMSH python package is importable.")
    except ImportError as e:
        logger.error("[FAIL] GMSH python package is not importable: %s", e)
        sys.exit(1)

    # 2. Check Docker daemon running
    proc_info = await asyncio.create_subprocess_exec(
        "docker", "info",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout_info, stderr_info = await proc_info.communicate()
    if proc_info.returncode != 0:
        err_msg = stderr_info.decode(errors="replace").strip()
        logger.error("[FAIL] Docker daemon is not running: %s", err_msg)
        sys.exit(1)
    logger.info("[PASS] Docker daemon is running and reachable.")

    # 3. Check palace-sim:latest image exists
    proc_img = await asyncio.create_subprocess_exec(
        "docker", "image", "inspect", "palace-sim:latest",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout_img, stderr_img = await proc_img.communicate()
    if proc_img.returncode != 0:
        logger.error("[FAIL] Docker image 'palace-sim:latest' is missing locally.")
        sys.exit(1)
    logger.info("[PASS] Docker image 'palace-sim:latest' is available locally.")
    logger.info("=== Prerequisites OK ===\n")


async def main():
    # Verify environment
    await check_prerequisites()

    # 1. Build a minimal valid design payload (2.0 mm chip, 1 qubit)
    payload = {
        "project_name": "Validation Palace Chip",
        "id": "design_validation_1",
        "v2": {
            "graph": {
                "chip_name": "validation_chip",
                "chip_width_mm": 2.0,
                "chip_height_mm": 2.0,
                "substrate": "silicon",
                "metal": "aluminum",
                "nodes": [
                    {
                        "id": "Q1",
                        "kind": "qubit",
                        "x_mm": 0.0,
                        "y_mm": 0.0,
                        "orientation_deg": 0.0,
                        "params": {
                            "frequency_ghz": 5.0,
                            "pad_width_um": 400.0,
                            "pad_height_um": 80.0,
                            "pad_gap_um": 30.0,
                            "pocket_width_um": 600.0,
                            "pocket_height_um": 600.0,
                            "L_nH": 10.0
                        }
                    }
                ]
            }
        }
    }

    # Setup diagnostic persist directory
    debug_dir = backend_dir / "tmp" / "palace_debug"
    debug_dir.mkdir(parents=True, exist_ok=True)
    
    config_debug_path = debug_dir / "config.json"
    mesh_debug_path = debug_dir / "mesh.msh"

    logger.info("=== Step 1: Parsing Design Payload ===")
    geometry = GeometryBuilder.build_geometry(payload)
    logger.info("Geometry constructed successfully: %s", geometry.design_id)

    logger.info("\n=== Step 2: Generating Palace Solver Configuration ===")
    config_data = ConfigGenerator.generate_config(geometry, PalaceSolverType.EIGENMODE)
    with open(config_debug_path, "w", encoding="utf-8") as f:
        json.dump(config_data, f, indent=2)
    logger.info("Saved solver configuration copy to: %s", config_debug_path)

    logger.info("\n=== Step 3: Generating Physical GMSH Mesh ===")
    # Generate the physical mesh directly to debug path first
    # Using coarse=False to check the real-world high-resolution mesh generation
    GmshBuilder.generate_mesh(geometry, mesh_debug_path, coarse=True)
    logger.info("Physical mesh generated successfully at: %s", mesh_debug_path)

    logger.info("\n=== Step 4: Executing Palace Simulation (mock_mode=False) ===")
    runner = PalaceRunner(mock_mode=False, docker_image="palace-sim:latest")
    
    # We will pass the geometry directly so that the runner generates the mesh inside the temporary workspace
    run_error = None
    res = None
    try:
        res = await runner.run_simulation(
            config_data=config_data,
            geometry=geometry
        )
    except Exception as e:
        run_error = e

    if run_error:
        logger.error("\n[FAIL] Palace simulation execution failed!")
        print("\n================ DIAGNOSTIC DATA ================")
        print(f"Config Debug Path: {config_debug_path}")
        print(f"Mesh Debug Path: {mesh_debug_path}")
        # Build the exact docker command that was attempted
        # Note: job_dir was inside temporary directory, but we can reconstruct the command layout
        docker_cmd = f"docker run --rm -v /path/to/job_dir:/data palace-sim:latest -np 1 /data/config.json"
        print(f"Docker Command Used: {docker_cmd}")
        print("=================================================")
        print(f"\nError Details:\n{run_error}")
        sys.exit(1)

    # Success path
    logger.info("\n[SUCCESS] Palace simulation execution succeeded!")
    print("\n================ RUNTIME SUMMARY ================")
    print(f"Simulation Runtime: {res['runtime_seconds']:.2f} seconds")
    print(f"Output Directory: {res['output_dir']}")
    print("Generated Output Files:")
    for f_path in res['output_dir'].iterdir():
        print(f"  - {f_path.name} ({f_path.stat().st_size} bytes)")
    
    print("\nStdout:")
    print(res["stdout"])
    if res["stderr"]:
        print("Stderr:")
        print(res["stderr"])
    print("=================================================")

    logger.info("\n=== Step 5: Parsing Results using ResultParser ===")
    try:
        port_names = [f"JJ_{q.id}" for q in geometry.qubits]
        parsed_eig = ResultParser.parse_eigenmode(res["output_dir"], port_names=port_names)
        
        print("\n================ PARSED RESULTS ================")
        for mode in parsed_eig.modes:
            print(f"Mode Index: {mode.mode_index}")
            print(f"  Resonance Frequency: {mode.frequency_ghz:.6f} GHz")
            print(f"  Quality Factor Q: {mode.quality_factor:.3e}")
            print("  Energy Participation Ratios (EPR):")
            for port, ratio in mode.epr.items():
                print(f"    - {port}: {ratio:.6f}")
        print("=================================================")
    except Exception as e:
        logger.exception("Failed to parse output CSV files using ResultParser:")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
