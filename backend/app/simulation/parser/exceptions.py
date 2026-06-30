"""Custom exceptions raised by the simulation result parser package."""

from __future__ import annotations


class ResultParserError(Exception):
    """Base exception for all simulation result parsing and physics conversion errors."""

    pass


class FileMissingError(ResultParserError, FileNotFoundError):
    """Raised when a required simulation output file is missing."""

    pass


class HeaderNotFoundError(ResultParserError):
    """Raised when required column headers are missing from output CSV files."""

    pass


class InvalidFormatError(ResultParserError):
    """Raised when output files contain malformed rows or dimension mismatches."""

    pass


class PhysicsConversionError(ResultParserError):
    """Raised when physical calculations fail due to invalid inputs or boundaries."""

    pass
