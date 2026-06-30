"""Constants for the simulation geometry builder."""

from __future__ import annotations

# Geometry schema version
GEOMETRY_VERSION = "1.0.0"

# Standard fabrication layers
LAYER_METAL = "metal"
LAYER_SUBSTRATE = "substrate"
LAYER_AIR = "air"
LAYER_GROUND = "ground"
LAYER_DIELECTRIC = "dielectric"
LAYER_JUNCTION = "junction"

VALID_LAYERS = {
    LAYER_METAL,
    LAYER_SUBSTRATE,
    LAYER_AIR,
    LAYER_GROUND,
    LAYER_DIELECTRIC,
    LAYER_JUNCTION,
}

# Standard electromagnetic materials
MATERIAL_SILICON = "silicon"
MATERIAL_SAPPHIRE = "sapphire"
MATERIAL_ALUMINUM = "aluminum"
MATERIAL_NIOBIUM = "niobium"
MATERIAL_VACUUM = "vacuum"
MATERIAL_AIR = "air"

VALID_MATERIALS = {
    MATERIAL_SILICON,
    MATERIAL_SAPPHIRE,
    MATERIAL_ALUMINUM,
    MATERIAL_NIOBIUM,
    MATERIAL_VACUUM,
    MATERIAL_AIR,
}

# File names for exported geometry artifacts
EXPORT_DESIGN_FILENAME = "design.json"
EXPORT_METADATA_FILENAME = "geometry_metadata.json"
EXPORT_GEO_FILENAME = "geometry.geo"
EXPORT_STEP_FILENAME = "geometry.step"
