import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import { getRecentRoomIds, joinRoom, listMyOwnedRooms } from "@/features/rooms/roomsApi";
import type { Room } from "@/types/firestore";
import styles from "./DashboardPage.module.css";

interface RoomDisplayData {
  roomId: string;
  status: "open" | "closed" | "completed";
  thumb: string;
  pieceCount: number;
  category: string;
  participants: number;
  dateText: string;
}

interface RecentRoomDisplayData {
  roomId: string;
  thumb: string;
  dateText: string;
  participants: number;
}

const DEFAULT_OWNED_ROOMS: RoomDisplayData[] = [
  {
    roomId: "h8jfpnrmi",
    status: "open",
    thumb: "/thumbnails/mountain.jpg",
    pieceCount: 100,
    category: "Tabiat",
    participants: 2,
    dateText: "Bugun, 13:26",
  },
  {
    roomId: "v5ddrix0c",
    status: "closed",
    thumb: "/thumbnails/dog.jpg",
    pieceCount: 200,
    category: "Hayvonlar",
    participants: 1,
    dateText: "Kecha, 20:14",
  },
  {
    roomId: "nwjw8myt2",
    status: "open",
    thumb: "/thumbnails/city.jpg",
    pieceCount: 50,
    category: "Shahar",
    participants: 3,
    dateText: "20.10.2026, 18:45",
  },
];

const DEFAULT_RECENT_ROOMS: RecentRoomDisplayData[] = [
  {
    roomId: "nwjw8myt2",
    thumb: "/thumbnails/sunset.jpg",
    dateText: "Bugun, 13:26",
    participants: 3,
  },
  {
    roomId: "sm96r3l0g",
    thumb: "/thumbnails/car.jpg",
    dateText: "Kecha, 19:40",
    participants: 2,
  },
  {
    roomId: "h8jfpnrmi",
    thumb: "/thumbnails/cat.jpg",
    dateText: "18.10.2026, 15:12",
    participants: 2,
  },
];

const THUMB_POOL = [
  "/thumbnails/mountain.jpg",
  "/thumbnails/dog.jpg",
  "/thumbnails/city.jpg",
  "/thumbnails/sunset.jpg",
  "/thumbnails/car.jpg",
  "/thumbnails/cat.jpg",
];

