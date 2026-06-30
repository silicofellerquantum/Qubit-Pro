"""Validation script for testing the Qiskit Metal to Palace geometry converter and its API endpoints."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

# Add backend directory to path
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from services.geometry_converter import QiskitMetalToPalaceConverter
from fastapi.testclient import TestClient
from app.main import app

def test_converter_with_real_json():
    print("=== Testing QiskitMetalToPalaceConverter with real-world design.json ===")
    
    # 1. Locate the design.json from the active simulation
    design_json_path = BACKEND_DIR / "tmp" / "simulations" / "simulation_f63cb279f8d64150b8279068ab53973a" / "geometry" / "design.json"
    if not design_json_path.exists():
        print(f"Active simulation design.json not found at {design_json_path}. Searching in fallback folders...")
        # Search for any design.json in tmp/simulations/
        sim_dirs = list((BACKEND_DIR / "tmp" / "simulations").glob("*/geometry/design.json"))
        if sim_dirs:
            design_json_path = sim_dirs[0]
            print(f"Found fallback design.json at {design_json_path}")
        else:
            print("No design.json found in workspace. Creating a mock design dict...")
            # Create a mock design dictionary matching the schema
            mock_design = {
                "placements": [
                    {
                        "name": "Q0",
                        "componentId": "TransmonPocket",
                        "x": -3.75,
                        "y": 9.4,
                        "params": {
                            "pocket_width": "650um",
                            "pocket_height": "650um",
                            "layer": 1
                        }
                    },
                    {
                        "name": "R0",
                        "componentId": "ReadoutResFC",
                        "x": 1.25,
                        "y": 9.35,
                        "params": {
                            "readout_radius": "50um",
                            "layer": 1
                        }
                    }
                ],
                "connections": [
                    {
                        "id": "CPW_Q0_R0",
                        "routeComponentId": "RouteMeander",
                        "from": {"placementId": "Q0"},
                        "to": {"placementId": "R0"},
                        "cachedSvg": '<polyline points="-3325.0,9595.0 -3320.0,9595.0 1250.0,9350.0"/>'
                    }
                ]
            }
            design_json_path = BACKEND_DIR / "scratch" / "mock_design.json"
            design_json_path.parent.mkdir(parents=True, exist_ok=True)
            with open(design_json_path, "w") as f:
                json.dump(mock_design, f)

    # Load design data
    with open(design_json_path, "r") as f:
        design_payload = json.load(f)

    # 2. Instantiate the converter
    converter = QiskitMetalToPalaceConverter(design_payload)
    
    # 3. Check extracted components
    print(f"\nSuccessfully extracted {len(converter.components)} components:")
    for comp in converter.components:
        print(f"  - Name: {comp['name']}, Type: {comp['type']}, Bounds: {comp['bounds']}, Layer: {comp['layer']}, Class: {comp['original_class']}")

    # Assertions on components
    assert len(converter.components) >= 2, "Should extract at least Q0 and R0 components."
    component_names = {c["name"] for c in converter.components}
    assert any("q" in name.lower() or name == "Q0" for name in component_names), "Should extract a qubit component."
    
    # 4. Check Palace configuration generation
    config = converter.generate_palace_config()
    print("\nGenerated Palace Config structure:")
    print(json.dumps(config, indent=2)[:500] + "\n... (truncated)")
    
    assert "Problem" in config, "Palace config must contain 'Problem' section."
    assert "Solver" in config, "Palace config must contain 'Solver' section."
    assert "Domains" in config, "Palace config must contain 'Domains' section."
    assert "Materials" in config, "Palace config must contain 'Materials' section."
    assert "Geometry" in config, "Palace config must contain 'Geometry' section."
    assert "Mesh" in config, "Palace config must contain 'Mesh' section."
    
    # Check that meandered CPW/resonators/qubits are in geometry entries
    assert len(config["Geometry"]) >= 2, "Should have at least 2 geometry entries in Palace configuration."
    print("\nGeometry Entries:")
    for entry in config["Geometry"]:
        print(f"  - Name: {entry['Name']}, Type: {entry['Type']}, X: {entry['X']}, Y: {entry['Y']}, Material: {entry['Material']}")

    # 5. Check summary
    summary = converter.get_geometry_summary()
    print("\nGeometry Summary:")
    print(json.dumps(summary, indent=2))
    assert summary["total_components"] == len(converter.components)
    
    print("\n--- Converter class validation: PASS ---")

def test_api_endpoints():
    print("\n=== Testing API endpoints using FastAPI TestClient ===")
    client = TestClient(app)
    
    project_id = "test_proj_123"
    
    # Mock design request payload
    mock_payload = {
        "design_json": {
            "placements": [
                {
                    "name": "Q0",
                    "componentId": "TransmonPocket",
                    "x": -3.75,
                    "y": 9.4,
                    "params": {
                        "pocket_width": "650um",
                        "pocket_height": "650um",
                        "layer": 1
                    }
                },
                {
                    "name": "R0",
                    "componentId": "ReadoutResFC",
                    "x": 1.25,
                    "y": 9.35,
                    "params": {
                        "readout_radius": "50um",
                        "layer": 1
                    }
                }
            ],
            "connections": [
                {
                    "id": "CPW_Q0_R0",
                    "routeComponentId": "RouteMeander",
                    "from": {"placementId": "Q0"},
                    "to": {"placementId": "R0"},
                    "cachedSvg": '<polyline points="-3325.0,9595.0 1250.0,9350.0"/>'
                }
            ]
        }
    }
    
    # 1. Test POST /api/projects/{project_id}/generate-palace-config
    url_generate = f"/api/projects/{project_id}/generate-palace-config"
    print(f"Calling POST {url_generate}...")
    response = client.post(url_generate, json=mock_payload)
    print(f"Response status: {response.status_code}")
    assert response.status_code == 200
    
    data = response.json()
    print("Response JSON:")
    print(json.dumps(data, indent=2))
    
    assert "config_file" in data
    assert "geometry_summary" in data
    assert "components" in data
    assert data["geometry_summary"]["total_components"] == 3
    
    # Check that the file was actually written to palace_input/{project_id}/palace_config.json
    saved_file_path = BACKEND_DIR / "palace_input" / project_id / "palace_config.json"
    assert saved_file_path.exists(), f"Config file not written to disk at {saved_file_path}"
    print(f"Verified that config file was saved on disk at: {saved_file_path}")

    # 2. Test GET /api/projects/{project_id}/geometry-preview
    url_preview = f"/api/projects/{project_id}/geometry-preview"
    print(f"\nCalling GET {url_preview}...")
    response_preview = client.get(url_preview)
    print(f"Response status: {response_preview.status_code}")
    assert response_preview.status_code == 200
    
    preview_data = response_preview.json()
    print("Preview Response JSON:")
    print(json.dumps(preview_data, indent=2))
    
    assert "domains" in preview_data
    assert "materials" in preview_data
    assert "components" in preview_data
    assert len(preview_data["components"]) == 3
    
    # Clean up test output
    if saved_file_path.exists():
        saved_file_path.unlink()
        saved_file_path.parent.rmdir()
        
    print("\n--- API endpoints validation: PASS ---")

if __name__ == "__main__":
    try:
        test_converter_with_real_json()
        test_api_endpoints()
        print("\nALL GEOMETRY CONVERTER AND API TESTS PASSED SUCCESSFULLY! \u2714")
    except Exception as e:
        import traceback
        traceback.print_exc()
        print("\nTEST VALIDATION FAILED! \u2718")
        sys.exit(1)
