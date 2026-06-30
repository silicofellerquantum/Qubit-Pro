# Palace Runner Subsystem

The `runner` package is the execution engine of the Quantum Studio simulation backend. It is responsible for locating the Spack-installed Palace solver, validating workspace artifacts, spawning MPI-based process groups, capturing logs, tracking progress in real-time, and handling execution limits (timeouts and cancellations) safely.

---

## Architecture & Execution Lifecycle

The subsystem consists of several decoupled components working under the coordination of the `PalaceRunner` orchestrator:

```
                      +----------------------+
                      |     PalaceRunner     | (Orchestrator)
                      +----------+-----------+
                                 |
         +-------------+---------+---------+-------------+
         |             |                   |             |
  +------v------+ +----v-----+      +------v------+ +----v-----+
  |   Process   | |  Timeout |      |   Progress  | |   Log    |
  |   Manager   | |  Manager |      |   Tracker   | |  Manager |
  +-------------+ +----------+      +-------------+ +----------+
```

### Execution Steps:
1. **Validation**: Confirms that `config.json` and `mesh.msh` exist in the sandboxed workspace.
2. **Auto-Detection**: Dynamically locates the `palace` executable by checking user settings, the system `PATH`, and Spack installations (via `spack location -i palace`).
3. **Spawning**: Spawns Palace inside a new Linux process group (`start_new_session=True`).
4. **Stream Consumption**: Reads stdout/stderr asynchronously line-by-line using non-blocking stream readers to prevent OS buffer deadlocks.
5. **Monitoring**:
   * **Log Manager** flushes stdout/stderr to `logs/` immediately.
   * **Progress Tracker** scans stdout keywords to update completion stage and percentage.
   * **Timeout Manager** runs an async timer to trigger termination if limits are exceeded.
6. **Finalization**: Writes execution metrics to `runner_metadata.json` and updates the workspace status.

---

## Public API

### `PalaceRunner`

The primary class to interact with the execution engine.

#### `__init__(workspace_manager=None, palace_path=None, timeout_seconds=None)`
*   `workspace_manager`: An optional `WorkspaceManager` instance (defaults to creating a new one).
*   `palace_path`: Optional explicit path to the `palace` launcher binary.
*   `timeout_seconds`: Default timeout duration in seconds.

#### `async run_simulation(simulation_id, np=1, user_settings=None, on_progress=None)`
Runs the simulation inside the sandboxed workspace.
*   `simulation_id`: UUID string of the simulation.
*   `np`: Number of processors for MPI execution.
*   `user_settings`: Dictionary containing overrides (e.g. `launcher`, `launcher_args`, `timeout_seconds`).
*   `on_progress`: Optional callback function receiving `ProgressState` objects.
*   **Returns**: `RunnerMetadata` object.

#### `async cancel_simulation(simulation_id)`
Gracefully terminates a running simulation matching the ID.

---

## Process & Environment Safety

*   **No `shell=True`**: All subprocess commands are executed as safe argument lists to eliminate shell injection vulnerabilities.
*   **Group Signal Propagation**: Spawning in a new process group ensures that when a cancellation or timeout is triggered, the signal is sent to the group (`os.killpg`). This cleans up the OpenMPI launcher (`mpirun`) and all underlying solver workers, avoiding orphaned background jobs.
*   **Decoupled Design**: The runner has no direct dependencies on database models, router endpoints, or visualization packages, making it perfectly suited for future background queue workers (e.g., Celery, Redis Queue).
