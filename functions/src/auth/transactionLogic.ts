import type { AuthTransaction } from "../shared/types.js";

export const AUTH_TRANSACTION_TTL_MS = 5 * 60 * 1000;

export function isExpired(transaction: Pick<AuthTransaction, "expiresAt">, nowMs: number): boolean {
  return transaction.expiresAt.toMillis() <= nowMs;
}

/** Pure state-machine check: can this transaction currently be marked verified by the webhook handler? */
export function canVerify(transaction: Pick<AuthTransaction, "status" | "expiresAt">, nowMs: number): boolean {
  return transaction.status === "pending" && !isExpired(transaction, nowMs);
}

/** Pure state-machine check: can this transaction currently be completed (custom token issued)? */
export function canComplete(transaction: Pick<AuthTransaction, "status" | "expiresAt">, nowMs: number): boolean {
  return transaction.status === "verified" && !isExpired(transaction, nowMs);
}
