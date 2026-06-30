"""Comprehensive unit and integration tests for the Simulation Mesh Generator."""

from __future__ import annotations

import copy
import json
import tempfile
import uuid
from pathlib import Path
import pytest

from app.simulation.workspace import WorkspaceManager, WorkspaceNotFoundError
from app.simulation.geometry import GeometryBuilder
from app.simulation.mesh import (
    MeshGenerator,
    MeshSettings,
    MeshMetadata,
    MeshQualityMetrics,
    MeshImportError,
    MeshGenerationError,
    MeshValidationError,
)
from app.simulation.mesh.constants import (
    EXPORT_MSH_FILENAME,
    EXPORT_METADATA_FILENAME,
    EXPORT_QUALITY_FILENAME,
    EXPORT_LOG_FILENAME,
)


@pytest.fixture
def temp_workspace_root():
    """Create a temporary directory for workspace roots, cleaned up after tests."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        yield Path(tmp_dir)


@pytest.fixture
def temp_archive_dir():
    """Create a temporary directory for archives, cleaned up after tests."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        yield Path(tmp_dir)


@pytest.fixture
def workspace_manager(temp_workspace_root, temp_archive_dir):
    """Provide a WorkspaceManager configured with temporary directories."""
    return WorkspaceManager(
        workspace_root=temp_workspace_root,
        archive_dir=temp_archive_dir,
        max_workspace_count=50,
        cleanup_timeout_seconds=3600.0,
    )


@pytest.fixture
def geometry_builder(workspace_manager):
    """Provide a GeometryBuilder instance sharing the mock workspace manager."""
    return GeometryBuilder(workspace_manager=workspace_manager)


@pytest.fixture
def mesh_generator(workspace_manager):
    """Provide a MeshGenerator instance sharing the mock workspace manager."""
    return MeshGenerator(workspace_manager=workspace_manager)


@pytest.fixture
def valid_v2_payload():
    """Returns a valid V2 design graph payload containing 2 qubits, a resonator, and a coupler."""
    return {
        "v2": {
            "graph": {
                "chip_name": "Mesh_Test_Processor",
                "chip_width_mm": 8.0,
                "chip_height_mm": 8.0,
                "substrate": "silicon",
                "metal": "aluminum",
                "nodes": [
                    {
                        "id": "q0",
                        "kind": "qubit",
                        "x_mm": -1.5,
                        "y_mm": 0.0,
                        "orientation_deg": 0,
                        "qubit_type": "transmon",
                        "frequency_ghz": 5.0,
                        "anharmonicity_ghz": -0.3,
                        "ej_ghz": 12.5,
                        "ec_ghz": 0.28,
                        "design_options": {
                            "pocket_width_um": 500.0,
                            "pocket_height_um": 500.0,
                            "pad_width_um": 350.0,
                            "pad_height_um": 80.0,
                            "pad_gap_um": 25.0,
                        }
                    },
                    {
                        "id": "q1",
                        "kind": "qubit",
                        "x_mm": 1.5,
                        "y_mm": 0.0,
                        "orientation_deg": 90,
                        "qubit_type": "transmon",
                        "frequency_ghz": 5.2,
                        "anharmonicity_ghz": -0.3,
                        "ej_ghz": 13.0,
                        "ec_ghz": 0.28,
                        "design_options": {
                            "pocket_width_um": 500.0,
                            "pocket_height_um": 500.0,
                            "pad_width_um": 350.0,
                            "pad_height_um": 80.0,
                            "pad_gap_um": 25.0,
                        }
                    },
                    {
                        "id": "r0",
                        "kind": "resonator",
                        "x_mm": 0.0,
                        "y_mm": 2.0,
                        "orientation_deg": 0,
                        "resonator_type": "readout",
                        "frequency_ghz": 6.5,
                        "length_mm": 2.0,
                        "target_qubit_id": "q0",
                    }
                ],
                "edges": []
            }
        }
    }


@pytest.fixture
def valid_legacy_payload():
    """Returns a valid legacy payload using flat placements."""
    return {
        "id": "legacy_mesh_test",
        "design": {
            "placements": [
                {
                    "instanceId": "q0",
                    "componentId": "TransmonPocket",
                    "x": -1.0,
                    "y": 0.5,
                    "rotation": 0.0,
                    "params": {
                        "pocket_width_um": 650.0,
                        "pocket_height_um": 650.0,
                    }
                }
            ]
        },
        "frequency_plan": {
            "substrate": "sapphire",
            "metal": "aluminum",
            "qubit_frequencies_GHz": {
                "q0": 5.0,
            }
        }
    }


# --- Unit & Integration Tests ---

