import { timingSafeEqual } from "node:crypto";

/**
 * Verifies Telegram's `X-Telegram-Bot-Api-Secret-Token` header using a
 * constant-time comparison, so response-timing can't leak how many
 * leading bytes matched. The secret itself is configured only on the
 * Cloud Functions side (see docs/telegram-auth.md) — never trust an
 * HTTP request just because it claims to be from Telegram.
 */
export function verifyTelegramWebhookSecret(
  headerValue: string | undefined,
  expectedSecret: string,
): boolean {
  if (!headerValue || !expectedSecret) return false;
  const headerBuffer = Buffer.from(headerValue);
  const expectedBuffer = Buffer.from(expectedSecret);
  if (headerBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(headerBuffer, expectedBuffer);
}
