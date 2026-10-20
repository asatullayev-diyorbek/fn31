import type { Timestamp } from "firebase/firestore";

/** users/{uid} */
export interface UserProfile {
  uid: string;
  telegramUserId: string; // mirrors telegramIdentities/{telegramUserId}, immutable
  displayName: string;
  telegramUsername?: string; // mutable, display-only
  photoUrl?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** telegramIdentities/{telegramUserId} */
export interface TelegramIdentity {
  telegramUserId: string;
  uid: string;
  linkedAt: Timestamp;
}

export type AuthTransactionStatus =
  | "pending"
  | "verified"
  | "completed"
  | "expired"
  | "failed";

/** authTransactions/{transactionId} — transactionId IS the single-use token's hash, never the raw token */
export interface AuthTransaction {
  status: AuthTransactionStatus;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  telegramUserId?: string; // set only by the trusted webhook handler, once verified
  telegramUsername?: string;
  uid?: string; // set only once completed
  sessionMarker: string; // random id the browser holds; scopes the Firestore read, not identity proof
  failureReason?: string;
}

export type PuzzleMode = "free" | "classic";
export type RoomVisibility = "private" | "unlisted";
export type RoomStatus = "open" | "closed";

/** rooms/{roomId} */
export interface Room {
  roomId: string;
  ownerUid: string;
  status: RoomStatus;
  visibility: RoomVisibility;
  inviteCode: string;
  currentGameId: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp | null;
}

/** rooms/{roomId}/participants/{uid} */
export interface RoomParticipant {
  uid: string;
  displayName: string;
  photoUrl?: string;
  role: "owner" | "member";
  joinedAt: Timestamp;
  lastSeenAt: Timestamp;
  connectionStatus: "online" | "offline";
}

export interface DifficultyPreset {
  label: string;
  pieceCount: number;
  snapToleranceRatio: number; // fraction of piece size
  rotationEnabled: boolean;
}

/** rooms/{roomId}/games/{gameId} */
export interface Game {
  gameId: string;
  roomId: string;
  mode: PuzzleMode;
  imageId: string;
  pieceCount: number;
  columns: number;
  rows: number;
  geometrySeed: string;
  geometryVersion: number;
  snapEnabled: boolean;
  rotationEnabled: boolean;
  snapToleranceRatio: number;
  stateVersion: number;
  progress: number; // 0..1, fraction of pieces correctly grouped/placed
  completedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface PieceState {
  pieceId: number;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  groupId: string;
  lockedBy: string | null;
  lockExpiresAt: Timestamp | null;
}

/**
 * rooms/{roomId}/games/{gameId}/pieceChunks/{chunkId}
 * Pieces are sharded into fixed-size chunks (see
 * src/features/puzzle/synchronization/chunking.ts) so a single Firestore
 * document never approaches the 1 MiB document-size limit even at the
 * 500-piece MVP ceiling.
 */
export interface PieceChunk {
  chunkId: string;
  gameId: string;
  pieces: Record<string, PieceState>;
  chunkVersion: number;
}

/** images/{imageId} */
export interface ImageRecord {
  imageId: string;
  ownerUid: string | null; // null for built-in gallery images
  storagePath: string;
  width: number;
  height: number;
  contentType: string;
  sizeBytes: number;
  source: "gallery" | "upload";
  createdAt: Timestamp;
}
