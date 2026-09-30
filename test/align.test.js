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
  'readAlignClass, canvasAlignKey, ' +
  'ALIGN_BY_KEY, VALIGN_BY_KEY, ALIGN_KEYS, NOTE_ALIGNS, JUSTIFY_ALIGN, ' +
  'CARD_CLS, VCARD_CLS, GROUP_CLS, PATH_CLS, NLABEL_CLS, ' +
  'ALIGN_GRID_ROWS, glyphBars, gridCellFor, stateText, GLYPH_W, GLYPH_H, GLYPH_BAR, ' +
  'GRID_ITEM_TITLE};';
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
eq(A.readAlign('#cta-j 标题'), 'justify',
   '老卡片里残留的 #cta-j 也读得出来（白板侧已经没有这个取值了，见下面那组断言）');
eq(A.readAlign('文字 #cta-l'), 'left', 'read tag marker mid-line');
eq(A.readAlign('#cta-cc'), null, 'does not match the lookalike #cta-cc');
eq(A.readAlign('#cta-'), null, 'does not match a truncated tag');

/* ---------- 白板侧只有左/中/右（2.3.1） ----------
 * text-align: justify 只在会折行的多行段落里才有效果（按规范不拉伸最后一行），
 * 卡片里常是两三行短句、三种标签更是单行文字 ⇒ 用户实测「在卡片里面用不了」。
 * 所以白板侧一律只有左/中/右。这几条是**防止它被顺手加回来**的。 */
eq(A.ALIGN_KEYS.join(','), 'left,center,right', '白板侧的水平取值就是左/中/右三个');
eq(A.ALIGN_KEYS.indexOf('justify'), -1, '白板侧没有两端对齐');

/* 唯一的例外：设置里的「卡片内嵌笔记的正文」。嵌进来的是**真 Markdown**
   （段落会折行），两端对齐在那儿是真有效果的 —— 所以这一项的取值表仍是四个。 */
eq(A.NOTE_ALIGNS.map(function (a) { return a.key; }).join(','),
   'left,center,right,justify', '「卡片内嵌笔记的正文」多一个两端对齐');
eq(A.JUSTIFY_ALIGN.label, '两端对齐', '两端对齐那一项还在（给内嵌笔记那一项用）');
eq(A.JUSTIFY_ALIGN.letter, 'j', '两端对齐的标记字母没变（老文件还得读得出来）');
eq(A.ALIGN_BY_KEY['justify'] != null, true,
   'ALIGN_BY_KEY 里查得到两端对齐 —— 不然老数据查标签会得到空字符串');

// 老卡片收口：CSS 已删 ⇒ 实际渲染就是左对齐，读回来也按左对齐算
eq(A.canvasAlignKey('justify'), 'left', '老卡片的 justify 按左对齐算');
eq(A.canvasAlignKey('center'), 'center', '正常取值原样返回');
eq(A.canvasAlignKey(null), null, 'null 保持 null（= 没设过，跟随默认）');
eq(A.canvasAlignKey('bogus'), 'left', '不认识的取值也按左对齐');

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

/* ---------- 「独立笔记」那一套已经搬去 Note Text Align（2.3.1） ----------
 * 这一整块是**反向守卫**：白板插件里不该再有任何编辑器菜单 / frontmatter 写入口，
 * 也不该再产出 cta-note-* 类名 —— 那些现在归另一个插件。
 * 这种"拆干净了没"的错误，编译器和真机都不会报，只能在这里钉住。 */
const canvasSrc = fs.readFileSync(SRC, 'utf8');
eq(canvasSrc.indexOf("on('editor-menu'") >= 0, false,
   '不再挂 editor-menu —— 独立笔记的右键菜单归 Note Text Align');
eq(canvasSrc.indexOf('processFrontMatter') >= 0, false,
   '不再写笔记 frontmatter');
eq(canvasSrc.indexOf("cta-note-") >= 0, false,
   '不再产出 cta-note-* 类名（那是 Note Text Align 接手的旧前缀，由它自己兼容）');
