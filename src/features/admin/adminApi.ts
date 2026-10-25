import { api } from "@/lib/api";

export const ADMIN_UID = "tg_5547740249";

export interface AdminOverview {
  totalUsers: number;
  totalRooms: number;
  activeRooms: number;
  completedPuzzles: number;
  newUsersToday: number;
  newRoomsToday: number;
}

export interface AdminUser {
  id: string;
  displayName: string;
  telegramUsername: string | null;
  createdAt: string;
}

export interface AdminRoom {
  roomId: string;
  status: string;
  visibility: string;
  createdAt: string;
  updatedAt: string;
  ownerDisplayName: string | null;
  imageId: string | null;
  pieceCount: number | null;
  completedAt: string | null;
  participantCount: number;
  gamesCount: number;
}

export interface AdminGalleryImage {
  imageId: string;
  category: string;
  width: number;
  height: number;
  usageCount: number;
  createdAt: string;
}

export function fetchAdminOverview(): Promise<AdminOverview> {
  return api<AdminOverview>("/api/admin/overview");
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  return (await api<{ users: AdminUser[] }>("/api/admin/users")).users;
}

export async function fetchAdminRooms(): Promise<AdminRoom[]> {
  return (await api<{ rooms: AdminRoom[] }>("/api/admin/rooms")).rooms;
}

export async function fetchAdminGalleryImages(): Promise<AdminGalleryImage[]> {
  return (await api<{ images: AdminGalleryImage[] }>("/api/gallery")).images;
}

export async function deleteRoomAsAdmin(roomId: string): Promise<void> {
  await api(`/api/admin/rooms/${encodeURIComponent(roomId)}`, { method: "DELETE" });
}
