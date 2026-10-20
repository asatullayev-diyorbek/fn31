# PuzzleTogether

A real-time multiplayer jigsaw puzzle web app. Two or more people —
already talking over a Telegram call — open the same room and solve one
puzzle together, with every piece move synchronized across their
devices. The app itself never carries voice, video, or chat; that
happens in Telegram.

See `AGENT.md` for the binding architecture/coding contract,
`IMPLEMENTATION_PLAN.md` for the phase-by-phase build log and current
status, and `docs/` for the architecture, Telegram auth, real-time
design, security, and deployment write-ups.

## Features

- **Telegram-only login/registration** — no passwords; a single deep-link
  flow handles both, with server-side identity verification (see
  `docs/telegram-auth.md`).
- **Free mode**: arrange pieces however you like, with optional
  neighbor-snapping.
- **Classic mode**: reconstruct the source image from interlocking
  jigsaw-shaped pieces, snapping into their correct slot.
- **Custom images or a built-in gallery**, piece count from 25–500.
- **Real-time multiplayer**: piece moves, locks, and presence sync across
  every participant's browser via Firestore + Realtime Database — see
  `docs/websocket-or-realtime.md`.
- **Deterministic puzzle geometry**: every client computes byte-identical
  piece shapes from a shared seed, with no network round trip needed —
  see `docs/architecture.md` §3 and the 17 geometry unit tests.

## Prerequisites

- Node.js 20+ and npm.
- Java (for the Firebase Emulator Suite — Firestore/Database/Storage
  emulators run on the JVM).
- The `firebase-tools` CLI (installed as a dev dependency; `npx firebase
  ...` works without a separate global install).
- For real deployment only: a Firebase project on the Blaze (pay-as-you-go)
  plan (Cloud Functions require it) and a Telegram bot token from
  `@BotFather` — see `docs/deployment.md` and `docs/telegram-auth.md` §7.

## Installation

```bash
npm install
npm --prefix functions install
cp .env.example .env   # see .env.example's comments for what each value is
```

`.env`'s defaults (`VITE_USE_FIREBASE_EMULATORS=true`, a `demo-*` project
id) are enough to run the whole app locally against the Firebase
Emulator Suite — no real Firebase project or Telegram bot is required to
develop, test, or explore most of the app (Telegram login itself won't
complete without a real bot; everything else works).

## Running locally

```bash
npm run dev               # Vite dev server
firebase emulators:start  # separate terminal — Emulator UI at :4000
```

## Testing

```bash
npm run typecheck    # tsc, across the app/tests/e2e TS projects
npm run lint         # eslint (root + functions)
npm test             # vitest — pure unit tests, no emulator (45 tests)
npm --prefix functions test   # functions' own pure unit tests (15 tests)

# Emulator-backed (each spins up a fresh local emulator automatically):
firebase emulators:exec --only firestore,auth,storage,database "npm run test:rules"
firebase emulators:exec --only firestore,auth,database "npm run test:sync"
firebase emulators:exec --only firestore,auth "npm --prefix functions run test:integration"

# Two-browser-context E2E (see IMPLEMENTATION_PLAN.md Phase 7 for this
# repo's own environment-specific result and investigation):
firebase emulators:exec --only firestore,auth,database,storage "npm run e2e"
```

## Building

```bash
npm run build   # tsc -b + vite build → dist/
```

## Deployment

See `docs/deployment.md` for the full, reproducible sequence (Firebase
project setup, Telegram bot setup, `firebase deploy`, custom domains,
backups). **Nothing has been deployed to a real Firebase project from
this repository's development session** — no such project or Telegram
bot exists in that environment; deployment there is instructions, not a
completed step.

## Project structure

```
src/
├── app/                 router, providers, public config
├── components/          shared UI (layout, feedback)
├── features/
│   ├── auth/             AuthProvider, RequireAuth guard
│   ├── telegram-auth/     login flow (useTelegramLogin, LoginPage)
│   ├── dashboard/         landing + dashboard pages
│   ├── rooms/             create/join room pages, roomsApi
│   ├── images/            gallery, upload, validation
│   └── puzzle/
│       ├── geometry/       deterministic jigsaw generator (pure)
│       ├── rendering/       Canvas 2D renderer + viewport math (pure)
│       ├── interactions/    group/snap/gesture logic (pure)
│       ├── engine/          PuzzleEngine composing the above
│       └── synchronization/ Firestore/RTDB sync, locks, chunking
├── lib/                  firebase client composition, validation helpers
└── types/                Firestore document shapes

functions/                Cloud Functions (separate package) — Telegram
                          auth trust boundary only, see docs/telegram-auth.md
tests/rules/, tests/sync/ emulator-backed integration tests (Vitest)
functions/tests/integration/ emulator-backed Cloud Functions tests
e2e/                      Playwright, two real browser contexts
docs/                     architecture, telegram-auth, real-time,
                          security, accessibility, performance, deployment
```

## Known limitations

See `IMPLEMENTATION_PLAN.md`'s per-phase status and `docs/accessibility.md`
§3 / `docs/performance.md` §5 for the complete, honest list. Headlines:
no keyboard-only alternative to the pointer-driven puzzle canvas yet;
"recently joined rooms" is per-device only; a real two-browser E2E test
is written but could not be confirmed passing in this development
session's specific sandboxed environment (investigated and documented,
not a silent gap); Telegram login and any production Firebase deployment
require manual setup this session's environment cannot perform.
