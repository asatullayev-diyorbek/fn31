import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import { useTelegramLogin } from "./useTelegramLogin";
import styles from "./LoginPage.module.css";

export function LoginPage(): JSX.Element {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { state, start, reset } = useTelegramLogin();
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (state.step !== "waiting") {
      setSecondsLeft(null);
      return;
    }
    const tick = () => setSecondsLeft(Math.max(0, Math.round((state.expiresAtMs - Date.now()) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [state]);

  if (!loading && user) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? "/dashboard";
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <div className={styles.page}>
      <div className={`card ${styles.card}`}>
        <span className={styles.telegramMark} aria-hidden="true">✈</span>
        <h1>Hisobga kirish</h1>
        <p className={styles.subtitle}>
          Kirish va ro&apos;yxatdan o&apos;tish bir xil — faqat Telegram orqali.
        </p>

        {state.step === "idle" || state.step === "error" ? (
          <>
            <button type="button" className="btn btn-primary" onClick={start}>
              <span aria-hidden="true">✈</span> Telegram orqali kirish
            </button>
            {state.step === "error" && (
              <p role="alert" className={styles.error}>
                {state.message}
              </p>
            )}
          </>
        ) : null}

        {state.step === "waiting" && (
          <div className={styles.waiting}>
            <p>Telegram&apos;da ochilgan oynada &quot;Start&quot; tugmasini bosing.</p>
            <a
              className="btn btn-secondary"
              href={state.deepLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              Telegram botni ochish
            </a>
            <p className={styles.countdown} role="status" aria-live="polite">
              {secondsLeft !== null && secondsLeft > 0
                ? `Havola ${secondsLeft} soniyadan so'ng tugaydi.`
                : "Havolaning muddati tugadi."}
            </p>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Bekor qilish
            </button>
          </div>
        )}

        {state.step === "signing-in" && <p role="status">Kirish yakunlanmoqda…</p>}
        {state.step === "success" && <p role="status">Muvaffaqiyatli kirdingiz!</p>}
      </div>
    </div>
  );
}
