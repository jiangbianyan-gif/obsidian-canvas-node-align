# Canvas Node Align

Align text inside Canvas cards, group labels, edge labels and card labels — and align Markdown note bodies too.

Canvas has no text-alignment setting of its own. Right-click menus offer *align* and *distribute*, but those **move the cards themselves**; they do nothing about where the text sits inside a card. This plugin fills that gap.

```
┌─────────────────────┐        ┌─────────────────────┐
│ 模型变换             │   →    │      模型变换        │
└─────────────────────┘        └─────────────────────┘
   right-click → align → center
```

Alignment works on **two independent axes**, so they combine freely:

| Axis | Values | What it controls |
|---|---|---|
| **Horizontal** | left / center / right | where each line starts and ends |
| **Vertical** | top / middle / bottom | which height the whole block of text sits at |

That is 3 × 3 = **9 positions**. Stock Canvas gives you one (left + top).

> There is no **justify** on the Canvas side: `text-align: justify` only does
> anything for a paragraph that **wraps onto several lines** (by convention it does
> not stretch the last line), and card text is usually two or three short lines while
> labels are a single line — set it and nothing visibly changes. **Markdown note
> bodies** (real files, paragraphs wrap properly) still offer justify.

## Features

| # | Where the text lives | Axis | How it is set | Stored in |
|---|---|---|---|---|
| 1 | Card body (text cards) | horizontal + vertical | right-click a card, **per card** | the card's own text |
| 2 | Note body embedded in a card | horizontal | Settings tab (global) | plugin settings |
| 3 | Card label (file name) | horizontal | right-click a card, **per card** | plugin data |
| 4 | Group label | horizontal | right-click a group, **per group** | plugin data |
| 5 | Edge label | horizontal | right-click an edge, **per edge** | plugin data |
| 6 | callouts / headings / code blocks inside a card | horizontal | follows #1 | — |
| 7 | Body of a card that embeds a note or a web page | vertical | right-click a card, **per card** | plugin data |

Plus **Markdown note bodies** (`left` / `center` / `right` / `justify`), which stock Obsidian cannot do either. That is written to the note's `cssclasses` frontmatter, so it is fully reversible.

Also included: commands to set **every card on the current canvas** to the same position at once, for both axes.

> The label rows are horizontal-only: a label is a single line whose box hugs its
> text, so there is no vertical room to move it around in.

## Installation

### Community plugins (recommended)
Settings → Community plugins → Browse → search **Canvas Node Align** → Install → Enable.

