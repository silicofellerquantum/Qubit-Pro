"""Custom exceptions for the Palace Configuration Generator package."""

from __future__ import annotations


class ConfigError(Exception):
    """Base exception for all configuration generation and validation errors."""
    pass


class ConfigGenerationError(ConfigError):
    """Raised when configuration generation fails due to missing files or invalid inputs."""
    pass


class ConfigValidationError(ConfigError):
    """Raised when configuration validation fails due to invalid parameters or boundary conflicts."""
    pass
