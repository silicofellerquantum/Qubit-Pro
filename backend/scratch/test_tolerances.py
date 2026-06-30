import json
import re
from app.simulation.geometry.coordinate_transform import simplify_path

def _parse_svg_path_points(svg_str: str | None) -> list:
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
    return points

def main():
    design_file = "/home/drdo/Desktop/sim-spack/backend/tmp/simulations/simulation_eee3b58164f845e1b066300689be17a4/geometry/design.json"
    with open(design_file, "r") as f:
        payload = json.load(f)
    
    connections = payload.get("design", {}).get("connections", []) if "design" in payload else payload.get("connections", [])
    
    for conn in connections:
        cid = conn.get("id") or ""
        svg = conn.get("cachedSvg")
        points = _parse_svg_path_points(svg)
        if not points:
            continue
        print(f"Connection {cid}:")
        print(f"  Original points count: {len(points)}")
        for tol in [0.002, 0.005, 0.01, 0.02, 0.03, 0.05]:
            sim = simplify_path(points, tol)
            print(f"  Tolerance {tol} mm: {len(sim)} points")

if __name__ == "__main__":
    main()
