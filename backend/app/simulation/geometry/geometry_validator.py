"""Geometry Validator for layout design validation."""

from __future__ import annotations

import logging
from typing import List

from app.simulation.geometry.exceptions import (
    DuplicateComponentError,
    GeometryValidationError,
    OverlapError,
)
from app.simulation.geometry.geometry_models import GeometryComponent, GeometryComponentKind, LogicalPort
from app.simulation.geometry.layer_manager import LayerManager
from app.simulation.geometry.material_mapper import MaterialMapper

logger = logging.getLogger(__name__)


class GeometryValidator:
    """Performs physical, structural, and schematic connectivity validation on layout geometries."""

    def __init__(self, layer_manager: LayerManager, material_mapper: MaterialMapper) -> None:
        """Initialize the Geometry Validator.

        Args:
            layer_manager: LayerManager instance to validate layers.
            material_mapper: MaterialMapper instance to validate materials.
        """
        self.layer_manager = layer_manager
        self.material_mapper = material_mapper

    def validate_design(
        self,
        components: List[GeometryComponent],
        ports: List[LogicalPort],
        chip_width_mm: float,
        chip_height_mm: float,
    ) -> None:
        """Perform full validation on a set of placed components and ports.

        Args:
            components: List of placed GeometryComponents.
            ports: List of associated LogicalPorts.
            chip_width_mm: Width of the chip die.
            chip_height_mm: Height of the chip die.

        Raises:
            DuplicateComponentError: If there are duplicate component IDs.
            OverlapError: If physical components overlap invalidly.
            GeometryValidationError: If dimensions are out of bounds or connectivity is broken.
        """
        logger.info("Starting geometry validation for design...")
        
        if not components:
            raise GeometryValidationError("Design contains no components.")

        # 1. Validate chip dimensions
        if chip_width_mm <= 0.0 or chip_height_mm <= 0.0:
            raise GeometryValidationError(
                f"Invalid chip dimensions: W={chip_width_mm} mm, H={chip_height_mm} mm. "
                f"Must be positive."
            )

        # Die boundary limits
        half_w = chip_width_mm / 2.0
        half_h = chip_height_mm / 2.0

        component_ids = set()
        qubit_ids = set()

        # 2. Iterative single-component checks
        for c in components:
            # A. Duplicate check
            if c.id in component_ids:
                raise DuplicateComponentError(f"Duplicate component identifier found: '{c.id}'")
            component_ids.add(c.id)
            
            if c.kind == GeometryComponentKind.QUBIT:
                qubit_ids.add(c.id)

            # B. Layer and Material validation
            self.layer_manager.validate_layer(c.layer)
            self.material_mapper.validate_material(c.material)

            # C. Die boundary check
            if c.bounding_box:
                xmin, ymin, xmax, ymax = c.bounding_box
                if xmin < -half_w or xmax > half_w or ymin < -half_h or ymax > half_h:
                    raise GeometryValidationError(
                        f"Component '{c.id}' boundary extends outside the chip die. "
                        f"Die limit: [{-half_w:.2f}, {half_w:.2f}] mm. "
                        f"Component box: [{xmin:.2f}, {xmax:.2f}] mm."
                    )

        # 3. Schematic connectivity validation
        for c in components:
            p = c.params
            # Validate that couplers point to existing qubits
            if c.kind == GeometryComponentKind.COUPLER:
                q_a = p.get("qubit_a_id") or p.get("qubit_a")
                q_b = p.get("qubit_b_id") or p.get("qubit_b")
                
                if q_a and q_a not in qubit_ids:
                    raise GeometryValidationError(
                        f"Coupler '{c.id}' references non-existent qubit_a: '{q_a}'"
                    )
                if q_b and q_b not in qubit_ids:
                    raise GeometryValidationError(
                        f"Coupler '{c.id}' references non-existent qubit_b: '{q_b}'"
                    )

            # Validate that resonators point to existing target qubits
            elif c.kind == GeometryComponentKind.RESONATOR:
                q_target = p.get("target_qubit_id") or p.get("target_qubit")
                if q_target and q_target not in qubit_ids:
                    raise GeometryValidationError(
                        f"Resonator '{c.id}' references non-existent target qubit: '{q_target}'"
                    )

        # 4. Overlap checks
        # Helper to check if two bounding boxes overlap
        def boxes_overlap(box1, box2) -> bool:
            xmin1, ymin1, xmax1, ymax1 = box1
            xmin2, ymin2, xmax2, ymax2 = box2
            # Returns True if they intersect
            return not (xmax1 < xmin2 or xmax2 < xmin1 or ymax1 < ymin2 or ymax2 < ymin1)

        for i, c1 in enumerate(components):
            if not c1.bounding_box or c1.kind == GeometryComponentKind.GROUND_PLANE:
                continue
            for j in range(i + 1, len(components)):
                c2 = components[j]
                if not c2.bounding_box or c2.kind == GeometryComponentKind.GROUND_PLANE:
                    continue

                # Check if bounding boxes overlap
                if boxes_overlap(c1.bounding_box, c2.bounding_box):
                    # Strict overlap rule:
                    # Two qubits or two resonators or two launchpads should never overlap.
                    # Qubits and resonators can overlap at boundaries (for coupling),
                    # but if their centers are too close (e.g. identical), it's a layout error.
                    if c1.x_mm == c2.x_mm and c1.y_mm == c2.y_mm:
                        raise OverlapError(
                            f"Components '{c1.id}' and '{c2.id}' have identical center coordinates "
                            f"({c1.x_mm}, {c1.y_mm}), representing a layout collision."
                        )

                    # Two active structures of the same type should not overlap
                    if c1.kind == c2.kind and c1.kind in (
                        GeometryComponentKind.QUBIT,
                        GeometryComponentKind.RESONATOR,
                        GeometryComponentKind.LAUNCHPAD,
                    ):
                        # Connections/routes are designed to touch or overlap with other components
                        if any(term in c1.id.lower() or term in c2.id.lower() for term in ["conn", "route", "wire", "line", "pin"]):
                            continue

                        raise OverlapError(
                            f"Layout collision: Overlapping components of kind '{c1.kind.value}': "
                            f"'{c1.id}' and '{c2.id}'."
                        )

        logger.info("Geometry validation succeeded. All checks passed.")
