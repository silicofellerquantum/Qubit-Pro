"""Comprehensive unit tests for the Simulation Geometry Builder."""

from __future__ import annotations

import copy
import json
import math
import tempfile
import uuid
from pathlib import Path
import pytest

from app.simulation.workspace import WorkspaceManager, WorkspaceNotFoundError
from app.simulation.geometry import (
    DuplicateComponentError,
    GeometryBuilder,
    GeometryComponent,
    GeometryComponentKind,
    GeometryMetadata,
    GeometryValidationError,
    InvalidLayerError,
    InvalidMaterialError,
    LogicalPort,
    OverlapError,
)
from app.simulation.geometry.coordinate_transform import (
    local_to_global,
    rotate_point,
    transform_bounding_box,
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


# --- Payload Fixtures ---

@pytest.fixture
def valid_v2_payload():
    """Returns a valid V2 design graph payload containing qubits, meanders, and couplers."""
    return {
        "v2": {
            "graph": {
                "chip_name": "Processor_2Qubit",
                "chip_width_mm": 10.0,
                "chip_height_mm": 10.0,
                "substrate": "silicon",
                "metal": "niobium",
                "nodes": [
                    {
                        "id": "q0",
                        "kind": "qubit",
                        "x_mm": -2.0,
                        "y_mm": 0.0,
                        "orientation_deg": 0,
                        "qubit_type": "transmon",
                        "frequency_ghz": 5.0,
                        "anharmonicity_ghz": -0.3,
                        "ej_ghz": 12.5,
                        "ec_ghz": 0.28,
                        "design_options": {
                            "pocket_width_um": 650.0,
                            "pocket_height_um": 650.0,
                        }
                    },
                    {
                        "id": "q1",
                        "kind": "qubit",
                        "x_mm": 2.0,
                        "y_mm": 0.0,
                        "orientation_deg": 90,
                        "qubit_type": "transmon",
                        "frequency_ghz": 5.2,
                        "anharmonicity_ghz": -0.3,
                        "ej_ghz": 13.0,
                        "ec_ghz": 0.28,
                        "design_options": {
                            "pocket_width_um": 650.0,
                            "pocket_height_um": 650.0,
                        }
                    },
                    {
                        "id": "r0",
                        "kind": "resonator",
                        "x_mm": -1.0,
                        "y_mm": 2.0,
                        "orientation_deg": 45,
                        "resonator_type": "readout",
                        "frequency_ghz": 6.5,
                        "length_mm": 2.5,
                        "target_qubit_id": "q0",
                    },
                    {
                        "id": "c0",
                        "kind": "coupler",
                        "x_mm": 0.0,
                        "y_mm": 0.0,
                        "orientation_deg": 0,
                        "coupler_type": "fixed",
                        "strength_mhz": 100.0,
                        "qubit_a_id": "q0",
                        "qubit_b_id": "q1",
                    }
                ],
                "edges": []
            }
        }
    }


@pytest.fixture
def valid_legacy_payload():
    """Returns a valid legacy payload using flat placements and frequency plan."""
    return {
        "id": "legacy_two_qubit",
        "design": {
            "placements": [
                {
                    "instanceId": "q0",
                    "componentId": "TransmonPocket",
                    "x": -2.0,
                    "y": 1.0,
                    "rotation": 0.0,
                    "params": {
                        "pocket_width_um": 600.0,
                        "pocket_height_um": 600.0,
                    }
                },
                {
                    "instanceId": "r0_readout",
                    "componentId": "MeanderResonator",
                    "x": 0.0,
                    "y": -1.0,
                    "rotation": 180.0,
                    "params": {
                        "length_um": 3000.0,
                        "cpw_width_um": 10.0,
                        "cpw_gap_um": 6.0,
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


# --- Coordinate Transformation Tests ---

def test_coordinate_transforms():
    """Directly verify 2D affine rotation, translation, and bounding box math."""
    # 1. Rotate point (1, 0) by 90 degrees around (0, 0) -> (0, 1)
    rx, ry = rotate_point(1.0, 0.0, 90.0)
    assert pytest.approx(rx) == 0.0
    assert pytest.approx(ry) == 1.0

    # 2. Rotate point (1, 1) by 180 degrees around (1, 0) -> (1, -1)
    rx2, ry2 = rotate_point(1.0, 1.0, 180.0, origin=(1.0, 0.0))
    assert pytest.approx(rx2) == 1.0
    assert pytest.approx(ry2) == -1.0

    # 3. Local to global: Local (1, 0) placed at global (5, 5) rotated by 90 deg -> (5, 6)
    gx, gy = local_to_global(1.0, 0.0, 5.0, 5.0, 90.0)
    assert pytest.approx(gx) == 5.0
    assert pytest.approx(gy) == 6.0

    # 4. Rotated bounding box: Local box (-1, -1, 1, 1) rotated by 45 degrees
    # Corners: (-1,-1), (-1,1), (1,-1), (1,1)
    # Rotated: (-sqrt(2), 0), (0, sqrt(2)), (0, -sqrt(2)), (sqrt(2), 0)
    # Global box around these: [-sqrt(2), -sqrt(2), sqrt(2), sqrt(2)]
    g_xmin, g_ymin, g_xmax, g_ymax = transform_bounding_box(
        (-1.0, -1.0, 1.0, 1.0), 0.0, 0.0, 45.0
    )
    expected_limit = math.sqrt(2.0)
    assert pytest.approx(g_xmin) == -expected_limit
    assert pytest.approx(g_ymin) == -expected_limit
    assert pytest.approx(g_xmax) == expected_limit
    assert pytest.approx(g_ymax) == expected_limit


# --- Core Geometry Builder Tests ---

def test_build_v2_success(geometry_builder, workspace_manager, valid_v2_payload):
    """Verify that a V2 design graph compiles, validates, and exports successfully."""
    sim_id = str(uuid.uuid4())
    workspace_manager.create_workspace(sim_id)

    metadata = geometry_builder.build_geometry(sim_id, valid_v2_payload)

    # 1. Assert metadata schema is populated
    assert isinstance(metadata, GeometryMetadata)
    assert metadata.design_id == "Processor_2Qubit"
    assert metadata.component_count == 5  # 1 substrate + 2 qubits + 1 resonator + 1 coupler
    assert "metal" in metadata.layers
    assert "silicon" in metadata.materials
    assert len(metadata.ports) == 6  # 2 qubit ports + 2 resonator ports + 2 coupler ports

    # 2. Check generated files on disk
    ws = workspace_manager.get_workspace(sim_id)
    geom_dir = Path(ws.geometry_path)
    
    assert (geom_dir / "design.json").exists()
    assert (geom_dir / "geometry.geo").exists()
    assert (geom_dir / "geometry_metadata.json").exists()
    assert (geom_dir / "geometry.step").exists()

    # 3. Read back metadata
    with open(geom_dir / "geometry_metadata.json", "r") as f:
        meta_dict = json.load(f)
    assert meta_dict["design_id"] == "Processor_2Qubit"
    assert len(meta_dict["ports"]) == 6


def test_build_legacy_success(geometry_builder, workspace_manager, valid_legacy_payload):
    """Verify that a legacy flat payload falls back and compiles correctly."""
    sim_id = str(uuid.uuid4())
    workspace_manager.create_workspace(sim_id)

    metadata = geometry_builder.build_geometry(sim_id, valid_legacy_payload)

    assert metadata.design_id == "legacy_two_qubit"
    assert metadata.component_count == 3  # 1 substrate + 1 qubit + 1 resonator
    assert "sapphire" in metadata.materials
    assert "aluminum" in metadata.materials

    ws = workspace_manager.get_workspace(sim_id)
    geom_dir = Path(ws.geometry_path)
    assert (geom_dir / "geometry.geo").exists()
    assert (geom_dir / "geometry_metadata.json").exists()


def test_missing_workspace_raises(geometry_builder, valid_v2_payload):
    """Verify that building for an unallocated simulation workspace raises an error."""
    fake_sim_id = str(uuid.uuid4())
    with pytest.raises(WorkspaceNotFoundError):
        geometry_builder.build_geometry(fake_sim_id, valid_v2_payload)


# --- Deep Layout Validation Tests ---

def test_duplicate_component_ids(geometry_builder):
    """Verify that duplicate component IDs in the layout trigger a DuplicateComponentError in the validator."""
    validator = geometry_builder.validator
    
    comp1 = GeometryComponent(
        id="q0",
        kind=GeometryComponentKind.QUBIT,
        x_mm=0.0,
        y_mm=0.0,
        layer="metal",
        material="aluminum",
    )
    comp2 = GeometryComponent(
        id="q0",  # Duplicate ID
        kind=GeometryComponentKind.QUBIT,
        x_mm=2.0,
        y_mm=0.0,
        layer="metal",
        material="aluminum",
    )

    with pytest.raises(DuplicateComponentError) as excinfo:
        validator.validate_design(
            components=[comp1, comp2],
            ports=[],
            chip_width_mm=10.0,
            chip_height_mm=10.0,
        )
    assert "Duplicate component identifier" in str(excinfo.value)


def test_out_of_bounds_die_limit(geometry_builder, workspace_manager, valid_v2_payload):
    """Verify that placing a component beyond the physical chip die boundary dynamically expands the die size."""
    sim_id = str(uuid.uuid4())
    workspace_manager.create_workspace(sim_id)

    # Deep copy the payload to prevent mutating the shared fixture
    payload = copy.deepcopy(valid_v2_payload)
    payload["v2"]["graph"]["nodes"][0]["x_mm"] = 6.0

    metadata = geometry_builder.build_geometry(sim_id, payload)
    # The chip width should have been expanded to accommodate Q0
    chip_width = metadata.bounding_box[2] - metadata.bounding_box[0]
    assert chip_width > 10.0


def test_overlap_collision_detection(geometry_builder, workspace_manager, valid_v2_payload):
    """Verify that placing two components on top of each other triggers an OverlapError."""
    sim_id = str(uuid.uuid4())
    workspace_manager.create_workspace(sim_id)

    # Deep copy the payload to prevent mutating the shared fixture
    payload = copy.deepcopy(valid_v2_payload)
    payload["v2"]["graph"]["nodes"][0]["x_mm"] = 1.0
    payload["v2"]["graph"]["nodes"][0]["y_mm"] = 1.0
    payload["v2"]["graph"]["nodes"][1]["x_mm"] = 1.0
    payload["v2"]["graph"]["nodes"][1]["y_mm"] = 1.0

    with pytest.raises(OverlapError) as excinfo:
        geometry_builder.build_geometry(sim_id, payload)
    assert "have identical center coordinates" in str(excinfo.value)


def test_disconnected_schematic_elements(geometry_builder, workspace_manager, valid_v2_payload):
    """Verify that meanders or couplers referencing non-existent qubits raise a validation error."""
    sim_id = str(uuid.uuid4())
    workspace_manager.create_workspace(sim_id)

    # Deep copy the payload to prevent mutating the shared fixture
    payload = copy.deepcopy(valid_v2_payload)
    payload["v2"]["graph"]["nodes"][3]["qubit_a_id"] = "q_unknown"  # Coupler node is index 3

    with pytest.raises(GeometryValidationError) as excinfo:
        geometry_builder.build_geometry(sim_id, payload)
    assert "references non-existent qubit_a" in str(excinfo.value)


def test_invalid_layer_assignment(geometry_builder):
    """Verify that assigning a component to an unregistered layer raises an error in the validator."""
    validator = geometry_builder.validator
    
    # Create a component with an invalid layer name
    bad_comp = GeometryComponent(
        id="bad_metal",
        kind=GeometryComponentKind.RESONATOR,
        x_mm=0.0,
        y_mm=0.0,
        layer="unregistered_super_layer",
        material="aluminum",
    )

    with pytest.raises(InvalidLayerError) as excinfo:
        validator.validate_design(
            components=[bad_comp],
            ports=[],
            chip_width_mm=10.0,
            chip_height_mm=10.0,
        )
    assert "Invalid layer" in str(excinfo.value)


def test_invalid_material_mapping(geometry_builder, workspace_manager, valid_v2_payload):
    """Verify that assigning a component to an unregistered material raises an error."""
    sim_id = str(uuid.uuid4())
    workspace_manager.create_workspace(sim_id)

    # Deep copy the payload to prevent mutating the shared fixture
    payload = copy.deepcopy(valid_v2_payload)
    payload["v2"]["graph"]["metal"] = "unobtainium"

    with pytest.raises(InvalidMaterialError) as excinfo:
        geometry_builder.build_geometry(sim_id, payload)
    assert "Invalid material" in str(excinfo.value)


# --- Custom Layers and Materials Registration Tests ---

def test_custom_layers_registration(geometry_builder):
    """Verify that we can register and validate custom fabrication layers."""
    lm = geometry_builder.layer_manager

    # 1. Register a custom superconducting junction layer
    lm.register_layer("niobium_junction_v3")
    
    # 2. Check listing
    assert "niobium_junction_v3" in lm.list_layers()
    
    # 3. Validate should pass
    lm.validate_layer("niobium_junction_v3")

    # 4. Validate of unregistered layer should raise
    with pytest.raises(InvalidLayerError):
        lm.validate_layer("some_phantom_layer")


def test_custom_materials_registration(geometry_builder):
    """Verify that we can register and validate custom materials."""
    mm = geometry_builder.material_mapper

    # 1. Register a custom material
    mm.register_material("diamond")
    
    # 2. Check listing
    assert "diamond" in mm.list_materials()
    
    # 3. Validate should pass
    mm.validate_material("diamond")

    # 4. Validate of unregistered material should raise
    with pytest.raises(InvalidMaterialError):
        mm.validate_material("plutonium")


# --- Performance / Large Scale Placements Tests ---

def test_large_scale_design_performance(geometry_builder, workspace_manager):
    """Place 100 components on a large die to verify scalability, overlap checks, and performance."""
    sim_id = str(uuid.uuid4())
    workspace_manager.create_workspace(sim_id)

    # Synthesize a large payload: 100 qubits arranged in a 10x10 grid on a 30x30 mm die
    nodes_list = []
    for row in range(10):
        for col in range(10):
            idx = row * 10 + col
            # Safe grid pitch = 2.5 mm to avoid overlapping 0.65 mm pockets
            x = (col - 4.5) * 2.5
            y = (row - 4.5) * 2.5
            nodes_list.append({
                "id": f"q_{idx}",
                "kind": "qubit",
                "x_mm": x,
                "y_mm": y,
                "orientation_deg": 0,
                "qubit_type": "transmon",
                "frequency_ghz": 5.0 + 0.01 * idx,
            })

    large_payload = {
        "v2": {
            "graph": {
                "chip_name": "Grid_100_Qubits",
                "chip_width_mm": 30.0,
                "chip_height_mm": 30.0,
                "substrate": "silicon",
                "metal": "aluminum",
                "nodes": nodes_list,
                "edges": []
            }
        }
    }

    # Execute build
    metadata = geometry_builder.build_geometry(sim_id, large_payload)

    # Assert 100 qubits + 1 substrate = 101 components
    assert metadata.component_count == 101
    assert metadata.design_id == "Grid_100_Qubits"
    assert len(metadata.ports) == 100


def test_simplify_path():
    """Verify that RDP simplify_path correctly decimates redundant/collinear points."""
    from app.simulation.geometry.coordinate_transform import simplify_path

    # 1. Edge cases: Empty list or small lists should return as-is
    assert simplify_path([]) == []
    assert simplify_path([(0.0, 0.0)]) == [(0.0, 0.0)]
    assert simplify_path([(0.0, 0.0), (1.0, 1.0)]) == [(0.0, 0.0), (1.0, 1.0)]

    # 2. Collinear points: A straight line with intermediate points
    # (0,0) -> (1,1) -> (2,2) -> (3,3) -> (4,4) should be simplified to just (0,0) -> (4,4)
    line = [(0.0, 0.0), (1.0, 1.0), (2.0, 2.0), (3.0, 3.0), (4.0, 4.0)]
    assert simplify_path(line) == [(0.0, 0.0), (4.0, 4.0)]

    # 3. Small deviations within tolerance:
    # A path deviating by 1 micron (0.001 mm) should be simplified to endpoints at 0.002 tolerance
    deviating_line = [(0.0, 0.0), (2.0, 0.001), (4.0, 0.0)]
    assert simplify_path(deviating_line, tolerance=0.002) == [(0.0, 0.0), (4.0, 0.0)]

    # 4. Large deviations exceeding tolerance:
    # A path deviating by 3 microns (0.003 mm) should keep the middle point at 0.002 tolerance
    sharp_line = [(0.0, 0.0), (2.0, 0.003), (4.0, 0.0)]
    assert simplify_path(sharp_line, tolerance=0.002) == [(0.0, 0.0), (2.0, 0.003), (4.0, 0.0)]

