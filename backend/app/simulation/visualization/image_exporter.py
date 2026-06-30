"""In-memory LRU image cache + image export utilities."""

from __future__ import annotations

import hashlib
import io
import logging
import time
from pathlib import Path
from threading import Lock
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# Maximum number of rendered images to keep in memory
_CACHE_MAX_ENTRIES = 128
_cache: Dict[str, Tuple[bytes, float]] = {}   # key → (png_bytes, timestamp)
_cache_lock = Lock()


def _make_cache_key(**render_params) -> str:
    """Create a deterministic cache key from render parameters."""
    canonical = "&".join(f"{k}={v}" for k, v in sorted(render_params.items()))
    return hashlib.sha256(canonical.encode()).hexdigest()


def cache_get(key: str) -> Optional[bytes]:
    """Retrieve cached image bytes, or None on cache miss."""
    with _cache_lock:
        entry = _cache.get(key)
        if entry:
            return entry[0]
        return None


def cache_put(key: str, image_bytes: bytes) -> None:
    """Store image bytes in the cache, evicting oldest if at capacity."""
    with _cache_lock:
        if len(_cache) >= _CACHE_MAX_ENTRIES:
            # LRU eviction: remove oldest entry by timestamp
            oldest_key = min(_cache, key=lambda k: _cache[k][1])
            del _cache[oldest_key]
        _cache[key] = (image_bytes, time.monotonic())


def cache_clear(prefix: str = "") -> int:
    """Clear all cache entries, optionally filtered by key prefix. Returns count removed."""
    with _cache_lock:
        if not prefix:
            count = len(_cache)
            _cache.clear()
            return count
        to_delete = [k for k in _cache if k.startswith(prefix)]
        for k in to_delete:
            del _cache[k]
        return len(to_delete)


def cache_stats() -> Dict:
    """Return cache statistics."""
    with _cache_lock:
        total_bytes = sum(len(v[0]) for v in _cache.values())
        return {
            "entries": len(_cache),
            "total_bytes": total_bytes,
            "max_entries": _CACHE_MAX_ENTRIES,
        }


def save_screenshot(plotter, output_path: Path, transparent_background: bool = False) -> bytes:
    """Save a PyVista plotter screenshot to disk and return the raw bytes.

    Args:
        plotter: An active PyVista Plotter (off_screen=True).
        output_path: Where to write the PNG file.
        transparent_background: Whether to use a transparent background.

    Returns:
        PNG file bytes.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    plotter.screenshot(str(output_path), transparent_background=transparent_background)
    data = output_path.read_bytes()
    logger.debug("Saved screenshot to %s (%d bytes)", output_path, len(data))
    return data


def generate_thumbnail(source_path: Path, thumb_path: Path, size: Tuple[int, int] = (256, 256)) -> bool:
    """Generate a thumbnail PNG from a larger source PNG.

    Uses Pillow if available, otherwise falls back to PyVista resize.
    Returns True on success.
    """
    try:
        from PIL import Image  # type: ignore
        with Image.open(source_path) as img:
            img.thumbnail(size, Image.LANCZOS)
            img.save(thumb_path, "PNG")
        return True
    except ImportError:
        pass

    try:
        import pyvista as pv
        import numpy as np
        from PIL import Image  # type: ignore[import]
        # PIL not available and pyvista can't resize — skip
    except Exception:
        pass

    # Last resort: copy as-is
    try:
        import shutil
        shutil.copy2(source_path, thumb_path)
        return True
    except Exception as exc:
        logger.warning("thumbnail generation failed: %s", exc)
        return False


def make_render_key(sim_id: str, **params) -> str:
    """Build a cache key for a given simulation + render parameter set."""
    return _make_cache_key(sim_id=sim_id, **params)
