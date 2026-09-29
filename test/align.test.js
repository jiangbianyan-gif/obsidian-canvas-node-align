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

const consts = slice('const ALIGNS = [', 'class CanvasNodeAlignSettingTab');
const code =
  consts +
  '\nreturn {readAlign, readVAlign, stripMarks, withAlign, withVAlign, clearAlignClasses, ' +
  'readAlignClass, toArray, mergeNoteClass, ALIGN_BY_KEY, VALIGN_BY_KEY, ' +
  'CARD_CLS, VCARD_CLS, GROUP_CLS, PATH_CLS, NLABEL_CLS, JUSTIFY_LAST_CLS};';
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

/* ---------- readAlignClass (card class names, added in 2.1.0) ---------- */
eq(A.readAlignClass(mockEl(['canvas-node', 'cta-card-center', 'x']), [A.CARD_CLS]), 'center', 'reads the card class');
eq(A.readAlignClass(mockEl(['cta-card-left']), [A.CARD_CLS]), 'left', 'reads left');
eq(A.readAlignClass(mockEl(['cta-card-justify']), [A.CARD_CLS]), 'justify', 'reads justify');
eq(A.readAlignClass(mockEl(['canvas-node']), [A.CARD_CLS]), null, 'no class returns null');
eq(A.readAlignClass(mockEl(['cta-card-']), [A.CARD_CLS]), null, 'a bare prefix counts as unset');
eq(A.readAlignClass(mockEl(['cta-ness']), [A.CARD_CLS]), null, 'a non-matching prefix returns null');
eq(A.readAlignClass(null, [A.CARD_CLS]), null, 'null element returns null');
eq(A.readAlignClass({}, [A.CARD_CLS]), null, 'an element without classList returns null');
eq(A.readAlignClass(mockEl(['cta-path-right']), [A.CARD_CLS, A.PATH_CLS]), 'right', 'works with several prefixes');
// A full read -> clear -> set round trip, the way the plugin does it.
el = mockEl(['canvas-node', 'cta-card-left', 'my-own']);
A.clearAlignClasses(el, [A.CARD_CLS]);
el.classList.add(A.CARD_CLS + 'right');
eq(el.classes, ['canvas-node', 'cta-card-right', 'my-own'], 'clear-then-set keeps unrelated classes');
eq(A.readAlignClass(el, [A.CARD_CLS]), 'right', 'reads back the new value');

/* ---------- readVAlign / withVAlign / 两个方向互不干扰（2.2.0 新增） ---------- */

const CV = '<span class="cta-c"></span>';   // 水平：居中
const VM = '<span class="cta-vm"></span>';  // 垂直：居中

// 读
eq(A.readVAlign('文字' + VM), 'middle', 'read the vertical span marker');
eq(A.readVAlign('文字<span class="cta-vt"></span>'), 'top', 'reads top');
eq(A.readVAlign('文字<span class="cta-vb"></span>'), 'bottom', 'reads bottom');
eq(A.readVAlign('#cta-vm 文字'), 'middle', 'read the vertical tag marker');
eq(A.readVAlign('文字 #cta-vt'), 'top', 'read the vertical tag marker mid-line');
eq(A.readVAlign('plain text'), null, 'no vertical marker -> null');
eq(A.readVAlign(''), null, 'empty string -> null');
eq(A.readVAlign(null), null, 'null -> null');
eq(A.readVAlign('#cta-vmm'), null, 'does not match the lookalike #cta-vmm');
eq(A.readVAlign('#cta-v'), null, 'does not match a truncated vertical tag');

// ★ 两个方向的标记必须互不认识，否则会互相误读
eq(A.readVAlign('文字' + CV), null, 'a horizontal marker is not read as vertical');
eq(A.readAlign('文字' + VM), null, 'a vertical marker is not read as horizontal');
eq(A.readAlign('文字' + CV + VM), 'center', 'both markers present: horizontal still readable');
eq(A.readVAlign('文字' + CV + VM), 'middle', 'both markers present: vertical still readable');

