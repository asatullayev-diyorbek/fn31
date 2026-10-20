import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
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
