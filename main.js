'use strict';

/* ============================================================================
   Canvas Node Align —— 白板里的文字对齐
   Canvas Node Align — text alignment inside Obsidian Canvas
   ----------------------------------------------------------------------------
   设计原则：插件只负责「写字 / 挂类名」，渲染一律交给 CSS。

   ★ 对齐有两个方向，互相独立，可任意组合（3 × 3 = 9 种）：
       水平  →  text-align，left | center | right
       垂直  →  由弹性占位块决定，top | middle | bottom
     两个方向各记各的标记、各挂各的类名，互不干扰。

   ★ 为什么白板侧没有「两端对齐」？
     text-align: justify 只在**有换行的多行段落**里才有效果 —— 它按规范不拉伸
     最后一行，而白板卡片里的文字往往是两三行短句，看上去和左对齐一模一样
     （以前还给设置里配了个「最后一行也拉满」的开关去凑这个效果）。三种标签
     更是单行文字，永远没有可拉伸的行。所以白板侧一律去掉，只保留
     左 / 中 / 右。「卡片内嵌笔记的正文」（真 Markdown，段落会正常折行）仍然保留
     两端对齐 —— 在那里它是真能看出差别的。相关入口见 ALIGNS 的注释。

   ★ 垂直是怎么实现的？（改之前务必看懂，CSS 那段有详细推导）
     Obsidian 原生的卡片正文是这样搭的：
       .markdown-preview-view            display:flex; flex-direction:column
         ├ ::before   弹性占位块  flex:1 1 0; max-height:16px
         ├ .markdown-preview-sizer  正文  flex:1 0 0
         └ ::after    弹性占位块  同上
     两个占位块被 16px 上限卡死，剩余高度全被正文块吃掉 ⇒ 永远贴顶。
     所以垂直对齐只要调这两个占位块的 flex-grow / max-height 即可，
     全部由 CSS 完成，插件这边只负责挂 cta-v-* 类名。

   覆盖白板里全部文字位置：
     ① 文本卡正文          → 逐张：写标记 <span class="cta-c"></span>
                             <span class="cta-vt"></span>（垂直同理）
     ② 卡片内嵌笔记的正文   → 设置面板全局
     ③ 卡片文件名标签       → 逐张（运行时挂类名）+ 设置面板全局
     ④ 分组标签            → 逐组（运行时挂类名）+ 设置面板全局
     ⑤ 连线标签            → 逐条（运行时挂类名）+ 设置面板全局
     ⑥ 卡片内的 callout/标题/代码块 → 随 ① 走（CSS 处理）
     ⑦ 嵌入笔记 / 网页的卡片正文 → 垂直方向逐张（运行时挂类名）
        ★ 这类卡片的内容是**别人的文件**，不能往里面写标记，所以改挂类名，
          状态记在插件自己的 data.json 里。
     ★ 独立 Markdown 笔记正文的对齐**不在本插件里** —— 那是另一个插件
       「Note Text Align」的事（机制完全不同：它写笔记 frontmatter 的 cssclasses，
       不碰正文）。本插件只管白板：卡片正文 / 三种标签 / 嵌在卡片里的内容。
       ★ 所以本插件注册的全是 canvas:* 事件，一个编辑器菜单都不挂。

   ★ 右键菜单长什么样？
     右键卡片 →「文本对齐 ▸」→ 鼠标停一下弹出**九宫格子菜单**：
     3（左/中/右）× 3（上/中/下）= 9 格，外加「仅水平 / 仅垂直」两格和「清除」，
     12 格一次点完 9 种组合（3 水平 × 3 垂直）。
     面板里不写解释文字 —— 位置由格子里的小图示表达，格子下只有一个短标签。
     文件名标签 / 分组标签 / 连线标签仍是文字子菜单：它们都是单行文字，
     垂直方向没有可移动的余量，九宫格对它们没有意义。

   ★★ 走「原生子菜单」这条路有两个坑（改 addAlignGrid 前必读）
      ① 子菜单里**必须至少有一个菜单项**。Menu.showAtPosition 的第一句就是
         `if (0 === this.items.length) return this;` —— 空子菜单根本不显示，
         DOM 挂上去也白挂。所以先 sub.addItem() 塞一个占位项，
         再用 CSS（styles.css ⑫ 段的 .cta-grid-menu）把 .menu-scroll 藏掉。
      ② 菜单项是渲染进 .menu-scroll 的，而 show 时会 sort() → scrollEl.empty()
         清空重铺。所以面板必须挂在 **.menu 本体**上（.menu-scroll 的兄弟位置），
         塞进滚动区会在显示的那一瞬间被抹掉。
      sub.dom 是**构造 Menu 时就建好的**（app.js: `this.dom = createDiv("menu")`），
      所以 setSubmenu() 一返回就能往里 appendChild，不用等 show。
      悬停自动弹出也是原生的：pointerover → openSubmenuSoon（250ms 延迟）；
      点击则是 selectElement(dom, true) → 立即 openSubmenu。

   ★★ 只能「追加」，绝不能重建菜单。（这一条改动时务必守住）
      Obsidian 自带的菜单项和我们共用同一个菜单 —— 1.9.9 起卡片和分组的
      右键菜单里有官方自带的「复制」，此外还有编辑 / 删除 / 替换文件……
      一旦清空 menu.dom（或 sub.dom）重新铺菜单，这些原生项会**全部消失**。
      所以只 appendChild 一个自己的容器，别的一律不碰、不重排、不隐藏。

   ★ 为什么不统一都用「写标记」？
     文本卡走 Markdown 渲染器，HTML 会生效；而分组标签和连线标签由
     Obsidian 用 setText()/text 写入（即 textContent），塞 HTML 会原样
     显示成乱码。所以 ③④⑤ 只能走「运行时挂类名」这条路。

   ★ 数据落在哪？
     ① 写在卡片文字里（.canvas 仍是标准格式，卸载插件效果仍在）
     ③④⑤⑦ 记在插件自己的 data.json 里（不碰 .canvas）
           代价：卸载插件后这几项的对齐会失效。

   本插件用到的 Obsidian 内部接口（已在 1.13.7 上逐条核实）：
     workspace.on('canvas:node-menu',      (menu, node)  => ...)
     workspace.on('canvas:edge-menu',      (menu, edge)  => ...)
     workspace.on('canvas:selection-menu', (menu, canvas)=> ...)
     canvas.nodes / canvas.edges           // 都是 Map<id, 对象>
     canvas.selection                      // Set<node>
     canvas.requestSave()                  // 存盘，默认推入历史
     canvas.readonly
     node.getData().type === 'text'        // 判断文本卡
     node.text / node.setText(str)         // 读 / 写卡片文字
     node.labelEl                          // 分组 = .canvas-group-label，卡片 = .canvas-node-label
     edge.labelElement.textareaEl          // .canvas-path-label（边有 label 时才存在）
     menu.addItem(i => i.setTitle(..).setSubmenu().addItem(...))
     item.setSubmenu()                     // 返回一个子菜单 Menu（悬停约 250ms 自动弹出）
     item.setSubmenu().dom                 // 子菜单的 .menu 容器：九宫格面板挂这里
                                           // 构造子菜单时就建好了，不用等 show
                                           // 拿不到就回退成文字子菜单（见 addAlignGrid）
     menu.hide()                           // 自绘面板不会自动关，点完自己关
   ============================================================================ */

const { Plugin, PluginSettingTab, Setting, Notice, Menu } = require('obsidian');


/* ══════════════════════════════════════════════════════════ 常量表 */

/* 水平对齐的三个取值 —— **白板侧（卡片正文 + 三种标签）只有这三个**。
   letter 用于卡片文字里的标记，cls 用于运行时挂的类名后缀（prefix + key）。

   ★ 曾经还有第四个「两端对齐」，已从白板侧去掉：text-align: justify 按规范
     **不拉伸最后一行**，而卡片里常是两三行短句、标签更是单行文字，看上去
     和左对齐一模一样 —— 用户实测「在卡片里面用不了」。它的 CSS 规则（
     cta-card-justify / cta-group-justify / cta-path-justify / cta-nlabel-justify）
     也一并删了。
     老文件里可能还留着 cta-j 标记或 justif 类名：CSS 没了 ⇒ 渲染就是左对齐，
     所以读回来时统一按左对齐处理，见 canvasAlignKey()。 */
const ALIGNS = [
  { key: 'left',   letter: 'l', label: '左对齐', icon: 'align-left' },
  { key: 'center', letter: 'c', label: '居中',   icon: 'align-center' },
  { key: 'right',  letter: 'r', label: '右对齐', icon: 'align-right' }
];
const ALIGN_KEYS = ALIGNS.map(function (a) { return a.key; });

