import { randomBytes } from "@/lib/validation/randomId";
import { api } from "@/lib/api";
import { generatePuzzleGeometry, hashStringToSeed, mulberry32, scatterPiecesAroundFrame } from "@/features/puzzle/geometry";
import type { DifficultyPreset, Game, PuzzleMode, Room, RoomParticipant, RoomVisibility } from "@/types/firestore";
import { PUZZLE_PIECE_COUNT_MAX, PUZZLE_PIECE_COUNT_MIN } from "@/app/config";
export interface CreateRoomOptions { ownerUid: string; ownerDisplayName: string; mode: PuzzleMode; imageId: string; imageWidthPx: number; imageHeightPx: number; pieceCount: number; visibility: RoomVisibility; snapEnabled: boolean; rotationEnabled: boolean; snapToleranceRatio: number; }
export function validatePieceCount(pieceCount: number): void {
  if (!Number.isInteger(pieceCount) || pieceCount < PUZZLE_PIECE_COUNT_MIN || pieceCount > PUZZLE_PIECE_COUNT_MAX) {
    throw new Error(`pieceCount must be an integer between ${PUZZLE_PIECE_COUNT_MIN} and ${PUZZLE_PIECE_COUNT_MAX}`);
  }
}
export const DIFFICULTY_PRESETS: Record<"relaxed" | "standard" | "challenging", DifficultyPreset> = {
  relaxed: { label: "Yengil", pieceCount: 20, snapToleranceRatio: 0.4, rotationEnabled: false },
  standard: { label: "Standart", pieceCount: 40, snapToleranceRatio: 0.3, rotationEnabled: false },
  challenging: { label: "Qiyin", pieceCount: 100, snapToleranceRatio: 0.2, rotationEnabled: true },
};
export async function createRoom(options: CreateRoomOptions): Promise<{ roomId: string; gameId: string }> {
  validatePieceCount(options.pieceCount);
  const roomId = randomBytes(9), gameId = "game1", geometrySeed = `${roomId}:${gameId}:v1`;
  const geometry = generatePuzzleGeometry({ seed: geometrySeed, geometryVersion: 1, pieceCount: options.pieceCount, imageAspectRatio: options.imageWidthPx / options.imageHeightPx });
  const rng = mulberry32(hashStringToSeed(`${geometrySeed}:initial-scatter`));
  const scattered = scatterPiecesAroundFrame({
    pieceIds: geometry.pieces.map((p) => p.pieceId),
    pieceWidthPx: options.imageWidthPx / geometry.cols,
    pieceHeightPx: options.imageHeightPx / geometry.rows,
    imageWidthPx: options.imageWidthPx,
    imageHeightPx: options.imageHeightPx,
    rng,
  });
  const pieces = geometry.pieces.map(({ pieceId }) => {
    const position = scattered.get(pieceId);
    return { pieceId, x: position?.x ?? 0, y: position?.y ?? 0, rotation: 0 as const, groupId: `g${pieceId}`, lockedBy: null, lockExpiresAt: null };
  });
  return api("/api/rooms", { method: "POST", body: JSON.stringify({ roomId, visibility: options.visibility, pieces, game: { gameId, mode: options.mode, imageId: options.imageId, pieceCount: geometry.pieces.length, columns: geometry.cols, rows: geometry.rows, geometrySeed, geometryVersion: 1, snapEnabled: options.snapEnabled, rotationEnabled: options.rotationEnabled, snapToleranceRatio: options.snapToleranceRatio } }) });
}
export async function joinRoom(roomId: string): Promise<Room> { const result = await api<{ room: Room }>(`/api/rooms/${encodeURIComponent(roomId)}/join`, { method: "POST" }); return result.room; }
export async function completeRoom(roomId: string, gameId: string): Promise<void> { await api(`/api/rooms/${encodeURIComponent(roomId)}/complete`, { method: "POST", body: JSON.stringify({ gameId }) }); }
export async function deleteRoom(roomId: string): Promise<void> { await api(`/api/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" }); }
export async function listMyOwnedRooms(): Promise<Room[]> { return (await api<{ rooms: Room[] }>("/api/rooms/mine")).rooms; }
export interface RoomState { room: Room; game: Game | null; participants: RoomParticipant[]; }
export async function getRoomState(roomId: string): Promise<RoomState> { return api<RoomState>(`/api/rooms/${encodeURIComponent(roomId)}`); }
const key = "puzzletogether:recent-rooms";
export function recordRecentRoomVisit(roomId: string): void { try { const values: string[] = JSON.parse(localStorage.getItem(key) || "[]"); localStorage.setItem(key, JSON.stringify([roomId, ...values.filter((x) => x !== roomId)].slice(0, 10))); } catch { /* optional convenience */ } }
export function getRecentRoomIds(): string[] { try { return JSON.parse(localStorage.getItem(key) || "[]") as string[]; } catch { return []; } }
