# Deployment

This project has **not** been deployed to a real Firebase project or a
real Telegram bot from this session — there is no real Firebase project,
billing account, or Telegram bot available in this environment, and
AGENT.md/the task both require not deploying to production without
explicit authorization. Everything below is exact, reproducible
instructions for a human (or a future session with real credentials) to
do so, not a claim that it has been done.

## 1. Local development (no real Firebase project needed)

Everything in Phases 1–7 was built and tested exactly this way — a real
Firebase project is only needed for a public deployment (§4).

```bash
npm install
npm --prefix functions install

# .env with "demo-" project id + emulator flag — never a real project
cp .env.example .env
# edit .env: set VITE_FIREBASE_PROJECT_ID to any demo-* string,
# VITE_USE_FIREBASE_EMULATORS=true, and VITE_TELEGRAM_BOT_USERNAME
# to any placeholder (login won't complete without a real bot — see
# docs/telegram-auth.md §7 — but every other page works)

npm run dev              # Vite dev server, http://localhost:5173
firebase emulators:start # separate terminal — Auth/Firestore/RTDB/Storage UI at :4000
```

## 2. Verification commands (all run and passing in this repo already — see IMPLEMENTATION_PLAN.md for exact output)

```bash
npm run typecheck   # tsc across app/tests/e2e projects
npm run lint        # eslint, root + functions
npm run build       # vite build
npm test            # vitest, pure unit tests (no emulator)

# Emulator-backed (each spins up its own fresh emulator instance):
firebase emulators:exec --only firestore,auth,storage,database "npm run test:rules"
firebase emulators:exec --only firestore,auth,database "npm run test:sync"
firebase emulators:exec --only firestore,auth "npm --prefix functions run test:integration"
npm --prefix functions test   # pure unit tests, no emulator

# E2E (see IMPLEMENTATION_PLAN.md Phase 7 for this environment's specific
# result and why):
firebase emulators:exec --only firestore,auth,database,storage "npm run e2e"
```

## 3. Firebase project setup (one-time, by a human with Firebase console access)

1. Create a project at console.firebase.google.com (or `firebase
   projects:create`).
2. Enable: Authentication (no providers need enabling — only custom-token
   sign-in is used), Firestore (production mode), Realtime Database,
   Storage, Cloud Functions (requires the Blaze billing plan — Functions
   cannot run on the free Spark plan).
3. Enable **App Check**: console → App Check → register the web app with
   reCAPTCHA Enterprise, note the site key.
4. `firebase use --add` and select the project; update `.firebaserc`'s
   `"default"` to the real project id (replacing the
   `demo-puzzletogether` placeholder used throughout development).
5. Create `.env` (never committed — see `.gitignore`) from
   `.env.example`, filled with the real project's Firebase SDK config
   (console → Project settings → General → "Your apps" → Web app) and
   the real App Check site key. Set `VITE_USE_FIREBASE_EMULATORS=false`.

## 4. Telegram bot setup

Full detail in `docs/telegram-auth.md` §7; summary:

1. `@BotFather` → `/newbot` → note the bot token and `@username`.
2. Deploy Cloud Functions (§5) first, so `telegramWebhook`'s URL exists.
3. `firebase functions:secrets:set TELEGRAM_BOT_TOKEN` and
   `TELEGRAM_WEBHOOK_SECRET` (the latter is a random string *you*
   generate, not something Telegram issues).
4. Call Telegram's `setWebhook` API pointing at the deployed function's
   URL, passing the same `secret_token`.
5. Set `VITE_TELEGRAM_BOT_USERNAME` in the deployed `.env`.

## 5. Deploying

```bash
# Build the frontend
npm run build

# Deploy everything (rules, indexes, functions, hosting)
firebase deploy

# Or deploy pieces independently while iterating:
firebase deploy --only firestore:rules,firestore:indexes
firebase deploy --only storage
firebase deploy --only database
firebase deploy --only functions
firebase deploy --only hosting
```

`firebase.json` already wires `functions`' `predeploy` to run `npm run
build` inside `functions/` (compiling TypeScript to `functions/lib`)
before every functions deploy, and Hosting serves `dist/` with a
single-page-app rewrite (`**` → `/index.html`) and long-cache headers on
hashed static assets.

## 6. Domain and HTTPS

Firebase Hosting serves HTTPS automatically on its own `*.web.app` /
`*.firebaseapp.com` domain with no extra configuration. For a custom
domain: console → Hosting → "Add custom domain", follow the DNS
verification (TXT record) and the A/CNAME records it provides; Firebase
provisions and renews the TLS certificate automatically. No manual
certificate management is needed in either case.

## 7. Logging and error monitoring

- Cloud Functions logs (including every `logger.warn`/`logger.error` call
  in `functions/src/index.ts`) are in Cloud Logging automatically —
  console → Functions → a function → "Logs", or `firebase functions:log`.
- **Not set up in this project**: a third-party error-monitoring
  integration (e.g. Sentry) for the frontend. This is a reasonable
  addition before production use; it was not added here since it would
  require a real account/DSN this environment doesn't have, and adding
  an unconfigured, dead integration would violate AGENT.md's "no
  placeholder implementations" rule more than it would help.

## 8. Backup and recovery

- **Firestore**: console → Firestore → Backups, or
  `gcloud firestore export gs://<bucket>/backups/$(date +%F)` on a
  schedule (e.g. Cloud Scheduler + a small Cloud Function, or GCP's
  built-in scheduled backups feature). Restore via
  `gcloud firestore import gs://<bucket>/backups/<date>`.
- **Storage**: enable Object Versioning on the Storage bucket
  (`gsutil versioning set on gs://<bucket>`) so an accidental image
  deletion is recoverable.
- **Realtime Database**: console → Realtime Database → "Backups" (daily
  automatic backups on the Blaze plan), or manual
  `firebase database:get / --output backup.json`.
- None of the above has been configured in this environment (no real
  project exists to configure it in) — this section is setup
  instructions, not a confirmation that backups are running.

## 9. Production security checklist (before inviting real users)

- [ ] App Check enabled and *enforced* (not just configured) on
      Firestore, Storage, and every Cloud Function — console toggles for
      each, separate from registering the web app.
- [ ] `firebase deploy --only firestore:rules,storage` run *after* any
      rules change, and the emulator test suites (§2) re-run against the
      new rules before deploying.
- [ ] Both Telegram secrets set via `functions:secrets:set`, never in
      `.env`/`VITE_*`/any committed file (grep the repo for the literal
      bot token before any commit, as a habit, not just before launch).
- [ ] Firestore in production mode (not test mode) from project
      creation — test mode's default-allow rules are never acceptable
      even temporarily for this project's data.
- [ ] Billing alerts configured (Blaze plan is usage-based; Cloud
      Functions + Firestore + sustained RTDB connections can scale cost
      with real traffic).
- [ ] A real screen-reader pass against `docs/accessibility.md`'s
      findings, especially the keyboard-operability gap (§3 of that
      doc), before calling the product accessible rather than
      "accessibility-reviewed with a known gap."
- [ ] Backups (§8) actually configured and a restore drill performed at
      least once, not just documented.
