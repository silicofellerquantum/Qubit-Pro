import pytest
from pathlib import Path
from services.validation_system import PalaceOutputValidator


def test_validator_init_with_missing_id():
    # Verify that initialization works even if ID is not in DB (falls back to generated folders)
    validator = PalaceOutputValidator("dummy-id")
    assert validator.project_id == "dummy-id"
    assert validator.simulation_dir is not None
    assert validator.output_dir is not None


def test_validator_reports_fail_for_nonexistent_dir(tmp_path):
    # If the output directory doesn't exist, validate_simulation_completion returns False
    validator = PalaceOutputValidator("dummy-id", output_dir=tmp_path / "config" / "out")
    report = validator.generate_report()
    
    assert report["status"] == "FAIL"
    assert report["completion_status"] == "failed/incomplete"
    assert "Simulation never ran or failed before completion." in report["errors"]


def test_complete_diagnostic_cli_invalid_dir():
    import subprocess
    import sys
    
    script_path = Path(__file__).resolve().parent.parent / "validation" / "complete_diagnostic.py"
    
    # Run CLI with a non-existent directory and verify it exits with code 2
    res = subprocess.run(
        [sys.executable, str(script_path), "--result-dir", "non_existent_directory_12345"],
        capture_output=True,
        text=True
    )
    assert res.returncode == 2
    assert "Error running validation: Result directory does not exist" in res.stderr