/* 「两端对齐」在白板里只剩一处用得到：设置里的「卡片内嵌笔记的正文」。
   内嵌进来的是**真 Markdown**（段落会正常折行），两端对齐在那儿是真有效果的；
   卡片正文和三种标签都是短句 / 单行文字，所以没有它。
   ★ 独立笔记（没嵌进卡片的那种）的对齐归 Note Text Align 插件管，不在本插件。 */
const JUSTIFY_ALIGN = { key: 'justify', letter: 'j', label: '两端对齐', icon: 'align-justify' };
const NOTE_ALIGNS = ALIGNS.concat([JUSTIFY_ALIGN]);

// key → 对齐对象。★ 两端对齐也收进来：老数据里可能还有它，查标签时不能查空。
const ALIGN_BY_KEY = {};
NOTE_ALIGNS.forEach(function (a) { ALIGN_BY_KEY[a.key] = a; });

// 三个垂直位置。letter 同样是 't'|'m'|'b'，标记写作 cta-vt / cta-vm / cta-vb。
// ★ 前缀里那个 v 是必需的：没有它就分不清 cta-t（垂直顶）和水平标记的字母。
// 图标名已对着 obsidian.asar 自带的那一套逐个核实过。
const VALIGNS = [
  { key: 'top',    letter: 't', label: '顶部',     icon: 'arrow-up-to-line' },
  { key: 'middle', letter: 'm', label: '垂直居中', icon: 'align-vertical-justify-center' },
  { key: 'bottom', letter: 'b', label: '底部',     icon: 'arrow-down-to-line' }
];
const VALIGN_BY_KEY = {};
VALIGNS.forEach(function (a) { VALIGN_BY_KEY[a.key] = a; });

// 设置面板能设的五个位置，键名顺序即面板顺序
const TARGETS = [
  { key: 'card',  cssVar: '--cta-card',  label: '白板卡片正文',     hint: '文本卡里的正文。逐张设置时用右键菜单，这里只是没写标记的卡片的默认值。' },
  { key: 'note',  cssVar: '--cta-note',  label: '卡片内嵌笔记的正文', hint: '卡片嵌入整篇笔记（![[笔记]]）时的正文。' },
  { key: 'label', cssVar: '--cta-label', label: '卡片文件名标签',   hint: '卡片左上角显示的文件名。' },
  { key: 'group', cssVar: '--cta-group', label: '分组标签',         hint: '分组框上的标题。' },
  { key: 'path',  cssVar: '--cta-path',  label: '连线标签',         hint: '连线上显示的关系文字。' }
];

// 出厂默认值。（note 的 inherit = 跟随所在卡片，见文件末尾说明）
// cardV = 没写垂直标记的卡片统一用哪个垂直位置。
const DEFAULT_SETTINGS = {
  defaults: { card: 'left', note: 'inherit', label: 'left', group: 'center', path: 'center' },
  cardV: 'top',
  perItem: {}   // { "<canvas路径>": { "g:<nodeId>":"center", "e:<edgeId>":"right",
                //                    "n:<nodeId>":"left",   "v:<nodeId>":"middle" } }
};

// 运行时挂的类名前缀（CSS 里一一对应）
const CARD_CLS   = 'cta-card-';    // 水平，挂在卡片元素（.canvas-node）上
const VCARD_CLS  = 'cta-v-';       // 垂直，同样挂在 .canvas-node 上
const GROUP_CLS  = 'cta-group-';
const PATH_CLS   = 'cta-path-';
const NLABEL_CLS = 'cta-nlabel-';


/* ══════════════════════════════════════════════════════════ 纯函数（可单测） */

/* ---------- A. 卡片正文标记的读写 ---------- */

/* 两个方向各记各的标记，互不干扰（这是能自由组合的关键）：
     水平  <span class="cta-l"></span>  或  #cta-l      l | c | r | j
     垂直  <span class="cta-vt"></span> 或  #cta-vt     t | m | b

   ★ 正则里 [lcrj] 与 v[tmb] 不会互相误伤：cta-vt 的第三段是 'v'，
     不在 [lcrj] 里；反过来 cta-l 缺 v 前缀。改动时务必保持这两个字符集互斥。 */

// 水平
const H_MARK_ALL = /[ \t]*<span class="cta-[lcrj]"><\/span>/g;
const H_TAG_ALL  = /[ \t]*#cta-[lcrj]\b/g;
const H_MARK_ONE = /<span class="cta-([lcrj])"><\/span>/;
const H_TAG_ONE  = /(?:^|\s)#cta-([lcrj])\b/;
// 垂直
const V_MARK_ALL = /[ \t]*<span class="cta-v([tmb])"><\/span>/g;
const V_TAG_ALL  = /[ \t]*#cta-v[tmb]\b/g;
const V_MARK_ONE = /<span class="cta-v([tmb])"><\/span>/;
const V_TAG_ONE  = /(?:^|\s)#cta-v([tmb])\b/;

// 标记字母 → 对齐 key。★ j（两端对齐）保留在这里：老卡片文字里可能还写着
// #cta-j，读得出来才不会让读回逻辑崩掉；白板侧已经不给设置了，见 ALIGNS。
const LETTER2KEY = { l: 'left', c: 'center', r: 'right', j: 'justify' };
const VLETTER2KEY = { t: 'top', m: 'middle', b: 'bottom' };

/* 白板侧读回来的对齐 key 收一下口：不在 ALIGNS（左/中/右）里的一律按左对齐算。

   为什么需要它：两端对齐已从白板去掉、CSS 也删了，老卡片文字里可能还留着
   #cta-j 标记 —— 那种卡片**实际渲染出来就是左对齐**。不收口的话，
   九宫格会一格都不高亮、状态文字还会显示出一个面板里根本没有的「两端对齐」。

   （笔记的 justif 不经过这里 —— 那是 Note Text Align 插件写 frontmatter 的事，
     所以这里收口是安全的。） */
function canvasAlignKey(h) {
  if (h == null) return null;
  return ALIGN_KEYS.indexOf(h) >= 0 ? h : 'left';
}

// 这张卡片当前用的是哪种水平对齐？没有标记返回 null（表示跟随全局默认）。
function readAlign(text) {
  const t = String(text == null ? '' : text);
  const m = H_MARK_ONE.exec(t) || H_TAG_ONE.exec(t);
  return m ? (LETTER2KEY[m[1]] || null) : null;
}

// 垂直位置。同上，没标记返回 null。
function readVAlign(text) {
  const t = String(text == null ? '' : text);
  const m = V_MARK_ONE.exec(t) || V_TAG_ONE.exec(t);
  return m ? (VLETTER2KEY[m[1]] || null) : null;
}

// 抹掉卡片文字里**所有**对齐标记（两个方向一起），其余内容一字不动。
function stripMarks(text) {
  return String(text == null ? '' : text)
    .replace(H_MARK_ALL, '').replace(H_TAG_ALL, '')
    .replace(V_MARK_ALL, '').replace(V_TAG_ALL, '');
}

// 把标记插在**第一行末尾**。
// 插行首会打断 "- 列表"、"# 标题" 这类块级语法；用 /\r?\n/ 定位是为了兼容
// Windows 换行 —— 否则标记会被塞进 \r 和 \n 中间，渲染时多出一个空行。
function insertAtFirstLineEnd(base, mark) {
  const m = /\r?\n/.exec(base);
  if (!m) return base + mark;
  return base.slice(0, m.index) + mark + base.slice(m.index);
}

/* 生成「已设置成 mode 对齐」的卡片文字；mode 传 null 表示清除该方向的标记。

   ★ 关键：**只动自己那个方向**。withAlign 绝不能顺手把垂直标记也抹掉，
     否则用户设一次水平对齐，垂直位置就被打回默认了。所以两边各自
     「先摘掉本方向的旧标记 → 再插入新标记」，另一半原样保留。 */

function withAlign(text, mode) {
  const base = String(text == null ? '' : text)
    .replace(H_MARK_ALL, '').replace(H_TAG_ALL, '');
  if (!mode) return base;
  const a = ALIGN_BY_KEY[mode];
  if (!a) return base;
  return insertAtFirstLineEnd(base, '<span class="cta-' + a.letter + '"></span>');
}

function withVAlign(text, mode) {
  const base = String(text == null ? '' : text)
    .replace(V_MARK_ALL, '').replace(V_TAG_ALL, '');
  if (!mode) return base;
  const a = VALIGN_BY_KEY[mode];
  if (!a) return base;
  return insertAtFirstLineEnd(base, '<span class="cta-v' + a.letter + '"></span>');
}

/* ---------- B. 运行时类名的清理 ---------- */

