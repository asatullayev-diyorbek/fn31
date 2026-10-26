import { describe, expect, it } from "vitest";
import {
  areInSameGroup,
  createInitialGroups,
  getGroupMembers,
  mergeGroups,
  moveGroupBy,
  moveGroupSubsetBy,
  rotateGroupAround,
} from "./groupModel";
import type { PositionMap } from "./groupModel";

describe("groupModel", () => {
  it("starts every piece in its own group", () => {
    const groups = createInitialGroups([0, 1, 2]);
    expect(areInSameGroup(groups, 0, 1)).toBe(false);
    expect(getGroupMembers(groups, groups.get(0)!)).toEqual([0]);
  });

  it("merging two groups puts both pieces' full membership together", () => {
    let groups = createInitialGroups([0, 1, 2, 3]);
    groups = mergeGroups(groups, 0, 1);
    groups = mergeGroups(groups, 2, 3);
    groups = mergeGroups(groups, 1, 2);

    const groupId = groups.get(0)!;
    expect(getGroupMembers(groups, groupId)).toEqual([0, 1, 2, 3]);
    expect(areInSameGroup(groups, 0, 3)).toBe(true);
  });

  it("never merges unrelated pieces into the same group implicitly", () => {
    let groups = createInitialGroups([0, 1, 2, 3]);
    groups = mergeGroups(groups, 0, 1);
    expect(areInSameGroup(groups, 2, 3)).toBe(false);
    expect(areInSameGroup(groups, 0, 2)).toBe(false);
  });

  it("moving a group preserves relative offsets between its members", () => {
    const groups = mergeGroups(createInitialGroups([0, 1]), 0, 1);
    const positions: PositionMap = new Map([
      [0, { x: 0, y: 0, rotation: 0 }],
      [1, { x: 100, y: 0, rotation: 0 }],
    ]);
    const groupId = groups.get(0)!;
    const moved = moveGroupBy(positions, groups, groupId, 20, 5);

    const p0 = moved.get(0)!;
    const p1 = moved.get(1)!;
    expect(p1.x - p0.x).toBe(100); // relative offset unchanged
    expect(p0).toEqual({ x: 20, y: 5, rotation: 0 });
  });

  it("moving a group never moves a piece outside that group", () => {
    const groups = createInitialGroups([0, 1]); // not merged
    const positions: PositionMap = new Map([
      [0, { x: 0, y: 0, rotation: 0 }],
      [1, { x: 0, y: 0, rotation: 0 }],
    ]);
    const moved = moveGroupBy(positions, groups, groups.get(0)!, 50, 50);
    expect(moved.get(1)).toEqual({ x: 0, y: 0, rotation: 0 });
  });

  it("moveGroupSubsetBy only moves members that are also in the allowed set", () => {
    // Regression: a drag gesture that bridges two previously-separate, already-placed
    // clusters in one gesture must never drag the non-dragged cluster along with it —
    // only the pieces the user actually grabbed (`allowedPieceIds`) may move.
    const groups = mergeGroups(createInitialGroups([0, 1, 2]), 0, 1); // 0,1 merged; 2 joins below
    const merged = mergeGroups(groups, 1, 2); // simulate the engine's post-merge superset
    const positions: PositionMap = new Map([
      [0, { x: 0, y: 0, rotation: 0 }],
      [1, { x: 100, y: 0, rotation: 0 }],
      [2, { x: 200, y: 0, rotation: 0 }], // the stationary, already-placed piece
    ]);
    const groupId = merged.get(0)!;
    const moved = moveGroupSubsetBy(positions, merged, groupId, new Set([0, 1]), 20, 5);

    expect(moved.get(0)).toEqual({ x: 20, y: 5, rotation: 0 });
    expect(moved.get(1)).toEqual({ x: 120, y: 5, rotation: 0 });
    expect(moved.get(2)).toEqual({ x: 200, y: 0, rotation: 0 }); // untouched
  });

  it("rotating a group around its centroid rotates each member's own rotation and position", () => {
    const groups = mergeGroups(createInitialGroups([0, 1]), 0, 1);
    const positions: PositionMap = new Map([
      [0, { x: 0, y: 0, rotation: 0 }],
      [1, { x: 100, y: 0, rotation: 0 }],
    ]);
    const groupId = groups.get(0)!;
    const rotated = rotateGroupAround(positions, groups, groupId, 90, 50, 0);

    const p0 = rotated.get(0)!;
    const p1 = rotated.get(1)!;
    expect(p0.rotation).toBe(90);
    expect(p1.rotation).toBe(90);
    // (0,0) around center (50,0) by 90deg -> (50, -50)... verify via distance preserved
    expect(Math.hypot(p0.x - 50, p0.y - 0)).toBeCloseTo(50, 5);
    expect(Math.hypot(p1.x - 50, p1.y - 0)).toBeCloseTo(50, 5);
  });
});
