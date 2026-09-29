'use strict';
/* Canvas Node Align — unit tests for the pure functions.
 *
 *   node test/align.test.js        (or: npm test)
 *
 * How it works: `main.js` is loaded by Obsidian's plugin loader, so a bare
 * `require()` would fail on `require('obsidian')`. Instead we slice the
 * "constants + pure functions" region out of the source and evaluate it with
 * `new Function`, which keeps the test honest: it runs the exact shipped code.
 *
 * No dependencies, no test framework.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'main.js');
const src = fs.readFileSync(SRC, 'utf8');

function slice(startMark, endMark) {
  const i = src.indexOf(startMark);
  const j = src.indexOf(endMark);
  if (i < 0 || j < 0 || j <= i) throw new Error('slice failed: ' + startMark);
  return src.slice(i, j);
}

const consts = slice('// 四种对齐方式。letter', 'class CanvasNodeAlignSettingTab');
const code =
  consts +
  '\nreturn {readAlign, stripMarks, withAlign, clearAlignClasses, toArray, mergeNoteClass, ALIGN_BY_KEY, GROUP_CLS, PATH_CLS, NLABEL_CLS};';
const A = new Function(code)();

let pass = 0;
let fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    console.log('  x ' + name + '\n      actual:   ' + a + '\n      expected: ' + e);
  }
}

/* ---------- readAlign ---------- */
eq(A.readAlign('模型变换<span class="cta-c"></span>'), 'center', 'read span marker');
eq(A.readAlign('模型坐标<span class="cta-r"></span>\n'), 'right', 'read span marker with trailing newline');
eq(A.readAlign('plain text'), null, 'no marker -> null');
eq(A.readAlign(''), null, 'empty string -> null');
eq(A.readAlign(null), null, 'null -> null');
eq(A.readAlign(undefined), null, 'undefined -> null');
eq(A.readAlign('#cta-j 标题'), 'justify', 'read tag marker at line start');
eq(A.readAlign('文字 #cta-l'), 'left', 'read tag marker mid-line');
eq(A.readAlign('#cta-cc'), null, 'does not match the lookalike #cta-cc');
eq(A.readAlign('#cta-'), null, 'does not match a truncated tag');

/* ---------- stripMarks ---------- */
eq(A.stripMarks('A<span class="cta-c"></span>'), 'A', 'strip span marker');
eq(A.stripMarks('A #cta-c'), 'A', 'strip tag marker including its leading space');
eq(A.stripMarks('A<span class="cta-c"></span>\nB'), 'A\nB', 'stripping keeps the newline');
eq(A.stripMarks('A<span class="cta-cc"></span>'), 'A<span class="cta-cc"></span>', 'does not touch cta-cc');
eq(A.stripMarks('<span class="cta-l"></span>X<span class="cta-r"></span>'), 'X', 'strips every marker');
eq(A.stripMarks('A #cta-c B #cta-r'), 'A B', 'strips two tag markers on one line');
eq(A.stripMarks(null), '', 'null -> empty string');

