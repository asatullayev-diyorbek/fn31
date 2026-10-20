# Telegram Login — Sequence, Threat Model, Secrets

## 1. Sequence

```
Browser                 Cloud Functions            Firestore          Telegram
   │  click "Telegram         │                        │                  │
   │  orqali kirish"          │                        │                  │
   │─ open about:blank ───────┼────────────────────────┼──────────────────┤ (sync, before
   │  (popup, see below)      │                        │                  │  any await —
   │                          │                        │                  │  avoids popup
   │  createAuthTransactionCallable()                  │                  │  blockers)
   │─────────────────────────▶│                        │                  │
   │                          │ generate 256-bit token │                  │
   │                          │ (== doc id)            │                  │
   │                          │───────────────────────▶│ create pending,  │
   │                          │                        │ 5-min TTL doc    │
   │◀─────────────────────────│ {transactionId,         │                  │
   │  {transactionId}          │  sessionMarker,         │                  │
   │                          │  expiresAtMs}           │                  │
   │                          │                        │                  │
   │  popup.location =                                                     │
   │  https://t.me/Bot?start=<transactionId> ──────────────────────────────▶│
   │                          │                        │                  │ user taps
   │  onSnapshot(                                                          │ "Start"
   │   authTransactions/{id})│                        │                  │
   │─────────────────────────┼───────────────────────▶│ (listening)       │
   │                          │                        │                  │◀── /start <token>
   │                          │◀───────────────────────┼──────────────────│  (webhook POST)
   │                          │ verify X-Telegram-Bot-                     │
   │                          │ Api-Secret-Token header │                  │
   │                          │ parse /start <token>    │                  │
   │                          │ Firestore transaction:  │                  │
   │                          │  pending+unexpired?     │                  │
   │                          │───────────────────────▶│ status=verified, │
   │                          │                        │ telegramUserId=..│
   │                          │◀── reply to chat ───────┼──────────────────▶│ "Tasdiqlandi!"
   │◀─ snapshot: verified ────┼────────────────────────│                   │
   │  completeAuthTransactionCallable({transactionId}) │                   │
   │─────────────────────────▶│                        │                  │
   │                          │ load tx, verify         │                  │
   │                          │ verified+unexpired      │                  │
   │                          │ linkTelegramIdentity()  │                  │
   │                          │  (see §3)               │                  │
   │                          │ mark completed, uid     │                  │
   │                          │ mint custom token        │                  │
   │◀─────────────────────────│ {customToken}           │                  │
   │  signInWithCustomToken() │                        │                  │
   │  → redirect              │                        │                  │
```

Implementation: `src/features/telegram-auth/useTelegramLogin.ts` (browser
side), `functions/src/auth/*.ts` + `functions/src/telegram/*.ts` +
`functions/src/index.ts` (trusted side).

## 2. Transaction lifecycle

`pending → verified → completed`, with `→ expired` or `→ failed` possible
from `pending`/`verified`. Enforced by
`functions/src/auth/transactionLogic.ts`'s `canVerify`/`canComplete`
(pure, unit-tested) and mirrored by `firestore.rules`:

- `pending`: created by `createAuthTransaction`. TTL = 5 minutes
  (`AUTH_TRANSACTION_TTL_MS`).
- `verified`: set only inside `handleTelegramStart`'s Firestore
  transaction, only when the transaction was `pending` and unexpired.
  Carries the Telegram numeric id + display name fields the webhook
  itself read from Telegram's own payload — never anything the browser
  supplied.
- `completed`: set only inside `completeAuthTransaction`, only when
  `verified` and unexpired; carries the linked Firebase `uid`.
- `expired`: set by either function when it finds a transaction past its
  TTL in a state that requires action.
- `failed`: reserved for future use (e.g. a webhook-side validation
  failure distinct from "not found"); not currently set by any code path.