> The entry has passed the automated review in the [community directory](https://community.obsidian.md).
> If it does not show up in Browse yet the directory has not refreshed — use one of the options below.

### Manual
1. Download `main.js`, `manifest.json` and `styles.css` from the latest release.
2. Put them in `<your vault>/.obsidian/plugins/canvas-node-align/`.
3. Reload Obsidian, then enable **Canvas Node Align** under Settings → Community plugins.

### BRAT
Add `jiangbianyan-gif/obsidian-canvas-node-align` in the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin.

### Requirements
Obsidian **1.5.0** or newer. Developed and tested on **1.13.7**.

> **Language:** the plugin's menus, commands, notices and settings tab are
> currently **in Chinese**. The English glosses below map each label to what it
> does, so the plugin is usable either way; localising the UI is on the list.

## Usage

### Card text, per card
Right-click a card → **文本对齐** → hover that item (or click it) and a **3 × 3 grid**
opens beside the menu:

| | left | centre | right |
|---|---|---|---|
| **top** | 左上 | 上中 | 右上 |
| **middle** | 左中 | **正中** | 右中 |
| **bottom** | 左下 | 下中 | 右下 |

and below it two more rows:

- **居中** (*centre, one axis only*) → **仅水平** / **仅垂直** — change one axis and leave the other exactly as it is.
- **清除** (*clear*) — both axes back to your defaults.

That is 12 cells covering all 9 combinations (3 horizontal × 3 vertical) plus clear.
Each cell draws two short lines: their **horizontal** position is the horizontal
alignment and their **vertical** position is the vertical one, so 正中 has both in
the middle. The cell currently in effect is highlighted, and the small grey text at
the top of the panel names it (跟随默认 *follow defaults* when the card has no
setting of its own).

*文本对齐 is the item this plugin adds. Everything Obsidian already put in that menu
(edit, duplicate, delete…) is left exactly where it was.*

The two axes stay independent: set 正中, then come back and change only the
horizontal with 仅水平 — the card stays vertically centred.

Under the hood this inserts small plain-text markers at the end of the card's first line:

```
模型变换<span class="cta-c"></span><span class="cta-vm"></span>
```

Supported markers — one set per axis, two spellings each:

| Axis | Marker | Tag spelling | Result |
|---|---|---|---|
| horizontal | `<span class="cta-l"></span>` | `#cta-l` | left |
| horizontal | `<span class="cta-c"></span>` | `#cta-c` | center |
| horizontal | `<span class="cta-r"></span>` | `#cta-r` | right |
| horizontal | `<span class="cta-j"></span>` | `#cta-j` | justify (**retired** on the Canvas side; old files may still carry it) |
| vertical | `<span class="cta-vt"></span>` | `#cta-vt` | top |
| vertical | `<span class="cta-vm"></span>` | `#cta-vm` | middle |
| vertical | `<span class="cta-vb"></span>` | `#cta-vb` | bottom |

You can also type these by hand — the plugin is only a convenient way to write
them. Writing just the horizontal marker is fine; the vertical axis then follows
the default from the settings tab.

The marker goes at the **end of the first line**, never at the start: a leading marker would break block syntax such as `- item` or `# heading`.

**Two layers, one feature** — this is how the plugin keeps your `.canvas` files standard:

| Layer | What it does | Why it exists |
|---|---|---|
| **Data** | writes the marker into the card's text | so the alignment survives a new machine, a temporarily disabled plugin, or a plain CSS snippet. Apart from that piece of text, nothing non-standard is ever written to the `.canvas` file |
| **Render** | adds a `cta-card-<alignment>` / `cta-v-<position>` class to the card element at runtime | so the stylesheet can act on it. Deliberately **not** done with CSS `:has()` — the community directory's CSS linter flags that as a performance warning, and a class match is the cheaper equivalent |

Hand-written markers work the same way: the plugin reads every card's text whenever
a canvas is opened, and adds the class for any marker it finds.

### How vertical alignment works
Obsidian's card body is already a vertical flex layout: `.markdown-preview-view`
is `flex-direction: column`, with one flexible spacer pseudo-element (`::before`)
above the text and another (`::after`) below it. Both spacers are capped at
`max-height: 16px`, so the text block absorbs all the leftover height — which is
why text is **always pinned to the top**.

This plugin simply adjusts how those two spacers flex: *top* stops the upper
spacer from growing; *middle* lifts the 16px cap on both and stops the text block
from claiming the free space, so the remainder splits evenly above and below;
*bottom* lets the upper spacer absorb everything. All of it is CSS — the plugin
only adds the class name.

> When the text is taller than the card, all three positions fall back to the
> same top-anchored, scrollable layout, and **nothing is clipped or lost**. That
> is exactly why this uses `flex-grow` on the spacers instead of
> `justify-content: center` — the latter makes the top half unreachable when the
> content overflows.

### Group / edge / card labels, per item
Right-click the group (or edge, or a file card) → **…标签对齐** (*… label alignment*) → pick an alignment.

These three cannot use text markers. Obsidian renders them with `setText()` / `textContent`, so an HTML marker would just show up as literal garbage. Instead the plugin adds a CSS class to the element at runtime and records the choice in its own data file.

**Trade-off:** because the choice lives in the plugin's data file and not in the `.canvas` file, these three stop being aligned if you disable the plugin. Card text (#1) does not have this limitation.

### Cards that embed a note, a web page or media (vertical, per card)
Right-click such a card → **卡片文字对齐 · 垂直** (*Card text alignment · vertical*).

These cannot use a text marker either: the card is displaying **someone else's file**, and inserting a marker would edit that file. So their vertical position is recorded in the plugin's data file, same as the labels.

### Whole canvas at once
Command palette →
- **整块白板：所有卡片水平居中** (plus left / right), **整块白板：所有卡片清除水平对齐**
- **整块白板：所有卡片垂直居中** (plus top / bottom), **整块白板：所有卡片清除垂直对齐**

### Note bodies

**Not in this plugin.** Aligning a note that is open on its own moved to the companion plugin
**[Note Text Align](https://github.com/jiangbianyan-gif/obsidian-note-text-align)** (right-click
inside a note → **笔记对齐**, or the command palette → **笔记正文：…**).

What this plugin still owns is the other case:

- the body of a note **while it is embedded in a card** (`![[note]]`) → the
  *卡片内嵌笔记的正文* setting, which also keeps **justify** because an embedded note is real
  Markdown whose paragraphs wrap.

> Each plugin owns its own surface. Up to 2.3.0 this plugin could also align standalone notes;
> from 2.3.1 that belongs to the plugin above. It still recognises the old `cta-note-*` class
> names, so alignment you set earlier keeps working.

### Settings
Settings → Canvas Node Align:

- **Five dropdowns** set the default **horizontal** alignment for each location; anything you have not set individually follows its default column.
- **Default vertical position for card bodies** — where cards you have never touched vertically put their text.
- **Stretch the last line when justifying** — only affects note bodies, see the note under *Known limitations*.
- A button to clear all per-item settings.

## Why the file format stays clean

Many Canvas tweak plugins write extra, non-standard fields into the `.canvas` JSON (the *Advanced JSON Canvas* format). This plugin deliberately does not:

- **Card text** is stored as ordinary text, so the `.canvas` file remains standard [JSON Canvas](https://jsoncanvas.org/). Open it in any other tool and the marker is just a few invisible characters.
- **Group / edge / card-label alignment** is stored in `.obsidian/plugins/canvas-node-align/data.json`, so the `.canvas` file is not touched at all.
- Nothing is written to a card's `unknownData`, and disabling the plugin leaves your files readable and valid.

Visual rendering comes entirely from CSS (`styles.css`, or the equivalent `canvas-text-align.css` snippet). The plugin never manipulates DOM styles directly — it only writes text and toggles class names.

## How it compares to Advanced Canvas

[Advanced Canvas](https://github.com/developer-mike/obsidian-advanced-canvas) also offers card text alignment as part of its **Node Styles** feature. Choose it if you want the whole package: presentations, node shapes, collapsible groups, node templates, PNG/SVG export, and so on.

Choose this plugin if you want:

- alignment only, without pulling in a large feature set;
- alignment that survives uninstalling the plugin (for card text);
- `.canvas` files that stay in the standard JSON Canvas format instead of the private *Advanced JSON Canvas* format.

## Compatibility notes

The plugin is built on a few Canvas internals that are not in the public API docs:

| Used | For |
|---|---|
| `workspace.on('canvas:node-menu' / 'canvas:edge-menu' / 'canvas:selection-menu')` | adding the right-click menu items |
| `canvas.nodes`, `canvas.edges`, `canvas.selection` | enumerating and reading nodes/edges |
| `node.text` / `node.setText()` | reading and writing card text |
| `node.labelEl`, `edge.labelElement.textareaEl` | attaching alignment classes to labels |
| `canvas.requestSave()` | saving, with undo-history support |

Every call is feature-detected or wrapped in a fallback, so a rename in a future Obsidian release degrades to "this one feature stops working" rather than breaking the plugin. Tested on Obsidian **1.13.7**.

`MenuItem.setSubmenu()` is also feature-detected: if your version lacks it, alignment items are flattened into the main context menu instead of nested.

## Known limitations

- Group, edge and card-label alignment — and the vertical position of cards that embed another file — is lost when the plugin is disabled (see the trade-off note above).
- Card-label text alignment only becomes visible once the label is wider than its text, which is why `styles.css` gives `.canvas-node-label` `width: 100%`. As a side effect, very long file names are ellipsised instead of overflowing.
- Note-body alignment in Live Preview moves the syntax marks along with the text; Reading view is cleaner.
- Horizontal alignment applies in the rendered (preview) state of a card. While you are editing a card, its content is CodeMirror source and the marker has not been rendered yet, so that card falls back to the default. Click an empty area of the canvas to leave edit mode and see the result. Vertical alignment is **only** applied in the rendered state — deliberately, because a caret that jumps around the card while you type is unpleasant.
- There is **no justify on the Canvas side**: `text-align: justify` only stretches the lines that are *not* the last one, and card text is short while labels are a single line, so it made no visible difference. Use it on **Markdown note bodies** instead; the *stretch the last line* toggle in the settings tab applies to notes only.
- Vertical middle/bottom are only visible when the card is **taller than its text**. Card height hugs its content by default, so drag the card a bit taller first.

## Development

```
main.js                        plugin source (plain ES2017, no bundler, no dependencies)
styles.css                     all rendering rules
manifest.json                  plugin manifest
versions.json                  version -> minimum app version
test/align.test.js             unit tests for the pure functions
tools/build.mjs                production build (npm run build)
tools/check-manifest.mjs       validates metadata against the directory's rules
tools/set-author.mjs           fills in the author and GitHub placeholders
tools/install.sh               copies the plugin into a vault for testing
docs/SUBMISSION.md             how to cut a release and submit to the directory
.github/workflows/release.yml  creates the GitHub release on tag push
```

There is no bundler: `main.js` is written by hand and loaded directly, and there are no runtime or build dependencies.

```bash
npm run build                   # verify the release payload — this is what the directory runs
npm run build -- --zip          # ... and write dist/canvas-node-align-<version>.zip
npm run verify                  # build + unit tests
tools/install.sh "/path/to/vault"
```

**Why a build script exists even though nothing is compiled.** The community directory runs the first script it finds in the order `build`, `build:plugin`, `compile`, and compares the result against the committed source, to verify that a release was built from the repository it claims to come from. With none of those scripts present it reports that build verification could not run. So `npm run build` parses `main.js` in-process, validates the metadata, checks that the three files Obsidian downloads are present and BOM-free, and prints their sizes and sha256 hashes so they can be held against the release assets. It deliberately never rewrites a tracked file: run it twice and the hashes are identical, which is the property the directory is looking for.

The tests slice the pure functions out of `main.js` and run them through `new Function`, so what is tested is exactly what ships. 116 assertions cover both axes' markers, idempotent replacement, clearing, **"setting one axis never wipes the other"**, list/heading safety, Windows line endings, class-name cleanup (including that the two class prefixes never mistake each other), frontmatter merging, and a set of CSS guards that fail the build if a vertical selector loses the specificity it needs to beat Obsidian's own stylesheet.

Source comments are written in Chinese.

## Release and submission

Bumping the version is a three-file job (`manifest.json`, `versions.json`, and the git tag), and the tag must match `manifest.json` exactly or Obsidian cannot install the plugin. `docs/SUBMISSION.md` has the full checklist, including the current community-directory submission flow.

## License

[MIT](LICENSE)
