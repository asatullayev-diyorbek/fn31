import type { EdgeSide, PieceGeometry } from "@/features/puzzle/geometry";
import type { PiecePosition, PositionMap } from "./groupModel";

export interface SnapConfig {
  pieceWidth: number;
  pieceHeight: number;
  toleranceRatio: number; // fraction of piece size, e.g. 0.3
  rotationEnabled: boolean;
}

export interface SnapResult {
  snapped: boolean;
  /** The corrected position to apply if snapped is true. */
  position?: PiecePosition;
}

/**
 * Classic mode: does this piece's current position/rotation fall within
 * tolerance of its correct image-space slot? If so, returns the exact
 * corrected position (positions actually snap to the grid — they don't
 * just report "close enough" while staying wherever the user dropped them).
 */
export function checkClassicSnap(
  current: PiecePosition,
  geometry: PieceGeometry,
  config: SnapConfig,
): SnapResult {
  const targetX = geometry.col * config.pieceWidth;
  const targetY = geometry.row * config.pieceHeight;
  const toleranceX = config.pieceWidth * config.toleranceRatio;
  const toleranceY = config.pieceHeight * config.toleranceRatio;

  const rotationOk = !config.rotationEnabled || current.rotation === 0;
  const withinX = Math.abs(current.x - targetX) <= toleranceX;
  const withinY = Math.abs(current.y - targetY) <= toleranceY;

  if (!rotationOk || !withinX || !withinY) {
    return { snapped: false };
  }
  return { snapped: true, position: { x: targetX, y: targetY, rotation: 0 } };
}

/**
 * `side` is the side of `movedPiece` on which `neighborPiece` sits (i.e.
 * `geometry.neighbors[side] === neighborPieceId` for movedPiece's own
 * geometry) — so the offset below expresses movedPiece's expected
 * position *relative to* neighborPiece.
 */
const EDGE_OFFSETS: Record<EdgeSide, { dx: number; dy: number }> = {
  top: { dx: 0, dy: 1 }, // neighbor is above -> moved piece sits one piece-height below it
  right: { dx: -1, dy: 0 }, // neighbor is to the right -> moved piece sits one piece-width to its left
  bottom: { dx: 0, dy: -1 }, // neighbor is below -> moved piece sits one piece-height above it
  left: { dx: 1, dy: 0 }, // neighbor is to the left -> moved piece sits one piece-width to its right
};

/**
 * Free mode: should `movedPiece` snap onto `neighborPiece` across `side`?
 * Unlike Classic mode this never checks absolute position — only whether
 * the two pieces, which the geometry engine already knows are adjacent in
 * the source image, are currently positioned and rotated as if they were
 * joined along that shared edge.
 */
export function checkFreeNeighborSnap(
  movedPieceId: number,
  side: EdgeSide,
  neighborPieceId: number,
  positions: PositionMap,
  config: SnapConfig,
): SnapResult {
  const moved = positions.get(movedPieceId);
  const neighbor = positions.get(neighborPieceId);
  if (!moved || !neighbor) return { snapped: false };

  if (config.rotationEnabled && moved.rotation !== neighbor.rotation) {
    return { snapped: false };
  }

  const offset = EDGE_OFFSETS[side];
  const expectedX = neighbor.x + offset.dx * config.pieceWidth;
  const expectedY = neighbor.y + offset.dy * config.pieceHeight;
  const toleranceX = config.pieceWidth * config.toleranceRatio;
  const toleranceY = config.pieceHeight * config.toleranceRatio;

  const withinX = Math.abs(moved.x - expectedX) <= toleranceX;
  const withinY = Math.abs(moved.y - expectedY) <= toleranceY;
  if (!withinX || !withinY) return { snapped: false };

  return {
    snapped: true,
    position: { x: expectedX, y: expectedY, rotation: neighbor.rotation },
  };
}

/** Progress = fraction of pieces whose position+rotation currently matches their correct classic slot. Classic mode only — see computeFreeProgress for Free mode, which has no "correct" absolute position. */
export function computeClassicProgress(
  positions: PositionMap,
  geometries: readonly PieceGeometry[],
  config: SnapConfig,
): number {
  if (geometries.length === 0) return 0;
  let correct = 0;
  for (const geometry of geometries) {
    const position = positions.get(geometry.pieceId);
    if (!position) continue;
    if (checkClassicSnap(position, geometry, config).snapped) correct++;
  }
  return correct / geometries.length;
}

/**
 * Free mode has no "correct" absolute canvas position (pieces start scattered
 * at an arbitrary spot, not geometry's grid coordinates) — a piece is "done"
 * once it's joined to every one of its image-adjacent neighbors, regardless of
 * where on the canvas that joined cluster actually sits.
 *
 * Checked directly against *actual positions* (the same geometric test
 * `checkFreeNeighborSnap` uses to decide whether to merge in the first
 * place) rather than against `groupId` labels. `groupId` is client-asserted,
 * shared-write state replicated across every participant's commits — any
 * single bad write (a race, a since-fixed bug, a piece dragged after being
 * merged) can leave a piece's label claiming membership its position no
 * longer backs up, and a label-only check would then report it "done"
 * forever with no way to self-correct. A position-based check always
 * matches what the player can see on screen.
 */
export function computeFreeProgress(
  positions: PositionMap,
  geometries: readonly PieceGeometry[],
  config: SnapConfig,
): number {
  if (geometries.length === 0) return 0;
  let correct = 0;
  for (const geometry of geometries) {
    const neighborEntries = Object.entries(geometry.neighbors) as Array<[EdgeSide, number | undefined]>;
    const allJoined = neighborEntries.every(([side, neighborId]) => {
      if (neighborId === undefined) return true;
      return checkFreeNeighborSnap(geometry.pieceId, side, neighborId, positions, config).snapped;
    });
    if (allJoined) correct++;
  }
  return correct / geometries.length;
}
