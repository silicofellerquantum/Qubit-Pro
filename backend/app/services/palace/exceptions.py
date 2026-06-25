"""Custom exceptions for AWS Palace EM simulation integration."""

class PalaceError(Exception):
    """Base exception for all AWS Palace simulation integration errors."""
    pass


class GeometryError(PalaceError):
    """Raised when converting design payloads/graphs to electromagnetic geometry fails."""
    pass


class ConfigGeneratorError(PalaceError):
    """Raised when generating AWS Palace JSON configurations fails."""
    pass


class PalaceRunnerError(PalaceError):
    """Raised when running the AWS Palace simulation runner/solver fails."""
    pass


class ResultParserError(PalaceError):
    """Raised when parsing output CSV files from AWS Palace fails."""
    pass


class AdapterError(PalaceError):
    """Raised when adapting Palace results for scqubits/physics pipeline fails."""
    pass


class GmshBuilderError(PalaceError):
    """Raised when GMSH mesh generation or physical group creation fails."""
    pass
