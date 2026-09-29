'use strict';

/* ============================================================================
   Canvas Node Align —— 白板与笔记的文字对齐
   Canvas Node Align — text alignment for Canvas cards and Markdown notes
   ----------------------------------------------------------------------------
   设计原则：插件只负责「写字 / 挂类名」，渲染一律交给 CSS。

   ★ 对齐有两个方向，互相独立，可任意组合（4 × 3 = 12 种）：
       水平  →  text-align，left | center | right | justify
       垂直  →  由弹性占位块决定，top | middle | bottom
     两个方向各记各的标记、各挂各的类名，互不干扰。

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
     另外还给 Markdown 笔记正文提供水平对齐（原生没有此功能）。

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
     app.fileManager.processFrontMatter(file, fm => ...)
   ============================================================================ */

const { Plugin, PluginSettingTab, Setting, Notice, Menu } = require('obsidian');


/* ══════════════════════════════════════════════════════════ 常量表 */

// 四个水平对齐。letter 用于卡片里的标记，cls 用于运行时挂的类名后缀。
const ALIGNS = [
  { key: 'left',    letter: 'l', label: '左对齐',   icon: 'align-left' },
  { key: 'center',  letter: 'c', label: '居中',     icon: 'align-center' },
  { key: 'right',   letter: 'r', label: '右对齐',   icon: 'align-right' },
  { key: 'justify', letter: 'j', label: '两端对齐', icon: 'align-justify' }
];
const ALIGN_KEYS = ALIGNS.map(function (a) { return a.key; });
const ALIGN_BY_KEY = {};
ALIGNS.forEach(function (a) { ALIGN_BY_KEY[a.key] = a; });

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
// cardV = 没写垂直标记的卡片统一用哪个垂直位置；justifyLast = 见设置面板说明。
const DEFAULT_SETTINGS = {
  defaults: { card: 'left', note: 'inherit', label: 'left', group: 'center', path: 'center' },
  cardV: 'top',
  justifyLast: false,
  perItem: {}   // { "<canvas路径>": { "g:<nodeId>":"center", "e:<edgeId>":"right",
                //                    "n:<nodeId>":"left",   "v:<nodeId>":"middle" } }
};

// 运行时挂的类名前缀（CSS 里一一对应）
const CARD_CLS   = 'cta-card-';    // 水平，挂在卡片元素（.canvas-node）上
const VCARD_CLS  = 'cta-v-';       // 垂直，同样挂在 .canvas-node 上
const GROUP_CLS  = 'cta-group-';
const PATH_CLS   = 'cta-path-';
const NLABEL_CLS = 'cta-nlabel-';

// 「两端对齐时最后一行也拉满」打开时，挂在 body 上的类名
const JUSTIFY_LAST_CLS = 'cta-justify-last';

// 笔记正文对齐用的 frontmatter 类名前缀
const NOTE_CLS = 'cta-note-';


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

const LETTER2KEY = { l: 'left', c: 'center', r: 'right', j: 'justify' };
const VLETTER2KEY = { t: 'top', m: 'middle', b: 'bottom' };

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

/* ---------- C. 笔记 frontmatter 的 cssclasses 处理 ---------- */

// cssclasses 可能是字符串、数组或不存在，统一成数组。
function toArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v.slice() : [v];
}

