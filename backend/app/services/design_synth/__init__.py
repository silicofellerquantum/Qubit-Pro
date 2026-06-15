"""
design_synth — NL -> DesignGraph -> DesignDocument synthesis support.

Includes:
  * ontology      — role -> ranked catalog componentId (TransmonCross default)
  * pin_allocator — deterministic catalog-driven pin assignment
  * compiler      — SchematicCompiler: DesignGraph -> DesignDocument
"""
from app.services.design_synth import ontology
from app.services.design_synth.compiler import SchematicCompiler, schematic_compiler
from app.services.design_synth.pin_allocator import PinAllocator

__all__ = [
    "ontology",
    "SchematicCompiler",
    "schematic_compiler",
    "PinAllocator",
]
