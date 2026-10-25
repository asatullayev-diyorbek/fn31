# PuzzleTogether VPS API

This is the self-hosted backend for `apipuzzle.asatullayev.uz`. It owns realtime
WebSocket traffic, Telegram webhooks, a Postgres database and uploaded puzzle
images; no Firebase, AWS, Docker or object storage provider is required.

## Local run

```bash
cp .env.example .env   # set DATABASE_URL to a local Postgres database
npm install
npm run dev
```

`bootstrapSchema()` (in `src/db.ts`) creates every table with `CREATE TABLE IF
NOT EXISTS` on startup — a fresh database just needs to exist, no separate
migration step for local dev.

For production, run `npm run build && npm run start` under systemd, put Caddy or
Nginx in front of port 8080, terminate TLS for `apipuzzle.asatullayev.uz`, and
set `WEB_ORIGIN` to the Vercel production URL. Set a strong `JWT_SECRET`, then
back up the Postgres database (e.g. `pg_dump`) and `uploads/`.

### Migrating from the old SQLite setup

This project ran on a local SQLite file (`node:sqlite`) before moving to
Postgres. `src/scripts/migrate-sqlite-to-postgres.ts` copies every row across
exactly once (every insert is `ON CONFLICT DO NOTHING`, so it's safe to re-run
after a partial failure):

```bash
SQLITE_SOURCE_FILE=/path/to/puzzletogether.sqlite npm run migrate:sqlite
```

Back up the SQLite file first regardless — the script only ever reads it.

## Adding built-in gallery images

The "Yangi pazl yaratish" page's gallery pulls directly from
`backend/gallery/<category>/<file>` (or `GALLERY_DIRECTORY` if set) — no code
change or redeploy needed, `GET /api/gallery` rescans the folder on every call.

```
backend/gallery/
├── tabiat/
│   └── togli-kol.jpg
├── shahar/
│   └── eski-shahar.jpg
├── hayvonlar/
└── sanat/
```

- The folder name becomes the category tab (`tabiat` → "Tabiat" etc. — see
  `CATEGORY_LABELS` in `src/gallery.ts` for the known slugs, or add a new
  folder name and it falls back to a title-cased label automatically).
- JPEG, PNG, or WebP, at least ~1200px on the long edge recommended — this is
  the puzzle's actual source image, not just a thumbnail, so a small file
  looks pixelated once scaled up to the board.
- The file name becomes the display label (`togli-kol.jpg` → "Togli Kol").
- Drop files in on the VPS at `/opt/puzzletogether/app/gallery/<category>/`
  (owned by the `puzzletogether` user) — they're live immediately, no restart
  needed.