// 计算「设置成 mode 后」的 cssclasses 数组；mode 为 null 表示只清除。
// 保留用户自己写的其它类名，只增删 cta-note-* 前缀的那些。
function mergeNoteClass(current, mode) {
  const kept = toArray(current).filter(function (c) {
    return String(c).indexOf(NOTE_CLS) !== 0;
  });
  if (mode) kept.push(NOTE_CLS + mode);
  return kept;
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
          ALIGNS.forEach(function (a) { dd.addOption(a.key, a.label); });
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
      .setDesc('卡片比文字高出一截时，正文落在哪个高度。逐张设置时用右键菜单 →' +
               '「卡片文字对齐 · 垂直」，这里只是没单独设置过的卡片的默认值。')
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

    containerEl.createEl('h3', { text: '两端对齐的细节' });

    new Setting(containerEl)
      .setName('两端对齐时，最后一行也拉满')
      .setDesc('按排版规范，两端对齐**不拉伸最后一行**。中文短句常常只有一行，' +
               '于是设了两端对齐看起来和左对齐一模一样 —— 不是没生效，是没有可拉伸的行。' +
               '打开这个开关就会连最后一行一起拉满，短句也能立刻看出差别。' +
               '（英文长段落默认效果已经很明显，一般不用开。）')
      .addToggle(function (tg) {
        tg.setValue(!!p.settings.justifyLast);
        tg.onChange(async function (v) {
          p.settings.justifyLast = v;
          p.applyBodyClasses();
          await p.saveSettings();
        });
      });

    containerEl.createEl('h3', { text: '逐张 / 逐组 / 逐条设置' });

    const tips = containerEl.createEl('div', { cls: 'setting-item-description' });
    tips.createEl('p', { text: '· 卡片正文水平 / 垂直：右键卡片 →「卡片文字对齐 · 水平 / 垂直」' });
    tips.createEl('p', { text: '· 分组标签 / 连线标签 / 文件名标签：右键 →「标签对齐」' });
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
    this.applyBodyClasses();
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
    document.body.classList.remove(JUSTIFY_LAST_CLS);
  }


  /* ─────────────────────────────────────────────── 设置存取 */

  async loadSettings() {
    const raw = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
    this.settings.defaults = Object.assign({}, DEFAULT_SETTINGS.defaults, raw.defaults || {});
    this.settings.perItem = raw.perItem || {};
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

  // 挂在 body 上的开关类名。目前只有一个：两端对齐是否拉满最后一行。
  // 用 body 类名而不是逐个卡片挂，是因为这是「全局排版口味」，不是逐张设置。
  applyBodyClasses() {
    document.body.classList.toggle(JUSTIFY_LAST_CLS, !!this.settings.justifyLast);
  }


  /* ─────────────────────────────────────────────── 右键菜单 */

  registerCanvasMenus() {
    // 1. 右键单张卡片 / 分组
    this.registerEvent(
      this.app.workspace.on('canvas:node-menu', (menu, node) => {
        if (!node || !node.canvas || node.canvas.readonly) return;

        if (isTextNode(node)) {
          // ① 卡片正文水平 —— 靠标记，逐张
          this.addAlignGroup(menu, '卡片文字对齐 · 水平', 'align-left',
            (key) => this.applyToNodes([node], key));
          // 垂直同理，另一个标记、另一条路
          this.addVAlignGroup(menu, '卡片文字对齐 · 垂直',
            (key) => this.applyToNodesV([node], key));

          // ③ 卡片文件名标签 —— 靠类名，逐张
          if (node.labelEl) {
            this.addAlignGroup(menu, '文件名标签对齐', 'text-cursor-input',
              (key) => this.setItemAlign(node.canvas, 'label', node, key, NLABEL_CLS));
          }
        } else if (isAlignableCard(node)) {
          // ⑦ 嵌入笔记 / 网页的卡片：内容是别人的文件，写不了标记 ⇒ 只挂类名，
          //    状态记在插件数据里（和标签那几处同一个机制）。
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
        this.addAlignGroup(menu, '卡片文字对齐 · 水平（' + nodes.length + ' 张）', 'align-left',
          (key) => this.applyToNodes(nodes, key));
        this.addVAlignGroup(menu, '卡片文字对齐 · 垂直（' + nodes.length + ' 张）',
          (key) => this.applyToNodesV(nodes, key));
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

    // 笔记正文对齐（只有水平 —— 整篇笔记的垂直居中意义不大，而且长文会很怪）
    ALIGNS.forEach((a) => {
      this.addCommand({
        id: 'note-' + a.key,
        name: '笔记正文：' + a.label,
        checkCallback: (checking) => {
          const file = this.activeMarkdownFile();
          if (!file) return false;
          if (!checking) this.setNoteAlign(file, a.key);
          return true;
        }
      });
    });

    this.addCommand({
      id: 'note-clear',
      name: '笔记正文：清除对齐（恢复默认）',
      checkCallback: (checking) => {
        const file = this.activeMarkdownFile();
        if (!file) return false;
        if (!checking) this.setNoteAlign(file, null);
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
      '两端对齐拉满末行：' + (this.settings.justifyLast ? '已开启' : '关闭'),
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

  activeMarkdownFile() {
    const leaf = this.activeLeafSafe();
    const view = leaf && leaf.view;
    if (!view || typeof view.getViewType !== 'function') return null;
    if (view.getViewType() !== 'markdown') return null;
    return view.file || null;
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
    if (align) el.classList.add(prefix + align);
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


  /* ─────────────────────────────────────────────── 笔记正文对齐 */

  async setNoteAlign(file, mode) {
    let applied = null;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      const next = mergeNoteClass(fm.cssclasses, mode);
      if (next.length) fm.cssclasses = next;
      else delete fm.cssclasses;
      applied = mode;
    });
    const name = mode ? (ALIGN_BY_KEY[mode] || {}).label || mode : '默认（左）';
    new Notice('笔记正文对齐已设为：' + name);
    void applied;
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


/* ══════════════════════════════════════════════════════════ 兼容性封装 */

// 当前 Obsidian 支不支持给菜单项加子菜单（MenuItem.setSubmenu）。
// 拿一个临时菜单探一下即可，避免在不支持的版本上直接报错。
function canUseSubmenu() {
  try {
    const probe = new Menu();
    let ok = false;
    probe.addItem(function (item) {
      ok = typeof item.setSubmenu === 'function';
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
  clearAlignClasses, readAlignClass, toArray, mergeNoteClass
};
