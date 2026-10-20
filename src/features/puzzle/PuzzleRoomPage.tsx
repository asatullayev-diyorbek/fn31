import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import { useRoomSync } from "@/features/puzzle/synchronization/useRoomSync";
import { acquirePieceLock, commitPiecePositions } from "@/features/puzzle/synchronization/pieceChunkSync";
import {
  clearLiveDragPosition,
  createThrottledPublisher,
  registerLiveDragDisconnectCleanup,
} from "@/features/puzzle/synchronization/liveDrag";
import { getFirebaseDatabase, getFirebaseFirestore } from "@/lib/firebase/client";
import { PIECE_LOCK_LEASE_MS } from "@/app/config";
import { loadPuzzleImage } from "@/features/images/loadPuzzleImage";
import { generatePuzzleGeometry, type GeometryResult } from "@/features/puzzle/geometry";
import { PuzzleBoard } from "./PuzzleBoard";
import type { PuzzleEngine } from "@/features/puzzle/engine/PuzzleEngine";
import type { PiecePosition } from "@/features/puzzle/interactions";
import styles from "./PuzzleRoomPage.module.css";

export function PuzzleRoomPage(): JSX.Element {
  const { roomId = "" } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const sync = useRoomSync(roomId);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [geometry, setGeometry] = useState<GeometryResult | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState(0);

  const engineRef = useRef<PuzzleEngine | null>(null);
  const throttledPublishers = useRef<Map<number, (x: number, y: number, rotation: number) => void>>(new Map());

  useEffect(() => {
    if (!sync.game) return;
    let cancelled = false;
    loadPuzzleImage(sync.game.imageId)
      .then((img) => {
        if (cancelled) return;
        setImage(img);
        setGeometry(
          generatePuzzleGeometry({
            seed: sync.game!.geometrySeed,
            geometryVersion: sync.game!.geometryVersion,
            pieceCount: sync.game!.pieceCount,
            imageAspectRatio: img.naturalWidth / img.naturalHeight,
          }),
        );
      })
      .catch((err) => setImageError(err instanceof Error ? err.message : "Rasmni yuklab bo'lmadi."));
    return () => {
      cancelled = true;
    };
  }, [sync.game]);

  const initialPositions = useMemo<Map<number, PiecePosition>>(() => {
    const map = new Map<number, PiecePosition>();
    for (const [pieceId, piece] of sync.pieces) {
      map.set(pieceId, { x: piece.x, y: piece.y, rotation: piece.rotation });
    }
    return map;
  }, [sync.pieces]);

  // Apply every remote snapshot update to the live engine (guarded internally against fighting an active local drag).
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    for (const [pieceId, piece] of sync.pieces) {
      engine.applyRemotePieceUpdate(pieceId, { x: piece.x, y: piece.y, rotation: piece.rotation }, piece.groupId);
      engine.setPieceLockedByOther(pieceId, Boolean(piece.lockedBy) && piece.lockedBy !== sync.myUid);
    }
  }, [sync.pieces, sync.myUid]);

  async function handleDragStart(pieceIds: readonly number[]): Promise<void> {
    if (!user || !sync.game) return;
    const db = getFirebaseFirestore();
    const rtdb = getFirebaseDatabase();
    for (const pieceId of pieceIds) {
      void acquirePieceLock(db, roomId, sync.game.gameId, pieceId, user.uid, PIECE_LOCK_LEASE_MS);
      void registerLiveDragDisconnectCleanup(rtdb, sync.game.gameId, pieceId);
      if (!throttledPublishers.current.has(pieceId)) {
        throttledPublishers.current.set(pieceId, createThrottledPublisher(rtdb, sync.game.gameId, pieceId, user.uid));
      }
    }
  }

  function handleDragMove(pieceIds: readonly number[], positions: ReadonlyMap<number, PiecePosition>): void {
    for (const pieceId of pieceIds) {
      const position = positions.get(pieceId);
      const publish = throttledPublishers.current.get(pieceId);
      if (position && publish) publish(position.x, position.y, position.rotation);
    }
  }

  async function handleCommitPositions(changed: ReadonlyMap<number, PiecePosition>): Promise<void> {
    if (!user || !sync.game) return;
    const db = getFirebaseFirestore();
    const rtdb = getFirebaseDatabase();
    const updates = new Map(
      Array.from(changed.entries()).map(([pieceId, position]) => {
        const existing = sync.pieces.get(pieceId);
        return [
          pieceId,
          { x: position.x, y: position.y, rotation: position.rotation, groupId: existing?.groupId ?? `g${pieceId}` },
        ] as const;
      }),
    );
    await commitPiecePositions(db, roomId, sync.game.gameId, user.uid, updates);
    for (const pieceId of changed.keys()) {
      await clearLiveDragPosition(rtdb, sync.game.gameId, pieceId);
      throttledPublishers.current.delete(pieceId);
    }
  }

  function copyInviteLink(): void {
    const link = `${window.location.origin}/room/${roomId}`;
    void navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (sync.error) {
    return (
      <div className={styles.page}>
        <p role="alert">{sync.error}</p>
      </div>
    );
  }
  if (sync.loading || !sync.room) {
    return (
      <div className={styles.page}>
        <p role="status">Xona yuklanmoqda…</p>
      </div>
    );
  }
  if (imageError) {
    return (
      <div className={styles.page}>
        <p role="alert">{imageError}</p>
      </div>
    );
  }
  if (!sync.game || !image || !geometry) {
    return (
      <div className={styles.page}>
        <p role="status">O&apos;yin yuklanmoqda…</p>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.sidebar}>
        <div className={styles.inviteRow}>
          <code className={styles.inviteCode}>{roomId}</code>
          <button type="button" className="btn btn-secondary" onClick={copyInviteLink}>
            {copied ? "Nusxalandi!" : "Havolani nusxalash"}
          </button>
        </div>
        <p className={styles.modeInfo}>
          {sync.game.mode === "classic" ? "Klassik" : "Erkin"} rejim · {sync.game.pieceCount} bo&apos;lak
        </p>
        <p className={styles.progressInfo} role="status" aria-live="polite">
          Progress: {Math.round(progress * 100)}%
        </p>
        <h2>Ishtirokchilar</h2>
        <ul className={styles.participants}>
          {sync.participants.map((p) => (
            <li key={p.uid}>
              <span className={p.online ? styles.online : styles.offline} aria-hidden="true" />
              {p.displayName}
              <span className="visually-hidden">{p.online ? " (onlayn)" : " (oflayn)"}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={styles.boardArea}>
        <PuzzleBoard
          geometry={geometry}
          image={image}
          imageWidthPx={image.naturalWidth}
          imageHeightPx={image.naturalHeight}
          mode={sync.game.mode}
          snapEnabled={sync.game.snapEnabled}
          rotationEnabled={sync.game.rotationEnabled}
          snapToleranceRatio={sync.game.snapToleranceRatio}
          seed={sync.game.geometrySeed}
          initialPositions={initialPositions}
          onEngineReady={(engine) => {
            engineRef.current = engine;
          }}
          onProgressChange={setProgress}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onCommitPositions={handleCommitPositions}
        />
      </div>
    </div>
  );
}