// 写
eq(A.withVAlign('文字', 'middle'), '文字' + VM, 'single line, middle');
eq(A.withVAlign('A\nB', 'bottom'), 'A<span class="cta-vb"></span>\nB', 'marker goes at the end of the FIRST line');
eq(A.withVAlign('A\r\nB', 'top'), 'A<span class="cta-vt"></span>\r\nB', 'CRLF: marker lands before \\r, not between \\r and \\n');
eq(A.withVAlign('- 项目\n- 项目2', 'middle'), '- 项目' + VM + '\n- 项目2', 'does not break list syntax');
eq(A.withVAlign('已有<span class="cta-vt"></span>', 'middle'), '已有' + VM, 'replaces the old vertical marker instead of stacking');
eq(A.withVAlign('已有 #cta-vt', 'middle'), '已有' + VM, 'replaces the vertical tag spelling too');
eq(A.withVAlign(A.withVAlign('A', 'bottom'), 'bottom'), A.withVAlign('A', 'bottom'), 'idempotent: twice equals once');
eq(A.withVAlign('A', null), 'A', 'null clears the vertical marker');
eq(A.withVAlign(VM + 'A', null), 'A', 'clearing restores the original text');

// ★★ 最关键的一条：设水平不能把垂直标记抹掉，反之亦然
eq(A.withAlign('A' + VM, 'right'), 'A' + VM + '<span class="cta-r"></span>',
   'setting horizontal KEEPS an existing vertical marker');
eq(A.withVAlign('A' + CV, 'bottom'), 'A' + CV + '<span class="cta-vb"></span>',
   'setting vertical KEEPS an existing horizontal marker');
eq(A.withAlign(A.withVAlign('A', 'bottom'), 'center'), 'A<span class="cta-vb"></span>' + CV,
   'vertical then horizontal: both survive');
eq(A.readVAlign(A.withAlign(A.withVAlign('A', 'bottom'), 'center')), 'bottom',
   'vertical survives a horizontal change (read back)');
eq(A.withAlign('A' + CV + VM, null), 'A' + VM,
   'clearing horizontal leaves the vertical marker behind');
eq(A.withVAlign('A' + CV + VM, null), 'A' + CV,
   'clearing vertical leaves the horizontal marker behind');

// 全清
eq(A.stripMarks('A' + CV), 'A', 'stripMarks removes the horizontal marker');
eq(A.stripMarks('A' + VM), 'A', 'stripMarks removes the vertical marker');
eq(A.stripMarks('A' + CV + VM), 'A', 'stripMarks removes both at once');
eq(A.stripMarks('A #cta-c B #cta-vm'), 'A B', 'stripMarks removes both tag spellings');
eq(A.stripMarks('A<span class="cta-vmm"></span>'), 'A<span class="cta-vmm"></span>', 'stripMarks leaves a lookalike alone');

// 类名：两个前缀不能互相误伤
eq(A.readAlignClass(mockEl(['cta-v-middle']), [A.VCARD_CLS]), 'middle', 'reads the card vertical class');
eq(A.readAlignClass(mockEl(['cta-card-center', 'cta-v-middle']), [A.CARD_CLS]), 'center',
   'the horizontal prefix ignores a vertical class sitting next to it');
eq(A.readAlignClass(mockEl(['cta-card-center', 'cta-v-middle']), [A.VCARD_CLS]), 'middle',
   'the vertical prefix ignores a horizontal class sitting next to it');
eq(A.readAlignClass(mockEl(['cta-v-']), [A.VCARD_CLS]), null, 'a bare vertical prefix counts as unset');

el = mockEl(['canvas-node', 'cta-card-center', 'cta-v-middle']);
A.clearAlignClasses(el, [A.CARD_CLS]);
eq(el.classes, ['canvas-node', 'cta-v-middle'], 'clearing the horizontal class leaves the vertical one');
A.clearAlignClasses(el, [A.VCARD_CLS]);
eq(el.classes, ['canvas-node'], 'clearing the vertical class leaves the node class');

