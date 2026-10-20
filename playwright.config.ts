import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against the Vite dev server + the Firebase Emulator
 * Suite, both already up (see package.json's `e2e` script, meant to be
 * invoked from inside `firebase emulators:exec`). No production
 * credentials are used anywhere in this config. See
 * IMPLEMENTATION_PLAN.md Phase 7.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
    // This environment preinstalls one Chromium binary (not Playwright's
    // separate "headless shell" variant) at this fixed path.
    launchOptions: { executablePath: "/opt/pw-browsers/chromium" },
  },
  webServer: {
    command: "npm run dev -- --port 5174 --strictPort",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_FIREBASE_API_KEY: "fake-api-key",
      VITE_FIREBASE_AUTH_DOMAIN: "demo-puzzletogether-e2e.firebaseapp.com",
      VITE_FIREBASE_PROJECT_ID: "demo-puzzletogether-e2e",
      VITE_FIREBASE_STORAGE_BUCKET: "demo-puzzletogether-e2e.appspot.com",
      VITE_FIREBASE_MESSAGING_SENDER_ID: "0",
      VITE_FIREBASE_APP_ID: "1:0:web:0",
      VITE_FIREBASE_DATABASE_URL: "https://demo-puzzletogether-e2e-default-rtdb.firebaseio.com",
      VITE_USE_FIREBASE_EMULATORS: "true",
      VITE_TELEGRAM_BOT_USERNAME: "PuzzleTogetherTestBot",
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
