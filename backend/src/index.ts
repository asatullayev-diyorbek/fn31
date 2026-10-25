import "dotenv/config";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import multer from "multer";
import { Server } from "socket.io";
import { z } from "zod";

const port = Number(process.env.PORT ?? 8080);
const origins = (process.env.WEB_ORIGIN ?? "http://localhost:5173").split(",").map((x) => x.trim()).filter(Boolean);
const uploadDirectory = process.env.UPLOAD_DIRECTORY ?? path.resolve("data/uploads");
const databaseFile = process.env.DATABASE_FILE ?? path.join(path.dirname(uploadDirectory), "puzzletogether.sqlite");
const jwtKey = new TextEncoder().encode(process.env.JWT_SECRET ?? "development-only-change-me-before-production");
const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: origins, methods: ["GET", "POST"] } });
const upload = multer({ dest: uploadDirectory, limits: { fileSize: 15 * 1024 * 1024 } });
let db: DatabaseSync;
type User = { uid: string; displayName: string; telegramUsername?: string };
type Piece = { pieceId: number; x: number; y: number; rotation: 0 | 90 | 180 | 270; groupId: string; lockedBy: string | null; lockExpiresAt: string | null };

app.use(cors({ origin: origins }));
app.use(express.json({ limit: "4mb" }));
app.use("/media", express.static(uploadDirectory, { maxAge: "1y", immutable: true }));
io.use(async (socket, next) => {
  const supplied = socket.handshake.auth?.token;
  if (typeof supplied !== "string") return next(new Error("unauthorized"));
  try {
    const { payload } = await jwtVerify(supplied, jwtKey);
    if (!payload.sub) return next(new Error("unauthorized"));
    socket.data.uid = payload.sub;
    next();
  } catch { next(new Error("unauthorized")); }
});
const now = () => new Date().toISOString();
const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });
async function getUser(req: Request): Promise<User | null> {
  const token = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try { const { payload } = await jwtVerify(token, jwtKey); return payload.sub ? { uid: payload.sub, displayName: String(payload.displayName ?? "O'yinchi"), telegramUsername: typeof payload.telegramUsername === "string" ? payload.telegramUsername : undefined } : null; } catch { return null; }
}
async function required(req: Request, res: Response, next: NextFunction): Promise<void> { const user = await getUser(req); if (!user) return void fail(res, 401, "Kirish talab qilinadi."); res.locals.user = user; next(); }
async function token(user: User): Promise<string> { return new SignJWT({ displayName: user.displayName, telegramUsername: user.telegramUsername }).setProtectedHeader({ alg: "HS256" }).setSubject(user.uid).setIssuedAt().setExpirationTime("30d").sign(jwtKey); }
function state(roomId: string): unknown | null {
  const room = db.prepare("select * from rooms where id=?").get(roomId) as Record<string, unknown> | undefined;
  if (!room) return null;
  const game = db.prepare("select * from games where room_id=? and id=?").get(roomId, String(room.current_game_id)) as Record<string, unknown> | undefined;
  const participants = db.prepare("select uid, display_name as displayName, role, joined_at as joinedAt, last_seen_at as lastSeenAt, connection_status as connectionStatus from participants where room_id=?").all(roomId);
  const pieces = game ? db.prepare("select payload from pieces where room_id=? and game_id=?").all(roomId, String(game.id)).flatMap((r) => Object.values(JSON.parse(String((r as { payload: string }).payload)) as Record<string, Piece>)) : [];
  return { room: { roomId: room.id, ownerUid: room.owner_id, status: room.status, visibility: room.visibility, inviteCode: room.id, currentGameId: room.current_game_id, createdAt: room.created_at, updatedAt: room.updated_at, expiresAt: null }, game: game && { gameId: game.id, roomId, mode: game.mode, imageId: game.image_id, pieceCount: game.piece_count, columns: game.columns, rows: game.rows, geometrySeed: game.geometry_seed, geometryVersion: game.geometry_version, snapEnabled: Boolean(game.snap_enabled), rotationEnabled: Boolean(game.rotation_enabled), snapToleranceRatio: game.snap_tolerance_ratio, stateVersion: game.state_version, progress: game.progress, completedAt: null, createdAt: game.created_at, updatedAt: game.updated_at }, participants, pieces };
}

