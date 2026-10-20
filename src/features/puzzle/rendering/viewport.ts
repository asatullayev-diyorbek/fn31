import type { Viewport } from "./types";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 6;

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Pure coordinate math, independent of Canvas/DOM — reused by rendering and interactions, and unit-testable without a real canvas. */
export function worldToScreen(viewport: Viewport, worldX: number, worldY: number) {
  return {
    x: worldX * viewport.zoom + viewport.panX,
    y: worldY * viewport.zoom + viewport.panY,
  };
}

export function screenToWorld(viewport: Viewport, screenX: number, screenY: number) {
  return {
    x: (screenX - viewport.panX) / viewport.zoom,
    y: (screenY - viewport.panY) / viewport.zoom,
  };
}

/** Computes the viewport that centers and fits the full world-space content rect inside the given screen size, with margin. */
export function fitToScreenViewport(
  worldWidth: number,
  worldHeight: number,
  screenWidth: number,
  screenHeight: number,
  marginPx = 32,
): Viewport {
  const availableWidth = Math.max(1, screenWidth - marginPx * 2);
  const availableHeight = Math.max(1, screenHeight - marginPx * 2);
  const zoom = clampZoom(
    Math.min(availableWidth / worldWidth, availableHeight / worldHeight),
  );
  const panX = (screenWidth - worldWidth * zoom) / 2;
  const panY = (screenHeight - worldHeight * zoom) / 2;
  return { zoom, panX, panY };
}

/** Zooms around a fixed screen-space anchor point (e.g. the cursor), keeping the world point under it stable. */
export function zoomAroundPoint(
  viewport: Viewport,
  nextZoom: number,
  anchorScreenX: number,
  anchorScreenY: number,
): Viewport {
  const clamped = clampZoom(nextZoom);
  const worldAtAnchor = screenToWorld(viewport, anchorScreenX, anchorScreenY);
  return {
    zoom: clamped,
    panX: anchorScreenX - worldAtAnchor.x * clamped,
    panY: anchorScreenY - worldAtAnchor.y * clamped,
  };
}