/* ---------- withAlign ---------- */
eq(A.withAlign('模型变换', 'center'), '模型变换<span class="cta-c"></span>', 'single line, center');
eq(A.withAlign('A\nB', 'right'), 'A<span class="cta-r"></span>\nB', 'marker goes at the end of the FIRST line');
eq(A.withAlign('- 项目\n- 项目2', 'center'), '- 项目<span class="cta-c"></span>\n- 项目2', 'does not break list syntax');
eq(A.withAlign('# 标题\n正文', 'center'), '# 标题<span class="cta-c"></span>\n正文', 'does not break heading syntax');
eq(A.withAlign('已有<span class="cta-l"></span>', 'center'), '已有<span class="cta-c"></span>', 'replaces the old marker instead of stacking');
eq(A.withAlign('已有 #cta-l', 'center'), '已有<span class="cta-c"></span>', 'replaces the tag spelling too');
eq(A.withAlign(A.withAlign('A', 'center'), 'center'), A.withAlign('A', 'center'), 'idempotent: twice equals once');
eq(A.withAlign('A', null), 'A', 'null clears');
eq(A.withAlign('<span class="cta-c"></span>A', null), 'A', 'clearing restores the original text');
eq(A.withAlign('', 'center'), '<span class="cta-c"></span>', 'empty content can be aligned');
eq(A.withAlign(null, 'left'), '<span class="cta-l"></span>', 'null input can be aligned');
eq(A.withAlign('A', 'bogus'), 'A', 'unknown alignment -> returns input unchanged');
eq(A.withAlign('有空格<span class="cta-c"></span> ', 'left'), '有空格 <span class="cta-l"></span>', 'replacing a marker leaves all other characters alone');
eq(A.stripMarks('文字 <span class="cta-c"></span>'), '文字', 'stripping also removes the space before the marker');
eq(A.withAlign('A\r\nB', 'center'), 'A<span class="cta-c"></span>\r\nB', 'Windows line endings: marker is not inserted between \\r and \\n');

/* ---------- clearAlignClasses (mock classList) ---------- */
function mockEl(classes) {
  const set = new Set(classes);
  return {
    classList: {
      get length() {
        return set.size;
      },
      item(i) {
        return Array.from(set)[i];
      },
      add(c) {
        set.add(c);
      },
      remove(c) {
        set.delete(c);
      },
      has(c) {
        return set.has(c);
      },
      toString() {
        return Array.from(set).join(' ');
      },
    },
    get classes() {
      return Array.from(set).sort();
    },
  };
}

let el = mockEl(['canvas-group-label', 'cta-group-center', 'my-own']);
A.clearAlignClasses(el, [A.GROUP_CLS]);
eq(el.classes, ['canvas-group-label', 'my-own'], 'only removes our classes, keeps the others');

el = mockEl(['cta-path-left', 'cta-nlabel-right', 'keep']);
A.clearAlignClasses(el, [A.PATH_CLS, A.NLABEL_CLS]);
eq(el.classes, ['keep'], 'accepts several prefixes at once');

el = mockEl(['cta-ness']);
A.clearAlignClasses(el, [A.GROUP_CLS]);
eq(el.classes, ['cta-ness'], 'leaves non-matching prefixes alone');

A.clearAlignClasses(null, [A.GROUP_CLS]);
A.clearAlignClasses({}, [A.GROUP_CLS]);
eq(true, true, 'does not throw on a null element or one without classList');

/* ---------- toArray ---------- */
eq(A.toArray(null), [], 'null -> []');
eq(A.toArray(undefined), [], 'undefined -> []');
eq(A.toArray('x'), ['x'], 'string -> single-element array');
eq(A.toArray(['a', 'b']), ['a', 'b'], 'array passes through');
const orig = ['a'];
const copy = A.toArray(orig);
copy.push('b');
eq(orig, ['a'], 'returns a copy and does not mutate the input');

/* ---------- mergeNoteClass ---------- */
eq(A.mergeNoteClass(null, 'center'), ['cta-note-center'], 'creates cssclasses when missing');
eq(A.mergeNoteClass(['my-class'], 'center'), ['my-class', 'cta-note-center'], 'keeps the user\'s own classes');
eq(A.mergeNoteClass(['cta-note-left', 'my-class'], 'right'), ['my-class', 'cta-note-right'], 'switching alignment replaces the old class');
eq(A.mergeNoteClass('cta-note-left', 'center'), ['cta-note-center'], 'accepts the string form');
eq(A.mergeNoteClass(['my-class'], null), ['my-class'], 'clearing keeps the user\'s classes');
eq(A.mergeNoteClass(['cta-note-center'], null), [], 'clearing leaves an empty array when nothing else is there');
eq(A.mergeNoteClass(['cta-note-left', 'cta-note-right'], 'center'), ['cta-note-center'], 'clears several stale classes at once');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
