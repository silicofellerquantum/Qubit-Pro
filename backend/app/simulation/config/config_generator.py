"""Orchestrator service for generating Palace EM solver configurations."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from app.simulation.workspace.workspace_manager import WorkspaceManager
from app.simulation.config.exceptions import ConfigError, ConfigGenerationError, ConfigValidationError
from app.simulation.config.constants import (
    EXPORT_CONFIG_FILENAME,
    EXPORT_CONFIG_METADATA_FILENAME,
    DEFAULT_AIR_PERMITTIVITY,
    DEFAULT_SUBSTRATE_PERMITTIVITY,
    DEFAULT_SUBSTRATE_LOSS_TANGENT,
    DEFAULT_SOLVER_ORDER,
    DEFAULT_LINEAR_TOLERANCE,
    DEFAULT_LINEAR_MAX_ITS,
    DEFAULT_EIGENMODE_N,
    DEFAULT_EIGENMODE_TARGET_GHZ,
    DEFAULT_EIGENMODE_SAVE,
    DEFAULT_ABSORBING_ORDER,
    DEFAULT_JUNCTION_L_NH,
    DEFAULT_JUNCTION_R_OHM,
)
from app.simulation.config.config_models import (
    PalaceConfig,
    ProblemBlock,
    ModelBlock,
    DomainsBlock,
    MaterialBlock,
    BoundariesBlock,
    PecBlock,
    AbsorbingBlock,
    TerminalBlock,
    LumpedPortBlock,
    SurfaceCurrentBlock,
    SolverBlock,
    LinearSolverBlock,
    EigenmodeSolverBlock,
    ElectrostaticSolverBlock,
    MagnetostaticSolverBlock,
    DrivenSolverBlock,
)

logger = logging.getLogger(__name__)


def _resolve_port_direction(comp: dict, design_payload: dict) -> str:
    """Determine the Palace lumped port excitation direction for a qubit junction.

    Palace integrates the voltage across the port surface along the specified
    direction vector. The sign matters: a wrong sign (e.g. +X instead of -X)
    produces a negative EPR, breaking the physical energy participation ratio.

    We read the component's orientation from the design payload and project
    the orientation angle to the nearest principal axis (+X/-X/+Y/-Y).

    Args:
        comp: The component dict from the components_list in design.json.
        design_payload: The raw design payload dict.

    Returns:
        One of "+X", "-X", "+Y", or "-Y" as a string.
    """
    import math

    # Default to +Y — qubits in standard QiskitMetal orientation have their
    # junction surfaces perpendicular to Y, so voltage integrates along Y.
    orientation_deg = 0.0

    # Try to read orientation from the component params dict directly
    comp_id = comp.get("id") or comp.get("name", "")
    params = comp.get("params", {}) or comp.get("design_options", {})

    # Check orientation in component params
    for key in ("orientation_deg", "rotation", "orientation", "angle_deg"):
        if key in params:
            try:
                orientation_deg = float(params[key])
                break
            except (TypeError, ValueError):
                pass

    # Fall back to V2 graph node orientation
    if orientation_deg == 0.0:
        v2_data = design_payload.get("v2", {})
        graph_dict = v2_data.get("graph", {})
        if graph_dict:
            for node in graph_dict.get("nodes", []):
                if node.get("id") == comp_id:
                    try:
                        orientation_deg = float(node.get("orientation_deg") or 0.0)
                    except (TypeError, ValueError):
                        orientation_deg = 0.0
                    break

    # Normalize to [0, 360)
    orientation_deg = orientation_deg % 360.0

    # The GMSH junction rectangle is drawn with its long axis along +Y
    # (pad_gap height in Y, junction width j_w in X), then rotated by orientation_deg.
    # After rotation, the junction's long axis (originally Y = [0,1]) becomes:
    #   [dx, dy] = [-sin(rad), cos(rad)]
    # The Palace voltage integration direction should be parallel to this rotated Y axis.
    # We project it to the nearest principal axis.
    import math
    angle_rad = math.radians(orientation_deg)
    # Rotated Y axis components
    dx = -math.sin(angle_rad)
    dy =  math.cos(angle_rad)

    if abs(dy) >= abs(dx):
        # Dominant Y component
        return "+Y" if dy >= 0 else "-Y"
    else:
        # Dominant X component
        return "+X" if dx >= 0 else "-X"


class PalaceConfigGenerator:
    """Service to generate and validate Palace EM simulation configurations from workspace artifacts."""

    def __init__(self, workspace_manager: Optional[WorkspaceManager] = None) -> None:
        """Initialize the Palace Configuration Generator.

        Args:
            workspace_manager: Optional WorkspaceManager. Defaults to a new instance.
        """
        self.workspace_manager = workspace_manager or WorkspaceManager()

    def generate_config(
        self,
        simulation_id: str,
        solver_type: str,
        user_settings: Optional[Dict[str, Any]] = None,
    ) -> Tuple[PalaceConfig, Dict[str, Any]]:
        """Generate and save the Palace config.json configuration in the workspace.

        Args:
            simulation_id: UUID of the simulation.
            solver_type: Palace solver formulation ('eigenmode', 'electrostatic', 'magnetostatic', 'driven').
            user_settings: Optional dict containing material settings and solver option overrides.

        Returns:
            A tuple of (PalaceConfig, metadata_dict).

        Raises:
            ConfigGenerationError: If required mesh/geometry files are missing or unreadable.
            ConfigValidationError: If parameter or boundary validation fails.
        """
        logger.info(
            "Generating Palace config for simulation %s (solver: %s)",
            simulation_id, solver_type
        )
        user_settings = user_settings or {}

        try:
            # 1. Resolve workspace paths
            workspace = self.workspace_manager.get_workspace(simulation_id)
            mesh_dir = Path(workspace.mesh_path)
            geom_dir = Path(workspace.geometry_path)
            config_dir = Path(workspace.config_path)

            # 2. Read mesh metadata to find physical groups
            mesh_meta_file = mesh_dir / "mesh_metadata.json"
            if not mesh_meta_file.exists():
                raise ConfigGenerationError(
                    f"Mesh metadata file not found at '{mesh_meta_file}'. Mesh must be generated first."
                )

            try:
                with open(mesh_meta_file, "r", encoding="utf-8") as f:
                    mesh_meta = json.load(f)
            except Exception as e:
                raise ConfigGenerationError(f"Failed to read mesh metadata file: {e}") from e

            physical_groups = mesh_meta.get("physical_groups", {})
            if not physical_groups:
                raise ConfigValidationError("No physical groups found in mesh metadata.")

            # 3. Read design.json if present, to extract component parameters
            design_file = geom_dir / "design.json"
            design_payload = {}
            if design_file.exists():
                try:
                    with open(design_file, "r", encoding="utf-8") as f:
                        design_payload = json.load(f)
                except Exception as e:
                    logger.warning("Could not read design.json: %s. Using default settings.", e)

            # --- PARSE MATERIALS ---
            materials_section = user_settings.get("materials", {})
            sub_settings = materials_section.get("substrate", {})

            # Permittivity default silicon
            substrate_permittivity = sub_settings.get("relative_permittivity")
            if substrate_permittivity is None:
                # Try reading from design_payload
                payload_sub = design_payload.get("materials", {}).get("substrate", {})
                substrate_permittivity = payload_sub.get("relative_permittivity", DEFAULT_SUBSTRATE_PERMITTIVITY)

            substrate_loss_tangent = sub_settings.get("loss_tangent")
            if substrate_loss_tangent is None:
                payload_sub = design_payload.get("materials", {}).get("substrate", {})
                substrate_loss_tangent = payload_sub.get("loss_tangent", DEFAULT_SUBSTRATE_LOSS_TANGENT)

            # Check if materials have tags in the mesh
            air_tag = physical_groups.get("air", {}).get("tag", 1)
            sub_tag = physical_groups.get("substrate", {}).get("tag", 2)

            materials = [
                MaterialBlock(
                    attributes=[air_tag],
                    permittivity=DEFAULT_AIR_PERMITTIVITY,
                    permeability=1.0,
                ),
                MaterialBlock(
                    attributes=[sub_tag],
                    permittivity=float(substrate_permittivity),
                    permeability=1.0,
                    loss_tangent=float(substrate_loss_tangent) if substrate_loss_tangent else None,
                ),
            ]
            domains = DomainsBlock(materials=materials)

            # --- PARSE BOUNDARIES ---
            # Extract standard boundary attributes from physical groups
            pec_tag = physical_groups.get("pec", {}).get("tag", 3)
            absorbing_tag = physical_groups.get("absorbing", {}).get("tag", 4)

            # Find all dynamic port and terminal groups in the mesh
            port_groups = {}      # name -> tag
            terminal_groups = {}  # name -> tag

            for name, prop in physical_groups.items():
                tag = prop.get("tag")
                if tag is None:
                    continue
                if name.startswith("port_"):
                    port_groups[name] = tag
                elif name.startswith("terminal_"):
                    terminal_groups[name] = tag

            # Enforce mutual exclusivity and solver-specific mapping
            solver_type_clean = solver_type.lower()

            pec_attributes = [pec_tag]
            absorbing_block = None
            terminal_list = None
            lumped_port_list = None
            surface_current_list = None

            # Look up component parameters from design_payload to find Josephson inductance
            components_list = design_payload.get("components", [])
            component_params = {}
            for comp in components_list:
                comp_id = comp.get("id")
                if comp_id:
                    component_params[comp_id] = comp

            # If solver is Eigenmode or Driven
            if solver_type_clean in ("eigenmode", "driven"):
                # Wave solver:
                # 1. Terminals (attributes 10+) are perfect conductors (PEC) along with ground plane (3)
                for name, tag in terminal_groups.items():
                    pec_attributes.append(tag)
                
                # 2. Outer boundary (attribute 4) is Absorbing.
                # Order 2 is used instead of order 1 to dramatically reduce
                # energy leakage at the domain walls, fixing near-zero Q-factors.
                absorbing_order = user_settings.get("absorbing_order", DEFAULT_ABSORBING_ORDER)
                absorbing_block = AbsorbingBlock(attributes=[absorbing_tag], order=int(absorbing_order))

                # 3. Ports (Josephson junctions, 100+) are mapped to LumpedPorts
                if port_groups:
                    lumped_port_list = []
                    port_idx = 1
                    for name, tag in sorted(port_groups.items(), key=lambda x: x[1]):
                        comp_id = name.replace("port_", "")
                        comp = component_params.get(comp_id, {})
                        
                        # Find Josephson inductance L_J from component params or user settings overrides
                        override_lj = user_settings.get("josephson_inductance_nh", {}).get(comp_id)
                        if override_lj is None:
                            junctions = comp.get("junctions", [])
                            if junctions:
                                override_lj = junctions[0].get("josephson_inductance_nh") or junctions[0].get("josephson_inductance")
                            if override_lj is None:
                                override_lj = comp.get("params", {}).get("L_nH") or comp.get("params", {}).get("josephson_inductance_nh") or DEFAULT_JUNCTION_L_NH

                        l_val = float(override_lj) if override_lj is not None else DEFAULT_JUNCTION_L_NH

                        # Determine port excitation direction from component orientation.
                        # Each qubit's junction surface normal is oriented along the qubit's
                        # orientation_deg. We project that angle to the dominant axis (+X/-X/+Y/-Y)
                        # so Palace knows which direction to integrate the voltage across.
                        port_direction = _resolve_port_direction(comp, design_payload)

                        lumped_port_list.append(
                            LumpedPortBlock(
                                index=port_idx,
                                attributes=[tag],
                                r=DEFAULT_JUNCTION_R_OHM,
                                l=l_val * 1e-9,
                                c=0.0,
                                direction=port_direction,
                            )
                        )
                        port_idx += 1

            elif solver_type_clean == "electrostatic":
                # Electrostatic solver:
                # 1. PEC is ONLY the ground plane (3)
                # 2. Terminals (10+) are independent Terminal boundaries
                if terminal_groups:
                    terminal_list = []
                    term_idx = 1
                    for name, tag in sorted(terminal_groups.items(), key=lambda x: x[1]):
                        terminal_list.append(
                            TerminalBlock(
                                index=term_idx,
                                attributes=[tag],
                            )
                        )
                        term_idx += 1
                else:
                    raise ConfigValidationError("Electrostatic simulation requires at least one terminal boundary.")

            elif solver_type_clean == "magnetostatic":
                # Magnetostatic solver:
                # 1. PEC is ONLY the ground plane (3)
                # 2. Terminals (10+) are mapped to excitation SurfaceCurrent boundaries
                if terminal_groups:
                    surface_current_list = []
                    port_idx = 1
                    for name, tag in sorted(terminal_groups.items(), key=lambda x: x[1]):
                        surface_current_list.append(
                            SurfaceCurrentBlock(
                                index=port_idx,
                                attributes=[tag],
                            )
                        )
                        port_idx += 1
                else:
                    raise ConfigValidationError("Magnetostatic simulation requires at least one port boundary.")
            else:
                raise ConfigValidationError(f"Unsupported solver type: '{solver_type}'")

            boundaries = BoundariesBlock(
                pec=PecBlock(attributes=sorted(pec_attributes)),
                absorbing=absorbing_block,
                terminal=terminal_list,
                lumped_port=lumped_port_list,
                surface_current=surface_current_list,
            )

            # --- PARSE SOLVER ---
            solver_opts = user_settings.get("solver_options", {})
            order = solver_opts.get("order", DEFAULT_SOLVER_ORDER)

            linear_opts = solver_opts.get("linear", {})
            linear_solver = LinearSolverBlock(
                solver_type=linear_opts.get("type", "Default"),
                tol=float(linear_opts.get("tol", DEFAULT_LINEAR_TOLERANCE)),
                max_its=int(linear_opts.get("max_its", DEFAULT_LINEAR_MAX_ITS)),
            )

            eigenmode_block = None
            electrostatic_block = None
            magnetostatic_block = None
            driven_block = None

            if solver_type_clean == "eigenmode":
                eig_opts = solver_opts.get("eigenmode_options", {})
                n_modes = eig_opts.get("num_modes")
                if n_modes is None:
                    n_modes = len(port_groups) + len(terminal_groups) + 2
                    if n_modes < DEFAULT_EIGENMODE_N:
                        n_modes = DEFAULT_EIGENMODE_N

                target_ghz = eig_opts.get("target_frequency_ghz")
                if target_ghz is None:
                    freq_plan = design_payload.get("frequency_plan", {})
                    qubit_freqs = freq_plan.get("qubit_frequencies_GHz", {})
                    if qubit_freqs:
                        target_ghz = sum(qubit_freqs.values()) / len(qubit_freqs)
                    else:
                        target_ghz = DEFAULT_EIGENMODE_TARGET_GHZ

                eigenmode_block = EigenmodeSolverBlock(
                    n=int(n_modes),
                    target=float(target_ghz) * 1.0e9,  # Convert GHz to Hz
                    save=int(eig_opts.get("save", DEFAULT_EIGENMODE_SAVE)),
                )

            elif solver_type_clean == "electrostatic":
                electrostatic_block = ElectrostaticSolverBlock(save=1)

            elif solver_type_clean == "magnetostatic":
                magnetostatic_block = MagnetostaticSolverBlock(save=1)

            elif solver_type_clean == "driven":
                drv_opts = solver_opts.get("driven_options", {})
                min_f = drv_opts.get("min_freq_ghz", 1.0)
                max_f = drv_opts.get("max_freq_ghz", 10.0)
                step_f = drv_opts.get("freq_step_ghz", 0.1)

                driven_block = DrivenSolverBlock(
                    min_freq=float(min_f) * 1.0e9,
                    max_freq=float(max_f) * 1.0e9,
                    freq_step=float(step_f) * 1.0e9,
                )

            solver = SolverBlock(
                order=int(order),
                linear=linear_solver,
                eigenmode=eigenmode_block,
                electrostatic=electrostatic_block,
                magnetostatic=magnetostatic_block,
                driven=driven_block,
            )

            # --- ASSEMBLE PALACE CONFIG ---
            problem = ProblemBlock(
                solver_type=solver_type,
                verbose=int(user_settings.get("verbose", 1)),
                output="out",
                # Enable ParaView volumetric field export by default per user request.
                # Combined with save=5, this is highly efficient (takes ~2 minutes).
                output_formats={"Paraview": bool(user_settings.get("enable_paraview", True))},

            )
            
            # Mesh path relative to config/ folder
            mesh_path_relative = user_settings.get("mesh_path", "../mesh/mesh.msh")
            model = ModelBlock(
                mesh=mesh_path_relative,
                l0=1e-3,
            )

            # Construct and validate the PalaceConfig Pydantic model
            try:
                config = PalaceConfig(
                    problem=problem,
                    model=model,
                    domains=domains,
                    boundaries=boundaries,
                    solver=solver,
                )
            except Exception as pe:
                raise ConfigValidationError(f"Pydantic schema validation failed for PalaceConfig: {pe}") from pe

            # --- WRITE FILES ATOMICALLY ---
            config_file = config_dir / EXPORT_CONFIG_FILENAME
            config_json_str = config.model_dump_json(by_alias=True, exclude_none=True, indent=2)
            
            try:
                with open(config_file, "w", encoding="utf-8") as f:
                    f.write(config_json_str)
            except Exception as e:
                raise ConfigGenerationError(f"Failed to write config.json to '{config_file}': {e}") from e

            logger.info("Palace config.json successfully written to %s", config_file)

            # Write config metadata
            from app.simulation.workspace.workspace_utils import timestamp_now
            config_metadata = {
                "simulation_id": simulation_id,
                "solver_type": solver_type_clean,
                "mesh_bounding_box": mesh_meta.get("bounding_box"),
                "mapped_materials": {
                    "air": air_tag,
                    "substrate": sub_tag,
                },
                "mapped_boundaries": {
                    "pec": sorted(pec_attributes),
                    "absorbing": [absorbing_tag] if absorbing_block else [],
                    "terminals": {name: tag for name, tag in terminal_groups.items()},
                    "ports": {name: tag for name, tag in port_groups.items()},
                },
                "created_at": timestamp_now(),
            }

            metadata_file = config_dir / EXPORT_CONFIG_METADATA_FILENAME
            try:
                with open(metadata_file, "w", encoding="utf-8") as f:
                    json.dump(config_metadata, f, indent=2)
            except Exception as e:
                logger.warning("Failed to write config metadata file: %s", e)

            logger.info("Palace config metadata successfully written to %s", metadata_file)
            return config, config_metadata

        except (ConfigError, ConfigValidationError) as ce:
            raise ce
        except Exception as e:
            logger.exception("Failed to generate Palace configuration.")
            raise ConfigGenerationError(f"Failed to generate Palace config: {e}") from e
