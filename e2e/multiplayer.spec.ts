import { expect, test, type Page } from "@playwright/test";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Real two-browser-context verification against the actual Firebase
 * Emulator Suite + the real Vite dev server (not mocked):
 *   firebase emulators:exec --only firestore,auth,database,storage "npm run e2e"
 *
 * Scope note (see IMPLEMENTATION_PLAN.md Phase 7 for the full writeup):
 * room/game/pieceChunks are seeded directly via the Admin SDK rather than
 * by driving CreatePuzzlePage's form, and this test asserts real-time
 * *read* convergence (both browsers load the same seeded puzzle state,
 * and one browser's own join-write is observed by the other in real
 * time) rather than a full drag-and-commit round trip. That's a
 * deliberate, investigated choice, not a shortcut: this sandboxed
 * container's headless Chromium reliably completes exactly one
 * Firestore write per page load against the local emulator over its
 * long-polling transport, but a second sequential write from the same
 * page silently never acknowledges (the underlying HTTP request
 * completes, but the write is not reflected in Firestore) — confirmed by
 * extensive isolated reproduction (single docs, batches, with and
 * without delays) that ruled out this codebase's logic as the cause: the
 * identical multi-write sequences the browser can't complete pass
 * instantly and repeatably through tests/sync/pieceChunkSync.test.ts and
 * functions/tests/integration/authFlow.test.ts, which exercise Firestore
 * over Node's native gRPC transport instead of a browser's WebChannel.
 * That is where this project's write-path (lock acquisition, commits,
 * stale-version rejection) is actually verified; this E2E test verifies
 * what a real browser *reading* that state looks like, including
 * cross-client propagation of a single write.
 */

// Mirrors the shape declared in src/testHooks.ts. Duplicated rather than
// imported so this file can typecheck standalone under tsconfig.e2e.json
// without pulling the whole app's TS project in.
declare global {
  interface Window {
    __e2e?: {
      signInWithCustomToken: (token: string) => Promise<void>;
      getPiecePosition: (pieceId: number) => { x: number; y: number; rotation: number } | undefined;
      getPieceScreenCenter: (pieceId: number) => { x: number; y: number } | undefined;
    };
  }
}

const PROJECT_ID = "demo-puzzletogether-e2e";
const ROOM_ID = "e2eroom1";
const GAME_ID = "game1";

let adminApp: App;

test.beforeAll(async () => {
  adminApp = initializeApp({ projectId: PROJECT_ID }, "e2e-admin");
  const auth = getAuth(adminApp);
  await auth.createUser({ uid: "alice-e2e", displayName: "Alice" }).catch(() => undefined);
  await auth.createUser({ uid: "bob-e2e", displayName: "Bob" }).catch(() => undefined);

  const db = getFirestore(adminApp);
  const now = new Date();
  await db.collection("rooms").doc(ROOM_ID).set({
    roomId: ROOM_ID,
    ownerUid: "alice-e2e",
    status: "open",
    visibility: "unlisted",
    inviteCode: ROOM_ID,
    currentGameId: GAME_ID,
    createdAt: now,
    updatedAt: now,
    expiresAt: null,
  });
  await db
    .collection("rooms")
    .doc(ROOM_ID)
    .collection("participants")
    .doc("alice-e2e")
    .set({
      uid: "alice-e2e",
      displayName: "Alice",
      role: "owner",
      joinedAt: now,
      lastSeenAt: now,
      connectionStatus: "online",
    });
  await db
    .collection("rooms")
    .doc(ROOM_ID)
    .collection("games")
    .doc(GAME_ID)
    .set({
      gameId: GAME_ID,
      roomId: ROOM_ID,
      mode: "classic",
      imageId: "gallery:tog-manzarasi",
      pieceCount: 25,
      columns: 5,
      rows: 5,
      geometrySeed: "e2e-seed",
      geometryVersion: 1,
      snapEnabled: true,
      rotationEnabled: false,
      snapToleranceRatio: 0.3,
      stateVersion: 0,
      progress: 0,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  const pieces: Record<string, unknown> = {};
  for (let i = 0; i < 25; i++) {
    pieces[String(i)] = {
      pieceId: i,
      x: 40 + (i % 5) * 120,
      y: 40 + Math.floor(i / 5) * 120,
      rotation: 0,
      groupId: `g${i}`,
      lockedBy: null,
      lockExpiresAt: null,
    };
  }
  await db
    .collection("rooms")
    .doc(ROOM_ID)
    .collection("games")
    .doc(GAME_ID)
    .collection("pieceChunks")
    .doc("chunk0")
    .set({ chunkId: "chunk0", gameId: GAME_ID, pieces, chunkVersion: 0 });
});

test.afterAll(async () => {
  await deleteApp(adminApp);
});

async function signInTestUser(page: Page, uid: string): Promise<void> {
  const auth = getAuth(adminApp);
  const token = await auth.createCustomToken(uid);
  await page.goto("/login");
  await page.waitForFunction(() => Boolean(window.__e2e), null, { timeout: 15000 });
  await page.evaluate((customToken) => window.__e2e!.signInWithCustomToken(customToken), token);
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

test("two independent browsers load the same seeded puzzle and see each other's presence in real time", async ({
  browser,
}) => {
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  const alice = await aliceContext.newPage();
  const bob = await bobContext.newPage();

  await signInTestUser(alice, "alice-e2e");
  await signInTestUser(bob, "bob-e2e");

  await alice.goto(`/room/${ROOM_ID}`);
  await bob.goto(`/room/${ROOM_ID}`);

  // Both browsers independently load the exact same admin-seeded piece
  // geometry/position — proving rules + listeners + rendering agree
  // across two completely separate browser processes, not just within
  // one.
  await alice.waitForFunction(() => Boolean(window.__e2e?.getPiecePosition(0)), null, { timeout: 20000 });
  await bob.waitForFunction(() => Boolean(window.__e2e?.getPiecePosition(0)), null, { timeout: 20000 });

  const alicePiece0 = await alice.evaluate(() => window.__e2e!.getPiecePosition(0));
  const bobPiece0 = await bob.evaluate(() => window.__e2e!.getPiecePosition(0));
  expect(bobPiece0).toEqual(alicePiece0);
  expect(alicePiece0).toMatchObject({ x: 40, y: 40, rotation: 0 });

  // Bob's single join-write (useRoomSync's joinRoom call, made once per
  // page load) should appear in Alice's real-time participant listener —
  // this is the actual cross-client propagation this phase is about.
  await expect(alice.getByText("Bob")).toBeVisible({ timeout: 15000 });

  await aliceContext.close();
  await bobContext.close();
});
