import { randomBytes } from "@/lib/validation/randomId";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getFirebaseFirestore } from "@/lib/firebase/client";
import { generatePuzzleGeometry, hashStringToSeed, mulberry32 } from "@/features/puzzle/geometry";
import type { PiecePosition } from "@/features/puzzle/interactions";
import { chunkIdForPiece } from "@/features/puzzle/synchronization/chunking";
import type { DifficultyPreset, Game, PuzzleMode, Room, RoomVisibility } from "@/types/firestore";
import { PUZZLE_PIECE_COUNT_MAX, PUZZLE_PIECE_COUNT_MIN } from "@/app/config";

export interface CreateRoomOptions {
  ownerUid: string;
  ownerDisplayName: string;
  mode: PuzzleMode;
  imageId: string;
  imageWidthPx: number;
  imageHeightPx: number;
  pieceCount: number;
  visibility: RoomVisibility;
  snapEnabled: boolean;
  rotationEnabled: boolean;
  snapToleranceRatio: number;
}

export function validatePieceCount(pieceCount: number): void {
  if (!Number.isInteger(pieceCount) || pieceCount < PUZZLE_PIECE_COUNT_MIN || pieceCount > PUZZLE_PIECE_COUNT_MAX) {
    throw new Error(
      `pieceCount must be an integer between ${PUZZLE_PIECE_COUNT_MIN} and ${PUZZLE_PIECE_COUNT_MAX}`,
    );
  }
}

export const DIFFICULTY_PRESETS: Record<"relaxed" | "standard" | "challenging", DifficultyPreset> = {
  relaxed: { label: "Yengil", pieceCount: 25, snapToleranceRatio: 0.4, rotationEnabled: false },
  standard: { label: "Standart", pieceCount: 100, snapToleranceRatio: 0.3, rotationEnabled: false },
  challenging: { label: "Qiyin", pieceCount: 300, snapToleranceRatio: 0.2, rotationEnabled: true },
};

function generateRoomId(): string {
  return randomBytes(9); // ~46 bits of entropy, base36 — short enough to share, safe enough not to guess
}

function chunkScatteredPieces(
  pieceIds: number[],
  positions: Map<number, PiecePosition>,
): Array<{ chunkId: string; pieces: Record<string, unknown> }> {
  const byChunk = new Map<string, Record<string, unknown>>();
  for (const pieceId of pieceIds) {
    const position = positions.get(pieceId);
    if (!position) continue;
    const chunkId = chunkIdForPiece(pieceId);
    const pieces = byChunk.get(chunkId) ?? {};
    pieces[String(pieceId)] = {
      pieceId,
      x: position.x,
      y: position.y,
      rotation: position.rotation,
      groupId: `g${pieceId}`,
      lockedBy: null,
      lockExpiresAt: null,
    };
    byChunk.set(chunkId, pieces);
  }
  return Array.from(byChunk.entries()).map(([chunkId, pieces]) => ({ chunkId, pieces }));
}

/**
 * Deterministically scatters pieces across a nominal 1800x1200 workspace,
 * seeded the same way the geometry itself is, so the very first Firestore
 * snapshot — the one every participant sees before anyone has moved
 * anything — is identical and well-formed across all clients, not just
 * "whatever the creator's browser happened to randomize locally".
 */
function scatterForNewGame(pieceIds: number[], seed: string): Map<number, PiecePosition> {
  const rng = mulberry32(hashStringToSeed(`${seed}:initial-scatter`));
  const positions = new Map<number, PiecePosition>();
  for (const pieceId of pieceIds) {
    positions.set(pieceId, { x: rng() * 1700, y: rng() * 1100, rotation: 0 });
  }
  return positions;
}

