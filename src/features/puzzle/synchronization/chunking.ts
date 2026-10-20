/** Pieces per Firestore chunk document. Shared by room creation (roomsApi.ts) and the sync layer so both agree on which chunk a given piece lives in without a lookup table. */
export const PIECES_PER_CHUNK = 40;

export function chunkIndexForPiece(pieceId: number): number {
  return Math.floor(pieceId / PIECES_PER_CHUNK);
}

export function chunkIdForPiece(pieceId: number): string {
  return `chunk${chunkIndexForPiece(pieceId)}`;
}

export function chunkIdsForPieceCount(pieceCount: number): string[] {
  const count = Math.ceil(pieceCount / PIECES_PER_CHUNK);
  return Array.from({ length: count }, (_, i) => `chunk${i}`);
}