// 把元素上所有「本插件挂的对齐类」摘掉，保留其它类名。
// 用 classList.item(i) 而不是 [i]：语义更明确，也便于脱离 DOM 单测。
function clearAlignClasses(el, prefixes) {
  if (!el || !el.classList) return;
  const kill = [];
  for (let i = 0; i < el.classList.length; i++) {
    const c = el.classList.item(i);
    if (c == null) continue;
    for (let j = 0; j < prefixes.length; j++) {
      if (c.indexOf(prefixes[j]) === 0) { kill.push(c); break; }
    }
  }
  kill.forEach(function (c) { el.classList.remove(c); });
}

// 元素当前挂的是哪个对齐？没有则返回 null。
// 用来判断「需要不需要动 DOM」——已经一致就别碰，省掉一次样式重算。
// 只有前缀、后面没跟对齐名（如 "cta-card-"）视为没设，返回 null。
function readAlignClass(el, prefixes) {
  if (!el || !el.classList) return null;
  for (let i = 0; i < el.classList.length; i++) {
    const c = el.classList.item(i);
    if (c == null) continue;
    for (let j = 0; j < prefixes.length; j++) {
      if (c.indexOf(prefixes[j]) === 0) return c.slice(prefixes[j].length) || null;
    }
  }
  return null;
}

/* ---------- C. 小工具 ---------- */

/* ---------- D. 右键九宫格 ---------- */

/* 九宫格 = 水平 3 种 × 垂直 3 种 = 9 个位置，再加「仅水平 / 仅垂直」两格和
   「清除」，共 12 格。

   ★ 为什么没有「两端对齐」那一排：白板侧不该有它，理由见 ALIGNS 的注释。

   ★ 面板里不写解释文字（用户明确要求简洁）：位置由格子里的小图示表达 ——
     两条短线，横向位置 = 水平对齐，纵向位置 = 垂直对齐。
     唯一的文字是面板上方那行状态小字，见 stateText()。

   每格三个字段：
     h / v   要设定的对齐值。null = 「这个方向不动」（仅水平 / 仅垂直那两格）
     clear   true = 两个方向一起恢复默认
     label   一律 2–3 个字，面板要的就是一眼看完 */
// 菜单里那一项的标题。用户定的叫法：右键 →「文本对齐 ▸」→ 悬停出九宫格。
// 多选时后面缀张数（'文本对齐（3 张）'）。
const GRID_ITEM_TITLE = '文本对齐';

const ALIGN_GRID_ROWS = [
  { label: '', divider: false, cells: [
    { label: '左上', h: 'left',   v: 'top' },
    { label: '上中', h: 'center', v: 'top' },
    { label: '右上', h: 'right',  v: 'top' }
  ] },
  { label: '', divider: false, cells: [
    { label: '左中', h: 'left',   v: 'middle' },
    { label: '正中', h: 'center', v: 'middle' },
    { label: '右中', h: 'right',  v: 'middle' }
  ] },
  { label: '', divider: false, cells: [
    { label: '左下', h: 'left',   v: 'bottom' },
    { label: '下中', h: 'center', v: 'bottom' },
    { label: '右下', h: 'right',  v: 'bottom' }
  ] },
  // 只改一个方向。九宫格每格都同时定两个轴，这两种情况得单独留位置 ——
  // 否则设了「正中」，垂直位置就被顺手改掉了，而用户只想改水平。
  { label: '居中', divider: true, cells: [
    { label: '仅水平', h: 'center', v: null },
    { label: '仅垂直', h: null,     v: 'middle' }
  ] },
  { label: '', divider: true, cells: [
    { label: '清除', h: null, v: null, clear: true }
  ] }
];

// 小图示的坐标系。CSS 里 .cta-glyph 就是 22×16，两边必须一致。
const GLYPH_W = 22;
const GLYPH_H = 16;
const GLYPH_BAR = 2;                       // 线粗

// 水平取值 → 短线的左端。三种对齐的线一样长，只有横向位置不同
// （两端对齐去掉之前，它的线是加长的 18px，那是唯一需要 per-key 宽度的取值）。
const GLYPH_X  = { left: 2, center: 6, right: 10 };
// 22 - 10 = 12 ⇒ 左:2..12 中:6..16 右:10..20，三种位置一眼可辨
const GLYPH_BAR_W = 10;
// 垂直取值 → 两条短线的纵向位置。2 + (16-2)/2 = 8，正好是正中
const GLYPH_Y  = { top: [2, 6], middle: [5, 9], bottom: [8, 12] };

/* 两条短线的几何：[[左, 上, 宽], ...]，在 22×16 的坐标系里。纯函数，可单测。
     两个方向都有值 → 横向位置表示水平，纵向位置表示垂直
     只有水平       → 线横向按水平摆、纵向撑到两头 ⇒ 「垂直不动」
     只有垂直       → 两根短线分列左右、纵向居中   ⇒ 「水平不动」
     清除           → 不画线 */
function glyphBars(h, v) {
  if (h && v) {
    const x = GLYPH_X[h], ys = GLYPH_Y[v];
    if (x == null || ys == null) return [];
    return [[x, ys[0], GLYPH_BAR_W], [x, ys[1], GLYPH_BAR_W]];
  }
  if (h) {
    const x = GLYPH_X[h];
    if (x == null) return [];
    return [[x, 2, GLYPH_BAR_W], [x, GLYPH_H - 4, GLYPH_BAR_W]];
  }
  if (v) {
    const y = (GLYPH_H - GLYPH_BAR) / 2;   // 纵向居中
    return [[2, y, 6], [GLYPH_W - 8, y, 6]];
  }
  return [];
}

// (h, v) 对应哪一格？找不到返回 null（h 为空 = 这根轴没单独设置过）。
function gridCellFor(h, v) {
  if (!h || !v) return null;
  for (let i = 0; i < ALIGN_GRID_ROWS.length; i++) {
    const cells = ALIGN_GRID_ROWS[i].cells;
    for (let j = 0; j < cells.length; j++) {
      const c = cells[j];
      if (!c.clear && c.h === h && c.v === v) return c;
    }
  }
  return null;
}

/* 面板右上角那一行小字：这几张卡片现在是什么状态。整个面板里唯一的文字提示。
   state: { h, v, defV, mixed } —— h / v 为 null 表示这根轴没单独设置过。
   ★ 垂直用 state.v || state.defV（实际落地的值），这样显示的才是眼睛看到的位置。 */
function stateText(state) {
  if (!state) return '';
  if (state.mixed) return '多张不一致';
  const cell = gridCellFor(state.h, state.v || state.defV);
  if (cell) return cell.label;
  if (state.h) return (ALIGN_BY_KEY[state.h] || {}).label || '';
  if (state.v) return (VALIGN_BY_KEY[state.v] || {}).label || '';
  return '跟随默认';
}


/* ══════════════════════════════════════════════════════════ 设置面板 */

class CanvasNodeAlignSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const p = this.plugin;
    containerEl.empty();

    // 顶部状态行：让「插件到底有没有在跑」一眼就能看出来
    containerEl.createEl('p', {
      text: '插件正在运行 · v' + ((p.manifest && p.manifest.version) || '?') +
            ' · 本次加载于 ' + (p._loadedAt ? p._loadedAt.replace('T', ' ').slice(0, 19) : '未知'),
      cls: 'setting-item-description'
    });

    containerEl.createEl('h3', { text: '各处文字的默认对齐（水平）' });
    containerEl.createEl('p', {
      text: '这里管的是「没有单独设置过」的地方。改完立即生效，不需要重启。',
      cls: 'setting-item-description'
    });

    TARGETS.forEach(function (t) {
      new Setting(containerEl)
        .setName(t.label)
        .setDesc(t.hint)
        .addDropdown(function (dd) {
          // 「卡片内嵌笔记的正文」多一个「跟随卡片」选项
          if (t.key === 'note') dd.addOption('inherit', '跟随卡片');
          // ★ 内嵌进来的笔记是真 Markdown（段落会折行），所以那一项保留两端对齐；
          //   卡片正文和三种标签都是短句 / 单行，只有左中右。详见 ALIGNS 注释。
          (t.key === 'note' ? NOTE_ALIGNS : ALIGNS).forEach(function (a) {
            dd.addOption(a.key, a.label);
          });
          dd.setValue(p.settings.defaults[t.key] || DEFAULT_SETTINGS.defaults[t.key]);
          dd.onChange(async function (v) {
            p.settings.defaults[t.key] = v;
            p.applyDefaults();
            await p.saveSettings();
          });
        });
    });

    containerEl.createEl('h3', { text: '卡片的默认垂直位置' });
    containerEl.createEl('p', {
      text: '只有「卡片正文」需要垂直方向 —— 文件名标签、分组标签、连线标签都是单行，' +
            '高度本来就贴着文字，没有可移动的余量。',
      cls: 'setting-item-description'
    });

    new Setting(containerEl)
      .setName('卡片正文')
      .setDesc('卡片比文字高出一截时，正文落在哪个高度。逐张设置时用右键卡片的' +
               '「文本对齐」九宫格，这里只是没单独设置过的卡片的默认值。')
      .addDropdown(function (dd) {
        VALIGNS.forEach(function (a) { dd.addOption(a.key, a.label); });
        dd.setValue(p.settings.cardV || DEFAULT_SETTINGS.cardV);
        dd.onChange(async function (v) {
          p.settings.cardV = v;
          // 没写垂直标记的卡片靠类名落地，改完必须整块重挂一遍
          p.reapplyAll();
          await p.saveSettings();
        });
      });

    containerEl.createEl('h3', { text: '逐张 / 逐组 / 逐条设置' });

    const tips = containerEl.createEl('div', { cls: 'setting-item-description' });
    tips.createEl('p', { text: '· 卡片正文：右键卡片 →「文本对齐」→ 九宫格（水平 × 垂直，9 种组合，另有清除）' });
    tips.createEl('p', { text: '· 文件名标签 / 分组标签 / 连线标签：右键 → 对应的标签对齐菜单' });
    tips.createEl('p', {
      text: '这些单独设置记在本插件的数据文件里，不会写进 .canvas（所以白板文件依旧是标准格式）。'
    });

    const count = p.countPerItem();
    new Setting(containerEl)
      .setName('清除所有单独设置')
      .setDesc(count ? '当前共 ' + count + ' 条单独设置。清除后全部回到上面的默认值。'
                     : '目前还没有任何单独设置。')
      .addButton(function (b) {
        b.setButtonText('清除');
        b.setWarning();
        b.onClick(async function () {
          p.settings.perItem = {};
          await p.saveSettings();
          p.reapplyAll();
          new Notice('已清除所有单独设置');
          p.settingTab.display();
        });
      });
  }
}


/* ══════════════════════════════════════════════════════════ 主体 */