eq(canvasSrc.indexOf('activeMarkdownFile') >= 0, false, '不再需要"当前 Markdown 笔记"');
eq(canvasSrc.indexOf('justifyLast') >= 0, false,
   '「最后一行也拉满」的开关已搬去 Note Text Align（它只作用于笔记）');
eq(canvasSrc.indexOf('NOTE_MENU_TITLE') >= 0, false, '不再有「笔记对齐」那个菜单项');
// 而白板该有的接线必须还在（顺手证明上面的断言不是因为文件读错了）
eq(canvasSrc.indexOf("on('canvas:node-menu'") >= 0, true, '白板那三个菜单还挂着');
eq(canvasSrc.indexOf("on('canvas:edge-menu'") >= 0, true, '连线菜单还在');
eq(canvasSrc.indexOf("on('canvas:selection-menu'") >= 0, true, '多选菜单还在');

/* ---------- readAlignClass (card class names, added in 2.1.0) ---------- */
eq(A.readAlignClass(mockEl(['canvas-node', 'cta-card-center', 'x']), [A.CARD_CLS]), 'center', 'reads the card class');
eq(A.readAlignClass(mockEl(['cta-card-left']), [A.CARD_CLS]), 'left', 'reads left');
eq(A.readAlignClass(mockEl(['cta-card-justify']), [A.CARD_CLS]), 'justify',
   '老卡片上残留的 justify 类名照样读得出来（读函数是通用的，白板侧已不给设置）');
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

/* ---------- 九宫格模型（2.3.0 新增） ----------
 * 右键面板就是这张表驱动的。全部是纯数据 + 纯函数，所以能在这里钉死：
 * 12 格、9 种组合不重不漏、标签够短、小图示不出框、反查唯一。
 * 面板本身（DOM）不在这里测 —— 它要 Obsidian 的菜单容器。 */

const gridCells = [];
A.ALIGN_GRID_ROWS.forEach(function (row) {
  row.cells.forEach(function (c) { gridCells.push(c); });
});
eq(gridCells.length, 12, '九宫格面板共 12 格（9 + 2 + 1）');

const twoAxis = gridCells.filter(function (c) { return c.h && c.v; });
eq(twoAxis.length, 9, '其中 9 格同时设两个方向（3 水平 × 3 垂直）');

const combos = {};
twoAxis.forEach(function (c) {
  const k = c.h + '/' + c.v;
  combos[k] = (combos[k] || 0) + 1;
});
eq(Object.keys(combos).length, 9, '9 种组合没有重复');
eq(Object.keys(combos).filter(function (k) { return combos[k] > 1; }), [],
   '每种组合都只出现一次');
eq(twoAxis.filter(function (c) { return c.h === 'justify'; }), [],
   '面板里没有两端对齐的格子（白板侧已去掉）');

// 取值必须是插件认识的，标签必须够短（这面板要的就是一眼看完）
let maxLabel = 0;
gridCells.forEach(function (c) {
  if (c.clear) {
    eq(c.label, '清除', '清除那一格就叫「清除」');
    return;
  }
  if (c.h) eq(A.ALIGN_BY_KEY[c.h] != null, true, '水平取值合法：' + c.h);
  if (c.v) eq(A.VALIGN_BY_KEY[c.v] != null, true, '垂直取值合法：' + c.v);
  if (c.label.length > maxLabel) maxLabel = c.label.length;
});
eq(maxLabel <= 3, true, '格子标签最长 3 个字（实测 ' + maxLabel + '）');
eq(/[，。：；]|说明|提示|注意/.test(JSON.stringify(gridCells)), false,
   '面板文案里没有解释性措辞');

