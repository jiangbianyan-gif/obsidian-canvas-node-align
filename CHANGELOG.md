# Changelog

All notable changes to this project are documented here.
This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
