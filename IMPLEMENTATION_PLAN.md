# IMPLEMENTATION_PLAN.md — Collaborative Jigsaw (PuzzleTogether)

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done ·
`[B]` blocked on an external manual step (documented, not faked).

This plan is kept in sync with reality. The "Completion status" column is
updated in the same commit as the code it describes.

---

## Phase 1 — Scaffolding & documentation

**Goal**: buildable skeleton, docs, tooling, test runners wired up.

Tasks:
- [x] `AGENT.md`, `IMPLEMENTATION_PLAN.md`.
- [x] Vite + React + TS (`strict`) scaffold, folder structure per AGENT.md §3.
- [x] ESLint + Prettier + `tsc --noEmit` wired as npm scripts.
- [x] Vitest configured (`npm test`), Playwright configured (`npm run e2e`).
- [x] `firebase.json`, `firestore.rules` (default-deny skeleton),
      `firestore.indexes.json`, `storage.rules`, `functions/` scaffold.
- [x] `.env.example` with only public, non-secret Vite config keys.

Required verification commands:
```
npm install
npm run typecheck
npm run lint
npm run build
```
Acceptance criteria: app builds, typechecks, lints clean, `npm test` runs
(even with zero tests) with exit code 0.

---

## Phase 2 — Deterministic puzzle geometry & rendering

**Goal**: pure, framework-free geometry engine; Canvas renderer consuming it.

Tasks:
- [x] `src/features/puzzle/geometry`: seeded PRNG, edge-knob generator,
      grid layout, piece polygon/clip-path construction, neighbor map.
- [x] Deterministic piece IDs (`row*cols+col`), shared-edge invariant: each
      internal edge's knob shape is generated once and reused (negated) by
      both adjacent pieces.
- [x] Support for arbitrary image aspect ratio via contain/cover crop
      rectangle computed before grid layout.
- [x] `src/features/puzzle/rendering`: Canvas 2D piece clipping, group
      compositing, devicePixelRatio-aware draw, dirty-rect redraw.
- [x] Unit tests: geometry continuity (edges match complementary
      neighbor), full-grid reconstruction has no gaps/overlaps, same seed
      → identical output across two independent calls, different seed →
      different output, aspect-ratio handling.

Required verification: `npm run test -- geometry`.
Acceptance criteria: 100% of geometry unit tests pass; geometry module has
no import from `react`, `firebase`, or DOM APIs other than types.

---

## Phase 3 — Local single-user interactions

**Goal**: drag, rotate, snap, group movement, zoom/pan, all working against
local-only state (no network) before synchronization is layered on.

Tasks:
- [x] `interactions/` pointer state machine: pick, drag, release, rotate
      gesture, multi-touch pan/zoom.
- [x] Group model: union-find style connected-piece groups; moving one
      piece moves its whole group by the same delta; rotating applies
      around the group's centroid.
- [x] Snapping: Classic mode snaps a piece/group to the correct
      image-space position within a configurable pixel+angle tolerance;
      Free mode snaps two pieces together only when their shared edge
      geometry is adjacent and aligned, never to absolute position.
      Snapping is a per-game toggle.
  - [x] Zoom (wheel/pinch), pan (drag background / two-finger), fit-to-screen,
      reset view, clamped zoom range.
- [x] Unit tests: coordinate transforms (screen↔world↔image space),
      rotation math, group delta propagation, snap tolerance edge cases,
      disconnected pieces never move together.

Required verification: `npm run test -- interactions`.
Acceptance criteria: a single browser session can fully solve a small
Classic puzzle and freely arrange a Free puzzle with no backend running.

---

## Phase 4 — Firebase Authentication & Telegram login

**Goal**: secure Telegram-only login/registration, no secret reaches the
browser, enforced by Cloud Functions + Firestore rules.

Tasks:
- [x] Firestore schema: `authTransactions/{id}`, `telegramIdentities/{tgId}`,
      `users/{uid}` (types + zod validators).
- [x] Cloud Function `createAuthTransaction` (callable): mints a
      cryptographically random single-use token, writes a `pending`
      transaction with 5-minute TTL, returns the token only (never a
      session).
- [x] Cloud Function `telegramWebhook` (HTTPS): verifies
      `X-Telegram-Bot-Api-Secret-Token` against the configured secret,
      parses `/start <token>`, looks up the pending transaction, marks it
      `verified` with the Telegram numeric user ID, replies to the chat.
      Rejects expired/missing/already-used tokens without leaking which
      case occurred to an attacker beyond what Telegram's own UI needs.
- [x] Cloud Function `completeAuthTransaction` (callable, polled or
      Firestore-listened by the client): once a transaction is `verified`,
      links/creates the `users/{uid}` + `telegramIdentities/{tgId}` record
      transactionally (existing Telegram ID → existing uid; new → new
      Firebase Auth user), marks the transaction `completed`, and returns
      a Firebase custom token.
