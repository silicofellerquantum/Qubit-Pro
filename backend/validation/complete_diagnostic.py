#!/usr/bin/env python3
"""CLI utility to run a complete diagnostic on a Palace eigenmode simulation output folder."""

import argparse
import json
import sys
from pathlib import Path

# Add project root to python path to resolve services
sys.path.append(str(Path(__file__).resolve().parent.parent))

from services.validation_system import PalaceOutputValidator


def main():
    parser = argparse.ArgumentParser(
        description="Verify and validate Palace eigenmode simulation output files by result directory."
    )
    parser.add_argument(
        "--result-dir",
        required=True,
        help="Path to the simulation result directory."
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output results in JSON format to stdout instead of formatted text."
    )
    
    args = parser.parse_args()
    
    try:
        result_path = Path(args.result_dir)
        backend_dir = Path(__file__).resolve().parent.parent
        
        # Try to resolve path if it doesn't exist
        if not result_path.exists():
            # If path starts with .tmp_sims or tmp_sims, map it to backend/tmp/simulations
            parts = result_path.parts
            if parts and (parts[0] in [".tmp_sims", "tmp_sims"]):
                alt_path = backend_dir / "tmp" / "simulations" / Path(*parts[1:])
                if alt_path.exists():
                    result_path = alt_path
            else:
                # Try relative to backend
                alt_path = backend_dir / result_path
                if alt_path.exists():
                    result_path = alt_path
                
        if not result_path.exists():
            raise FileNotFoundError(f"Result directory does not exist: {args.result_dir}")
            
        # Extract project/simulation ID from directory name
        # e.g., simulation_a948224929054d5a9c7c5fa35c06c942 -> a948224929054d5a9c7c5fa35c06c942
        dir_name = result_path.name
        if dir_name.startswith("simulation_"):
            project_id = dir_name[len("simulation_"):]
        else:
            project_id = dir_name
            
        # The output files reside in <result_path>/config/out
        output_dir = result_path / "config" / "out"
        
        validator = PalaceOutputValidator(
            project_id=project_id,
            output_dir=output_dir
        )
        
        if args.json:
            report = validator.generate_report()
            print(json.dumps(report, indent=2))
            if report["status"] == "FAIL":
                sys.exit(1)
        else:
            validator.print_report()
            report = validator.generate_report()
            if report["status"] == "FAIL":
                sys.exit(1)
                
    except Exception as e:
        if args.json:
            print(json.dumps({"status": "FAIL", "error": str(e)}))
        else:
            print(f"\033[91mError running validation: {e}\033[0m", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
