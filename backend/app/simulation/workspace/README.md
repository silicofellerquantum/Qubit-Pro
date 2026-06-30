# Simulation Workspace Management

This package implements the **Workspace Management subsystem** for the Quantum Studio simulation backend, providing sandboxed execution environments, metadata state machines, atomic file writes, path-traversal security, and automated retention cleanup policies.

---

## Folder Layout

Each active simulation is allocated an isolated directory structure under `backend/tmp/simulations/` containing the following layout:

```
simulation_<uuid>/
├── config/                  # Generated Palace configuration JSON
├── geometry/                # CAD step or geometry files
├── mesh/                    # 3D discretized mesh files (GMSH)
├── output/                  # Raw Palace solver CSV and volumetric output files
├── visualization/           # Slices, renders, and 3D field preview images
├── logs/                    # Standard error and pipeline log traces
├── metadata/                # Extra metadata tracking files (if any)
├── temp/                    # Solver intermediate scratch files
└── workspace.json           # Atomic, schema-validated metadata state file
```

---

## Public API Reference

The primary interface is the `WorkspaceManager` class, which exposes the following methods:

| Method | Return Type | Description |
| :--- | :--- | :--- |
| `create_workspace(sim_id, owner_id, retention_days)` | `WorkspaceMetadata` | Securely allocates subdirectories and writes initial metadata. Thread/Process safe. |
| `get_workspace(sim_id)` | `WorkspaceMetadata` | Retrieves the validated metadata of an existing workspace. |
| `update_workspace_status(sim_id, status, error)` | `WorkspaceMetadata` | Transitions the workspace state (e.g. READY to IN_USE) and touches `updated_at`. |
| `validate_workspace(sim_id)` | `bool` | Performs structural, schema, and permission validation on a workspace. |
| `cleanup_workspace(sim_id, partial)` | `None` | Performs complete deletion or partial cleanup (purging heavy mesh/geo folders). |
| `delete_workspace(sim_id)` | `None` | Securely deletes the entire workspace directory from disk. |
| `archive_workspace(sim_id)` | `Path` | Compresses the workspace (excluding heavy raw files), saves to outputs, and deletes workspace on disk. |
| `list_workspaces()` | `List[WorkspaceMetadata]`| Returns metadata for all active simulation workspaces on disk. |

### Expired Cleanup Utility
Exposed in `cleanup.py`:
* `cleanup_expired_workspaces(manager, force)`: Scans all workspaces, identifies expired runs, and executes either archiving or deletion. Safely skips runs that are currently marked `IN_USE`.

---

## Workspace Lifecycle States

The workspace lifecycle is tracked via the `WorkspaceState` enum:

1. **`CREATED`**: Directory allocated and metadata instantiated.
2. **`READY`**: Subdirectories created; workspace validated and ready for geometry generation.
3. **`IN_USE`**: Palace solver is actively running (protected from automated sweeps).
4. **`COMPLETED`**: Palace solver exited successfully; results parsed and stored.
5. **`FAILED`**: Run crashed or timed out; error details captured in logs.
6. **`CLEANED`**: Heavy mesh/geometry folders purged to reclaim disk space.
7. **`ARCHIVED`**: Ephemeral workspace deleted; results and logs archived to a zip file in `outputs/simulations/`.

---

## Security & Reliability Features

1. **Path Traversal Protection**:
   All directories and files are normalized using `resolve()`. Every read, write, or delete operation verifies that the target path is strictly nested under the allowed root directory, blocking symbolic link attacks and directory escape vectors (`..`).
2. **Atomic Metadata Writes**:
   Metadata updates are written to a temporary file in the same directory first, and then renamed atomically using `os.replace`. This guarantees that `workspace.json` is never corrupted or left half-written in the event of a system crash.
3. **Strict UNIX Permissions**:
   All folders are created with octal mode `0700` (restricted to the owner process) and metadata files with `0600` to prevent unauthorized access in multi-tenant environments.
4. **Concurrently Safe Allocation**:
   By executing directory creation atomically (`Path.mkdir(exist_ok=False)`), the manager prevents race conditions when multiple worker processes attempt to initialize workspaces simultaneously.

---

## Example Usage

```python
from app.simulation.workspace import WorkspaceManager, WorkspaceState, cleanup_expired_workspaces

# 1. Initialize the manager (loads paths from settings)
manager = WorkspaceManager()

# 2. Create a new workspace for a simulation job
sim_id = "8a3d2c8f-2b1a-4c9e-8d7c-6b5a4f3e2d1c"
metadata = manager.create_workspace(
    simulation_id=sim_id,
    owner_id="user_9281",
    retention_days=3
)
print(f"Created: {metadata.workspace_id} at {metadata.root_path}")
print(f"Status: {metadata.status}") # WorkspaceState.READY

# 3. Transition status when launching Palace solver
manager.update_workspace_status(sim_id, WorkspaceState.IN_USE)

# ... Run Palace EM Solver ...

# 4. Mark as completed
manager.update_workspace_status(sim_id, WorkspaceState.COMPLETED)

# 5. Archive results (zips logs/outputs, deletes workspace on disk)
archive_zip_path = manager.archive_workspace(sim_id)
print(f"Archived to: {archive_zip_path}")

# 6. Run background cleanup sweep of expired workspaces
cleaned_count = cleanup_expired_workspaces(manager)
print(f"Cleaned up {cleaned_count} expired runs.")
```
