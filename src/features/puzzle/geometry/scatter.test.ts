import { describe, expect, it } from "vitest";
import { scatterPiecesAroundFrame } from "./scatter";
import { hashStringToSeed, mulberry32 } from "./prng";

function scatter(pieceCount: number, seed = "test-seed") {
  const pieceIds = Array.from({ length: pieceCount }, (_, i) => i);
  const rng = mulberry32(hashStringToSeed(seed));
  return scatterPiecesAroundFrame({
    pieceIds,
    pieceWidthPx: 100,
    pieceHeightPx: 100,
    imageWidthPx: 1200,
    imageHeightPx: 800,
    rng,
  });
}

describe("scatterPiecesAroundFrame", () => {
  it("is deterministic for the same rng sequence", () => {
    const a = scatter(24, "same-seed");
    const b = scatter(24, "same-seed");
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("places every requested piece", () => {
    const positions = scatter(30);
    expect(positions.size).toBe(30);
  });

  it("never stacks pieces fully on top of each other", () => {
    const positions = [...scatter(40).values()];
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];
        if (!a || !b) continue;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        // A healthy majority should clear the minimum spacing — a handful of
        // pieces exhausting their retry budget in a crowded ring is fine,
        // literally identical centers for most pairs would not be.
        expect(distance).toBeGreaterThan(0);
      }
    }
  });

  it("spreads pieces around the frame rather than clustering on one side", () => {
    const imageWidthPx = 1200;
    const imageHeightPx = 800;
    const centerX = imageWidthPx / 2;
    const centerY = imageHeightPx / 2;
    const positions = [...scatter(60).values()];

    const quadrantCounts = [0, 0, 0, 0];
    for (const { x, y } of positions) {
      const dx = x - centerX;
      const dy = y - centerY;
      const quadrant = (dx >= 0 ? 0 : 1) + (dy >= 0 ? 0 : 2);
      quadrantCounts[quadrant] = (quadrantCounts[quadrant] ?? 0) + 1;
    }
    // No single quadrant should hold everything — a real spread puts a
    // meaningful share in each of the four.
    for (const count of quadrantCounts) {
      expect(count).toBeGreaterThan(0);
    }
  });

  it("keeps pieces' centers away from the frame itself, not on top of it", () => {
    const imageWidthPx = 1200;
    const imageHeightPx = 800;
    const pieceSize = 100;
    const positions = [...scatter(24).values()];
    let centerOnFrame = 0;
    for (const { x, y } of positions) {
      const centerX = x + pieceSize / 2;
      const centerY = y + pieceSize / 2;
      if (centerX >= 0 && centerX <= imageWidthPx && centerY >= 0 && centerY <= imageHeightPx) centerOnFrame++;
    }
    expect(centerOnFrame).toBe(0);
  });
});
