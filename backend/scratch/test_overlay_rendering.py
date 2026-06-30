import pyvista as pv
from pathlib import Path
import numpy as np

def main():
    sim_dir = Path("/home/drdo/Desktop/sim-spack/backend/tmp/simulations/simulation_4bd3aaf8d6c44e21b83c3011032253ef")
    
    # 1. Define paths to parallel PVTU files
    vol_path = sim_dir / "config/out/paraview/eigenmode/Cycle000001/data.pvtu"
    boundary_path = sim_dir / "config/out/paraview/eigenmode_boundary/Cycle000001/data.pvtu"
    
    if not vol_path.exists() or not boundary_path.exists():
        print("Required PVTU files not found!")
        print("Vol path exists:", vol_path.exists())
        print("Boundary path exists:", boundary_path.exists())
        return
        
    print("Loading volume and boundary datasets...")
    vol_ds = pv.read(vol_path)
    boundary_ds = pv.read(boundary_path)
    
    print("\n--- Original Volume Dataset ---")
    print(vol_ds)
    print("Point Data Keys:", list(vol_ds.point_data.keys()))
    
    print("\n--- Original Boundary Dataset ---")
    print(boundary_ds)
    print("Point Data Keys:", list(boundary_ds.point_data.keys()))

    # 2. Clip volume to substrate
    print("\nClipping volume...")
    vol_clipped = vol_ds.clip(normal="z", origin=(0, 0, 0), invert=True)
    print("Clipped Volume Info:")
    print(vol_clipped)
    print("Clipped Point Data Keys:", list(vol_clipped.point_data.keys()))

    # Find case-insensitive field name
    field_to_find = "E_real"
    vol_keys = list(vol_clipped.point_data.keys())
    matched_key = None
    for k in vol_keys:
        if k.lower() == field_to_find.lower():
            matched_key = k
            break
            
    if not matched_key:
        print(f"Could not find field {field_to_find} in keys: {vol_keys}")
        return
        
    print(f"Using matched field key: {matched_key}")
    
    # 3. Setup field rendering
    vol_arr = np.asarray(vol_clipped.point_data[matched_key])
    vol_mag = np.linalg.norm(vol_arr, axis=1) if vol_arr.ndim > 1 else vol_arr
    vol_clipped.point_data["_render_mag"] = vol_mag
    
    boundary_arr = np.asarray(boundary_ds.point_data[matched_key])
    boundary_mag = np.linalg.norm(boundary_arr, axis=1) if boundary_arr.ndim > 1 else boundary_arr
    boundary_ds.point_data["_render_mag"] = boundary_mag
    
    clim = [float(vol_mag.min()), float(vol_mag.max())]
    
    # Plotter 1: Field Render
    plotter1 = pv.Plotter(off_screen=True, window_size=[1200, 900])
    plotter1.set_background("white")
    
    # Add substrate volume field
    plotter1.add_mesh(
        vol_clipped,
        scalars="_render_mag",
        cmap="coolwarm",
        clim=clim,
        opacity=0.8,
        show_edges=False,
    )
    
    # Add boundary field overlay with crisp outlines
    plotter1.add_mesh(
        boundary_ds,
        scalars="_render_mag",
        cmap="coolwarm",
        clim=clim,
        opacity=1.0,
        show_edges=True,
        edge_color="#1a1a2e",
        line_width=1.5,
    )
    
    plotter1.view_isometric()
    plotter1.screenshot("scratch/test_overlay_field.png")
    plotter1.close()
    print("Saved field render to scratch/test_overlay_field.png")
    
    # Plotter 2: Mesh Render
    plotter2 = pv.Plotter(off_screen=True, window_size=[1200, 900])
    plotter2.set_background("white")
    
    # Add substrate volume mesh
    plotter2.add_mesh(
        vol_clipped,
        color="#4a90d9",
        style="surface",
        show_edges=True,
        edge_color="#1a1a2e",
        line_width=0.4,
        opacity=0.8,
    )
    
    # Add boundary mesh overlay as golden metal layer
    plotter2.add_mesh(
        boundary_ds,
        color="#d4af37",
        style="surface",
        show_edges=True,
        edge_color="#1a1a2e",
        line_width=1.5,
        opacity=1.0,
    )
    
    plotter2.view_isometric()
    plotter2.screenshot("scratch/test_overlay_mesh.png")
    plotter2.close()
    print("Saved mesh render to scratch/test_overlay_mesh.png")

if __name__ == "__main__":
    main()