module.exports = class CanvasNodeAlign extends Plugin {

  async onload() {
    await this.loadSettings();

    this.useSubmenu = canUseSubmenu();

    // ── 加载自检 ──────────────────────────────────────────────
    // 每次加载往 data.json 写一个时间戳：只要这个字段在动，就说明插件
    // 真的被 Obsidian 加载过。"设置里找不到插件"绝大多数是没关受限模式，
    // 而不是文件缺失，这个戳记能把两种情况区分开。
    const firstLoad = !this.settings._lastLoad;
    this._loadedAt = new Date().toISOString();
    this.settings._lastLoad = this._loadedAt;
    this.settings._lastVersion = (this.manifest && this.manifest.version) || '';
    this.saveSettings();

    this.applyDefaults();
    this.registerCanvasMenus();
    this.registerCommands();

    this.settingTab = new CanvasNodeAlignSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    this.registerReapplyTriggers();

    console.log('[canvas-node-align] loaded v' + this.settings._lastVersion);
    if (firstLoad) {
      new Notice('Canvas Node Align 已启动 —— 右键白板卡片即可看到对齐菜单', 6000);
    }
  }

  onunload() {
    // 把写进 body 的变量撤掉，避免禁用插件后样式还留着
    TARGETS.forEach(function (t) {
      document.body.style.removeProperty(t.cssVar);
    });
  }


  /* ─────────────────────────────────────────────── 设置存取 */

  async loadSettings() {
    const raw = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
    this.settings.defaults = Object.assign({}, DEFAULT_SETTINGS.defaults, raw.defaults || {});
    this.settings.perItem = raw.perItem || {};

    // ★ 迁移：白板侧已经没有「两端对齐」了（见 ALIGNS 注释）。老 data.json 里
    //   可能还存着 justif ——
    //     设置里的默认值不收口 ⇒ 下拉框里没有这个选项，会显示成空白；
    //     逐条记录不收口   ⇒ 自检报告里会冒出一个 UI 上根本没有的「两端对齐」。
    //   （键名以 v: 开头的是整张卡片的**垂直**位置，值域 top/middle/bottom，别碰。
    //     独立笔记的 justif 不在这里 —— 它存在笔记 frontmatter 里，归 Note Text Align 管。）
    const self = this;
    ['card', 'label', 'group', 'path'].forEach(function (k) {
      const v = self.settings.defaults[k];
      if (v && ALIGN_KEYS.indexOf(v) < 0) self.settings.defaults[k] = 'left';
    });
    Object.keys(this.settings.perItem).forEach(function (p) {
      const bucket = self.settings.perItem[p];
      Object.keys(bucket).forEach(function (k) {
        if (k.charAt(0) !== 'v' && ALIGN_KEYS.indexOf(bucket[k]) < 0) bucket[k] = 'left';
      });
    });
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  countPerItem() {
    const m = this.settings.perItem || {};
    let n = 0;
    Object.keys(m).forEach(function (k) { n += Object.keys(m[k] || {}).length; });
    return n;
  }

  // 把默认值写成 body 上的 CSS 变量（body 比 :root 更靠下，能覆盖片段里的默认值）
  applyDefaults() {
    const d = this.settings.defaults || {};
    TARGETS.forEach(function (t) {
      const v = d[t.key];
      if (v) document.body.style.setProperty(t.cssVar, v);
    });
  }

  /* ─────────────────────────────────────────────── 右键菜单 */

  registerCanvasMenus() {
    // 1. 右键单张卡片 / 分组
    this.registerEvent(
      this.app.workspace.on('canvas:node-menu', (menu, node) => {
        if (!node || !node.canvas || node.canvas.readonly) return;

        if (isTextNode(node)) {
          // ① + ② 卡片正文：「文本对齐 ▸」子菜单里的九宫格，一格同时管水平和
          //    垂直（9 种组合 + 清除）。
          if (!this.addAlignGrid(menu, this.gridState([node]),
                (cell) => this.applyGrid([node], cell))) {
            // 挂不进去（旧版本 / 系统原生菜单）⇒ 退回原来的两个文字子菜单，
            // 功能一个不少，只是没有图形化面板。
            this.addAlignGroup(menu, '卡片文字对齐 · 水平', 'align-left',
              (key) => this.applyToNodes([node], key));
            this.addVAlignGroup(menu, '卡片文字对齐 · 垂直',
              (key) => this.applyToNodesV([node], key));
          }

          // ③ 卡片文件名标签 —— 靠类名，逐张。单行文字，没有垂直方向，仍是文字菜单
          if (node.labelEl) {
            this.addAlignGroup(menu, '文件名标签对齐', 'text-cursor-input',
              (key) => this.setItemAlign(node.canvas, 'label', node, key, NLABEL_CLS));
          }
        } else if (isAlignableCard(node)) {
          // ⑦ 嵌入笔记 / 网页的卡片：内容是别人的文件，写不了标记 ⇒ 只挂类名，
          //    状态记在插件数据里（和标签那几处同一个机制）。
          //    ★ 这类卡片只有垂直一条通道（水平得往正文里写标记，写不了），
          //      所以不套九宫格，保留垂直子菜单。
          this.addVAlignGroup(menu, '卡片文字对齐 · 垂直',
            (key) => this.setItemAlign(node.canvas, 'vcard', node, key, VCARD_CLS));

          if (node.labelEl) {
            this.addAlignGroup(menu, '文件名标签对齐', 'text-cursor-input',
              (key) => this.setItemAlign(node.canvas, 'label', node, key, NLABEL_CLS));
          }
        }

        // ④ 分组标签 —— 靠类名，逐组
        if (isGroupNode(node) && node.labelEl) {
          this.addAlignGroup(menu, '分组标签对齐', 'group',
            (key) => this.setItemAlign(node.canvas, 'group', node, key, GROUP_CLS));
        }

        // 不管有没有单独设置，先把已记录的对齐重新挂一遍，
        // 免得节点刚重建过、类名还没跟上。
        this.reapplyCanvas(node.canvas);
      })
    );

    // 2. 右键多选的一堆卡片
    this.registerEvent(
      this.app.workspace.on('canvas:selection-menu', (menu, canvas) => {
        const nodes = this.textNodesOf(canvas);
        if (!nodes.length) return;
        // 多选也走九宫格：一次把 N 张卡片设成同一个位置。
        // 这 N 张当前设置不一致时不预先高亮任何一格（gridState 会给 mixed）。
        if (!this.addAlignGrid(menu, this.gridState(nodes),
              (cell) => this.applyGrid(nodes, cell),
              GRID_ITEM_TITLE + '（' + nodes.length + ' 张）')) {
          this.addAlignGroup(menu, '卡片文字对齐 · 水平（' + nodes.length + ' 张）', 'align-left',
            (key) => this.applyToNodes(nodes, key));
          this.addVAlignGroup(menu, '卡片文字对齐 · 垂直（' + nodes.length + ' 张）',
            (key) => this.applyToNodesV(nodes, key));
        }
      })
    );

    // 3. 右键连线
    this.registerEvent(
      this.app.workspace.on('canvas:edge-menu', (menu, edge) => {
        if (!edge || !edge.canvas || edge.canvas.readonly) return;
        this.addAlignGroup(menu, '连线标签对齐', 'text-cursor-input',
          (key) => this.setItemAlign(edge.canvas, 'path', edge, key, PATH_CLS));
        this.reapplyCanvas(edge.canvas);
      })
    );
  }

  /* 在菜单里加一项「文本对齐 ▸」，九宫格面板挂在它的**子菜单**里 ——
     原生菜单负责悬停弹出、贴屏幕边缘的翻转和关闭，我们只管往子菜单的
     .menu 容器里 appendChild 一个面板。

     成功返回 true；挂不进去返回 false，调用方回退成两个文字子菜单。

     ★ 三个必须守住的点（改之前先看文件头 ★★ 那段）：
       ① 只 appendChild 自己的容器，**绝不重建菜单、不重排、不隐藏**任何东西。
          「复制卡片」（Obsidian 1.9.9 起自带）、编辑、删除这些原生项和我们
          共用同一个菜单，一重建就全没了。
       ② 子菜单里必须先塞一个菜单项：Menu.showAtPosition 开头就是
          `if (0 === this.items.length) return this;` —— 空子菜单根本不显示。
          这一项被 CSS 藏掉（.cta-grid-menu 那条）。
       ③ 面板挂在 .menu 本体、不塞 .menu-scroll：show 时会 sort() 清空滚动区。 */
  addAlignGrid(menu, state, onPick, title) {
    // useSubmenu 是启动时探测的结果（canUseSubmenu 里连 sub.dom 一起验过）。
    // 不支持就整个不挂 —— 不能在菜单上留一个点了没反应的死项。
    if (!this.useSubmenu || !menu || typeof menu.addItem !== 'function') return false;
    let ok = false;
    try {
      menu.addItem(function (item) {
        item.setTitle(title || GRID_ITEM_TITLE).setIcon('layout-grid').setSection('action');
        const sub = item.setSubmenu();
        const host = sub && sub.dom;
        if (!host || typeof host.appendChild !== 'function') return;

        // ② 占位项：让 items.length > 0，否则这个子菜单不会显示。
        sub.addItem(function (i) { i.setTitle(GRID_ITEM_TITLE).setIsLabel(true); });

        // 星号那段说的「宿主 DOM」：真机上就是渲染进程的 document，
        // 借菜单容器自己的 ownerDocument 拿更稳（也省得依赖全局）。
        const doc = (host.ownerDocument) ||
          (typeof document !== 'undefined' ? document : null);
        if (!doc || typeof doc.createElement !== 'function') return;

        host.classList.add('cta-grid-menu');
        host.appendChild(buildAlignPanel({
          doc: doc,
          state: state,
          onPick: onPick,
          // 原生菜单点任意一项都会自己关掉，自绘面板不会 ⇒ 点完手动关，
          // 手感才和菜单里其它项一致。（面板在 sub.dom 里，点它不会触发
          // 菜单自己的「点外面」关闭 —— Menu.isInside 认得出来。）
          close: function () { if (typeof menu.hide === 'function') menu.hide(); }
        }));
        ok = true;
      });
    } catch (e) {
      console.error('[canvas-node-align] 九宫格子菜单没挂上，改用文字菜单', e);
      return false;
    }
    return ok;
  }

  /* 这几张卡片当前是什么状态？多张不一致时 mixed = true（不高亮任何一格）。
     ★ 垂直取「实际落地」的位置（没写标记就用设置里的默认值），
       这样高亮的是眼睛看到的那一格，而不是「未设置」这种抽象状态。
     ★ 水平用 canvasAlignKey 收口：老卡片里可能还留着 #cta-j（两端对齐已从
       白板去掉），那种卡片实际是左对齐，不收口面板会一格都不亮。 */
  gridState(nodes) {
    let h;
    let v;
    let mixed = false;
    (nodes || []).forEach((n) => {
      if (!isTextNode(n)) return;
      const nh = canvasAlignKey(readAlign(n.text));
      const nv = readVAlign(n.text);
      if (h === undefined) { h = nh; v = nv; return; }
      if (nh !== h || nv !== v) mixed = true;
    });
    return {
      h: h === undefined ? null : h,
      v: v === undefined ? null : v,
      defV: this.defaultVAlign(),
      mixed: mixed
    };
  }

  /* 九宫格点选：一次设定两个方向。
     ★ 两个方向合并成**一次存盘**。saveCanvas 会推入撤销历史，分两次存会让
       用户按两次 Ctrl+Z 才能退回一步操作 —— 「正中」这种两轴同改的格子尤其明显。 */
  applyGrid(nodes, cell) {
    let canvas = null;
    let changed = 0;

    for (const node of nodes) {
      if (!isTextNode(node)) continue;
      canvas = canvas || node.canvas;

      const before = String(node.text == null ? '' : node.text);
      let next = before;
      if (cell.clear) {
        next = stripMarks(next);                      // 两个方向一起抹掉
      } else {
        if (cell.h) next = withAlign(next, cell.h);   // 只动点到的那个方向
        if (cell.v) next = withVAlign(next, cell.v);
      }
      if (next !== before) {
        writeText(node, next);
        changed++;
      }

      // 渲染层：和 applyToNodes 一样，文字没变也必须保证类名是对的
      // （刚重渲染过、或用户手抄了标记的情况）。
      if (cell.clear) {
        this.applyCardAlign(node, null);
        this.applyCardVertical(node, this.defaultVAlign());
      } else {
        if (cell.h) this.applyCardAlign(node, cell.h);
        if (cell.v) this.applyCardVertical(node, cell.v);
      }
    }

    if (changed && canvas) saveCanvas(canvas);
    if (!changed) return;                             // 没有实际改动就不发提示

    new Notice(cell.clear
      ? '已清除 ' + changed + ' 张卡片的对齐'
      : '已设置 ' + changed + ' 张卡片：' + cell.label);
  }

  // 在菜单里加一组「水平对齐」：优先收进子菜单；当前版本没有 setSubmenu 时平铺。
  addAlignGroup(menu, title, icon, handler) {
    if (this.useSubmenu) {
      menu.addItem((item) => {
        item.setTitle(title).setIcon(icon).setSection('action');
        this.fillAlignItems(item.setSubmenu(), handler);
      });
    } else {
      this.fillAlignItems(menu, handler, title);
    }
  }

  // 在菜单里加一组「垂直对齐」。选项少（3 个），所以不接收 icon 参数。
  addVAlignGroup(menu, title, handler) {
    if (this.useSubmenu) {
      menu.addItem((item) => {
        item.setTitle(title).setIcon('arrow-up-down').setSection('action');
        this.fillVAlignItems(item.setSubmenu(), handler);
      });
    } else {
      this.fillVAlignItems(menu, handler, title);
    }
  }

  // 铺开 4 种对齐 + 1 项清除。传了 section 就顺带分组（平铺模式下才需要）。
  fillAlignItems(menu, handler, section) {
    ALIGNS.forEach((a) => {
      menu.addItem((item) => {
        item.setTitle(a.label).setIcon(a.icon);
        if (section) item.setSection(section);
        item.onClick(() => handler(a.key));
      });
    });
    menu.addItem((item) => {
      item.setTitle('清除（跟随默认）').setIcon('remove-formatting');
      if (section) item.setSection(section);
      item.onClick(() => handler(null));
    });
  }

  // 铺开 3 种垂直位置 + 1 项清除。
  fillVAlignItems(menu, handler, section) {
    VALIGNS.forEach((a) => {
      menu.addItem((item) => {
        item.setTitle(a.label).setIcon(a.icon);
        if (section) item.setSection(section);
        item.onClick(() => handler(a.key));
      });
    });
    menu.addItem((item) => {
      item.setTitle('清除（跟随默认）').setIcon('remove-formatting');
      if (section) item.setSection(section);
      item.onClick(() => handler(null));
    });
  }


  /* ─────────────────────────────────────────────── 命令面板 */

  registerCommands() {
    // 单张卡片的四种水平 + 清除
    ALIGNS.forEach((a) => {
      this.addCommand({
        id: 'align-' + a.key,
        name: '卡片文字水平：' + a.label,
        checkCallback: (checking) => {
          const nodes = this.selectedTextNodes();
          if (!nodes.length) return false;
          if (!checking) this.applyToNodes(nodes, a.key);
          return true;
        }
      });
    });

    this.addCommand({
      id: 'align-clear',
      name: '卡片文字水平：清除对齐（跟随默认）',
      checkCallback: (checking) => {
        const nodes = this.selectedTextNodes();
        if (!nodes.length) return false;
        if (!checking) this.applyToNodes(nodes, null);
        return true;
      }
    });

    // 单张卡片的三种垂直 + 清除
    VALIGNS.forEach((a) => {
      this.addCommand({
        id: 'valign-' + a.key,
        name: '卡片文字垂直：' + a.label,
        checkCallback: (checking) => {
          const nodes = this.selectedTextNodes();
          if (!nodes.length) return false;
          if (!checking) this.applyToNodesV(nodes, a.key);
          return true;
        }
      });
    });

    this.addCommand({
      id: 'valign-clear',
      name: '卡片文字垂直：清除对齐（跟随默认）',
      checkCallback: (checking) => {
        const nodes = this.selectedTextNodes();
        if (!nodes.length) return false;
        if (!checking) this.applyToNodesV(nodes, null);
        return true;
      }
    });

    // 整块白板统一
    ALIGNS.forEach((a) => {
      this.addCommand({
        id: 'canvas-all-' + a.key,
        name: '整块白板：所有卡片水平' + a.label,
        checkCallback: (checking) => {
          const view = this.activeCanvasView();
          if (!view) return false;
          if (!checking) this.applyToNodes(this.textNodesOf(view.canvas), a.key);
          return true;
        }
      });
    });

    this.addCommand({
      id: 'canvas-all-clear',
      name: '整块白板：所有卡片清除水平对齐',
      checkCallback: (checking) => {
        const view = this.activeCanvasView();
        if (!view) return false;
        if (!checking) this.applyToNodes(this.textNodesOf(view.canvas), null);
        return true;
      }
    });

    VALIGNS.forEach((a) => {
      this.addCommand({
        id: 'canvas-all-valign-' + a.key,
        name: '整块白板：所有卡片' + a.label,
        checkCallback: (checking) => {
          const view = this.activeCanvasView();
          if (!view) return false;
          if (!checking) this.applyToNodesV(this.textNodesOf(view.canvas), a.key);
          return true;
        }
      });
    });

    this.addCommand({
      id: 'canvas-all-valign-clear',
      name: '整块白板：所有卡片清除垂直对齐',
      checkCallback: (checking) => {
        const view = this.activeCanvasView();
        if (!view) return false;
        if (!checking) this.applyToNodesV(this.textNodesOf(view.canvas), null);
        return true;
      }
    });

    this.addCommand({
      id: 'align-report',
      name: '查看选中卡片的对齐状态',
      checkCallback: (checking) => {
        const nodes = this.selectedTextNodes();
        if (!nodes.length) return false;
        if (!checking) this.reportAlign(nodes);
        return true;
      }
    });

    // 自检：一条命令回答"插件到底有没有在跑、样式有没有生效"
    this.addCommand({
      id: 'align-doctor',
      name: '自检：插件状态与样式是否生效',
      callback: () => this.showDoctor()
    });
  }

  /* 自检报告。排查顺序：插件在不在 → 菜单支不支持 → 样式（CSS 变量）有没有值
     → 当前白板有多少张卡片。 */
  showDoctor() {
    const v = (this.manifest && this.manifest.version) || '?';

    // 样式是否生效：--cta-card 由插件写到 body 上，写不进去说明没走到这里
    let cssVar = '';
    try {
      cssVar = getComputedStyle(document.body).getPropertyValue('--cta-card').trim();
    } catch (e) { cssVar = ''; }

    const view = this.activeCanvasView();
    const cards = view ? this.textNodesOf(view.canvas).length : -1;

    // 真挂了运行时类名的卡片有几张（整个渲染机制就是靠它，必须能看到）
    let cardCls = -1;
    let vCls = -1;
    if (view && view.canvas && view.canvas.nodes && typeof view.canvas.nodes.forEach === 'function') {
      cardCls = 0;
      vCls = 0;
      view.canvas.nodes.forEach((n) => {
        if (!n || !n.nodeEl) return;
        if (readAlignClass(n.nodeEl, [CARD_CLS])) cardCls++;
        if (readAlignClass(n.nodeEl, [VCARD_CLS])) vCls++;
      });
    }

    const lines = [
      'Canvas Node Align v' + v + ' —— 插件正在运行',
      '本次加载：' + (this._loadedAt || '未知'),
      '右键子菜单：' + (this.useSubmenu ? '支持' : '不支持，已回退平铺菜单'),
      '--cta-card 变量：' + (cssVar ? '"' + cssVar + '"（样式已生效）' : '（空，样式没生效）'),
      '当前白板文本卡：' + (cards < 0 ? '不在白板视图' : cards + ' 张'),
      '其中已挂水平类名：' + (cardCls < 0 ? '不在白板视图' : cardCls + ' 张'),
      '其中已挂垂直类名：' + (vCls < 0 ? '不在白板视图' : vCls + ' 张'),
      '卡片默认垂直位置：' + (this.settings.cardV || DEFAULT_SETTINGS.cardV),
      '水平对齐可选值：' + ALIGN_KEYS.join(' / ') +
        '（另有 justify，只用于「卡片内嵌笔记的正文」这个设置项）',
      '各位置默认水平对齐：' + TARGETS.map(function (t) {
        return t.label + ' ' + (this.settings.defaults[t.key] || '-');
      }, this).join(' · '),
      '单独设置过的条目：' + this.countPerItem() + ' 个'
    ];

    new Notice(lines.join('\n'), 12000);
    console.log('[canvas-node-align] ' + lines.join(' | '));
  }


  /* ─────────────────────────────────────────────── 取对象 */

  // 当前活动叶。activeLeaf 是旧接口，新版推荐 getMostRecentLeaf()，
  // 两条都试一下，避免某个版本上拿到 null 导致命令从面板里消失。
  activeLeafSafe() {
    const ws = this.app.workspace;
    let leaf = ws.activeLeaf;
    if (!leaf && typeof ws.getMostRecentLeaf === 'function') {
      leaf = ws.getMostRecentLeaf();
    }
    return leaf || null;
  }

  activeCanvasView() {
    const leaf = this.activeLeafSafe();
    const view = leaf && leaf.view;
    if (!view || typeof view.getViewType !== 'function') return null;
    return view.getViewType() === 'canvas' ? view : null;
  }

  textNodesOf(canvas) {
    if (!canvas || !canvas.nodes) return [];
    const out = [];
    canvas.nodes.forEach((n) => { if (isTextNode(n)) out.push(n); });
    return out;
  }

  selectedTextNodes() {
    const view = this.activeCanvasView();
    if (!view) return [];
    return this.textNodesOf(view.canvas).filter((n) => view.canvas.selection.has(n));
  }


  /* ─────────────────────────────────────────────── 卡片正文（标记法） */

  applyToNodes(nodes, mode) {
    let changed = 0;
    let canvas = null;

    for (const node of nodes) {
      if (!isTextNode(node)) continue;
      canvas = canvas || node.canvas;

      // ① 持久层：把标记写进卡片文字。
      //    它是"数据"，换电脑、临时禁用插件、只用 CSS 片段时都靠它还原。
      //    ★ withAlign 只动水平标记，垂直标记原样保留。
      const before = String(node.text == null ? '' : node.text);
      const after = withAlign(before, mode);
      if (after !== before) {
        writeText(node, after);
        changed++;
      }

      // ② 渲染层：给卡片元素挂 / 摘类名，CSS 直接靠类名生效。
      //    ★ 这里不能跟着 changed 一起 continue：文字已经是目标对齐、
      //      但元素上的类名还没挂上时（例如刚重渲染过、或用户手抄了标记），
      //      必须补上，否则"数据对了可字没动"。
      this.applyCardAlign(node, mode);
    }

    if (changed && canvas) saveCanvas(canvas);
    if (!changed) return;                  // 没有实际改动就不发提示、不写撤销历史

    const name = mode ? (ALIGN_BY_KEY[mode] || {}).label || mode : '默认';
    new Notice('已设置 ' + changed + ' 张卡片的水平对齐：' + name);
  }

  /* 垂直方向。和 applyToNodes 完全对称，只是换成垂直标记、垂直类名。 */
  applyToNodesV(nodes, mode) {
    let changed = 0;
    let canvas = null;

    for (const node of nodes) {
      if (!isTextNode(node)) continue;
      canvas = canvas || node.canvas;

      const before = String(node.text == null ? '' : node.text);
      const after = withVAlign(before, mode);
      if (after !== before) {
        writeText(node, after);
        changed++;
      }

      // 清除时回落到设置里的默认位置，而不是摘掉类名 —— 摘掉后卡片会回到
      // 「无类名」状态，而默认值不是 top 时就会显示错。统一由这里兜底。
      this.applyCardVertical(node, mode || this.defaultVAlign());
    }

    if (changed && canvas) saveCanvas(canvas);
    if (!changed) return;

    const name = mode ? (VALIGN_BY_KEY[mode] || {}).label || mode
                      : '默认（' + this.defaultVAlign() + '）';
    new Notice('已设置 ' + changed + ' 张卡片的垂直位置：' + name);
  }

  defaultVAlign() {
    return this.settings.cardV || DEFAULT_SETTINGS.cardV;
  }

  // 把卡片元素上的水平类名设成 align（传 null / undefined 表示摘掉）。
  // 类名挂在 node.nodeEl（即 .canvas-node）上，而不是 .canvas-node-content：
  // nodeEl 在节点构造时就存在，比"等内容元素渲染出来"可靠，且内容重渲染后不会丢。
  applyCardAlign(node, align) {
    return this.applyNodeClass(node, CARD_CLS, align);
  }

  // 垂直方向同理，只是换一个前缀，两个方向各挂各的、互不覆盖。
  applyCardVertical(node, valign) {
    return this.applyNodeClass(node, VCARD_CLS, valign);
  }

  applyNodeClass(node, prefix, value) {
    const el = node && node.nodeEl;
    if (!el || !el.classList) return false;

    const want = value || null;
    if (readAlignClass(el, [prefix]) === want) return true;   // 已经一致，不动 DOM

    clearAlignClasses(el, [prefix]);
    if (want) el.classList.add(prefix + want);
    return true;
  }

  reportAlign(nodes) {
    const tally = {};
    for (const node of nodes) {
      if (!isTextNode(node)) continue;
      const k = readAlign(node.text);
      const vk = readVAlign(node.text);
      const label = (k ? (ALIGN_BY_KEY[k] || {}).label : '未设置') + ' × ' +
                    (vk ? (VALIGN_BY_KEY[vk] || {}).label : '未设置');
      tally[label] = (tally[label] || 0) + 1;
    }
    const parts = Object.keys(tally).filter((k) => tally[k]).map((k) => k + ' × ' + tally[k]);
    new Notice(parts.length ? parts.join('，') : '没有文本卡');
  }


  /* ─────────────────────────────────────────────── 标签类（类名法） */

  // kind: 'group' | 'path' | 'label' | 'vcard'
  //   vcard = 整张卡片的垂直位置（只用于写不了标记的卡片：嵌入笔记 / 网页）
  itemKey(kind, obj) {
    const id = (obj && obj.getData && obj.getData().id) || (obj && obj.id);
    if (!id) return null;
    const tag = kind === 'path' ? 'e'
              : kind === 'group' ? 'g'
              : kind === 'vcard' ? 'v'
              : 'n';
    return tag + ':' + id;
  }

  // 从对象里取到「要挂类名的那个元素」
  labelElOf(canvas, kind, obj) {
    if (kind === 'path') {
      const le = obj && obj.labelElement;
      return (le && le.textareaEl) || null;
    }
    if (kind === 'vcard') return (obj && obj.nodeEl) || null;   // 整张卡片（.canvas-node）
    return (obj && obj.labelEl) || null;   // 分组 → .canvas-group-label；卡片 → .canvas-node-label
  }

  setItemAlign(canvas, kind, obj, align, prefix) {
    const key = this.itemKey(kind, obj);
    const path = canvasPath(canvas);
    if (!key || !path) return;

    const bucket = this.settings.perItem[path] || (this.settings.perItem[path] = {});
    if (align) bucket[key] = align;
    else delete bucket[key];
    if (!Object.keys(bucket).length) delete this.settings.perItem[path];
    this.saveSettings();

    this.applyOne(canvas, kind, obj, align, prefix);

    const byKey = kind === 'vcard' ? VALIGN_BY_KEY : ALIGN_BY_KEY;
    const name = align ? (byKey[align] || {}).label || align : '默认';
    new Notice(kind === 'group' ? '分组标签已设为：' + name
             : kind === 'path'  ? '连线标签已设为：' + name
             : kind === 'vcard' ? '卡片垂直位置已设为：' + name
                                : '文件名标签已设为：' + name);
  }

  applyOne(canvas, kind, obj, align, prefix) {
    const el = this.labelElOf(canvas, kind, obj);
    if (!el) return false;
    clearAlignClasses(el, [prefix]);
    // 标签只有左/中/右（两端对齐在单行文字上永远不生效）。老 data.json 里可能
    // 还存着 justif，不收口会挂上一个 CSS 里已经不存在的类名。
    const key = kind === 'vcard' ? align : canvasAlignKey(align);
    if (key) el.classList.add(prefix + key);
    return true;
  }

  // 把某个白板里所有记录过的对齐重新挂一遍
  reapplyCanvas(canvas) {
    if (!canvas) return;

    // 卡片正文：对齐记在卡片文字里，所以每张文本卡都要读一遍再挂类名。
    // 切换标签、缩放重排都会重建 DOM 并丢掉运行时类名，这一步是恢复的关键。
    // ★ 必须在 canvasPath 早退之前做 —— 拿不到文件路径（比如未保存的板）也要能恢复。
    this.reapplyCards(canvas);

    const path = canvasPath(canvas);
    if (!path) return;
    const bucket = this.settings.perItem[path];
    if (!bucket) return;

    Object.keys(bucket).forEach((key) => {
      const align = bucket[key];
      const head = key.charAt(0);
      const kind = head === 'e' ? 'path'
                 : head === 'g' ? 'group'
                 : head === 'v' ? 'vcard'
                 : 'label';
      const id = key.slice(2);
      const obj = this.findObj(canvas, kind, id);
      if (!obj) return;
      // 'v' 是整张卡片的垂直位置。文本卡的垂直由标记负责（上面 reapplyCards
      // 已经处理过），这里只认非文本卡，免得两条路互相打架。
      if (kind === 'vcard' && isTextNode(obj)) return;
      const prefix = kind === 'path' ? PATH_CLS
                   : kind === 'group' ? GROUP_CLS
                   : kind === 'vcard' ? VCARD_CLS
                   : NLABEL_CLS;
      this.applyOne(canvas, kind, obj, align, prefix);
    });
  }

  // 逐张读卡片文字里的标记，把两个方向的类名都重新挂上。
  // 手抄标记的卡片也一并照顾到。
  reapplyCards(canvas) {
    if (!canvas || !canvas.nodes || typeof canvas.nodes.forEach !== 'function') return;
    const defV = this.defaultVAlign();
    canvas.nodes.forEach((node) => {
      if (!isTextNode(node)) return;
      const data = (node.getData && node.getData()) || {};
      this.applyCardAlign(node, readAlign(data.text));
      // 垂直：没写标记就用设置里的默认值。默认值顶层是 top（等于原生表现），
      // 所以这一步对没动过垂直的卡片是无副作用的；但用户一旦把默认改成
      // 「垂直居中」，所有没单独设置过的卡片都要跟着动，就得靠这里。
      this.applyCardVertical(node, readVAlign(data.text) || defV);
    });
  }

  findObj(canvas, kind, id) {
    const map = kind === 'path' ? canvas.edges : canvas.nodes;
    if (!map) return null;
    if (map.get) {
      const hit = map.get(id);
      if (hit) return hit;
    }
    // Map.get 万一改了名，退化成遍历
    let found = null;
    map.forEach((v, k) => {
      if (found) return;
      const vid = (v && v.getData && v.getData().id) || (v && v.id) || k;
      if (vid === id) found = v;
    });
    return found;
  }

  reapplyAll() {
    this.app.workspace.getLeavesOfType('canvas').forEach((leaf) => {
      const view = leaf.view;
      if (view && view.canvas) this.reapplyCanvas(view.canvas);
    });
  }


  /* ─────────────────────────────────────────────── 重新挂类名的时机 */

  registerReapplyTriggers() {
    // 切换 / 打开白板后重新应用（DOM 重建会丢掉运行时类名）
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => this.scheduleReapply())
    );
    this.registerEvent(
      this.app.workspace.on('layout-change', () => this.scheduleReapply())
    );

    // 白板内部增删节点时也要跟上（节点重建会丢掉运行时类名）
    this.observed = new WeakSet();
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => this.observeActive())
    );
    this.scheduleReapply();
  }

  // 白板内部增删节点时也要跟上。
  // ★ 这里**不能**再用 countPerItem() 当闸门：卡片正文的对齐记在卡片文字里、
  //   不进 settings.perItem，所以"没有逐项设置"的白板同样需要恢复类名。
  //   代价已经压到很低：重挂时逐张比对类名，一致就完全不碰 DOM；
  //   而且观察器不看 attributes，我们挂类名不会反过来触发它。
  scheduleReapply() {
    if (this._reapplyTimer) window.clearTimeout(this._reapplyTimer);
    this._reapplyTimer = window.setTimeout(() => this.reapplyAll(), 200);
  }

  observeActive() {
    const view = this.activeCanvasView();
    if (!view) return;
    const wrapper = view.containerEl && view.containerEl.querySelector('.canvas-wrapper');
    if (!wrapper || this.observed.has(wrapper)) return;

    const mo = new MutationObserver(() => this.scheduleReapply());
    mo.observe(wrapper, { childList: true, subtree: true });
    this.observed.add(wrapper);
    this.register(() => mo.disconnect());
  }
};


