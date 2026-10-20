import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Runs against the real Firestore emulator (not a mock):
 *   firebase emulators:exec --only firestore "npm run test:rules"
 * See IMPLEMENTATION_PLAN.md Phase 4/5.
 *
 * Seed data is written with the Admin SDK (`adminDb`), which — exactly
 * like it does in production and in the real Cloud Functions — always
 * bypasses Security Rules. `testEnv`'s authenticated/unauthenticated
 * contexts are reserved for the actual assertions under test.
 */
let testEnv: RulesTestEnvironment;
let adminApp: App;
let adminDb: Firestore;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-puzzletogether-rules-test",
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  adminApp = initializeApp({ projectId: "demo-puzzletogether-rules-test" }, "rules-test-admin");
  adminDb = getFirestore(adminApp);
});

afterAll(async () => {
  await deleteApp(adminApp);
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

const now = new Date();

describe("users/{uid}", () => {
  it("denies all reads/writes to an unauthenticated client", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(db.collection("users").doc("alice").get());
  });

  it("lets a signed-in user read any user's profile (for participant display)", async () => {
    await adminDb.collection("users").doc("alice").set({
      uid: "alice",
      telegramUserId: "111",
      displayName: "Alice",
      createdAt: now,
      updatedAt: now,
    });
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertSucceeds(bob.collection("users").doc("alice").get());
  });

  it("lets a user update their own displayName but not their telegramUserId", async () => {
    await adminDb.collection("users").doc("alice").set({
      uid: "alice",
      telegramUserId: "111",
      displayName: "Alice",
      createdAt: now,
      updatedAt: now,
    });
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(
      alice.collection("users").doc("alice").update({ displayName: "Alice B.", updatedAt: now }),
    );
    await assertFails(
      alice.collection("users").doc("alice").update({ telegramUserId: "999" }),
    );
  });

  it("never lets one user modify another user's profile", async () => {
    await adminDb.collection("users").doc("alice").set({
      uid: "alice",
      telegramUserId: "111",
      displayName: "Alice",
      createdAt: now,
      updatedAt: now,
    });
    const mallory = testEnv.authenticatedContext("mallory").firestore();
    await assertFails(
      mallory.collection("users").doc("alice").update({ displayName: "Hijacked" }),
    );
  });

  it("never lets a client create a user document directly (only the trusted function does)", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      alice
        .collection("users")
        .doc("alice")
        .set({ uid: "alice", telegramUserId: "111", displayName: "Alice", createdAt: now, updatedAt: now }),
    );
  });
});

describe("telegramIdentities/{telegramUserId}", () => {
  it("is completely inaccessible to every client, signed in or not", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      alice.collection("telegramIdentities").doc("111").set({ telegramUserId: "111", uid: "alice", linkedAt: now }),
    );
    await assertFails(alice.collection("telegramIdentities").doc("111").get());
  });
});

describe("authTransactions/{transactionId}", () => {
  it("allows an unauthenticated client to GET a transaction by its exact (unguessable) id", async () => {
    await adminDb.collection("authTransactions").doc("tok_abc123").set({
      status: "pending",
      createdAt: now,
      expiresAt: now,
      sessionMarker: "session-xyz",
    });
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(anon.collection("authTransactions").doc("tok_abc123").get());
  });

  it("never allows listing the collection (would let a client enumerate others' tokens)", async () => {
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(anon.collection("authTransactions").get());
  });

  it("never allows a client to mark its own transaction verified or completed", async () => {
    await adminDb.collection("authTransactions").doc("tok_abc123").set({
      status: "pending",
      createdAt: now,
      expiresAt: now,
      sessionMarker: "session-xyz",
    });
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(
      anon
        .collection("authTransactions")
        .doc("tok_abc123")
        .update({ status: "verified", telegramUserId: "999999" }),
    );
  });
});

