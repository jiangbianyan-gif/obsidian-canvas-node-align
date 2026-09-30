# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 2.3.1 — 2026-09-30

**Split in two: note alignment moved to its own plugin.**

Aligning a note body is a different mechanism (it writes the note's frontmatter)
on a different surface (a Markdown file, not a Canvas card), and mixing the two
made both harder to explain. It now lives in
**[Note Text Align](https://github.com/jiangbianyan-gif/obsidian-note-text-align)**.
This plugin is Canvas only.

**Removed**

- The five `笔记正文：…` palette commands.
- The note CSS block (`cta-note-*`), and the *stretch the last line when
  justifying* setting with the `body` class it toggled. Both moved across.
- Nothing produces or styles `cta-note-*` here any more. Notes you aligned with
  2.3.0 or earlier keep that class in their frontmatter, and the companion plugin
  still recognises it — so no note loses its alignment. Set a position once in
  such a note and the class is rewritten to the new prefix.

**Kept**

- The **卡片内嵌笔记的正文** setting: a note *embedded in a card* is a card
  concern, and an embedded note is real Markdown whose paragraphs wrap, so that
  one still offers justify.
- Everything Canvas: the nine-grid panel, card / group / edge / file-name label
  alignment, vertical position, the per-item defaults and the whole toolchain.

**Notes**

- If you never used note alignment, this update changes nothing for you.
- The two plugins own separate surfaces: this one handles a note **while it is
  embedded in a card**, the other handles a note **opened on its own**.

## 2.3.0 — 2026-09-30

**A right-click nine-grid for card bodies**, and one option removed from the
Canvas side because it could not do anything there.

**Added**

- Right-clicking a card now offers **文本对齐** (*text alignment*), which opens a
  **3 × 3 grid** as a submenu: one click sets both axes at once
  (left / centre / right × top / middle / bottom). Each cell draws two short
  lines — their horizontal position is the horizontal alignment and their
  vertical position is the vertical one — so the panel needs no explanatory text.
- Three further cells: **仅水平** / **仅垂直** (*horizontal only* / *vertical
  only*, which change one axis and leave the other exactly as it is) and
  **清除** (*clear*). The cell currently in effect is highlighted, and a one-word
  caption above the grid names it.
- Works on a multi-card selection as well, so a whole selection can be set to one
  position in a single step.

**Removed**

- **Justify is gone from the Canvas side.** `text-align: justify` only stretches
  the lines that are *not* the last one, so it needs a paragraph that wraps onto
  several lines. Card text is usually two or three short lines and all three label
  types are a single line, where justify is indistinguishable from left-alignment.
  Card bodies and labels now offer **left / centre / right** only, and the four
  `*-justify` rules were deleted from the stylesheet.
  Markdown **note bodies** keep justify — those are real files whose paragraphs
  wrap, so it does work there. The related settings toggle is now called
  *stretch the last line* and is documented as affecting notes only.
- `#cta-j` markers left in existing cards are read back as left-aligned (which is
  what they render as now), and a `justify` value stored for a label in the
  plugin's data file is migrated to `left` the next time the plugin loads.

**Notes**

- The grid is inserted as a **submenu of the native menu**, so everything Obsidian
  itself puts there — including *Duplicate*, added to the card and group menus in
  Obsidian 1.9.9 — stays exactly where it was. Hover over 文本对齐 to open the
  grid (it appears after about a quarter of a second), or click it.
- The grid cells are not part of the menu's keyboard navigation; the arrow keys
  move through the menu item itself.

## 2.2.0 — 2026-09-30

**Vertical alignment**, plus the build tooling the community directory needs in
order to verify the release.

Until now the plugin only controlled where a line of text starts and ends
(horizontal); the vertical position was whatever Obsidian did by default — always
pinned to the top of the card. Both axes are now independent, so they combine
freely: 4 horizontal × 3 vertical = 12 positions.

**Added**

- Vertical position for card bodies: **top / middle / bottom**, set from
  <kbd>right-click a card</kbd> → *Card text alignment · vertical*, or from the
  command palette (`Card text vertical: …`). Applies per card, or to every card
  on the canvas at once.
- Cards that embed a note, a web page or media cannot carry a text marker
  (the content belongs to another file), so their vertical position is stored
  in the plugin's data file instead and applied as a runtime class name.
- New setting: **default vertical position for card bodies**, so cards you have
  never touched follow it automatically.
- New setting: **stretch the last line when justifying**. Per typographic
  convention `justify` does *not* stretch the final line, which makes it look
  identical to left-alignment when the text is a single sentence — a very
  common case with Chinese text. Turning this on stretches that line too.
- Horizontal alignment now also applies while a card is being edited
  (CodeMirror 6), not only in the rendered view.
- 51 more unit tests (65 → 116), including a regression test that setting one
  axis never wipes the other axis's marker, and CSS guards that fail the build
  if a vertical selector loses the specificity needed to beat Obsidian's own
  stylesheet.

**Release tooling**

The 2.1.0 review from the community directory recommended fixing *build
verification*: the scanner runs the first script it finds in the order `build` /
`build:plugin` / `compile`, and compares the result against the committed
source. The plugin has no bundler, so the command below verifies the release
payload instead of generating it, and never rewrites a tracked file — running it
twice leaves every hash identical, which is the property being verified.

- `npm run build` (`tools/build.mjs`). It parses `main.js` in-process — no child
  process, because `spawnSync` on the running `node` binary fails with `EBUSY`
  on Windows — validates the metadata, checks that the three files Obsidian
  downloads exist, are non-empty and BOM-free, and prints their sizes and
  SHA-256 hashes. `npm run build -- --zip` additionally writes
  `dist/canvas-node-align-<version>.zip`.
- **It speaks first.** The first thing the script prints is the environment:
  Node version, platform, working directory, and the contents of the repository
  root and `tools/`. An earlier revision could fail before its first log line,
  which left the directory's scan reporting only *"running the build script
  failed"* with no captured output. A silent failure now carries its own
  evidence.
- **A missing helper can no longer kill it.** `tools/check-manifest.mjs` is
  loaded with a *dynamic* import wrapped in a try/catch. A static import is
  resolved before the script's first line runs, so a helper that was missing or
  unloadable used to abort it with zero output.
- **Only the payload can fail the build.** Whether the three downloaded files
  are present, non-empty, BOM-free and parseable decides the exit code. Metadata
  consistency (versions, tags, submission rules) is reported as a warning —
  compliance is still a hard gate, enforced by `npm run check:manifest`, which
  CI runs as its own step.
- `tools/check-manifest.mjs` now also fails when `package.json` has no `build` /
  `build:plugin` / `compile` script, and exposes a `validateManifest()` export so
  the build can reuse it without spawning a second Node process.
- The release workflow runs `npm ci` (a lockfile-consistency sentinel: a
  `package.json` / `package-lock.json` drift fails CI instead of quietly
  downgrading the directory's check back to *"could not run"*), then `npm test`
  (both test files) and `npm run build` before attesting and publishing.
- 20 tests for the tooling (`test/build.test.mjs`), including guards that the
  build script stays dependency-free and never shells out, that it reports its
  environment before any check runs, and that a missing helper or an unloadable
  module can no longer fail the build.

**Changed**

- Menu entries are now split into *Card text alignment · horizontal* and
  *Card text alignment · vertical* instead of one combined submenu.
- The card marker format gained a second, independent marker for the vertical
  axis: `<span class="cta-vt"></span>` / `-vm` / `-vb` (tag spellings `#cta-vt`
  and so on). Existing cards keep working — a card with only a horizontal
  marker simply follows the default vertical position.

**Notes**

- Vertical alignment is deliberately not applied while a card is being edited:
  keeping the caret pinned to the top is less jarring than text that jumps
  around the card as you type.
- When the text is taller than the card, all three vertical positions fall back
  to the same top-anchored, scrollable layout. Nothing is clipped or lost —
  this is why the implementation changes `flex-grow` on Obsidian's spacer
  pseudo-elements rather than using `justify-content: center`.
- The first 2.2.0 tag was created by hand and pointed at a commit that predated
  the tooling above, so the release is re-cut from a commit that includes it.
  Nothing in the plugin itself changed in between.

## 2.1.0 — 2026-09-29

Housekeeping release that clears the warnings from the community directory's
automated review. No change in behaviour.

**Changed**

- Card body alignment is now applied with a runtime class name
  (`cta-card-left` / `-center` / `-right` / `-justify` on the `.canvas-node`
  element) instead of a `:has()` selector. The plain-text marker is still
  written into the card, so alignment still survives uninstalling the plugin.
  The CSS linter in the community directory flags `:has(` as a performance
  warning ("broad selector invalidation"); `styles.css` now contains none.
- Class names are re-applied on `active-leaf-change`, `layout-change` and DOM
  changes, so alignment survives re-rendering. Re-applying compares the current
  class first and leaves the DOM untouched when it already matches.
- CI builds are now attested with `actions/attest-build-provenance`, and the
  GitHub release is named after the version.

**Added**

- `package-lock.json`, so the directory's build-verification step can run.
- The self-check command also reports how many cards currently carry an
  alignment class.
- Unit tests for card class-name handling, plus a guard that fails the test
  suite if `:has(` ever reappears in `styles.css` (71 assertions).

## 2.0.0 — 2026-09-29

First public release.

**Alignment coverage** — six places where Canvas shows text:

- Card body (text cards) — right-click, **per card**
- Note body embedded in a card — settings tab (global)
- Card label (file name) — right-click, **per card**
- Group label — right-click, **per group**
- Edge label — right-click, **per edge**
- callouts / headings / code blocks inside a card — follows the card body

**Added**

- Settings tab with five dropdowns that set the default alignment for each location.
- Command palette entries: per-card alignment, whole-canvas alignment, note-body alignment, and a "view alignment status of selected cards" report.
- Markdown note body alignment (`left` / `center` / `right` / `justify`), written to `cssclasses` frontmatter and fully reversible.
- Plain-text markers (`<span class="cta-c"></span>`, short form `#cta-c`) so card alignment survives uninstalling the plugin.
- Unit tests for the pure functions (marker parsing, class-name cleanup, frontmatter merging).

**Fixed**

- A CSS specificity bug in `1.x`: the rule for note cards embedded in a canvas node had four class selectors and therefore outranked the two-class `:has()` marker rules, forcing every card to left-aligned regardless of its marker. The note-body rule now uses `text-align: inherit` so the card's own alignment cascades down.
- The same bug affected the colour-based alignment rules; those are now opt-in and commented out by default.
- Markers are no longer inserted between `\r` and `\n` on files written with Windows line endings.

**Design notes**

- Per-item alignment for group / edge / card labels is stored in the plugin's own `data.json`, never in the `.canvas` file, so `.canvas` files stay standard [JSON Canvas](https://jsoncanvas.org/).
- Group and edge labels are rendered with `textContent`, so they cannot take an HTML marker at all; a runtime CSS class is the only option.
- `Menu.setSubmenu()` is feature-detected; older versions get a flat context menu instead.
