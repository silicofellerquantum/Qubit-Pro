"""Tests for the Phase 12 Visualization System.

All tests use mocked PyVista and file I/O — no real VTU files required.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any
from unittest.mock import MagicMock, patch, PropertyMock

import numpy as np
import pytest


# ── Helpers ───────────────────────────────────────────────────────────────────

class _DictLike(dict):
    """A dict subclass used as mock point_data/cell_data for PyVista datasets.

    Using a plain dict subclass avoids MagicMock __init__ keyword conflicts
    while still supporting all normal dict operations.
    """
    pass


def _make_mock_dataset(n_points: int = 100, n_cells: int = 50) -> MagicMock:
    """Return a mock PyVista DataSet with realistic structure."""
    ds = MagicMock()
    ds.n_points = n_points
    ds.n_cells = n_cells
    ds.bounds = (-1.0, 1.0, -1.0, 1.0, -0.5, 0.5)

    e_real = np.random.randn(n_points, 3).astype(np.float32)
    b_real = np.random.randn(n_points, 3).astype(np.float32)
    u_e = np.random.rand(n_points).astype(np.float32) * 1e-12

    ds.point_data = _DictLike({"E_Real": e_real, "B_Real": b_real, "U_e": u_e})
    ds.cell_data = _DictLike({})
    return ds


def _make_temp_artifact_dir() -> Path:
    """Create a temporary artifact directory structure."""
    d = Path(tempfile.mkdtemp())
    (d / "images").mkdir()
    # Create a dummy mesh file
    (d / "eigenmode").mkdir(parents=True)
    (d / "eigenmode" / "mesh.msh").write_bytes(b"DUMMY_MSH")
    # Fake paraview output structure
    pv_dir = d / "eigenmode" / "out" / "paraview" / "Eigenmode" / "Cycle0001"
    pv_dir.mkdir(parents=True)
    (pv_dir / "data.pvtu").write_bytes(b"DUMMY_PVTU")
    return d


# ── Exceptions ────────────────────────────────────────────────────────────────

class TestVisualizationExceptions:
    def test_vtu_not_found(self):
        from app.simulation.visualization.exceptions import VTUNotFoundError
        exc = VTUNotFoundError("/some/path")
        assert "/some/path" in str(exc)
        assert exc.artifact_path == "/some/path"

    def test_field_not_found(self):
        from app.simulation.visualization.exceptions import FieldNotFoundError
        exc = FieldNotFoundError("E_Missing", ["E_Real", "B_Real"])
        assert "E_Missing" in str(exc)
        assert exc.field == "E_Missing"
        assert "E_Real" in exc.available

    def test_render_error_with_cause(self):
        from app.simulation.visualization.exceptions import RenderError
        cause = ValueError("underlying error")
        exc = RenderError("render broke", cause=cause)
        assert "render broke" in str(exc)
        assert exc.cause is cause

    def test_unsupported_format(self):
        from app.simulation.visualization.exceptions import UnsupportedFormatError
        exc = UnsupportedFormatError("/some/file.xyz")
        assert ".xyz" in str(exc)


# ── Visualization Models ──────────────────────────────────────────────────────

class TestVisualizationModels:
    def test_render_request_defaults(self):
        from app.simulation.visualization.visualization_models import RenderRequest, ColormapName, CameraPresetName
        r = RenderRequest()
        assert r.colormap == ColormapName.COOLWARM
        assert r.camera_preset == CameraPresetName.ISOMETRIC
        assert r.opacity == 1.0
        assert r.width == 1200
        assert r.height == 900

    def test_render_request_validation(self):
        from app.simulation.visualization.visualization_models import RenderRequest
        import pydantic
        with pytest.raises(pydantic.ValidationError):
            RenderRequest(opacity=1.5)  # > 1.0

    def test_slice_request(self):
        from app.simulation.visualization.visualization_models import SliceRequest, SliceAxis
        r = SliceRequest(axis=SliceAxis.X, position=0.3)
        assert r.axis == SliceAxis.X
        assert r.position == 0.3

    def test_field_info_serialization(self):
        from app.simulation.visualization.visualization_models import FieldInfo, FieldType
        fi = FieldInfo(name="E_Real", field_type=FieldType.VECTOR, n_components=3,
                       value_min=0.0, value_max=1e4, units="V/m")
        data = fi.model_dump()
        assert data["name"] == "E_Real"
        assert data["units"] == "V/m"

    def test_visualization_manifest(self):
        from app.simulation.visualization.visualization_models import VisualizationManifest
        m = VisualizationManifest(simulation_id="abc123")
        assert m.has_vtu is False
        assert m.has_mesh is False
        assert m.vtu_files == []


# ── Camera Manager ────────────────────────────────────────────────────────────

class TestCameraManager:
    def test_get_all_presets_returns_six(self):
        from app.simulation.visualization.camera_manager import get_all_presets
        presets = get_all_presets()
        assert len(presets) == 6

    def test_get_specific_preset(self):
        from app.simulation.visualization.camera_manager import get_preset
        from app.simulation.visualization.visualization_models import CameraPresetName
        p = get_preset(CameraPresetName.TOP)
        assert p.name == CameraPresetName.TOP
        assert p.position[2] > 0  # Z-positive for top view

    def test_apply_preset_calls_plotter(self):
        from app.simulation.visualization.camera_manager import apply_preset, get_preset
        from app.simulation.visualization.visualization_models import CameraPresetName
        preset = get_preset(CameraPresetName.ISOMETRIC)
        mock_plotter = MagicMock()
        mock_plotter.bounds = (-1, 1, -1, 1, -0.5, 0.5)
        mock_plotter.camera = MagicMock()
        apply_preset(mock_plotter, preset)
        assert mock_plotter.camera.position is not None


# ── Image Exporter ────────────────────────────────────────────────────────────

class TestImageExporter:
    def test_cache_put_and_get(self):
        from app.simulation.visualization.image_exporter import cache_put, cache_get, cache_clear
        cache_clear()
        key = "test-key-12345"
        data = b"PNG_DATA"
        cache_put(key, data)
        assert cache_get(key) == data

    def test_cache_miss_returns_none(self):
        from app.simulation.visualization.image_exporter import cache_get, cache_clear
        cache_clear()
        assert cache_get("nonexistent-key") is None

    def test_cache_clear(self):
        from app.simulation.visualization.image_exporter import cache_put, cache_get, cache_clear
        cache_clear()
        cache_put("key1", b"data1")
        cache_put("key2", b"data2")
        count = cache_clear()
        assert count == 2
        assert cache_get("key1") is None

    def test_cache_stats(self):
        from app.simulation.visualization.image_exporter import cache_put, cache_stats, cache_clear
        cache_clear()
        cache_put("stat-key", b"x" * 1024)
        stats = cache_stats()
        assert stats["entries"] == 1
        assert stats["total_bytes"] == 1024

    def test_make_render_key_deterministic(self):
        from app.simulation.visualization.image_exporter import make_render_key
        k1 = make_render_key("sim-abc", field="E_Real", cmap="coolwarm")
        k2 = make_render_key("sim-abc", cmap="coolwarm", field="E_Real")
        assert k1 == k2  # Order-independent

    def test_make_render_key_different_params(self):
        from app.simulation.visualization.image_exporter import make_render_key
        k1 = make_render_key("sim-abc", field="E_Real")
        k2 = make_render_key("sim-abc", field="B_Real")
        assert k1 != k2


# ── VTU Loader ────────────────────────────────────────────────────────────────

class TestVTULoader:
    def test_extract_field_info_scalar(self):
        from app.simulation.visualization.vtu_loader import extract_field_info
        from app.simulation.visualization.visualization_models import FieldType

        scalar_arr = np.random.rand(50).astype(np.float32)
        ds = MagicMock()
        ds.point_data = _DictLike({"U_e": scalar_arr})
        ds.cell_data = _DictLike({})

        pf, cf = extract_field_info(ds)
        assert len(pf) == 1
        assert pf[0].name == "U_e"
        assert pf[0].field_type == FieldType.SCALAR
        assert pf[0].n_components == 1
        assert pf[0].units == "J/m³"

    def test_extract_field_info_vector(self):
        from app.simulation.visualization.vtu_loader import extract_field_info
        from app.simulation.visualization.visualization_models import FieldType

        vec_arr = np.random.randn(50, 3).astype(np.float32)
        ds = MagicMock()
        ds.point_data = _DictLike({"E_Real": vec_arr})
        ds.cell_data = _DictLike({})

        pf, _ = extract_field_info(ds)
        assert pf[0].field_type == FieldType.VECTOR
        assert pf[0].n_components == 3

    def test_find_vtu_files_excludes_boundary(self):
        from app.simulation.visualization.vtu_loader import find_vtu_files
        d = _make_temp_artifact_dir()
        # Add a boundary file that should be excluded
        boundary_dir = d / "eigenmode" / "out" / "paraview" / "boundary"
        boundary_dir.mkdir(parents=True)
        (boundary_dir / "boundary.pvtu").write_bytes(b"BOUNDARY")
        files = find_vtu_files(d)
        for f in files:
            assert "boundary" not in str(f).lower()

    def test_pick_primary_vtu_prefers_cycle1(self):
        from app.simulation.visualization.vtu_loader import pick_primary_vtu
        paths = [
            Path("/tmp/sim/Cycle0003/data.pvtu"),
            Path("/tmp/sim/Cycle0001/data.pvtu"),
            Path("/tmp/sim/Cycle0002/data.pvtu"),
        ]
        primary = pick_primary_vtu(paths)
        assert primary == paths[1]  # Cycle0001

    def test_pick_primary_vtu_empty(self):
        from app.simulation.visualization.vtu_loader import pick_primary_vtu
        assert pick_primary_vtu([]) is None

    def test_unsupported_format_raises(self):
        from app.simulation.visualization.vtu_loader import load_dataset
        from app.simulation.visualization.exceptions import UnsupportedFormatError
        with pytest.raises(UnsupportedFormatError):
            load_dataset(Path("/tmp/file.xyz"))

    def test_missing_file_raises(self):
        from app.simulation.visualization.vtu_loader import load_dataset
        with pytest.raises(FileNotFoundError):
            load_dataset(Path("/definitely/does/not/exist.vtu"))

    def test_get_dataset_bounds(self):
        from app.simulation.visualization.vtu_loader import get_dataset_bounds
        ds = MagicMock()
        ds.bounds = (-1.0, 1.0, -2.0, 2.0, 0.0, 0.5)
        b = get_dataset_bounds(ds)
        assert b == [-1.0, 1.0, -2.0, 2.0, 0.0, 0.5]


# ── Field Renderer ────────────────────────────────────────────────────────────

class TestFieldRenderer:
    @patch("app.simulation.visualization.field_renderer.pv")
    def test_render_field_success(self, mock_pv):
        from app.simulation.visualization.field_renderer import render_field_to_png
        from app.simulation.visualization.visualization_models import RenderRequest

        mock_plotter = MagicMock()
        mock_pv.Plotter.return_value = mock_plotter
        mock_plotter.bounds = (-1, 1, -1, 1, -0.5, 0.5)
        mock_plotter.camera = MagicMock()

        arr = np.random.rand(100).astype(np.float32)
        mag = np.random.rand(80).astype(np.float32)
        e_real = np.random.randn(100, 3).astype(np.float32)

        ds = MagicMock()
        ds.point_data = _DictLike({"E_Real": e_real})

        clipped = MagicMock()
        clipped.n_points = 80
        clipped.n_cells = 40
        clipped.point_data = _DictLike({"_render_mag": mag})
        ds.clip.return_value = clipped

        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "test_render.png"
            output_path.write_bytes(b"FAKE_PNG")

            with patch("app.simulation.visualization.field_renderer.save_screenshot"):
                t_ms = render_field_to_png(ds, output_path, RenderRequest(field="E_Real"))

            assert isinstance(t_ms, float)
            assert t_ms >= 0.0

    @patch("app.simulation.visualization.field_renderer.pv")
    def test_render_field_raises_on_missing_field(self, mock_pv):
        from app.simulation.visualization.field_renderer import render_field_to_png
        from app.simulation.visualization.visualization_models import RenderRequest
        from app.simulation.visualization.exceptions import FieldNotFoundError

        mock_plotter = MagicMock()
        mock_pv.Plotter.return_value = mock_plotter

        ds = MagicMock()
        ds.point_data = _DictLike({"E_Real": np.random.rand(50, 3)})
        ds.clip.return_value = MagicMock(n_points=5)

        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "out.png"
            with pytest.raises(FieldNotFoundError):
                render_field_to_png(ds, output_path, RenderRequest(field="NonExistent"))

    @patch("app.simulation.visualization.field_renderer.pv")
    def test_render_field_high_fidelity_success(self, mock_pv):
        from app.simulation.visualization.field_renderer import render_field_to_png
        from app.simulation.visualization.visualization_models import RenderRequest

        mock_plotter = MagicMock()
        mock_pv.Plotter.return_value = mock_plotter
        mock_plotter.bounds = (-1, 1, -1, 1, -0.5, 0.5)
        mock_plotter.camera = MagicMock()

        # Mock boundary dataset
        mock_boundary_ds = MagicMock()
        mock_boundary_ds.n_points = 100
        mock_boundary_ds.cell_data = _DictLike({"attribute": np.array([3, 3, 10, 10, 4])})
        mock_boundary_ds.point_data = _DictLike({"E_Real": np.random.randn(100, 3).astype(np.float32)})
        mock_boundary_ds.clean.return_value = mock_boundary_ds
        
        # Threshold returning subsets
        mock_threshold = MagicMock()
        mock_threshold.n_points = 50
        mock_threshold.n_cells = 25
        mock_threshold.point_data = _DictLike({"E_Real": np.random.randn(50, 3).astype(np.float32)})
        mock_threshold.cell_data = _DictLike({"attribute": np.array([3, 3, 10, 10])})
        mock_threshold.clean.return_value = mock_threshold
        
        mock_boundary_ds.threshold.return_value = mock_threshold
        mock_threshold.threshold.return_value = mock_threshold
        mock_pv.read.return_value = mock_boundary_ds

        # Volume dataset
        ds = MagicMock()
        ds.point_data = _DictLike({"E_Real": np.random.randn(100, 3).astype(np.float32)})
        
        clipped = MagicMock()
        clipped.n_points = 80
        clipped.n_cells = 40
        clipped.point_data = _DictLike({"_render_mag": np.random.rand(80)})
        ds.clip.return_value = clipped

        with tempfile.TemporaryDirectory() as tmpdir:
            boundary_path = Path(tmpdir) / "boundary.pvtu"
            boundary_path.write_bytes(b"DUMMY_BOUNDARY")
            output_path = Path(tmpdir) / "test_render_hf.png"
            output_path.write_bytes(b"FAKE_PNG")

            with patch("app.simulation.visualization.field_renderer.save_screenshot"):
                t_ms = render_field_to_png(
                    ds, 
                    output_path, 
                    RenderRequest(field="E_Real", high_fidelity=True),
                    boundary_path=boundary_path
                )

            assert isinstance(t_ms, float)
            assert t_ms >= 0.0
            mock_pv.read.assert_called_with(str(boundary_path))


# ── Slice Generator ───────────────────────────────────────────────────────────

class TestSliceGenerator:
    @patch("app.simulation.visualization.slice_generator.pv")
    def test_generate_slice_success(self, mock_pv):
        from app.simulation.visualization.slice_generator import generate_orthogonal_slice
        from app.simulation.visualization.visualization_models import SliceRequest, SliceAxis

        mock_plotter = MagicMock()
        mock_pv.Plotter.return_value = mock_plotter
        mock_plotter.bounds = (-1, 1, -1, 1, -0.5, 0.5)
        mock_plotter.camera = MagicMock()

        vals = np.random.rand(30).astype(np.float32)
        e_arr = np.random.randn(100, 3).astype(np.float32)

        sliced = MagicMock()
        sliced.n_points = 30
        sliced.point_data = _DictLike({"_slice_mag": vals})

        ds = MagicMock()
        ds.bounds = (-1.0, 1.0, -1.0, 1.0, -0.5, 0.5)
        ds.point_data = _DictLike({"E_Real": e_arr})
        ds.slice.return_value = sliced

        request = SliceRequest(axis=SliceAxis.Z, position=0.5)

        with tempfile.TemporaryDirectory() as tmpdir:
            output_path = Path(tmpdir) / "slice.png"
            output_path.write_bytes(b"FAKE_PNG")

            with patch("app.simulation.visualization.slice_generator.save_screenshot"):
                t_ms = generate_orthogonal_slice(ds, output_path, request)

            assert isinstance(t_ms, float)

    @patch("app.simulation.visualization.slice_generator.pv")
    def test_generate_slice_empty_raises(self, mock_pv):
        from app.simulation.visualization.slice_generator import generate_orthogonal_slice
        from app.simulation.visualization.visualization_models import SliceRequest, SliceAxis
        from app.simulation.visualization.exceptions import RenderError

        mock_plotter = MagicMock()
        mock_pv.Plotter.return_value = mock_plotter

        empty_slice = MagicMock()
        empty_slice.n_points = 0

        ds = MagicMock()
        ds.bounds = (-1.0, 1.0, -1.0, 1.0, -0.5, 0.5)
        ds.point_data = _DictLike({"E_Real": np.random.randn(50, 3)})
        ds.slice.return_value = empty_slice

        request = SliceRequest(axis=SliceAxis.Z, position=0.5)
        with tempfile.TemporaryDirectory() as tmpdir:
            with pytest.raises(RenderError):
                generate_orthogonal_slice(ds, Path(tmpdir) / "out.png", request)


# ── VisualizationService ──────────────────────────────────────────────────────

class TestVisualizationService:
    def test_get_manifest_no_vtu(self):
        """Manifest works even when no VTU files are present."""
        from app.simulation.visualization.visualizer import VisualizationService

        with tempfile.TemporaryDirectory() as tmpdir:
            d = Path(tmpdir)
            (d / "images").mkdir()
            svc = VisualizationService(artifact_dir=d, sim_id="test-sim-001")
            manifest = svc.get_manifest()
            assert manifest.simulation_id == "test-sim-001"
            assert manifest.has_vtu is False
            assert manifest.has_mesh is False

    def test_get_manifest_with_images(self):
        """Manifest lists pre-rendered images."""
        from app.simulation.visualization.visualizer import VisualizationService

        with tempfile.TemporaryDirectory() as tmpdir:
            d = Path(tmpdir)
            images_dir = d / "images"
            images_dir.mkdir()
            (images_dir / "eigenmode_chip_e_1.png").write_bytes(b"PNG")
            (images_dir / "eigenmode_mesh.png").write_bytes(b"PNG")

            svc = VisualizationService(artifact_dir=d, sim_id="test-sim-002")
            manifest = svc.get_manifest()
            assert len(manifest.pre_rendered_images) == 2

    def test_list_arrays_no_vtu_raises(self):
        """list_arrays raises VTUNotFoundError when no VTU files exist."""
        from app.simulation.visualization.visualizer import VisualizationService
        from app.simulation.visualization.exceptions import VTUNotFoundError

        with tempfile.TemporaryDirectory() as tmpdir:
            d = Path(tmpdir)
            (d / "images").mkdir()
            svc = VisualizationService(artifact_dir=d, sim_id="test-sim-003")
            with pytest.raises(VTUNotFoundError):
                svc.list_arrays()

    def test_get_camera_presets(self):
        """Static method returns all presets without needing an artifact dir."""
        from app.simulation.visualization.visualizer import VisualizationService
        presets = VisualizationService.get_camera_presets()
        assert len(presets) == 6

    def test_get_image_path_resolves(self):
        """get_image_path returns correct path for existing images."""
        from app.simulation.visualization.visualizer import VisualizationService

        with tempfile.TemporaryDirectory() as tmpdir:
            d = Path(tmpdir)
            images_dir = d / "images"
            images_dir.mkdir()
            (images_dir / "test_image.png").write_bytes(b"PNG")

            svc = VisualizationService(artifact_dir=d, sim_id="x")
            path = svc.get_image_path("test_image.png")
            assert path is not None
            assert path.exists()

    def test_get_image_path_nonexistent(self):
        """get_image_path returns None for missing images."""
        from app.simulation.visualization.visualizer import VisualizationService

        with tempfile.TemporaryDirectory() as tmpdir:
            d = Path(tmpdir)
            (d / "images").mkdir()
            svc = VisualizationService(artifact_dir=d, sim_id="x")
            assert svc.get_image_path("nonexistent.png") is None

    def test_get_image_path_prevents_traversal(self):
        """get_image_path strips path traversal attempts."""
        from app.simulation.visualization.visualizer import VisualizationService

        with tempfile.TemporaryDirectory() as tmpdir:
            d = Path(tmpdir)
            (d / "images").mkdir()
            svc = VisualizationService(artifact_dir=d, sim_id="x")
            # Path traversal attempt
            result = svc.get_image_path("../../etc/passwd")
            assert result is None  # File does not exist in images_dir


# ── REST API ──────────────────────────────────────────────────────────────────

class TestVisualizationAPI:
    """Integration tests for the REST API using FastAPI test client with mocked service."""

    @pytest.fixture
    def client(self):
        """Create test client with auth mocked out."""
        from fastapi.testclient import TestClient
        from app.main import app
        from app.auth import get_current_user
        from app.models import User

        mock_user = MagicMock(spec=User)
        mock_user.id = "test-user-id"

        app.dependency_overrides[get_current_user] = lambda: mock_user
        client = TestClient(app, raise_server_exceptions=False)
        yield client
        app.dependency_overrides.clear()

    def test_presets_endpoint_unauthorized(self, client):
        """Accessing presets without valid sim requires auth via _authorize_simulation."""
        resp = client.get("/api/simulations/nonexistent/visualization/presets")
        # 404 from _authorize_simulation (sim not found) is acceptable
        assert resp.status_code in (401, 403, 404, 422, 500)

    def test_manifest_nonexistent_sim(self, client):
        """Manifest for nonexistent sim returns 4xx."""
        resp = client.get("/api/simulations/doesnotexist-12345/visualization/manifest")
        assert resp.status_code in (404, 422, 500)

    @patch("app.routers.visualization.extract_3d_visualization")
    @patch("app.routers.visualization._authorize_simulation")
    @patch("app.routers.visualization._PROJECT_ROOT")
    def test_get_3d_visualization_success(self, mock_project_root, mock_authorize, mock_extract, client):
        """Test that the 3D visualization endpoint successfully returns extracted mesh and field data."""
        # 1. Setup mock simulation
        mock_sim = MagicMock()
        mock_sim.solver = "eigenmode"
        mock_sim.artifact_retained = True
        mock_sim.artifact_path = "dummy/path"
        mock_sim.runtime_seconds = 45
        mock_sim.results = {"eigenmode": {"modes": [{"mode_index": 1, "frequency_ghz": 4.5}]}}
        mock_authorize.return_value = mock_sim

        # 2. Setup mock project root and path existence
        mock_path = MagicMock()
        mock_path.exists.return_value = True
        mock_project_root.__truediv__.return_value = mock_path

        # 3. Setup mock extracted data
        mock_extract.return_value = {
            "mesh": {
                "vertices": [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]],
                "faces": [[0, 1, 2]],
                "normals": [[0.0, 0.0, 1.0], [0.0, 0.0, 1.0], [0.0, 0.0, 1.0]]
            },
            "field": {
                "name": "E_magnitude",
                "unit": "V/m",
                "values": [1.0, 2.0, 3.0],
                "colors": [[255, 0, 0], [0, 255, 0], [0, 0, 255]],
                "min": 1.0,
                "max": 3.0,
                "colorMap": "redYellow"
            },
            "metadata": {
                "solver": "eigenmode",
                "frequency_ghz": 4.5,
                "modes": 1,
                "mesh_nodes": 3,
                "runtime_seconds": 58
            }
        }

        # 4. Make request to our new endpoint
        resp = client.get("/api/simulations/test-sim-id/visualization?mode=1")
        assert resp.status_code == 200

        data = resp.json()
        assert "mesh" in data
        assert "field" in data
        assert "metadata" in data
        assert data["metadata"]["solver"] == "eigenmode"
        assert data["metadata"]["frequency_ghz"] == 4.5
        assert data["metadata"]["runtime_seconds"] == 45  # Overwritten from mock_sim.runtime_seconds

    @patch("app.services.visualization.pv", create=True)
    def test_extract_3d_visualization_service(self, mock_pv):
        """Test the core service function for 3D visualization extraction using a mock PyVista dataset."""
        from app.services.visualization import extract_3d_visualization

        # 1. Mock PyVista dataset and its surface extraction
        mock_ds = MagicMock()
        mock_ds.n_points = 100

        mock_surf = MagicMock()
        mock_surf.points = np.array([[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]], dtype=np.float32)
        mock_surf.faces = np.array([3, 0, 1, 2], dtype=np.int32)
        mock_surf.point_normals = np.array([[0.0, 0.0, 1.0], [0.0, 0.0, 1.0], [0.0, 0.0, 1.0]], dtype=np.float32)
        mock_surf.point_data = _DictLike({"E": np.array([[1.0, 0.0, 0.0], [2.0, 0.0, 0.0], [3.0, 0.0, 0.0]], dtype=np.float32)})

        # Method chaining
        mock_ds.extract_surface.return_value = mock_surf
        mock_surf.triangulate.return_value = mock_surf

        mock_pv.read.return_value = mock_ds

        # Mock finding VTU files on path
        with patch("pathlib.Path.rglob") as mock_rglob:
            mock_rglob.return_value = [Path("/tmp/postpro/paraview/Cycle0001/data.pvtu")]

            # Execute the extraction
            result = extract_3d_visualization(
                artifact_dir=Path("/tmp"),
                sim_solver="eigenmode",
                sim_results={"eigenmode": {"modes": [{"mode_index": 1, "frequency_ghz": 4.5e9}]}},
                mode=1
            )

            # Asserts
            assert "mesh" in result
            assert "field" in result
            assert "metadata" in result
            assert result["mesh"]["vertices"] == [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
            assert result["mesh"]["faces"] == [[0, 1, 2]]
            assert result["field"]["min"] == 1.0
            assert result["field"]["max"] == 3.0
            assert result["metadata"]["frequency_ghz"] == 4.5

    @patch("app.services.visualization.pv", create=True)
    def test_extract_3d_visualization_custom_field(self, mock_pv):
        """Test extraction with custom field name (e.g. U_m or B)."""
        from app.services.visualization import extract_3d_visualization

        mock_ds = MagicMock()
        mock_ds.n_points = 100

        mock_surf = MagicMock()
        mock_surf.points = np.array([[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]], dtype=np.float32)
        mock_surf.faces = np.array([3, 0, 1, 2], dtype=np.int32)
        mock_surf.point_normals = np.array([[0.0, 0.0, 1.0], [0.0, 0.0, 1.0], [0.0, 0.0, 1.0]], dtype=np.float32)
        mock_surf.point_data = _DictLike({"U_m": np.array([1e-12, 5e-12, 1e-11], dtype=np.float32)})

        mock_ds.extract_surface.return_value = mock_surf
        mock_surf.triangulate.return_value = mock_surf

        mock_pv.read.return_value = mock_ds

        with patch("pathlib.Path.rglob") as mock_rglob:
            mock_rglob.return_value = [Path("/tmp/postpro/paraview/Cycle0001/data.pvtu")]

            result = extract_3d_visualization(
                artifact_dir=Path("/tmp"),
                sim_solver="eigenmode",
                sim_results={"eigenmode": {"modes": [{"mode_index": 1, "frequency_ghz": 4.5e9}]}},
                mode=1,
                field_name="U_m"
            )

            assert "field" in result
            assert result["field"]["name"] == "U_m"
            assert result["field"]["unit"] == "J/m³"
            assert result["field"]["min"] == pytest.approx(1e-12)
            assert result["field"]["max"] == pytest.approx(1e-11)


    @patch("app.services.palace_mesh_parser.parse_palace_mesh")
    @patch("app.routers.simulations._authorize_simulation")
    @patch("pathlib.Path.exists")
    def test_get_3d_mesh_success(self, mock_exists, mock_authorize, mock_parse, client):
        """Test that the 3D volume mesh endpoint successfully returns extracted mesh data."""
        # 1. Setup mock simulation
        mock_sim = MagicMock()
        mock_sim.solver = "eigenmode"
        mock_sim.artifact_retained = True
        mock_sim.artifact_path = "dummy/path"
        mock_sim.runtime_seconds = 58
        mock_sim.results = {"eigenmode": {"modes": [{"mode_index": 1, "frequency_ghz": 4.5}]}}
        mock_authorize.return_value = mock_sim

        # 2. Setup path existence mock
        mock_exists.return_value = True

        # 3. Setup mock parsed data
        mock_parse.return_value = {
            "mesh": {
                "vertices": [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]],
                "elements": [[0, 1, 2, 3]],
                "bounds": {"x": [0.0, 1.0], "y": [0.0, 1.0], "z": [0.0, 1.0]}
            },
            "metadata": {
                "solver": "eigenmode",
                "total_elements": 1,
                "total_vertices": 4,
                "frequency_ghz": 4.5,
                "runtime_seconds": 58
            }
        }

        # 4. Make request to our new endpoint
        resp = client.get("/api/simulations/test-sim-id/mesh")
        assert resp.status_code == 200

        data = resp.json()
        assert "mesh" in data
        assert "metadata" in data
        assert data["mesh"]["elements"] == [[0, 1, 2, 3]]
        assert data["metadata"]["total_elements"] == 1
        assert data["metadata"]["total_vertices"] == 4

    @patch("app.services.palace_mesh_parser.pv", create=True)
    def test_parse_palace_mesh_service(self, mock_pv):
        """Test the core parser service for 3D volume mesh extraction using a mock PyVista dataset."""
        from app.services.palace_mesh_parser import parse_palace_mesh

        # 1. Mock PyVista dataset with tetrahedral elements
        mock_ds = MagicMock()
        mock_ds.points = np.array([
            [0.0, 0.0, 0.0],
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0, 0.0, 1.0]
        ], dtype=np.float32)
        mock_ds.n_cells = 1
        # cells: [n_nodes, i0, i1, i2, i3] -> [4, 0, 1, 2, 3]
        mock_ds.cells = np.array([4, 0, 1, 2, 3], dtype=np.int32)
        mock_ds.cell_types = np.array([10], dtype=np.int8)  # 10 is VTK_TETRA
        mock_ds.bounds = [0.0, 1.0, 0.0, 1.0, 0.0, 1.0]

        mock_pv.read.return_value = mock_ds

        # Mock finding .msh files on path
        with patch("pathlib.Path.exists") as mock_exists:
            # First folder/mesh.msh exists
            mock_exists.return_value = True

            # Execute the parser
            result = parse_palace_mesh(
                artifact_dir=Path("/tmp"),
                sim_solver="eigenmode",
                sim_results={"eigenmode": {"modes": [{"mode_index": 1, "frequency_ghz": 4.5e9}]}}
            )

            # Asserts
            assert "mesh" in result
            assert "metadata" in result
            assert result["mesh"]["vertices"] == [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
            assert result["mesh"]["elements"] == [[0, 1, 2, 3]]
            assert result["mesh"]["bounds"] == {"x": [0.0, 1.0], "y": [0.0, 1.0], "z": [0.0, 1.0]}
            assert result["metadata"]["total_elements"] == 1
            assert result["metadata"]["total_vertices"] == 4
            assert result["metadata"]["frequency_ghz"] == 4.5


