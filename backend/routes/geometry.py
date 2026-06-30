"""FastAPI router for Palace geometry converter and preview."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

# Robust import resolution for both standalone and mounted router paths
try:
    from app.services.geometry_converter import QiskitMetalToPalaceConverter
except ImportError:
    try:
        from services.geometry_converter import QiskitMetalToPalaceConverter
    except ImportError:
        # Hard fallback to local import if paths are nested
        import sys
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
        from services.geometry_converter import QiskitMetalToPalaceConverter

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/projects",
    tags=["geometry"],
)

# Resolve backend root path dynamically based on import location
_FILE_PATH = Path(__file__).resolve()
if "app" in _FILE_PATH.parts:
    _BACKEND_ROOT = _FILE_PATH.parents[2]
else:
    _BACKEND_ROOT = _FILE_PATH.parents[1]

# Pydantic Schemas for Validation
class GenerateConfigResponse(BaseModel):
    config_file: str
    geometry_summary: Dict[str, Any]
    components: List[Dict[str, Any]]

class GeometryPreviewResponse(BaseModel):
    domains: Dict[str, Any]
    materials: Dict[str, Any]
    components: List[Dict[str, Any]]

@router.post("/{project_id}/generate-palace-config", response_model=GenerateConfigResponse)
async def generate_palace_config(
    project_id: str,
    payload: Dict[str, Any]
) -> Dict[str, Any]:
    """Extract design geometry from Qiskit Metal design, build the Palace configuration, and save it."""
    logger.info("Received Palace configuration generation request for project: %s", project_id)
    
    # Extract Qiskit Metal design data from wrapped or direct payload
    design_data = payload.get("design_json") or payload.get("design") or payload

    try:
        # Create converter and process the geometry
        converter = QiskitMetalToPalaceConverter(design_data)
        
        # Save config file under backend/palace_input/{project_id}/palace_config.json
        output_dir = _BACKEND_ROOT / "palace_input" / project_id
        output_dir.mkdir(parents=True, exist_ok=True)
        config_path = output_dir / "palace_config.json"
        
        converter.save_config(str(config_path))
        
        relative_path = f"backend/palace_input/{project_id}/palace_config.json"
        
        return {
            "config_file": relative_path,
            "geometry_summary": converter.get_geometry_summary(),
            "components": converter.components
        }
    except Exception as exc:
        logger.exception("Failed to generate Palace configuration for project %s", project_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate Palace configuration: {str(exc)}"
        )

@router.get("/{project_id}/geometry-preview", response_model=GeometryPreviewResponse)
async def get_geometry_preview(
    project_id: str
) -> Dict[str, Any]:
    """Read the saved palace_config.json and return its preview data for frontend rendering."""
    logger.info("Fetching geometry preview for project: %s", project_id)
    
    config_path = _BACKEND_ROOT / "palace_input" / project_id / "palace_config.json"
    
    if not config_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Palace configuration not found for project {project_id}. Please generate it first."
        )
        
    try:
        with open(config_path, "r") as f:
            config_data = json.load(f)
            
        domains = config_data.get("Domains", {})
        materials = config_data.get("Materials", {})
        geometry = config_data.get("Geometry", [])
        
        # Map geometry entries back to components structure for preview rendering
        components = []
        for item in geometry:
            name_val = item.get("Name", "Unknown")
            parts = name_val.split("_", 1)
            comp_type = parts[0].lower() if len(parts) > 1 else "coupler"
            comp_name = parts[1] if len(parts) > 1 else name_val
            
            x = item.get("X", [0.0, 0.0])
            y = item.get("Y", [0.0, 0.0])
            
            components.append({
                "name": comp_name,
                "type": comp_type,
                "bounds": [x[0], y[0], x[1], y[1]],
                "layer": 1,
                "original_class": item.get("Type", "Rectangle")
            })
            
        return {
            "domains": domains,
            "materials": materials,
            "components": components
        }
    except Exception as exc:
        logger.exception("Failed to read Palace configuration preview for project %s", project_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to read geometry preview: {str(exc)}"
        )
