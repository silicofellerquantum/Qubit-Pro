import asyncio
import json
from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models import Simulation
from app.simulation.database.models import SimulationResult

async def main():
    async with AsyncSessionLocal() as db:
        stmt = select(Simulation).where(Simulation.status == "completed").order_by(Simulation.created_at.desc())
        res = await db.execute(stmt)
        sims = res.scalars().all()
        
        output_lines = []
        output_lines.append("# AWS Palace Simulation Outputs\n")
        output_lines.append(f"Total completed simulations: {len(sims)}\n")
        
        for idx, s in enumerate(sims, 1):
            output_lines.append(f"## {idx}. Simulation ID: `{s.id}`")
            output_lines.append(f"- **Solver:** {s.solver}")
            output_lines.append(f"- **Created At:** {s.created_at}")
            
            # Fetch results
            results_data = s.results
            
            stmt_res = select(SimulationResult).where(SimulationResult.simulation_id == s.id)
            res_db = await db.execute(stmt_res)
            sim_res = res_db.scalars().all()
            
            parsed_res_data = None
            if sim_res:
                for r in sim_res:
                    if r.parsed_results and len(r.parsed_results) > 0:
                        parsed_res_data = r.parsed_results
                        break
            
            final_results = parsed_res_data or results_data
            
            output_lines.append("- **Outputs:**")
            if final_results:
                formatted_json = json.dumps(final_results, indent=2)
                output_lines.append(f"```json\n{formatted_json}\n```")
            else:
                output_lines.append("`No output results found in database.`")
            output_lines.append("\n" + "-"*40 + "\n")
            
        artifact_path = "/home/drdo/.gemini/antigravity/brain/1556e827-a63f-4ac2-aefb-466c3e1dfa70/artifacts/palace_simulation_outputs.md"
        with open(artifact_path, "w") as f:
            f.write("\n".join(output_lines))
        
        print(f"Successfully wrote {len(sims)} simulation outputs to {artifact_path}")

if __name__ == "__main__":
    asyncio.run(main())
