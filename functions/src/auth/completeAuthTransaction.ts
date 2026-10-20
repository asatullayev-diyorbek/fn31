import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { canComplete, isExpired } from "./transactionLogic.js";
import { linkTelegramIdentity } from "./identityLinking.js";
import type { AuthTransaction } from "../shared/types.js";

export type CompleteAuthTransactionResult =
  | { ok: true; uid: string }
  | { ok: false; reason: "not-found" | "not-verified" | "expired" };

/**
 * Turns a *verified* transaction (telegramUserId already set by the
 * trusted webhook handler) into a linked Firebase user + a uid the
 * caller can mint a custom token for. Safe to retry: a transaction that
 * is already `completed` returns the same uid again rather than erroring
 * or creating a second account (see identityLinking.ts for how the
 * create-vs-link race itself is closed).
 */
export async function completeAuthTransaction(
  db: Firestore,
  auth: Auth,
  transactionId: string,
  nowMs: number,
): Promise<CompleteAuthTransactionResult> {
  const ref = db.collection("authTransactions").doc(transactionId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return { ok: false, reason: "not-found" };

  const data = snapshot.data() as AuthTransaction;

  if (data.status === "completed" && data.uid) {
    return { ok: true, uid: data.uid };
  }

  if (!canComplete(data, nowMs)) {
    if (data.status === "verified" && isExpired(data, nowMs)) {
      await ref.update({ status: "expired", failureReason: "expired_before_completion" });
      return { ok: false, reason: "expired" };
    }
    return { ok: false, reason: "not-verified" };
  }

  if (!data.telegramUserId || !data.telegramFirstName) {
    return { ok: false, reason: "not-verified" };
  }

  const { uid } = await linkTelegramIdentity(db, auth, {
    id: Number(data.telegramUserId),
    username: data.telegramUsername,
    firstName: data.telegramFirstName,
    lastName: data.telegramLastName,
  });

  // Re-checked transactionally so two near-simultaneous completion calls
  // for the same transaction never both think they "won" — whichever
  // commits second sees status already 'completed' and no-ops.
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    if ((fresh.data() as AuthTransaction | undefined)?.status === "completed") return;
    tx.update(ref, { status: "completed", uid });
  });

  return { ok: true, uid };
}
