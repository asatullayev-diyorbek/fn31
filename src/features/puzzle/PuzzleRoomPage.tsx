import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import { useRoomSync } from "@/features/puzzle/synchronization/useRoomSync";
import { completeRoom, deleteRoom } from "@/features/rooms/roomsApi";
import { api, getSocket } from "@/lib/api";
import { loadPuzzleImage } from "@/features/images/loadPuzzleImage";
import { galleryLabelFromId, isGalleryImageId } from "@/features/images/gallery";
import { generatePuzzleGeometry, type GeometryResult } from "@/features/puzzle/geometry";
import { PuzzleBoard } from "./PuzzleBoard";
import type { PuzzleEngine } from "@/features/puzzle/engine/PuzzleEngine";
import type { PiecePosition } from "@/features/puzzle/interactions";
import styles from "./PuzzleRoomPage.module.css";

function formatCreatedDate(isoDateString?: string): string {
  if (!isoDateString) return "25.10.2026, 14:32";
  const date = new Date(isoDateString);
  if (isNaN(date.getTime())) return isoDateString;

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${day}.${month}.${year}, ${hours}:${minutes}`;
}

function PuzzleOverlay(): JSX.Element {
  return (
    <svg className={styles.roomThumbOverlay} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="thumbShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0.5" dy="0.5" stdDeviation="0.4" floodColor="#000000" floodOpacity="0.55" />
        </filter>
      </defs>
      <path
        d="M 0 50 L 34 50 C 34 40, 42 40, 45 45 C 48 50, 52 50, 55 45 C 58 40, 66 40, 66 50 L 100 50"
        stroke="rgba(255, 255, 255, 0.65)"
        strokeWidth="1.2"
        filter="url(#thumbShadow)"
      />
      <path
        d="M 50 0 L 50 34 C 40 34, 40 42, 45 45 C 50 48, 50 52, 45 55 C 40 58, 40 66, 50 66 L 50 100"
        stroke="rgba(255, 255, 255, 0.65)"
        strokeWidth="1.2"
        filter="url(#thumbShadow)"
      />
    </svg>
  );
}

export function PuzzleRoomPage(): JSX.Element {
  const { roomId = "" } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const sync = useRoomSync(roomId);

  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [geometry, setGeometry] = useState<GeometryResult | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const completionShownRef = useRef(false);

  const engineRef = useRef<PuzzleEngine | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const onRoomDeleted = () => {
      alert("Bu xona egasi tomonidan o'chirildi.");
      navigate("/dashboard");
    };
    socket.on("room:deleted", onRoomDeleted);
    return () => {
      socket.off("room:deleted", onRoomDeleted);
    };
  }, [navigate]);

  async function handleDeleteRoom(): Promise<void> {
    setIsDeleting(true);
    try {
      await deleteRoom(roomId);
      navigate("/dashboard");
    } catch (err) {
      console.warn("Failed to delete room:", err);
      navigate("/dashboard");
    } finally {
      setIsDeleting(false);
    }
  }

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

  // Apply remote snapshot updates to the live engine
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const now = Date.now();
    for (const [pieceId, piece] of sync.pieces) {
      const localCommit = localCommitTimesRef.current.get(pieceId);
      if (localCommit && now - localCommit.timestamp < 3000) {
        if (Math.abs(piece.x - localCommit.pos.x) > 1 || Math.abs(piece.y - localCommit.pos.y) > 1) {
          continue;
        }
      }
      engine.applyRemotePieceUpdate(pieceId, { x: piece.x, y: piece.y, rotation: piece.rotation }, piece.groupId);
      engine.setPieceLockedByOther(pieceId, Boolean(piece.lockedBy) && piece.lockedBy !== sync.myUid);
    }
  }, [sync.pieces, sync.myUid]);

  const completedAt = sync.game?.completedAt ?? null;

  useEffect(() => {
    if (completedAt && !completionShownRef.current) {
      completionShownRef.current = true;
      setShowCompletionModal(true);
    }
  }, [completedAt]);

  async function handlePuzzleComplete(): Promise<void> {
    if (!sync.game) return;
    try {
      await completeRoom(roomId, sync.game.gameId);
    } catch (err) {
      console.warn("Failed to mark room complete:", err);
    }
  }

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

  function handleShare(): void {
    const link = `${window.location.origin}/room/${roomId}`;
    if (typeof navigator.share === "function") {
      navigator.share({ title: "Puzzle Together xonasi", url: link }).catch(() => {
        copyInviteLink();
      });
    } else {
      copyInviteLink();
    }
  }

  if (sync.error) {
    return (
      <div className={styles.page}>
        <div style={{ margin: "auto", textAlign: "center", padding: "2rem" }}>
          <p role="alert" style={{ color: "#ef4444", fontSize: "16px" }}>{sync.error}</p>
          <Link to="/dashboard" className="btn btn-secondary" style={{ marginTop: "1rem" }}>
            Boshqaruv paneliga qaytish
          </Link>
        </div>
      </div>
    );
  }

  if (sync.loading || !sync.room) {
    return (
      <div className={styles.page}>
        <div style={{ margin: "auto", textAlign: "center", padding: "2rem" }}>
          <p role="status" style={{ color: "#9ba8c0", fontSize: "16px" }}>Xona yuklanmoqda…</p>
        </div>
      </div>
    );
  }

  if (imageError) {
    return (
      <div className={styles.page}>
        <div style={{ margin: "auto", textAlign: "center", padding: "2rem" }}>
          <p role="alert" style={{ color: "#ef4444", fontSize: "16px" }}>{imageError}</p>
        </div>
      </div>
    );
  }

  if (!sync.game || !image || !geometry) {
    return (
      <div className={styles.page}>
        <div style={{ margin: "auto", textAlign: "center", padding: "2rem" }}>
          <p role="status" style={{ color: "#9ba8c0", fontSize: "16px" }}>O&apos;yin yuklanmoqda…</p>
        </div>
      </div>
    );
  }

  const progressPercent = Math.round(progress * 100);
  const totalPieces = sync.game.pieceCount;
  const placedPieces = Math.min(totalPieces, Math.round(progress * totalPieces));
  const puzzleTitle = isGalleryImageId(sync.game.imageId)
    ? galleryLabelFromId(sync.game.imageId)
    : "Yuklangan rasm";
  const isOwner = Boolean(user && sync.room && user.uid === sync.room.ownerUid);

  return (
    <div className={styles.page}>
      {/* Floating Expand Button (shown when sidebar is closed) */}
      {!isSidebarOpen && (
        <button
          type="button"
          className={styles.sidebarExpandBtn}
          onClick={() => setIsSidebarOpen(true)}
          title="Yon panelni ochish"
          aria-label="Yon panelni ochish"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <polyline points="12 9 15 12 12 15" />
          </svg>
          <span>Menyu</span>
        </button>
      )}

      {/* 1. LEFT SIDEBAR */}
      <aside className={`${styles.sidebar} ${!isSidebarOpen ? styles.sidebarCollapsed : ""}`}>
        {/* Top row with Back button and Collapse button */}
        <div className={styles.sidebarTopRow}>
          <Link to="/dashboard" className={styles.backNavBtn}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Boshqaruv paneli</span>
          </Link>

          <button
            type="button"
            className={styles.sidebarCollapseBtn}
            onClick={() => setIsSidebarOpen(false)}
            title="Yon panelni yashirish"
            aria-label="Yon panelni yashirish"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <polyline points="15 9 12 12 15 15" />
            </svg>
          </button>
        </div>

        {/* Room Header Card */}
        <div className={styles.roomProfileCard}>
          <div className={styles.roomCardTop}>
            <div className={styles.roomThumbBox}>
              <img src={image.src} alt={puzzleTitle} className={styles.roomThumbImg} />
              <PuzzleOverlay />
            </div>
            <div className={styles.roomCardMeta}>
              <h2 className={styles.roomTitle}>{puzzleTitle}</h2>
              <div className={styles.statusChip}>
                <span className={styles.statusDot} />
                <span>Faol</span>
              </div>
            </div>
          </div>

          {/* Room Code */}
          <div className={styles.roomCodeRow}>
            <span>Xona kodi: <strong className={styles.roomCodeText}>{roomId}</strong></span>
            <button
              type="button"
              className={styles.copyCodeBtn}
              onClick={copyInviteLink}
              title="Xona kodini nusxalash"
              aria-label="Xona kodini nusxalash"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>

          {/* Actions */}
          <div className={styles.roomActionsRow}>
            <button
              type="button"
              className={styles.primaryCopyBtn}
              onClick={copyInviteLink}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
              <span>{copied ? "✓ Nusxalandi" : "Nusxalash"}</span>
            </button>

            <button
              type="button"
              className={styles.shareIconBtn}
              onClick={handleShare}
              title="Do'stlar bilan ulashish"
              aria-label="Ulashish"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mode & Pieces Meta Card */}
        <div className={styles.metaChipsCard}>
          <div className={styles.metaChipsRow}>
            <div className={chipGroupStyle()}>
              <span className={styles.metaChip}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span>{sync.game.mode === "classic" ? "Klassik rejim" : "Erkin rejim"}</span>
              </span>
              <span className={styles.metaChip}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19.439 7.85c0-1.57.802-2.5 1.561-2.5V3h-4.35c0-.759-.93-1.561-2.5-1.561s-2.5.802-2.5 1.561H7.3c-.718 0-1.3.582-1.3 1.3v4.35c-.759 0-1.561.93-1.561 2.5s.802 2.5 1.561 2.5v4.35c0 .718.582 1.3 1.3 1.3h4.35c0 .759.93 1.561 2.5 1.561s2.5-.802 2.5-1.561h4.35c.718 0 1.3-.582 1.3-1.3v-4.35c.759 0 1.561-.93 1.561-2.5s-.802-2.5-1.561-2.5v-.4z" />
                </svg>
                <span>{totalPieces} bo&apos;lak</span>
              </span>
            </div>
            <button
              type="button"
              className={styles.settingsTriggerBtn}
              onClick={() => setShowSettingsModal(true)}
              title="Xona sozlamalari"
              aria-label="Xona sozlamalari"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
          <div className={styles.createdDateLine}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>Yaratilgan: {formatCreatedDate(sync.room.createdAt)}</span>
          </div>
        </div>

        {/* Progress Card */}
        <div className={styles.progressCard}>
          <div className={styles.progressHeader}>
            <span className={styles.progressTitle}>Yig&apos;ilish jarayoni</span>
            <span className={styles.progressPercent}>{progressPercent}%</span>
          </div>
          <div className={styles.progressBarTrack} role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
            <div className={styles.progressBarFill} style={{ width: `${progressPercent}%` }} />
          </div>
          <div className={styles.progressFooter}>
            <span>{placedPieces} / {totalPieces} bo&apos;lak</span>
            <span className={styles.progressEncouragement}>
              {progressPercent === 100 ? "🏆 Bajarildi!" : "🏆 Davom eting!"}
            </span>
          </div>
        </div>

        {/* Participants Section */}
        <div className={styles.participantsSection}>
          <div className={styles.participantsHeader}>
            <h3 className={styles.participantsTitle}>Ishtirokchilar ({sync.participants.length})</h3>
            <button
              type="button"
              className={styles.invitePillBtn}
              onClick={copyInviteLink}
            >
              Taklif qilish
            </button>
          </div>

          <ul className={styles.participantsList}>
            {sync.participants.map((p) => {
              const isMe = p.uid === sync.myUid;
              return (
                <li key={p.uid} className={styles.participantItem}>
                  <div className={styles.participantAvatar}>
                    {p.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className={styles.participantDetails}>
                    <div className={styles.participantNameRow}>
                      <span className={styles.participantName}>{p.displayName}</span>
                      {isMe && <span className={styles.youBadge}>👑 Siz</span>}
                    </div>
                    {!isMe && (
                      <span className={styles.participantStatusText}>
                        {p.online ? "Online" : "Offline"}
                      </span>
                    )}
                  </div>
                  <div
                    className={p.online ? styles.onlineDot : styles.offlineDot}
                    aria-hidden="true"
                  />
                </li>
              );
            })}
          </ul>
        </div>

        {/* Bottom actions */}
        <div className={styles.sidebarBottomActions}>
          <button
            type="button"
            className={styles.sidebarActionBtn}
            onClick={() => setShowSettingsModal(true)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Xona sozlamalari</span>
          </button>

          {isOwner && (
            <button
              type="button"
              className={`${styles.sidebarActionBtn} ${styles.leaveRoomBtn}`}
              onClick={() => setShowDeleteModal(true)}
              style={{ color: "#f87171", borderColor: "rgba(239, 68, 68, 0.25)" }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
              <span>Xonani o&apos;chirish</span>
            </button>
          )}

          <button
            type="button"
            className={`${styles.sidebarActionBtn} ${styles.leaveRoomBtn}`}
            onClick={() => navigate("/dashboard")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Xonani tark etish</span>
          </button>
        </div>
      </aside>

      {/* 2. MAIN BOARD AREA */}
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
          progress={progress}
          initialPositions={initialPositions}
          onEngineReady={(engine) => {
            engineRef.current = engine;
          }}
          onProgressChange={setProgress}
          onComplete={handlePuzzleComplete}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onCommitPositions={handleCommitPositions}
        />
      </main>

      {/* 3. SETTINGS MODAL */}
      {showSettingsModal && (
        <div
          className={styles.settingsOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          onClick={() => setShowSettingsModal(false)}
        >
          <div className={styles.settingsModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.settingsHeader}>
              <h2 id="settings-title" className={styles.settingsTitle}>Xona sozlamalari</h2>
              <button
                type="button"
                className={styles.settingsCloseBtn}
                onClick={() => setShowSettingsModal(false)}
                aria-label="Yopish"
              >
                ✕
              </button>
            </div>
            <div className={styles.settingsBody}>
              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Xona kodi</span>
                <span className={styles.settingValue}>{roomId}</span>
              </div>
              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>O&apos;yin rejimi</span>
                <span className={styles.settingValue}>
                  {sync.game.mode === "classic" ? "Klassik rejim" : "Erkin rejim"}
                </span>
              </div>
              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Bo&apos;laklar soni</span>
                <span className={styles.settingValue}>{sync.game.pieceCount} ta</span>
              </div>
              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Yopishish (Snap)</span>
                <span className={styles.settingValue}>{sync.game.snapEnabled ? "Yoqilgan" : "O'chirilgan"}</span>
              </div>
              <div className={styles.settingRow}>
                <span className={styles.settingLabel}>Aylantirish (Rotation)</span>
                <span className={styles.settingValue}>{sync.game.rotationEnabled ? "Yoqilgan (R)" : "O'chirilgan"}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={copyInviteLink}
              >
                Havolani nusxalash
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowSettingsModal(false)}
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3.5. DELETE CONFIRMATION MODAL */}
      {showDeleteModal && (
        <div
          className={styles.settingsOverlay}
          role="dialog"
          aria-modal="true"
          onClick={() => !isDeleting && setShowDeleteModal(false)}
        >
          <div className={styles.settingsModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.settingsHeader}>
              <h2 className={styles.settingsTitle} style={{ color: "#ef4444" }}>Xonani o&apos;chirish</h2>
              <button
                type="button"
                className={styles.settingsCloseBtn}
                onClick={() => setShowDeleteModal(false)}
                aria-label="Yopish"
              >
                ✕
              </button>
            </div>
            <p style={{ color: "#9ba8c0", fontSize: "14px", lineHeight: "1.5", margin: 0 }}>
              Haqiqatan ham bu xonani butunlay o&apos;chirmoqchimisiz? Barcha ishtirokchilar uchun o&apos;yin to&apos;xtatiladi va xona ma&apos;lumotlari o&apos;chiriladi.
            </p>
            <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                Bekor qilish
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, background: "#ef4444", borderColor: "#ef4444" }}
                onClick={handleDeleteRoom}
                disabled={isDeleting}
              >
                {isDeleting ? "O'chirilmoqda…" : "Ha, o'chirilsin"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. COMPLETION CELEBRATION MODAL */}
      {showCompletionModal && (
        <div className={styles.completionOverlay} role="dialog" aria-modal="true" aria-labelledby="completion-title">
          <div className={styles.completionModal}>
            <div className={styles.completionIcon} aria-hidden="true">🎉</div>
            <h2 id="completion-title" className={styles.completionTitle}>Tabriklaymiz!</h2>
            <p className={styles.completionSubtitle}>
              Pazl {sync.participants.length > 1 ? `${sync.participants.length} kishi bilan birga` : ""} muvaffaqiyatli yig&apos;ildi.
            </p>
            <div className={styles.completionActions}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate("/create")}
              >
                Yangi pazl yaratish
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowCompletionModal(false)}
              >
                Yopish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function chipGroupStyle(): string {
  return styles.chipGroup ?? "";
}
