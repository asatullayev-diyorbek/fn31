import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import { mediaUrl } from "@/lib/api";
import {
  ADMIN_UID,
  deleteRoomAsAdmin,
  fetchAdminGalleryImages,
  fetchAdminOverview,
  fetchAdminRoomGames,
  fetchAdminRooms,
  fetchAdminUsers,
  type AdminGalleryImage,
  type AdminOverview,
  type AdminRoom,
  type AdminRoomGame,
  type AdminUser,
} from "./adminApi";
import styles from "./AdminPage.module.css";

type Tab = "users" | "rooms" | "gallery";

function resolveImageUrl(imageId: string): string {
  return imageId.startsWith("gallery:")
    ? mediaUrl(`/gallery/${imageId.slice("gallery:".length)}`)
    : mediaUrl(`/media/${imageId}`);
}

function formatDate(isoDateString?: string | null): string {
  if (!isoDateString) return "—";
  const date = new Date(isoDateString);
  if (isNaN(date.getTime())) return isoDateString;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year}, ${hours}:${minutes}`;
}

export function AdminPage(): JSX.Element {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>("users");

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [gallery, setGallery] = useState<AdminGalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingRoomId, setDeletingRoomId] = useState<string | null>(null);
  const [gamesModalRoomId, setGamesModalRoomId] = useState<string | null>(null);
  const [roomGames, setRoomGames] = useState<AdminRoomGame[]>([]);
  const [roomGamesLoading, setRoomGamesLoading] = useState(false);

  const isAdmin = user?.uid === ADMIN_UID;

  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    setLoading(true);
    Promise.all([fetchAdminOverview(), fetchAdminUsers(), fetchAdminRooms(), fetchAdminGalleryImages()])
      .then(([overviewRes, usersRes, roomsRes, galleryRes]) => {
        if (!active) return;
        setOverview(overviewRes);
        setUsers(usersRes);
        setRooms(roomsRes);
        setGallery(galleryRes);
      })
      .catch((err) => active && setError(err instanceof Error ? err.message : "Ma'lumotlarni yuklab bo'lmadi."))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [isAdmin]);

  async function openRoomGames(roomId: string): Promise<void> {
    setGamesModalRoomId(roomId);
    setRoomGamesLoading(true);
    try {
      setRoomGames(await fetchAdminRoomGames(roomId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Pazllar ro'yxatini yuklab bo'lmadi.");
    } finally {
      setRoomGamesLoading(false);
    }
  }

  async function handleDeleteRoom(roomId: string): Promise<void> {
    if (!window.confirm("Bu xonani butunlay o'chirishni tasdiqlaysizmi?")) return;
    setDeletingRoomId(roomId);
    try {
      await deleteRoomAsAdmin(roomId);
      setRooms((prev) => prev.filter((room) => room.roomId !== roomId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xonani o'chirib bo'lmadi.");
    } finally {
      setDeletingRoomId(null);
    }
  }

  if (authLoading) return <div className={styles.page} />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Admin panel</h1>
        <p className={styles.subtitle}>PuzzleTogether — umumiy ko&apos;rsatkichlar va boshqaruv</p>
      </div>

      {error && <p role="alert" className={styles.error}>{error}</p>}

      {overview && (
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{overview.totalUsers}</span>
            <span className={styles.statLabel}>Jami foydalanuvchilar</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>+{overview.newUsersToday}</span>
            <span className={styles.statLabel}>Bugun ro&apos;yxatdan o&apos;tgan</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{overview.totalRooms}</span>
            <span className={styles.statLabel}>Jami xonalar</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{overview.activeRooms}</span>
            <span className={styles.statLabel}>Faol xonalar</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>+{overview.newRoomsToday}</span>
            <span className={styles.statLabel}>Bugun yaratilgan xona</span>
          </div>
          <div className={styles.statCard}>
            <span className={styles.statValue}>{overview.completedPuzzles}</span>
            <span className={styles.statLabel}>Yakunlangan pazllar</span>
          </div>
        </div>
      )}

      <div className={styles.tabs}>
        <button type="button" className={`${styles.tabBtn} ${tab === "users" ? styles.tabBtnActive : ""}`} onClick={() => setTab("users")}>
          Foydalanuvchilar ({users.length})
        </button>
        <button type="button" className={`${styles.tabBtn} ${tab === "rooms" ? styles.tabBtnActive : ""}`} onClick={() => setTab("rooms")}>
          Xonalar ({rooms.length})
        </button>
        <button type="button" className={`${styles.tabBtn} ${tab === "gallery" ? styles.tabBtnActive : ""}`} onClick={() => setTab("gallery")}>
          Galereya ({gallery.length})
        </button>
      </div>

      {loading ? (
        <p className={styles.muted}>Yuklanmoqda…</p>
      ) : (
        <div className={styles.tableWrap}>
          {tab === "users" && (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Ism</th>
                  <th>Username</th>
                  <th>Telegram ID</th>
                  <th>Ro&apos;yxatdan o&apos;tgan</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.displayName}</td>
                    <td>{u.telegramUsername ? `@${u.telegramUsername}` : "—"}</td>
                    <td className={styles.mono}>{u.id.replace(/^tg_/, "")}</td>
                    <td>{formatDate(u.createdAt)}</td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className={styles.muted}>Hali hech kim ro&apos;yxatdan o&apos;tmagan.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {tab === "rooms" && (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Xona</th>
                  <th>Egasi</th>
                  <th>Holati</th>
                  <th>Bo&apos;laklar</th>
                  <th>Ishtirokchilar</th>
                  <th>Pazllar soni</th>
                  <th>Yaratilgan</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <tr key={room.roomId}>
                    <td className={styles.mono}>{room.roomId}</td>
                    <td>{room.ownerDisplayName ?? "—"}</td>
                    <td>
                      <span
                        className={`${styles.badge} ${
                          room.status === "open"
                            ? styles.badgeOpen
                            : room.status === "archived"
                              ? styles.badgeArchived
                              : styles.badgeCompleted
                        }`}
                      >
                        {room.status === "open" ? "Faol" : room.status === "archived" ? "Arxivlangan" : "Yakunlangan"}
                      </span>
                    </td>
                    <td>{room.pieceCount ?? "—"}</td>
                    <td>{room.participantCount}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.gamesCountBtn}
                        onClick={() => void openRoomGames(room.roomId)}
                        title="Bu xonada terilgan rasmlar ro'yxati"
                      >
                        {room.gamesCount}
                      </button>
                    </td>
                    <td>{formatDate(room.createdAt)}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={() => void handleDeleteRoom(room.roomId)}
                        disabled={deletingRoomId === room.roomId}
                      >
                        {deletingRoomId === room.roomId ? "…" : "Butunlay o'chirish"}
                      </button>
                    </td>
                  </tr>
                ))}
                {rooms.length === 0 && (
                  <tr>
                    <td colSpan={8} className={styles.muted}>Hali hech qanday xona yaratilmagan.</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {tab === "gallery" && (
            <div className={styles.galleryGrid}>
              {gallery
                .slice()
                .sort((a, b) => b.usageCount - a.usageCount)
                .map((image) => (
                  <div key={image.imageId} className={styles.galleryCard}>
                    <img
                      src={mediaUrl(`/gallery/${image.imageId.slice("gallery:".length)}`)}
                      alt={image.category}
                      className={styles.galleryThumb}
                    />
                    <div className={styles.galleryMeta}>
                      <span className={styles.galleryCategory}>{image.category}</span>
                      <span className={styles.galleryUsage}>{image.usageCount}x ishlatilgan</span>
                    </div>
                  </div>
                ))}
              {gallery.length === 0 && <p className={styles.muted}>Galereyada rasm yo&apos;q.</p>}
            </div>
          )}
        </div>
      )}

      {gamesModalRoomId && (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={() => setGamesModalRoomId(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>
                Xonada terilgan rasmlar <span className={styles.mono}>({gamesModalRoomId})</span>
              </h2>
              <button type="button" className={styles.modalCloseBtn} onClick={() => setGamesModalRoomId(null)} aria-label="Yopish">
                ✕
              </button>
            </div>
            {roomGamesLoading ? (
              <p className={styles.muted}>Yuklanmoqda…</p>
            ) : (
              <div className={styles.modalGamesList}>
                {roomGames.map((game, index) => (
                  <div key={game.gameId} className={styles.modalGameRow}>
                    <img src={resolveImageUrl(game.imageId)} alt="" className={styles.modalGameThumb} />
                    <div className={styles.modalGameInfo}>
                      <span className={styles.modalGameTitle}>{index + 1}-pazl · {game.pieceCount} bo&apos;lak</span>
                      <span className={styles.galleryUsage}>
                        {game.completedAt ? `Yakunlangan: ${formatDate(game.completedAt)}` : `Boshlangan: ${formatDate(game.createdAt)}`}
                      </span>
                    </div>
                  </div>
                ))}
                {roomGames.length === 0 && <p className={styles.muted}>Bu xonada hali pazl yo&apos;q.</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
