import "dotenv/config";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { SignJWT, jwtVerify } from "jose";
import multer from "multer";
import { Server } from "socket.io";
import { z } from "zod";
import { scanGalleryImages } from "./gallery.js";
import { bootstrapSchema, pool, withTransaction } from "./db.js";

const port = Number(process.env.PORT ?? 8080);
const origins = (process.env.WEB_ORIGIN ?? "http://localhost:5173").split(",").map((x) => x.trim()).filter(Boolean);
const uploadDirectory = process.env.UPLOAD_DIRECTORY ?? path.resolve("data/uploads");
const galleryDirectory = process.env.GALLERY_DIRECTORY ?? path.resolve("gallery");
const jwtKey = new TextEncoder().encode(process.env.JWT_SECRET ?? "development-only-change-me-before-production");

const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: origins, methods: ["GET", "POST"] } });
const upload = multer({ dest: uploadDirectory, limits: { fileSize: 15 * 1024 * 1024 } });

type User = { uid: string; displayName: string; telegramUsername?: string };
type Piece = {
  pieceId: number;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  groupId: string;
  lockedBy: string | null;
  lockExpiresAt: string | null;
};

app.use(cors({ origin: origins }));
app.use(express.json({ limit: "4mb" }));
app.use("/media", express.static(uploadDirectory, { maxAge: "1y", immutable: true }));
app.use("/gallery", express.static(galleryDirectory, { maxAge: "1d" }));
app.get("/api/gallery", async (_req, res) => {
  const [images, usageResult] = await Promise.all([
    scanGalleryImages(galleryDirectory),
    pool.query<{ image_id: string; usage_count: string }>(
      "select image_id, count(*) as usage_count from games where image_id like 'gallery:%' group by image_id",
    ),
  ]);
  const usageByImageId = new Map(usageResult.rows.map((r) => [r.image_id, Number(r.usage_count)]));
  res.json({
    images: images.map((image) => ({ ...image, usageCount: usageByImageId.get(image.imageId) ?? 0 })),
  });
});

io.use(async (socket, next) => {
  const supplied = socket.handshake.auth?.token;
  if (typeof supplied !== "string") return next(new Error("unauthorized"));
  try {
    const { payload } = await jwtVerify(supplied, jwtKey);
    if (!payload.sub) return next(new Error("unauthorized"));
    socket.data.uid = payload.sub;
    socket.data.displayName = typeof payload.displayName === "string" ? payload.displayName : "O'yinchi";
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

const now = () => new Date().toISOString();
const fail = (res: Response, status: number, error: string) => res.status(status).json({ error });

async function getUser(req: Request): Promise<User | null> {
  const token = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, jwtKey);
    return payload.sub
      ? {
          uid: payload.sub,
          displayName: String(payload.displayName ?? "O'yinchi"),
          telegramUsername: typeof payload.telegramUsername === "string" ? payload.telegramUsername : undefined,
        }
      : null;
  } catch {
    return null;
  }
}

async function required(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await getUser(req);
  if (!user) return void fail(res, 401, "Kirish talab qilinadi.");
  res.locals.user = user;
  next();
}

async function token(user: User): Promise<string> {
  return new SignJWT({ displayName: user.displayName, telegramUsername: user.telegramUsername })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.uid)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(jwtKey);
}

async function isParticipant(roomId: string, uid: string): Promise<boolean> {
  const result = await pool.query("select 1 from participants where room_id=$1 and uid=$2", [roomId, uid]);
  return (result.rowCount ?? 0) > 0;
}

