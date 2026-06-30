import gmsh
import sys
import os

def main():
    geo_file = "/home/drdo/Desktop/sim-spack/backend/tmp/simulations/simulation_eee3b58164f845e1b066300689be17a4/geometry/geometry.geo"
    if not os.path.exists(geo_file):
        print(f"Error: geo file {geo_file} not found.")
        sys.exit(1)

    print("Initializing GMSH...")
    gmsh.initialize()
    
    # Enable terminal output for GMSH
    gmsh.option.setNumber("General.Terminal", 1)
    gmsh.option.setNumber("General.Verbosity", 99)
    gmsh.option.setNumber("Mesh.MshFileVersion", 2.2)

    gmsh.model.add("quantum_chip_mesh")
    
    print(f"Opening geo file {geo_file}...")
    gmsh.open(geo_file)
    
    surfaces = [tag for dim, tag in gmsh.model.getEntities(dim=2)]
    print(f"Total 2D surfaces loaded: {len(surfaces)}")

    # Replicate 3D volumes creation
    # Substrate (height=0.5mm), Air Box (height=1.0mm) for W=16.80, H=21.43
    W = 16.80
    H = 21.429999999999996
    
    # Ground plane tag is first surface
    ground_tag = surfaces[0]
    
    print("Creating 3D volumes...")
    sub_vol = gmsh.model.occ.addBox(-W/2, -H/2, -0.5, W, H, 0.5)
    air_vol = gmsh.model.occ.addBox(-W/2, -H/2, 0.0, W, H, 1.0)
    
    # 2D component surfaces: all surfaces except the first (ground plane)
    comp_surfs = [(2, s) for s in surfaces[1:]]
    
    # Conformal OCC Fragment
    print("Executing OCC boolean fragment...")
    vols = [(3, sub_vol), (3, air_vol)]
    inputs = vols + comp_surfs + [(2, ground_tag)]
    
    out_entities, out_map = gmsh.model.occ.fragment(vols, comp_surfs + [(2, ground_tag)])
    print("OCC fragment done. Synchronizing OCC to CAD...")
    gmsh.model.occ.synchronize()
    
    # Set sizing fields
    print("Configuring local refinement sizing fields...")
    # Map component tags and create threshold field
    # Coarse settings
    mesh_size = 0.30
    min_element_size = 0.05
    max_element_size = 1.20
    
    gmsh.option.setNumber("Mesh.CharacteristicLengthMin", min_element_size)
    gmsh.option.setNumber("Mesh.CharacteristicLengthMax", max_element_size)
    gmsh.option.setNumber("Mesh.MeshSizeFromCurvature", 0)
    
    # Run 3D mesh generation
    print("Generating 3D mesh...")
    gmsh.model.mesh.generate(3)
    
    print("Optimizing mesh quality...")
    gmsh.model.mesh.optimize("Netgen")
    
    print("Mesh generation completed successfully!")
    gmsh.finalize()

if __name__ == "__main__":
    main()
