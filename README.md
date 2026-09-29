# Canvas Node Align

Align text inside Canvas cards, group labels, edge labels and card labels — and align Markdown note bodies too.

Canvas has no text-alignment setting of its own. Right-click menus offer *align* and *distribute*, but those **move the cards themselves**; they do nothing about where the text sits inside a card. This plugin fills that gap.

```
┌─────────────────────┐        ┌─────────────────────┐
│ 模型变换             │   →    │      模型变换        │
└─────────────────────┘        └─────────────────────┘
   right-click → align → center
```

## Features

| # | Where the text lives | How it is set | Stored in |
|---|---|---|---|
| 1 | Card body (text cards) | right-click a card, **per card** | the card's own text |
| 2 | Note body embedded in a card | Settings tab (global) | plugin settings |
| 3 | Card label (file name) | right-click a card, **per card** | plugin data |
| 4 | Group label | right-click a group, **per group** | plugin data |
| 5 | Edge label | right-click an edge, **per edge** | plugin data |
| 6 | callouts / headings / code blocks inside a card | follows #1 | — |

Plus **Markdown note bodies** (`left` / `center` / `right` / `justify`), which stock Obsidian cannot do either. That is written to the note's `cssclasses` frontmatter, so it is fully reversible.

Also included: a command to align **every card on the current canvas** at once.

## Installation

### Community plugins
Not on the community list yet — it is pending review in the [community directory](https://community.obsidian.md). Until then, use one of the options below.

### Manual
1. Download `main.js`, `manifest.json` and `styles.css` from the latest release.
2. Put them in `<your vault>/.obsidian/plugins/canvas-node-align/`.
3. Reload Obsidian, then enable **Canvas Node Align** under Settings → Community plugins.

### BRAT
Add `jiangbianyan-gif/obsidian-canvas-node-align` in the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin.

### Requirements
Obsidian **1.5.0** or newer. Developed and tested on **1.13.7**.

## Usage

### Card text, per card
Right-click a card → **卡片文字对齐** → pick one of 左对齐 / 居中 / 右对齐 / 两端对齐 / 清除.

Under the hood this inserts a small plain-text marker at the end of the card's first line:

```
模型变换<span class="cta-c"></span>
```

Supported markers (all four alignments, two spellings each):

| Marker | Tag spelling | Result |
|---|---|---|
| `<span class="cta-l"></span>` | `#cta-l` | left |
| `<span class="cta-c"></span>` | `#cta-c` | center |
| `<span class="cta-r"></span>` | `#cta-r` | right |
| `<span class="cta-j"></span>` | `#cta-j` | justify |

You can also type these by hand — the plugin is only a convenient way to write them.

The marker goes at the **end of the first line**, never at the start: a leading marker would break block syntax such as `- item` or `# heading`.

### Group / edge / card labels, per item
Right-click the group (or edge, or a file card) → **…标签对齐** → pick an alignment.

These three cannot use text markers. Obsidian renders them with `setText()` / `textContent`, so an HTML marker would just show up as literal garbage. Instead the plugin adds a CSS class to the element at runtime and records the choice in its own data file.

**Trade-off:** because the choice lives in the plugin's data file and not in the `.canvas` file, these three stop being aligned if you disable the plugin. Card text (#1) does not have this limitation.

### Whole canvas at once
Command palette → **整块白板：所有卡片居中** (and the other three), or **整块白板：所有卡片清除对齐**.

### Note bodies
Command palette → **笔记正文：居中** / 右对齐 / 两端对齐 / 清除对齐.

This writes `cssclasses: [cta-note-center]` into the note's frontmatter. Existing `cssclasses` entries are preserved. Delete the class (or run 清除对齐) to revert. Live Preview works but the syntax marks move along with the text — Reading view looks cleaner.

### Settings
Settings → Canvas Node Align. Five dropdowns set the defaults for each location; anything you have not set individually follows its default column. There is also a button to clear all per-item settings.

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

- Group, edge and card-label alignment is lost when the plugin is disabled (see the trade-off note above).
- Card-label text alignment only becomes visible once the label is wider than its text, which is why `styles.css` gives `.canvas-node-label` `width: 100%`. As a side effect, very long file names are ellipsised instead of overflowing.
- Note-body alignment in Live Preview moves the syntax marks along with the text; Reading view is cleaner.
- Alignment applies in the rendered (preview) state of a card. While you are editing a card, its content is CodeMirror source and the marker has not been rendered yet, so that card falls back to the default. Click an empty area of the canvas to leave edit mode and see the result.

## Development

```
main.js                        plugin source (plain ES2017, no build step, no dependencies)
styles.css                     all rendering rules
manifest.json                  plugin manifest
versions.json                  version -> minimum app version
test/align.test.js             unit tests for the pure functions
tools/set-author.mjs           fills in the author and GitHub placeholders
tools/check-manifest.mjs       validates metadata against the directory's rules
tools/install.sh               copies the plugin into a vault for testing
docs/SUBMISSION.md             how to cut a release and submit to the directory
.github/workflows/release.yml  creates the GitHub release on tag push
```

There is no build step: `main.js` is written by hand and loaded directly, and there are no runtime dependencies.

```bash
npm run verify                  # node --check main.js && node test/align.test.js
tools/install.sh "/path/to/vault"
```

The tests slice the pure functions out of `main.js` and run them through `new Function`, so what is tested is exactly what ships. 48 assertions cover writing, idempotent replacement, clearing, list/heading safety, Windows line endings, class-name cleanup and frontmatter merging.

Source comments are written in Chinese.

## Release and submission

Bumping the version is a three-file job (`manifest.json`, `versions.json`, and the git tag), and the tag must match `manifest.json` exactly or Obsidian cannot install the plugin. `docs/SUBMISSION.md` has the full checklist, including the current community-directory submission flow.

## License

[MIT](LICENSE)
