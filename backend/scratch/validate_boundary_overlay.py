import sys
import os
from pathlib import Path

# Add backend directory to sys.path
sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.simulation.visualization.visualizer import VisualizationService
from app.simulation.visualization.visualization_models import RenderRequest, MeshDisplayMode
from app.simulation.visualization.vtu_loader import find_vtu_files, get_boundary_vtu_path

def main():
    sim_id = "5d2e35546c934e88b0e94ba77cde22b0"
    sim_dir = Path("/home/drdo/Desktop/sim-spack/backend/tmp/simulations/simulation_5d2e35546c934e88b0e94ba77cde22b0")
    
    print(f"Initializing VisualizationService for simulation {sim_id}...")
    svc = VisualizationService(artifact_dir=sim_dir, sim_id=sim_id)
    
    print("Testing VTU file scanning...")
    vtu_files = find_vtu_files(sim_dir)
    print(f"Found {len(vtu_files)} VTU files:")
    for f in vtu_files[:5]:
        print(f"  - {f.relative_to(sim_dir)}")
    
    # Verify that boundary files are present in the list
    boundary_files = [f for f in vtu_files if "boundary" in str(f).lower()]
    print(f"Found {len(boundary_files)} boundary files in the scanned list.")
    if not boundary_files:
        print("ERROR: No boundary files were found! Scanned list did not include boundaries.")
        sys.exit(1)
        
    # Verify get_boundary_vtu_path resolves correctly
    primary = vtu_files[0]
    boundary = get_boundary_vtu_path(primary)
    print(f"Primary: {primary.relative_to(sim_dir)}")
    if boundary:
        print(f"Resolved Boundary: {boundary.relative_to(sim_dir)}")
    else:
        print("ERROR: Could not resolve boundary file for primary VTU.")
        sys.exit(1)
        
    # Test Render Mesh with Boundaries
    print("\nRendering mesh with boundaries...")
    req_mesh = RenderRequest(show_boundaries=True, width=800, height=600)
    res_mesh = svc.render_mesh(req_mesh, display_mode=MeshDisplayMode.SURFACE_EDGES)
    print(f"Mesh rendered successfully: {res_mesh.image_url} (render time: {res_mesh.render_time_ms:.1f}ms)")
    
    # Test Render Field with Boundaries
    print("\nRendering field with boundaries...")
    req_field = RenderRequest(show_boundaries=True, width=800, height=600)
    res_field = svc.render_field(req_field)
    print(f"Field rendered successfully: {res_field.image_url} (render time: {res_field.render_time_ms:.1f}ms)")
    
    # Verify the images exist on disk
    mesh_img = sim_dir / "images" / Path(res_mesh.image_url).name
    field_img = sim_dir / "images" / Path(res_field.image_url).name
    
    print("\nVerifying output images on disk...")
    if mesh_img.exists():
        print(f"SUCCESS: Mesh image exists at {mesh_img}")
    else:
        print(f"ERROR: Mesh image does not exist at {mesh_img}")
        sys.exit(1)
        
    if field_img.exists():
        print(f"SUCCESS: Field image exists at {field_img}")
    else:
        print(f"ERROR: Field image does not exist at {field_img}")
        sys.exit(1)
        
    print("\nAll boundary overlay visualization verification steps PASSED successfully!")

if __name__ == "__main__":
    main()
