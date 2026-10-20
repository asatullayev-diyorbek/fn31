import { defineConfig } from "vitest/config";

/**
 * Separate config for tests that talk to a *running* Firebase Emulator
 * Suite (security rules, synchronization, Cloud Functions logic). Never
 * run via plain `npm test` — always via the dedicated npm scripts, which
 * are meant to be wrapped in `firebase emulators:exec` so the emulators
 * are guaranteed to be up for the duration of the run. See
 * IMPLEMENTATION_PLAN.md Phases 4-6.
 */
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/rules/**/*.test.ts", "tests/sync/**/*.test.ts", "tests/functions/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
