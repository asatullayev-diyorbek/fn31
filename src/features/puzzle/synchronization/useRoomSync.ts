import { useEffect, useMemo, useState } from "react";
import { api, getSocket } from "@/lib/api";
import { useAuth } from "@/features/auth/AuthProvider";
import { recordRecentRoomVisit } from "@/features/rooms/roomsApi";
import type { Game, PieceState, Room, RoomParticipant } from "@/types/firestore";
export interface ParticipantView extends RoomParticipant { online: boolean; }
export interface RoomSyncState { loading: boolean; error: string | null; room: Room | null; game: Game | null; participants: ParticipantView[]; pieces: ReadonlyMap<number, PieceState>; myUid: string | null; }
type State = { room: Room; game: Game; participants: RoomParticipant[]; pieces: PieceState[] };
export function useRoomSync(roomId: string): RoomSyncState {
  const { user } = useAuth(); const [data, setData] = useState<State | null>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!user) return; let active = true; const load = async () => { try { const joined = await api<State>(`/api/rooms/${encodeURIComponent(roomId)}/join`, { method: "POST" }); if (active) { setData(joined); recordRecentRoomVisit(roomId); } } catch (err) { if (active) setError(err instanceof Error ? err.message : "Xona yuklanmadi."); } }; void load(); const socket = getSocket(); socket.emit("room:join", roomId); const refresh = () => void api<State>(`/api/rooms/${encodeURIComponent(roomId)}`).then((value) => active && setData(value)).catch(() => undefined); const onMove = (event: { roomId: string; pieceId: number; x: number; y: number; rotation: PieceState["rotation"] }) => { if (event.roomId !== roomId) return; setData((previous) => { if (!previous) return previous; const next = previous.pieces.filter((piece) => piece.pieceId !== event.pieceId); next.push({ pieceId: event.pieceId, x: event.x, y: event.y, rotation: event.rotation, groupId: `g${event.pieceId}`, lockedBy: null, lockExpiresAt: null }); return { ...previous, pieces: next }; }); }; socket.on("room:changed", refresh); socket.on("piece:moved", onMove); return () => { active = false; socket.off("room:changed", refresh); socket.off("piece:moved", onMove); }; }, [roomId, user]);
  const pieces = useMemo(() => new Map(data?.pieces.map((piece) => [piece.pieceId, piece]) ?? []), [data]);
  return { loading: !data && !error, error, room: data?.room ?? null, game: data?.game ?? null, participants: (data?.participants ?? []).map((p) => ({ ...p, online: p.connectionStatus === "online" })), pieces, myUid: user?.uid ?? null };
}
