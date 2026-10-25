import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import { useRoomSync } from "@/features/puzzle/synchronization/useRoomSync";
import { api, getSocket } from "@/lib/api";
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const engineRef = useRef<PuzzleEngine | null>(null);

  const gameId = sync.game?.gameId;
  const imageId = sync.game?.imageId;
  const geometrySeed = sync.game?.geometrySeed;
  const pieceCount = sync.game?.pieceCount;
  const geometryVersion = sync.game?.geometryVersion;

  useEffect(() => {
    if (!imageId || !geometrySeed || !pieceCount) return;
    let cancelled = false;
    loadPuzzleImage(imageId)
      .then((img) => {
        if (cancelled) return;
        setImage(img);
        setGeometry(
          generatePuzzleGeometry({
            seed: geometrySeed,
            geometryVersion: geometryVersion ?? 1,
            pieceCount: pieceCount,
            imageAspectRatio: img.naturalWidth / img.naturalHeight,
          }),
        );
      })
      .catch((err) => setImageError(err instanceof Error ? err.message : "Rasmni yuklab bo'lmadi."));
    return () => {
      cancelled = true;
    };
  }, [gameId, imageId, geometrySeed, pieceCount, geometryVersion]);

  const initialPositions = useMemo<Map<number, PiecePosition>>(() => {
    const map = new Map<number, PiecePosition>();
    for (const [pieceId, piece] of sync.pieces) {
      map.set(pieceId, { x: piece.x, y: piece.y, rotation: piece.rotation });
    }
    return map;
  }, [sync.pieces]);

  const localCommitTimesRef = useRef<Map<number, { timestamp: number; pos: PiecePosition }>>(new Map());

  // Apply every remote snapshot update to the live engine (guarded against reverting recent local moves).
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const now = Date.now();
    for (const [pieceId, piece] of sync.pieces) {
      const localCommit = localCommitTimesRef.current.get(pieceId);
      // If we moved this piece locally within the last 3000ms and server still has old coordinates, don't revert it!
      if (localCommit && (now - localCommit.timestamp < 3000)) {
        if (Math.abs(piece.x - localCommit.pos.x) > 1 || Math.abs(piece.y - localCommit.pos.y) > 1) {
          continue;
        }
      }
      engine.applyRemotePieceUpdate(pieceId, { x: piece.x, y: piece.y, rotation: piece.rotation }, piece.groupId);
      engine.setPieceLockedByOther(pieceId, Boolean(piece.lockedBy) && piece.lockedBy !== sync.myUid);
    }
  }, [sync.pieces, sync.myUid]);

  async function handleDragStart(pieceIds: readonly number[]): Promise<void> {
    void pieceIds;
  }

  function handleDragMove(pieceIds: readonly number[], positions: ReadonlyMap<number, PiecePosition>): void {
    for (const pieceId of pieceIds) {
      const position = positions.get(pieceId);
      if (position) getSocket().emit("piece:move", { roomId, pieceId, ...position });
    }
  }

  async function handleCommitPositions(changed: ReadonlyMap<number, PiecePosition>): Promise<void> {
    const now = Date.now();
    for (const [pieceId, position] of changed) {
      localCommitTimesRef.current.set(pieceId, { timestamp: now, pos: position });
    }
    if (!user || !sync.game) return;
    const engine = engineRef.current;
    const piecesToSend = Array.from(changed.entries()).map(([pieceId, position]) => ({
      pieceId,
      ...position,
      groupId: engine?.getGroupId(pieceId) ?? (sync.pieces.get(pieceId)?.groupId ?? `g${pieceId}`),
    }));
    try {
      await api(`/api/rooms/${encodeURIComponent(roomId)}/pieces`, {
        method: "POST",
        body: JSON.stringify({ gameId: sync.game.gameId, pieces: piecesToSend }),
      });
    } catch (err) {
      console.warn("Failed to persist committed pieces:", err);
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
        <div style={{ margin: "auto", textAlign: "center", padding: "2rem" }}>
          <p role="alert" style={{ color: "var(--color-danger)", fontSize: "16px" }}>{imageError}</p>
        </div>
      </div>
    );
  }
  if (!sync.game || !image || !geometry) {
    return (
      <div className={styles.page}>
        <div style={{ margin: "auto", textAlign: "center", padding: "2rem" }}>
          <p role="status" style={{ color: "var(--color-text-muted)", fontSize: "16px" }}>O&apos;yin yuklanmoqda…</p>
        </div>
      </div>
    );
  }

  const progressPercent = Math.round(progress * 100);

  return (
    <div className={styles.page}>
      {/* Sidebar Toggle Button */}
      <button
        type="button"
        className={styles.sidebarToggleBtn}
        onClick={() => setIsSidebarOpen((prev) => !prev)}
        title={isSidebarOpen ? "Yon panelni yashirish" : "Yon panelni ochish"}
        aria-label="Yon panel holati"
      >
        {isSidebarOpen ? "◀" : "▶"}
      </button>

      {/* Apple Liquid Glass Sidebar */}
      <aside className={`${styles.sidebar} ${!isSidebarOpen ? styles.sidebarCollapsed : ""}`}>
        <div className={styles.roomHeader}>
          <span className={styles.roomTitle}>Xona ma&apos;lumotlari</span>
          <div className={styles.inviteRow}>
            <code className={styles.inviteCode} title={roomId}>{roomId}</code>
            <button
              type="button"
              className={`btn btn-secondary ${styles.copyBtn} ${copied ? styles.copyBtnSuccess : ""}`}
              onClick={copyInviteLink}
            >
              {copied ? "✓ Nusxalandi" : "Nusxalash"}
            </button>
          </div>
        </div>

        <div className={styles.modeBadge}>
          <span>✦</span>
          <span>{sync.game.mode === "classic" ? "Klassik" : "Erkin"} rejim · {sync.game.pieceCount} bo&apos;lak</span>
        </div>

        {/* Progress Card */}
        <div className={styles.progressCard}>
          <div className={styles.progressLabelRow}>
            <span>Yig&apos;ilish jarayoni</span>
            <span className={styles.progressValue}>{progressPercent}%</span>
          </div>
          <div className={styles.progressBarBg} role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
            <div className={styles.progressBarFill} style={{ width: `${progressPercent}%` }} />
          </div>
        </div>

        {/* Participants list */}
        <div className={styles.participantsSection}>
          <span className={styles.sectionHeader}>Ishtirokchilar ({sync.participants.length})</span>
          <ul className={styles.participants}>
            {sync.participants.map((p) => (
              <li key={p.uid} className={styles.participantItem}>
                <span
                  className={`${styles.statusDot} ${p.online ? styles.online : styles.offline}`}
                  aria-hidden="true"
                />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.displayName}
                </span>
                <span className="visually-hidden">{p.online ? " (onlayn)" : " (oflayn)"}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Main Board Area */}
      <main className={styles.boardArea}>
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
      </main>
    </div>
  );
}