**Replay/reuse is structurally prevented**, not just discouraged:
`handleTelegramStart` only transitions `pending → verified`, so sending
`/start <token>` twice for the same token the second time falls through
to "already-used" (tested:
`functions/tests/integration/authFlow.test.ts`'s "rejects a replayed
/start"). `completeAuthTransaction` is idempotent on an already-
`completed` transaction (same uid returned, no new user created) rather
than erroring, which is what makes it safe to retry after a dropped
network response.

## 3. Identity linking — no duplicate accounts, no orphaned accounts

`functions/src/auth/identityLinking.ts`'s `linkTelegramIdentity` closes a
specific race: two logins (or a redelivered webhook) for the same
brand-new Telegram account, arriving concurrently.

1. A Firestore **transaction** reads `telegramIdentities/{telegramUserId}`.
   If it exists, return its `uid` — no further action. If not, the
   *same transaction* writes a reservation with a **locally generated**
   candidate uid (`crypto.randomUUID()`-derived, never calling the Auth
   API from inside the transaction, since Firestore may retry the
   transaction function on contention and an Auth API call must not be
   retried blindly).
2. Only the transaction that actually wins the reservation calls
   `auth.createUser({ uid: candidateUid, ... })` — once, outside the
   transaction, using that specific uid.
3. `users/{uid}` is written with `set(..., { merge: true })`, not
   `update`, so a prior attempt that reserved the identity but crashed
   before writing the profile is self-healed on the next successful
   login, rather than leaving a permanently broken account.

Verified by `functions/tests/integration/authFlow.test.ts` against the
real Auth + Firestore emulators: a fresh login creates exactly one user;
completing an already-completed transaction returns the same uid without
a second `auth.createUser()` call (checked via `auth.listUsers()`); a
second login from the same Telegram id (with a changed username) reuses
the same uid and updates only the mutable `telegramUsername` field.

## 4. Secret management

| Secret | Where it lives | Never appears in |
|---|---|---|
| Telegram bot token | Cloud Functions secret (`TELEGRAM_BOT_TOKEN`, via `firebase functions:secrets:set`) | `VITE_*` env, any committed file, any Firestore document, any log line |
| Telegram webhook secret | Cloud Functions secret (`TELEGRAM_WEBHOOK_SECRET`) | same as above |
| Auth transaction token | Firestore document id, generated server-side, returned to the browser exactly once | any log line (the webhook handler never logs the raw token — see `handleTelegramStart`'s comments) |

`functions/src/index.ts` reads both secrets via `defineSecret` (Cloud
Functions v2 params), never via `process.env.TELEGRAM_BOT_TOKEN` read
ad hoc, so they're only resolved inside the deployed function's runtime,
never bundled into anything shipped to a client.

## 5. Why the auth-transaction token can safely double as a Firestore document id

`firestore.rules`' `authTransactions` rule allows an unauthenticated
`get` by exact id, denies `list` entirely, and denies every client
`write`. Knowing the 256-bit random id is the access control — identical
in spirit to Firebase's own email-link sign-in, or a password-reset
email token. An attacker who doesn't already have the id cannot guess it
(2²⁵⁶ space) or enumerate it (no `list`), and even having it grants
nothing beyond "can see this transaction's status" — it never grants the
ability to *mark* it verified or completed, since every state transition
happens only inside a Cloud Function using the Admin SDK, which bypasses
rules by design, not by a client-reachable path.

## 6. Failure/expiry UX

- **Expired before scanning**: `LoginPage`'s countdown
  (`useTelegramLogin`'s `expiresAtMs`) shows seconds remaining and a
  "havolaning muddati tugadi" message once it hits zero; the user clicks
  the primary button again to mint a fresh transaction.
- **Expired between scan and completion** (verified but not completed
  within the TTL): `completeAuthTransaction` detects this
  (`canComplete` is false, but the transaction was `verified`) and
  explicitly marks it `expired`, returning a clear error rather than a
  generic failure.
- **Bot-side rejections** (expired/already-used/not-found token sent to
  `/start`): `handleTelegramStart`'s `replyTextForOutcome` sends a
  specific Uzbek message back to the Telegram chat for each case (never
  echoing the token itself), per the task's "provide a useful error
  message when the transaction has expired" and "reject expired,
  malformed, already-used, and invalid tokens" requirements.

## 7. Manual setup required (blocked in this environment)

This environment has no real Telegram bot or Firebase project, so the
following could not be performed, and are not claimed as done:

1. **Create the bot**: message `@BotFather` on Telegram, `/newbot`,
   choose a name and a `@username` ending in `bot`. Note the issued bot
   token.
2. **Set the webhook**: after deploying `telegramWebhook` to a real
   Firebase project (see `docs/deployment.md`), call Telegram's
   `setWebhook` API with that function's HTTPS URL and a
   `secret_token` of your choosing (a long random string you generate
   yourself — this is `TELEGRAM_WEBHOOK_SECRET`):
   ```
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://<region>-<project>.cloudfunctions.net/telegramWebhook" \
     -d "secret_token=<your random webhook secret>"
   ```
3. **Store both secrets**:
   ```
   firebase functions:secrets:set TELEGRAM_BOT_TOKEN
   firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET
   ```
4. **Set the bot username in the frontend's public config**:
   `VITE_TELEGRAM_BOT_USERNAME=<your_bot_username>` in the deployed
   environment's `.env` (this is public — it only builds the `t.me`
   deep link, see `.env.example`'s comment).
5. Verify end to end by actually clicking "Telegram orqali kirish" in a
   deployed build and completing the flow with a real Telegram account.
   This step specifically has not been performed, since it requires all
   four prior steps against a real project this session does not have.
