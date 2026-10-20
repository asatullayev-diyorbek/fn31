import { describe, expect, it } from "vitest";
import { canAcquireLock, isLockHeld } from "./pieceLock";

function timestamp(ms: number) {
  return { toMillis: () => ms };
}

describe("isLockHeld", () => {
  it("is false when unlocked", () => {
    expect(isLockHeld({ lockedBy: null, lockExpiresAt: null }, 1000)).toBe(false);
  });

  it("is true while the lease is unexpired, false after it passes", () => {
    const entity = { lockedBy: "alice", lockExpiresAt: timestamp(2000) };
    expect(isLockHeld(entity, 1000)).toBe(true);
    expect(isLockHeld(entity, 2500)).toBe(false);
  });
});

describe("canAcquireLock", () => {
  it("lets anyone acquire an unlocked or expired lock", () => {
    expect(canAcquireLock({ lockedBy: null, lockExpiresAt: null }, "bob", 1000)).toBe(true);
    expect(canAcquireLock({ lockedBy: "alice", lockExpiresAt: timestamp(500) }, "bob", 1000)).toBe(true);
  });

  it("lets the current holder re-acquire (e.g. extend) their own lock", () => {
    expect(canAcquireLock({ lockedBy: "alice", lockExpiresAt: timestamp(2000) }, "alice", 1000)).toBe(true);
  });

  it("never lets someone else take an actively-held lock (no conflicting manipulation)", () => {
    expect(canAcquireLock({ lockedBy: "alice", lockExpiresAt: timestamp(2000) }, "bob", 1000)).toBe(false);
  });
});
