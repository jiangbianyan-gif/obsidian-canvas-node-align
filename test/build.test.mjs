#!/usr/bin/env node
'use strict';
/* Canvas Node Align — tests for the release tooling.
 *
 *   node test/build.test.mjs        (or: npm test)
 *
 * These cover the parts of the release pipeline that only exist to satisfy the
 * community directory's automated review, because a mistake there is invisible
 * locally and only shows up *after* a release has been published:
 *
 *   - package.json must expose one of build / build:plugin / compile, or the
 *     directory reports that build verification could not run.
 *   - tools/build.mjs must stay dependency-free, or `npm ci` has to succeed in
 *     the directory's sandbox before the build can even start.
 *   - tools/build.mjs must not spawn a Node process: `spawnSync(process.execPath)`
 *     fails with EBUSY on Windows and may be blocked in the sandbox.
 *
 * No dependencies, no test framework.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateManifest } from '../tools/check-manifest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

let pass = 0;
let fail = 0;

function ok(cond, label) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.log('FAIL  ' + label);
  }
}

/** Build a throwaway repository root that passes every metadata rule. */
function mkFixture(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cta-fixture-'));
  const files = {
    'manifest.json': JSON.stringify({
      id: 'demo',
      name: 'Demo',
      version: '1.0.0',
      minAppVersion: '1.5.0',
      description: 'Do a thing.',
      author: 'someone',
      isDesktopOnly: false
    }),
    'versions.json': JSON.stringify({ '1.0.0': '1.5.0' }),
    'package.json': JSON.stringify({ version: '1.0.0', scripts: { build: 'node tools/build.mjs' } }),
    'main.js': "'use strict';\n",
    'styles.css': '/* styles */\n',
    'README.md': '# demo\n',
    'LICENSE': 'MIT\n'
  };

  for (const [name, body] of Object.entries({ ...files, ...overrides })) {
    if (body === null) continue; // null => omit the file entirely
    fs.writeFileSync(path.join(dir, name), body);
  }
  return dir;
}

const fixtureRoots = [];
function fixture(overrides) {
  const dir = mkFixture(overrides);
  fixtureRoots.push(dir);
  return dir;
}

try {
  /* ---------------- the real repository ------------------------------- */

  const real = validateManifest({ root: ROOT });
  ok(real.problems.length === 0, 'the real repository passes every metadata rule (' + real.problems.join('; ') + ')');
  ok(
    real.notes.some((n) => n.startsWith('build script:')),
    'the real repository reports which build script the directory will run'
  );

  /* ---------------- the build-script rule ----------------------------- */

  const s = validateManifest({ root: fixture({ 'package.json': JSON.stringify({ version: '1.0.0', scripts: { test: 'node t.js' } }) }) });
  ok(
    s.problems.some((p) => p.includes('build') && p.includes('build:plugin') && p.includes('compile')),
    'a package.json without a build script is rejected, and names all three accepted names'
  );

  const b2 = validateManifest({ root: fixture({ 'package.json': JSON.stringify({ version: '1.0.0', scripts: { 'build:plugin': 'x' } }) }) });
  ok(!b2.problems.some((p) => p.includes('build script')), '"build:plugin" alone is accepted');

  const c = validateManifest({ root: fixture({ 'package.json': JSON.stringify({ version: '1.0.0', scripts: { compile: 'x' } }) }) });
  ok(!c.problems.some((p) => p.includes('build script')), '"compile" alone is accepted');

  const bAfterC = validateManifest({
    root: fixture({ 'package.json': JSON.stringify({ version: '1.0.0', scripts: { compile: 'x', build: 'y' } }) })
  });
  ok(
    bAfterC.notes.some((n) => n.includes('npm run build')),
    'when several are present, notes report "build" first — the directory takes the first match'
  );

  const noPkg = validateManifest({ root: fixture({ 'package.json': null }) });
  ok(noPkg.problems.some((p) => p.includes('package.json')), 'a missing package.json is rejected');

  /* ---------------- tools/build.mjs must stay self-contained ---------- */

  const buildSrc = fs.readFileSync(path.join(ROOT, 'tools', 'build.mjs'), 'utf8');
  // Comments are stripped before the source-scanning guards below: the header
  // explains *why* spawning is avoided, and that prose must not trip a guard
  // that is looking for the call itself.
  const buildCode = buildSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

  const bareImports = [...buildSrc.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)]
    .map((m) => m[1])
    .filter((spec) => !spec.startsWith('node:') && !spec.startsWith('.'));
  ok(
    bareImports.length === 0,
    'tools/build.mjs imports nothing outside node: and relative paths (so npm ci has nothing to fetch), found: ' +
      bareImports.join(', ')
  );

  ok(
    !/child_process|spawnSync|execFileSync|execSync/.test(buildCode),
    'tools/build.mjs never spawns another process (spawnSync on process.execPath fails with EBUSY on Windows)'
  );

  ok(
    /new vm\.Script\(/.test(buildSrc),
    'tools/build.mjs parses main.js in-process with vm.Script'
  );

  ok(
    /validateManifest/.test(buildSrc),
    'tools/build.mjs reuses the metadata rules instead of duplicating them'
  );

  /* the scan runs it in an environment we cannot see - see the header comment */

  ok(
    /console\.log\([^\n]*process\.version/.test(buildSrc),
    'tools/build.mjs logs the environment (Node version) before any check, so a silent failure is impossible'
  );

  ok(
    /await import\(/.test(buildSrc) && !/^import\s[^\n]*check-manifest/m.test(buildSrc),
    'tools/build.mjs loads tools/check-manifest.mjs with a dynamic import, so a missing helper cannot kill it before it prints anything'
  );

  ok(
    /run\(\)\.then\(finish,\s*\(err\)/.test(buildSrc),
    'tools/build.mjs catches a crash and still reports it on stdout'
  );

  ok(
    /warn\('metadata: '/.test(buildSrc),
    'metadata problems are warnings in the build - only the payload may fail it'
  );

  ok(
    /const problems = \[\];/.test(buildSrc) && /const warnings = \[\];/.test(buildSrc),
    'tools/build.mjs separates payload problems (fail) from everything else (warn)'
  );

  /* the build must be read-only with respect to the release payload */
  ok(
    !/writeFileSync\([^)]*'(?:main|styles)\.(?:js|css)'/.test(buildSrc) &&
      !/writeFileSync\([^)]*"manifest\.json"/.test(buildSrc),
    'tools/build.mjs never writes a tracked release asset'
  );

  /* ---------------- package.json wiring ------------------------------ */

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  ok(pkg.scripts.build === 'node tools/build.mjs', 'package.json maps "build" to tools/build.mjs');
  ok(typeof pkg.scripts.test === 'string' && pkg.scripts.test.includes('build.test.mjs'), '"npm test" runs this file too');
  ok(
    !pkg.dependencies && !pkg.devDependencies,
    'package.json declares no dependencies at all'
  );
} finally {
  for (const dir of fixtureRoots) fs.rmSync(dir, { recursive: true, force: true });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
