import json
import re
import math
import time
from pathlib import Path
import gmsh
from app.simulation.geometry.coordinate_transform import simplify_path

def _parse_svg_path_points(svg_str: str | None, tol: float) -> list:
    if not svg_str:
        return []
    match = re.search(r'points=["\']([^"\']+)["\']', svg_str)
    if not match:
        return []
    points_str = match.group(1)
    tokens = points_str.strip().split()
    points = []
    for token in tokens:
        parts = token.split(',')
        if len(parts) == 2:
            x = float(parts[0]) / 1000.0
            y = float(parts[1]) / 1000.0
            points.append((x, y))
    if len(points) >= 2:
        return simplify_path(points, tol)
    return []

def main():
    design_file = "/home/drdo/Desktop/sim-spack/backend/tmp/simulations/simulation_eee3b58164f845e1b066300689be17a4/geometry/design.json"
    with open(design_file, "r") as f:
        payload = json.load(f)
    
    # We will generate a new .geo file using tolerance 0.01 mm
    tol = 0.01
    
    # Reconstruct geo commands
    W = 16.8
    H = 21.43
    
    lines = [
        "// GMSH Geometry Script generated with tolerance 0.03",
        'SetFactory("OpenCASCADE");',
        f"W = {W};",
        f"H = {H};",
        "ground = newreg;",
        "Rectangle(ground) = {-W/2, -H/2, 0, W, H};",
    ]
    
    # We need to list components to match design.json
    # We can read them or just build them from the JSON.
    # To keep it simple, we can load the original geometry.geo file but replace the resonator paths!
    # Let's read geometry.geo and rebuild it.
    # Actually, let's write a simple geo script from scratch for our test.
    # Let's map placements and connections.
    design = payload.get("design", {}) if "design" in payload else payload
    placements = design.get("placements", [])
    connections = design.get("connections", [])
    
    for idx, p in enumerate(placements):
        name = p.get("name")
        suffix = f"_{idx}"
        # Since we just want to test if GMSH runs, we can write the qubits/launchpads
        if name.startswith("Q"):
            lines.extend([
                f"pocket{suffix} = newreg; Rectangle(pocket{suffix}) = {{{-0.325}, {-0.325}, 0, 0.65, 0.65}};",
                f"pad1{suffix} = newreg; Rectangle(pad1{suffix}) = {{{-0.2275}, {0.015}, 0, 0.455, 0.09}};",
                f"pad2{suffix} = newreg; Rectangle(pad2{suffix}) = {{{-0.2275}, {-0.105 - 0.09}, 0, 0.455, 0.09}};",
                f"junc{suffix} = newreg; Rectangle(junc{suffix}) = {{{-0.02}, {-0.015}, 0, 0.04, 0.03}};",
                f"Rotate {{{{0, 0, 1}}, {{0, 0, 0}}, {math.radians(p.get('rotation', 0.0))}}} {{ Surface{{pocket{suffix}, pad1{suffix}, pad2{suffix}, junc{suffix}}}; }}",
                f"Translate {{{p.get('x', 0.0)}, {p.get('y', 0.0)}, 0}} {{ Surface{{pocket{suffix}, pad1{suffix}, pad2{suffix}, junc{suffix}}}; }}",
            ])
        elif name.startswith("T"):
            lines.extend([
                f"pad{suffix} = newreg; Rectangle(pad{suffix}) = {{{-0.15}, {-0.165}, 0, 0.3, 0.33}};",
                f"Rotate {{{{0, 0, 1}}, {{0, 0, 0}}, {math.radians(p.get('rotation', 0.0))}}} {{ Surface{{pad{suffix}}}; }}",
                f"Translate {{{p.get('x', 0.0)}, {p.get('y', 0.0)}, 0}} {{ Surface{{pad{suffix}}}; }}",
            ])
            
    # Add connections
    for c_idx, conn in enumerate(connections):
        cid = conn.get("id") or ""
        suffix = f"_{len(placements) + c_idx}"
        path_points = _parse_svg_path_points(conn.get("cachedSvg"), tol)
        w = 0.01
        g = 0.005
        
        if path_points and len(path_points) >= 2:
            lines.append(f"// Meandered path for line {cid}")
            trace_segs = []
            gap_segs = []
            for s_idx in range(len(path_points) - 1):
                p1 = path_points[s_idx]
                p2 = path_points[s_idx + 1]
                dx = p2[0] - p1[0]
                dy = p2[1] - p1[1]
                dist = math.sqrt(dx**2 + dy**2)
                if dist < 1e-6:
                    continue
                mx = (p1[0] + p2[0]) / 2.0
                my = (p1[1] + p2[1]) / 2.0
                angle = math.atan2(dy, dx)
                
                seg_suffix = f"{suffix}_{s_idx}"
                trace_var = f"trace{seg_suffix}"
                gap_var = f"gap{seg_suffix}"
                trace_segs.append(trace_var)
                gap_segs.append(gap_var)
                
                lines.extend([
                    f"{trace_var} = newreg; Rectangle({trace_var}) = {{{-dist/2}, {-w/2}, 0, {dist}, {w}}};",
                    f"{gap_var} = newreg; Rectangle({gap_var}) = {{{-dist/2}, {-(w/2 + g)}, 0, {dist}, {w + 2*g}}};",
                    f"Rotate {{{{0, 0, 1}}, {{0, 0, 0}}, {angle}}} {{ Surface{{{trace_var}, {gap_var}}}; }}",
                    f"Translate {{{mx}, {my}, 0}} {{ Surface{{{trace_var}, {gap_var}}}; }}",
                ])
            if len(trace_segs) >= 2:
                lines.extend([
                    f"trace{suffix}[] = BooleanUnion{{ Surface{{{trace_segs[0]}}}; Delete; }}{{ Surface{{{', '.join(trace_segs[1:])}}}; Delete; }};",
                    f"gap{suffix}[] = BooleanUnion{{ Surface{{{gap_segs[0]}}}; Delete; }}{{ Surface{{{', '.join(gap_segs[1:])}}}; Delete; }};",
                ])
            elif len(trace_segs) == 1:
                lines.extend([
                    f"trace{suffix} = {trace_segs[0]};",
                    f"gap{suffix} = {gap_segs[0]};",
                ])

    geo_file = "/home/drdo/Desktop/sim-spack/backend/scratch/debug_simplified.geo"
    with open(geo_file, "w") as f:
        f.write("\n".join(lines))
    print(f"Written new .geo file: {geo_file}")

    print("Initializing GMSH...")
    gmsh.initialize()
    gmsh.option.setNumber("General.Terminal", 1)
    gmsh.option.setNumber("General.Verbosity", 3)
    gmsh.option.setNumber("Mesh.MshFileVersion", 2.2)
    gmsh.model.add("quantum_chip_mesh")
    
    print("Opening geo file...")
    gmsh.open(geo_file)
    
    surfaces = [tag for dim, tag in gmsh.model.getEntities(dim=2)]
    print(f"Total 2D surfaces loaded: {len(surfaces)}")
    
    # Replicate 3D volumes
    ground_tag = surfaces[0]
    sub_vol = gmsh.model.occ.addBox(-W/2, -H/2, -0.5, W, H, 0.5)
    air_vol = gmsh.model.occ.addBox(-W/2, -H/2, 0.0, W, H, 1.0)
    
    comp_surfs = [(2, s) for s in surfaces[1:]]
    vols = [(3, sub_vol), (3, air_vol)]
    
    print("Executing OCC boolean fragment...")
    t0 = time.time()
    out_entities, out_map = gmsh.model.occ.fragment(vols, comp_surfs + [(2, ground_tag)])
    gmsh.model.occ.synchronize()
    print(f"OCC fragment completed in {time.time() - t0:.2f} seconds.")
    
    # Mesh settings (coarse)
    gmsh.option.setNumber("Mesh.CharacteristicLengthMin", 0.05)
    gmsh.option.setNumber("Mesh.CharacteristicLengthMax", 1.20)
    
    print("Generating 3D mesh...")
    t0 = time.time()
    gmsh.model.mesh.generate(3)
    print(f"3D Mesh generated in {time.time() - t0:.2f} seconds.")
    
    print("Optimizing mesh quality...")
    t0 = time.time()
    gmsh.model.mesh.optimize("Netgen")
    print(f"Netgen optimized in {time.time() - t0:.2f} seconds.")
    
    print("Finished successfully!")
    gmsh.finalize()

if __name__ == "__main__":
    main()
