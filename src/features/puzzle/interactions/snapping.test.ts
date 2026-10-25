import { describe, expect, it } from "vitest";
import { checkClassicSnap, checkFreeNeighborSnap, computeClassicProgress, computeFreeProgress } from "./snapping";
import type { SnapConfig } from "./snapping";
import type { PositionMap } from "./groupModel";
import { generatePuzzleGeometry } from "@/features/puzzle/geometry";

const config: SnapConfig = {
  pieceWidth: 100,
  pieceHeight: 100,
  toleranceRatio: 0.3,
  rotationEnabled: true,
};

describe("checkClassicSnap", () => {
  const geometry = { pieceId: 5, row: 1, col: 2, outline: [], edges: {} as never, neighbors: {} };

  it("snaps when within tolerance and rotation is correct", () => {
    const result = checkClassicSnap({ x: 212, y: 95, rotation: 0 }, geometry, config);
    expect(result.snapped).toBe(true);
    expect(result.position).toEqual({ x: 200, y: 100, rotation: 0 });
  });

  it("does not snap when outside tolerance", () => {
    const result = checkClassicSnap({ x: 260, y: 100, rotation: 0 }, geometry, config);
    expect(result.snapped).toBe(false);
  });

  it("does not snap when rotation is required and wrong", () => {
    const result = checkClassicSnap({ x: 200, y: 100, rotation: 90 }, geometry, config);
    expect(result.snapped).toBe(false);
  });
});

describe("checkFreeNeighborSnap", () => {
  it("snaps a piece to its correct position relative to a right-side neighbor", () => {
    const positions: PositionMap = new Map([
      [1, { x: 500, y: 300, rotation: 0 }], // neighbor, fixed
      [2, { x: 610, y: 295, rotation: 0 }], // moved piece, close to correct right-of-1 slot
    ]);
    const result = checkFreeNeighborSnap(2, "left", 1, positions, config);
    expect(result.snapped).toBe(true);
    expect(result.position).toEqual({ x: 600, y: 300, rotation: 0 });
  });

  it("refuses to snap when rotations differ and rotation is enabled", () => {
    const positions: PositionMap = new Map([
      [1, { x: 500, y: 300, rotation: 0 }],
      [2, { x: 600, y: 300, rotation: 90 }],
    ]);
    const result = checkFreeNeighborSnap(2, "left", 1, positions, config);
    expect(result.snapped).toBe(false);
  });

  it("refuses to snap when far from the expected relative position", () => {
    const positions: PositionMap = new Map([
      [1, { x: 500, y: 300, rotation: 0 }],
      [2, { x: 900, y: 300, rotation: 0 }],
    ]);
    const result = checkFreeNeighborSnap(2, "left", 1, positions, config);
    expect(result.snapped).toBe(false);
  });
});

describe("computeClassicProgress", () => {
  it("is 0 when nothing is placed and 1 when every piece is in its correct slot", () => {
    const geometry = generatePuzzleGeometry({
      seed: "progress-test",
      geometryVersion: 1,
      pieceCount: 9,
      imageAspectRatio: 1,
    });
    const scrambled: PositionMap = new Map(
      geometry.pieces.map((p) => [p.pieceId, { x: 9999, y: 9999, rotation: 0 as const }]),
    );
    expect(computeClassicProgress(scrambled, geometry.pieces, config)).toBe(0);

    const solved: PositionMap = new Map(
      geometry.pieces.map((p) => [
        p.pieceId,
        { x: p.col * config.pieceWidth, y: p.row * config.pieceHeight, rotation: 0 as const },
      ]),
    );
    expect(computeClassicProgress(solved, geometry.pieces, config)).toBe(1);
  });
});

describe("computeFreeProgress", () => {
  const geometry = generatePuzzleGeometry({
    seed: "free-progress-test",
    geometryVersion: 1,
    pieceCount: 9,
    imageAspectRatio: 1,
  });
  // Any mutually-consistent relative layout counts as "solved" in Free mode — reusing
  // the classic grid coordinates is just a convenient one, not a requirement.
  const solved: PositionMap = new Map(
    geometry.pieces.map((p) => [p.pieceId, { x: p.col * config.pieceWidth, y: p.row * config.pieceHeight, rotation: 0 as const }]),
  );

  it("is 1 when every piece is correctly joined to its neighbors", () => {
    expect(computeFreeProgress(solved, geometry.pieces, config)).toBe(1);
  });

  it("is 0 when every piece is scattered far apart", () => {
    const scattered: PositionMap = new Map(
      geometry.pieces.map((p, i) => [p.pieceId, { x: i * 9999, y: i * 9999, rotation: 0 as const }]),
    );
    expect(computeFreeProgress(scattered, geometry.pieces, config)).toBe(0);
  });

  it("regression: a piece whose position is wrong is never reported as done, regardless of any group-id label", () => {
    // This is the exact bug reported in production: every piece shared one group id
    // (so a label-based check said 100%), but one piece's actual position didn't
    // match where its neighbors say it should be.
    const brokenPieceId = geometry.pieces[4]!.pieceId; // center piece of a 3x3 grid — has 4 neighbors
    const mutableSolved = new Map(solved);
    mutableSolved.set(brokenPieceId, { x: 99999, y: 99999, rotation: 0 });
    const positionsWithOneWrong: PositionMap = mutableSolved;

    expect(computeFreeProgress(positionsWithOneWrong, geometry.pieces, config)).toBeLessThan(1);

    // Neither the displaced piece nor any of its would-be neighbors should count as "done".
    const brokenGeometry = geometry.pieces.find((p) => p.pieceId === brokenPieceId)!;
    const affectedCount = 1 + Object.values(brokenGeometry.neighbors).filter((id) => id !== undefined).length;
    const correctCount = Math.round(computeFreeProgress(positionsWithOneWrong, geometry.pieces, config) * geometry.pieces.length);
    expect(correctCount).toBe(geometry.pieces.length - affectedCount);
  });
});
