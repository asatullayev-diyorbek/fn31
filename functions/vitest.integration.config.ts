import { defineConfig } from "vitest/config";

/** Integration tests that talk to a running Firebase Emulator Suite (Firestore + Auth) via the Admin SDK. Run via `npm run test:integration`, normally wrapped in `firebase emulators:exec`. */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