async function state(roomId: string): Promise<unknown | null> {
  const roomResult = await pool.query("select * from rooms where id=$1", [roomId]);
  const room = roomResult.rows[0] as Record<string, unknown> | undefined;
  if (!room) return null;

  const gameResult = await pool.query("select * from games where room_id=$1 and id=$2", [roomId, String(room.current_game_id)]);
  const game = gameResult.rows[0] as Record<string, unknown> | undefined;

  const participantsResult = await pool.query(
    "select uid, display_name as \"displayName\", role, joined_at as \"joinedAt\", last_seen_at as \"lastSeenAt\", connection_status as \"connectionStatus\" from participants where room_id=$1",
    [roomId],
  );

  let pieces: Piece[] = [];
  if (game) {
    const piecesResult = await pool.query("select payload from pieces where room_id=$1 and game_id=$2", [roomId, String(game.id)]);
    pieces = piecesResult.rows.flatMap((r: { payload: string }) => Object.values(JSON.parse(r.payload) as Record<string, Piece>));
  }

  return {
    room: {
      roomId: room.id,
      ownerUid: room.owner_id,
      status: room.status,
      visibility: room.visibility,
      inviteCode: room.id,
      currentGameId: room.current_game_id,
      createdAt: room.created_at,
      updatedAt: room.updated_at,
      expiresAt: null,
    },
    game: game && {
      gameId: game.id,
      roomId,
      mode: game.mode,
      imageId: game.image_id,
      pieceCount: game.piece_count,
      columns: game.columns,
      rows: game.rows,
      geometrySeed: game.geometry_seed,
      geometryVersion: game.geometry_version,
      snapEnabled: Boolean(game.snap_enabled),
      rotationEnabled: Boolean(game.rotation_enabled),
      snapToleranceRatio: game.snap_tolerance_ratio,
      stateVersion: game.state_version,
      progress: game.progress,
      completedAt: (game.completed_at as string | null) ?? null,
      createdAt: game.created_at,
      updatedAt: game.updated_at,
    },
    participants: participantsResult.rows,
    pieces,
  };
}

async function sendTelegramMessage(chatId: string | number, text: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    return res.ok;
  } catch (err) {
    console.error("sendTelegramMessage error:", err);
    return false;
  }
}

app.get("/health", async (_req, res) => {
  await pool.query("select 1");
  res.json({ ok: true, service: "puzzletogether-api" });
});

app.get("/api/auth/session", required, (_req, res) => res.json({ user: res.locals.user }));

app.post("/api/auth/transactions", async (_req, res) => {
  const id = randomBytes(24).toString("base64url");
  const expiresAtMs = Date.now() + 300000;
  await pool.query("insert into auth_transactions (id,status,expires_at) values ($1,'pending',$2)", [id, expiresAtMs]);
  res.status(201).json({ transactionId: id, expiresAtMs });
});

app.get("/api/auth/transactions/:id", async (req, res) => {
  const result = await pool.query("select status, expires_at from auth_transactions where id=$1", [req.params.id]);
  const row = result.rows[0] as { status: string; expires_at: number } | undefined;
  if (!row) return fail(res, 404, "transaction not found");
  if (row.status === "pending" && row.expires_at < Date.now()) {
    await pool.query("update auth_transactions set status='expired' where id=$1", [req.params.id]);
    row.status = "expired";
  }
  return res.json({ status: row.status, expiresAtMs: row.expires_at });
});

