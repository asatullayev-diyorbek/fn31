import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
import { createAuthTransaction } from "../../src/auth/createAuthTransaction.js";
import { completeAuthTransaction } from "../../src/auth/completeAuthTransaction.js";
import { handleTelegramStart } from "../../src/telegram/handleTelegramStart.js";
import type { TelegramUser } from "../../src/telegram/parseUpdate.js";

/**
 * Exercises the real Telegram-login trust boundary end to end against the
 * Firestore + Auth emulators (not mocked):
 *   firebase emulators:exec --only firestore,auth "npm --prefix functions run test:integration"
 */
const PROJECT_ID = "demo-puzzletogether-functions-test";

let app: App;
let db: Firestore;
let auth: Auth;

beforeAll(() => {
  app = initializeApp({ projectId: PROJECT_ID }, "functions-integration-test");
  db = getFirestore(app);
  auth = getAuth(app);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  const collections = ["authTransactions", "telegramIdentities", "users"];
  for (const name of collections) {
    const snapshot = await db.collection(name).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
  }
  const listUsersResult = await auth.listUsers();
  await Promise.all(listUsersResult.users.map((user) => auth.deleteUser(user.uid)));
});

const aliceFromTelegram: TelegramUser = { id: 100001, username: "alice_tg", firstName: "Alice" };

describe("full Telegram login flow", () => {
  it("creates a pending transaction, verifies it via the webhook handler, then completes it into a new Firebase user", async () => {
    const nowMs = Date.now();
    const created = await createAuthTransaction(db, nowMs);

    const beforeVerify = await db.collection("authTransactions").doc(created.transactionId).get();
    expect(beforeVerify.data()?.status).toBe("pending");

    const verifyResult = await handleTelegramStart(db, created.transactionId, aliceFromTelegram, nowMs + 1000);
    expect(verifyResult.outcome).toBe("verified");

    const afterVerify = await db.collection("authTransactions").doc(created.transactionId).get();
    expect(afterVerify.data()?.telegramUserId).toBe("100001");

    const completeResult = await completeAuthTransaction(db, auth, created.transactionId, nowMs + 2000);
    expect(completeResult.ok).toBe(true);
    if (!completeResult.ok) return;

    const userRecord = await auth.getUser(completeResult.uid);
    expect(userRecord.displayName).toBe("Alice");

    const userDoc = await db.collection("users").doc(completeResult.uid).get();
    expect(userDoc.data()?.telegramUserId).toBe("100001");

    const identityDoc = await db.collection("telegramIdentities").doc("100001").get();
    expect(identityDoc.data()?.uid).toBe(completeResult.uid);
  });

  it("rejects a replayed /start for an already-verified transaction (single-use)", async () => {
    const nowMs = Date.now();
    const created = await createAuthTransaction(db, nowMs);
    await handleTelegramStart(db, created.transactionId, aliceFromTelegram, nowMs + 1000);

    const replay = await handleTelegramStart(db, created.transactionId, aliceFromTelegram, nowMs + 1500);
    expect(replay.outcome).toBe("already-used");
  });

  it("rejects an unknown token", async () => {
    const result = await handleTelegramStart(db, "nonexistent-token", aliceFromTelegram, Date.now());
    expect(result.outcome).toBe("not-found");
    const complete = await completeAuthTransaction(db, auth, "nonexistent-token", Date.now());
    expect(complete).toEqual({ ok: false, reason: "not-found" });
  });

  it("expires a transaction whose TTL has passed before verification", async () => {
    const nowMs = Date.now();
    const created = await createAuthTransaction(db, nowMs);
    const sixMinutesLater = nowMs + 6 * 60 * 1000;

    const result = await handleTelegramStart(db, created.transactionId, aliceFromTelegram, sixMinutesLater);
    expect(result.outcome).toBe("expired");

    const doc = await db.collection("authTransactions").doc(created.transactionId).get();
    expect(doc.data()?.status).toBe("expired");
  });

  it("refuses to complete a transaction that was never verified", async () => {
    const nowMs = Date.now();
    const created = await createAuthTransaction(db, nowMs);
    const result = await completeAuthTransaction(db, auth, created.transactionId, nowMs + 1000);
    expect(result).toEqual({ ok: false, reason: "not-verified" });
  });

  it("is idempotent: completing an already-completed transaction returns the same uid without creating a duplicate user", async () => {
    const nowMs = Date.now();
    const created = await createAuthTransaction(db, nowMs);
    await handleTelegramStart(db, created.transactionId, aliceFromTelegram, nowMs + 1000);
    const first = await completeAuthTransaction(db, auth, created.transactionId, nowMs + 2000);
    const second = await completeAuthTransaction(db, auth, created.transactionId, nowMs + 3000);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.uid).toBe(first.uid);
    }
    const listResult = await auth.listUsers();
    expect(listResult.users.length).toBe(1);
  });

  it("links a second login from the same Telegram account to the same existing Firebase user, never creating a duplicate", async () => {
    const nowMs = Date.now();

    const firstLogin = await createAuthTransaction(db, nowMs);
    await handleTelegramStart(db, firstLogin.transactionId, aliceFromTelegram, nowMs + 1000);
    const firstComplete = await completeAuthTransaction(db, auth, firstLogin.transactionId, nowMs + 2000);
    expect(firstComplete.ok).toBe(true);

    // Alice changed her Telegram username between logins — a mutable
    // display field, not a new identity.
    const secondLogin = await createAuthTransaction(db, nowMs + 10000);
    await handleTelegramStart(
      db,
      secondLogin.transactionId,
      { ...aliceFromTelegram, username: "alice_new_handle" },
      nowMs + 11000,
    );
    const secondComplete = await completeAuthTransaction(db, auth, secondLogin.transactionId, nowMs + 12000);
    expect(secondComplete.ok).toBe(true);

    if (firstComplete.ok && secondComplete.ok) {
      expect(secondComplete.uid).toBe(firstComplete.uid);
      const userDoc = await db.collection("users").doc(secondComplete.uid).get();
      expect(userDoc.data()?.telegramUsername).toBe("alice_new_handle");
    }
    const listResult = await auth.listUsers();
    expect(listResult.users.length).toBe(1);
  });

  it("never lets a client-forged transaction with no verified Telegram identity be completed", async () => {
    const nowMs = Date.now();
    const ref = db.collection("authTransactions").doc("forged-transaction");
    // Simulates what a malicious client would need to fabricate: a
    // transaction marked "verified" without ever going through the
    // trusted webhook handler. Rules block this from a real client (see
    // tests/rules/firestore.rules.test.ts); here we confirm the function
    // layer also refuses to complete it if telegram identity fields are
    // missing, as defense in depth.
    await ref.set({
      status: "verified",
      createdAt: new Date(nowMs),
      expiresAt: new Date(nowMs + 300000),
      sessionMarker: "forged",
    });
    const result = await completeAuthTransaction(db, auth, "forged-transaction", nowMs + 1000);
    expect(result).toEqual({ ok: false, reason: "not-verified" });
  });
});
