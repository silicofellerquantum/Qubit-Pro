"""Unit and integration tests for GMSH mesh generation."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
import gmsh

from app.core.design_graph import DesignGraph, QubitNode, ResonatorNode, CouplerNode, graph_to_dict
from app.services.palace.geometry_builder import GeometryBuilder
from app.services.palace.gmsh_builder import GmshBuilder
from app.services.palace.palace_runner import PalaceRunner
from app.services.palace.exceptions import GmshBuilderError


@pytest.fixture
def sample_geometry():
    """Fixture to build an EMGeometry object representing a 2-qubit chip."""
    payload = {
        "project_name": "Test Palace Mesh Generation",
        "id": "design_gmsh_test",
        "v2": {
            "graph": {
                "chip_name": "test_qubit_chip",
                "chip_width_mm": 8.0,
                "chip_height_mm": 8.0,
                "substrate": "silicon",
                "metal": "aluminum",
                "nodes": [
                    {
                        "id": "Q1",
                        "kind": "qubit",
                        "x_mm": 1.5,
                        "y_mm": 2.0,
                        "orientation_deg": 0.0,
                        "params": {
                            "frequency_ghz": 5.0,
                            "pad_width_um": 400.0,
                            "pad_height_um": 80.0,
                            "pad_gap_um": 30.0,
                            "pocket_width_um": 600.0,
                            "pocket_height_um": 600.0,
                        }
                    },
                    {
                        "id": "Q2",
                        "kind": "qubit",
                        "x_mm": 4.5,
                        "y_mm": 2.0,
                        "orientation_deg": 90.0,
                        "params": {
                            "frequency_ghz": 5.2,
                            "pad_width_um": 400.0,
                            "pad_height_um": 80.0,
                            "pad_gap_um": 30.0,
                            "pocket_width_um": 600.0,
                            "pocket_height_um": 600.0,
                        }
                    },
                    {
                        "id": "R1",
                        "kind": "resonator",
                        "x_mm": 3.0,
                        "y_mm": 4.0,
                        "orientation_deg": 45.0,
                        "params": {
                            "length_mm": 2.5,
                            "cpw_width_um": 12.0,
                        }
                    },
                    {
                        "id": "C1",
                        "kind": "coupler",
                        "x_mm": 3.0,
                        "y_mm": 2.0,
                        "orientation_deg": 0.0,
                        "params": {
                            "length_mm": 1.0,
                            "cpw_width_um": 8.0,
                        }
                    }
                ]
            }
        }
    }
    return GeometryBuilder.build_geometry(payload)


def test_gmsh_builder_generation(sample_geometry, tmp_path):
    """Verify that GmshBuilder creates a non-empty mesh.msh file."""
    msh_path = tmp_path / "mesh.msh"
    
    # Run the generator
    GmshBuilder.generate_mesh(sample_geometry, msh_path)
    
    assert msh_path.exists()
    assert msh_path.stat().st_size > 0
    
    # Check that file starts with MSH header
    with open(msh_path, "r", encoding="utf-8", errors="ignore") as f:
        header = f.readline()
        assert "$MeshFormat" in header


def test_gmsh_builder_physical_groups(sample_geometry, tmp_path):
    """Verify that GMSH physical groups (volumes, surfaces, curves) are properly tagged."""
    msh_path = tmp_path / "mesh.msh"
    
    # Generate the mesh
    GmshBuilder.generate_mesh(sample_geometry, msh_path)
    
    # Read the mesh back using GMSH API to inspect physical groups
    if not gmsh.isInitialized():
        gmsh.initialize()
    
    try:
        gmsh.open(str(msh_path))
        
        # Get all physical groups
        groups = gmsh.model.getPhysicalGroups()
        group_names = {}
        for dim, tag in groups:
            name = gmsh.model.getPhysicalName(dim, tag)
            group_names[tag] = (dim, name)
            
        # Verify 3D volumes
        assert 1 in group_names  # Volume 1: Air
        assert group_names[1] == (3, "air")
        assert 2 in group_names  # Volume 2: Substrate
        assert group_names[2] == (3, "substrate")
        
        # Verify General PEC boundary
        assert 3 in group_names
        assert group_names[3][0] == 2
        assert "pec" in group_names[3][1]
        
        # Verify Electrostatic terminals (attributes 10 onwards)
        assert 10 in group_names
        assert group_names[10] == (2, "terminal_Q1")
        assert 11 in group_names
        assert group_names[11] == (2, "terminal_Q2")
        assert 12 in group_names
        assert group_names[12] == (2, "terminal_R1")
        
        # Verify Eigenmode lumped ports (attributes 100 onwards)
        assert 100 in group_names
        assert group_names[100] == (2, "port_Q1")
        assert 101 in group_names
        assert group_names[101] == (2, "port_Q2")
        
    finally:
        if gmsh.isInitialized():
            gmsh.finalize()


@pytest.mark.asyncio
async def test_palace_runner_uses_gmsh_builder(sample_geometry):
    """Verify PalaceRunner invokes GmshBuilder and creates the mesh file before executing Docker."""
    runner = PalaceRunner(mock_mode=False)
    
    # Mock pre-flight checks to prevent actual Docker CLI access in unit test
    mock_proc_info = AsyncMock()
    mock_proc_info.communicate.return_value = (b"", b"")
    mock_proc_info.returncode = 0
    
    mock_proc_inspect = AsyncMock()
    mock_proc_inspect.communicate.return_value = (b"", b"")
    mock_proc_inspect.returncode = 0
    
    # Mock Docker run process itself (exit code 0, but mock writing expected output files)
    mock_proc_run = AsyncMock()
    mock_proc_run.communicate.return_value = (b"Palace Solver run completed.", b"")
    mock_proc_run.returncode = 0
    
    # Patch GmshBuilder.generate_mesh so we don't have to perform actual CPU-intensive meshing
    with patch("app.services.palace.gmsh_builder.GmshBuilder.generate_mesh") as mock_gmsh, \
         patch("asyncio.create_subprocess_exec", side_effect=[mock_proc_info, mock_proc_inspect, mock_proc_run]):
         
        # Mock writing of expected output files so PalaceRunner doesn't raise missing output file errors
        def mock_generate_mesh(geometry, output_path):
            # Write a dummy file to simulate GMSH output
            with open(output_path, "w", encoding="utf-8") as f:
                f.write("mocked mesh content")
                
        mock_gmsh.side_effect = mock_generate_mesh
        
        # Also patch output dir checks
        with patch("pathlib.Path.exists", return_value=True):
            # Invoke run_simulation
            res = await runner.run_simulation(
                config_data={"Problem": {"Type": "Eigenmode"}},
                geometry=sample_geometry
            )
            
            # Verify GmshBuilder was called
            mock_gmsh.assert_called_once()
            args, _ = mock_gmsh.call_args
            assert args[0].design_id == "test_qubit_chip"
            assert str(args[1]).endswith("mesh.msh")


def test_gmsh_builder_mutually_exclusive_and_no_duplicates(sample_geometry, tmp_path):
    """Verify that no entity tag is duplicated within a physical group,
    and that no 2D entity tag is shared between different boundary physical groups.
    """
    msh_path = tmp_path / "mesh.msh"
    GmshBuilder.generate_mesh(sample_geometry, msh_path)
    
    if not gmsh.isInitialized():
        gmsh.initialize()
    try:
        gmsh.open(str(msh_path))
        physical_groups = gmsh.model.getPhysicalGroups()
        
        all_tags_assigned = {}
        for dim, tag in physical_groups:
            name = gmsh.model.getPhysicalName(dim, tag)
            entities = list(gmsh.model.getEntitiesForPhysicalGroup(dim, tag))
            
            # 1. No duplicates within physical group
            assert len(entities) == len(set(entities)), f"Group {name} contains duplicate tags!"
            
            # 2. No overlapping boundary face assignments (dim=2)
            if dim == 2:
                for ent_tag in entities:
                    assert ent_tag not in all_tags_assigned, (
                        f"Boundary face tag {ent_tag} is assigned to both "
                        f"'{all_tags_assigned[ent_tag]}' and '{name}'!"
                    )
                    all_tags_assigned[ent_tag] = name
                    
        # 3. Palace-compatible boundary attributes
        pec_tags = [tag for dim, tag in physical_groups if dim == 2 and gmsh.model.getPhysicalName(dim, tag) == "pec"]
        assert len(pec_tags) == 1
        assert pec_tags[0] == 3
    finally:
        if gmsh.isInitialized():
            gmsh.finalize()
