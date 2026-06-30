import pyvista as pv
from pathlib import Path

def main():
    pvd_path = Path("/home/drdo/Desktop/sim-spack/backend/tmp/simulations/simulation_4bd3aaf8d6c44e21b83c3011032253ef/config/out/paraview/eigenmode/eigenmode.pvd")
    if not pvd_path.exists():
        print("Primary PVD not found!")
        return
        
    print("Loading primary dataset...")
    ds = pv.read(pvd_path)
    print("\n--- Primary Dataset Info ---")
    print(ds)
    print("Type:", type(ds))
    
    # Let's see if it has point_data or if it's a MultiBlock
    if isinstance(ds, pv.MultiBlock):
        print("It is a MultiBlock!")
        print("Number of blocks:", len(ds))
        # Inspect first block
        block = ds[0]
        print("Block 0 type:", type(block))
        if isinstance(block, pv.MultiBlock):
            print("Block 0 is also MultiBlock! N blocks:", len(block))
            for i, b in enumerate(block):
                print(f"  Sub-block {i} type:", type(b))
        else:
            print("Block 0 point data keys:", list(block.point_data.keys()))
    else:
        print("It is not a MultiBlock! Point data keys:", list(ds.point_data.keys()))

if __name__ == "__main__":
    main()