/* ---------- stylesheet guard ----------
 * The community directory runs a CSS linter that flags `:has(` as a performance
 * warning ("broad selector invalidation"). Card alignment is done with runtime
 * class names instead, so the rule must never come back. */
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const cssNoComment = css.replace(/\/\*[\s\S]*?\*\//g, '');
eq(/:has\s*\(/.test(cssNoComment), false, 'styles.css rules contain no :has(');
eq(/:has\s*\(/.test(css), false, 'styles.css does not even mention :has( in comments');
eq(/\.canvas-node\.cta-card-left\s+\.canvas-node-content/.test(cssNoComment), true, 'has the cta-card-left rule');
eq(/\.canvas-node\.cta-card-center\s+\.canvas-node-content/.test(cssNoComment), true, 'has the cta-card-center rule');
eq(/\.canvas-node\.cta-card-right\s+\.canvas-node-content/.test(cssNoComment), true, 'has the cta-card-right rule');
eq(/\.canvas-node\.cta-card-justify\s+\.canvas-node-content/.test(cssNoComment), true, 'has the cta-card-justify rule');

/* ---------- 垂直对齐的样式守卫（2.2.0 新增） ----------
 * 垂直对齐靠覆盖 Obsidian 自带的 flex 占位块实现。Obsidian 那几条选择器是
 * 4 个类（权重 0,4,0 / 0,4,1），所以我们的每条垂直选择器都写了 6 个类。
 * 这里既检查规则在不在，也检查权重够不够 —— 万一有人"顺手简化"选择器，
 * 样式会静默失效（这正是 2.0 那次踩的坑），必须让测试挡下来。 */
const flat = cssNoComment.replace(/\s+/g, ' ').trim();
const PV = '.canvas-node-content.markdown-embed > .markdown-embed-content > .markdown-preview-view';

eq(flat.indexOf('.canvas-node.cta-v-top ' + PV + '::before { flex-grow: 0; }') >= 0, true,
   'v-top pins the top spacer (flex-grow: 0)');
eq(flat.indexOf('.canvas-node.cta-v-middle ' + PV + '::before, ' +
                '.canvas-node.cta-v-middle ' + PV + '::after { max-height: none; }') >= 0, true,
   'v-middle releases the 16px cap on both spacers');
eq(flat.indexOf('.canvas-node.cta-v-middle ' + PV +
                ' > .markdown-preview-sizer { flex-grow: 0; }') >= 0, true,
   'v-middle stops the sizer from eating the free space');
eq(flat.indexOf('.canvas-node.cta-v-bottom ' + PV + '::before { max-height: none; }') >= 0, true,
   'v-bottom lets the top spacer absorb the free space');
eq(flat.indexOf('.canvas-node.cta-v-bottom ' + PV + '::after { flex-grow: 0; }') >= 0, true,
   'v-bottom pins the bottom spacer');
eq(flat.indexOf('.canvas-node.cta-v-bottom ' + PV +
                ' > .markdown-preview-sizer { flex-grow: 0; }') >= 0, true,
   'v-bottom stops the sizer from eating the free space');

const vRules = flat.match(/[^;{}]*\.canvas-node\.cta-v-[^{}]*\{[^{}]*\}/g) || [];
eq(vRules.length, 6, 'has all six vertical rules');
let minCls = 99;
vRules.forEach(function (rule) {
  rule.slice(0, rule.indexOf('{')).split(',').forEach(function (sel) {
    const n = (sel.match(/\.[A-Za-z_][\w-]*/g) || []).length;
    if (n < minCls) minCls = n;
  });
});
eq(minCls, 6, 'every vertical selector carries 6 classes, beating Obsidian\'s 4');

eq(flat.indexOf('body.cta-justify-last') >= 0, true, 'has the justify-last opt-in rule');
eq(A.JUSTIFY_LAST_CLS, 'cta-justify-last', 'the class name matches the stylesheet');
eq(flat.indexOf('.canvas-node.cta-card-justify .canvas-node-content .markdown-source-view.mod-cm6') >= 0, true,
   'edit mode (CM6) also follows the horizontal alignment');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
