"""Physical Group Manager for defining and registering material/boundary labels in GMSH."""

from __future__ import annotations

import logging
from typing import Dict, List, Tuple
import gmsh

from app.simulation.mesh.exceptions import PhysicalGroupError
from app.simulation.mesh.constants import DIM_SURFACE, DIM_VOLUME

logger = logging.getLogger(__name__)


class PhysicalGroupManager:
    """Handles the registration and verification of GMSH physical groups for Palace simulations."""

    @staticmethod
    def assign_physical_groups(
        boundary_groups: Dict[str, Tuple[int, List[int]]]
    ) -> Dict[str, Dict[str, int]]:
        """Register the classified boundary groups as physical groups in the GMSH model.

        Args:
            boundary_groups: Dict mapping group name to (attribute_tag, list_of_entity_tags) pairs.

        Returns:
            A metadata dictionary summarizing the registered physical groups.
            Example: {"air": {"dim": 3, "tag": 1}, "pec": {"dim": 2, "tag": 3}, ...}

        Raises:
            PhysicalGroupError: If registration fails or physical groups are empty.
        """
        logger.info("Registering physical groups in GMSH model...")
        
        registered_groups: Dict[str, Dict[str, int]] = {}

        try:
            for name, (attr, tags) in boundary_groups.items():
                if not tags:
                    logger.warning("Skipping registration of empty physical group: '%s'", name)
                    continue
                
                # Determine dimension: volumes are 'air' and 'substrate' (dim 3), all others are surfaces (dim 2)
                dim = DIM_VOLUME if name in ("air", "substrate") else DIM_SURFACE
                
                try:
                    # GMSH Python API: addPhysicalGroup(dim, tags, tag, name)
                    gmsh.model.addPhysicalGroup(dim, tags, attr, name)
                    
                    registered_groups[name] = {
                        "dim": dim,
                        "tag": attr,
                        "entity_count": len(tags),
                    }
                    logger.info(
                        "Registered physical group: '%s' | Dim: %d | Tag: %d | Entities: %d",
                        name,
                        dim,
                        attr,
                        len(tags),
                    )
                except Exception as e:
                    raise PhysicalGroupError(f"GMSH failed to add physical group '{name}' (dim {dim}, tag {attr}): {e}")

            # Verify that physical groups were successfully written
            all_groups = gmsh.model.getPhysicalGroups()
            if len(all_groups) == 0:
                raise PhysicalGroupError("Verification failed: GMSH model contains zero physical groups after assignment.")
            
            logger.info("Physical group registration verified. Total groups registered: %d", len(all_groups))
            return registered_groups

        except PhysicalGroupError:
            raise
        except Exception as e:
            logger.exception("Unexpected error during physical group assignment.")
            raise PhysicalGroupError(f"Unexpected physical group assignment failure: {e}") from e
