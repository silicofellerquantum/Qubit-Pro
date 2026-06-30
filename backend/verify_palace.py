import asyncio
import sys
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.services.palace.geometry_builder import GeometryBuilder
from app.services.palace.config_generator import ConfigGenerator
from app.services.palace.palace_runner import PalaceRunner
from app.services.palace.models import PalaceSolverType
from app.core.design_graph import DesignGraph, QubitNode, graph_to_dict

async def main():
    print("\n=== STARTING PALACE END-TO-END DOCKER INTEGRATION TEST ===\n")
    
    print("[1/5] Building design geometry...")
    # Create sample payload with 10.0 x 10.0 mm chip size
    g = DesignGraph(
        chip_name="test_qubit_chip",
        chip_width_mm=10.0,
        chip_height_mm=10.0,
        substrate="silicon",
        metal="aluminum",
    )
    
    q1 = QubitNode(id="Q1", frequency_ghz=5.0)
    q1.x_mm = 1.0
    q1.y_mm = 1.0
    q1.orientation_deg = 0
    g.add_node(q1)

    q2 = QubitNode(id="Q2", frequency_ghz=5.4)
    q2.x_mm = 3.0
    q2.y_mm = 1.0
    q2.orientation_deg = 90
    g.add_node(q2)

    payload = {
        "project_name": "Test Palace Processor",
        "id": "design_test_v2",
        "v2": {
            "graph": graph_to_dict(g)
        }
    }
    
    geometry = GeometryBuilder.build_geometry(payload)
    print(f"  -> Geometry built! Substrate: {geometry.substrate}, metal: {geometry.metal}")
    
    print("[2/5] Generating Palace configuration...")
    config_data = ConfigGenerator.generate_config(geometry, PalaceSolverType.EIGENMODE)
    print(f"  -> Config generated! Solver type: {config_data['Problem']['Type']}")
    
    print("[3/5] Initializing PalaceRunner in real mode (mock_mode=False)...")
    runner = PalaceRunner(mock_mode=False)
    
    print("[4/5] Executing simulation (this runs GMSH mesh generation and Palace via Docker)...")
    try:
        result = await runner.run_simulation(
            config_data=config_data,
            geometry=geometry,
            serial=True  # Use serial mode for a fast, lightweight verification
        )
        
        print("\n[5/5] Simulation finished successfully!")
        print(f"  -> Output directory: {result['output_dir']}")
        print(f"  -> Runtime: {result['runtime_seconds']:.2f} seconds")
        
        # List output files
        out_path = Path(result['output_dir'])
        print("  -> Output files found:")
        for p in out_path.iterdir():
            print(f"     - {p.name}")
            
        print("\nParsing simulation results...")
        from app.services.palace.result_parser import ResultParser
        raw_results = ResultParser.parse_results(out_path, PalaceSolverType.EIGENMODE)
        print("  -> Raw parsed results keys:", list(raw_results.keys()))
        
        # Clean up
        print("\nCleaning up temporary workspace...")
        result['temp_dir_obj'].cleanup()
        print("  -> Temporary directory cleaned up.")
        
        print("\n=== SUCCESS: PALACE END-TO-END WORKFLOW VERIFIED SUCCESSFULLY ===")
        
    except Exception as e:
        print(f"\n[ERROR] Simulation execution failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
