# Real-Time Transport — Design, Consistency Model, Concurrency

## 1. Chosen transport: Firestore (durable) + Realtime Database (ephemeral), no custom WebSocket server

No bespoke WebSocket/signaling server exists in this system — see
AGENT.md §2.2 and §6 for why, and `docs/architecture.md` §2 for the
stack-choice rationale. Two Firebase-native channels carry everything:

| | Firestore | Realtime Database |
|---|---|---|
| Carries | Room/game/participant metadata, confirmed piece positions (`pieceChunks`) | Live cursor/drag preview (`liveDrag`), presence (`presence`) |
| Authoritative? | **Yes** — the only source of truth for where a piece actually is | **No** — purely a preview; superseded by the next Firestore snapshot |
| Write rate | Low (once per drag-end, once per lock acquire/release) | High while dragging, throttled (see §3) |
| Consistency tool | Transactions + a monotonic `chunkVersion` | None needed — stale/lost ephemeral updates are harmless |

Evaluated and rejected for the ephemeral channel: using Firestore for
live cursor positions too. Firestore is billed and rate-limited per
write, and sustained ~20 Hz writes per actively-dragging piece would be
both expensive and likely to hit per-document write-rate limits (~1
sustained write/sec/doc) almost immediately under two or more
simultaneous draggers. RTDB's flat, cheap, high-frequency writes and
built-in `onDisconnect()` are a better fit for data that is allowed to be
lossy.

## 2. Event/data format

- **`pieceChunks/{chunkId}`** (Firestore): `{ chunkId, gameId, chunkVersion, pieces: { [pieceId]: PieceState } }`.
  `PieceState = { pieceId, x, y, rotation, groupId, lockedBy, lockExpiresAt }`.
  See `src/types/firestore.ts`.
- **`liveDrag/{gameId}/{pieceId}`** (RTDB): `{ uid, x, y, rotation, updatedAt }`
  — see `database.rules.json`'s `.validate` rules, which also reject any
  extra field (`$other: { ".validate": false }`) and require
  `uid == auth.uid` (a client can only publish live-drag data *as
  itself*).
- **`presence/{roomId}/{uid}`** (RTDB): `{ online: boolean, updatedAt }`.

## 3. Throttling

