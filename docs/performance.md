# Performance

Every number below was actually measured in this environment (a single
cloud container, headless Chromium via Playwright, Firebase Emulator
Suite) — see each section's "how measured." Where the task's required
scenario could not be run here, that is stated plainly rather than
estimated.

## 1. Build output

```
npm run build
```

| Asset | Raw | Gzip |
|---|---|---|
| `dist/assets/index-*.js` | 939.65 kB | 236.85 kB |
| `dist/assets/index-*.css` | 8.34 kB | 2.28 kB |
| `dist/index.html` | 0.69 kB | 0.41 kB |

Vite's own build warns that the JS bundle exceeds its 500 kB
chunk-size-warning threshold. The dominant contributor is the full
Firebase Web SDK (`app`, `app-check`, `auth`, `firestore`, `database`,
`storage`, `functions`) being bundled as one chunk alongside the app
code — expected for an MVP, not yet optimized. **Not done**: route-based
code splitting (e.g. lazy-loading `PuzzleRoomPage`/the Firebase SDK
modules only where used) and `build.rollupOptions.output.manualChunks`.
This is a real, identified follow-up, not a hidden problem — 236.85 kB
gzipped is a reasonable one-time download for a puzzle app, but first
load could improve.

## 2. Puzzle geometry generation (CPU, synchronous)

**How measured**: `performance.now()` around
`generatePuzzleGeometry()`, run in this same Node/Vitest environment
(not a browser — browser JS engines vary, but this is the same function
that runs on the main thread during room creation and room load).

| Requested piece count | Actual piece count | Time |
|---|---|---|
| 25 | 24 | 0.86 ms |
| 100 | 96 | 1.76 ms |
| 500 | 513 | 6.43 ms |

Geometry generation is not a performance concern at any size in the
MVP's 25–500 range — it's sub-10ms even at the maximum, and runs once
per game (not per frame).

## 3. Rendering — what was and wasn't verified

**Verified** (Phase 3, via Playwright screenshots against the real dev
server — see that phase's commit): 25- and 100-piece Classic/Free
puzzles render correctly as clipped jigsaw shapes, drag an isolated
piece to a new position with correct z-ordering, and re-scatter on mode
switch, with zero console errors, in a real headless Chromium.

**Not verified in this environment**: actual frame-rate/redraw-cost
measurement at 500 pieces, or under sustained dragging. The renderer
(`PuzzleCanvasRenderer`) redraws every piece on every dirty frame (no
spatial culling of off-screen pieces) — for 500 pieces this means up to
500 `ctx.clip()` + `ctx.drawImage()` calls per repaint. This is a known,
documented scaling limit, not a verified-safe ceiling: the
IMPLEMENTATION_PLAN.md Phase 6 "known risks" section flags it, and a
real measurement (e.g. via Chrome DevTools' Performance panel against a
live 500-piece room) is listed as outstanding work, not claimed as done.

## 4. Security Rules / Cloud Functions / sync-layer test latency

**How measured**: wall-clock `Duration` reported by Vitest when run via
`firebase emulators:exec` against the real local emulator (not
production Firestore — see each test file's header comment for the
exact command).

| Suite | Tests | Duration |
|---|---|---|
| `tests/rules/firestore.rules.test.ts` + `storage.rules.test.ts` | 34 | ~5.7 s |
| `tests/sync/pieceChunkSync.test.ts` | 5 | ~4.5–5.4 s |
| `functions/tests/integration/authFlow.test.ts` | 8 | ~3.8–4.3 s |

These are local-emulator round trips (no real network latency to a
production Firestore region), so they characterize correctness, not
production latency. They're included here because they're the only
*real* multi-operation Firestore timing this project can honestly report
— see §5 for why true network latency and multi-participant load are
unmeasured.

## 5. What the task's required scenarios actually need, and why they're unmeasured here

The task asks for measured results under: 2 simultaneous participants,
several participants in one room, 100-piece and 500-piece puzzles, and
reconnection during active dragging. None of these could be measured in
this environment, for a documented reason (not a shortcut): a real
two-browser-context Playwright test against the local Firestore emulator
could not be gotten reliable in this specific sandboxed container — see
`IMPLEMENTATION_PLAN.md` Phase 7's full writeup for the investigation
(summary: a browser's long-polling connection to the local emulator
reliably completes one write per page load here, not more, which blocks
any real concurrent-participant timing measurement, while the identical
write paths pass instantly over Node's gRPC transport in this project's
47 passing emulator integration tests).

**Concretely, this means**: no participant-count or latency number in
this document or anywhere else in this project is a measured figure for
multi-browser concurrent load — none is claimed. A human running this
project's `e2e/multiplayer.spec.ts` test and a manual two-tab session
against a real (or differently-hosted emulator) Firebase project is the
necessary next step to produce those numbers honestly.

## 6. What would materially change this picture

1. Route/vendor code-splitting (§1) — straightforward, no architecture
   change needed.
2. Spatial culling (don't draw off-screen/overlapping-occluded pieces)
   in `PuzzleCanvasRenderer` (§3) — needed before claiming 500-piece
   rendering is smooth, not just "renders."
3. Real multi-browser timing, on a normal (non-sandboxed) machine or a
   standard CI runner (§5) — needed before claiming any concurrency/
   participant-count figure.