app.get("/health", (_req, res) => { db.prepare("select 1").get(); res.json({ ok: true, service: "puzzletogether-api" }); });
app.get("/api/auth/session", required, (_req, res) => res.json({ user: res.locals.user }));
app.post("/api/auth/transactions", (_req, res) => { const id = randomBytes(24).toString("base64url"); const expiresAtMs = Date.now() + 300000; db.prepare("insert into auth_transactions (id,status,expires_at) values (?,'pending',?)").run(id, expiresAtMs); res.status(201).json({ transactionId: id, expiresAtMs }); });
app.get("/api/auth/transactions/:id", (req, res) => { const row = db.prepare("select status, expires_at from auth_transactions where id=?").get(req.params.id) as { status: string; expires_at: number } | undefined; if (!row) return fail(res, 404, "transaction not found"); if (row.status === "pending" && row.expires_at < Date.now()) { db.prepare("update auth_transactions set status='expired' where id=?").run(req.params.id); row.status = "expired"; } return res.json({ status: row.status, expiresAtMs: row.expires_at }); });
app.post("/api/auth/transactions/:id/complete", async (req, res) => { const row = db.prepare("select * from auth_transactions where id=?").get(req.params.id) as Record<string, unknown> | undefined; if (!row || row.status !== "verified" || Number(row.expires_at) < Date.now()) return fail(res, 409, "Telegram tasdiqlashi kutilmoqda."); const telegramId = String(row.telegram_user_id), displayName = String(row.display_name || "O'yinchi"), user = { uid: `tg_${telegramId}`, displayName, telegramUsername: typeof row.telegram_username === "string" ? row.telegram_username : undefined }; db.prepare("insert into users (id,telegram_id,display_name,telegram_username,created_at) values (?,?,?,?,?) on conflict(id) do update set display_name=excluded.display_name,telegram_username=excluded.telegram_username").run(user.uid, telegramId, displayName, user.telegramUsername ?? null, now()); db.prepare("update auth_transactions set status='completed' where id=?").run(req.params.id); res.json({ token: await token(user), user }); });
app.post("/webhooks/telegram", (req, res) => { if (!process.env.TELEGRAM_WEBHOOK_SECRET || req.get("X-Telegram-Bot-Api-Secret-Token") !== process.env.TELEGRAM_WEBHOOK_SECRET) return fail(res, 401, "unauthorized"); const message = req.body?.message, id = typeof message?.text === "string" ? message.text.match(/^\/start\s+([A-Za-z0-9_-]+)$/)?.[1] : undefined; if (id && message?.from?.id) { const display = [message.from.first_name, message.from.last_name].filter(Boolean).join(" ") || "Telegram foydalanuvchisi"; db.prepare("update auth_transactions set status='verified',telegram_user_id=?,telegram_username=?,display_name=? where id=? and status='pending' and expires_at>=?").run(String(message.from.id), message.from.username ?? null, display, id, Date.now()); io.to(`auth:${id}`).emit("auth:verified", { transactionId: id }); } res.sendStatus(200); });