// 单方向那两格：只设一根轴，另一根必须不动（否则「正中」会把用户设好的垂直位置改掉）
const hOnly = gridCells.filter(function (c) { return c.h && !c.v; });
const vOnly = gridCells.filter(function (c) { return !c.h && c.v && !c.clear; });
eq(hOnly.length, 1, '只有一格是「仅水平」');
eq(vOnly.length, 1, '只有一格是「仅垂直」');
eq(hOnly[0].h, 'center', '仅水平 = 水平居中');
eq(vOnly[0].v, 'middle', '仅垂直 = 垂直居中');
eq(gridCells.filter(function (c) { return c.clear; }).length, 1, '只有一格是清除');

/* ---------- gridCellFor：状态反查 ---------- */
eq(A.gridCellFor('center', 'middle').label, '正中', '正中 = 水平居中 × 垂直居中');
eq(A.gridCellFor('left', 'top').label, '左上', '左上 = 左 × 顶');
eq(A.gridCellFor('right', 'bottom').label, '右下', '右下 = 右 × 底');
eq(A.gridCellFor('justify', 'top'), null, '两端对齐没有对应格（白板侧已去掉）');
eq(A.gridCellFor('justify', 'middle'), null, '两端对齐没有对应格（中）');
eq(A.gridCellFor('justify', 'bottom'), null, '两端对齐没有对应格（下）');
eq(A.gridCellFor(null, 'top'), null, '水平没设过 ⇒ 九宫格没有对应格');
eq(A.gridCellFor('center', null), null, '垂直没设过 ⇒ 九宫格没有对应格');
eq(A.gridCellFor('bogus', 'top'), null, '取值不存在 ⇒ null');
twoAxis.forEach(function (c) {
  eq(A.gridCellFor(c.h, c.v).label, c.label, '反查唯一：' + c.h + '/' + c.v + ' → ' + c.label);
});

/* ---------- glyphBars：格子里的两条短线 ----------
 * 线不能出框（出框在面板里就是被裁掉，肉眼很难发现是哪一格错了）。 */
const shapes = {};
twoAxis.forEach(function (c) {
  const bars = A.glyphBars(c.h, c.v);
  eq(bars.length, 2, '画两条线：' + c.label);
  bars.forEach(function (b) {
    eq(b[0] >= 0 && b[0] + b[2] <= A.GLYPH_W, true, '横向不出框：' + c.label);
    eq(b[1] >= 0 && b[1] + A.GLYPH_BAR <= A.GLYPH_H, true, '纵向不出框：' + c.label);
  });
  shapes[JSON.stringify(bars)] = c.label;
});
eq(Object.keys(shapes).length, 9, '9 种组合的小图示互不相同');

eq(A.glyphBars('left', 'top')[0][0] < A.glyphBars('center', 'top')[0][0], true,
   '左的线比居中更靠左');
eq(A.glyphBars('center', 'top')[0][0] < A.glyphBars('right', 'top')[0][0], true,
   '居中的线比右更靠左');
eq(A.glyphBars('left', 'top')[0][2] === A.glyphBars('right', 'top')[0][2], true,
   '三种对齐的线一样长，只有横向位置不同（两端对齐去掉后就没有加长线了）');
const cBar = A.glyphBars('center', 'middle')[0];
eq(cBar[0], A.GLYPH_W - (cBar[0] + cBar[2]), '居中 = 左右留白相等');
eq(A.glyphBars('left', 'top')[0][1] < A.glyphBars('left', 'middle')[0][1], true,
   '顶的线比居中更靠上');
eq(A.glyphBars('left', 'middle')[0][1] < A.glyphBars('left', 'bottom')[0][1], true,
   '居中的线比底更靠上');

// 单方向：线被撑到两头 ⇒ 表示这根轴不动
eq(A.glyphBars('center', null)[0][1], 2, '仅水平：上边那条贴着顶');
eq(A.glyphBars('center', null)[1][1] > A.GLYPH_H / 2, true, '仅水平：另一条贴着底（纵向撑满）');
eq(A.glyphBars(null, 'middle').length, 2, '仅垂直也画两条');
eq(A.glyphBars(null, 'middle')[0][0], 2, '仅垂直：一条贴左');
eq(A.glyphBars(null, 'middle')[1][0] > A.GLYPH_W / 2, true, '仅垂直：另一条贴右');
eq(A.glyphBars(null, null), [], '清除不画线');

