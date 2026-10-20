import { randomBytes, randomUUID } from "node:crypto";

/**
 * A cryptographically random, URL-safe, single-use auth transaction
 * token. 32 bytes (256 bits) of entropy — this IS the Firestore document
 * ID for its authTransactions/{token} record (see firestore.rules): an
 * attacker would have to guess it to read or (via the Telegram bot) ever
 * use it, which is computationally infeasible.
 */
export function generateAuthTransactionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Opaque, non-identifying marker the browser keeps locally to recognize "this is the transaction I started" in its own UI — not a security boundary (see authTransactions rules comment). */
export function generateSessionMarker(): string {
  return randomUUID();
}
