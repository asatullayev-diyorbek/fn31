import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  // Cast needed because @vitejs/plugin-react resolves against the root
  // `vite` package while `vitest/config` re-exports its own bundled
  // `vite`'s types — two structurally-identical-but-nominally-distinct
  // `Plugin` types that don't satisfy each other at the type level only
  // (both are the real Vite plugin API at runtime). Purely a tooling-
  // config type wrinkle (tracked upstream in vitest/vite), not a runtime
  // issue — hence the narrow, explicit `unknown` cast rather than loosening
  // this file's types more broadly.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [react()] as unknown as any[],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    exclude: [
      "**/node_modules/**",
      "**/e2e/**",
      "**/functions/**",
      // Emulator-backed tests need a running Firebase Emulator Suite and
      // are run separately (npm run test:rules / test:sync / test:functions,
      // normally wrapped in `firebase emulators:exec`) — see
      // vitest.emulator.config.ts and IMPLEMENTATION_PLAN.md.
      "tests/rules/**",
      "tests/sync/**",
      "tests/functions/**",
    ],
  },
});
