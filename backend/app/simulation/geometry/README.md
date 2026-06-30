# Simulation Geometry Builder

This package implements the **Geometry Builder subsystem** for the Quantum Studio simulation backend. It translates parameterized high-level quantum chip layouts into physical, boundary-assigned geometric CAD representations and GMSH OCC script models.

---

## Architecture and Flow

The geometry builder integrates directly with the **Workspace Manager** to write isolated geometry files for a simulation run:

```
Simulation Request
       │
       ▼
 ┌───────────┐
 │ Workspace │ (Allocates simulation_<uuid>/)
 └─────┬─────┘
       │ WorkspaceMetadata
       ▼
 ┌───────────┐      ┌───────────────────┐
 │ Geometry  ├─────►│ Component Factory │ (Instantiates parts & local ports)
 │ Builder   │      └───────────────────┘
 └─────┬─────┘      ┌───────────────────┐
       ├───────────►│ GeometryValidator│ (Checks overlaps, bounds & disconnects)
       │            └───────────────────┘
       ▼
 ┌───────────┐
 │ Geometry  │ (Writes design.json, geometry.geo, geometry.step,
 │ Exporter  │  and geometry_metadata.json to geometry/ folder)
 └───────────┘
```

---

## Directory Layout & Exports

Inside the sandboxed simulation workspace (`simulation_<uuid>/geometry/`), the exporter generates the following files:

1. **`design.json`**: A complete, archived replica of the incoming design layout payload for reproducibility.
2. **`geometry_metadata.json`**: A schema-validated JSON containing the total component count, chip bounding box, active fabrication layers, registered materials, and a list of all logical ports.
3. **`geometry.geo`**: An executable GMSH OpenCASCADE script. It contains the exact geometric boundary coordinate rectangles, rotations, translations, and tool cutouts. Researchers can open this file directly in the GMSH GUI to visually inspect the chip layout.
4. **`geometry.step`**: A high-fidelity 3D CAD `STEP` file containing the solid volumes of the substrate and the air box. It is generated dynamically via GMSH's OCC kernel without running any meshing, providing a clean CAD output.

---

## Coordinate Transformations

The package uses a consistent Cartesian millimeter coordinate system. 
Local-to-global translations and rotations are handled by the `coordinate_transform` module:
* **Point Rotation**: Rotates a 2D point around an arbitrary pivot point:
  $$\begin{aligned}
  x' &= (x - o_x) \cos(\theta) - (y - o_y) \sin(\theta) + o_x \\
  y' &= (x - o_x) \sin(\theta) + (y - o_y) \cos(\theta) + o_y
  \end{aligned}$$
* **Bounding Box Rotation**: Transforms the local axis-aligned bounding box of a component by rotating all four corners into global coordinates and finding the min/max coordinates of the resulting polygon, ensuring that overlap checks are highly accurate and robust.

---

## Layout Validation Engine

The `GeometryValidator` executes a multi-tiered validation suite before any files are exported:

1. **Duplicate Identifiers**: Enforces that no two components share the same ID.
2. **Die Boundaries**: Verifies that every component's global bounding box lies strictly within the boundaries of the physical chip die (e.g., $10\text{ mm} \times 10\text{ mm}$ limit).
3. **Physical Collisions**: Iterates through components and flags overlaps (e.g., two qubits or two meander lines overlapping on the same coordinate). It safely allows intersections at boundaries between different types (like resonators connecting to qubit pockets) but raises errors for duplicate placements.
4. **Schematic Connectivity**: Verifies that logical connections defined in the design graph are valid. For example, if a coupler references `qubit_a_id` and `qubit_b_id`, the validator checks that both qubits exist in the layout, catching disconnected designs early.

---

## Developer Guide: Adding Components

Adding a new quantum component is highly straightforward. Follow these steps:

1. **Register the Kind**: Add the component identifier string to the `GeometryComponentKind` Enum in `geometry_models.py`.
2. **Implement in Factory**: Open `component_factory.py` and implement the drawing parameters, local bounding box, and ports inside `ComponentFactory.create_component()`.
   * *Example*: For a new Squid loop component, define its width/height, set a local bounding box `(-w/2, -h/2, w/2, h/2)`, and register a local excitation port in the center.
3. **Add Exporter Support**: In `geometry_exporter.py` under `_write_geo_script()`, add the GMSH script generator block to write the matching OCC commands (e.g. `Rectangle` or `Box`).

---

## Example Usage

```python
from app.simulation.workspace import WorkspaceManager
from app.simulation.geometry import GeometryBuilder

# 1. Initialize Workspace and Geometry services
ws_manager = WorkspaceManager()
geo_builder = GeometryBuilder(workspace_manager=ws_manager)

# 2. Allocate a simulation workspace
sim_id = "f81d4fae-7dec-11d0-a765-085234fba04f"
ws_manager.create_workspace(simulation_id=sim_id)

# 3. Build geometry from a design payload
design_payload = {
    "v2": {
        "graph": {
            "chip_name": "Two_Qubit_Processor",
            "chip_width_mm": 10.0,
            "chip_height_mm": 10.0,
            "substrate": "silicon",
            "metal": "aluminum",
            "qubits": [
                {"id": "q0", "x_mm": -1.5, "y_mm": 0.0, "orientation_deg": 0.0, "frequency_ghz": 5.1},
                {"id": "q1", "x_mm": 1.5, "y_mm": 0.0, "orientation_deg": 90.0, "frequency_ghz": 5.2}
            ],
            "resonators": [],
            "couplers": [],
            "feedlines": [],
            "launchpads": []
        }
    }
}

# 4. Compile, validate, and export
geom_metadata = geo_builder.build_geometry(
    simulation_id=sim_id,
    design_payload=design_payload
)

print(f"Geometry compiled: {geom_metadata.component_count} components placed.")
print(f"Generated files: {geom_metadata.generated_files}")
# Outputs: ['design.json', 'geometry.geo', 'geometry.step', 'geometry_metadata.json']
```