/* ---------- stateText：面板里唯一的一处文字 ---------- */
eq(A.stateText({ h: 'center', v: 'middle' }), '正中', '状态：正中');
eq(A.stateText({ h: A.canvasAlignKey('justify'), v: 'bottom', defV: 'top' }), '左下',
   '老卡片残留的 justify 先收口成 left ⇒ 状态落到左下（而不是显示一个面板里没有的名字）');
eq(A.stateText({ h: 'justify', v: 'bottom' }), '两端对齐',
   '万一直接喂进未收口的旧值：查不到格子就退回轴名，不至于显示空白');
eq(A.stateText({ h: 'left', v: null, defV: 'top' }), '左上',
   '垂直没单独设过 ⇒ 用设置里的默认位置算状态');
eq(A.stateText({ h: null, v: null, defV: 'top' }), '跟随默认', '两根轴都没设过');
eq(A.stateText({ h: null, v: 'middle', defV: 'top' }), '垂直居中', '只设了垂直');
eq(A.stateText({ h: 'center', v: 'top', mixed: true }), '多张不一致', '多选且互不一致');
eq(A.stateText(null), '', '没有状态就给空串');

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
// ★ 反向守卫：两端对齐已从白板侧去掉，这几条规则**不能再回来**。
//   （CSS 没了 ⇒ 老卡片上残留的 cta-card-justify 渲染成左对齐，是预期行为）
eq(/\.cta-card-justify/.test(cssNoComment), false,
   '白板卡片正文没有两端对齐规则了');
eq(/\.cta-group-justify|\.cta-path-justify|\.cta-nlabel-justify/.test(cssNoComment), false,
   '三种标签也没有两端对齐规则了');
// 笔记那套规则也整体搬走了 —— 连 cta-note-* 一起，本插件一个字节都不该再产出
eq(/\.cta-note-/.test(cssNoComment), false,
   '独立笔记的对齐规则已搬到 Note Text Align，styles.css 里不再有 cta-note-*');

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

// 「最后一行也拉满」整个开关都搬去 Note Text Align 了（它只作用于笔记），
// 所以本插件既不该有那个 body 类名，也不该有配套规则。
eq(flat.indexOf('cta-justify-last') === -1, true,
   '本插件不再有 justify-last 这个 body 开关（搬去 Note Text Align）');
eq(flat.indexOf('.canvas-node.cta-card-right .canvas-node-content .markdown-source-view.mod-cm6') >= 0, true,
   'edit mode (CM6) also follows the horizontal alignment');

/* ---------- 九宫格面板的样式守卫（2.3.0 新增） ----------
 * 面板是自绘 DOM，类名全部由 main.js 拼出来 —— 样式里少一条，
 * 面板就会静默缺一块（背景透明、选中看不出来…），所以逐条钉住。 */
