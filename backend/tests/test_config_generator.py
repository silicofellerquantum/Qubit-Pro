"""Comprehensive unit and integration tests for the Palace Configuration Generator."""

from __future__ import annotations

import json
import tempfile
import uuid
from pathlib import Path
import pytest

from app.simulation.workspace import WorkspaceManager, WorkspaceNotFoundError
from app.simulation.geometry import GeometryBuilder
from app.simulation.mesh import MeshGenerator
from app.simulation.config import (
    PalaceConfigGenerator,
    PalaceConfig,
    ConfigError,
    ConfigGenerationError,
    ConfigValidationError,
)
from app.simulation.config.constants import (
    EXPORT_CONFIG_FILENAME,
    EXPORT_CONFIG_METADATA_FILENAME,
    DEFAULT_SUBSTRATE_PERMITTIVITY,
    DEFAULT_JUNCTION_L_NH,
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
def config_generator(workspace_manager):
    """Provide a PalaceConfigGenerator instance sharing the mock workspace manager."""
    return PalaceConfigGenerator(workspace_manager=workspace_manager)


@pytest.fixture
def mock_mesh_metadata():
    """Provides mock mesh metadata representing a two-qubit chip."""
    return {
        "workspace_id": "test_sim_id",
        "node_count": 500,
        "element_count": 2000,
        "tet_count": 1500,
        "triangle_count": 400,
        "line_count": 100,
        "bounding_box": [-4.0, -4.0, 4.0, 4.0],
        "physical_groups": {
            "air": {"tag": 1, "dim": 3},
            "substrate": {"tag": 2, "dim": 3},
            "pec": {"tag": 3, "dim": 2},
            "absorbing": {"tag": 4, "dim": 2},
            "terminal_q0": {"tag": 10, "dim": 2},
            "terminal_q1": {"tag": 11, "dim": 2},
            "terminal_r0": {"tag": 12, "dim": 2},
            "port_q0": {"tag": 100, "dim": 2},
            "port_q1": {"tag": 101, "dim": 2},
        },
    }


@pytest.fixture
def mock_design_payload():
    """Provides a mock design payload with qubit parameters."""
    return {
        "design_id": "test_design",
        "components": [
            {
                "id": "q0",
                "kind": "qubit",
                "params": {"L_nH": 12.5},
            },
            {
                "id": "q1",
                "kind": "qubit",
                "params": {"L_nH": 10.5},
            },
            {
                "id": "r0",
                "kind": "resonator",
                "params": {"length_um": 2500.0},
            },
        ],
        "frequency_plan": {
            "qubit_frequencies_GHz": {
                "q0": 5.1,
                "q1": 5.3,
            }
        },
    }


# --- Unit Tests ---

def test_generate_config_eigenmode_success(workspace_manager, config_generator, mock_mesh_metadata, mock_design_payload):
    """Verify that an Eigenmode solver configuration is generated with correct physical mappings."""
    sim_id = str(uuid.uuid4())
    ws = workspace_manager.create_workspace(sim_id)

    # Pre-populate mock workspace artifacts
    mesh_meta_file = Path(ws.mesh_path) / "mesh_metadata.json"
    with open(mesh_meta_file, "w") as f:
        json.dump(mock_mesh_metadata, f)

    design_file = Path(ws.geometry_path) / "design.json"
    with open(design_file, "w") as f:
        json.dump(mock_design_payload, f)

    # Generate config
    config, metadata = config_generator.generate_config(sim_id, "eigenmode")

    # Assert model structures
    assert isinstance(config, PalaceConfig)
    assert config.problem.solver_type == "Eigenmode"
    assert config.model.mesh == "../mesh/mesh.msh"

    # Materials: Air & Substrate
    materials = config.domains.materials
    assert len(materials) == 2
    assert materials[0].attributes == [1]  # air
    assert materials[1].attributes == [2]  # substrate
    assert materials[1].permittivity == DEFAULT_SUBSTRATE_PERMITTIVITY

    # Boundaries: PEC (Ground + Terminals)
    pec = config.boundaries.pec
    assert pec is not None
    # 3 (ground) + 10 (q0) + 11 (q1) + 12 (r0) = [3, 10, 11, 12]
    assert sorted(pec.attributes) == [3, 10, 11, 12]

    # Boundaries: Absorbing outer boundary
    absorbing = config.boundaries.absorbing
    assert absorbing is not None
    assert absorbing.attributes == [4]
    assert absorbing.order == 1

    # Boundaries: Lumped Ports (Josephson junctions)
    ports = config.boundaries.lumped_port
    assert ports is not None
    assert len(ports) == 2
    
    # Sort by index to assert parameters
    ports_sorted = sorted(ports, key=lambda p: p.index)
    assert ports_sorted[0].index == 1
    assert ports_sorted[0].attributes == [100]  # port_q0
    assert ports_sorted[0].l == 12.5              # From design payload (q0 L_nH)
    assert ports_sorted[0].r == 0.0

    assert ports_sorted[1].index == 2
    assert ports_sorted[1].attributes == [101]  # port_q1
    assert ports_sorted[1].l == 10.5              # From design payload (q1 L_nH)

    # Solver specific settings
    assert config.solver.eigenmode is not None
    assert config.solver.eigenmode.n == 7          # 2 ports + 3 terminals + 2 = 7, but user setting overrides or default is used
    # Target frequency calculated from design payload frequency plan: (5.1 + 5.3) / 2 = 5.2 GHz -> 5.2e9 Hz
    assert pytest.approx(config.solver.eigenmode.target) == 5.2e9

    # Verify files are written
    config_file = Path(ws.config_path) / EXPORT_CONFIG_FILENAME
    assert config_file.exists()
    assert (Path(ws.config_path) / EXPORT_CONFIG_METADATA_FILENAME).exists()

    # Verify casing of serialized JSON
    with open(config_file, "r") as f:
        serialized = json.load(f)
    assert "Problem" in serialized
    assert "Solver" in serialized
    assert "Type" in serialized["Problem"]


def test_generate_config_electrostatic_success(workspace_manager, config_generator, mock_mesh_metadata, mock_design_payload):
    """Verify that an Electrostatic solver configuration maps terminals and omits absorbing/lumped ports."""
    sim_id = str(uuid.uuid4())
    ws = workspace_manager.create_workspace(sim_id)

    with open(Path(ws.mesh_path) / "mesh_metadata.json", "w") as f:
        json.dump(mock_mesh_metadata, f)
    with open(Path(ws.geometry_path) / "design.json", "w") as f:
        json.dump(mock_design_payload, f)

    config, metadata = config_generator.generate_config(sim_id, "electrostatic")

    assert config.problem.solver_type == "Electrostatic"
    # PEC is ONLY the ground plane (3)
    assert config.boundaries.pec.attributes == [3]
    # No absorbing boundaries in electrostatic
    assert config.boundaries.absorbing is None
    # No lumped ports in electrostatic
    assert config.boundaries.lumped_port is None

    # Terminals are mapped independently to extract capacitance matrix
    terminals = config.boundaries.terminal
    assert terminals is not None
    assert len(terminals) == 3
    terms_sorted = sorted(terminals, key=lambda t: t.index)
    assert terms_sorted[0].index == 1
    assert terms_sorted[0].attributes == [10]  # terminal_q0
    assert terms_sorted[1].index == 2
    assert terms_sorted[1].attributes == [11]  # terminal_q1
    assert terms_sorted[2].index == 3
    assert terms_sorted[2].attributes == [12]  # terminal_r0

    assert config.solver.electrostatic is not None
    assert config.solver.electrostatic.save == 1


def test_generate_config_magnetostatic_success(workspace_manager, config_generator, mock_mesh_metadata, mock_design_payload):
    """Verify that a Magnetostatic solver configuration maps terminals to excitation lumped ports."""
    sim_id = str(uuid.uuid4())
    ws = workspace_manager.create_workspace(sim_id)

    with open(Path(ws.mesh_path) / "mesh_metadata.json", "w") as f:
        json.dump(mock_mesh_metadata, f)
    with open(Path(ws.geometry_path) / "design.json", "w") as f:
        json.dump(mock_design_payload, f)

    config, metadata = config_generator.generate_config(sim_id, "magnetostatic")

    assert config.problem.solver_type == "Magnetostatic"
    # PEC is ONLY the ground plane (3)
    assert config.boundaries.pec.attributes == [3]
    # Terminals are mapped to excitation surface currents
    surface_currents = config.boundaries.surface_current
    assert surface_currents is not None
    assert len(surface_currents) == 3
    currents_sorted = sorted(surface_currents, key=lambda c: c.index)
    assert currents_sorted[0].index == 1
    assert currents_sorted[0].attributes == [10]  # terminal_q0

    assert config.solver.magnetostatic is not None


def test_generate_config_driven_success(workspace_manager, config_generator, mock_mesh_metadata, mock_design_payload):
    """Verify that a Driven solver configuration handles frequency sweep inputs correctly."""
    sim_id = str(uuid.uuid4())
    ws = workspace_manager.create_workspace(sim_id)

    with open(Path(ws.mesh_path) / "mesh_metadata.json", "w") as f:
        json.dump(mock_mesh_metadata, f)
    with open(Path(ws.geometry_path) / "design.json", "w") as f:
        json.dump(mock_design_payload, f)

    user_settings = {
        "solver_options": {
            "driven_options": {
                "min_freq_ghz": 2.0,
                "max_freq_ghz": 8.0,
                "freq_step_ghz": 0.05,
            }
        }
    }

    config, metadata = config_generator.generate_config(sim_id, "driven", user_settings)

    assert config.problem.solver_type == "Driven"
    assert config.solver.driven is not None
    # Converted to Hz
    assert pytest.approx(config.solver.driven.min_freq) == 2.0e9
    assert pytest.approx(config.solver.driven.max_freq) == 8.0e9
    assert pytest.approx(config.solver.driven.freq_step) == 0.05e9


def test_generate_config_validation_failures(config_generator, workspace_manager, mock_mesh_metadata):
    """Verify that config generation correctly validates parameters and raises custom exceptions."""
    sim_id = str(uuid.uuid4())
    ws = workspace_manager.create_workspace(sim_id)

    # 1. Missing mesh metadata raises ConfigGenerationError
    with pytest.raises(ConfigGenerationError) as exc:
        config_generator.generate_config(sim_id, "eigenmode")
    assert "Mesh metadata file not found" in str(exc.value)

    # Write metadata to proceed
    with open(Path(ws.mesh_path) / "mesh_metadata.json", "w") as f:
        json.dump(mock_mesh_metadata, f)

    # 2. Invalid solver type raises ConfigValidationError
    with pytest.raises(ConfigValidationError) as exc:
        config_generator.generate_config(sim_id, "invalid_solver")
    assert "Unsupported solver type" in str(exc.value)

    # 3. Electrostatic without terminal groups raises ConfigValidationError
    bad_metadata = {
        "workspace_id": "bad",
        "physical_groups": {
            "air": {"tag": 1},
            "substrate": {"tag": 2},
            "pec": {"tag": 3},
        }
    }
    bad_sim_id = str(uuid.uuid4())
    bad_ws = workspace_manager.create_workspace(bad_sim_id)
    with open(Path(bad_ws.mesh_path) / "mesh_metadata.json", "w") as f:
        json.dump(bad_metadata, f)

    with pytest.raises(ConfigValidationError) as exc:
        config_generator.generate_config(bad_sim_id, "electrostatic")
    assert "requires at least one terminal boundary" in str(exc.value)


# --- End-to-End Integration Test ---

def test_end_to_end_pipeline_integration(workspace_manager, geometry_builder, mesh_generator, config_generator):
    """Verifies the complete pipeline flow: Geometry -> Conformal Mesh -> Palace Config."""
    sim_id = str(uuid.uuid4())
    workspace_manager.create_workspace(sim_id)

    # 1. Design Payload
    payload = {
        "v2": {
            "graph": {
                "chip_name": "Pipeline_Integration_Chip",
                "chip_width_mm": 6.0,
                "chip_height_mm": 6.0,
                "substrate": "silicon",
                "metal": "aluminum",
                "nodes": [
                    {
                        "id": "q0",
                        "kind": "qubit",
                        "x_mm": -1.0,
                        "y_mm": 0.0,
                        "qubit_type": "transmon",
                        "frequency_ghz": 4.9,
                        "design_options": {
                            "pocket_width_um": 400.0,
                            "pocket_height_um": 400.0,
                            "pad_width_um": 280.0,
                            "pad_height_um": 60.0,
                        }
                    }
                ],
                "edges": []
            }
        }
    }

    # 2. Geometry Builder
    geometry_builder.build_geometry(sim_id, payload)
    
    # 3. Mesh Generator (Coarse for speed)
    mesh_generator.generate_mesh(sim_id, coarse=True)

    # 4. Palace Configuration Generator
    config, metadata = config_generator.generate_config(sim_id, "eigenmode")

    # 5. Assert End-to-End correctness
    assert isinstance(config, PalaceConfig)
    assert config.problem.solver_type == "Eigenmode"
    assert config.boundaries.absorbing is not None
    assert config.boundaries.absorbing.attributes == [4]
    
    # Terminals (10+) and ground plane (3) mapped to PEC
    assert 3 in config.boundaries.pec.attributes
    assert 10 in config.boundaries.pec.attributes  # terminal_q0 tag is 10

    # Ports mapped to LumpedPorts
    assert config.boundaries.lumped_port is not None
    assert len(config.boundaries.lumped_port) == 1
    assert config.boundaries.lumped_port[0].attributes == [100]  # port_q0 tag is 100

    # Output file exists in sandboxed config/ directory
    ws = workspace_manager.get_workspace(sim_id)
    assert (Path(ws.config_path) / EXPORT_CONFIG_FILENAME).exists()
    assert (Path(ws.config_path) / EXPORT_CONFIG_METADATA_FILENAME).exists()
