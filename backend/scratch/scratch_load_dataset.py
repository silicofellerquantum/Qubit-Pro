from pathlib import Path
from app.simulation.visualization.vtu_loader import load_dataset, extract_field_info
import pyvista as pv

def main():
    pvd_path = Path("/home/drdo/Desktop/sim-spack/backend/tmp/simulations/simulation_4bd3aaf8d6c44e21b83c3011032253ef/config/out/paraview/eigenmode/eigenmode.pvd")
    
    print("Running load_dataset...")
    ds = load_dataset(pvd_path)
    print("Returned Type:", type(ds))
    print("Is MultiBlock?", isinstance(ds, pv.MultiBlock))
    
    # Let's run extract_field_info
    print("Running extract_field_info...")
    try:
        pf, cf = extract_field_info(ds)
        print("Success! Number of point fields:", len(pf))
    except Exception as e:
        print("Failed with error:", e)

if __name__ == "__main__":
    main()
