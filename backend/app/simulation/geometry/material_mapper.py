"""Material mapping and validation for the simulation geometry builder."""

from __future__ import annotations

from typing import List, Set
from app.simulation.geometry.constants import VALID_MATERIALS
from app.simulation.geometry.exceptions import InvalidMaterialError


class MaterialMapper:
    """Manages and validates material tags for electromagnetic geometries."""

    def __init__(self, allowed_materials: Optional[Set[str]] = None) -> None:
        """Initialize the Material Mapper.

        Args:
            allowed_materials: Optional set of allowed material names. Defaults to constants.VALID_MATERIALS.
        """
        self._materials = set(allowed_materials) if allowed_materials is not None else set(VALID_MATERIALS)

    def register_material(self, material_name: str) -> None:
        """Register a new physical material.

        Args:
            material_name: The name of the material to register.

        Raises:
            InvalidMaterialError: If the name is empty.
        """
        name_clean = material_name.strip().lower()
        if not name_clean:
            raise InvalidMaterialError("Material name cannot be empty.")
            
        self._materials.add(name_clean)

    def validate_material(self, material_name: str) -> None:
        """Validate if a material name is registered.

        Args:
            material_name: The name of the material to check.

        Raises:
            InvalidMaterialError: If the material is not registered.
        """
        name_clean = material_name.strip().lower()
        if name_clean not in self._materials:
            raise InvalidMaterialError(
                f"Invalid material '{material_name}'. Registered materials: {sorted(list(self._materials))}"
            )

    def list_materials(self) -> List[str]:
        """Return a sorted list of all registered materials.

        Returns:
            A list of material name strings.
        """
        return sorted(list(self._materials))
