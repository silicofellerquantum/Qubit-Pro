"""Palace-specific exceptions."""

class PalaceIntegrationError(Exception):
    """Base exception for all AWS Palace integration errors."""
    pass


class GeometryExtractionError(PalaceIntegrationError):
    """Raised when layout geometry extraction fails."""
    pass


class ConfigGenerationError(PalaceIntegrationError):
    """Raised when Palace JSON configuration generation fails."""
    pass


class PalaceExecutionError(PalaceIntegrationError):
    """Raised when the Palace solver fails to execute."""
    pass


class ResultParsingError(PalaceIntegrationError):
    """Raised when Palace result parser fails to parse CSV files."""
    pass
