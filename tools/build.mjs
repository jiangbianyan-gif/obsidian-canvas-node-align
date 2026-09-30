#!/usr/bin/env node
'use strict';
/* Production build for canvas-node-align.
 *
 *   npm run build            verify the release payload
 *   npm run build -- --zip   ... and also write dist/canvas-node-align-<version>.zip
 *
 * Why this looks like a validator rather than a bundler
 * ----------------------------------------------------
 * The plugin is plain CommonJS. There is no TypeScript, no bundler and no
 * transpile step: upstream main.js IS the production artifact, and it is
 * committed. So "building" here means proving that the committed artifact is
 * the one that ships - compile it, validate its metadata, and hash the three
 * files Obsidian downloads.
 *
 * That matters because the Obsidian community directory runs the first script
 * it finds in the order `build` -> `build:plugin` -> `compile`, then compares
 * the result with the committed source to verify the release was built from it.
 * This command must therefore be deterministic and must never rewrite a tracked
 * file with different bytes, or that comparison starts failing.
 *
 * Rules learned from the directory's build-verification scan
 * ---------------------------------------------------------
 * The scan runs this in an environment we cannot inspect, and any non-zero exit
 * is reported as "build verification failed" with only the captured output as
 * evidence. Two rules follow, both from a real failure:
 *
 *   1. Speak first. The very first thing this script does is log the
 *      environment (Node version, platform, working directory, file listing).
 *      One scan reported "build verification failed" with no output from this
 *      script at all, which meant it died before its first log line - the cause
 *      was undiagnosable from the outside. That must not be possible again.
 *   2. Only the payload may fail the build. Whether the three files Obsidian
 *      downloads exist, are non-empty, are BOM-free and parse is this script's
 *      job; anything else - metadata consistency, submission rules, an
 *      unavailable helper module - is reported as a warning and leaves the exit
 *      code at 0. Compliance is enforced separately by `npm run check:manifest`
 *      in CI, so a stricter build here would only add ways for the sandbox to
 *      fail for reasons that have nothing to do with the payload.
 *
 * Everything runs in-process: no subprocesses (spawnSync on process.execPath
 * fails with EBUSY on Windows and may be blocked in the sandbox) and no
 * dependencies (npm ci has to succeed there before this can even start).
 *
 * A crash is caught and printed on stdout, so the next scan shows the cause.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* The three files Obsidian downloads from the release. Do not rename them. */
const ASSETS = ['main.js', 'manifest.json', 'styles.css'];

const argv = process.argv.slice(2);
const wantZip = argv.includes('--zip');

/* On CI (and in the directory's sandbox) emit GitHub-Actions annotations. */
const tagMode = process.env.GITHUB_ACTIONS === 'true';

/* Payload problems fail the build; everything else is only reported. */
const problems = [];
const warnings = [];
const fail = (msg) => problems.push(msg);
const warn = (msg) => warnings.push(msg);

const read = (rel) => fs.readFileSync(path.join(ROOT, rel));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const msgOf = (e) => (e && e.message ? e.message : String(e));
const line = (msg) => (tagMode ? '::error::' + msg.replace(/\n/g, ' | ') : 'FAIL  ' + msg);

/* ------------------------------------------------------------------ *
 * 0. Say who we are, before touching anything else.
 * ------------------------------------------------------------------ */
// Deliberately before every check: if the sandbox cannot get past this, the
// captured output still tells us what the environment looked like.

console.log('> build canvas-node-align');
console.log('  node ' + process.version + '  ' + process.platform + '/' + process.arch);
console.log('  cwd  ' + process.cwd());
console.log('  root ' + ROOT + (exists('main.js') ? '' : '  <- main.js is NOT here'));
console.log('  env  GITHUB_ACTIONS=' + String(process.env.GITHUB_ACTIONS) + '  CI=' + String(process.env.CI));
try {
  console.log('  files ' + fs.readdirSync(ROOT).sort().join(' '));
} catch (e) {
  console.log('  files (cannot list: ' + msgOf(e) + ')');
}
try {
  console.log(
    '  tools ' +
      (exists('tools') ? fs.readdirSync(path.join(ROOT, 'tools')).sort().join(' ') : '(no tools/ directory)')
  );
} catch (e) {
  console.log('  tools (cannot list: ' + msgOf(e) + ')');
}

run().then(finish, (err) => {
  console.log('');
  console.log(line('the build script threw before it could finish: ' + msgOf(err)));
  console.log(err && err.stack ? err.stack : '');
  process.exit(1);
});

/* ------------------------------------------------------------------ *
 * The build
 * ------------------------------------------------------------------ */

