# Releasing and submitting

Notes for whoever maintains this plugin (probably future-you).

## Repo map

```
main.js                        plugin source — hand-written, no bundler
styles.css                     all rendering rules
manifest.json                  plugin manifest (id, version, minAppVersion, author…)
versions.json                  version -> minimum app version
test/align.test.js             unit tests for the pure functions
tools/build.mjs                production build — verify the release payload (npm run build)
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

### Option A — let the workflow do it (preferred)

Run **Actions → Release → Run workflow**. Leave the version input empty and the
workflow reads `manifest.json`. It then:

1. installs with `npm ci` — the directory installs too, so a stale
   `package-lock.json` fails here instead of disabling build verification there
2. syntax-checks `main.js`
3. runs `tools/check-manifest.mjs` (metadata rules + version consistency + tag match)
4. runs the unit tests
5. runs `npm run build` — the same command the directory runs, so a broken build
   script fails here instead of downgrading the directory's check
6. generates **build provenance** for the three assets
7. creates the release, tagged and named after the version

Step 6 is why this is the preferred route: the community directory reports
"release assets are missing build attestation" for releases published by hand.

### Option B — tag and push

```bash
# 1. bump the version in manifest.json + versions.json + package.json
#    (and refresh package-lock.json: npm install --package-lock-only)
# 2. run the checks the CI runs
npm run verify

# 3. tag with the version *exactly* — no "v" prefix
git commit -am "<version>"
git tag <version>
git push origin main --tags
```

A tag push triggers the same workflow, so the release still gets its attestation.

To test locally first, `tools/install.sh "<vault path>"` copies the plugin into a
vault's `.obsidian/plugins/canvas-node-align/`.

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

## What the automated review actually reports

Observed on the first submission (2.0.0). Results come back grouped, each item
rated as an **error**, a **warning**, a **recommendation** or a **pass**. Only
errors block installation.

| Group | Item | How this repository answers it |
| --- | --- | --- |
| Release | *Release name does not include the version* (warning) | the workflow names the release after the version |
| Release | *Release assets are missing build attestation* (recommendation) | `actions/attest-build-provenance` in `release.yml` |
| Network requests | *No suspicious network patterns found* (pass) | the plugin makes no network calls at all |
| CSS LINT | *Avoid `has` — broad selector invalidation is a performance problem* (warning) | card alignment uses a runtime class name; `styles.css` contains no `has` selector, and a unit test fails if one comes back |
| Dependencies | *No vulnerable dependencies found* (pass) | zero runtime dependencies |
| Code obfuscation | *No obfuscation detected* (pass) | plain readable ES2017 |
| Build verification | *Build verification cannot run — `package.json` needs a `build` script to reproduce the build process* (recommendation) | fixed in 2.2.0: `package.json` has `"build": "node tools/build.mjs"`. See the note below |

### The build-verification recommendation

Seen on the 2.1.0 review. The directory runs **the first script it finds in the
order `build`, `build:plugin`, `compile`** and compares the result against the
committed source, to prove a release was built from the repository it claims to
come from. 2.1.0 had `test` / `check` / `verify` but none of those three names,
so the check had nothing to run and reported a recommendation instead of a pass.

This plugin has no bundler, so `npm run build` does not generate `main.js` — it
*verifies* it. Parse the source, validate the metadata, confirm the three
downloaded files are present and BOM-free, print their sizes and sha256 hashes.
The one property that matters: **it must never rewrite a tracked file with
different bytes**, because the directory's check is exactly "does the built
output still equal the committed source". Running it twice leaves the hashes
identical.

Two traps worth remembering if this script is ever touched:

- **Do not shell out to `node`.** `spawnSync(process.execPath, …)` fails with
  `EBUSY` on Windows when it targets the executable that is already running, and
  the directory's sandbox may not allow forking at all. Everything is done
  in-process (`vm.Script` for the parse check, an imported `validateManifest()`
  for the metadata rules).
- **Stay dependency-free.** Anything in `devDependencies` has to install
  cleanly in the directory's sandbox *before* the build script can run. No
  `esbuild`, no `eslint` — the zip writer in `tools/build.mjs` is ~60 lines of
  `zlib` and a CRC32 table precisely so that `npm ci` has nothing to fetch.

The directory also re-scans after **every release**, and verifies that the
release assets match what is committed on the default branch. Keep `main.js`,
`manifest.json` and `styles.css` byte-identical between the two.

## A caveat worth remembering

The plugin reaches into a few Canvas internals that are not in the public API docs (`node.labelEl`, `node.nodeEl`, `edge.labelElement.textareaEl`, the `canvas:node-menu` / `canvas:edge-menu` / `canvas:selection-menu` events, `canvas.nodes` / `canvas.edges` / `canvas.selection`, `node.setText()`, `canvas.requestSave()`).

Every call site is feature-detected or wrapped in a fallback, so a rename in a future Obsidian release degrades one feature at a time instead of breaking the plugin — but it is still worth re-testing after each Obsidian update. See the README's *Compatibility notes* table for the full list.
