import pyvista as pv
from pathlib import Path

def main():
    pvd_path = Path("/home/drdo/Desktop/sim-spack/backend/tmp/simulations/simulation_4bd3aaf8d6c44e21b83c3011032253ef/config/out/paraview/eigenmode_boundary/eigenmode_boundary.pvd")
    if not pvd_path.exists():
        print("Boundary PVD not found!")
        return
        
    print("Loading boundary dataset...")
    ds = pv.read(pvd_path)
    print("\n--- Boundary Dataset Info ---")
    print(ds)
    print("\nPoint Data Keys:", list(ds.point_data.keys()))
    print("Cell Data Keys:", list(ds.cell_data.keys()))
    print("Bounds:", ds.bounds)

if __name__ == "__main__":
    main()
