import { describe, expect, it } from "vitest";
import { generateAuthTransactionToken, generateSessionMarker } from "./token.js";

describe("generateAuthTransactionToken", () => {
  it("produces a long, URL-safe, unique token each call", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => generateAuthTransactionToken()));
    expect(tokens.size).toBe(1000); // no collisions across 1000 draws
    for (const token of tokens) {
      expect(token.length).toBeGreaterThanOrEqual(40);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe("generateSessionMarker", () => {
  it("produces a unique marker each call", () => {
    expect(generateSessionMarker()).not.toBe(generateSessionMarker());
  });
});
