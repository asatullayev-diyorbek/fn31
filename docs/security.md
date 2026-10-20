# Security

## 1. Threat model

Actors considered: an unauthenticated visitor; a signed-in user acting
against their own data; a signed-in user acting against *another* user's
or room's data (the main adversarial case, "Mallory" in the test files);
a party that intercepts or forges a Telegram webhook request; a party
that obtains a leaked Firebase web config (not a secret — see §2) and
tries to use it directly against Firestore/Storage.

Explicitly out of scope for this project, by its own nature: protecting
the content of a Telegram call (there is none in this product), and
protecting against a compromised Telegram account itself (if an
attacker controls a real victim's Telegram account, this system
correctly treats them as that victim — that is Telegram's problem to
solve, not this app's).

## 2. The Firebase web config is not a secret — what actually protects data

`src/app/config.ts`'s `firebaseConfig` (apiKey, projectId, etc.) is
shipped in the browser bundle and is not a secret: Firebase's own
documentation is explicit that this config identifies *which* project a
client talks to, not *what it's allowed to do*. What actually enforces
authorization in this system, in order of what a request must pass:

1. **Firebase App Check** (configured via `initializeClientAppCheck`,
   skipped only against local emulators) — rejects requests not
   originating from this app's own built client.
2. **Firebase Authentication** — every privileged read/write requires
   `request.auth != null`, and almost everything further requires
   `request.auth.uid` to match a specific owner/participant/self check.
3. **Firestore/Storage Security Rules** (`firestore.rules`,
   `storage.rules`) — the actual authorization logic, enforced
   server-side on every request regardless of what the client-side code
   does or doesn't check. See §3.
4. **Cloud Functions, for the handful of operations rules cannot
   express** — see §4.

## 3. Firestore/Storage rules — what's enforced, and proof

Full rules: `firestore.rules`, `storage.rules`, `database.rules.json`.
Summary table (collection → who can do what):

| Collection | get/list | create | update | delete |
|---|---|---|---|---|
| `users/{uid}` | any signed-in user | **never** (Cloud Function only) | self, display fields only | never |
| `telegramIdentities/{id}` | **never** | **never** | **never** | never |
| `authTransactions/{id}` | get: anyone with the exact id; list: never | **never** | **never** | never |
| `rooms/{roomId}` | unlisted rooms: anyone; private: members only | signed-in user, as themself | owner, status/visibility/currentGameId/etc. only | owner |
| `.../participants/{uid}` | self or room member | self (role must match reality) | self, presence fields only | self or owner |
| `.../games/{gameId}` | room members | owner, bounded pieceCount, stateVersion=0 | room members, progress/version fields only, version must advance | owner |
| `.../pieceChunks/{id}` | room members | owner, chunkVersion=0 | room members, chunkVersion must advance by exactly 1 | never |
| `images/{imageId}` | get: any signed-in user; list: owner only | signed-in user, as owner, validated content-type/size | **never** | owner |
| Storage `images/{uid}/*` | any signed-in user | owner, validated size/content-type | — | owner |
| RTDB `liveDrag/*` | any signed-in user | any signed-in user, as self, schema-validated | — | — |

**This is not an inspection-only claim.** 34 tests
(`tests/rules/firestore.rules.test.ts`, `storage.rules.test.ts`) assert
every row above against the real Firebase emulator, including the
adversarial cases the task specifically asks for:

- Unauthenticated access to every private collection → denied.
- A user attempting to modify another user's profile, or their own
  `telegramUserId` → denied.
- A client attempting to create/complete its own auth transaction, or
  read another user's by guessing → denied/impossible (no `list`).
- A non-member reading a private room, its participants, its games, or
  its piece state → denied.
- A joining user claiming the `owner` role without being the room owner
  → denied.
- A room member attempting to rewrite a game's `pieceCount`/mode/geometry
  → denied.
- A stale (non-`+1`) `pieceChunks` write → denied.
- An image upload with a disallowed content type, oversized payload, or
  a forged `ownerUid` → denied.
- A Storage upload under another user's path, from an unauthenticated
  client, or with a mismatched declared content-type → denied.

Run: `firebase emulators:exec --only firestore,auth,storage,database
"npm run test:rules"`. Last known result: **34/34 passing** (see
`IMPLEMENTATION_PLAN.md` Phase 4/5 for the full run log).

## 4. Privileged operations (Cloud Functions) — and why each is necessary

Every Cloud Function in this project exists only because the operation
genuinely cannot be expressed as a Security Rule:

- **`createAuthTransactionCallable`**: must generate a cryptographically
  random token server-side — a client cannot be trusted to generate (or
  disclose) its own unguessable secret.
- **`telegramWebhook`**: must verify a secret only Telegram and this
  function know, and must be the only path that can ever mark a
  transaction `verified` — if a client could do this directly, the
  entire login flow would collapse to "anyone can claim any identity."
- **`completeAuthTransactionCallable`**: must decide whether a Telegram
  identity is new or existing and mint a Firebase custom token — minting
  auth tokens is an Admin-SDK-only operation by design, never exposable
  to Security Rules.

No other server-side logic exists. Room/game/image CRUD, piece movement,
and every page render are ordinary rules-authorized client operations —
deliberately, per AGENT.md §2.2's "no server unless the operation is
unavoidable."

## 5. Abuse prevention / rate limiting

- **Auth transactions** are single-use and expire in 5 minutes
  (`AUTH_TRANSACTION_TTL_MS`), bounding how long a minted-but-unused
  token remains a (still-unguessable) attack surface.
- **Piece locks** expire after 15 seconds of inactivity
  (`PIECE_LOCK_LEASE_MS`), so a client cannot hold a piece hostage
  indefinitely, maliciously or by crashing.
- **Image uploads** are capped at 15 MB and restricted to
  `image/jpeg|png|webp`, enforced in Storage Rules (server-side,
  `request.resource.size`/`contentType`), not just the client-side
  `validateImageFile` decode check — the client check is a UX nicety,
  never the actual boundary.
- **App Check** (§2) is the primary defense against scripted abuse of
  Cloud Functions/Firestore from outside this app's own client, once a
  real project enables it (see `docs/deployment.md` for the one-time
  setup this environment could not perform).
- **Not implemented**: a dedicated per-user rate limit on
  `createAuthTransactionCallable` (e.g. "at most N login attempts per
  minute per IP"). App Check substantially mitigates scripted abuse, but
  a human-level cooldown is a reasonable addition before production use
  at scale — flagged here rather than silently assumed.

## 6. Input validation at trust boundaries

Every Cloud Function validates its own inputs independently of Security
Rules (`completeAuthTransactionCallable` throws `invalid-argument` for a
missing/malformed `transactionId`; `telegramWebhook` treats any update
that doesn't parse as a well-formed `/start <token>` as a no-op rather
than guessing). `functions/src/telegram/parseUpdate.ts`'s functions
return `null` rather than throwing on malformed input specifically so
the webhook handler's control flow stays a simple "is this the message
we care about" check, not an exception-driven one — tested in
`parseUpdate.test.ts` against malformed/partial/unrelated Telegram
updates.

## 7. Image privacy — a documented, deliberate tradeoff

Image *metadata* (`images/{imageId}`) and the underlying Storage object
are readable by **any signed-in user**, not scoped to the room(s) that
reference that image. This is intentional: implementing per-room image
scoping would require every image read to check which room(s) reference
it and whether the requester is a member of one of them — a
cross-collection check Security Rules can express but at real
read-amplification cost, for privacy value this product doesn't actually
need: the real privacy boundary a user cares about is "can a stranger
join my room and see our puzzle," which is fully enforced by the room's
unguessable invite code plus the room/game/pieceChunks rules in §3. An
uploaded photo being technically fetchable by any other *authenticated*
user of the app (never an anonymous one) if they somehow obtained its
random `imageId`/Storage path is the accepted residual risk, documented
here rather than silently assumed away.

## 8. Known gaps / not done

- No per-identity rate limiting beyond App Check (§5).
- No automated secret-scanning/dependency-audit step wired into CI in
  this repo (manual `npm audit` was run ad hoc during development; see
  the final report for its output).
- No formal penetration test; the adversarial cases in §3 are the
  extent of security testing performed, chosen directly from the task's
  own "§13 Security tests" list.
