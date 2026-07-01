#!/usr/bin/env python3
"""Standalone script to validate Palace simulation results.

Usage:
    python validate_results.py --json results.json
    python validate_results.py --csv-dir /path/to/out/
"""

import sys
import argparse
import json
from pathlib import Path

# Add project root to path to reuse the validator logic
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.simulation.validator import validate_eigenmode_results
from app.simulation.parser.result_parser import ResultParser

def main():
    parser = argparse.ArgumentParser(description="Validate Palace simulation results.")
    parser.add_argument("--json", type=str, help="Path to parsed simulation results JSON file.")
    parser.add_argument("--csv-dir", type=str, help="Path to output directory containing eig.csv and port-EPR.csv.")
    parser.add_argument("--ceiling", type=float, default=500.0, help="Sanity frequency ceiling in GHz (default: 500.0).")
    parser.add_argument("--epr-floor", type=float, default=1e-6, help="Physical EPR floor (default: 1e-6).")

    args = parser.parse_args()

    if not args.json and not args.csv_dir:
        parser.print_help()
        sys.exit(1)

    modes = []

    if args.json:
        json_path = Path(args.json)
        if not json_path.exists():
            print(f"Error: JSON file not found: {json_path}")
            sys.exit(1)
        
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            # Extract modes list from different possible JSON structures
            if "eigenmode" in data and "modes" in data["eigenmode"]:
                modes = data["eigenmode"]["modes"]
            elif "modes" in data:
                modes = data["modes"]
            else:
                print("Error: Could not locate eigenmode modes list in JSON.")
                sys.exit(1)
        except Exception as e:
            print(f"Error parsing JSON file: {e}")
            sys.exit(1)

    elif args.csv_dir:
        csv_path = Path(args.csv_dir)
        if not csv_path.exists():
            print(f"Error: CSV directory not found: {csv_path}")
            sys.exit(1)

        try:
            res = ResultParser.parse_eigenmode(csv_path)
            # Convert EigenmodeResults object to list of dicts for validator
            modes = [m.model_dump() for m in res.modes]
        except Exception as e:
            print(f"Error parsing CSV files: {e}")
            sys.exit(1)

    # Perform validation
    report = validate_eigenmode_results(modes, freq_ceiling_ghz=args.ceiling, epr_floor=args.epr_floor)

    # Output report
    print("\n==========================================")
    print("      PALACE RESULTS VALIDATION REPORT    ")
    print("==========================================")
    print(f"Frequencies sorted: {'PASSED' if report['is_valid'] else 'FAILED'}")
    print(f"Total Modes Checked: {len(modes)}")
    print(f"Total Errors Found: {len(report['errors'])}")
    print(f"Total Warnings Found: {len(report['warnings'])}")
    print("------------------------------------------")

    if report["errors"]:
        print("\nERRORS (Critical issues):")
        for err in report["errors"]:
            print(f" [!] {err}")

    if report["warnings"]:
        print("\nWARNINGS (Suspicious physics or leaks):")
        for wrn in report["warnings"]:
            print(f" [-] {wrn}")

    if report["is_valid"] and not report["warnings"]:
        print("\nAll checks passed successfully! Simulation results look physically sound.")
    else:
        print(f"\nCompleted with {'warnings' if report['is_valid'] else 'errors'}.")

    print("==========================================\n")

    # Exit with non-zero code if critical errors are present
    sys.exit(0 if report["is_valid"] else 1)

if __name__ == "__main__":
    main()
