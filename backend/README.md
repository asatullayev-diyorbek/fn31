# PuzzleTogether VPS API

This is the self-hosted backend for `apipuzzle.asatullayev.uz`. It owns realtime
WebSocket traffic, Telegram webhooks, a local SQLite database and uploaded puzzle
images; no Firebase, AWS, Docker or object storage provider is required.

## Local run

```bash
cp .env.example .env
npm install
npm run dev
```

For production, run `npm run build && npm run start` under systemd, put Caddy or
Nginx in front of port 8080, terminate TLS for `apipuzzle.asatullayev.uz`, and
set `WEB_ORIGIN` to the Vercel production URL. Set a strong `JWT_SECRET`, then
back up `/var/lib/puzzletogether` (both SQLite and `uploads/`).

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
