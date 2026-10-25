#!/usr/bin/env python3
"""
Scans a CSS module for dark-theme-specific literal colors (dark navy glass
backgrounds, white-ish borders/highlight fills, near-white text) and appends
a `:global([data-theme="light"]) .selector { ... }` override block right
after each top-level rule that needs one, with values inverted to match the
light-theme look already established in global.css / PuzzleBoard.module.css.

Conservative by design: leaves accent/status colors (blue/red/green/orange),
mid-tone grays (already readable on both backgrounds), and gradients alone.
Skips any selector that already has a light-theme override elsewhere in the
file (so re-running is safe) and skips `@media`/keyframes blocks (handled
separately, by hand, since they're low in count).
"""
import re
import sys

RGBA_BG_RE = re.compile(r"background:\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)\s*;")
HEX_BG_RE = re.compile(r"background:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\s*;")
WHITE_BORDER_RE = re.compile(r"(border(?:-\w+)?):\s*([\d.]+px\s+\w+\s+)?rgba\(255,\s*255,\s*255,\s*([\d.]+)\)\s*;")
# The recurring dark-navy card-border token used as a plain hex (not rgba) across several files.
DARK_HEX_BORDER_RE = re.compile(r"(border(?:-\w+)?):\s*([\d.]+px\s+\w+\s+)?#273149\s*;")
ANY_BACKGROUND_RE = re.compile(r"\bbackground(-color)?:")

def bg_opacity_for_light(a: float) -> float:
    if a <= 0.55:
        return 0.78
    if a <= 0.75:
        return 0.86
    return 0.93

def hex_to_rgb(hexval: str):
    h = hexval.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))

WHITE_TEXT_HEXES = {"#fff", "#ffffff", "#f1f5f9", "#f5f9ff", "#f8fafc", "#f4f7fc", "#e2e8f0"}
# Dark-navy-family hex backgrounds actually used across this codebase's cards/panels
# (sidebar, metaChipsCard, progressCard, participantsSection, etc.) — listed explicitly
# rather than a blanket "any dark hex" threshold, since a few near-black hex values
# are used for genuinely theme-invariant things (shadow-colored dots, icon rings).
DARK_NAVY_HEXES = {"#080b14", "#0d1220", "#141b2b", "#090e1a", "#0a0e1a", "#0b0f1c"}

def process_block(selector: str, body: str):
    """Returns an override body string, or None if nothing theme-sensitive found."""
    overrides = []
    background_handled = False

    rgba_m = RGBA_BG_RE.search(body)
    if rgba_m:
        r, g, b, a = int(rgba_m.group(1)), int(rgba_m.group(2)), int(rgba_m.group(3)), float(rgba_m.group(4))
        if r < 55 and g < 55 and b < 60:
            overrides.append(f"  background: rgba(255, 255, 255, {bg_opacity_for_light(a)});")
            background_handled = True
        elif r > 240 and g > 240 and b > 240:
            # A "white fill" background (frosted highlight on a dark card) — same rgba
            # pattern/opacity, inverted base color, matching --color-surface's own light/dark pair.
            overrides.append(f"  background: rgba(15, 23, 42, {rgba_m.group(4)});")
            background_handled = True

    if not background_handled:
        hex_m = HEX_BG_RE.search(body)
        if hex_m and hex_m.group(1).lower() in DARK_NAVY_HEXES:
            overrides.append("  background: rgba(255, 255, 255, 0.86);")
            background_handled = True

    for m in WHITE_BORDER_RE.finditer(body):
        prop, prefix, a = m.group(1), m.group(2) or "", m.group(3)
        overrides.append(f"  {prop}: {prefix}rgba(15, 23, 42, {a});")

    for m in DARK_HEX_BORDER_RE.finditer(body):
        prop, prefix = m.group(1), m.group(2) or ""
        overrides.append(f"  {prop}: {prefix}rgba(15, 23, 42, 0.12);")

    # Only flip white/near-white text if we're also flipping this same block's
    # background (so contrast still holds) — or if the block declares no
    # background at all (a bare heading sitting on a dark-navy ancestor
    # surface that's handled elsewhere). A block with an accent-colored
    # background (a solid blue/red button, say) keeps its white text as-is.
    has_any_background = bool(ANY_BACKGROUND_RE.search(body))
    text_m = re.search(r"\bcolor:\s*(#[0-9a-fA-F]{3,6})\s*;", body)
    if text_m and text_m.group(1).lower() in WHITE_TEXT_HEXES:
        if background_handled or not has_any_background:
            overrides.append("  color: var(--color-text);")

    if not overrides:
        return None
    return "\n".join(overrides)

def main(path: str, excludes: set[str]):
    with open(path, "r") as f:
        src = f.read()

    existing_light_selectors = set(re.findall(r':global\(\[data-theme="light"\]\)\s*(\.[\w-]+)', src))
    existing_light_selectors |= excludes

    # Split into top-level blocks: selector { ... } (no nested @media/keyframes — those are left alone).
    block_re = re.compile(r"(^\.[\w-]+(?:,\s*\.[\w-]+)*\s*\{)([^{}]*)(\})", re.MULTILINE)

    output = []
    pos = 0
    added = 0
    for m in block_re.finditer(src):
        output.append(src[pos:m.end()])
        pos = m.end()

        header, body, _ = m.group(1), m.group(2), m.group(3)
        selector_match = re.match(r"^(\.[\w-]+)", header)
        if not selector_match:
            continue
        selector = selector_match.group(1)
        if selector in existing_light_selectors:
            continue
        if "@media" in body:
            continue

        override_body = process_block(selector, body)
        if override_body:
            output.append(f"\n\n:global([data-theme=\"light\"]) {selector} {{\n{override_body}\n}}")
            added += 1

    output.append(src[pos:])
    new_src = "".join(output)

    with open(path, "w") as f:
        f.write(new_src)

    print(f"{path}: added {added} light-theme override blocks")

if __name__ == "__main__":
    # Selectors with an always-colored (gradient/solid-accent) background that
    # doesn't change with theme, so their white text/icons/borders must stay
    # white in both themes — excluded from auto-generation entirely.
    EXCLUDES = {
        "DashboardPage.module.css": {
            ".createCard", ".createCardLeft", ".createIconBox", ".createTexts",
            ".createTitle", ".createSubtitle", ".createCardBtn", ".watermarkGraphic",
            ".playActive",
        },
        "LandingPage.module.css": {
            ".primaryCta", ".catActionBtn", ".ctaBanner",
        },
        "CreatePuzzlePage.module.css": set(),
        "PuzzleRoomPage.module.css": {
            ".participantAvatar", ".youBadge", ".page",
        },
    }
    for path in sys.argv[1:]:
        import os
        excludes = EXCLUDES.get(os.path.basename(path), set())
        main(path, excludes)