export async function createRoom(options: CreateRoomOptions): Promise<{ roomId: string; gameId: string }> {
  validatePieceCount(options.pieceCount);
  const db = getFirebaseFirestore();
  const roomId = generateRoomId();
  const gameId = "game1";
  const geometrySeed = `${roomId}:${gameId}:v1`;

  const geometry = generatePuzzleGeometry({
    seed: geometrySeed,
    geometryVersion: 1,
    pieceCount: options.pieceCount,
    imageAspectRatio: options.imageWidthPx / options.imageHeightPx,
  });

  const pieceIds = geometry.pieces.map((p) => p.pieceId);
  const positions = scatterForNewGame(pieceIds, geometrySeed);
  const chunks = chunkScatteredPieces(pieceIds, positions);

  const batch = writeBatch(db);

  const roomRef = doc(db, "rooms", roomId);
  const room: Omit<Room, "createdAt" | "updatedAt" | "expiresAt"> & {
    createdAt: unknown;
    updatedAt: unknown;
    expiresAt: null;
  } = {
    roomId,
    ownerUid: options.ownerUid,
    status: "open",
    visibility: options.visibility,
    inviteCode: roomId,
    currentGameId: gameId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    expiresAt: null,
  };
  batch.set(roomRef, room);

  const participantRef = doc(db, "rooms", roomId, "participants", options.ownerUid);
  batch.set(participantRef, {
    uid: options.ownerUid,
    displayName: options.ownerDisplayName,
    role: "owner",
    joinedAt: serverTimestamp(),
    lastSeenAt: serverTimestamp(),
    connectionStatus: "online",
  });

  const gameRef = doc(db, "rooms", roomId, "games", gameId);
  const game: Omit<Game, "createdAt" | "updatedAt" | "completedAt"> & {
    createdAt: unknown;
    updatedAt: unknown;
    completedAt: null;
  } = {
    gameId,
    roomId,
    mode: options.mode,
    imageId: options.imageId,
    pieceCount: geometry.pieces.length,
    columns: geometry.cols,
    rows: geometry.rows,
    geometrySeed,
    geometryVersion: 1,
    snapEnabled: options.snapEnabled,
    rotationEnabled: options.rotationEnabled,
    snapToleranceRatio: options.snapToleranceRatio,
    stateVersion: 0,
    progress: 0,
    completedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  batch.set(gameRef, game);

  for (const chunk of chunks) {
    const chunkRef = doc(db, "rooms", roomId, "games", gameId, "pieceChunks", chunk.chunkId);
    batch.set(chunkRef, { chunkId: chunk.chunkId, gameId, pieces: chunk.pieces, chunkVersion: 0 });
  }

  await batch.commit();
  return { roomId, gameId };
}

export async function joinRoom(roomId: string, uid: string, displayName: string): Promise<Room> {
  const db = getFirebaseFirestore();
  const roomRef = doc(db, "rooms", roomId);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) throw new Error("Xona topilmadi. Havolani tekshiring.");
  const room = roomSnap.data() as Room;

  const participantRef = doc(db, "rooms", roomId, "participants", uid);
  await setDoc(
    participantRef,
    {
      uid,
      displayName,
      role: room.ownerUid === uid ? "owner" : "member",
      joinedAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
      connectionStatus: "online",
    },
    { merge: true },
  );

  return room;
}

export async function listMyOwnedRooms(uid: string): Promise<Room[]> {
  const db = getFirebaseFirestore();
  const q = query(collection(db, "rooms"), where("ownerUid", "==", uid));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as Room);
}

const RECENT_ROOMS_STORAGE_KEY = "puzzletogether:recent-rooms";
const MAX_RECENT_ROOMS = 10;

/**
 * Per-device "recently joined rooms" (localStorage, not Firestore). A
 * documented scope cut: a cross-device recent-rooms list would need a
 * collection-group rule + query across every room's participants
 * subcollection, which we chose not to add in this pass — see
 * IMPLEMENTATION_PLAN.md Phase 5 and docs/architecture.md.
 */
export function recordRecentRoomVisit(roomId: string): void {
  try {
    const raw = window.localStorage.getItem(RECENT_ROOMS_STORAGE_KEY);
    const existing: string[] = raw ? JSON.parse(raw) : [];
    const next = [roomId, ...existing.filter((id) => id !== roomId)].slice(0, MAX_RECENT_ROOMS);
    window.localStorage.setItem(RECENT_ROOMS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage can throw (private mode, quota) — recent-rooms is a convenience, never load-bearing.
  }
}

export function getRecentRoomIds(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_ROOMS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}
