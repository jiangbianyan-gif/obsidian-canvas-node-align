# Releasing and submitting

Notes for whoever maintains this plugin (probably future-you).

## Repo map

```
main.js                        plugin source — hand-written, no build step
styles.css                     all rendering rules
manifest.json                  plugin manifest (id, version, minAppVersion, author…)
versions.json                  version -> minimum app version
test/align.test.js             unit tests for the pure functions
tools/set-author.mjs           fills in the author and GitHub placeholders
tools/check-manifest.mjs       validates metadata (and the tag) against the rules below
tools/install.sh               copies the plugin into a vault for testing
.github/workflows/release.yml  creates the GitHub release on tag push
docs/SUBMISSION.md             this file
```

## Versioning rules

Three files must agree, and they are easy to desync:

| File | Field | Rule |
|---|---|---|
| `manifest.json` | `version` | `x.y.z`, no `v` prefix |
| `versions.json` | key | must contain `x.y.z` → `minAppVersion` |
| git tag | name | must equal `x.y.z` exactly |

Obsidian downloads `main.js`, `manifest.json` and `styles.css` from the release whose tag equals `manifest.json`'s `version`. If the tag is `v2.0.0` while the manifest says `2.0.0`, installation silently fails. The release workflow checks this and refuses to publish on a mismatch.

The release must not be a draft and must not be marked as a pre-release.

## Cutting a release

```bash
# 1. bump versions in manifest.json + versions.json + package.json
# 2. run the checks the CI runs
npm run verify

# 3. commit, tag, push
git add -A
git commit -m "2.0.0"
git tag 2.0.0
git push origin main --tags
```

The workflow then creates the release with the three required assets attached.

To test locally before tagging, `tools/install.sh "<vault path>"` copies the plugin into a vault's `.obsidian/plugins/canvas-node-align/`.

## Submitting to the community directory

The old "open a pull request against `obsidianmd/obsidian-releases`" flow is gone. Submissions now go through the website, which runs an automated review and lists anything that needs fixing.

1. **Push the repository** to GitHub, public, with `README.md`, `LICENSE` and `manifest.json` in the root.
2. **Create a GitHub release** with a tag that matches `manifest.json` exactly and attach `main.js`, `manifest.json`, `styles.css`. Not a draft, not a pre-release.
3. **Sign in at <https://community.obsidian.md>** with your Obsidian account and link your GitHub account — this is how ownership of the repository gets verified.
4. **Add the plugin** in the directory. It reads `manifest.json` at the HEAD of the default branch, so the committed manifest must already be correct.
5. **Fix whatever the automated review reports**, then publish. You can edit the description at any time, but the plugin stays uninstallable from inside Obsidian until the errors are resolved.

Reference: <https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin>

## Compliance checklist

Checked by the release workflow, but worth knowing:

- `id`: lowercase letters and hyphens only, must not contain `obsidian`, must not end with `plugin`. Must be unique across the whole directory. Currently `canvas-node-align`.
- `name`: Basic Latin only, no punctuation apart from hyphens / plus / parentheses, no emoji. Must not contain "Obsidian" or the word "Plugin". Currently `Canvas Node Align`.
- `description`: max **250 characters**, must end with a period, no emoji or special characters (in particular no em dash — an easy mistake). Should start with an action statement.
- `author` / `authorUrl`: required / optional.
- `fundingUrl`: remove it entirely if you do not accept donations.
- `minAppVersion`: the minimum version the plugin actually works on. It is currently `1.5.0`; the plugin is developed and tested against 1.13.7.
- `isDesktopOnly`: `false` — only public Obsidian APIs plus a few feature-detected Canvas internals are used, no Node or Electron APIs.
- Command IDs must not repeat the plugin ID; Obsidian prefixes them automatically. The IDs here are `align-*`, `canvas-all-*`, `note-*`.

## A caveat worth remembering

The plugin reaches into a few Canvas internals that are not in the public API docs (`node.labelEl`, `edge.labelElement.textareaEl`, the `canvas:node-menu` / `canvas:edge-menu` / `canvas:selection-menu` events, `canvas.nodes` / `canvas.edges` / `canvas.selection`, `node.setText()`, `canvas.requestSave()`).

Every call site is feature-detected or wrapped in a fallback, so a rename in a future Obsidian release degrades one feature at a time instead of breaking the plugin — but it is still worth re-testing after each Obsidian update. See the README's *Compatibility notes* table for the full list.