/* ══════════════════════════════════════════════════════════ 九宫格面板（DOM） */

// 建一个元素。面板里没有富文本，纯 DOM 比 innerHTML 稳（也不用担心卡片里的
// <span> 标记被当成 HTML 解析）。
function mkEl(doc, tag, cls, text) {
  const el = doc.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}

/* 九宫格面板本体。挂在「文本对齐 ▸」的**子菜单容器**（sub.dom）里 ——
   子菜单和原生项各在各的容器，我们只 appendChild 自己这一个 div，
   不新建菜单、不重排、不隐藏任何东西（见文件头 ★★ 那段）。

   结构（4 组，组间一条细线）：
     九宫格 3×3                        ← 左上 … 右下，正中 = 两个居中一起
     行标「两端」+ 顶部 / 中部 / 底部     ← 两端对齐 × 三个垂直位置
     行标「居中」+ 仅水平 / 仅垂直        ← 只改一个方向
     清除                              ← 两个方向一起回默认
   每格 = 小图示（两条短线）+ 短标签，没有别的文字。 */
function buildAlignPanel(opts) {
  const doc = opts.doc || document;
  const state = opts.state || {};
  const panel = mkEl(doc, 'div', 'cta-grid');

  const head = mkEl(doc, 'div', 'cta-grid-head');
  // 标题是可选的：放在子菜单里时，菜单项自己写着「文本对齐」，面板里再写一遍
  // 纯属占地方（用户要求简洁），所以调用方不传就没有。
  if (opts.title) head.appendChild(mkEl(doc, 'span', 'cta-grid-title', opts.title));
  head.appendChild(mkEl(doc, 'span', 'cta-grid-state', stateText(state)));
  panel.appendChild(head);

  ALIGN_GRID_ROWS.forEach(function (row) {
    if (row.divider) panel.appendChild(mkEl(doc, 'div', 'cta-grid-line'));

    const line = mkEl(doc, 'div', 'cta-grid-row');
    line.appendChild(mkEl(doc, 'div', 'cta-grid-rowhead', row.label || ''));

    const box = mkEl(doc, 'div', 'cta-grid-cells cta-cols-' + row.cells.length);
    row.cells.forEach(function (cell) {
      const el = mkEl(doc, 'div', 'cta-grid-cell');

      if (cell.clear) {
        el.classList.add('is-wide');
        el.appendChild(mkEl(doc, 'span', null, cell.label));
      } else {
        const glyph = mkEl(doc, 'div', 'cta-glyph');
        glyphBars(cell.h, cell.v).forEach(function (b) {
          const bar = mkEl(doc, 'i');
          bar.style.left = b[0] + 'px';
          bar.style.top = b[1] + 'px';
          bar.style.width = b[2] + 'px';
          glyph.appendChild(bar);
        });
        el.appendChild(glyph);
        el.appendChild(mkEl(doc, 'span', null, cell.label));
      }

      // 当前生效的那一格高亮。多选且互不一致时哪个都不亮。
      if (isCellOn(cell, state)) el.classList.add('is-on');

      el.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof opts.onPick === 'function') opts.onPick(cell);
        if (typeof opts.close === 'function') opts.close();
      });
      box.appendChild(el);
    });

    line.appendChild(box);
    panel.appendChild(line);
  });

  return panel;
}