app.post("/api/auth/transactions/:id/complete", async (req, res) => {
  const result = await pool.query("select * from auth_transactions where id=$1", [req.params.id]);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row || row.status !== "verified" || Number(row.expires_at) < Date.now()) {
    return fail(res, 409, "Telegram tasdiqlashi kutilmoqda.");
  }
  const telegramId = String(row.telegram_user_id);
  const displayName = String(row.display_name || "O'yinchi");
  const user = {
    uid: `tg_${telegramId}`,
    displayName,
    telegramUsername: typeof row.telegram_username === "string" ? row.telegram_username : undefined,
  };
  const existing = await pool.query("select id from users where id=$1", [user.uid]);
  const isNewUser = existing.rowCount === 0;

  await pool.query(
    "insert into users (id,telegram_id,display_name,telegram_username,created_at) values ($1,$2,$3,$4,$5) on conflict(id) do update set display_name=excluded.display_name,telegram_username=excluded.telegram_username",
    [user.uid, telegramId, displayName, user.telegramUsername ?? null, now()],
  );
  await pool.query("update auth_transactions set status='completed' where id=$1", [req.params.id]);

  if (isNewUser) {
    void sendTelegramMessage(
      telegramId,
      `🎉 <b>Xush kelibsiz, ${displayName}!</b>\n\nSiz <b>PuzzleTogether</b> platformasida muvaffaqiyatli ro'yxatdan o'tdingiz. Endi xona yaratib yoki do'stlaringiz taklifnomasi bilan birga real vaqtda pazl yig'ishingiz mumkin! 🧩✨`,
    );
    const adminId = process.env.ADMIN_TELEGRAM_ID;
    if (adminId) {
      void sendTelegramMessage(
        adminId,
        `🔔 <b>Yangi foydalanuvchi ro'yxatdan o'tdi:</b>\n\n• Ism: <b>${displayName}</b>\n• Telegram ID: <code>${telegramId}</code>\n• Username: ${user.telegramUsername ? "@" + user.telegramUsername : "mavjud emas"}\n• Vaqt: ${now()}`,
      );
    }
  } else {
    void sendTelegramMessage(
      telegramId,
      `🔐 <b>Tizimga muvaffaqiyatli kirdingiz!</b>\n\nXush kelibsiz, <b>${displayName}</b>. Brauzerda sessiyangiz faollashtirildi. 🧩`,
    );
  }

  res.json({ token: await token(user), user });
});

app.post("/webhooks/telegram", async (req, res) => {
  const secretHeader = req.get("X-Telegram-Bot-Api-Secret-Token");
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return fail(res, 401, "unauthorized");
  }

  const message = req.body?.message;
  const chatId = message?.chat?.id ?? message?.from?.id;
  const text = typeof message?.text === "string" ? message.text.trim() : "";
  const display = [message?.from?.first_name, message?.from?.last_name].filter(Boolean).join(" ") || "O'yinchi";

  if (!chatId) {
    return res.sendStatus(200);
  }

  if (text === "/start") {
    await sendTelegramMessage(
      chatId,
      `👋 <b>Assalomu alaykum, ${display}!</b>\n\n🧩 <b>PuzzleTogether</b> — real vaqt rejimida do'stlar bilan birgalikda pazl yig'ish platformasi.\n\nKirish uchun saytga o'ting va <i>"Telegram orqali kirish"</i> tugmasini bosing!`,
    );
    return res.sendStatus(200);
  }

  const id = text.match(/^\/start\s+([A-Za-z0-9_-]+)$/)?.[1];
  if (id && message?.from?.id) {
    const telegramId = String(message.from.id);
    const username = message.from.username ?? null;

    const result = await pool.query("select status, expires_at from auth_transactions where id=$1", [id]);
    const row = result.rows[0] as { status: string; expires_at: number } | undefined;

    if (!row) {
      await sendTelegramMessage(chatId, `⚠️ <b>Kirish havolasi topilmadi.</b>\n\nIltimos, saytdan qaytadan <i>"Telegram orqali kirish"</i> tugmasini bosing.`);
      return res.sendStatus(200);
    }

    if (row.status !== "pending" || row.expires_at < Date.now()) {
      await sendTelegramMessage(chatId, `⏳ <b>Ushbu kirish havolasining amal qilish muddati tugagan.</b>\n\nIltimos, saytdan qayta urinib ko'ring.`);
      return res.sendStatus(200);
    }

    await pool.query(
      "update auth_transactions set status='verified',telegram_user_id=$1,telegram_username=$2,display_name=$3 where id=$4 and status='pending' and expires_at>=$5",
      [telegramId, username, display, id, Date.now()],
    );
    io.to(`auth:${id}`).emit("auth:verified", { transactionId: id });

    await sendTelegramMessage(
      chatId,
      `✅ <b>Kirishingiz tasdiqlandi!</b>\n\nAssalomu alaykum, <b>${display}</b>! Endi brauzeringizga qaytib, o'yinni davom ettirishingiz mumkin. 🧩`,
    );
  }

  res.sendStatus(200);
});

