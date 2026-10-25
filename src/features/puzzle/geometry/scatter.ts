export interface ScatterParams {
  pieceIds: readonly number[];
  pieceWidthPx: number;
  pieceHeightPx: number;
  imageWidthPx: number;
  imageHeightPx: number;
  /** A seeded RNG (e.g. mulberry32) — same sequence in, same scatter out. */
  rng: () => number;
}

export interface ScatteredPosition {
  pieceId: number;
  x: number;
  y: number;
}

const MAX_ATTEMPTS_PER_PIECE = 24;
/** Centers at least this fraction of a piece apart cap how much two scattered pieces can overlap (0.5 => at most ~50% of a piece's area overlapping its nearest neighbor). */
const MIN_CENTER_DISTANCE_RATIO = 0.5;

/**
 * Scatters pieces in a ring around the puzzle's target image frame — not on
 * top of it, and not clumped in one spot — so a player can see the whole
 * frame they're reconstructing from the very first render. Deterministic
 * for a given `rng` sequence (reject-sampled: each piece retries a few
 * random candidates and keeps whichever lands farthest from pieces already
 * placed, so even a full retry budget still produces the same layout for
 * the same seed).
 */
export function scatterPiecesAroundFrame(params: ScatterParams): Map<number, { x: number; y: number }> {
  const { pieceIds, pieceWidthPx, pieceHeightPx, imageWidthPx, imageHeightPx, rng } = params;
  const centerX = imageWidthPx / 2;
  const centerY = imageHeightPx / 2;
  const frameHalfDiagonal = Math.hypot(imageWidthPx / 2, imageHeightPx / 2);
  const pieceSize = Math.max(pieceWidthPx, pieceHeightPx);
  const minCenterDistance = pieceSize * MIN_CENTER_DISTANCE_RATIO;

  const placed: Array<{ x: number; y: number }> = [];
  const positions = new Map<number, { x: number; y: number }>();

  for (const pieceId of pieceIds) {
    let best: { x: number; y: number } | null = null;
    let bestMinDistance = -Infinity;

    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_PIECE; attempt++) {
      const angle = rng() * Math.PI * 2;
      // Ring between ~1.05x and ~1.8x the frame's half-diagonal: close enough that
      // pieces read as "belonging" to the puzzle, far enough they don't sit on the frame.
      const radius = frameHalfDiagonal * (1.05 + rng() * 0.75);
      const centerPointX = centerX + Math.cos(angle) * radius - pieceWidthPx / 2;
      const centerPointY = centerY + Math.sin(angle) * radius - pieceHeightPx / 2;

      let minDistanceToPlaced = Infinity;
      for (const other of placed) {
        const d = Math.hypot(centerPointX - other.x, centerPointY - other.y);
        if (d < minDistanceToPlaced) minDistanceToPlaced = d;
      }
      if (placed.length === 0) minDistanceToPlaced = Infinity;

      if (minDistanceToPlaced >= minCenterDistance) {
        best = { x: centerPointX, y: centerPointY };
        break;
      }
      if (minDistanceToPlaced > bestMinDistance) {
        bestMinDistance = minDistanceToPlaced;
        best = { x: centerPointX, y: centerPointY };
      }
    }

    const final = best ?? { x: centerX, y: centerY };
    placed.push(final);
    positions.set(pieceId, final);
  }

  return positions;
}