// 这一格是不是「当前生效」的那一格？
function isCellOn(cell, state) {
  if (!state || state.mixed) return false;
  if (cell.clear) return !state.h && !state.v;      // 两根轴都没单独设置过
  if (!state.h) return false;                       // 水平没设过 ⇒ 九宫格没有对应格
  return cell.h === state.h && cell.v === (state.v || state.defV);
}


/* ══════════════════════════════════════════════════════════ 兼容性封装 */

/* 这台 Obsidian 支不支持「菜单项挂自绘子菜单」？不支持的版本上九宫格整块不挂、
   回退成文字子菜单，否则会在菜单里留一个点了没反应的死项。

   探针是**真的** new 一个 Menu 加一项试，不是看版本号 —— 版本号猜不准。
   探针菜单从不 show，所以没有副作用（Menu 的 scope 是在 onload 里才注册的）。
   ★ 连 sub.dom 一起验：只要 setSubmenu 存在它就一定在（app.js 里 Menu 的
     dom 是构造函数里建的），但万一哪版变了，这里能提前发现并整块回退。 */
function canUseSubmenu() {
  try {
    const probe = new Menu();
    let ok = false;
    probe.addItem(function (item) {
      if (typeof item.setSubmenu !== 'function') return;
      const sub = item.setSubmenu();
      ok = !!(sub && sub.dom && typeof sub.dom.appendChild === 'function');
    });
    return ok;
  } catch (e) {
    return false;
  }
}

