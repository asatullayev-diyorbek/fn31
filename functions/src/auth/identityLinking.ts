import { randomUUID } from "node:crypto";
import type { Auth } from "firebase-admin/auth";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { TelegramUser } from "../telegram/parseUpdate.js";
import { displayNameFromTelegramUser } from "../telegram/parseUpdate.js";

export interface LinkedIdentity {
  uid: string;
  isNewUser: boolean;
}

/**
 * Links a verified Telegram identity to a Firebase user, creating one if
 * none exists yet — exactly once per Telegram account, even under
 * concurrent calls (e.g. a redelivered Telegram webhook racing a user's
 * retry).
 *
 * How the race is actually closed: a Firestore transaction decides, from
 * data alone, who "wins" the right to create a new user (safe to retry —
 * Firestore retries a transaction on contention) — it never calls the
 * Admin Auth API itself. The Auth user is created afterward, by the
 * single winner, using a client-chosen UID, so losing the race never
 * leaves an orphaned Firebase Auth account. A crash between the two
 * steps leaves a self-healing dangling pointer: `createCustomToken`
 * works for a UID that doesn't exist in Firebase Auth yet (Auth lazily
 * creates the record on first sign-in), and the next call's
 * `set({...}, {merge:true})` repairs a missing `users/{uid}` profile.
 */
export async function linkTelegramIdentity(
  db: Firestore,
  auth: Auth,
  telegramUser: TelegramUser,
): Promise<LinkedIdentity> {
  const telegramUserId = String(telegramUser.id);
  const identityRef = db.collection("telegramIdentities").doc(telegramUserId);
  const candidateUid = `tg${telegramUserId}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  const result = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(identityRef);
    if (snapshot.exists) {
      return { uid: snapshot.data()!.uid as string, isNewUser: false };
    }
    tx.set(identityRef, {
      telegramUserId,
      uid: candidateUid,
      linkedAt: FieldValue.serverTimestamp(),
    });
    return { uid: candidateUid, isNewUser: true };
  });

  const displayName = displayNameFromTelegramUser(telegramUser);
  const userRef = db.collection("users").doc(result.uid);

  if (result.isNewUser) {
    await auth.createUser({ uid: result.uid, displayName });
  }

  // `set(..., {merge:true})` rather than `update` so this also self-heals
  // a users/{uid} doc left missing by a prior partial failure.
  await userRef.set(
    {
      uid: result.uid,
      telegramUserId,
      displayName,
      telegramUsername: telegramUser.username ?? null,
      updatedAt: FieldValue.serverTimestamp(),
      ...(result.isNewUser ? { createdAt: FieldValue.serverTimestamp() } : {}),
    },
    { merge: true },
  );

  return result;
}
