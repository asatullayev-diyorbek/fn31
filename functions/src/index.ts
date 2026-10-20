import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { createAuthTransaction } from "./auth/createAuthTransaction.js";
import { completeAuthTransaction } from "./auth/completeAuthTransaction.js";
import { handleTelegramStart, replyTextForOutcome } from "./telegram/handleTelegramStart.js";
import { verifyTelegramWebhookSecret } from "./telegram/webhookSecurity.js";
import { extractChatId, extractTelegramUser, parseStartCommand } from "./telegram/parseUpdate.js";
import type { TelegramUpdate } from "./telegram/parseUpdate.js";

initializeApp();

/**
 * Secrets. Never read from `VITE_*`, never embedded in any file that
 * reaches the browser — see docs/telegram-auth.md "Secret management".
 * Configured via `firebase functions:secrets:set` against a real project
 * (see docs/deployment.md); genuinely blocked in this environment
 * without a human-created Telegram bot (IMPLEMENTATION_PLAN.md Phase 4).
 */
const telegramBotToken = defineSecret("TELEGRAM_BOT_TOKEN");
const telegramWebhookSecret = defineSecret("TELEGRAM_WEBHOOK_SECRET");

async function sendTelegramMessage(botToken: string, chatId: number, text: string): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!response.ok) {
    logger.error("telegram sendMessage failed", { status: response.status });
  }
}

export const createAuthTransactionCallable = onCall(
  { region: "us-central1" },
  async () => {
    const result = await createAuthTransaction(getFirestore(), Date.now());
    return {
      transactionId: result.transactionId,
      sessionMarker: result.sessionMarker,
      expiresAtMs: result.expiresAtMs,
    };
  },
);

export const completeAuthTransactionCallable = onCall(
  { region: "us-central1" },
  async (request) => {
    const transactionId = request.data?.transactionId;
    if (typeof transactionId !== "string" || transactionId.length === 0) {
      throw new HttpsError("invalid-argument", "transactionId is required");
    }

    const result = await completeAuthTransaction(getFirestore(), getAuth(), transactionId, Date.now());
    if (!result.ok) {
      const messages: Record<typeof result.reason, string> = {
        "not-found": "Kirish havolasi topilmadi.",
        "not-verified": "Telegram orqali tasdiqlash hali yakunlanmagan.",
        expired: "Kirish havolasining muddati tugagan.",
      };
      throw new HttpsError("failed-precondition", messages[result.reason]);
    }

    const customToken = await getAuth().createCustomToken(result.uid);
    return { customToken };
  },
);

export const telegramWebhook = onRequest(
  { region: "us-central1", secrets: [telegramBotToken, telegramWebhookSecret] },
  async (req, res) => {
    const headerSecret = req.get("X-Telegram-Bot-Api-Secret-Token");
    if (!verifyTelegramWebhookSecret(headerSecret, telegramWebhookSecret.value())) {
      logger.warn("telegramWebhook: rejected request with invalid/missing secret header");
      res.status(401).send("unauthorized");
      return;
    }

    const update = req.body as TelegramUpdate;
    const token = parseStartCommand(update);
    const telegramUser = extractTelegramUser(update);
    const chatId = extractChatId(update);

    if (!token || !telegramUser || chatId === null) {
      // Not a /start command we care about (could be any other message);
      // Telegram still expects a 200 so it doesn't keep retrying.
      res.status(200).send("ok");
      return;
    }

    const result = await handleTelegramStart(getFirestore(), token, telegramUser, Date.now());
    await sendTelegramMessage(telegramBotToken.value(), chatId, replyTextForOutcome(result.outcome));
    res.status(200).send("ok");
  },
);
