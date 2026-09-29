#!/usr/bin/env node
'use strict';
/* Validate manifest.json (and versions.json) against the Obsidian directory's
 * submission rules, so problems are caught locally instead of by the review bot.
 *
 *   node tools/check-manifest.mjs
 *   node tools/check-manifest.mjs --tag 2.0.0     # also verify a release tag
 *
 * Exits non-zero and prints GitHub-Actions-style ::error:: lines on failure.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const tagIndex = argv.indexOf('--tag');
const tag = tagIndex >= 0 ? argv[tagIndex + 1] : null;

const tagMode = process.env.GITHUB_ACTIONS === 'true';
function error(msg) {
  console.log(tagMode ? '::error::' + msg : 'FAIL  ' + msg);
}

const problems = [];
const notes = [];

const manifestPath = path.join(ROOT, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  error('manifest.json not found in the repository root');
  process.exit(1);
}

const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

/* ---------- required fields ---------- */
for (const field of ['id', 'name', 'version', 'minAppVersion', 'description', 'author', 'isDesktopOnly']) {
  if (m[field] === undefined || m[field] === null || m[field] === '') {
    problems.push('manifest.' + field + ' is required');
  }
}

/* ---------- id ---------- */
if (typeof m.id === 'string') {
  if (!/^[a-z-]+$/.test(m.id)) problems.push('id must use lowercase letters and hyphens only, got "' + m.id + '"');
  if (m.id.includes('obsidian')) problems.push('id must not contain "obsidian"');
  if (m.id.endsWith('plugin')) problems.push('id must not end with "plugin"');
  notes.push('id: ' + m.id);
}

/* ---------- name ---------- */
if (typeof m.name === 'string') {
  if (/obsidian/i.test(m.name)) problems.push('name must not contain "Obsidian" or a variation of it');
  if (/\bplugin\b/i.test(m.name)) problems.push('name must not contain the word "Plugin"');
  if (/[^\x20-\x7E]/.test(m.name)) problems.push('name must use Basic Latin characters only (no emoji, no CJK)');
  if (/[^\w\s\-+()]/.test(m.name)) problems.push('name may only use hyphens, plus signs and parentheses as punctuation');
  notes.push('name: ' + m.name);
}

/* ---------- version ---------- */
if (typeof m.version === 'string') {
  if (!/^\d+\.\d+\.\d+$/.test(m.version)) problems.push('version must be x.y.z, got "' + m.version + '"');
  notes.push('version: ' + m.version);
}

/* ---------- description ---------- */
if (typeof m.description === 'string') {
  if (m.description.length > 250) problems.push('description is ' + m.description.length + ' characters, max is 250');
  if (!m.description.endsWith('.')) problems.push('description must end with a period');
  if (/[^\x20-\x7E]/.test(m.description)) problems.push('description must use Basic Latin only (no emoji, no em dash, no smart quotes)');
  if (/^this is a plugin/i.test(m.description)) problems.push('description must not start with "This is a plugin"');
  if (/\bobsidian\b/.test(m.description) && !/Obsidian/.test(m.description)) problems.push('capitalize "Obsidian" correctly in the description');
  notes.push('description: ' + m.description.length + '/250 characters');
}

/* ---------- author ---------- */
if (typeof m.author === 'string' && /YOUR_/.test(m.author)) {
  problems.push('author is still the placeholder — run: node tools/set-author.mjs --user <github-username>');
}
if (typeof m.authorUrl === 'string' && /YOUR_/.test(m.authorUrl)) {
  problems.push('authorUrl is still the placeholder — run: node tools/set-author.mjs --user <github-username>');
}
if (m.fundingUrl !== undefined) {
  problems.push('remove fundingUrl unless you actually accept donations');
}

/* ---------- flags ---------- */
if (typeof m.isDesktopOnly !== 'boolean') problems.push('isDesktopOnly must be a boolean');
if (m.isDesktopOnly) notes.push('isDesktopOnly: true (desktop only)');

