import type { Firestore } from "firebase-admin/firestore";
import { Timestamp } from "firebase-admin/firestore";
import { generateAuthTransactionToken, generateSessionMarker } from "./token.js";
import { AUTH_TRANSACTION_TTL_MS } from "./transactionLogic.js";

export interface CreatedAuthTransaction {
  transactionId: string;
  sessionMarker: string;
  expiresAtMs: number;
}

/**
 * The only place an authTransactions/{id} document is ever created. The
 * token (== the document id) never reaches any log line beyond this
 * write, and is returned to the caller exactly once.
 */
export async function createAuthTransaction(
  db: Firestore,
  nowMs: number,
): Promise<CreatedAuthTransaction> {
  const transactionId = generateAuthTransactionToken();
  const sessionMarker = generateSessionMarker();
  const expiresAtMs = nowMs + AUTH_TRANSACTION_TTL_MS;

  await db.collection("authTransactions").doc(transactionId).create({
    status: "pending",
    createdAt: Timestamp.fromMillis(nowMs),
    expiresAt: Timestamp.fromMillis(expiresAtMs),
    sessionMarker,
  });

  return { transactionId, sessionMarker, expiresAtMs };
}
