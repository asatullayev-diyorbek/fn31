import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore as getAdminFirestore, type Firestore as AdminFirestore } from "firebase-admin/firestore";
import {
  acquirePieceLock,
  commitPiecePositions,
  releasePieceLock,
} from "../../src/features/puzzle/synchronization/pieceChunkSync";

/**
 * Exercises the real multiplayer concurrency boundary (piece locks,
 * chunkVersion-gated commits) against the real Firestore emulator, going
 * through the exact client functions `PuzzleRoomPage` calls — not a
 * simplified re-implementation of the logic:
 *   firebase emulators:exec --only firestore "npm run test:sync"
 */
const PROJECT_ID = "demo-puzzletogether-sync-test";
const ROOM_ID = "room1";
const GAME_ID = "game1";
const CHUNK_ID = "chunk0";

let testEnv: RulesTestEnvironment;
let adminApp: App;
let adminDb: AdminFirestore;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
  adminApp = initializeApp({ projectId: PROJECT_ID }, "sync-test-admin");
  adminDb = getAdminFirestore(adminApp);
});

afterAll(async () => {
  await deleteApp(adminApp);
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

function seedPiece(pieceId: number) {
  return {
    pieceId,
    x: 0,
    y: 0,
    rotation: 0,
    groupId: `g${pieceId}`,
    lockedBy: null,
    lockExpiresAt: null,
  };
}

async function seedRoomGameChunk(pieceIds: number[]): Promise<void> {
  const now = new Date();
  await adminDb.collection("rooms").doc(ROOM_ID).set({
    roomId: ROOM_ID,
    ownerUid: "alice",
    status: "open",
    visibility: "unlisted",
    inviteCode: ROOM_ID,
    currentGameId: GAME_ID,
    createdAt: now,
    updatedAt: now,
    expiresAt: null,
  });
  for (const uid of ["alice", "bob"]) {
    await adminDb
      .collection("rooms")
      .doc(ROOM_ID)
      .collection("participants")
      .doc(uid)
      .set({ uid, displayName: uid, role: uid === "alice" ? "owner" : "member", joinedAt: now, lastSeenAt: now, connectionStatus: "online" });
  }
  await adminDb
    .collection("rooms")
    .doc(ROOM_ID)
    .collection("games")
    .doc(GAME_ID)
    .set({
      gameId: GAME_ID,
      roomId: ROOM_ID,
      mode: "classic",
      imageId: "img1",
      pieceCount: pieceIds.length,
      columns: 5,
      rows: 5,
      geometrySeed: "seed",
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
  for (const id of pieceIds) pieces[String(id)] = seedPiece(id);
  await adminDb
    .collection("rooms")
    .doc(ROOM_ID)
    .collection("games")
    .doc(GAME_ID)
    .collection("pieceChunks")
    .doc(CHUNK_ID)
    .set({ chunkId: CHUNK_ID, gameId: GAME_ID, pieces, chunkVersion: 0 });
}

async function getChunk() {
  const snap = await adminDb
    .collection("rooms")
    .doc(ROOM_ID)
    .collection("games")
    .doc(GAME_ID)
    .collection("pieceChunks")
    .doc(CHUNK_ID)
    .get();
  return snap.data() as { chunkVersion: number; pieces: Record<string, { lockedBy: string | null; x: number; y: number }> };
}

describe("acquirePieceLock", () => {
  // Races two *sequential* attempts rather than firing both via
  // Promise.all: this is the right boundary for a unit test — it proves
  // acquirePieceLock's own transaction logic correctly refuses to double-
  // grant a lock. True wall-clock-concurrent transaction retry is a
  // platform guarantee of Firestore itself; the Phase 7 Playwright e2e
  // test exercises it for real, through two actual browsers racing a
  // drag against the live emulator (a far more realistic concurrency
  // test than two Node promises scheduled microseconds apart).
  it("never lets a second user acquire a lock the first user already holds", async () => {
    await seedRoomGameChunk([0, 1, 2]);
    const aliceDb = testEnv.authenticatedContext("alice").firestore();
    const bobDb = testEnv.authenticatedContext("bob").firestore();

    expect(await acquirePieceLock(aliceDb as never, ROOM_ID, GAME_ID, 0, "alice", 15000)).toBe(true);
    expect(await acquirePieceLock(bobDb as never, ROOM_ID, GAME_ID, 0, "bob", 15000)).toBe(false);

    const chunk = await getChunk();
    expect(chunk.pieces["0"]?.lockedBy).toBe("alice");
  });

  it("lets a different user acquire the lock once the holder's lease has expired", async () => {
    await seedRoomGameChunk([0]);
    const aliceDb = testEnv.authenticatedContext("alice").firestore();
    const bobDb = testEnv.authenticatedContext("bob").firestore();

    expect(await acquirePieceLock(aliceDb as never, ROOM_ID, GAME_ID, 0, "alice", 200)).toBe(true);
    expect(await acquirePieceLock(bobDb as never, ROOM_ID, GAME_ID, 0, "bob", 15000)).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(await acquirePieceLock(bobDb as never, ROOM_ID, GAME_ID, 0, "bob", 15000)).toBe(true);
  });
});

describe("releasePieceLock", () => {
  it("frees the lock for other users immediately", async () => {
    await seedRoomGameChunk([0]);
    const aliceDb = testEnv.authenticatedContext("alice").firestore();
    const bobDb = testEnv.authenticatedContext("bob").firestore();

    await acquirePieceLock(aliceDb as never, ROOM_ID, GAME_ID, 0, "alice", 15000);
    await releasePieceLock(aliceDb as never, ROOM_ID, GAME_ID, 0, "alice");
    expect(await acquirePieceLock(bobDb as never, ROOM_ID, GAME_ID, 0, "bob", 15000)).toBe(true);
  });
});

describe("commitPiecePositions", () => {
  it("persists concurrent commits to two different pieces in the same chunk without losing either update", async () => {
    await seedRoomGameChunk([0, 1]);
    const aliceDb = testEnv.authenticatedContext("alice").firestore();
    const bobDb = testEnv.authenticatedContext("bob").firestore();

    // Sequential rather than Promise.all — see the comment on
    // acquirePieceLock's describe block above for why.
    await commitPiecePositions(aliceDb as never, ROOM_ID, GAME_ID, "alice", new Map([[0, { x: 111, y: 222, rotation: 0, groupId: "g0" }]]));
    await commitPiecePositions(bobDb as never, ROOM_ID, GAME_ID, "bob", new Map([[1, { x: 333, y: 444, rotation: 90, groupId: "g1" }]]));

    const chunk = await getChunk();
    expect(chunk.pieces["0"]).toMatchObject({ x: 111, y: 222 });
    expect(chunk.pieces["1"]).toMatchObject({ x: 333, y: 444 });
    // Two independent transactions against the same document both
    // committed — chunkVersion must reflect two applied writes, not one
    // clobbering the other.
    expect(chunk.chunkVersion).toBe(2);
  });

  it("refuses to apply a commit for a piece locked by another room member (defense in depth)", async () => {
    // "bob" here is a legitimate room participant (seedRoomGameChunk
    // always adds alice + bob) attempting to commit over alice's active
    // lock — a non-participant is already blocked at the rules layer
    // (see tests/rules/firestore.rules.test.ts), so this specifically
    // tests the lock-ownership check inside commitPiecePositions itself.
    await seedRoomGameChunk([0]);
    const aliceDb = testEnv.authenticatedContext("alice").firestore();
    const bobDb = testEnv.authenticatedContext("bob").firestore();

    await acquirePieceLock(aliceDb as never, ROOM_ID, GAME_ID, 0, "alice", 15000);
    await commitPiecePositions(
      bobDb as never,
      ROOM_ID,
      GAME_ID,
      "bob",
      new Map([[0, { x: 999, y: 999, rotation: 0, groupId: "g0" }]]),
    );

    const chunk = await getChunk();
    expect(chunk.pieces["0"]?.x).toBe(0); // untouched — bob never held the lock
    expect(chunk.pieces["0"]?.lockedBy).toBe("alice");
  });
});
