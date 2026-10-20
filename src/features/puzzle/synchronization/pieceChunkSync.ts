import {
  type Firestore,
  Timestamp,
  doc,
  runTransaction,
} from "firebase/firestore";
import { chunkIdForPiece } from "./chunking";
import { canAcquireLock } from "./pieceLock";
import type { PieceChunk, PieceState } from "@/types/firestore";

function chunkRef(db: Firestore, roomId: string, gameId: string, chunkId: string) {
  return doc(db, "rooms", roomId, "games", gameId, "pieceChunks", chunkId);
}

/**
 * Attempts to acquire the drag lock for one piece. This is the
 * concurrency boundary described in AGENT.md §6: it is a Firestore
 * transaction, so two clients racing to grab the same piece can never
 * both win — exactly one transaction commits with `lockedBy == uid`; the
 * other observes the committed lock on retry and fails.
 */
export async function acquirePieceLock(
  db: Firestore,
  roomId: string,
  gameId: string,
  pieceId: number,
  uid: string,
  leaseMs: number,
): Promise<boolean> {
  const ref = chunkRef(db, roomId, gameId, chunkIdForPiece(pieceId));
  return runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) return false;
    const chunk = snapshot.data() as PieceChunk;
    const piece = chunk.pieces[String(pieceId)];
    if (!piece) return false;

    const nowMs = Date.now();
    if (!canAcquireLock({ lockedBy: piece.lockedBy, lockExpiresAt: piece.lockExpiresAt }, uid, nowMs)) {
      return false;
    }

    const nextPieces = {
      ...chunk.pieces,
      [String(pieceId)]: {
        ...piece,
        lockedBy: uid,
        lockExpiresAt: Timestamp.fromMillis(nowMs + leaseMs),
      },
    };
    tx.update(ref, { pieces: nextPieces, chunkVersion: chunk.chunkVersion + 1 });
    return true;
  });
}

/**
 * Commits the final position/rotation/group for one or more pieces at
 * drag-end, releasing their locks, grouped and written per affected
 * chunk. Each chunk's write is its own transaction advancing
 * `chunkVersion` by exactly one — the same invariant enforced
 * server-side by firestore.rules, so a stale client (one that read an
 * older chunkVersion and is still computing a move) gets its transaction
 * retried against the fresh version by the SDK, or ultimately rejected by
 * rules if it bypasses the transaction helper entirely.
 */
export async function commitPiecePositions(
  db: Firestore,
  roomId: string,
  gameId: string,
  uid: string,
  updates: ReadonlyMap<number, Pick<PieceState, "x" | "y" | "rotation" | "groupId">>,
): Promise<void> {
  const byChunk = new Map<string, Map<number, Pick<PieceState, "x" | "y" | "rotation" | "groupId">>>();
  for (const [pieceId, update] of updates) {
    const chunkId = chunkIdForPiece(pieceId);
    const forChunk = byChunk.get(chunkId) ?? new Map();
    forChunk.set(pieceId, update);
    byChunk.set(chunkId, forChunk);
  }

  await Promise.all(
    Array.from(byChunk.entries()).map(([chunkId, pieceUpdates]) =>
      runTransaction(db, async (tx) => {
        const ref = chunkRef(db, roomId, gameId, chunkId);
        const snapshot = await tx.get(ref);
        if (!snapshot.exists()) return;
        const chunk = snapshot.data() as PieceChunk;
        const nextPieces = { ...chunk.pieces };
        for (const [pieceId, update] of pieceUpdates) {
          const existing = nextPieces[String(pieceId)];
          if (!existing) continue;
          // Only the current lock holder's commit is honored — this is
          // the defense-in-depth client-side half of "a piece cannot be
          // controlled by two users in conflicting ways"; firestore.rules
          // enforces the chunkVersion side of the same invariant.
          if (existing.lockedBy && existing.lockedBy !== uid) continue;
          nextPieces[String(pieceId)] = {
            ...existing,
            x: update.x,
            y: update.y,
            rotation: update.rotation,
            groupId: update.groupId,
            lockedBy: null,
            lockExpiresAt: null,
          };
        }
        tx.update(ref, { pieces: nextPieces, chunkVersion: chunk.chunkVersion + 1 });
      }),
    ),
  );
}

/** Releases a lock without changing the piece's position (e.g. the user cancelled the drag). */
export async function releasePieceLock(
  db: Firestore,
  roomId: string,
  gameId: string,
  pieceId: number,
  uid: string,
): Promise<void> {
  const ref = chunkRef(db, roomId, gameId, chunkIdForPiece(pieceId));
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists()) return;
    const chunk = snapshot.data() as PieceChunk;
    const piece = chunk.pieces[String(pieceId)];
    if (!piece || piece.lockedBy !== uid) return;
    tx.update(ref, {
      pieces: { ...chunk.pieces, [String(pieceId)]: { ...piece, lockedBy: null, lockExpiresAt: null } },
      chunkVersion: chunk.chunkVersion + 1,
    });
  });
}