eq(/\.cta-grid\s*\{/.test(flat), true, 'styles.css 有九宫格面板');
eq(/\.menu\.cta-grid-menu\s*>\s*\.menu-scroll\s*\{[^}]*display:\s*none/.test(flat), true,
   'styles.css 藏掉了子菜单里那个占位项所在的行 —— 空子菜单根本不显示，' +
   '所以必须留一个占位菜单项，再把它藏掉');
eq(/\.menu\.cta-grid-menu\s*>\s*\.cta-grid\s*\{/.test(flat), true,
   '子菜单里的面板有自己的内边距（.menu 的 padding 是 0）');
eq(/\.cta-grid-head\s*\{/.test(flat), true, 'styles.css 有标题行');
eq(/\.cta-grid-rowhead\s*\{/.test(flat), true, 'styles.css 有行标');
eq(/\.cta-grid-cells\s*\{/.test(flat), true, 'styles.css 有格子容器');
eq(/\.cta-grid-cell\s*\{/.test(flat), true, 'styles.css 有格子');
eq(/\.cta-grid-cell:hover\s*\{/.test(flat), true, 'styles.css 有悬停态');
eq(/\.cta-grid-cell\.is-on\s*\{/.test(flat), true, 'styles.css 有选中态');
eq(/\.cta-grid-cell\.is-wide\s*\{/.test(flat), true, 'styles.css 有清除那行的横排样式');
eq(/\.cta-glyph\s*\{[^}]*width:\s*22px/.test(flat), true,
   '小图示宽 22px —— 必须和 main.js 的 GLYPH_W 一致');
eq(/\.cta-glyph\s*\{[^}]*height:\s*16px/.test(flat), true,
   '小图示高 16px —— 必须和 main.js 的 GLYPH_H 一致');
eq(/\.cta-glyph i\s*\{[^}]*height:\s*2px/.test(flat), true,
   '线的粗细 2px —— 必须和 main.js 的 GLYPH_BAR 一致');
eq(new RegExp('\\.cta-cols-' + 3 + '\\s*\\{[^}]*repeat\\(3').test(flat), true, '有三列的行');
eq(new RegExp('\\.cta-cols-' + 2 + '\\s*\\{[^}]*repeat\\(2').test(flat), true, '有两列的行');
eq(/\.cta-cols-1\s*\{/.test(flat), true, '有单列的行');
// 面板挂在原生菜单里，颜色必须走主题变量，否则深色模式下会瞎
['--text-normal', '--text-muted', '--text-accent', '--background-secondary',
 '--background-modifier-border', '--background-modifier-hover', '--interactive-accent']
  .forEach(function (v) {
    eq(flat.indexOf('.cta-grid') >= 0 && new RegExp('\\.cta-grid[^{]*\\{[^}]*' + v).test(flat), true,
       '面板用了主题变量 ' + v);
  });

/* ---------- 九宫格面板的结构（2.3.0 新增） ----------
 * 面板是要塞进 Obsidian 原生菜单的 DOM，单测里没有浏览器，但这块的错误
 * （少画一条线、类名拼错、点完不关菜单）在真机上极难发现，所以用一个
 * 极简 DOM 替身把结构钉死。整份 main.js 用假的 require('obsidian') 加载，
 * 跑的是**真实发货的代码**。 */
const domSrc = fs.readFileSync(SRC, 'utf8');
const stubRequire = function (id) {
  if (id === 'obsidian') {
    return {
      Plugin: function () {}, PluginSettingTab: function () {},
      Setting: function () {}, Notice: function () {}, Menu: function () {}
    };
  }
  throw new Error('unexpected require: ' + id);
};
const mod = { exports: {} };
new Function('require', 'module', 'exports', domSrc)(stubRequire, mod, {});
const D = mod.exports.__dom;

function makeDoc() {
  const doc = {
    createElement: function (tag) {
      const el = {
        tagName: tag, className: '', textContent: '', style: {}, children: [], handlers: {},
        hasClass: function (c) { return (' ' + el.className + ' ').indexOf(' ' + c + ' ') >= 0; },
        appendChild: function (c) { el.children.push(c); return c; },
        addEventListener: function (t, fn) { el.handlers[t] = fn; }
      };
      el.classList = {
        add: function (c) { if (!el.hasClass(c)) el.className = (el.className + ' ' + c).trim(); },
        contains: function (c) { return el.hasClass(c); }
      };
      // 真 DOM 也是这样：元素能反查自己所属的 document。main.js 靠它拿
      // 建面板用的 document（不依赖全局，才测得到 —— Node 里没有 document）。
      el.ownerDocument = doc;
      return el;
    }
  };
  return doc;
}
function walk(el, fn) {
  fn(el);
  el.children.forEach(function (c) { walk(c, fn); });
}
function byClass(root, cls) {
  const out = [];
  walk(root, function (el) { if (el.hasClass && el.hasClass(cls)) out.push(el); });
  return out;
}
function cellLabel(el) {
  const span = el.children.filter(function (c) { return c.tagName === 'span'; })[0];
  return span ? span.textContent : null;
}
const clickEv = { preventDefault: function () {}, stopPropagation: function () {} };

eq(typeof D.buildAlignPanel, 'function', '九宫格面板构造器导出给单测了');

const doc = makeDoc();
const picked = [];
let closed = 0;
const panel = D.buildAlignPanel({
  doc: doc,
  state: { h: 'center', v: 'middle', defV: 'top', mixed: false },
  onPick: function (c) { picked.push(c); },
  close: function () { closed++; }
});

eq(panel.hasClass('cta-grid'), true, '面板根节点是 .cta-grid');
eq(panel.children.length > 0, true, '面板不是空的');
eq(byClass(panel, 'cta-grid-rowhead').length, 5, '有 5 个行标位（九宫格三行留空）');
eq(byClass(panel, 'cta-grid-cells').length, 5, '有 5 行格子');
eq(byClass(panel, 'cta-cols-3').length, 3, '3 行是三列（九宫格 3 行）');
eq(byClass(panel, 'cta-cols-2').length, 1, '1 行是两列（仅水平 / 仅垂直）');
eq(byClass(panel, 'cta-cols-1').length, 1, '1 行是单列（清除）');
eq(byClass(panel, 'cta-grid-line').length, 2, '组间 2 条分隔线');
eq(byClass(panel, 'cta-grid-title').length, 0,
   '不传 title 就不画标题 —— 子菜单里菜单项自己写着「文本对齐」，面板里不重复');
eq(byClass(panel, 'cta-grid-state')[0].textContent, '正中', '显示当前状态');

// title 是可选的（回退/平铺路径仍然会用到）：传了就该画出来
const titled = D.buildAlignPanel({
  doc: makeDoc(), title: '卡片文字对齐（3 张）',
  state: { h: 'center', v: 'middle', defV: 'top', mixed: false },
  onPick: function () {}, close: function () {}
});
eq(byClass(titled, 'cta-grid-title')[0].textContent, '卡片文字对齐（3 张）', '传了 title 才画标题');

const cellEls = byClass(panel, 'cta-grid-cell');
eq(cellEls.length, 12, '面板里 12 个可点格');
eq(cellEls.map(cellLabel), gridCells.map(function (c) { return c.label; }),
   '格子顺序与标签和模型一模一样（换顺序会改变肌肉记忆，测试挡住）');

let bars = 0;
cellEls.forEach(function (el) {
  const glyph = el.children.filter(function (c) { return c.hasClass('cta-glyph'); })[0];
  if (!glyph) {
    eq(cellLabel(el), '清除', '只有「清除」不画小图示');
    eq(el.hasClass('is-wide'), true, '「清除」那格是横排');
    return;
  }
  eq(glyph.children.length, 2, '每格两条线：' + cellLabel(el));
  glyph.children.forEach(function (bar) {
    eq(bar.tagName, 'i', '线用 <i> 承载：' + cellLabel(el));
    eq(/^\d+(\.\d+)?px$/.test(bar.style.left), true, 'left 写成 px：' + cellLabel(el));
    eq(/^\d+(\.\d+)?px$/.test(bar.style.top), true, 'top 写成 px：' + cellLabel(el));
    eq(/^\d+(\.\d+)?px$/.test(bar.style.width), true, 'width 写成 px：' + cellLabel(el));
    bars++;
  });
});
eq(bars, 22, '11 格 × 2 条线（12 格减掉不画线的清除）');

eq(byClass(panel, 'is-on').length, 1, '「正中」状态下只有一格高亮');
eq(cellLabel(byClass(panel, 'is-on')[0]), '正中', '高亮的正是正中');

const panel2 = D.buildAlignPanel({
  doc: doc, state: { h: 'left', v: 'top', defV: 'top', mixed: true },
  onPick: function () {}, close: function () {}
});
eq(byClass(panel2, 'is-on').length, 0, '多选且互不一致时不高亮任何一格');

const panel3 = D.buildAlignPanel({
  doc: doc, state: { h: null, v: null, defV: 'top', mixed: false },
  onPick: function () {}, close: function () {}
});
eq(cellLabel(byClass(panel3, 'is-on')[0]), '清除', '两根轴都没设过时高亮「清除」');
eq(byClass(panel3, 'cta-grid-state')[0].textContent, '跟随默认', '状态显示跟随默认');

cellEls[0].handlers.click(clickEv);
eq(picked.length, 1, '点一格会回调 onPick');
eq(picked[0].label, '左上', '回传的正是被点的那一格');
eq(closed, 1, '点完顺手关掉菜单（原生菜单点一下就关，自绘面板得自己补）');
eq(picked[0].h, 'left', '格子带着要设定的水平值');
eq(picked[0].v, 'top', '格子带着要设定的垂直值');

const clearCell = cellEls.filter(function (el) { return cellLabel(el) === '清除'; })[0];
clearCell.handlers.click(clickEv);
eq(picked[1].clear, true, '「清除」那格带 clear 标记');

// 点空白处的冒泡别爬到菜单外（否则菜单会在应用之前被关掉）
let prevented = 0;
let stopped = 0;
cellEls[1].handlers.click({ preventDefault: function () { prevented++; }, stopPropagation: function () { stopped++; } });
eq(prevented, 1, '点击时 preventDefault');
eq(stopped, 1, '点击时 stopPropagation');


/* ---------- addAlignGrid：挂进「文本对齐 ▸」子菜单（2.3.1 新增） ----------
 * 替身照 app.js 里 Menu / MenuItem 的**真实行为**写：
 *   - menu.addItem(cb) 是**同步**调用 cb 的
 *   - item.setSubmenu() 返回一个 Menu，它的 .dom 在构造时就建好了
 *   - 菜单项渲染进 .menu-scroll，而 show 时会 sort() 清空重铺
 *   - 子菜单若一个项都没有，showAtPosition 第一句 `if (0 === this.items.length)
 *     return this;` ⇒ 整个子菜单不显示
 * 这三条都在真机上踩得到，所以在这里逐条钉住。 */
function fakeMenu() {
  const m = { items: [], hideCount: 0, dom: makeDoc().createElement('div') };
  m.dom.className = 'menu';
  const scroll = makeDoc().createElement('div');
  scroll.className = 'menu-scroll';
  m.dom.appendChild(makeDoc().createElement('div'));   // .menu-grabber
  m.dom.appendChild(scroll);                           // 菜单项渲染在这里
  m.scrollEl = scroll;

  // 真菜单就是靠这一步把 items 铺进 .menu-scroll 的（Menu.sort）
  const render = function () {
    m.scrollEl.children.length = 0;
    m.items.forEach(function (it) {
      const el = makeDoc().createElement('div');
      el.className = 'menu-item';
      m.scrollEl.appendChild(el);
      it.dom = el;
    });
  };
  m.sort = render;
  m.addItem = function (cb) {
    const item = {
      submenu: null, title: null, icon: null, section: null, isLabel: false,
      setTitle: function (t) { item.title = t; return item; },
      setIcon: function (i) { item.icon = i; return item; },
      setSection: function (s) { item.section = s; return item; },
      setIsLabel: function (v) { item.isLabel = v; return item; },
      setSubmenu: function () { item.submenu = fakeMenu(); return item.submenu; }
    };
    m.items.push(item);
    cb(item);
    render();
    return item;
  };
  m.hide = function () { m.hideCount++; };
  return m;
}

const addAlignGrid = mod.exports.prototype.addAlignGrid;

const menu = fakeMenu();
const gridState = { h: 'center', v: 'middle', defV: 'top', mixed: false };
let gridPick = null;
eq(addAlignGrid.call({ useSubmenu: true }, menu, gridState,
   function (c) { gridPick = c; }), true, '九宫格子菜单挂上了');

eq(menu.items.length, 1, '外层菜单只多了 1 项（原生项一个没动）');
const gridItem = menu.items[0];
eq(gridItem.title, '文本对齐', '菜单项叫「文本对齐」');
eq(typeof gridItem.icon, 'string', '带上图标（子菜单项的观感）');
eq(!!gridItem.submenu, true, '这一项带子菜单 —— 悬停约 250ms 原生就会自动弹出');
eq(byClass(menu.dom, 'cta-grid').length, 0, '面板没有挂到外层菜单上（它的家是子菜单）');

const sub = gridItem.submenu;
eq(sub.items.length >= 1, true,
   '子菜单里至少留了一个菜单项 —— 一个都没有的话 showAtPosition 直接 return，' +
   '整个子菜单根本不显示，面板挂上去也白挂');
eq(sub.scrollEl.children.length >= 1, true,
   '那个占位项渲染在 .menu-scroll 里（真机上由 CSS 藏掉，见 styles.css ⑫）');

const gridHost = sub.dom;
eq(byClass(gridHost, 'cta-grid').length, 1, '面板挂在子菜单的 .menu 容器里');
eq(gridHost.hasClass('cta-grid-menu'), true, '容器带 .cta-grid-menu（CSS 靠它定位到占位项）');
const gridPanel = byClass(gridHost, 'cta-grid')[0];
eq(gridHost.children.indexOf(gridPanel) >= 0, true,
   '面板是 .menu 的直接子节点 —— 不能塞进 .menu-scroll');
eq(sub.scrollEl.children.indexOf(gridPanel), -1, '面板确实不在滚动区里');

// ★ 子菜单 show 的那一刻会 sort() → scrollEl.empty() 重铺。面板必须扛得住。
sub.sort();
eq(byClass(sub.dom, 'cta-grid').length, 1,
   'show 时清空重铺滚动区，面板不受影响（因为它挂在 .menu 本体上）');
eq(sub.items.length >= 1, true, '重铺后占位项还在（否则子菜单会被判成空菜单不显示）');

eq(byClass(gridPanel, 'cta-grid-cell').length, 12, '挂在子菜单里的面板同样是 12 格');
eq(byClass(gridPanel, 'is-on').length, 1, '当前状态照样只高亮一格');

// 点一格：应用 + 关整个菜单（面板在子菜单里，菜单的「点外面关闭」不会触发）
byClass(gridPanel, 'cta-grid-cell')[0].handlers.click(clickEv);
eq(gridPick && gridPick.label, '左上', '点格子回传对应的位置');
eq(menu.hideCount, 1, '点完把整个菜单关掉（含子菜单）');

// 多选：菜单项标题带上张数
const multiMenu = fakeMenu();
addAlignGrid.call({ useSubmenu: true }, multiMenu, gridState, function () {}, '文本对齐（3 张）');
eq(multiMenu.items[0].title, '文本对齐（3 张）', '多选时菜单项带张数');

/* 旧版 Obsidian 没有子菜单能力 ⇒ 整块不挂。
   ★ 关键：这时候**一个字都不能往菜单里加** —— 否则菜单上会多出一个点了
     没反应的「文本对齐」，看着像坏了。 */
const legacyMenu = fakeMenu();
eq(addAlignGrid.call({ useSubmenu: false }, legacyMenu, gridState, function () {}), false,
   'useSubmenu 为假时返回 false');
eq(legacyMenu.items.length, 0, '没能力就一点痕迹都不留，交给调用方回退文字子菜单');

// 极端情况：setSubmenu 在、但 sub.dom 拿不到 ⇒ 同样返回 false，不装作成功
const oddMenu = fakeMenu();
oddMenu.addItem = function (cb) {
  const item = {
    setTitle: function () { return item; }, setIcon: function () { return item; },
    setSection: function () { return item; },
    setSubmenu: function () { return { dom: null }; }
  };
  cb(item);
};
eq(addAlignGrid.call({ useSubmenu: true }, oddMenu, gridState, function () {}), false,
   '子菜单拿不到容器时返回 false（这种版本由 canUseSubmenu 在启动时就拦住）');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
