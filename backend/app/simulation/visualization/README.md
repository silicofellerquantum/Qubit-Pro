# Visualization Module — Quantum Studio

Converts Palace VTU/mesh outputs into visual representations without requiring ParaView.

## Architecture

```
VisualizationService (visualizer.py)
├── vtu_loader.py        — PyVista dataset loading with LRU cache
├── field_renderer.py    — Scalar/vector field PNG rendering
├── mesh_renderer.py     — Mesh topology PNG rendering
├── slice_generator.py   — Orthogonal slice + isosurface rendering
├── camera_manager.py    — Named camera presets
├── image_exporter.py    — In-memory image cache + PNG/JPEG export
├── visualization_models.py  — Pydantic schemas
└── exceptions.py        — Custom exception hierarchy
```

## Supported Formats

| Format | Extension | Notes |
|--------|-----------|-------|
| VTK Unstructured Grid | `.vtu` | Primary Palace output |
| Parallel VTK | `.pvtu` | Multi-process Palace output |
| VTK Data | `.pvd` | Time series collections |
| VTK Multi-Block | `.vtm` | Future-ready |
| GMSH | `.msh` | Always available as fallback |

## REST API

All endpoints require authentication (`qs_token`).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/simulations/{id}/visualization/manifest` | Full manifest |
| GET | `/api/simulations/{id}/visualization/arrays` | Available field arrays |
| GET | `/api/simulations/{id}/visualization/render` | Render field PNG |
| GET | `/api/simulations/{id}/visualization/mesh-render` | Render mesh PNG |
| GET | `/api/simulations/{id}/visualization/slice` | Orthogonal slice PNG |
| GET | `/api/simulations/{id}/visualization/preview` | Fast preview image |
| GET | `/api/simulations/{id}/visualization/presets` | Camera presets |
| GET | `/api/simulations/{id}/visualization/images/{filename}` | Serve image file |

### Render Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `field` | str | auto | Field array name (e.g. `E_Real`, `B_Real`) |
| `colormap` | enum | `coolwarm` | One of: `viridis`, `coolwarm`, `jet`, `plasma`, `turbo`, `rainbow`, `grey`, `hot` |
| `log_scale` | bool | `false` | Logarithmic color scale |
| `opacity` | float | `1.0` | Mesh opacity [0, 1] |
| `camera` | enum | `isometric` | One of: `isometric`, `top`, `front`, `side`, `bottom`, `perspective` |
| `mode` | int | null | Eigenmode index (1-based) |
| `width` | int | `1200` | Image width in pixels |
| `height` | int | `900` | Image height in pixels |
| `transparent` | bool | `false` | Transparent background |

## Supported Field Arrays

| Palace Array | Type | Units | Description |
|-------------|------|-------|-------------|
| `E_Real` | Vector | V/m | Electric field (real) |
| `B_Real` | Vector | T | Magnetic field (real) |
| `U_e` | Scalar | J/m³ | Electric energy density |
| `U_m` | Scalar | J/m³ | Magnetic energy density |
| `J_Real` | Vector | A/m² | Current density |
| `V`, `Phi` | Scalar | V | Electric potential |
| `EPR` | Scalar | — | Energy participation ratio |

## Performance

- **LRU Dataset Cache**: VTU files are cached by `(path, mtime)` — reloaded only when the file changes.
- **Image Cache**: Up to 128 rendered PNGs are cached in memory (evicted LRU). Cache survives the request lifecycle.
- **Headless Rendering**: Uses `pv.start_xvfb()` automatically on Linux without a display.

## Extending

1. Add a new renderer function in `field_renderer.py` or `slice_generator.py`.
2. Expose it in `VisualizationService` in `visualizer.py`.
3. Add a new route in `visualization.py`.
4. Add a test in `tests/test_visualization.py`.
