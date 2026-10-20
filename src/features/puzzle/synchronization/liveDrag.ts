import { type Database, onDisconnect, onValue, ref, remove, set } from "firebase/database";
import { LIVE_DRAG_THROTTLE_MS } from "@/app/config";

export interface LiveDragSample {
  uid: string;
  x: number;
  y: number;
  rotation: number;
  updatedAt: number;
}

/**
 * The ephemeral, non-authoritative channel: while a piece is actively
 * being dragged, its live position is broadcast here at a throttled rate
 * so other participants see smooth motion without writing every pointer
 * event to Firestore (see docs/websocket-or-realtime.md). The
 * authoritative position is only what `commitPiecePositions` writes to
 * Firestore on drag-end.
 */
export function publishLiveDragPosition(
  db: Database,
  gameId: string,
  pieceId: number,
  sample: Omit<LiveDragSample, "updatedAt">,
): Promise<void> {
  return set(ref(db, `liveDrag/${gameId}/${pieceId}`), { ...sample, updatedAt: Date.now() });
}

export function clearLiveDragPosition(db: Database, gameId: string, pieceId: number): Promise<void> {
  return remove(ref(db, `liveDrag/${gameId}/${pieceId}`));
}

/** Registers cleanup so a dropped connection (closed tab, lost network) doesn't leave a stale live-drag marker for other participants. */
export function registerLiveDragDisconnectCleanup(
  db: Database,
  gameId: string,
  pieceId: number,
): Promise<void> {
  return onDisconnect(ref(db, `liveDrag/${gameId}/${pieceId}`))
    .remove()
    .then(() => undefined);
}

export function subscribeLiveDrag(
  db: Database,
  gameId: string,
  onUpdate: (positions: Record<string, LiveDragSample>) => void,
): () => void {
  const dbRef = ref(db, `liveDrag/${gameId}`);
  return onValue(dbRef, (snapshot) => {
    onUpdate((snapshot.val() as Record<string, LiveDragSample>) ?? {});
  });
}

export function createThrottledPublisher(
  db: Database,
  gameId: string,
  pieceId: number,
  uid: string,
): (x: number, y: number, rotation: number) => void {
  let lastSentAt = 0;
  let pending: { x: number; y: number; rotation: number } | null = null;
  let timer: number | null = null;

  function flush(): void {
    timer = null;
    if (!pending) return;
    lastSentAt = Date.now();
    void publishLiveDragPosition(db, gameId, pieceId, { uid, ...pending });
    pending = null;
  }

  return (x: number, y: number, rotation: number) => {
    pending = { x, y, rotation };
    const elapsed = Date.now() - lastSentAt;
    if (elapsed >= LIVE_DRAG_THROTTLE_MS) {
      flush();
    } else if (timer === null) {
      timer = window.setTimeout(flush, LIVE_DRAG_THROTTLE_MS - elapsed);
    }
  };
}
