import { useCallback, useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { signInWithCustomToken } from "firebase/auth";
import { getFirebaseAuth, getFirebaseFirestore, getFirebaseFunctions } from "@/lib/firebase/client";
import { telegramBotUsername } from "@/app/config";
import type { AuthTransactionStatus } from "@/types/firestore";

export type LoginFlowState =
  | { step: "idle" }
  | { step: "waiting"; transactionId: string; expiresAtMs: number; deepLink: string }
  | { step: "signing-in" }
  | { step: "success" }
  | { step: "error"; message: string };

interface CreateAuthTransactionResponse {
  transactionId: string;
  sessionMarker: string;
  expiresAtMs: number;
}

interface CompleteAuthTransactionResponse {
  customToken: string;
}

/**
 * Drives the full login sequence described in docs/telegram-auth.md:
 * mint a transaction -> open the Telegram deep link -> listen to the
 * transaction doc for "verified" -> complete it -> sign in with the
 * returned custom token. The browser never decides *when* the
 * transaction is verified — it only reacts to what the trusted backend
 * already wrote.
 */
export function useTelegramLogin() {
  const [state, setState] = useState<LoginFlowState>({ step: "idle" });
  const unsubscribeRef = useRef<() => void>();

  useEffect(() => () => unsubscribeRef.current?.(), []);

  const start = useCallback(async () => {
    unsubscribeRef.current?.();
    // Opened synchronously, inside the click handler's call stack, so
    // browsers don't treat it as a blocked popup — its destination is
    // filled in once we know the transaction token, below.
    const pendingTab = window.open("about:blank", "_blank", "noopener,noreferrer");
    try {
      const createAuthTransaction = httpsCallable<void, CreateAuthTransactionResponse>(
        getFirebaseFunctions(),
        "createAuthTransactionCallable",
      );
      const { data } = await createAuthTransaction();
      const deepLink = `https://t.me/${telegramBotUsername}?start=${data.transactionId}`;
      setState({
        step: "waiting",
        transactionId: data.transactionId,
        expiresAtMs: data.expiresAtMs,
        deepLink,
      });

      if (pendingTab) {
        pendingTab.location.href = deepLink;
      }
      // If the popup was blocked, the UI still renders `deepLink` as a
      // clickable link/button for the user to open manually.

      const ref = doc(getFirebaseFirestore(), "authTransactions", data.transactionId);
      unsubscribeRef.current = onSnapshot(ref, async (snapshot) => {
        const status = snapshot.data()?.status as AuthTransactionStatus | undefined;
        if (status === "verified") {
          unsubscribeRef.current?.();
          setState({ step: "signing-in" });
          try {
            const completeAuthTransaction = httpsCallable<
              { transactionId: string },
              CompleteAuthTransactionResponse
            >(getFirebaseFunctions(), "completeAuthTransactionCallable");
            const result = await completeAuthTransaction({ transactionId: data.transactionId });
            await signInWithCustomToken(getFirebaseAuth(), result.data.customToken);
            setState({ step: "success" });
          } catch (error) {
            setState({ step: "error", message: messageFor(error) });
          }
        } else if (status === "expired" || status === "failed") {
          unsubscribeRef.current?.();
          setState({
            step: "error",
            message:
              status === "expired"
                ? "Havolaning muddati tugadi. Qaytadan urining."
                : "Kirish amalga oshmadi. Qaytadan urining.",
          });
        }
      });
    } catch (error) {
      pendingTab?.close();
      setState({ step: "error", message: messageFor(error) });
    }
  }, []);

  const reset = useCallback(() => {
    unsubscribeRef.current?.();
    setState({ step: "idle" });
  }, []);

  return { state, start, reset };
}

function messageFor(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Noma'lum xatolik yuz berdi.";
}