describe("rooms/{roomId}", () => {
  it("lets a signed-in user create a room only as themselves", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(
      alice.collection("rooms").doc("room1").set({
        roomId: "room1",
        ownerUid: "alice",
        status: "open",
        visibility: "unlisted",
        inviteCode: "ABC123",
        currentGameId: null,
        createdAt: now,
        updatedAt: now,
        expiresAt: null,
      }),
    );
    await assertFails(
      alice.collection("rooms").doc("room2").set({
        roomId: "room2",
        ownerUid: "mallory",
        status: "open",
        visibility: "unlisted",
        inviteCode: "ZZZ999",
        currentGameId: null,
        createdAt: now,
        updatedAt: now,
        expiresAt: null,
      }),
    );
  });

  it("hides a private room from non-participants but allows an unlisted one by id", async () => {
    await adminDb.collection("rooms").doc("private-room").set({
      roomId: "private-room",
      ownerUid: "alice",
      status: "open",
      visibility: "private",
      inviteCode: "PRIV01",
      currentGameId: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: null,
    });
    await adminDb.collection("rooms").doc("unlisted-room").set({
      roomId: "unlisted-room",
      ownerUid: "alice",
      status: "open",
      visibility: "unlisted",
      inviteCode: "UNL001",
      currentGameId: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: null,
    });
    const mallory = testEnv.authenticatedContext("mallory").firestore();
    await assertFails(mallory.collection("rooms").doc("private-room").get());
    await assertSucceeds(mallory.collection("rooms").doc("unlisted-room").get());
  });

  it("never lets a non-owner change room status", async () => {
    await adminDb.collection("rooms").doc("room1").set({
      roomId: "room1",
      ownerUid: "alice",
      status: "open",
      visibility: "unlisted",
      inviteCode: "ABC123",
      currentGameId: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: null,
    });
    const mallory = testEnv.authenticatedContext("mallory").firestore();
    await assertFails(
      mallory.collection("rooms").doc("room1").update({ status: "closed", updatedAt: now }),
    );
  });
});

async function seedRoomWithOwner(): Promise<void> {
  await adminDb.collection("rooms").doc("room1").set({
    roomId: "room1",
    ownerUid: "alice",
    status: "open",
    visibility: "private",
    inviteCode: "ABC123",
    currentGameId: null,
    createdAt: now,
    updatedAt: now,
    expiresAt: null,
  });
  await adminDb.collection("rooms").doc("room1").collection("participants").doc("alice").set({
    uid: "alice",
    displayName: "Alice",
    role: "owner",
    joinedAt: now,
    lastSeenAt: now,
    connectionStatus: "online",
  });
}

describe("rooms/{roomId}/participants/{uid}", () => {
  it("lets a user join (create their own participant doc) but not impersonate another uid", async () => {
    await seedRoomWithOwner();
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertSucceeds(
      bob.collection("rooms").doc("room1").collection("participants").doc("bob").set({
        uid: "bob",
        displayName: "Bob",
        role: "member",
        joinedAt: now,
        lastSeenAt: now,
        connectionStatus: "online",
      }),
    );
    await assertFails(
      bob.collection("rooms").doc("room1").collection("participants").doc("carol").set({
        uid: "carol",
        displayName: "Carol (fake)",
        role: "member",
        joinedAt: now,
        lastSeenAt: now,
        connectionStatus: "online",
      }),
    );
  });

  it("rejects a joining user who claims the owner role without being the room owner", async () => {
    await seedRoomWithOwner();
    const bob = testEnv.authenticatedContext("bob").firestore();
    await assertFails(
      bob.collection("rooms").doc("room1").collection("participants").doc("bob").set({
        uid: "bob",
        displayName: "Bob",
        role: "owner",
        joinedAt: now,
        lastSeenAt: now,
        connectionStatus: "online",
      }),
    );
  });

  it("denies a non-member from reading the private room's participant list", async () => {
    await seedRoomWithOwner();
    const mallory = testEnv.authenticatedContext("mallory").firestore();
    await assertFails(mallory.collection("rooms").doc("room1").collection("participants").get());
  });
});

