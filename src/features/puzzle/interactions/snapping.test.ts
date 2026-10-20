import { describe, expect, it } from "vitest";
import { checkClassicSnap, checkFreeNeighborSnap, computeClassicProgress } from "./snapping";
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