def test_mesh_v2_conformal_success(geometry_builder, mesh_generator, workspace_manager, valid_v2_payload):
    """Verify that a V2 geometry script is successfully meshed, tagged, validated, and exported."""
    sim_id = str(uuid.uuid4())
    workspace_manager.create_workspace(sim_id)

    # 1. Generate geometry artifacts
    geometry_builder.build_geometry(sim_id, valid_v2_payload)

    # 2. Generate conformal 3D mesh (coarse=True for fast test execution)
    mesh_metadata = mesh_generator.generate_mesh(sim_id, coarse=True)

    # 3. Assert metadata attributes
    assert isinstance(mesh_metadata, MeshMetadata)
    assert mesh_metadata.workspace_id == sim_id
    assert mesh_metadata.node_count > 0
    assert mesh_metadata.element_count > 0
    assert mesh_metadata.tet_count > 0
    assert mesh_metadata.triangle_count > 0
    assert mesh_metadata.line_count > 0

    # 4. Check that physical groups are assigned correctly
    groups = mesh_metadata.physical_groups
    assert "air" in groups
    assert "substrate" in groups
    assert "pec" in groups
    assert "port_q0" in groups
    assert "port_q1" in groups
    assert "terminal_q0" in groups
    assert "terminal_q1" in groups
    assert "terminal_r0" in groups
    assert "absorbing" in groups

    assert groups["air"]["dim"] == 3
    assert groups["substrate"]["dim"] == 3
    assert groups["pec"]["dim"] == 2
    assert groups["port_q0"]["dim"] == 2
    assert groups["absorbing"]["dim"] == 2

    # 5. Check output files in workspace
    ws = workspace_manager.get_workspace(sim_id)
    mesh_dir = Path(ws.mesh_path)

    assert (mesh_dir / EXPORT_MSH_FILENAME).exists()
    assert (mesh_dir / EXPORT_METADATA_FILENAME).exists()
    assert (mesh_dir / EXPORT_QUALITY_FILENAME).exists()
    assert (mesh_dir / EXPORT_LOG_FILENAME).exists()

    # 6. Read back and verify quality JSON
    with open(mesh_dir / EXPORT_QUALITY_FILENAME, "r") as f:
        quality_data = json.load(f)
    
    assert quality_data["element_count"] == mesh_metadata.tet_count
    assert quality_data["min_quality"] > 0.0
    assert quality_data["max_quality"] <= 1.0
    assert quality_data["mean_quality"] > 0.3
    assert len(quality_data["quality_histogram"]) == 10


def test_mesh_legacy_success(geometry_builder, mesh_generator, workspace_manager, valid_legacy_payload):
    """Verify that a legacy geometry layout is meshed successfully."""
    sim_id = str(uuid.uuid4())
    workspace_manager.create_workspace(sim_id)

    # 1. Generate geometry artifacts
    geometry_builder.build_geometry(sim_id, valid_legacy_payload)

    # 2. Generate mesh
    mesh_metadata = mesh_generator.generate_mesh(sim_id, coarse=True)

    # 3. Assert metadata
    assert mesh_metadata.workspace_id == sim_id
    assert "substrate" in mesh_metadata.physical_groups
    assert "pec" in mesh_metadata.physical_groups
    assert "terminal_q0" in mesh_metadata.physical_groups

    ws = workspace_manager.get_workspace(sim_id)
    mesh_dir = Path(ws.mesh_path)
    assert (mesh_dir / EXPORT_MSH_FILENAME).exists()


def test_mesh_generation_missing_geometry_raises(mesh_generator, workspace_manager):
    """Verify that attempting to mesh an empty workspace without geometry raises MeshImportError."""
    sim_id = str(uuid.uuid4())
    workspace_manager.create_workspace(sim_id)

    with pytest.raises(MeshImportError) as excinfo:
        mesh_generator.generate_mesh(sim_id)
    assert "Missing required geometry script" in str(excinfo.value)


def test_mesh_generation_missing_workspace_raises(mesh_generator):
    """Verify that meshing an unallocated simulation UUID raises WorkspaceNotFoundError."""
    fake_sim_id = str(uuid.uuid4())
    with pytest.raises(WorkspaceNotFoundError):
        mesh_generator.generate_mesh(fake_sim_id)


def test_coarse_mesh_sizing_options(geometry_builder, mesh_generator, workspace_manager, valid_v2_payload):
    """Verify that passing coarse=True adjusts mesh settings and runs successfully."""
    sim_id = str(uuid.uuid4())
    workspace_manager.create_workspace(sim_id)

    geometry_builder.build_geometry(sim_id, valid_v2_payload)

    # Generate with coarse=True
    meta_coarse = mesh_generator.generate_mesh(sim_id, coarse=True)
    
    # Assert settings are coarse
    assert meta_coarse.mesh_settings.mesh_size == 0.30
    assert meta_coarse.mesh_settings.min_element_size == 0.05
    assert meta_coarse.mesh_settings.max_element_size == 1.20
    assert meta_coarse.mesh_settings.boundary_refinement_factor == 0.50
