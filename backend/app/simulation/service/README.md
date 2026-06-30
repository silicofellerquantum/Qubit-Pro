# Simulation Orchestrator Subsystem

The `service` package acts as the central brain of the simulation backend. It coordinates and sequences the lifecycle of all simulation operations—from receiving a design payload to running GMSH, executing MPI Palace solvers, and parsing output CSV files.

---

## Pipeline Workflow

The orchestrator executes the simulation phases in a strict, sequential pipeline:

```
Validate Request & Spawn Asynchronous Task
↓
Phase 1: Create Workspace (WorkspaceManager)
↓
Phase 2: Build Geometry (GeometryBuilder)
↓
Phase 3: Generate Mesh (MeshGenerator)
↓
Phase 4: Generate Configuration (PalaceConfigGenerator)
↓
Phase 5: Execute Solver (PalaceRunner)
↓
Phase 6: Parse Outputs (ResultParser)
↓
Compile Timings & Execution Summary
↓
Apply Rollback Cleanup Policy
↓
Return Structured Results & Summary
```

---

## State Transition Matrix

The `StateManager` enforces a strict transition sequence. Any attempt to skip states or perform out-of-order transitions raises a validation error.

*   `REQUEST_RECEIVED` (Start state)
*   `REQUEST_RECEIVED` $\rightarrow$ `WORKSPACE_READY`
*   `WORKSPACE_READY` $\rightarrow$ `GEOMETRY_READY`
*   `GEOMETRY_READY` $\rightarrow$ `MESH_READY`
*   `MESH_READY` $\rightarrow$ `CONFIG_READY`
*   `CONFIG_READY` $\rightarrow$ `RUNNING`
*   `RUNNING` $\rightarrow$ `RESULTS_READY`
*   `RESULTS_READY` $\rightarrow$ `COMPLETED` (Terminal success)

If any phase fails or is cancelled, the pipeline transitions immediately to the terminal state `FAILED` or `CANCELLED` from its current state, triggers rollback cleanup, and aborts further phases.

---

## Rollback & Cleanup Policies

The orchestrator supports three configurable rollback policies defined in the `RollbackPolicy` enum:

1.  **`DELETE_ALL`**: Always deletes the workspace sandbox upon pipeline completion (regardless of success or failure). Useful for dry-runs or ephemeral nodes.
2.  **`KEEP_ALL`**: Always preserves the workspace directory. Ideal for local execution or developer inspections.
3.  **`DELETE_ON_SUCCESS`**: (Recommended default) Deletes the workspace on success to save storage space, but preserves it on failure so developers can inspect the logs, geometry BREP, GMSH mesh, and config files for debugging.

---

## Asynchronous Cancellation

The `SimulationService` is fully asynchronous and supports real-time task cancellation:
*   When a job is started, the service registers its running `asyncio.Task`.
*   If `cancel_simulation(simulation_id)` is called, the service invokes `task.cancel()`.
*   The running task intercepts `asyncio.CancelledError`, transitions the state to `CANCELLED`, delegates graceful termination of the process tree (including MPI processes) to the `PalaceRunner`, runs the rollback policy, and exits cleanly.

---

## API Usage Example

```python
import asyncio
from app.simulation.service import SimulationService, SimulationRequest, RollbackPolicy

async def main():
    service = SimulationService()

    # Define a simulation request
    request = SimulationRequest(
        simulation_id="sim-uuid-12345",
        solver_type="electrostatic",
        design_payload={
            "v2": {
                "graph": {
                    "chip_name": "Two_Qubit_Processor",
                    "chip_width_mm": 10.0,
                    "chip_height_mm": 10.0,
                    "qubits": [
                        {"id": "Q1", "frequency_ghz": 5.2},
                        {"id": "Q2", "frequency_ghz": 5.0}
                    ]
                }
            }
        },
        user_settings={"np": 4, "timeout_seconds": 600.0},
        terminal_names=["island_1", "island_2"],
        rollback_policy=RollbackPolicy.DELETE_ON_SUCCESS
    )

    # Execute simulation asynchronously
    try:
        response = await service.execute_simulation(request)
        print("Status:", response.summary.status)
        print("Total Runtime (seconds):", response.summary.total_runtime_seconds)
        print("Phase timings:", response.summary.phase_timings)
        print("Parsed Capacitance Matrix:", response.results["electrostatic"]["matrix"])
    except Exception as e:
        print("Simulation failed:", e)

if __name__ == "__main__":
    asyncio.run(main())
```
