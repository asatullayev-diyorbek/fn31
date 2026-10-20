import { describe, expect, it } from "vitest";
import { verifyTelegramWebhookSecret } from "./webhookSecurity.js";

describe("verifyTelegramWebhookSecret", () => {
  it("accepts the exact configured secret", () => {
    expect(verifyTelegramWebhookSecret("correct-secret", "correct-secret")).toBe(true);
  });

  it("rejects a missing header, wrong value, or empty configured secret", () => {
    expect(verifyTelegramWebhookSecret(undefined, "correct-secret")).toBe(false);
    expect(verifyTelegramWebhookSecret("wrong", "correct-secret")).toBe(false);
    expect(verifyTelegramWebhookSecret("correct-secret", "")).toBe(false);
  });

  it("never throws on a different-length header (a naive compare would still be safe, but length must be checked before timingSafeEqual)", () => {
    expect(() => verifyTelegramWebhookSecret("short", "a-much-longer-secret-value")).not.toThrow();
    expect(verifyTelegramWebhookSecret("short", "a-much-longer-secret-value")).toBe(false);
  });
});