// The client's requested piece count (25-500, see src/app/config.ts) is only an input to
// computeGridLayout's sqrt+round grid sizing, so the actual cols*rows total it sends here can
// land a little outside that range (e.g. a request for 500 can round up to 513). The bound below
// is intentionally looser than the UI's — it exists to reject abuse (absurd piece counts), not to
// re-enforce the UX range the client already validated.
const gameSchema = z.object({
  gameId: z.string(),
  mode: z.enum(["free", "classic"]),
  imageId: z.string(),
  pieceCount: z.number().int().min(16).max(560),
  columns: z.number().int(),
  rows: z.number().int(),
  geometrySeed: z.string(),
  geometryVersion: z.number().int(),
  snapEnabled: z.boolean(),
  rotationEnabled: z.boolean(),
  snapToleranceRatio: z.number(),
});
const pieceSchema = z.object({
  pieceId: z.number().int(),
  x: z.number(),
  y: z.number(),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
  groupId: z.string(),
  lockedBy: z.null(),
  lockExpiresAt: z.null(),
});

app.post("/api/rooms", required, async (req, res) => {
  const parsed = z
    .object({ roomId: z.string().min(6).max(64), game: gameSchema, visibility: z.enum(["private", "unlisted"]), pieces: z.array(pieceSchema) })
    .safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "invalid room payload");
  const { roomId, game, visibility, pieces } = parsed.data;
  const user = res.locals.user as User;
  const stamp = now();

  await withTransaction(async (client) => {
    await client.query("insert into rooms values ($1,$2,$3,$4,$5,$6,$7)", [roomId, user.uid, "open", visibility, game.gameId, stamp, stamp]);
    await client.query(
      "insert into games values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)",
      [
        game.gameId, roomId, game.mode, game.imageId, game.pieceCount, game.columns, game.rows,
        game.geometrySeed, game.geometryVersion, Number(game.snapEnabled), Number(game.rotationEnabled),
        game.snapToleranceRatio, 0, 0, stamp, stamp, null,
      ],
    );
    await client.query("insert into participants values ($1,$2,$3,$4,$5,$6,$7)", [roomId, user.uid, user.displayName, "owner", stamp, stamp, "online"]);

    const chunks = new Map<string, Piece[]>();
    for (const piece of pieces) {
      const chunkId = `c${Math.floor(piece.pieceId / 50)}`;
      chunks.set(chunkId, [...(chunks.get(chunkId) ?? []), piece]);
    }
    for (const [chunkId, chunk] of chunks) {
      const payload = JSON.stringify(Object.fromEntries(chunk.map((piece) => [piece.pieceId, piece])));
      await client.query("insert into pieces values ($1,$2,$3,$4)", [roomId, game.gameId, chunkId, payload]);
    }
  });

  res.status(201).json({ roomId, gameId: game.gameId });
});

app.post("/api/rooms/:roomId/games", required, async (req, res) => {
  const parsed = z.object({ game: gameSchema, pieces: z.array(pieceSchema) }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "invalid room payload");
  const roomId = String(req.params.roomId);
  const user = res.locals.user as User;
  const { game, pieces } = parsed.data;

  const roomResult = await pool.query("select owner_id as \"ownerUid\" from rooms where id=$1", [roomId]);
  const room = roomResult.rows[0] as { ownerUid: string } | undefined;
  if (!room) return fail(res, 404, "Xona topilmadi.");
  if (room.ownerUid !== user.uid) return fail(res, 403, "Faqat xona egasi yangi pazl boshlashi mumkin.");

  const stamp = now();
  await withTransaction(async (client) => {
    await client.query(
      "insert into games values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)",
      [
        game.gameId, roomId, game.mode, game.imageId, game.pieceCount, game.columns, game.rows,
        game.geometrySeed, game.geometryVersion, Number(game.snapEnabled), Number(game.rotationEnabled),
        game.snapToleranceRatio, 0, 0, stamp, stamp, null,
      ],
    );
    const chunks = new Map<string, Piece[]>();
    for (const piece of pieces) {
      const chunkId = `c${Math.floor(piece.pieceId / 50)}`;
      chunks.set(chunkId, [...(chunks.get(chunkId) ?? []), piece]);
    }
    for (const [chunkId, chunk] of chunks) {
      const payload = JSON.stringify(Object.fromEntries(chunk.map((piece) => [piece.pieceId, piece])));
      await client.query("insert into pieces values ($1,$2,$3,$4)", [roomId, game.gameId, chunkId, payload]);
    }
    await client.query("update rooms set status='open', current_game_id=$1, updated_at=$2 where id=$3", [game.gameId, stamp, roomId]);
  });

  io.to(`room:${roomId}`).emit("room:changed");
  res.status(201).json({ roomId, gameId: game.gameId });
});

