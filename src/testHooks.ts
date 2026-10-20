/**
 * A small, explicitly dev-only surface for Playwright E2E tests
 * (see e2e/multiplayer.spec.ts) to drive sign-in and inspect rendered
 * puzzle state without re-implementing the real Telegram login flow in
 * every test (that flow has its own dedicated coverage — see
 * functions/tests/integration/authFlow.test.ts). Tree-shaken out of
 * production builds entirely: every call site is guarded by
 * `import.meta.env.DEV`, which Vite statically replaces with `false` for
 * `vite build`, so this module is never reachable (let alone included)
 * in what ships to users.
 */
import { signInWithCustomToken } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import type { PuzzleEngine } from "@/features/puzzle/engine/PuzzleEngine";

interface E2ETestHooks {
  signInWithCustomToken: (token: string) => Promise<void>;
  getPiecePosition: (pieceId: number) => { x: number; y: number; rotation: number } | undefined;
  getPieceScreenCenter: (pieceId: number) => { x: number; y: number } | undefined;
  _engine: PuzzleEngine | null;
}

declare global {
  interface Window {
    __e2e?: E2ETestHooks;
  }
}

export function installE2ETestHooksIfDev(): void {
  if (!import.meta.env.DEV) return;
  window.__e2e = {
    _engine: null,
    signInWithCustomToken: async (token) => {
      await signInWithCustomToken(getFirebaseAuth(), token);
    },
    getPiecePosition: (pieceId) => window.__e2e?._engine?.getPositions().get(pieceId),
    getPieceScreenCenter: (pieceId) => window.__e2e?._engine?.getPieceScreenCenter(pieceId),
  };
}

export function registerEngineForE2E(engine: PuzzleEngine | null): void {
  if (!import.meta.env.DEV || !window.__e2e) return;
  window.__e2e._engine = engine;
}
