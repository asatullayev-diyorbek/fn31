import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { useAuth } from "@/features/auth/AuthProvider";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { getRecentRoomIds, joinRoom, listMyOwnedRooms } from "@/features/rooms/roomsApi";
import type { Room } from "@/types/firestore";
import styles from "./DashboardPage.module.css";

export function DashboardPage(): JSX.Element {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [ownedRooms, setOwnedRooms] = useState<Room[]>([]);
  const [recentRoomIds] = useState<string[]>(() => getRecentRoomIds());
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [loadingRooms, setLoadingRooms] = useState(true);

  useEffect(() => {
    if (!user) return;
    listMyOwnedRooms(user.uid)
      .then(setOwnedRooms)
      .finally(() => setLoadingRooms(false));
  }, [user]);

  async function handleJoin(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!user || !joinCode.trim()) return;
    setJoinError(null);
    try {
      await joinRoom(joinCode.trim(), user.uid, user.displayName ?? "O'yinchi");
      navigate(`/room/${joinCode.trim()}`);
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : "Xonaga qo'shilib bo'lmadi.");
    }
  }

  async function handleLogout(): Promise<void> {
    await signOut(getFirebaseAuth());
    navigate("/");
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Boshqaruv paneli</h1>
        <button type="button" className="btn btn-ghost" onClick={handleLogout}>
          Chiqish
        </button>
      </div>

      <section className={styles.actions}>
        <Link to="/create" className="btn btn-primary">
          Yangi pazl yaratish
        </Link>
        <form onSubmit={handleJoin} className={styles.joinForm}>
          <label htmlFor="join-code" className="visually-hidden">
            Xona kodi
          </label>
          <input
            id="join-code"
            type="text"
            placeholder="Xona kodi"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary">
            Xonaga qo&apos;shilish
          </button>
        </form>
        {joinError && (
          <p role="alert" className={styles.error}>
            {joinError}
          </p>
        )}
      </section>

      <section>
        <h2>Siz yaratgan xonalar</h2>
        {loadingRooms ? (
          <p>Yuklanmoqda…</p>
        ) : ownedRooms.length === 0 ? (
          <p className={styles.empty}>Hali xona yaratmagansiz.</p>
        ) : (
          <ul className={styles.roomList}>
            {ownedRooms.map((room) => (
              <li key={room.roomId} className="card">
                <Link to={`/room/${room.roomId}`}>{room.roomId}</Link>
                <span className={styles.status}>{room.status === "open" ? "Faol" : "Yopiq"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>So&apos;nggi tashrif buyurilgan xonalar</h2>
        {recentRoomIds.length === 0 ? (
          <p className={styles.empty}>Hali hech qanday xonaga kirmagansiz.</p>
        ) : (
          <ul className={styles.roomList}>
            {recentRoomIds.map((roomId) => (
              <li key={roomId} className="card">
                <Link to={`/room/${roomId}`}>{roomId}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