app.get("/api/rooms/mine", required, async (_req, res) => {
  const user = res.locals.user as User;
  const result = await pool.query(
    `select r.id as "roomId", r.owner_id as "ownerUid", r.status, r.visibility, r.id as "inviteCode",
            r.current_game_id as "currentGameId", r.created_at as "createdAt", r.updated_at as "updatedAt",
            null as "expiresAt", g.image_id as "imageId", g.piece_count as "pieceCount",
            (select count(*) from participants p where p.room_id = r.id) as "participantCount"
     from rooms r
     left join games g on g.room_id = r.id and g.id = r.current_game_id
     where r.owner_id = $1
     order by r.created_at desc`,
    [user.uid],
  );
  res.json({ rooms: result.rows });
});

app.post("/api/rooms/:roomId/join", required, async (req, res) => {
  const roomId = String(req.params.roomId);
  const user = res.locals.user as User;
  if (!(await state(roomId))) return fail(res, 404, "Xona topilmadi. Havolani tekshiring.");
  const stamp = now();
  await pool.query(
    "insert into participants values ($1,$2,$3,$4,$5,$6,$7) on conflict(room_id,uid) do update set last_seen_at=excluded.last_seen_at,connection_status='online'",
    [roomId, user.uid, user.displayName, "member", stamp, stamp, "online"],
  );
  io.to(`room:${roomId}`).emit("room:changed");
  res.json(await state(roomId));
});

app.get("/api/rooms/:roomId", required, async (req, res) => {
  const result = await state(String(req.params.roomId));
  return result ? res.json(result) : fail(res, 404, "Xona topilmadi.");
});

app.post("/api/images", required, upload.single("image"), (req, res) =>
  req.file ? res.status(201).json({ imageId: req.file.filename, url: `/media/${req.file.filename}` }) : fail(res, 400, "image is required"),
);

app.post("/api/rooms/:roomId/pieces", required, async (req, res) => {
  const parsed = z
    .object({
      gameId: z.string(),
      pieces: z.array(
        z.object({
          pieceId: z.number().int(),
          x: z.number(),
          y: z.number(),
          rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
          groupId: z.string(),
        }),
      ),
    })
    .safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "invalid pieces");
  const user = res.locals.user as User;
  const roomId = String(req.params.roomId);

  for (const update of parsed.data.pieces) {
    const chunkId = `c${Math.floor(update.pieceId / 50)}`;
    const result = await pool.query("select payload from pieces where room_id=$1 and game_id=$2 and chunk_id=$3", [roomId, parsed.data.gameId, chunkId]);
    const row = result.rows[0] as { payload: string } | undefined;
    if (!row) continue;
    const payload = JSON.parse(row.payload) as Record<string, Piece>;
    const current = payload[String(update.pieceId)];
    if (!current || (current.lockedBy && current.lockedBy !== user.uid)) continue;
    payload[String(update.pieceId)] = { ...current, ...update, lockedBy: null, lockExpiresAt: null };
    await pool.query("update pieces set payload=$1 where room_id=$2 and game_id=$3 and chunk_id=$4", [JSON.stringify(payload), roomId, parsed.data.gameId, chunkId]);
  }

  io.to(`room:${roomId}`).emit("room:changed");
  res.sendStatus(204);
});

