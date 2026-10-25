export interface GridLayout {
  rows: number;
  cols: number;
}

/**
 * Chooses a rows x cols grid whose piece count is as close as possible to
 * `requestedPieceCount` while keeping individual pieces close to the
 * image's own aspect ratio. Purely arithmetic — no randomness — so it is
 * trivially deterministic across clients.
 *
 * Searches a small neighborhood of column counts around the aspect-ratio
 * ideal rather than taking a single sqrt+round guess: a lone round-trip
 * (`cols = round(sqrt(n·aspect))`, `rows = round(n/cols)`) compounds two
 * independent roundings and can land well short of an exact match that
 * was available nearby — e.g. requesting 25 pieces at aspect 1.5 used to
 * produce a 6x4 (24-piece) grid when 5x5 (an exact 25) was one column
 * away. The search still prefers the requested aspect ratio when two
 * candidates tie on piece count.
 */
export function computeGridLayout(
  requestedPieceCount: number,
  imageAspectRatio: number,
): GridLayout {
  const safeAspect =
    Number.isFinite(imageAspectRatio) && imageAspectRatio > 0 ? imageAspectRatio : 1;
  const idealCols = Math.sqrt(requestedPieceCount * safeAspect);
  const baseCols = Math.max(1, Math.round(idealCols));
  const searchRadius = 4;

  let best: GridLayout = { cols: baseCols, rows: Math.max(1, Math.round(requestedPieceCount / baseCols)) };
  let bestDiff = Math.abs(best.cols * best.rows - requestedPieceCount);
  let bestAspectError = Math.abs(best.cols / best.rows - safeAspect);

  for (let cols = Math.max(1, baseCols - searchRadius); cols <= baseCols + searchRadius; cols++) {
    const rows = Math.max(1, Math.round(requestedPieceCount / cols));
    const diff = Math.abs(cols * rows - requestedPieceCount);
    const aspectError = Math.abs(cols / rows - safeAspect);
    if (diff < bestDiff || (diff === bestDiff && aspectError < bestAspectError)) {
      best = { cols, rows };
      bestDiff = diff;
      bestAspectError = aspectError;
    }
  }

  return best;
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
