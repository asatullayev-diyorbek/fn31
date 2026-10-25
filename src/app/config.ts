/**
 * All values here are read from Vite's public `import.meta.env`. Nothing in
 * this file is a secret — see .env.example and docs/security.md.
 */
function readEnv(key: string): string {
  const value = import.meta.env[key as keyof ImportMetaEnv];
  return typeof value === "string" ? value : "";
}

export const firebaseConfig = {
  apiKey: readEnv("VITE_FIREBASE_API_KEY"),
  authDomain: readEnv("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: readEnv("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: readEnv("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: readEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: readEnv("VITE_FIREBASE_APP_ID"),
  databaseURL: readEnv("VITE_FIREBASE_DATABASE_URL"),
};

export const appCheckSiteKey = readEnv("VITE_APP_CHECK_SITE_KEY");
export const telegramBotUsername = readEnv("VITE_TELEGRAM_BOT_USERNAME");
export const useFirebaseEmulators =
  readEnv("VITE_USE_FIREBASE_EMULATORS") === "true";

/** False until a real (or emulator-pointed) Firebase project is configured via .env — see .env.example. */
export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

export const PUZZLE_PIECE_COUNT_MIN = 20;
export const PUZZLE_PIECE_COUNT_MAX = 100;
export const AUTH_TRANSACTION_TTL_MS = 5 * 60 * 1000;
export const PIECE_LOCK_LEASE_MS = 15 * 1000;
export const LIVE_DRAG_THROTTLE_MS = 50; // ~20 Hz ceiling, see docs/websocket-or-realtime.md
