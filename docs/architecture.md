# Architecture

## 1. System overview

```
┌─────────────┐      deep link       ┌───────────────┐
│   Browser   │ ───────────────────▶ │ Telegram app   │
│  (React)    │                      │ + our bot      │
└──────┬──────┘                      └───────┬────────┘
       │ Firestore/RTDB listeners            │ webhook (HTTPS)
       │ + callable functions                ▼
       │                             ┌────────────────────┐
       │                             │ Cloud Functions (v2)│
       │                             │ - createAuthTransaction
       │                             │ - telegramWebhook   │
       │                             │ - completeAuthTransaction
       │                             └─────────┬──────────┘
       ▼                                       ▼
┌─────────────────────────────────────────────────────────┐
│ Firebase: Firestore · Realtime Database · Storage · Auth │
│            (Security Rules enforce everything)           │
└─────────────────────────────────────────────────────────┘
```

No independently hosted server exists anywhere in this system. The only
backend code is the three Cloud Functions above — everything else is the
browser talking directly to Firestore/RTDB/Storage/Auth, authorized by
Security Rules (see `docs/security.md`), not by a server in the middle.

## 2. Why this stack, and the alternatives rejected

- **React + Vite, no Next.js**: there is no server-rendering or API-route
  need here — every page is a client-rendered SPA view over Firebase
  data. Next.js would add a Node server process this project explicitly
  avoids (AGENT.md §2.2).
- **No Redux / global state library**: the two pieces of genuinely global
  state (auth user, per-room puzzle state) are each already owned by a
  dedicated context/hook (`AuthProvider`, `useRoomSync`) with a narrow,
  typed surface — a general-purpose store would add indirection without
  solving a problem this project actually has.
- **Firestore (not just RTDB) for durable state**: Firestore's structured
  documents, Security Rules' expressive per-field validation, and
  transactions-with-automatic-retry are a much better fit for
  `rooms`/`games`/`pieceChunks` than RTDB's plain JSON tree. RTDB is used
  *only* for `liveDrag` (see `docs/websocket-or-realtime.md`), where its
  lower latency and `onDisconnect()` primitive matter more than
  Firestore's structure.
- **Cloud Functions, minimally**: the only things in this system that
  *must* run somewhere the browser cannot control are: minting a random
  auth token, verifying Telegram's webhook secret, and deciding whether a
  Telegram identity may mint a Firebase custom token. Those three
  operations are the entirety of `functions/src/index.ts`'s exports. No
  other server-side logic exists — room creation, piece movement, image
  upload, and every page render are ordinary authenticated Firestore/
  Storage operations from the browser, authorized by Security Rules.

## 3. Firestore data model

```
users/{uid}
telegramIdentities/{telegramUserId}
authTransactions/{transactionId}
images/{imageId}
rooms/{roomId}
  participants/{uid}
  games/{gameId}
    pieceChunks/{chunkId}
```

Full field-level shapes are in `src/types/firestore.ts` (frontend) and
`functions/src/shared/types.ts` (Cloud Functions — duplicated
deliberately; see that file's header comment). Key design choices:

- **`roomId` is the invite code.** A room's Firestore document id is a
  random, URL-safe slug generated client-side
  (`src/lib/validation/randomId.ts`); there is no separate `inviteCode`
  lookup collection. Joining a room is a single `get` by a known id —
  the same "unguessable id is the access boundary" pattern used for
  `authTransactions` (see `docs/security.md` §2).
- **`pieceChunks` shards piece state.** A game's `pieces` map is split
  across `pieceChunks/{chunkId}` documents of ≤ `PIECES_PER_CHUNK` (40)
  pieces each (`src/features/puzzle/synchronization/chunking.ts`), so
  even the 500-piece MVP maximum stays far under Firestore's 1 MiB
  document limit, and clients editing pieces in *different* chunks never
  contend on the same document.
- **`stateVersion` / `chunkVersion` are monotonic, rules-enforced
  counters.** `firestore.rules`' `pieceChunks` update rule requires
  `chunkVersion == resource.data.chunkVersion + 1` — a write computed
  from a stale read is rejected server-side, not just by client
  discipline. See `docs/websocket-or-realtime.md` for the full
  consistency model this supports.
- **Room creation is two sequential requests, not one atomic batch.**
  `roomsApi.ts`'s `createRoom` commits the room document first, then
  participant/game/pieceChunks. This isn't a style choice: Security
  Rules' `get()`/`exists()` calls only see state committed *before* the
  current request, never other writes in the same batch — so a single
  batch creating the room *and* documents whose rules read the room
  (via `isRoomOwner`) would always see "room doesn't exist yet" and be
  rejected. This was found and fixed during this project's own E2E
  testing; see `IMPLEMENTATION_PLAN.md` Phase 7 for the discovery.

## 4. Authentication flow

See `docs/telegram-auth.md` for the complete sequence diagram and threat
model. In one sentence: a random token is minted server-side, carried to
Telegram via a deep link, verified there by a trusted webhook handler,
and only then exchanged for a Firebase custom token — the browser never
asserts its own identity.

## 5. Real-time synchronization

See `docs/websocket-or-realtime.md` for the full design. In one
sentence: Firestore (with per-chunk version-gated writes and a
transaction-based piece lock) is the durable source of truth; Realtime
Database carries a throttled, non-authoritative live-drag preview that
is always superseded by the Firestore commit when a drag ends.

## 6. Room lifecycle

1. **Create** (`CreatePuzzlePage` → `roomsApi.createRoom`): generates
   geometry from a `(roomId, gameId, geometryVersion)`-derived seed,
   computes a deterministic initial scatter, writes `rooms/{roomId}`,
   then `participants/{ownerUid}`, `games/{gameId}`, and each
   `pieceChunks/{chunkId}`.
2. **Join** (`useRoomSync`'s mount effect → `roomsApi.joinRoom`): any
   authenticated user navigating to `/room/{roomId}` upserts their own
   `participants/{uid}` document (rules require `uid == self`, so no one
   can join as someone else).
3. **Play**: `PuzzleRoomPage` subscribes to room/participants/game/
   pieceChunks via `onSnapshot` and to `liveDrag` via RTDB; drags call
   `acquirePieceLock` → (throttled live-drag publishes) →
   `commitPiecePositions` on release.
4. **Presence**: each client writes `presence/{roomId}/{uid}` in RTDB
   with an `onDisconnect()` handler, so a closed tab or lost connection
   is reflected as "offline" without any server polling.
5. **Completion**: `computeClassicProgress` (pure, unit-tested) runs
   client-side against the authoritative `pieces` map; when it reaches 1,
   the UI announces completion. (Writing `completedAt` back to the
   `games` document from the client, for every participant to see
   consistently, is in `IMPLEMENTATION_PLAN.md` as a small remaining
   wiring gap — the detection logic itself is complete and tested.)

## 7. Known architectural limitations (see IMPLEMENTATION_PLAN.md for the full list)

- "Recently joined rooms" is per-device (`localStorage`), not a
  cross-device Firestore query — a deliberate scope cut, not an
  oversight (`roomsApi.ts`'s comment explains the collection-group-rules
  work that would be needed).
- RTDB's `liveDrag` rules authorize "any authenticated user," not
  "any authenticated *room member*" — RTDB rules can't reference
  Firestore room membership without denormalizing it into RTDB too. This
  is acceptable because `liveDrag` carries no authoritative state (see
  `docs/websocket-or-realtime.md`), but it is a real, documented
  narrowing gap, not an oversight.
- No spatial culling in the Canvas renderer yet (see `docs/performance.md`).
