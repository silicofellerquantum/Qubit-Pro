import asyncio
import shutil
from pathlib import Path
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models import Simulation, Project
from app.services.vtu_renderer import generate_field_visualizations
from app.simulation.visualization.image_exporter import cache_clear

async def main():
    sim_id = "2ec36422-6cee-4f58-9d10-aafd48c36fa4"
    
    async for db in get_db():
        # Fetch simulation and join project
        stmt = (
            select(Simulation)
            .options(selectinload(Simulation.project))
            .where(Simulation.id == sim_id)
        )
        res = await db.execute(stmt)
        sim = res.scalar_one_or_none()
        if not sim:
            print(f"Simulation {sim_id} not found!")
            return
            
        project_root = Path(__file__).resolve().parents[2]
        artifact_dir = project_root / sim.artifact_path
        images_dir = artifact_dir / "images"
        
        print(f"Artifact directory: {artifact_dir}")
        print(f"Images directory: {images_dir}")
        
        # 1. Clean out the old images
        if images_dir.exists():
            print(f"Cleaning out old images in {images_dir}...")
            shutil.rmtree(images_dir)
        images_dir.mkdir(parents=True, exist_ok=True)
        
        # 2. Clear the backend's in-memory image cache
        removed_count = cache_clear()
        print(f"Cleared {removed_count} entries from the in-memory visualization cache.")
        
        # 3. Retrieve geometry
        geometry = None
        # Let's check if the project has geometry (e.g. design graph or compiled geometry)
        if sim.project and hasattr(sim.project, "geometry"):
            geometry = sim.project.geometry
            print("Found geometry in project.")
        else:
            print("No geometry found in project, will render without overlay if not available.")
            
        # 4. Re-generate all visualizations
        print("Re-generating field and mesh visualizations...")
        urls = generate_field_visualizations(
            simulation_id=sim.id,
            artifact_path=str(artifact_dir),
            geometry=geometry
        )
        print(f"Successfully generated {len(urls)} visualizations:")
        for url in urls:
            print(f"  {url}")
            
        # Check generated files on disk
        generated_files = list(images_dir.glob("*.png"))
        print(f"\nFiles now present in {images_dir}:")
        for f in generated_files:
            print(f"  {f.name} ({f.stat().st_size} bytes)")

if __name__ == "__main__":
    asyncio.run(main())
