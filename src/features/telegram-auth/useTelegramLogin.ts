import { useCallback, useEffect, useRef, useState } from "react";
import { api, setToken } from "@/lib/api";
import { telegramBotUsername } from "@/app/config";

export type LoginFlowState = { step: "idle" } | { step: "waiting"; transactionId: string; expiresAtMs: number; deepLink: string } | { step: "signing-in" } | { step: "success" } | { step: "error"; message: string };
export function useTelegramLogin() {
  const [state, setState] = useState<LoginFlowState>({ step: "idle" }); const timer = useRef<number>();
  const clear = () => { if (timer.current) window.clearInterval(timer.current); };
  useEffect(() => clear, []);
  const start = useCallback(async () => { clear(); const tab = window.open("about:blank", "_blank", "noopener,noreferrer"); try { const data = await api<{ transactionId: string; expiresAtMs: number }>("/api/auth/transactions", { method: "POST" }); if (!telegramBotUsername) throw new Error("Telegram bot username hali server konfiguratsiyasiga kiritilmagan."); const deepLink = `https://t.me/${telegramBotUsername}?start=${data.transactionId}`; setState({ step: "waiting", ...data, deepLink }); if (tab) tab.location.href = deepLink; timer.current = window.setInterval(() => { void api<{ status: string }>(`/api/auth/transactions/${data.transactionId}`).then(async (current) => { if (current.status === "verified") { clear(); setState({ step: "signing-in" }); const complete = await api<{ token: string }>(`/api/auth/transactions/${data.transactionId}/complete`, { method: "POST" }); setToken(complete.token); setState({ step: "success" }); window.location.assign("/dashboard"); } else if (current.status === "expired" || current.status === "failed") { clear(); setState({ step: "error", message: "Havolaning muddati tugadi. Qaytadan urining." }); } }).catch(() => undefined); }, 1500); } catch (error) { tab?.close(); setState({ step: "error", message: error instanceof Error ? error.message : "Kirishda xatolik yuz berdi." }); } }, []);
  const reset = useCallback(() => { clear(); setState({ step: "idle" }); }, []);
  return { state, start, reset };
}
