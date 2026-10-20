import { describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { canComplete, canVerify, isExpired } from "./transactionLogic.js";

const NOW = 1_700_000_000_000;

describe("isExpired", () => {
  it("is false before expiresAt and true at/after it", () => {
    expect(isExpired({ expiresAt: Timestamp.fromMillis(NOW + 1000) }, NOW)).toBe(false);
    expect(isExpired({ expiresAt: Timestamp.fromMillis(NOW) }, NOW)).toBe(true);
    expect(isExpired({ expiresAt: Timestamp.fromMillis(NOW - 1000) }, NOW)).toBe(true);
  });
});

describe("canVerify", () => {
  it("is only true for a pending, unexpired transaction", () => {
    expect(canVerify({ status: "pending", expiresAt: Timestamp.fromMillis(NOW + 1000) }, NOW)).toBe(true);
    expect(canVerify({ status: "pending", expiresAt: Timestamp.fromMillis(NOW - 1000) }, NOW)).toBe(false);
    expect(canVerify({ status: "verified", expiresAt: Timestamp.fromMillis(NOW + 1000) }, NOW)).toBe(false);
    expect(canVerify({ status: "completed", expiresAt: Timestamp.fromMillis(NOW + 1000) }, NOW)).toBe(false);
  });
});

describe("canComplete", () => {
  it("is only true for a verified, unexpired transaction", () => {
    expect(canComplete({ status: "verified", expiresAt: Timestamp.fromMillis(NOW + 1000) }, NOW)).toBe(true);
    expect(canComplete({ status: "pending", expiresAt: Timestamp.fromMillis(NOW + 1000) }, NOW)).toBe(false);
    expect(canComplete({ status: "completed", expiresAt: Timestamp.fromMillis(NOW + 1000) }, NOW)).toBe(false);
    expect(canComplete({ status: "verified", expiresAt: Timestamp.fromMillis(NOW - 1) }, NOW)).toBe(false);
  });

  it("never allows completing an already-completed transaction (replay protection)", () => {
    expect(canComplete({ status: "completed", expiresAt: Timestamp.fromMillis(NOW + 100000) }, NOW)).toBe(false);
  });
});
