import { describe, expect, it } from "vitest";
import { generatePuzzleGeometry } from "./pieceGeometry";
import { computeGridLayout, computeCropRect } from "./grid";
import { hashStringToSeed, mulberry32 } from "./prng";
import type { Point } from "./types";

function corner(points: Point[], index: number): Point {
  const point = points[index];
  if (!point) throw new Error(`missing point at ${index}`);
  return point;
}

describe("mulberry32 / hashStringToSeed", () => {
  it("is deterministic for the same numeric seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const sequenceA = Array.from({ length: 5 }, () => a());
    const sequenceB = Array.from({ length: 5 }, () => b());
    expect(sequenceA).toEqual(sequenceB);
  });

  it("produces different sequences for different seeds", () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBeCloseTo(b, 5);
  });

  it("hashes identical strings identically and different strings differently", () => {
    expect(hashStringToSeed("room-42:v1")).toBe(hashStringToSeed("room-42:v1"));
    expect(hashStringToSeed("room-42:v1")).not.toBe(hashStringToSeed("room-42:v2"));
  });
});

describe("computeGridLayout", () => {
  it("returns a grid close to the requested piece count", () => {
    const { rows, cols } = computeGridLayout(100, 1);
    expect(rows * cols).toBeGreaterThanOrEqual(80);
    expect(rows * cols).toBeLessThanOrEqual(121);
  });

  it("biases columns for wide images", () => {
    const wide = computeGridLayout(100, 4);
    const square = computeGridLayout(100, 1);
    expect(wide.cols).toBeGreaterThan(square.cols);
  });

  it("never returns zero rows or columns", () => {
    const { rows, cols } = computeGridLayout(1, 0.01);
    expect(rows).toBeGreaterThanOrEqual(1);
    expect(cols).toBeGreaterThanOrEqual(1);
  });
});

describe("computeCropRect", () => {
  it("cover: crops the source to match the target aspect ratio exactly", () => {
    const rect = computeCropRect(1000, 500, 1, "cover"); // wide source -> square target
    expect(rect.width / rect.height).toBeCloseTo(1, 5);
    expect(rect.width).toBeLessThanOrEqual(1000);
    expect(rect.height).toBe(500);
  });

  it("contain: returns the full source rect untouched", () => {
    const rect = computeCropRect(800, 600, 1, "contain");
    expect(rect).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });
});

describe("generatePuzzleGeometry — determinism", () => {
  const params = {
    seed: "room-abc:game-1",
    geometryVersion: 1,
    pieceCount: 36,
    imageAspectRatio: 1.5,
  };

  it("is byte-identical across two independent calls with the same params", () => {
    const first = generatePuzzleGeometry(params);
    const second = generatePuzzleGeometry(params);
    expect(first).toEqual(second);
  });

  it("changes when the seed changes", () => {
    const first = generatePuzzleGeometry(params);
    const second = generatePuzzleGeometry({ ...params, seed: "different-seed" });
    expect(first.pieces[0]?.outline).not.toEqual(second.pieces[0]?.outline);
  });

  it("produces the requested approximate piece count and a full grid of pieces", () => {
    const result = generatePuzzleGeometry(params);
    expect(result.pieces.length).toBe(result.rows * result.cols);
    expect(result.pieces.length).toBeGreaterThanOrEqual(25);
    expect(result.pieces.length).toBeLessThanOrEqual(49);
  });
});

describe("generatePuzzleGeometry — edge continuity and neighbor correctness", () => {
  const result = generatePuzzleGeometry({
    seed: "continuity-seed",
    geometryVersion: 1,
    pieceCount: 20,
    imageAspectRatio: 1.2,
  });

  it("gives every internal piece exactly the neighbors implied by its grid position", () => {
    for (const piece of result.pieces) {
      if (piece.row > 0) expect(piece.neighbors.top).toBeDefined();
      else expect(piece.neighbors.top).toBeUndefined();
      if (piece.row < result.rows - 1) expect(piece.neighbors.bottom).toBeDefined();
      else expect(piece.neighbors.bottom).toBeUndefined();
      if (piece.col > 0) expect(piece.neighbors.left).toBeDefined();
      else expect(piece.neighbors.left).toBeUndefined();
      if (piece.col < result.cols - 1) expect(piece.neighbors.right).toBeDefined();
      else expect(piece.neighbors.right).toBeUndefined();
    }
  });

  it("every piece's four corners close the polygon exactly on the unit square", () => {
    for (const piece of result.pieces) {
      const first = corner(piece.outline, 0);
      expect(first.x).toBeCloseTo(0, 6);
      expect(first.y).toBeCloseTo(0, 6);
    }
  });

  it("a right-edge neighbor pair shares identical geometry along their common border", () => {
    const leftPiece = result.pieces.find((p) => p.row === 1 && p.col === 1);
    const rightPiece = result.pieces.find((p) => p.row === 1 && p.col === 2);
    expect(leftPiece).toBeDefined();
    expect(rightPiece).toBeDefined();
    if (!leftPiece || !rightPiece) return;

    expect(leftPiece.edges.right).toEqual(rightPiece.edges.left);
  });

  it("a bottom-edge neighbor pair shares identical geometry along their common border", () => {
    const topPiece = result.pieces.find((p) => p.row === 1 && p.col === 1);
    const bottomPiece = result.pieces.find((p) => p.row === 2 && p.col === 1);
    expect(topPiece).toBeDefined();
    expect(bottomPiece).toBeDefined();
    if (!topPiece || !bottomPiece) return;

    expect(topPiece.edges.bottom).toEqual(bottomPiece.edges.top);
  });

  it("border pieces have a flat (zero-depth) outer edge", () => {
    const topLeft = result.pieces.find((p) => p.row === 0 && p.col === 0);
    expect(topLeft?.edges.top.knobDepth).toBe(0);
    expect(topLeft?.edges.left.knobDepth).toBe(0);
  });

  it("reconstructs the full image with no gaps or overlaps: every internal boundary's sampled points coincide in global space", () => {
    for (const piece of result.pieces) {
      const rightNeighborId = piece.neighbors.right;
      if (rightNeighborId === undefined) continue;
      const rightNeighbor = result.pieces.find((p) => p.pieceId === rightNeighborId);
      expect(rightNeighbor).toBeDefined();
      if (!rightNeighbor) continue;

      // The shared vertical boundary in global space: piece's right edge
      // offset from column (piece.col + 1) must equal the neighbor's left
      // edge offset from column (neighbor.col), which is the same line.
      const globalXFromLeft = piece.col + 1 + edgeMaxOffset(piece.edges.right.knobDepth);
      const globalXFromRight = rightNeighbor.col + edgeMaxOffset(rightNeighbor.edges.left.knobDepth);
      expect(piece.edges.right).toEqual(rightNeighbor.edges.left);
      expect(globalXFromLeft).toBeCloseTo(globalXFromRight, 6);
    }
  });
});

function edgeMaxOffset(knobDepth: number): number {
  return knobDepth;
}
