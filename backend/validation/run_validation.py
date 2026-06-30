#!/usr/bin/env python3
"""CLI utility to validate Palace eigenmode simulation outputs."""

import argparse
import json
import sys
from pathlib import Path

# Add project root to python path to resolve services
sys.path.append(str(Path(__file__).resolve().parent.parent))

from services.validation_system import PalaceOutputValidator


def main():
    parser = argparse.ArgumentParser(
        description="Verify and validate Palace eigenmode simulation output files."
    )
    parser.add_argument(
        "--project-id",
        required=True,
        help="ID of the project or simulation whose outputs should be checked."
    )
    parser.add_argument(
        "--output-dir",
        default=None,
        help="Optional explicit path to the Palace output/post-processing directory."
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output results in JSON format to stdout instead of formatted text."
    )
    
    args = parser.parse_args()
    
    try:
        validator = PalaceOutputValidator(
            project_id=args.project_id,
            output_dir=args.output_dir
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