- [x] Firestore rules: `authTransactions` readable only by its creator's
      anonymous session marker, writable only by Cloud Functions
      (Admin SDK bypasses rules; client has read-only + create via
      callable only); `telegramIdentities` and `users.telegramId` are
      never client-writable.
- [ ] Frontend `features/telegram-auth`: deep-link button, Firestore
      listener on the transaction doc, expiry countdown, sign-in with
      custom token, redirect.
- [x] Unit tests: token generation entropy/uniqueness, transaction state
      machine (pending→verified→completed / →expired / →failed), replay
      rejection, webhook secret verification.
- [B] **Blocked on external step**: a real Telegram bot (created via
      BotFather) and its token. The webhook handler, token validation, and
      transaction linking are implemented and unit-tested with simulated
      Telegram updates against the Firebase emulator; they cannot be
      exercised against the real Telegram API without a human performing
      the BotFather flow and configuring `TELEGRAM_BOT_TOKEN` /
      `TELEGRAM_WEBHOOK_SECRET` in Cloud Functions config. See
      `docs/telegram-auth.md` §"Manual setup required".

Required verification:
```
firebase emulators:exec --only firestore,auth "npm --prefix functions run test:integration"
npm --prefix functions test        # pure unit tests, no emulator needed
```
Acceptance criteria: all transaction-state and rules tests pass against
the emulator; no bot token or webhook secret appears anywhere in
`src/`, `VITE_*` env, or a committed file.

