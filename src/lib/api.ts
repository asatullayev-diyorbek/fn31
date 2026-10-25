import { io, type Socket } from "socket.io-client";

const apiUrl = (import.meta.env.VITE_API_URL as string | undefined) || (import.meta.env.DEV ? "http://127.0.0.1:8787" : "https://apipuzzle.asatullayev.uz");
export const apiBaseUrl = apiUrl.replace(/\/$/, "");
export const mediaUrl = (value: string) => value.startsWith("http") ? value : `${apiBaseUrl}${value}`;
export type ApiUser = { uid: string; displayName: string; telegramUsername?: string };
export const TOKEN_STORAGE_KEY = "puzzletogether:session";
export function getToken(): string | null { return localStorage.getItem(TOKEN_STORAGE_KEY); }
export function setToken(value: string | null): void { if (value) localStorage.setItem(TOKEN_STORAGE_KEY, value); else localStorage.removeItem(TOKEN_STORAGE_KEY); }
export async function api<T>(pathname: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers); const auth = getToken();
  if (auth) headers.set("Authorization", `Bearer ${auth}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${apiBaseUrl}${pathname}`, { ...init, headers });
  if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || "Server bilan aloqa amalga oshmadi."); }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
let socket: Socket | undefined;
export function getSocket(): Socket { if (!socket) socket = io(apiBaseUrl, { transports: ["websocket", "polling"], auth: { token: getToken() } }); return socket; }