async function seedRoomWithGame(): Promise<void> {
  await seedRoomWithOwner();
  await adminDb
    .collection("rooms")
    .doc("room1")
    .collection("games")
    .doc("game1")
    .set({
      gameId: "game1",
      roomId: "room1",
      mode: "classic",
      imageId: "img1",
      pieceCount: 25,
      columns: 5,
      rows: 5,
      geometrySeed: "seed1",
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
  await adminDb
    .collection("rooms")
    .doc("room1")
    .collection("games")
    .doc("game1")
    .collection("pieceChunks")
    .doc("chunk0")
    .set({ chunkId: "chunk0", gameId: "game1", pieces: {}, chunkVersion: 0 });
}

describe("games/{gameId} and pieceChunks/{chunkId}", () => {
  it("denies a non-participant from reading game state", async () => {
    await seedRoomWithGame();
    const mallory = testEnv.authenticatedContext("mallory").firestore();
    await assertFails(
      mallory.collection("rooms").doc("room1").collection("games").doc("game1").get(),
    );
  });

  it("never lets a client rewrite the puzzle's identity fields (mode/pieceCount/geometry)", async () => {
    await seedRoomWithGame();
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      alice
        .collection("rooms")
        .doc("room1")
        .collection("games")
        .doc("game1")
        .update({ pieceCount: 500, stateVersion: 1 }),
    );
  });

  it("accepts a progress update that only advances stateVersion", async () => {
    await seedRoomWithGame();
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(
      alice
        .collection("rooms")
        .doc("room1")
        .collection("games")
        .doc("game1")
        .update({ stateVersion: 1, progress: 0.1, updatedAt: now }),
    );
  });

  it("rejects a stale pieceChunk write (version must advance by exactly one)", async () => {
    await seedRoomWithGame();
    const alice = testEnv
      .authenticatedContext("alice")
      .firestore()
      .collection("rooms")
      .doc("room1")
      .collection("games")
      .doc("game1")
      .collection("pieceChunks")
      .doc("chunk0");

    await assertFails(
      alice.update({ pieces: { "0": { pieceId: 0, x: 1, y: 1, rotation: 0, groupId: "g0", lockedBy: null, lockExpiresAt: null } }, chunkVersion: 2 }),
    );
    await assertSucceeds(
      alice.update({ pieces: { "0": { pieceId: 0, x: 1, y: 1, rotation: 0, groupId: "g0", lockedBy: null, lockExpiresAt: null } }, chunkVersion: 1 }),
    );
  });

  it("denies a non-participant from writing piece state in someone else's game", async () => {
    await seedRoomWithGame();
    const mallory = testEnv
      .authenticatedContext("mallory")
      .firestore()
      .collection("rooms")
      .doc("room1")
      .collection("games")
      .doc("game1")
      .collection("pieceChunks")
      .doc("chunk0");
    await assertFails(mallory.update({ pieces: {}, chunkVersion: 1 }));
  });
});

describe("images/{imageId}", () => {
  it("validates content type and size on upload metadata", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertSucceeds(
      alice.collection("images").doc("img1").set({
        imageId: "img1",
        ownerUid: "alice",
        storagePath: "images/alice/img1.jpg",
        width: 1200,
        height: 800,
        contentType: "image/jpeg",
        sizeBytes: 500_000,
        source: "upload",
        createdAt: now,
      }),
    );
    await assertFails(
      alice.collection("images").doc("img2").set({
        imageId: "img2",
        ownerUid: "alice",
        storagePath: "images/alice/img2.exe",
        width: 1200,
        height: 800,
        contentType: "application/x-msdownload",
        sizeBytes: 500_000,
        source: "upload",
        createdAt: now,
      }),
    );
    await assertFails(
      alice.collection("images").doc("img3").set({
        imageId: "img3",
        ownerUid: "alice",
        storagePath: "images/alice/img3.jpg",
        width: 1200,
        height: 800,
        contentType: "image/jpeg",
        sizeBytes: 50_000_000,
        source: "upload",
        createdAt: now,
      }),
    );
  });

  it("never lets a user claim someone else's uid as the image owner", async () => {
    const alice = testEnv.authenticatedContext("alice").firestore();
    await assertFails(
      alice.collection("images").doc("img4").set({
        imageId: "img4",
        ownerUid: "mallory",
        storagePath: "images/mallory/img4.jpg",
        width: 100,
        height: 100,
        contentType: "image/jpeg",
        sizeBytes: 1000,
        source: "upload",
        createdAt: now,
      }),
    );
  });
});
