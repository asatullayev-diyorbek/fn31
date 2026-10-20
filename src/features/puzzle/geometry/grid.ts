export interface GridLayout {
  rows: number;
  cols: number;
}

/**
 * Chooses a rows x cols grid whose piece count is as close as possible to
 * `requestedPieceCount` while keeping individual pieces close to the
 * image's own aspect ratio. Purely arithmetic — no randomness — so it is
 * trivially deterministic across clients.
 */
export function computeGridLayout(
  requestedPieceCount: number,
  imageAspectRatio: number,
): GridLayout {
  const safeAspect =
    Number.isFinite(imageAspectRatio) && imageAspectRatio > 0 ? imageAspectRatio : 1;
  const idealCols = Math.sqrt(requestedPieceCount * safeAspect);
  const cols = Math.max(1, Math.round(idealCols));
  const rows = Math.max(1, Math.round(requestedPieceCount / cols));
  return { rows, cols };
}

export type ImageFit = "cover" | "contain";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Computes the source-image crop rectangle used before gridding, so the
 * puzzle's aspect ratio matches `targetAspectRatio` regardless of the
 * uploaded image's native proportions.
 *
 * "cover": crops the maximum centered rectangle of the source that has
 * the target aspect ratio (overflow is discarded — standard jigsaw
 * behavior, no empty canvas area).
 *
 * "contain": no cropping is performed; the full source rect is returned
 * and any letterboxing is a rendering-time concern, not a geometry one.
 */
export function computeCropRect(
  sourceWidth: number,
  sourceHeight: number,
  targetAspectRatio: number,
  fit: ImageFit,
): CropRect {
  if (fit === "contain") {
    return { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  }
  const sourceAspect = sourceWidth / sourceHeight;
  if (sourceAspect > targetAspectRatio) {
    const width = sourceHeight * targetAspectRatio;
    return { x: (sourceWidth - width) / 2, y: 0, width, height: sourceHeight };
  }
  const height = sourceWidth / targetAspectRatio;
  return { x: 0, y: (sourceHeight - height) / 2, width: sourceWidth, height };
}
