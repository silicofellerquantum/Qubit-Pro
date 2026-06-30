# Palace Configuration Generator Subsystem

The `config` subsystem is responsible for generating, validating, and writing the JSON configuration file (`config.json`) required by the Palace electromagnetic solver. It acts as the bridge between the **Mesh Generator** (Phase 4) and the **Palace Runner** (Phase 6).

---

## Features

1. **Schema-Validated configuration**: Fully models the complex Palace JSON configuration schema using **Pydantic v2**, guaranteeing runtime type safety and direct serialization of capitalized keys using field aliases.
2. **Dynamic physical group mapping**: Consumes GMSH physical group tags from `mesh_metadata.json` and maps them to Palace solver boundaries (PEC, Absorbing, Terminal, LumpedPort) and material properties based on the solver formulation.
3. **Solver-specific adaptations**:
   * **Eigenmode & Driven**: Groups all metallization terminals (`10+`) with the ground plane under PEC; configures first-order absorbing boundary conditions on the outer air box boundary (`4`) to prevent reflections; and maps Josephson junctions (`100+`) to `LumpedPort` elements with specified inductance $L_J$.
   * **Electrostatic**: Only the ground plane (`3`) is mapped to PEC; qubit pads and traces (`10+`) are mapped to independent `Terminal` boundaries for capacitance matrix extraction.
   * **Magnetostatic**: Only the ground plane (`3`) is mapped to PEC; qubit pads and traces (`10+`) are mapped to independent excitation `LumpedPort` boundaries with $R = 1.0\text{ }\Omega$ and $L = 0.0\text{ nH}$ for inductance matrix extraction.
4. **Rich defaults & overrides**: Supports custom substrate relative permittivity and loss tangent, custom Josephson inductances per qubit, linear solver parameters, and sweep parameters.

---

## Directory Structure

```
backend/app/simulation/config/
├── __init__.py           # Public API exports
├── exceptions.py         # Custom exception hierarchy
├── constants.py          # Default materials, solver parameters, and filenames
├── config_models.py      # Pydantic v2 schemas for Palace configuration
└── config_generator.py   # Orchestrator service class
```

---

## Boundary Mapping Summary

| Physical Group | Tag | Eigenmode / Driven | Electrostatic | Magnetostatic |
| :--- | :---: | :--- | :--- | :--- |
| **air** | `1` | Material (Permittivity: 1.0) | Material (Permittivity: 1.0) | Material (Permittivity: 1.0) |
| **substrate** | `2` | Material (Permittivity: 11.7) | Material (Permittivity: 11.7) | Material (Permittivity: 11.7) |
| **pec** (Ground) | `3` | PEC | PEC | PEC |
| **absorbing** | `4` | Absorbing (Order: 1) | Unassigned (Neumann) | Unassigned (Neumann) |
| **terminal_*** | `10+` | PEC | Terminal (Capacitance Matrix) | LumpedPort (Inductance Matrix) |
| **port_*** | `100+` | LumpedPort (Josephson $L_J$) | Unassigned / Ignored | Unassigned / Ignored |

---

## Usage Example

```python
from app.simulation.config import PalaceConfigGenerator

# Initialize generator
generator = PalaceConfigGenerator()

# Generate and write configuration for an eigenmode simulation
config, metadata = generator.generate_config(
    simulation_id="a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    solver_type="eigenmode",
    user_settings={
        "materials": {
            "substrate": {
                "relative_permittivity": 11.7,
                "loss_tangent": 1.0e-6
            }
        },
        "solver_options": {
            "eigenmode_options": {
                "num_modes": 5,
                "target_frequency_ghz": 5.0
            }
        }
    }
)

# Output is written atomically to:
# <workspace>/config/config.json
# <workspace>/config/config_metadata.json
```