app.post("/api/rooms/:roomId/complete", required, async (req, res) => {
  const parsed = z.object({ gameId: z.string() }).safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "invalid payload");
  const user = res.locals.user as User;
  const roomId = String(req.params.roomId);
  if (!(await isParticipant(roomId, user.uid))) return fail(res, 403, "Siz bu xona ishtirokchisi emassiz.");

  const gameResult = await pool.query("select completed_at from games where room_id=$1 and id=$2", [roomId, parsed.data.gameId]);
  const game = gameResult.rows[0] as { completed_at: string | null } | undefined;
  if (!game) return fail(res, 404, "O'yin topilmadi.");

  if (!game.completed_at) {
    const stamp = now();
    await pool.query("update games set completed_at=$1, updated_at=$2 where room_id=$3 and id=$4", [stamp, stamp, roomId, parsed.data.gameId]);
    await pool.query("update rooms set status='completed', updated_at=$1 where id=$2", [stamp, roomId]);
    io.to(`room:${roomId}`).emit("room:changed");
  }
  res.sendStatus(204);
});

app.delete("/api/rooms/:roomId", required, async (req, res) => {
  const user = res.locals.user as User;
  const roomId = String(req.params.roomId);
  const roomResult = await pool.query("select owner_id as \"ownerUid\" from rooms where id=$1", [roomId]);
  const room = roomResult.rows[0] as { ownerUid: string } | undefined;
  if (!room) return fail(res, 404, "Xona topilmadi.");
  if (room.ownerUid !== user.uid) return fail(res, 403, "Faqat xona egasi xonani o'chira oladi.");

  await withTransaction(async (client) => {
    await client.query("delete from pieces where room_id=$1", [roomId]);
    await client.query("delete from games where room_id=$1", [roomId]);
    await client.query("delete from participants where room_id=$1", [roomId]);
    await client.query("delete from rooms where id=$1", [roomId]);
  });

  io.to(`room:${roomId}`).emit("room:deleted");
  res.sendStatus(204);
});

io.on("connection", (socket) => {
  socket.on("room:join", async (id: string) => {
    if (typeof id === "string" && (await isParticipant(id, socket.data.uid))) socket.join(`room:${id}`);
  });
  socket.on("piece:move", async (event: { roomId: string; pieceId: number; x: number; y: number; rotation: number }) => {
    if (event?.roomId && Number.isInteger(event.pieceId) && (await isParticipant(event.roomId, socket.data.uid))) {
      socket.to(`room:${event.roomId}`).emit("piece:moved", { ...event, uid: socket.data.uid });
    }
  });
  // Ephemeral cursor presence — never persisted, just relayed to the rest of
  // the room so participants can see where everyone else is pointing, the
  // same "piece:move"/"piece:moved" fire-and-forget pattern above.
  socket.on("cursor:move", async (event: { roomId: string; x: number; y: number }) => {
    if (
      event?.roomId &&
      Number.isFinite(event.x) &&
      Number.isFinite(event.y) &&
      (await isParticipant(event.roomId, socket.data.uid))
    ) {
      socket.to(`room:${event.roomId}`).emit("cursor:moved", {
        uid: socket.data.uid,
        displayName: socket.data.displayName,
        x: event.x,
        y: event.y,
      });
    }
  });
  socket.on("disconnecting", () => {
    // A dropped tab/connection should clear its cursor immediately on every
    // room it was in, rather than leaving a stale marker for other
    // participants until it ages out client-side.
    for (const room of socket.rooms) {
      if (room.startsWith("room:")) socket.to(room).emit("cursor:left", { uid: socket.data.uid });
    }
  });
});

async function bootstrap(): Promise<void> {
  await mkdir(uploadDirectory, { recursive: true });
  await mkdir(galleryDirectory, { recursive: true });
  await bootstrapSchema();
  http.listen(port, () => console.log(`PuzzleTogether API listening on :${port}`));
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