**Status: code complete and verified against the real Firebase Emulator
Suite (Firestore + Auth), except the one genuinely external step.**
- `functions/src/auth/{token,transactionLogic,createAuthTransaction,
  completeAuthTransaction,identityLinking}.ts` and
  `functions/src/telegram/{webhookSecurity,parseUpdate,handleTelegramStart}.ts`
  implement every trust-boundary rule in this phase, including the
  create-vs-link race fix (client-chosen UID reserved inside a Firestore
  transaction, Auth user created only by the transaction's winner) and
  idempotent retry (completing an already-completed transaction returns
  the same uid instead of erroring or duplicating).
- 15 pure unit tests (`functions/src/**/*.test.ts`, token entropy,
  transaction state machine, webhook secret constant-time comparison,
  `/start` command parsing) — passing, no emulator required.
- 8 integration tests (`functions/tests/integration/authFlow.test.ts`)
  against the real Firestore + Auth emulators — passing. Covers: full
  pending→verified→completed flow creating a real Firebase Auth user;
  replay of an already-verified token rejected; unknown token rejected;
  TTL expiry before verification; completing a never-verified transaction
  rejected; idempotent re-completion (same uid, no duplicate Auth user);
  a second login from the same Telegram account reusing the same uid
  (username change handled as a mutable field, not a new identity); a
  hand-crafted "verified" transaction with no telegram identity fields
  still refused by the function layer (defense in depth under the rules
  tested in Phase 5).
- `createAuthTransactionCallable`, `completeAuthTransactionCallable`,
  `telegramWebhook` (`functions/src/index.ts`) wire these into real
  Cloud Functions (v2, onCall/onRequest) using `defineSecret` for
  `TELEGRAM_BOT_TOKEN`/`TELEGRAM_WEBHOOK_SECRET` — never read from
  `VITE_*`, never logged.

---

## Phase 5 — Rooms, participants, security rules

**Goal**: room/game Firestore schema, Dashboard, Create Puzzle page,
Storage rules for images, full rules test suite.

Tasks:
- [x] Schema: `rooms/{roomId}`, `rooms/{roomId}/participants/{uid}`,
      `rooms/{roomId}/games/{gameId}`, `images/{imageId}` + Storage paths.
- [x] Firestore rules: room owner/participant checks, piece-count bounds,
      field allow-lists on writes, no cross-room reads.
- [x] Storage rules: authenticated-only upload, path = `images/{uid}/...`,
      content-type allow-list, size limit, no public read of other users'
      originals unless the room is public.
- [x] Rules tests (`@firebase/rules-unit-testing`): default-deny,
      ownership, membership, field tampering, oversized piece count,
      cross-room access, storage content-type/size rejection. (28 + 6
      tests, run and passing against the real emulator — see Phase 4's
      status note; written together with Phase 4's rules since both
      phases share one `firestore.rules` file.)
- [ ] `CreatePuzzlePage`: mode, image source (gallery or upload), piece
      count (validated 25–500 inclusive, server-re-validated), difficulty
      preset, visibility, generates invite link.
- [ ] `DashboardPage`: create, join by code/link, recent rooms, owned
      rooms, profile, logout — all scoped to the authenticated user's own
      data via rules-enforced queries.
- [ ] Image upload pipeline: client-side decode validation
      (`createImageBitmap`) before upload, not just extension/MIME check.

Required verification:
```
firebase emulators:exec --only firestore,storage "npm run test:rules"
```
Acceptance criteria: all rules tests pass, including every adversarial
case listed in the task's §13 "Security tests".

---

## Phase 6 — Real-time synchronization

**Goal**: multiple clients manipulate the same game safely and converge.

Tasks (schema already shipped in Phase 4/5's `pieceChunks` + rules; this
phase is the client-side sync engine that writes/reads it):
- [x] Durable state schema: `pieceChunks/{chunkId}` holds `chunkVersion` +
      a bounded `pieces` map; the rules' `chunkVersion == old + 1` check
      (Phase 4/5, already tested) is the server-enforced half of
      stale-write rejection.
- [ ] Ephemeral state: RTDB `liveDrag/{gameId}/{pieceId}` client — throttled
      (~20 Hz max) position broadcast while a piece is actively dragged by
      its lock holder, auto-cleared on disconnect via `onDisconnect()`.
      (Rules for this already shipped in Phase 4/5's `database.rules.json`.)
- [ ] Piece lease: `lockedBy`/`lockExpiresAt` fields; acquiring a lock is a
      transaction that fails if already held and unexpired; leases expire
      after N seconds of inactivity so a dropped client doesn't block a
      piece forever.
- [ ] Reconciliation: local optimistic move is applied immediately;
      authoritative Firestore update (on drag end) is the source of truth;
      a client whose optimistic state diverges snaps to the authoritative
      value when it arrives.
- [ ] Reconnection: on reconnect, client re-subscribes and replaces local
      state wholesale with the latest snapshot rather than attempting to
      replay missed deltas.
- [ ] Integration tests: concurrent lock acquisition (one wins), stale
      version rejected end-to-end through the sync client (not just the
      rules layer), group move preserves relative offsets, disconnect
      releases lock after lease expiry (simulated clock).

Required verification:
```
firebase emulators:exec --only firestore,database "npm run test:sync"
```
Acceptance criteria: two simulated clients against the emulator never
produce a corrupted/divergent `pieces` map across 500 interleaved random
operations (property-based test).

---

## Phase 7 — Integration, accessibility, performance, E2E

**Goal**: everything wired together in the real UI; responsive; audited.

Tasks:
- [ ] `PuzzleRoomPage`: canvas + tray, zoom/pan controls, invite-link copy,
      participant list w/ connection status, progress, completion banner,
      reference-image toggle, loading/reconnecting/error states.
- [~] Responsive layout incl. touch target sizing; `prefers-reduced-motion`
      respected; focus-visible states; icon buttons have `aria-label`s;
      live-region progress/completion announcements. (`PuzzleBoard`
      already does the live-region/aria-label/touch-target parts, per
      Phase 3's browser verification; room-page-level responsiveness
      still open.)
- [ ] `docs/accessibility.md`: WCAG 2.2 AA pass with findings &
      remediations, including the canvas-alternative (list-based piece
      picker with keyboard move/rotate/place) for pointer-free operation.
- [ ] Playwright E2E (two browser contexts) against emulators + dev
      server, covering the task's §13 scenario list.
- [ ] `docs/performance.md`: actually-measured results for the scenarios
      in §12, run in this environment (headless, single machine — limits
      documented), not claimed figures.

Required verification:
```
firebase emulators:start &  npm run e2e
```
Acceptance criteria: listed Playwright scenarios pass headlessly against
emulators in this environment; performance doc contains only measured
numbers with method and environment caveats.

---

## Phase 8 — Deployment readiness & final report

**Goal**: everything needed for a human to deploy to a real Firebase
project and a real Telegram bot, without this agent doing so itself.

Tasks:
- [ ] `docs/deployment.md`, `docs/security.md`, `docs/architecture.md`,
      `docs/telegram-auth.md`, `docs/websocket-or-realtime.md`.
- [ ] Production security checklist.
- [ ] Final acceptance report (chat deliverable) per AGENT.md §10.
- [B] Actual `firebase deploy` to a production project — requires a real
      Firebase project + billing + owner authorization, none of which
      exist in this session. Not performed; exact commands documented
      instead.

---

## Known risks

- Firestore single-document write-rate limits (~1 write/sec sustained per
  doc) cap how fast the authoritative `pieces` map can be updated when
  many pieces move at once; mitigated by RTDB ephemeral layer + batching,
  documented as a scaling limit for very large concurrent-drag scenarios.
- 500-piece puzzles push the single-document size and canvas redraw cost;
  Phase 6/7 document the measured ceiling rather than assuming it.
- No real Telegram bot/project in this environment: Phase 4's webhook
  logic is emulator/unit-tested only, flagged `[B]` until a human
  completes the BotFather + Firebase project setup in `docs/deployment.md`.

## Completion status snapshot

Updated at the end of each phase; see the per-phase checklists above for
the authoritative, current state.
