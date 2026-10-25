import pg from "pg";

const { Pool, types } = pg;

// bigint (OID 20) columns — just `expires_at` here — hold millisecond epoch
// timestamps well inside Number.MAX_SAFE_INTEGER; pg's default of returning
// them as strings (to avoid silently losing precision on values that
// wouldn't fit a JS number) isn't a risk for this column, and a string would
// break every `< Date.now()` comparison in the route handlers.
types.setTypeParser(20, (value) => Number(value));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function withTransaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function bootstrapSchema(): Promise<void> {
  await pool.query(`
    create table if not exists users (
      id text primary key,
      telegram_id text unique,
      display_name text not null,
      telegram_username text,
      created_at text not null
    );
    create table if not exists auth_transactions (
      id text primary key,
      status text not null,
      expires_at bigint not null,
      telegram_user_id text,
      telegram_username text,
      display_name text
    );
    create table if not exists rooms (
      id text primary key,
      owner_id text not null,
      status text not null,
      visibility text not null,
      current_game_id text,
      created_at text not null,
      updated_at text not null
    );
    create table if not exists participants (
      room_id text not null,
      uid text not null,
      display_name text not null,
      role text not null,
      joined_at text not null,
      last_seen_at text not null,
      connection_status text not null,
      primary key (room_id, uid)
    );
    create table if not exists games (
      id text not null,
      room_id text not null,
      mode text not null,
      image_id text not null,
      piece_count integer not null,
      columns integer not null,
      rows integer not null,
      geometry_seed text not null,
      geometry_version integer not null,
      snap_enabled integer not null,
      rotation_enabled integer not null,
      snap_tolerance_ratio double precision not null,
      state_version integer not null,
      progress double precision not null,
      created_at text not null,
      updated_at text not null,
      completed_at text,
      primary key (room_id, id)
    );
    create table if not exists pieces (
      room_id text not null,
      game_id text not null,
      chunk_id text not null,
      payload text not null,
      primary key (room_id, game_id, chunk_id)
    );
  `);
}