`src/features/puzzle/synchronization/liveDrag.ts`'s
`createThrottledPublisher` enforces `LIVE_DRAG_THROTTLE_MS = 50` (a 20 Hz
ceiling, `src/app/config.ts`): the first call in a window publishes
immediately, subsequent calls within the window are coalesced into one
trailing publish via a single pending `setTimeout`. This is a leading-
edge-then-trailing-edge throttle (not a naive "drop everything until the
window ends"), so the *final* position of a drag always gets published
even if the window would otherwise swallow it — important because
`clearLiveDragPosition` runs immediately after the Firestore commit, so
a swallowed final sample would otherwise leave a stale ghost position
briefly visible to others.

## 4. Concurrency model

### 4.1 Piece locks (pessimistic, leased)

`acquirePieceLock` (`pieceChunkSync.ts`) is a Firestore transaction:
read the chunk, check `canAcquireLock` (pure, unit-tested:
`pieceLock.ts`) against the piece's current `lockedBy`/`lockExpiresAt`,
and — only if free or expired — write `lockedBy = uid`,
`lockExpiresAt = now + PIECE_LOCK_LEASE_MS` (15s,
`src/app/config.ts`), bumping `chunkVersion`. Two clients racing for the
same piece cannot both win: Firestore's transaction semantics guarantee
only one commits against a given `chunkVersion`; the loser's transaction
is retried by the SDK against the now-current document and correctly
observes the lock already held.

A **lease**, not an indefinite lock: a client that crashes or loses its
connection mid-drag never permanently blocks a piece — once
`lockExpiresAt` passes, `canAcquireLock` allows anyone (including the
original holder, e.g. after a reconnect) to take it. Verified:
`tests/sync/pieceChunkSync.test.ts`'s "lets a different user acquire the
lock once the holder's lease has expired."

### 4.2 Stale-write rejection (optimistic version check)

Every `pieceChunks` write — lock acquire, lock release, or position
commit — increments `chunkVersion` by exactly one from the version it
read, inside the same transaction. `firestore.rules`' update rule
independently re-checks `request.resource.data.chunkVersion ==
resource.data.chunkVersion + 1` at write time — so even a client that
bypassed `pieceChunkSync.ts` entirely (a malicious or buggy client
talking to Firestore directly) cannot submit a write computed from a
version that is no longer current. This is the server-enforced half of
"out-of-order or stale updates must be detected"; the transaction-retry
behavior described in §4.1 is the client-enforced half.

### 4.3 Commit-time lock ownership check (defense in depth)

`commitPiecePositions` additionally skips applying any piece whose
`lockedBy` is set to someone other than the committing `uid` — so even
if a client somehow attempted to commit a piece it doesn't hold the lock
for (a bug, a forged request past the rules layer in some future
regression), the chunk silently keeps the lock holder's data rather than
being overwritten. Verified:
`tests/sync/pieceChunkSync.test.ts`'s "refuses to apply a commit for a
piece locked by another room member."

### 4.4 Group movement

Connected pieces share a `groupId`; `PuzzleEngine.commitGroup` collects
every member's final position and `commitPiecePositions` writes them
together (across potentially multiple chunks, one transaction per
affected chunk) — so a group's relative offsets are always computed and
committed from one consistent local snapshot, never read back piecemeal
mid-move.

## 5. Reconciliation

`PuzzleEngine.applyRemotePieceUpdate(pieceId, position, groupId)` is the
single entry point for "a Firestore snapshot says this piece is here."
It explicitly **declines to apply** the update if the piece's `groupId`
is the one currently being dragged locally
(`this.drag?.groupId === groupId`) — so a client's own in-flight,
optimistic drag is never visibly fought by a slightly-stale echo of its
own earlier state arriving back from the snapshot listener. Once the
drag ends and the commit round-trips, the next snapshot naturally
matches what's already on screen.

For every other piece (not being locally dragged), the authoritative
value always wins outright — there is no "diff and merge" logic,
by design: the whole point of a single `chunkVersion`-gated document is
that there is exactly one correct current value, and the client's job is
to display it, not negotiate with it.

## 6. Reconnection

`useRoomSync` (the hook backing `PuzzleRoomPage`) re-subscribes via
`onSnapshot`/`onValue` on every mount. There is no custom "resume from
last-seen version" protocol: on reconnect, Firestore/RTDB's own
listeners re-sync and deliver the current state, which `useRoomSync`
treats exactly like any other update — wholesale replacement, not delta
replay. This was a deliberate choice over building a custom delta/resume
protocol: Firestore's SDK already handles the "offline, then reconnect
and get caught up" case as part of its normal listener contract, and
re-implementing that (tracking last-seen versions per chunk, requesting
only the delta) would duplicate a solved problem for no concurrency
benefit here, since `pieceChunks` documents are already small and cheap
to re-fetch in full.

## 7. Known limitations

- **RTDB's `liveDrag` rules are coarser than Firestore's.** They require
  `auth != null` (any authenticated user) rather than "any authenticated
  *member of this room*," because RTDB Security Rules cannot reference
  Firestore room-membership data without denormalizing participant lists
  into RTDB too — a deliberate scope cut (see `docs/architecture.md`
  §7), acceptable specifically because `liveDrag` carries no
  authoritative state: the worst a non-member could do is see or spoof a
  harmless live-cursor preview for a room they aren't in, never actually
  move a piece (that still requires a valid Firestore lock + commit,
  which *are* membership-gated).
- **No delta/offline-queue protocol** — see §6. Acceptable given
  `pieceChunks`' small size; would need revisiting if chunk documents
  grew significantly larger.
- **True concurrent-write races are verified sequentially, not via
  simultaneous `Promise.all` calls**, in this project's own emulator
  tests — see `tests/sync/pieceChunkSync.test.ts`'s comment and
  `IMPLEMENTATION_PLAN.md` Phase 6/7 for why, and what a two-real-browser
  Playwright test would need to verify this for real.