/* ---------- versions.json ---------- */
const versionsPath = path.join(ROOT, 'versions.json');
if (fs.existsSync(versionsPath)) {
  const v = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
  if (typeof m.version === 'string' && !(m.version in v)) {
    problems.push('versions.json has no entry for ' + m.version);
  } else if (typeof m.version === 'string') {
    if (v[m.version] !== m.minAppVersion) {
      problems.push('versions.json maps ' + m.version + ' -> "' + v[m.version] + '" but minAppVersion is "' + m.minAppVersion + '"');
    } else {
      notes.push('versions.json: ' + m.version + ' -> ' + v[m.version]);
    }
  }
} else {
  problems.push('versions.json is missing');
}

/* ---------- command ids must not repeat the plugin id ---------- */
const mainPath = path.join(ROOT, 'main.js');
if (fs.existsSync(mainPath) && typeof m.id === 'string') {
  const src = fs.readFileSync(mainPath, 'utf8');
  const ids = [...src.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map((x) => x[1]);
  const offenders = ids.filter((id) => id.includes(m.id));
  if (offenders.length) {
    problems.push('command ids must not repeat the plugin id (Obsidian prefixes it): ' + offenders.join(', '));
  } else if (ids.length) {
    notes.push(ids.length + ' command ids, none repeat the plugin id');
  }
}

/* ---------- files Obsidian loads must exist ---------- */
for (const f of ['main.js', 'manifest.json']) {
  if (!fs.existsSync(path.join(ROOT, f))) problems.push(f + ' must exist in the repository root');
}
if (!fs.existsSync(path.join(ROOT, 'styles.css'))) notes.push('styles.css is absent (optional, but this plugin needs it)');
if (!fs.existsSync(path.join(ROOT, 'README.md'))) problems.push('README.md must exist in the repository root');
if (!fs.existsSync(path.join(ROOT, 'LICENSE'))) problems.push('LICENSE must exist in the repository root');

/* ---------- release tag ---------- */
// Exact match only. We deliberately do NOT strip a leading "v": Obsidian builds
// the download URL as releases/download/<manifest.version>/main.js, so a tag of
// "v2.1.0" makes it request ".../download/2.1.0/main.js" and get a 404.
// GitHub's own release page suggests "v" prefixes for general projects; that
// advice does not apply to Obsidian plugins.
if (tag) {
  if (tag !== m.version) {
    if (tag.replace(/^v/, '') === m.version) {
      problems.push(
        'tag "' + tag + '" has a "v" prefix. Obsidian downloads assets from the release whose tag ' +
        'equals the manifest version exactly, so this would 404. Use "' + m.version + '".'
      );
    } else {
      problems.push(
        'tag "' + tag + '" does not match manifest version "' + m.version +
        '". Obsidian downloads assets from the release whose tag equals the manifest version.'
      );
    }
  } else {
    notes.push('tag ' + tag + ' matches the manifest version exactly');
  }
}

/* ---------- the same version must appear in package.json ---------- */
// Three files carry the version; forgetting one is the easiest release mistake.
const pkgPath = path.join(ROOT, 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (pkg.version !== m.version) {
    problems.push('package.json version is "' + pkg.version + '" but manifest.json says "' + m.version + '"');
  } else {
    notes.push('package.json version matches');
  }
}

const lockPath = path.join(ROOT, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const lockVersion = lock.version || (lock.packages && lock.packages[''] && lock.packages[''].version);
  if (lockVersion && lockVersion !== m.version) {
    problems.push('package-lock.json version is "' + lockVersion + '" but manifest.json says "' + m.version + '" — run: npm install --package-lock-only');
  } else if (lockVersion) {
    notes.push('package-lock.json version matches');
  }
} else {
  notes.push('package-lock.json is absent (the directory will report that build verification cannot run)');
}

/* ---------- report ---------- */
if (problems.length) {
  problems.forEach(error);
  console.log('\n' + problems.length + ' problem' + (problems.length === 1 ? '' : 's') + ' found.');
  process.exit(1);
}

console.log('manifest.json is compliant:');
notes.forEach((n) => console.log('  - ' + n));
