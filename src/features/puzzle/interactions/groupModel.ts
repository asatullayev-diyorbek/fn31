import type { RotationDegrees } from "@/features/puzzle/rendering";

export interface PiecePosition {
  x: number;
  y: number;
  rotation: RotationDegrees;
}

export type GroupMap = ReadonlyMap<number, string>;
export type PositionMap = ReadonlyMap<number, PiecePosition>;

/** Every piece starts as its own single-member group. Deterministic group ids, not random — two clients computing this from the same piece list agree. */
export function createInitialGroups(pieceIds: readonly number[]): GroupMap {
  return new Map(pieceIds.map((id) => [id, `g${id}`]));
}

export function getGroupId(groups: GroupMap, pieceId: number): string | undefined {
  return groups.get(pieceId);
}

export function getGroupMembers(groups: GroupMap, groupId: string): number[] {
  const members: number[] = [];
  for (const [pieceId, g] of groups) {
    if (g === groupId) members.push(pieceId);
  }
  return members.sort((a, b) => a - b);
}

/**
 * Merges pieceB's group into pieceA's group. The resulting group id is
 * whichever of the two sorts first — purely so that, given the same two
 * groups, every client merging them independently converges on the same
 * id (important once this is replayed from a durable log).
 */
export function mergeGroups(groups: GroupMap, pieceA: number, pieceB: number): GroupMap {
  const groupA = groups.get(pieceA);
  const groupB = groups.get(pieceB);
  if (!groupA || !groupB || groupA === groupB) return groups;

  const [keep, discard] = groupA < groupB ? [groupA, groupB] : [groupB, groupA];
  const next = new Map(groups);
  for (const [pieceId, g] of groups) {
    if (g === discard) next.set(pieceId, keep);
  }
  return next;
}

/** Translates every member of a group by the same delta — relative offsets between pieces are preserved by construction. */
export function moveGroupBy(
  positions: PositionMap,
  groups: GroupMap,
  groupId: string,
  dx: number,
  dy: number,
): PositionMap {
  const next = new Map(positions);
  for (const pieceId of getGroupMembers(groups, groupId)) {
    const current = positions.get(pieceId);
    if (!current) continue;
    next.set(pieceId, { ...current, x: current.x + dx, y: current.y + dy });
  }
  return next;
}

/**
 * Like `moveGroupBy`, but only moves members of `groupId` that are also in
 * `allowedPieceIds`. Needed when a single drag gesture snaps onto more than
 * one already-placed neighbor at once: resolving the dragged piece's group
 * id *after* the first merge returns a superset that now also contains that
 * first neighbor's whole (stationary, already-committed) group, and moving
 * the superset to satisfy the second snap would drag that previously-placed
 * cluster along with it — a local-only move, since only the pieces the user
 * actually dragged ever get committed/broadcast (see PuzzleEngine.commitGroup),
 * so the stationary cluster's shift silently reverts on the next sync. This
 * restricts the move to the pieces that are actually allowed to move.
 */
export function moveGroupSubsetBy(
  positions: PositionMap,
  groups: GroupMap,
  groupId: string,
  allowedPieceIds: ReadonlySet<number>,
  dx: number,
  dy: number,
): PositionMap {
  const next = new Map(positions);
  for (const pieceId of getGroupMembers(groups, groupId)) {
    if (!allowedPieceIds.has(pieceId)) continue;
    const current = positions.get(pieceId);
    if (!current) continue;
    next.set(pieceId, { ...current, x: current.x + dx, y: current.y + dy });
  }
  return next;
}

function normalizeRotation(degrees: number): RotationDegrees {
  const normalized = (((degrees % 360) + 360) % 360) as number;
  if (normalized === 0 || normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized;
  }
  return 0;
}

/**
 * Rotates every member of a group by the same delta around the group's
 * centroid (piece top-left positions are used as point-mass centers;
 * `pieceWidth`/`pieceHeight` let the caller use true piece centers
 * instead if desired by pre-offsetting positions).
 */
export function rotateGroupAround(
  positions: PositionMap,
  groups: GroupMap,
  groupId: string,
  deltaDegrees: 90 | -90 | 180,
  centerX: number,
  centerY: number,
): PositionMap {
  const radians = (deltaDegrees * Math.PI) / 180;
  const cos = Math.round(Math.cos(radians));
  const sin = Math.round(Math.sin(radians));
  const next = new Map(positions);

  for (const pieceId of getGroupMembers(groups, groupId)) {
    const current = positions.get(pieceId);
    if (!current) continue;
    const relX = current.x - centerX;
    const relY = current.y - centerY;
    const rotatedX = relX * cos - relY * sin;
    const rotatedY = relX * sin + relY * cos;
    next.set(pieceId, {
      x: centerX + rotatedX,
      y: centerY + rotatedY,
      rotation: normalizeRotation(current.rotation + deltaDegrees),
    });
  }
  return next;
}

/** True only when both pieces currently belong to the same group — the basis for "disconnected pieces never move together". */
export function areInSameGroup(groups: GroupMap, pieceA: number, pieceB: number): boolean {
  const a = groups.get(pieceA);
  const b = groups.get(pieceB);
  return a !== undefined && a === b;
}