// The client's requested piece count (25-500, see src/app/config.ts) is only an input to
// computeGridLayout's sqrt+round grid sizing, so the actual cols*rows total it sends here can
// land a little outside that range (e.g. a request for 500 can round up to 513). The bound below
// is intentionally looser than the UI's — it exists to reject abuse (absurd piece counts), not to
// re-enforce the UX range the client already validated.
const gameSchema = z.object({ gameId: z.string(), mode: z.enum(["free", "classic"]), imageId: z.string(), pieceCount: z.number().int().min(16).max(560), columns: z.number().int(), rows: z.number().int(), geometrySeed: z.string(), geometryVersion: z.number().int(), snapEnabled: z.boolean(), rotationEnabled: z.boolean(), snapToleranceRatio: z.number() });
const pieceSchema = z.object({ pieceId: z.number().int(), x: z.number(), y: z.number(), rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]), groupId: z.string(), lockedBy: z.null(), lockExpiresAt: z.null() });
app.post("/api/rooms", required, (req, res) => { const parsed = z.object({ roomId: z.string().min(6).max(64), game: gameSchema, visibility: z.enum(["private", "unlisted"]), pieces: z.array(pieceSchema) }).safeParse(req.body); if (!parsed.success) return fail(res, 400, "invalid room payload"); const { roomId, game, visibility, pieces } = parsed.data, user = res.locals.user as User, stamp = now(); try { db.exec("begin"); db.prepare("insert into rooms values (?,?,?,?,?,?,?)").run(roomId, user.uid, "open", visibility, game.gameId, stamp, stamp); db.prepare("insert into games values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(game.gameId, roomId, game.mode, game.imageId, game.pieceCount, game.columns, game.rows, game.geometrySeed, game.geometryVersion, Number(game.snapEnabled), Number(game.rotationEnabled), game.snapToleranceRatio, 0, 0, stamp, stamp); db.prepare("insert into participants values (?,?,?,?,?,?,?)").run(roomId, user.uid, user.displayName, "owner", stamp, stamp, "online"); const chunks = new Map<string, Piece[]>(); for (const piece of pieces) { const chunkId = `c${Math.floor(piece.pieceId / 50)}`; chunks.set(chunkId, [...(chunks.get(chunkId) ?? []), piece]); } const insert = db.prepare("insert into pieces values (?,?,?,?)"); for (const [chunkId, chunk] of chunks) insert.run(roomId, game.gameId, chunkId, JSON.stringify(Object.fromEntries(chunk.map((piece) => [piece.pieceId, piece])))); db.exec("commit"); } catch (error) { db.exec("rollback"); throw error; } res.status(201).json({ roomId, gameId: game.gameId }); });
app.get("/api/rooms/mine", required, (_req, res) => { const user = res.locals.user as User; res.json({ rooms: db.prepare("select id as roomId,owner_id as ownerUid,status,visibility,id as inviteCode,current_game_id as currentGameId,created_at as createdAt,updated_at as updatedAt,null as expiresAt from rooms where owner_id=? order by created_at desc").all(user.uid) }); });
app.post("/api/rooms/:roomId/join", required, (req, res) => { const roomId = String(req.params.roomId); const user = res.locals.user as User; if (!state(roomId)) return fail(res, 404, "Xona topilmadi. Havolani tekshiring."); const stamp = now(); db.prepare("insert into participants values (?,?,?,?,?,?,?) on conflict(room_id,uid) do update set last_seen_at=excluded.last_seen_at,connection_status='online'").run(roomId, user.uid, user.displayName, "member", stamp, stamp, "online"); io.to(`room:${roomId}`).emit("room:changed"); res.json(state(roomId)); });
app.get("/api/rooms/:roomId", required, (req, res) => { const result = state(String(req.params.roomId)); return result ? res.json(result) : fail(res, 404, "Xona topilmadi."); });
app.post("/api/images", required, upload.single("image"), (req, res) => req.file ? res.status(201).json({ imageId: req.file.filename, url: `/media/${req.file.filename}` }) : fail(res, 400, "image is required"));
app.post("/api/rooms/:roomId/pieces", required, (req, res) => { const parsed = z.object({ gameId: z.string(), pieces: z.array(z.object({ pieceId: z.number().int(), x: z.number(), y: z.number(), rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]), groupId: z.string() })) }).safeParse(req.body); if (!parsed.success) return fail(res, 400, "invalid pieces"); const user = res.locals.user as User, roomId = String(req.params.roomId); for (const update of parsed.data.pieces) { const chunkId = `c${Math.floor(update.pieceId / 50)}`, row = db.prepare("select payload from pieces where room_id=? and game_id=? and chunk_id=?").get(roomId, parsed.data.gameId, chunkId) as { payload: string } | undefined; if (!row) continue; const payload = JSON.parse(row.payload) as Record<string, Piece>, current = payload[String(update.pieceId)]; if (!current || (current.lockedBy && current.lockedBy !== user.uid)) continue; payload[String(update.pieceId)] = { ...current, ...update, lockedBy: null, lockExpiresAt: null }; db.prepare("update pieces set payload=? where room_id=? and game_id=? and chunk_id=?").run(JSON.stringify(payload), roomId, parsed.data.gameId, chunkId); } io.to(`room:${roomId}`).emit("room:changed"); res.sendStatus(204); });
io.on("connection", (socket) => {
  socket.on("room:join", (id: string) => { if (typeof id === "string" && db.prepare("select 1 from participants where room_id=? and uid=?").get(id, socket.data.uid)) socket.join(`room:${id}`); });
  socket.on("piece:move", (event: { roomId: string; pieceId: number; x: number; y: number; rotation: number }) => {
    if (event?.roomId && Number.isInteger(event.pieceId) && db.prepare("select 1 from participants where room_id=? and uid=?").get(event.roomId, socket.data.uid)) socket.to(`room:${event.roomId}`).emit("piece:moved", { ...event, uid: socket.data.uid });
  });
});
async function bootstrap(): Promise<void> { await mkdir(uploadDirectory, { recursive: true }); db = new DatabaseSync(databaseFile); db.exec(`create table if not exists users (id text primary key,telegram_id text unique,display_name text not null,telegram_username text,created_at text not null); create table if not exists auth_transactions (id text primary key,status text not null,expires_at integer not null,telegram_user_id text,telegram_username text,display_name text); create table if not exists rooms (id text primary key,owner_id text not null,status text not null,visibility text not null,current_game_id text,created_at text not null,updated_at text not null); create table if not exists participants (room_id text not null,uid text not null,display_name text not null,role text not null,joined_at text not null,last_seen_at text not null,connection_status text not null,primary key(room_id,uid)); create table if not exists games (id text not null,room_id text not null,mode text not null,image_id text not null,piece_count integer not null,columns integer not null,rows integer not null,geometry_seed text not null,geometry_version integer not null,snap_enabled integer not null,rotation_enabled integer not null,snap_tolerance_ratio real not null,state_version integer not null,progress real not null,created_at text not null,updated_at text not null,primary key(room_id,id)); create table if not exists pieces (room_id text not null,game_id text not null,chunk_id text not null,payload text not null,primary key(room_id,game_id,chunk_id));`); http.listen(port, () => console.log(`PuzzleTogether API listening on :${port}`)); }
bootstrap().catch((error) => { console.error(error); process.exit(1); });
