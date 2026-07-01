"""Tests for the Palace 3D tetrahedral mesh wireframe visualization system."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth import get_current_user
from app.models import User
from app.services.palace_mesh_parser import PalaceMeshParser


# ── Sample Gmsh MSH Data ──
SAMPLE_MSH_CONTENT = """$MeshFormat
2.2 0 8
$EndMeshFormat
$Nodes
4
1 0.0 0.0 0.0
2 1.0 0.0 0.0
3 0.0 1.0 0.0
4 0.0 0.0 1.0
$EndNodes
$Elements
2
1 15 2 1 1 1
2 4 2 2 1 1 2 3 4
$EndElements
"""


class TestPalaceMeshParser:
    def test_parser_read_mesh_success(self):
        """Tests that PalaceMeshParser correctly parses nodes and elements from a Gmsh file."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".msh", delete=False) as f:
            f.write(SAMPLE_MSH_CONTENT)
            tmp_path = Path(f.name)

        try:
            parser = PalaceMeshParser()
            parser.read_mfem_mesh(tmp_path)

            # Assertions
            assert len(parser.vertices) == 4
            assert parser.vertices[0] == [0.0, 0.0, 0.0]
            assert parser.vertices[1] == [1.0, 0.0, 0.0]
            
            # Element 2 is type 4 (tetrahedron), Element 1 is type 15 (point, skipped)
            assert len(parser.elements) == 1
            assert parser.elements[0] == [0, 1, 2, 3]  # 0-indexed mapped node IDs

            # Check bounds
            assert parser.bounds["x"] == [0.0, 1.0]
            assert parser.bounds["y"] == [0.0, 1.0]
            assert parser.bounds["z"] == [0.0, 1.0]

        finally:
            tmp_path.unlink()

    def test_get_wireframe_edges(self):
        """Tests that get_wireframe_edges extracts and deduplicates the 6 unique edges of a tetrahedron."""
        parser = PalaceMeshParser()
        parser.vertices = [
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0, 0.0, 1.0]
        ]
        parser.elements = [[0, 1, 2, 3]]
        
        edges = parser.get_wireframe_edges()
        
        # A tetrahedron has 6 unique edges:
        # (0,1), (0,2), (0,3), (1,2), (1,3), (2,3)
        assert len(edges) == 6
        expected_edges = [
            [0, 1], [0, 2], [0, 3],
            [1, 2], [1, 3],
            [2, 3]
        ]
        assert edges == expected_edges

    def test_to_json(self):
        """Tests the JSON schema output of to_json."""
        parser = PalaceMeshParser()
        parser.vertices = [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
        parser.elements = [[0, 1, 2, 3]]
        parser.bounds = {"x": [0.0, 1.0], "y": [0.0, 1.0], "z": [0.0, 1.0]}
        
        data = parser.to_json()
        assert "vertices" in data
        assert "edges" in data
        assert "bounds" in data
        assert len(data["edges"]) == 6


class TestMeshWireframeAPI:
    @pytest.fixture
    def client(self):
        """FastAPI test client with mocked authentication."""
        mock_user = MagicMock(spec=User)
        mock_user.id = "test-user-id"

        app.dependency_overrides[get_current_user] = lambda: mock_user
        client = TestClient(app, raise_server_exceptions=False)
        yield client
        app.dependency_overrides.clear()

    @patch("app.routers.mesh_visualization._authorize_simulation")
    @patch("pathlib.Path.is_file")
    @patch("pathlib.Path.exists")
    @patch("builtins.open")
    def test_get_mesh_wireframe_endpoint_success(self, mock_open, mock_exists, mock_is_file, mock_authorize, client):
        """Test that the endpoint successfully returns wireframe JSON when file exists."""
        # 1. Mock simulation auth
        mock_sim = MagicMock()
        mock_sim.solver = "eigenmode"
        mock_sim.artifact_retained = True
        mock_sim.artifact_path = "storage/simulations/sim_789"
        mock_sim.runtime_seconds = 65
        mock_sim.results = {"eigenmode": {"modes": [{"mode_index": 1, "frequency_ghz": 4.5e9}]}}
        mock_authorize.return_value = mock_sim

        # 2. Mock file existence and file check
        mock_exists.return_value = True
        mock_is_file.return_value = True

        # 3. Mock file reading
        mock_file = MagicMock()
        mock_file.readline.side_effect = SAMPLE_MSH_CONTENT.splitlines(keepends=True) + [""]
        mock_open.return_value.__enter__.return_value = mock_file

        # 4. Request
        resp = client.get("/api/simulations/sim_789/mesh-wireframe")
        assert resp.status_code == 200

        data = resp.json()
        assert "vertices" in data
        assert "edges" in data
        assert "bounds" in data
        assert "metadata" in data
        
        # Verify metadata values
        metadata = data["metadata"]
        assert metadata["solver"] == "eigenmode"
        assert metadata["total_elements"] == 1
        assert metadata["total_vertices"] == 4
        assert metadata["total_edges"] == 6
        assert metadata["frequency_ghz"] == 4.5
        assert metadata["runtime_seconds"] == 65

    @patch("app.routers.mesh_visualization._authorize_simulation")
    @patch("pathlib.Path.exists")
    def test_get_mesh_wireframe_endpoint_file_not_found(self, mock_exists, mock_authorize, client):
        """Test that the endpoint returns 404 when the mesh file cannot be found."""
        mock_sim = MagicMock()
        mock_sim.solver = "eigenmode"
        mock_sim.artifact_path = "storage/simulations/sim_789"
        mock_authorize.return_value = mock_sim

        # Force all file exist checks to be False
        mock_exists.return_value = False

        resp = client.get("/api/simulations/sim_789/mesh-wireframe")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"]
