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
