import type { Point } from "@/features/puzzle/geometry";

/**
 * Converts a piece's normalized unit-square outline (from the geometry
 * engine) into a `Path2D` scaled to its actual on-screen pixel size.
 * Cached per (pieceId, pieceWidthPx, pieceHeightPx) by the caller — this
 * function itself is pure and allocation-light.
 */
export function createPieceClipPath(
  outline: Point[],
  pieceWidthPx: number,
  pieceHeightPx: number,
): Path2D {
  const path = new Path2D();
  const first = outline[0];
  if (!first) return path;
  path.moveTo(first.x * pieceWidthPx, first.y * pieceHeightPx);
  for (let i = 1; i < outline.length; i++) {
    const point = outline[i];
    if (!point) continue;
    path.lineTo(point.x * pieceWidthPx, point.y * pieceHeightPx);
  }
  path.closePath();
  return path;
}
