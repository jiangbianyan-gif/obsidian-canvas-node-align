#!/usr/bin/env node
'use strict';
/* Fill in your identity everywhere at once.
 *
 *   node tools/set-author.mjs --user <github-username> [--name "Display Name"] [--email you@example.com]
 *
 * Replaces the YOUR_GITHUB_USERNAME / YOUR_NAME placeholders in every tracked
 * file. Run it once before your first commit. Running it twice is harmless.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const TARGETS = [
  'manifest.json',
  'package.json',
  'LICENSE',
  'README.md',
  'README.zh-CN.md',
];

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--user' || a === '--name' || a === '--email') {
      out[a.slice(2)] = argv[++i];
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.user) {
  console.log(`Usage: node tools/set-author.mjs --user <github-username> [--name "Display Name"]

  --user    your GitHub username (used in URLs and BRAT instructions)
  --name    display name shown as the plugin author (defaults to --user)
  --email   optional, only used if a file references it`);
  process.exit(args.help ? 0 : 1);
}

const username = args.user.replace(/^@/, '').trim();
const displayName = (args.name || username).trim();

if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(username)) {
  console.error('"' + username + '" does not look like a GitHub username.');
  process.exit(1);
}

const REPLACEMENTS = [
  // Longest token first: YOUR_GITHUB_USERNAME contains YOUR_NAME as a prefix.
  ['YOUR_GITHUB_USERNAME', username],
  ['YOUR_NAME', displayName],
];

let touched = 0;
let total = 0;

for (const rel of TARGETS) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;

  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  for (const [from, to] of REPLACEMENTS) {
    after = after.split(from).join(to);
  }

  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    const n = REPLACEMENTS.reduce((acc, [from]) => acc + before.split(from).length - 1, 0);
    total += n;
    touched++;
    console.log('  updated ' + rel + '  (' + n + ' placeholder' + (n === 1 ? '' : 's') + ')');
  }
}

console.log(
  touched
    ? '\nDone: ' + total + ' placeholders replaced across ' + touched + ' files.'
    : '\nNothing to do: no placeholders left. Your identity is already filled in.'
);
console.log('Author: ' + displayName + '  |  GitHub: https://github.com/' + username);
