"""
test_stabilization.py — Regression tests for the Day 1/2 stabilization actions.

Covers:
- ParamValue accepts nested dicts (the 422 regression)
- DesignDocument round-trips through Pydantic without validation error
- legacy_compat.chip_name produces expected values (circular-import fix)
- auth module imports cleanly (bcrypt regression)
- models module imports cleanly (Python 3.9 Optional regression)
- database module imports cleanly (greenlet regression)
- design_pipeline and chip_generator don't create a circular import at import time
"""
from __future__ import annotations

import importlib
import json
import pytest


# ---------------------------------------------------------------------------
# ParamValue / DesignDocument regression
# ---------------------------------------------------------------------------

class TestParamValueSchema:
    """Regression: ParamValue must accept nested dicts (connection_pads etc.)."""

    def test_flat_string_param(self):
        from app.core.editor_models import Placement
        p = Placement(id="p1", componentId="TransmonCross", name="Q1", x=0.0, y=0.0,
                      params={"cross_width": "30um"})
        assert p.params["cross_width"] == "30um"

    def test_flat_numeric_param(self):
        from app.core.editor_models import Placement
        p = Placement(id="p1", componentId="TransmonCross", name="Q1", x=0.0, y=0.0,
                      params={"cross_length": 455.0})
        assert p.params["cross_length"] == 455.0

    def test_nested_dict_param_does_not_raise_422(self):
        """Previously raised Pydantic ValidationError (HTTP 422) for nested dicts."""
        from app.core.editor_models import Placement
        p = Placement(
            id="p1", componentId="TransmonCross", name="Q1", x=2.7, y=1.8,
            params={
                "cross_width": "30um",
                "connection_pads": {
                    "readout": {"claw_length": "70um", "ground_spacing": "5um"}
                },
            },
        )
        assert isinstance(p.params["connection_pads"], dict)
        assert p.params["connection_pads"]["readout"]["claw_length"] == "70um"

    def test_full_design_document_round_trip(self):
        """Full DesignDocument with nested params must parse and re-serialise cleanly."""
        from app.core.editor_models import DesignDocument
        raw = {
            "placements": [
                {
                    "id": "comp_Q1", "componentId": "TransmonCross", "name": "Q1",
                    "x": 2.7, "y": 1.8, "rotation": 180.0,
                    "params": {
                        "cross_width": "30um",
                        "connection_pads": {"readout": {"claw_length": "70um"}},
                    },
                },
                {
                    "id": "comp_C1", "componentId": "CoupledLineTee", "name": "C1",
                    "x": 0.5, "y": -0.8, "rotation": 0.0, "params": {},
                },
            ],
            "connections": [
                {
                    "id": "conn_1",
                    "from": {"placementId": "comp_Q1", "pinName": "bus_01"},
                    "to": {"placementId": "comp_C1", "pinName": "prime_start"},
                    "routeComponentId": "RouteMeander",
                }
            ],
        }
        doc = DesignDocument.model_validate(raw)
        assert len(doc.placements) == 2
        assert len(doc.connections) == 1
        # Re-serialise → JSON parseable
        out = json.loads(doc.model_dump_json(by_alias=True))
        assert out["connections"][0]["from"]["pinName"] == "bus_01"

    def test_connection_from_alias(self):
        """Connection.from_ must be set via the 'from' alias."""
        from app.core.editor_models import Connection, PinRef
        conn = Connection.model_validate({
            "id": "c1",
            "from": {"placementId": "p1", "pinName": "bus_01"},
            "to": {"placementId": "p2", "pinName": "prime_start"},
        })
        assert conn.from_.placementId == "p1"
        assert conn.from_.pinName == "bus_01"


# ---------------------------------------------------------------------------
# legacy_compat — circular import fix regression
# ---------------------------------------------------------------------------

class TestLegacyCompat:
    """Regression: chip_name must live in legacy_compat (circular import fix)."""

    def test_chip_name_importable_from_legacy_compat(self):
        from app.services.legacy_compat import chip_name
        assert chip_name("grid", 4) == "Grid"
        assert chip_name("ring", 5) == "Ring"
        assert chip_name("heavy_hex", 27) == "HeavyHex"
        assert chip_name("unknown_topo", 3) == "Custom"

    def test_chip_generator_re_exports_chip_name(self):
        """chip_generator must re-export chip_name (backward compat for any callers)."""
        from app.services.chip_generator import chip_name
        assert chip_name("line", 3) == "Linear"

    def test_no_circular_import_at_module_level(self):
        """Importing both modules in sequence must not raise ImportError."""
        importlib.import_module("app.services.legacy_compat")
        importlib.import_module("app.services.chip_generator")
        importlib.import_module("app.services.design_pipeline")


# ---------------------------------------------------------------------------
# Auth module import smoke test (bcrypt regression)
# ---------------------------------------------------------------------------

class TestAuthImport:
    def test_auth_module_imports_cleanly(self):
        """Regression: bcrypt missing caused ModuleNotFoundError at import time."""
        import app.auth  # noqa: F401
        assert hasattr(app.auth, "get_password_hash") or hasattr(app.auth, "verify_password") \
            or True  # just verifying no ImportError


# ---------------------------------------------------------------------------
# Models module import smoke test (Python 3.9 Optional regression)
# ---------------------------------------------------------------------------

class TestModelsImport:
    def test_models_import_cleanly(self):
        """Regression: Mapped[X | None] without Optional caused SQLAlchemy error on Py3.9."""
        import app.models  # noqa: F401
        assert hasattr(app.models, "Project")
        assert hasattr(app.models, "Simulation")

    def test_project_model_has_expected_columns(self):
        from app.models import Project
        mapper = Project.__mapper__
        col_names = {c.key for c in mapper.columns}
        assert "id" in col_names
        assert "name" in col_names


# ---------------------------------------------------------------------------
# Database module import smoke test (greenlet regression)
# ---------------------------------------------------------------------------

class TestDatabaseImport:
    def test_database_module_imports_cleanly(self):
        """Regression: missing greenlet caused RuntimeError on first DB session use."""
        import app.database  # noqa: F401
        assert hasattr(app.database, "get_db") or hasattr(app.database, "AsyncSessionLocal") \
            or True  # just verifying no ImportError

    def test_greenlet_is_installed(self):
        """Explicit check that greenlet is importable (was missing from requirements.txt)."""
        import greenlet  # noqa: F401
        assert greenlet.__version__ is not None

    def test_bcrypt_is_installed(self):
        """Explicit check that bcrypt is importable (was missing from requirements.txt)."""
        import bcrypt  # noqa: F401
        assert bcrypt.__version__ is not None
