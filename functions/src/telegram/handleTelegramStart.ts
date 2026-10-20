import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { canVerify, isExpired } from "../auth/transactionLogic.js";
import type { AuthTransaction } from "../shared/types.js";
import type { TelegramUser } from "./parseUpdate.js";

export type HandleStartResult =
  | { outcome: "verified" }
  | { outcome: "expired" }
  | { outcome: "already-used" }
  | { outcome: "not-found" };

/**
 * The single place a Telegram identity is ever written onto a pending
 * auth transaction. Runs inside a Firestore transaction so a redelivered
 * webhook (Telegram does occasionally retry) can never verify the same
 * token twice or race a legitimate first delivery.
 */
export async function handleTelegramStart(
  db: Firestore,
  token: string,
  telegramUser: TelegramUser,
  nowMs: number,
): Promise<HandleStartResult> {
  const ref = db.collection("authTransactions").doc(token);

  return db.runTransaction(async (tx): Promise<HandleStartResult> => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return { outcome: "not-found" };

    const data = snapshot.data() as AuthTransaction;
    if (canVerify(data, nowMs)) {
      tx.update(ref, {
        status: "verified",
        telegramUserId: String(telegramUser.id),
        telegramUsername: telegramUser.username ?? FieldValue.delete(),
        telegramFirstName: telegramUser.firstName,
        telegramLastName: telegramUser.lastName ?? FieldValue.delete(),
      });
      return { outcome: "verified" };
    }

    if (data.status === "pending" && isExpired(data, nowMs)) {
      tx.update(ref, { status: "expired", failureReason: "expired_before_verification" });
      return { outcome: "expired" };
    }

    return { outcome: "already-used" };
  });
}

/** Human-facing (Uzbek) reply text for each outcome — never echoes the token back. */
export function replyTextForOutcome(outcome: HandleStartResult["outcome"]): string {
  switch (outcome) {
    case "verified":
      return "Tasdiqlandi! Endi brauzeringizga qaytib, kirishni yakunlang.";
    case "expired":
      return "Ushbu kirish havolasining muddati tugagan. Iltimos, saytda qaytadan \"Telegram orqali kirish\" tugmasini bosing.";
    case "already-used":
      return "Ushbu kirish havolasi allaqachon ishlatilgan. Iltimos, saytda qaytadan kirish so'rovini yuboring.";
    case "not-found":
      return "Kirish havolasi topilmadi yoki yaroqsiz. Iltimos, saytdan qaytadan urinib ko'ring.";
  }
}
