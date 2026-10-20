import { describe, expect, it } from "vitest";
import { PIECES_PER_CHUNK, chunkIdForPiece, chunkIdsForPieceCount, chunkIndexForPiece } from "./chunking";

describe("chunking", () => {
  it("assigns consecutive pieces to the same chunk until the chunk size is reached", () => {
    expect(chunkIndexForPiece(0)).toBe(0);
    expect(chunkIndexForPiece(PIECES_PER_CHUNK - 1)).toBe(0);
    expect(chunkIndexForPiece(PIECES_PER_CHUNK)).toBe(1);
    expect(chunkIdForPiece(0)).toBe("chunk0");
    expect(chunkIdForPiece(PIECES_PER_CHUNK)).toBe("chunk1");
  });

  it("computes exactly enough chunk ids to cover the full piece count", () => {
    expect(chunkIdsForPieceCount(25).length).toBe(1);
    expect(chunkIdsForPieceCount(PIECES_PER_CHUNK).length).toBe(1);
    expect(chunkIdsForPieceCount(PIECES_PER_CHUNK + 1).length).toBe(2);
    expect(chunkIdsForPieceCount(500).length).toBe(Math.ceil(500 / PIECES_PER_CHUNK));
  });
});