// 是不是文本卡？（file / link / group 节点没有 text）
function isTextNode(node) {
  if (!node || typeof node.getData !== 'function') return false;
  try {
    return node.getData().type === 'text';
  } catch (e) {
    return false;
  }
}

// 是不是分组？
function isGroupNode(node) {
  if (!node || typeof node.getData !== 'function') return false;
  try {
    return node.getData().type === 'group';
  } catch (e) {
    return false;
  }
}

// 「不是文本卡、也不是分组」的普通卡片（嵌入笔记 / 网页 / 图片…）。
// 这类卡片的内容是别人的文件，不能往里写标记，所以垂直对齐改走运行时类名。
function isAlignableCard(node) {
  if (!node || typeof node.getData !== 'function') return false;
  try {
    const t = node.getData().type;
    return t !== 'group' && t !== 'text';
  } catch (e) {
    return false;
  }
}

// canvas 对应的文件路径，用作 perItem 的一级键
function canvasPath(canvas) {
  if (!canvas) return null;
  const view = canvas.view;
  if (view && view.file && view.file.path) return view.file.path;
  if (canvas.file && canvas.file.path) return canvas.file.path;
  return null;
}

// 写回卡片文字。优先用内部的 setText（会同步给已渲染内容）；
// 万一将来改了方法名，退回 setData / 直接赋值。
function writeText(node, text) {
  if (typeof node.setText === 'function') {
    node.setText(text);
    return true;
  }
  if (typeof node.setData === 'function' && typeof node.getData === 'function') {
    const data = node.getData();
    data.text = text;
    node.setData(data);
    return true;
  }
  node.text = text;
  return true;
}

// 存盘。canvas.requestSave() 是内部方法，默认参数会推入撤销历史。
function saveCanvas(canvas) {
  if (!canvas) return;
  if (typeof canvas.requestSave === 'function') canvas.requestSave();
  else if (canvas.view && typeof canvas.view.requestSave === 'function') canvas.view.requestSave();
}


/* ══════════════════════════════════════════════════════════ 导出纯函数供单测
   （Obsidian 环境里 module.exports 是插件类，这里只在 Node 下补充挂载） */
module.exports.__pure = {
  readAlign, readVAlign, stripMarks, withAlign, withVAlign,
  clearAlignClasses, readAlignClass, canvasAlignKey,
  // 白板侧只有左/中/右；justify 只用于「卡片内嵌笔记的正文」那一项（见 ALIGNS 注释）
  ALIGN_KEYS, NOTE_ALIGNS, JUSTIFY_ALIGN,
  // 九宫格（2.3.0）：模型 + 小图示几何 + 状态文字，都是纯函数
  glyphBars, gridCellFor, stateText, ALIGN_GRID_ROWS,
  GLYPH_W, GLYPH_H, GLYPH_BAR, GRID_ITEM_TITLE
};

/* 面板的 DOM 构造单独导出给单测 —— 这块只能在真机的原生菜单里跑，
   单测用极简 DOM 替身把结构（12 格 / 每组线数 / 高亮唯一 / 点完关菜单）钉住，
   免得改坏了要开着 Obsidian 靠眼睛找。 */
module.exports.__dom = { buildAlignPanel, isCellOn, mkEl };
