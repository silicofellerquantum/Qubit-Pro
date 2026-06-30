import asyncio
from app.database import AsyncSessionLocal
from sqlalchemy import text
import json

async def main():
    async with AsyncSessionLocal() as session:
        for sim_id in ["100ca5b9-ecde-4e9e-b89c-87b3eaf35dc2", "eee3b581-64f8-45e1-b066-300689be17a4"]:
            res = await session.execute(text("SELECT id, project_id, solver, status, error_message, config FROM simulations WHERE id = :id"), {"id": sim_id})
            row = res.fetchone()
            if row:
                print(f"ID: {row[0]}")
                print(f"Status: {row[3]}")
                print(f"Error: {row[4]}")
                
                # Check parameters
                res_params = await session.execute(text("SELECT parameter_key, parameter_value FROM simulation_parameters WHERE simulation_id = :id"), {"id": sim_id})
                for pkey, pval in res_params.fetchall():
                    if pkey == "design_payload":
                        payload = pval
                        if isinstance(payload, str):
                            payload = json.loads(payload)
                        placements = payload.get("design", {}).get("placements", []) if "design" in payload else payload.get("placements", [])
                        connections = payload.get("design", {}).get("connections", []) if "design" in payload else payload.get("connections", [])
                        print(f"  Placements count: {len(placements)}")
                        print(f"  Connections count: {len(connections)}")
                        # Print placement names
                        p_names = [p.get("name") for p in placements]
                        print(f"  Placements: {p_names}")
            else:
                print(f"ID: {sim_id} not found")
            print("-" * 50)

if __name__ == "__main__":
    asyncio.run(main())
