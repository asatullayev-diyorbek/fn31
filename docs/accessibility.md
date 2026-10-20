# Accessibility — WCAG 2.2 AA Pass

This is a real audit of the implemented UI (Phases 1-7), not a template.
Findings are split into what's done, what's partially done, and what's
not done, with remediation for each gap. No finding here was tested with
an actual screen reader (no such tool was available in this environment)
— findings are based on static analysis of the markup/ARIA/CSS actually
shipped, which is a meaningful but incomplete substitute for assistive-
technology testing. That gap is listed explicitly in §5.

## 1. What's in place

- **Focus visibility**: `:focus-visible` has a 3px high-contrast outline
  globally (`src/styles/global.css`), not suppressed anywhere.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` collapses
  all animation/transition durations to near-zero (`global.css`).
- **Touch targets**: buttons use the shared `.btn`/`.icon-btn` classes,
  both with `min-height: 44px` (`.icon-btn` is 44×44), meeting the 24×24
  CSS px minimum (WCAG 2.2 SC 2.5.8) with margin to spare.
- **Icon-only buttons have accessible names**: the zoom in/out controls
  in `PuzzleBoard.tsx` use `aria-label` ("Kichraytirish"/"Kattalashtirish");
  the puzzle canvas itself has an `aria-label` describing how to operate
  it and `role="application"` (a deliberate, narrow use of `application`
  — see §3).
- **Live regions**: `PuzzleBoard.tsx` has a `role="status" aria-live="polite"`
  element announcing piece-snap and completion events; `PuzzleRoomPage.tsx`
  marks its progress readout the same way. Screen-reader users get these
  announcements without needing to watch the canvas.
- **Form labeling**: every text input in `CreatePuzzlePage`,
  `DashboardPage`, and `JoinRoomPage` has an associated `<label>`
  (visible or `.visually-hidden`), not a bare placeholder.
- **Color contrast**: the design tokens in `global.css` use
  `--color-text: #0f172a` on `--color-bg: #f8fafc` (contrast ratio ≈
  17.9:1) and `--color-accent: #2563eb` on white (≈ 5.1:1) — both clear
  AA passes (4.5:1 body text, 3:1 large text/UI) in both the light and
  dark token sets defined.
- **Semantic structure**: pages use heading levels (`h1`/`h2`) in
  document order rather than styled `div`s; `SiteHeader`'s nav is wrapped
  in `<nav aria-label="Asosiy navigatsiya">`.

## 2. Partial / needs more work

- **Keyboard operability of the canvas itself**: `PuzzleBoard`'s canvas
  is focusable (`tabIndex={0}`) and the `R` key rotates the current
  selection, but there is **no keyboard way to select a piece or move
  it** — selection currently only happens via pointer `hitTest()`. A
  keyboard-only user can rotate whatever was last pointer-selected, but
  cannot pick a piece from scratch or drag one. This is the single
  biggest remaining gap.
- **Focus management on navigation**: route changes (e.g.
  `CreatePuzzlePage` → `/room/:id` on success) do not explicitly move
  focus to the new page's heading. React Router's default behavior
  (no scroll/focus reset) means a screen-reader user may not get an
  announcement that the page changed. Not yet fixed.
- **Reduced-motion for the canvas**: the global CSS rule covers DOM
  transitions, but `PuzzleEngine`'s own piece movement (immediate, no
  animation) is already effectively motion-free, so no further change is
  needed there — noted as "handled," not a gap, after review.

## 3. Known, deliberate limitation: no non-pointer puzzle-solving path

The task's requirement ("a practical alternative for users who cannot
operate a pointer-based puzzle board") is **not implemented**. This is
the most significant acceptance-criterion gap in the whole project, and
is reported as such rather than glossed over. What exists:

- The canvas has an accessible name and role, and keyboard focus, so a
  screen reader can at least discover it and know what it is for.
- Progress and completion are announced via the live region regardless
  of how pieces got moved.

What's missing, and the intended design for it (not yet built): a
list-based alternative view — one row per piece, each with "select",
"rotate 90°", and "move to slot N" controls — that writes to the exact
same `PositionMap`/`applyRemotePieceUpdate` surface `PuzzleEngine`
already exposes, so it would need no changes to the synchronization
layer, only a second renderer. Flagged in `IMPLEMENTATION_PLAN.md` as
not done; do not mark this acceptance criterion passed.

## 4. `role="application"` justification

Canvas-based drag-and-drop interfaces generally should avoid
`role="application"`, since it tells assistive technology to stop
intercepting standard navigation keys, which can trap a keyboard user.
It's used here anyway, narrowly, because (a) the canvas has no native
semantics to fall back to (it is literally a bitmap), (b) the element's
`aria-label` fully describes the one keyboard interaction it currently
supports (rotate via `R`), and (c) per §3 above, keyboard users do not
yet have a full alternative — `application` does not make that worse,
it only prevents the browser from trying to treat empty canvas pixels as
navigable content. Once the list-based alternative in §3 exists, this
role should be reconsidered (it would likely move to the *container*
around both the canvas and the alternative list, with the canvas itself
demoted to `role="img"` plus the `aria-label`, since the actual
interaction would move to the semantic list).

## 5. Explicitly not done

- No testing with an actual screen reader (NVDA/JAWS/VoiceOver) — none
  was available in this environment. Everything above is static/markup
  analysis, a real but partial substitute.
- No automated accessibility test (e.g. axe-core) wired into CI.
- No contrast check of the dark-mode token set's hover/active states.
- No per-component Testing Library accessibility assertions
  (`getByRole`, etc.) beyond what the Playwright E2E test incidentally
  exercises via `getByRole`/`getByText` selectors.

## 6. Remediation priority, if continued

1. Keyboard piece selection/movement (closes §3's main gap).
2. Focus-on-route-change for screen reader users.
3. Wire `@axe-core/playwright` into the E2E suite for ongoing regression
   coverage, once a real screen reader or axe run can be performed to
   validate the baseline this document describes.
