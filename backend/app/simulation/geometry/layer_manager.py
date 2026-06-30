"""Layer management for the simulation geometry builder."""

from __future__ import annotations

from typing import List, Set
from app.simulation.geometry.constants import VALID_LAYERS
from app.simulation.geometry.exceptions import InvalidLayerError


class LayerManager:
    """Manages and validates fabrication layers for electromagnetic simulations."""

    def __init__(self, allowed_layers: Optional[Set[str]] = None) -> None:
        """Initialize the Layer Manager.

        Args:
            allowed_layers: Optional set of allowed layer names. Defaults to constants.VALID_LAYERS.
        """
        self._layers = set(allowed_layers) if allowed_layers is not None else set(VALID_LAYERS)

    def register_layer(self, layer_name: str) -> None:
        """Register a new fabrication layer.

        Args:
            layer_name: The name of the layer to add.

        Raises:
            InvalidLayerError: If the name is empty or invalid.
        """
        name_clean = layer_name.strip().lower()
        if not name_clean:
            raise InvalidLayerError("Fabrication layer name cannot be empty.")
            
        self._layers.add(name_clean)

    def validate_layer(self, layer_name: str) -> None:
        """Validate if a layer name is registered.

        Args:
            layer_name: The name of the layer to check.

        Raises:
            InvalidLayerError: If the layer is not registered.
        """
        name_clean = layer_name.strip().lower()
        if name_clean not in self._layers:
            raise InvalidLayerError(
                f"Invalid layer '{layer_name}'. Registered layers: {sorted(list(self._layers))}"
            )

    def list_layers(self) -> List[str]:
        """Return a sorted list of all active fabrication layers.

        Returns:
            A list of layer name strings.
        """
        return sorted(list(self._layers))