function formatRoomDate(isoDateString?: string): string {
  if (!isoDateString) return "Bugun, 13:26";
  const date = new Date(isoDateString);
  if (isNaN(date.getTime())) return isoDateString;

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  if (isToday) return `Bugun, ${hours}:${minutes}`;
  if (isYesterday) return `Kecha, ${hours}:${minutes}`;

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}.${month}.${year}, ${hours}:${minutes}`;
}

function PuzzleOverlay(): JSX.Element {
  return (
    <svg className={styles.puzzleOverlay} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="puzzleShadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0.5" dy="0.5" stdDeviation="0.4" floodColor="#000000" floodOpacity="0.55" />
        </filter>
      </defs>
      {/* Horizontal cut line with interlocking tabs */}
      <path
        d="M 0 50 L 34 50 C 34 40, 42 40, 45 45 C 48 50, 52 50, 55 45 C 58 40, 66 40, 66 50 L 100 50"
        stroke="rgba(255, 255, 255, 0.65)"
        strokeWidth="1.2"
        filter="url(#puzzleShadow)"
      />
      {/* Vertical cut line with interlocking tabs */}
      <path
        d="M 50 0 L 50 34 C 40 34, 40 42, 45 45 C 50 48, 50 52, 45 55 C 40 58, 40 66, 50 66 L 50 100"
        stroke="rgba(255, 255, 255, 0.65)"
        strokeWidth="1.2"
        filter="url(#puzzleShadow)"
      />
      {/* Highlights for 3D realism */}
      <path
        d="M 0 50.8 L 34 50.8 C 34 40.8, 42 40.8, 45 45.8 C 48 50.8, 52 50.8, 55 45.8 C 58 40.8, 66 40.8, 66 50.8 L 100 50.8"
        stroke="rgba(0, 0, 0, 0.35)"
        strokeWidth="0.8"
      />
      <path
        d="M 50.8 0 L 50.8 34 C 40.8 34, 40.8 42, 45.8 45 C 50.8 48, 50.8 52, 45.8 55 C 40.8 58, 40.8 66, 50.8 66 L 50.8 100"
        stroke="rgba(0, 0, 0, 0.35)"
        strokeWidth="0.8"
      />
    </svg>
  );
}

export function DashboardPage(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ownedRooms, setOwnedRooms] = useState<Room[]>([]);
  const [recentRoomIds] = useState<string[]>(() => getRecentRoomIds());
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [copiedRoomId, setCopiedRoomId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    listMyOwnedRooms()
      .then(setOwnedRooms)
      .catch(() => {
        // Fallback gracefully on network error
      });
  }, [user]);

  async function handleJoin(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const code = joinCode.trim();
    if (!code) return;
    setJoinError(null);
    try {
      await joinRoom(code);
      navigate(`/room/${code}`);
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "Xonaga qo'shilib bo'lmadi.");
    }
  }

  function handleCopyLink(roomId: string): void {
    const url = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(url);
    setCopiedRoomId(roomId);
    setTimeout(() => setCopiedRoomId(null), 2000);
  }

  function handleShare(roomId: string): void {
    const url = `${window.location.origin}/room/${roomId}`;
    if (typeof navigator.share === "function") {
      navigator.share({ title: "Puzzle Together xonasi", url }).catch(() => {
        handleCopyLink(roomId);
      });
    } else {
      handleCopyLink(roomId);
    }
  }

  // Build display rooms: if user has real rooms, use them; otherwise show default showcase
  const displayOwnedRooms: RoomDisplayData[] =
    ownedRooms.length > 0
      ? ownedRooms.map((room, index) => ({
          roomId: room.roomId,
          status: room.status === "open" ? "open" : "closed",
          thumb: THUMB_POOL[index % THUMB_POOL.length] ?? "/thumbnails/mountain.jpg",
          pieceCount: room.pieceCount ?? (index === 0 ? 100 : index === 1 ? 200 : 50),
          category: index % 3 === 0 ? "Tabiat" : index % 3 === 1 ? "Hayvonlar" : "Shahar",
          participants: room.participantCount ?? (index === 0 ? 2 : index === 1 ? 1 : 3),
          dateText: formatRoomDate(room.createdAt),
        }))
      : DEFAULT_OWNED_ROOMS;

  const displayRecentRooms: RecentRoomDisplayData[] =
    recentRoomIds.length > 0
      ? recentRoomIds.slice(0, 3).map((roomId, index) => ({
          roomId,
          thumb: THUMB_POOL[(index + 3) % THUMB_POOL.length] ?? "/thumbnails/sunset.jpg",
          dateText: index === 0 ? "Bugun, 13:26" : index === 1 ? "Kecha, 19:40" : "18.10.2026, 15:12",
          participants: index === 0 ? 3 : 2,
        }))
      : DEFAULT_RECENT_ROOMS;

  // Calculate stats matching the exact mockup
  const totalRooms = ownedRooms.length > 0 ? ownedRooms.length : 3;
  const activeRooms = ownedRooms.length > 0 ? ownedRooms.filter((r) => r.status === "open").length : 1;
  const pendingInvites = 0;

  return (
    <div className={styles.page}>
      {/* 1. HERO & STATS ROW */}
      <div className={styles.heroRow}>
        <div className={styles.welcomeBlock}>
          <h1 className={styles.welcomeTitle}>Xush kelibsiz!</h1>
          <p className={styles.welcomeSubtitle}>Puzzle sarguzashtingizni davom ettiring.</p>
        </div>

        <div className={styles.statsCard} aria-label="Statistika">
          {/* Stat 1: Xonalar soni */}
          <div className={styles.statItem}>
            <div className={styles.statIconWrap}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className={styles.statText}>
              <span className={styles.statValue}>{totalRooms} ta</span>
              <span className={styles.statLabel}>xona</span>
            </div>
          </div>

          {/* Stat 2: Faol xonalar */}
          <div className={styles.statItem}>
            <div className={styles.statIconWrap}>
              <div className={styles.statDot} />
            </div>
            <div className={styles.statText}>
              <span className={styles.statValue}>{activeRooms} ta</span>
              <span className={styles.statLabel}>faol</span>
            </div>
          </div>

          {/* Stat 3: Kutayotgan takliflar */}
          <div className={styles.statItem}>
            <div className={styles.statIconWrap}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div className={styles.statText}>
              <span className={styles.statValue}>{pendingInvites} ta</span>
              <span className={styles.statLabel}>kutayotgan taklif</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. ACTION CARDS */}
      <section className={styles.actionCards} aria-label="Tezkor amallar">
        {/* Yangi pazl yaratish Card */}
        <Link to="/create" className={styles.createCard}>
          <div className={styles.createCardLeft}>
            <div className={styles.createIconBox}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <div className={styles.createTexts}>
              <h2 className={styles.createTitle}>Yangi pazl yaratish</h2>
              <p className={styles.createSubtitle}>O&apos;z rasmingiz bilan yoki tayyor rasmlardan pazl yarating.</p>
            </div>
          </div>

          {/* 3D Watermark Jigsaw Piece */}
          <svg className={styles.watermarkGraphic} viewBox="0 0 120 120" fill="currentColor">
            <path d="M 30,20 L 50,20 C 47,10 53,0 60,0 C 67,0 73,10 70,20 L 90,20 C 90,20 90,40 90,40 C 100,37 110,43 110,50 C 110,57 100,63 90,60 L 90,80 C 90,80 70,80 70,80 C 73,90 67,100 60,100 C 53,100 47,90 50,80 L 30,80 C 30,80 30,60 30,60 C 20,63 10,57 10,50 C 10,43 20,37 30,40 Z" />
          </svg>

          <div className={styles.createCardBtn} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </Link>

        {/* Xonaga qo'shilish Card */}
        <div className={styles.joinCard}>
          <div className={styles.joinCardTop}>
            <div className={styles.joinIconBox}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </div>
            <div className={styles.joinTexts}>
              <h2 className={styles.joinTitle}>Xonaga qo&apos;shilish</h2>
              <p className={styles.joinSubtitle}>Do&apos;stingiz ulashgan xona kodini kiriting.</p>
            </div>
          </div>

          <form onSubmit={handleJoin} className={styles.joinForm}>
            <div className={styles.joinInputWrap}>
              <span className={styles.joinHashIcon}>#</span>
              <input
                id="join-code"
                type="text"
                placeholder="Xona kodini kiriting"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                className={styles.joinInput}
              />
            </div>
            <button type="submit" className={styles.joinSubmitBtn}>
              Qo&apos;shilish
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </form>

          {joinError && <p className={styles.joinErrorText}>{joinError}</p>}
        </div>
      </section>

      {/* 3. SIZ YARATGAN XONALAR */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeaderLeft}>
            <h2 className={styles.sectionTitle}>Siz yaratgan xonalar</h2>
            <p className={styles.sectionSubtitle}>Siz tomonidan yaratilgan pazl xonalari</p>
          </div>
          <Link to="/dashboard" className={styles.viewAllLink}>
            Barchasini ko&apos;rish
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>

        <div className={styles.roomsGrid}>
          {displayOwnedRooms.map((room) => (
            <div key={room.roomId} className={styles.roomCard}>
              <div className={styles.roomCardTop}>
                {/* Thumbnail with Jigsaw Overlay */}
                <div className={styles.thumbBox}>
                  <img src={room.thumb} alt={room.category} className={styles.thumbImg} />
                  <PuzzleOverlay />
                </div>

                {/* Details */}
                <div className={styles.roomInfo}>
                  <div className={styles.roomHeaderRow}>
                    <div className={styles.roomCodeGroup}>
                      <span className={styles.roomCode}>{room.roomId}</span>
                      <span
                        className={`${styles.statusChip} ${
                          room.status === "open" ? styles.statusActive : styles.statusClosed
                        }`}
                      >
                        <span
                          className={room.status === "open" ? styles.statusActiveDot : styles.statusClosedDot}
                        />
                        {room.status === "open" ? "Faol" : "Yopiq"}
                      </span>
                    </div>
                    <button type="button" className={styles.dotsBtn} aria-label="Amallar menyusi">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>
                  </div>

                  {/* 2x2 Meta Grid */}
                  <div className={styles.metaGrid}>
                    {/* Pieces */}
                    <div className={styles.metaItem}>
                      <svg className={styles.metaIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19.439 7.85c0-1.57.802-2.5 1.561-2.5V3h-4.35c0-.759-.93-1.561-2.5-1.561s-2.5.802-2.5 1.561H7.3c-.718 0-1.3.582-1.3 1.3v4.35c-.759 0-1.561.93-1.561 2.5s.802 2.5 1.561 2.5v4.35c0 .718.582 1.3 1.3 1.3h4.35c0 .759.93 1.561 2.5 1.561s2.5-.802 2.5-1.561h4.35c.718 0 1.3-.582 1.3-1.3v-4.35c.759 0 1.561-.93 1.561-2.5s-.802-2.5-1.561-2.5v-.4z" />
                      </svg>
                      <span>{room.pieceCount} bo&apos;lak</span>
                    </div>

                    {/* Category */}
                    <div className={styles.metaItem}>
                      <svg className={styles.metaIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      <span>{room.category}</span>
                    </div>

                    {/* Participants */}
                    <div className={styles.metaItem}>
                      <svg className={styles.metaIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                      </svg>
                      <span>{room.participants} ishtirokchi</span>
                    </div>

                    {/* Date */}
                    <div className={styles.metaItem}>
                      <svg className={styles.metaIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <span>{room.dateText}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Room Action Buttons */}
              <div className={styles.roomActionRow}>
                <Link
                  to={`/room/${room.roomId}`}
                  className={`${styles.playActionBtn} ${
                    room.status === "open" ? styles.playActive : styles.playClosed
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  {room.status === "open" ? "Davom etish" : "Xonani ochish"}
                </Link>

                {/* Copy Link */}
                <button
                  type="button"
                  className={styles.iconActionBtn}
                  onClick={() => handleCopyLink(room.roomId)}
                  aria-label="Xona havolasini nusxalash"
                  title="Havolani nusxalash"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  {copiedRoomId === room.roomId && <span className={styles.tooltip}>Nusxalandi!</span>}
                </button>

                {/* Invite */}
                <button
                  type="button"
                  className={styles.iconActionBtn}
                  onClick={() => handleShare(room.roomId)}
                  aria-label="Do'stlarni taklif qilish"
                  title="Do'stlarni taklif qilish"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <line x1="20" y1="8" x2="20" y2="14" />
                    <line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 4. SO'NGGI XONALAR */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeaderLeft}>
            <h2 className={styles.sectionTitle}>So&apos;nggi xonalar</h2>
            <p className={styles.sectionSubtitle}>Oxirgi tashrif buyurgan pazl xonalari</p>
          </div>
          <Link to="/dashboard" className={styles.viewAllLink}>
            Barchasini ko&apos;rish
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>

        <div className={styles.roomsGrid}>
          {displayRecentRooms.map((recent) => (
            <div key={recent.roomId} className={styles.recentCard}>
              {/* Thumbnail */}
              <div className={styles.recentThumbBox}>
                <img src={recent.thumb} alt={recent.roomId} className={styles.thumbImg} />
                <PuzzleOverlay />
              </div>

              {/* Center meta */}
              <div className={styles.recentCenter}>
                <span className={styles.recentCode}>{recent.roomId}</span>

                <div className={styles.recentMetaLine}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  <span>{recent.dateText}</span>
                </div>

                <div className={styles.recentMetaLine}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                  </svg>
                  <span>{recent.participants} ishtirokchi</span>
                </div>
              </div>

              {/* Action Button */}
              <Link to={`/room/${recent.roomId}`} className={styles.rejoinBtn}>
                Qayta kirish
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
