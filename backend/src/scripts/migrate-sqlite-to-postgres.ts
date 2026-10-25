/**
 * One-off migration: copies every row from the old SQLite database into the
 * Postgres one, preserving existing production data. Safe to re-run — every
 * insert is ON CONFLICT DO NOTHING, so a second run after a partial failure
 * just skips rows already copied rather than erroring or duplicating.
 *
 * Usage (on the VPS, after DATABASE_URL in .env points at Postgres):
 *   SQLITE_SOURCE_FILE=/opt/puzzletogether/data/puzzletogether.sqlite node dist/scripts/migrate-sqlite-to-postgres.js
 */
import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { bootstrapSchema, pool } from "../db.js";

const sqliteFile = process.env.SQLITE_SOURCE_FILE;
if (!sqliteFile) {
  console.error("Set SQLITE_SOURCE_FILE to the path of the existing puzzletogether.sqlite file.");
  process.exit(1);
}

async function migrateTable(
  tableName: string,
  rows: Record<string, unknown>[],
  columns: string[],
  conflictKey: string,
): Promise<number> {
  let migrated = 0;
  for (const row of rows) {
    const values = columns.map((c) => row[c]);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(",");
    const result = await pool.query(
      `insert into ${tableName} (${columns.join(",")}) values (${placeholders}) on conflict (${conflictKey}) do nothing`,
      values,
    );
    migrated += result.rowCount ?? 0;
  }
  return migrated;
}

async function main(): Promise<void> {
  const db = new DatabaseSync(sqliteFile!);
  await bootstrapSchema();

  const users = db.prepare("select * from users").all() as Record<string, unknown>[];
  const usersMigrated = await migrateTable(
    "users",
    users,
    ["id", "telegram_id", "display_name", "telegram_username", "created_at"],
    "id",
  );
  console.log(`users: ${usersMigrated}/${users.length} migrated`);

  const authTransactions = db.prepare("select * from auth_transactions").all() as Record<string, unknown>[];
  const authTransactionsMigrated = await migrateTable(
    "auth_transactions",
    authTransactions,
    ["id", "status", "expires_at", "telegram_user_id", "telegram_username", "display_name"],
    "id",
  );
  console.log(`auth_transactions: ${authTransactionsMigrated}/${authTransactions.length} migrated`);

  const rooms = db.prepare("select * from rooms").all() as Record<string, unknown>[];
  const roomsMigrated = await migrateTable(
    "rooms",
    rooms,
    ["id", "owner_id", "status", "visibility", "current_game_id", "created_at", "updated_at"],
    "id",
  );
  console.log(`rooms: ${roomsMigrated}/${rooms.length} migrated`);

  const participants = db.prepare("select * from participants").all() as Record<string, unknown>[];
  for (const p of participants) {
    await pool.query(
      `insert into participants (room_id, uid, display_name, role, joined_at, last_seen_at, connection_status)
       values ($1,$2,$3,$4,$5,$6,$7) on conflict (room_id, uid) do nothing`,
      [p.room_id, p.uid, p.display_name, p.role, p.joined_at, p.last_seen_at, p.connection_status],
    );
  }
  console.log(`participants: ${participants.length} migrated`);

  const games = db.prepare("select * from games").all() as Record<string, unknown>[];
  for (const g of games) {
    await pool.query(
      `insert into games (id, room_id, mode, image_id, piece_count, columns, rows, geometry_seed,
         geometry_version, snap_enabled, rotation_enabled, snap_tolerance_ratio, state_version,
         progress, created_at, updated_at, completed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       on conflict (room_id, id) do nothing`,
      [
        g.id, g.room_id, g.mode, g.image_id, g.piece_count, g.columns, g.rows, g.geometry_seed,
        g.geometry_version, g.snap_enabled, g.rotation_enabled, g.snap_tolerance_ratio, g.state_version,
        g.progress, g.created_at, g.updated_at, g.completed_at ?? null,
      ],
    );
  }
  console.log(`games: ${games.length} migrated`);

  const pieces = db.prepare("select * from pieces").all() as Record<string, unknown>[];
  for (const p of pieces) {
    await pool.query(
      `insert into pieces (room_id, game_id, chunk_id, payload) values ($1,$2,$3,$4)
       on conflict (room_id, game_id, chunk_id) do nothing`,
      [p.room_id, p.game_id, p.chunk_id, p.payload],
    );
  }
  console.log(`pieces: ${pieces.length} migrated`);

  const counts = await pool.query(`
    select
      (select count(*) from users) as users,
      (select count(*) from auth_transactions) as auth_transactions,
      (select count(*) from rooms) as rooms,
      (select count(*) from participants) as participants,
      (select count(*) from games) as games,
      (select count(*) from pieces) as pieces
  `);
  console.log("Postgres row counts after migration:", counts.rows[0]);

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