async function run() {
  /* ---------------- 1. main.js must compile ---------------- */
  // Compiled in-process rather than via `node --check`: spawning the running
  // executable fails with EBUSY on Windows, and the build must not depend on
  // being able to fork a second Node process in the directory's sandbox.
  // vm.Script performs the same parse-only check and never executes the file.

  console.log('\n> Checking main.js compiles');
  if (!exists('main.js')) {
    fail('main.js is missing - Obsidian downloads it from the release');
  } else {
    try {
      new vm.Script(read('main.js').toString('utf8'), { filename: 'main.js' });
      console.log('  ok  main.js parses');
    } catch (e) {
      fail('main.js does not parse: ' + msgOf(e));
    }
  }

  /* ---------------- 2. Metadata (best effort) ---------------- */

  console.log('\n> Validating metadata');
  const validateManifest = await loadValidator();
  if (validateManifest) {
    try {
      const { problems: metaProblems, notes } = validateManifest({ root: ROOT });
      notes.forEach((n) => console.log('  - ' + n));
      metaProblems.forEach((p) => warn('metadata: ' + p));
      if (!metaProblems.length) console.log('  ok  metadata is compliant');
    } catch (e) {
      warn('metadata validation threw: ' + msgOf(e));
    }
  }

  /* ---------------- 3. The release payload must be complete and clean -------- */

  console.log('\n> Checking the release payload');

  const payload = [];
  for (const name of ASSETS) {
    if (!exists(name)) {
      fail(name + ' is missing - Obsidian downloads it from the release');
      continue;
    }
    const buf = read(name);
    if (buf.length === 0) {
      fail(name + ' is empty');
      continue;
    }
    // A UTF-8 BOM breaks JSON.parse in some loaders and shows up as stray
    // characters in CSS. The committed files have never had one; keep it that way.
    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
      fail(name + ' starts with a UTF-8 BOM');
    }
    payload.push({ name, buf, size: buf.length, hash: sha256(buf) });
  }

  if (payload.length !== ASSETS.length) {
    fail('the release payload must contain exactly ' + ASSETS.join(', '));
  }

  // manifest.json must at least parse - Obsidian refuses to load the plugin
  // otherwise, so this is payload, not metadata.
  if (exists('manifest.json')) {
    try {
      JSON.parse(read('manifest.json').toString('utf8'));
      console.log('  ok  manifest.json parses');
    } catch (e) {
      fail('manifest.json does not parse: ' + msgOf(e));
    }
  }

  // The directory lints CSS and warns on :has(). The plugin's own stylesheet is
  // kept free of it on purpose (the vault snippet keeps its copy) - do not regress.
  if (exists('styles.css')) {
    const css = read('styles.css').toString('utf8');
    if (css.includes(':has(')) {
      warn('styles.css uses :has() - the directory CSS lints it as a warning');
    } else {
      console.log('  ok  styles.css has no :has()');
    }
  }

  if (exists('main.js')) {
    const js = read('main.js').toString('utf8');
    const logs = (js.match(/console\.log\(/g) || []).length;
    if (logs) console.log('  note ' + logs + ' console.log call(s) in main.js (allowed, but keep them useful)');
  }

  /* ---------------- 4. Report what will ship ---------------- */

  console.log('\n> Release payload');
  for (const p of payload) {
    console.log('  ' + p.name.padEnd(15) + String(p.size).padStart(7) + ' B  ' + kb(p.size).padStart(9) + '  sha256:' + p.hash);
  }
  console.log('  (compare these hashes with the assets on the GitHub release page)');

  /* ---------------- 5. Optional: the manual-install zip ---------------- */

  if (wantZip && payload.length === ASSETS.length) {
    const version = JSON.parse(read('manifest.json').toString('utf8')).version;
    const zipPath = path.join(ROOT, 'dist', 'canvas-node-align-' + version + '.zip');
    fs.mkdirSync(path.dirname(zipPath), { recursive: true });
    const zipBuf = makeZip(payload.map((p) => ({ name: p.name, data: p.buf })));
    fs.writeFileSync(zipPath, zipBuf);
    console.log(
      '\n> Wrote ' +
        path.relative(ROOT, zipPath).replace(/\\/g, '/') +
        '  ' +
        zipBuf.length +
        ' B  (' +
        kb(zipBuf.length) +
        ')  sha256:' +
        sha256(zipBuf)
    );
  }
}

/* ------------------------------------------------------------------ *
 * Load the metadata rules without letting them break the build.
 * ------------------------------------------------------------------ */
// A dynamic import (not a top-level `import ... from`) on purpose: a static
// import is resolved before the first line above ever runs, so a missing or
// unloadable helper would kill the script with no output at all - exactly the
// failure this script is designed to make impossible.

async function loadValidator() {
  if (!exists('tools/check-manifest.mjs')) {
    warn('tools/check-manifest.mjs is not in this checkout - metadata rules skipped');
    return null;
  }
  try {
    const mod = await import('./check-manifest.mjs');
    if (typeof mod.validateManifest === 'function') return mod.validateManifest;
    warn('tools/check-manifest.mjs does not export validateManifest - metadata rules skipped');
    return null;
  } catch (e) {
    warn('could not load tools/check-manifest.mjs: ' + msgOf(e));
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Result
 * ------------------------------------------------------------------ */

function finish() {
  if (warnings.length) {
    console.log('');
    warnings.forEach((w) => console.log((tagMode ? '::warning::' : 'WARN  ') + w));
  }

  if (problems.length) {
    console.log('');
    problems.forEach((p) => console.log(line(p)));
    console.log('\n' + problems.length + ' problem' + (problems.length === 1 ? '' : 's') + ' found.');
    process.exit(1);
  }

  console.log('\nBuild verified: the committed payload is the release payload.');
  if (warnings.length) {
    console.log('(' + warnings.length + ' warning' + (warnings.length === 1 ? '' : 's') + ' - see above; the payload is fine.)');
  }
}

/* ------------------------------------------------------------------ *
 * Minimal ZIP writer (stored or deflate) - keeps the build dependency-free,
 * because anything in devDependencies has to install cleanly in the
 * directory's sandbox before this script can even run.
 * ------------------------------------------------------------------ */
function makeZip(entries) {
  const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })();

  const crc32 = (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };

  const now = new Date();
  const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xffff;
  const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xffff;

  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const raw = e.data;
    let method = 8;
    let body = zlib.deflateRawSync(raw, { level: 9 });
    if (body.length >= raw.length) {
      method = 0;
      body = raw;
    }
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8); // flags
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([Buffer.concat(locals), centralBuf, eocd]);
}
