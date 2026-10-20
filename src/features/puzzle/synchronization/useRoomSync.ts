import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { onDisconnect, onValue, ref as rtdbRef, set as rtdbSet } from "firebase/database";
import { getFirebaseDatabase, getFirebaseFirestore } from "@/lib/firebase/client";
import { useAuth } from "@/features/auth/AuthProvider";
import { joinRoom, recordRecentRoomVisit } from "@/features/rooms/roomsApi";
import { chunkIdsForPieceCount } from "./chunking";
import type { Game, PieceChunk, PieceState, Room, RoomParticipant } from "@/types/firestore";

export interface ParticipantView extends RoomParticipant {
  online: boolean;
}

export interface RoomSyncState {
  loading: boolean;
  error: string | null;
  room: Room | null;
  game: Game | null;
  participants: ParticipantView[];
  pieces: ReadonlyMap<number, PieceState>;
  myUid: string | null;
}

/**
 * Subscribes to every piece of durable room/game state and to RTDB
 * presence, and keeps them merged into one view. Writing back to any of
 * this (committing a move, acquiring a lock) goes through
 * `pieceChunkSync.ts` / `liveDrag.ts` directly from the page, not this
 * hook — this hook is read-only on purpose, so its dependency list stays
 * simple and predictable.
 */
export function useRoomSync(roomId: string): RoomSyncState {
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [onlineUids, setOnlineUids] = useState<ReadonlySet<string>>(new Set());
  const [pieceChunks, setPieceChunks] = useState<ReadonlyMap<string, PieceChunk>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const db = getFirebaseFirestore();

    joinRoom(roomId, user.uid, user.displayName ?? "O'yinchi").catch((err) => {
      setError(err instanceof Error ? err.message : "Xonaga qo'shilib bo'lmadi.");
    });
    recordRecentRoomVisit(roomId);

    const unsubRoom = onSnapshot(
      doc(db, "rooms", roomId),
      (snapshot) => {
        if (!snapshot.exists()) {
          setError("Xona topilmadi.");
          setLoading(false);
          return;
        }
        setRoom(snapshot.data() as Room);
        setLoading(false);
      },
      (err) => setError(err.message),
    );

    const unsubParticipants = onSnapshot(collection(db, "rooms", roomId, "participants"), (snapshot) => {
      setParticipants(snapshot.docs.map((d) => d.data() as RoomParticipant));
    });

    return () => {
      unsubRoom();
      unsubParticipants();
    };
  }, [roomId, user]);

  useEffect(() => {
    if (!room?.currentGameId) return;
    const db = getFirebaseFirestore();
    const unsub = onSnapshot(doc(db, "rooms", roomId, "games", room.currentGameId), (snapshot) => {
      if (snapshot.exists()) setGame(snapshot.data() as Game);
    });
    return unsub;
  }, [roomId, room?.currentGameId]);

  useEffect(() => {
    if (!room?.currentGameId || !game) return;
    const db = getFirebaseFirestore();
    const gameId = room.currentGameId;
    const chunkIds = chunkIdsForPieceCount(game.pieceCount);
    const unsubs = chunkIds.map((chunkId) =>
      onSnapshot(doc(db, "rooms", roomId, "games", gameId, "pieceChunks", chunkId), (snapshot) => {
        if (!snapshot.exists()) return;
        const chunk = snapshot.data() as PieceChunk;
        setPieceChunks((prev) => new Map(prev).set(chunkId, chunk));
      }),
    );
    return () => unsubs.forEach((u) => u());
  }, [roomId, room?.currentGameId, game]);

  useEffect(() => {
    if (!user) return;
    const rtdb = getFirebaseDatabase();
    const presenceRef = rtdbRef(rtdb, `presence/${roomId}/${user.uid}`);
    void rtdbSet(presenceRef, { online: true, updatedAt: Date.now() });
    void onDisconnect(presenceRef).set({ online: false, updatedAt: Date.now() });

    const roomPresenceRef = rtdbRef(rtdb, `presence/${roomId}`);
    const unsub = onValue(roomPresenceRef, (snapshot) => {
      const value = (snapshot.val() as Record<string, { online: boolean }>) ?? {};
      setOnlineUids(new Set(Object.entries(value).filter(([, v]) => v.online).map(([uid]) => uid)));
    });

    return () => {
      void rtdbSet(presenceRef, { online: false, updatedAt: Date.now() });
      unsub();
    };
  }, [roomId, user]);

  const pieces = useMemo(() => {
    const merged = new Map<number, PieceState>();
    for (const chunk of pieceChunks.values()) {
      for (const piece of Object.values(chunk.pieces)) {
        merged.set(piece.pieceId, piece);
      }
    }
    return merged;
  }, [pieceChunks]);

  const participantViews = useMemo<ParticipantView[]>(
    () => participants.map((p) => ({ ...p, online: onlineUids.has(p.uid) })),
    [participants, onlineUids],
  );

  return {
    loading,
    error,
    room,
    game,
    participants: participantViews,
    pieces,
    myUid: user?.uid ?? null,
  };
}
