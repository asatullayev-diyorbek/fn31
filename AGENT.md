# AGENT.md — Collaborative Jigsaw (PuzzleTogether)

This file is the binding contract for anyone (human or AI) working on this
repository. It is normative: if code and this file disagree, the code is
wrong, not this file. Update this file in the same commit whenever an
architectural decision changes.

## 1. Project Purpose

A web application where two or more people, already talking over a
Telegram call, open the same room and solve one jigsaw puzzle together in
real time. The product is the shared canvas and its synchronization — not
chat, not voice, not video. Telegram is used **only** as the identity
provider (login/registration), never as an in-app communication channel.

## 2. Mandatory Architectural Decisions

These decisions are fixed. Changing any of them requires updating this
file, `IMPLEMENTATION_PLAN.md`, and the relevant `docs/*.md` file in the
same change, with the alternatives considered and why they were rejected.

1. **Frontend**: React 18 + TypeScript (`strict: true`) + Vite. No
   Next.js, no Redux, no large UI framework. Routing via React Router.
2. **Backend platform**: Firebase only — Authentication, Cloud Firestore,
   Firebase Storage, Firebase Hosting, Firebase App Check, Firebase
   Realtime Database (RTDB, for high-frequency ephemeral state only),
   Cloud Functions (2nd gen) for the smallest possible set of trusted
   operations. No independently hosted Django/Express/custom server.
3. **Identity**: Telegram is the only login method. The flow is a
   token-based handshake (deep link → bot `/start` → webhook → Cloud
   Function → Firestore transaction → custom token). The browser is never
   trusted to assert *who* a user is; see `docs/telegram-auth.md`.
4. **Durable vs. ephemeral state**: Confirmed game state (piece positions
   once a drag ends, group membership, completion) lives in **Firestore**.
   High-frequency, non-authoritative state (live cursor/drag preview while
   a piece is being dragged) lives in **Realtime Database**, written at a
   throttled rate, and is never treated as ground truth. See
   `docs/websocket-or-realtime.md` for the full rationale.
5. **Puzzle geometry is deterministic**: given `(seed, geometryVersion,
   pieceCount, imageAspectRatio)` every client must compute byte-identical
   piece boundaries without any network round trip. The geometry module
   has zero dependency on React, Canvas, or Firebase.
6. **Conflict resolution**: optimistic-lock via per-piece `lockedBy` +
   `lockExpiresAt` lease, and a monotonic `stateVersion` per game document.
   Clients apply local-optimistic updates and reconcile against the
   authoritative Firestore value; stale writes (lower version) are
   rejected by Security Rules, not just by client code.
7. **Secrets**: the Telegram bot token, the Telegram webhook secret, and
   any Firebase service-account-equivalent credential live only in Cloud
   Functions configuration (`functions:config` / Secret Manager /
   `.env` on the Functions runtime), never in `VITE_*` variables, never in
   a Firestore document, never in a browser bundle.

## 3. Technology Constraints

- TypeScript `strict: true` everywhere, including `functions/`.
- No dependency is added "for convenience" if the standard library or an
  already-present dependency covers the need.
- Canvas 2D (no WebGL, no third-party canvas framework) for puzzle
  rendering.
- Testing: Vitest + React Testing Library (unit/component), Firebase
  Emulator Suite + `@firebase/rules-unit-testing` (security rules,
  integration), Playwright (end-to-end, two browser contexts).
- Package manager: npm, with `package-lock.json` committed.

## 4. Coding Standards

- Feature-oriented folders under `src/features/*`; cross-feature code only
  in `src/lib`, `src/components`, `src/hooks`, `src/types`.
- Every Firestore/RTDB document shape has an explicit TypeScript type in
  `src/types` (frontend) and `functions/src/shared/types` (functions),
  plus a runtime validator (`zod`) at every trust boundary: Cloud Function
  HTTP/webhook entry points, and any data read back from Firestore that a
  client could have influenced indirectly.
- No placeholder/mock implementations inside code paths described as
  "done" in `IMPLEMENTATION_PLAN.md`. A genuinely blocked integration
  (e.g. a real Telegram bot token) is implemented up to the trust boundary
  and documented as blocked — it is not faked with a stub that pretends to
  succeed.
- No silent `catch {}`. Errors are either handled meaningfully or
  surfaced (thrown, logged with context, or shown to the user).
- No comments that restate what the code does. Comments only for
  non-obvious invariants (e.g. "rules reject this at the DB layer too").

## 5. Security Requirements (non-negotiable)

- Firestore/Storage Security Rules default-deny; every collection's rules
  are covered by an emulator test, including adversarial cases (wrong
  user, expired transaction, forged Telegram ID, oversized payload).
- The browser can never: mark an auth transaction verified, choose its own
  Telegram user ID, write another user's profile, write
  `telegramIdentities/*`, bypass a piece's lock, or write a `stateVersion`
  lower than or equal to the current one.
- App Check is enforced on Cloud Functions callable/HTTP entry points and
  on Firestore/Storage once a real Firebase project is provisioned.
- The Telegram webhook handler verifies Telegram's secret token header on
  every request before doing anything else.

## 6. Testing Requirements

- Every phase below ships with automated tests before being marked done.
- Security rules are tested against the **emulator**, never asserted by
  inspection alone.
- No automated test touches a real Firebase project or a real Telegram
  bot token. Anything that genuinely requires those is a manual
  verification step, documented as such.

## 7. Forbidden Shortcuts

- Do not weaken a Security Rule to make a test pass; fix the test's setup
  or the rule's logic.
- Do not mark a phase "complete" in `IMPLEMENTATION_PLAN.md` while any of
  its mandatory acceptance criteria are unmet.
- Do not fabricate a deployment, a test run, a coverage number, or
  external-service verification. "Not yet verified — requires X" is
  always an acceptable status; a false "done" is not.
- Do not put a secret in any file that reaches the browser bundle or is
  committed to git (`.env.example` only ever contains placeholders).

## 8. Implementation Workflow

Phase order is fixed in `IMPLEMENTATION_PLAN.md`. Within a phase: write
the types/schema first, then the implementation, then the tests, then run
the tests, then update the plan's status table, then commit.

## 9. Acceptance Criteria

See `IMPLEMENTATION_PLAN.md` §"Acceptance criteria" per phase, and the
project-wide list in the original task specification. The final report
delivered at the end of the engagement states, for each criterion,
PASSED / NOT PASSED / BLOCKED (external dependency) — never silently
omitted.

## 10. Reporting Format

Status updates and the final report follow the structure requested by the
task: executive summary, architecture, implemented features, auth flow,
data model & rules, real-time design, changed files, tests executed with
actual results, build/typecheck/lint results, security/accessibility
audit, performance results, deployment instructions, outstanding manual
steps, known limitations, acceptance-criteria checklist.
