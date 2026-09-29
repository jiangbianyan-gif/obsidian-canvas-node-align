# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 2.2.1 — 2026-09-30

**Release tooling.** No changes to the plugin itself. 2.2.0 was never
published: its release was created by hand and pointed at a commit that
predated the build tooling, so the directory's build-verification check
could not run. 2.2.1 re-releases the same code with the tooling in place.

- Added a `build` script (`tools/build.mjs`). The community directory runs
  the first script it finds in the order `build` / `build:plugin` /
  `compile` and verifies the result matches what is committed; this script
  parses `main.js`, validates the metadata, confirms the three release
  files are present and BOM-free, and prints their sizes and SHA-256
  hashes. It never rewrites committed files (byte-identical on re-runs).
- The release workflow now runs `npm ci` (lockfile consistency sentinel),
  `npm test` (both test files) and `npm run build` before attesting and
  publishing.
- 15 new tests for the build tooling (`test/build.test.mjs`), including
  guards that the build script stays dependency-free and never shells out.

## 2.2.0 — 2026-09-29

**Vertical alignment.** Until now the plugin only controlled where a line of
text starts and ends (horizontal). The vertical position was whatever Obsidian
did by default — always pinned to the top of the card. Both axes are now
independent, so they combine freely: 4 horizontal × 3 vertical = 12 positions.

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
- `npm run build` (`tools/build.mjs`). The community directory runs the first
  script it finds in the order `build` / `build:plugin` / `compile` and compares
  the result against the committed source; the 2.1.0 review reported
  *build verification could not run* because none of those existed. The plugin
  has no bundler, so the command verifies the release payload instead of
  generating it — it parses `main.js` in-process, validates the metadata, checks
  that the three downloaded files are present and BOM-free, and prints their
  sizes and sha256 hashes. It never rewrites a tracked file, so running it twice
  leaves the hashes identical, which is the property being verified.
  `npm run build -- --zip` additionally writes
  `dist/canvas-node-align-<version>.zip`.
- `tools/check-manifest.mjs` now also fails when `package.json` has no
  `build` / `build:plugin` / `compile` script, and exposes a
  `validateManifest()` export so the build can reuse it without spawning a
  second Node process.
- The release workflow runs `npm run build` before attesting, so a broken build
  script fails CI instead of silently downgrading the directory's check.

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
