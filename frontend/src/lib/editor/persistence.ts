import type { DesignDocument } from "@/lib/bridge/types";

const KEY = "silicofeller:design:v1";

export function saveDesign(doc: DesignDocument): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(doc));
  } catch {
    // Storage quota exceeded or private mode — silent fail.
  }
}

export function loadDesign(): DesignDocument | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DesignDocument;
    if (!Array.isArray(parsed.placements) || !Array.isArray(parsed.connections)) return null;
    // Strip stale route caches on load so all connections re-render fresh.
    // This ensures fixes to the render backend are always picked up on reload.
    parsed.connections = parsed.connections.map((c) => ({
      ...c,
      cachedSvg: undefined,
      cachedGeometryHash: undefined,
    }));
    return parsed;
  } catch {
    return null;
  }
}

export function clearDesign(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // silent
  }
}
