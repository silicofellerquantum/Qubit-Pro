"""
Template Base Classes

Abstract base class and registry for layout templates.

Status: Stub (to be implemented in LAYOUT-004)
"""

from abc import ABC, abstractmethod
from typing import List, Tuple, Dict, Any


class Template(ABC):
    """
    Abstract base class for layout templates.
    
    All templates must implement methods to generate:
        - sites: Qubit placement sites
        - corridors: Coupler corridors between sites
        - shells: Resonator shells around sites
        - slots: Launchpad slots on die perimeter
        - channels: Feedline routing channels
    
    Status: Stub (to be implemented in LAYOUT-004)
    """
    
    @abstractmethod
    def sites(self, n: int, pitch: float) -> List[Any]:
        """
        Generate n qubit sites with given pitch.
        
        Args:
            n: Number of sites
            pitch: Spacing between sites (mm)
            
        Returns:
            List of Site dataclasses
            
        Raises:
            NotImplementedError: Implementation pending LAYOUT-004
        """
        raise NotImplementedError("Pending LAYOUT-004")
    
    @abstractmethod
    def corridors(self, sites: List[Any], topology: Any) -> List[Any]:
        """
        Generate coupler corridors based on topology.
        
        Args:
            sites: List of Site dataclasses
            topology: Graph topology (edges)
            
        Returns:
            List of Corridor dataclasses
            
        Raises:
            NotImplementedError: Implementation pending LAYOUT-004
        """
        raise NotImplementedError("Pending LAYOUT-004")
    
    @abstractmethod
    def shells(self, sites: List[Any]) -> List[Any]:
        """
        Generate resonator shells around sites.
        
        Args:
            sites: List of Site dataclasses
            
        Returns:
            List of Shell dataclasses
            
        Raises:
            NotImplementedError: Implementation pending LAYOUT-004
        """
        raise NotImplementedError("Pending LAYOUT-004")
    
    @abstractmethod
    def slots(self, n_launchpads: int) -> List[Any]:
        """
        Generate launchpad slots on die perimeter.
        
        Args:
            n_launchpads: Number of launchpads
            
        Returns:
            List of Slot dataclasses
            
        Raises:
            NotImplementedError: Implementation pending LAYOUT-004
        """
        raise NotImplementedError("Pending LAYOUT-004")
    
    @abstractmethod
    def channels(self, shells: List[Any]) -> List[Any]:
        """
        Generate feedline channels.
        
        Args:
            shells: List of Shell dataclasses
            
        Returns:
            List of Channel dataclasses
            
        Raises:
            NotImplementedError: Implementation pending LAYOUT-004
        """
        raise NotImplementedError("Pending LAYOUT-004")


# Template registry (to be populated in LAYOUT-004)
TEMPLATE_REGISTRY: Dict[str, Template] = {}


def select_template(
    topology: str,
    n: int,
    keywords: List[str],
    io_budget: int
) -> Template:
    """
    Select best template for given parameters.
    
    Selection logic:
    1. Check topology match (heavy-hex → HeavyHexTemplate)
    2. Check keywords (vio, flip-chip → VIOTemplate)
    3. Default to square lattice
    
    Args:
        topology: Topology type (e.g., 'line', 'square', 'heavy-hex')
        n: Number of qubits
        keywords: Intent keywords from design
        io_budget: Number of I/O connections
        
    Returns:
        Template instance
        
    Raises:
        NotImplementedError: Implementation pending LAYOUT-004
    """
    raise NotImplementedError("Pending LAYOUT-004")


def register_template(name: str, template_class: type) -> None:
    """
    Register a template in the global registry.
    
    Args:
        name: Template name (e.g., 'square', 'ring')
        template_class: Template class (must inherit from Template)
        
    Raises:
        NotImplementedError: Implementation pending LAYOUT-004
    """
    raise NotImplementedError("Pending LAYOUT-004")
