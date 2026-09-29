# Canvas Node Align（白板与笔记的文字对齐）

给白板的卡片正文、分组标签、连线标签、文件卡片标签加上文字对齐，顺带把 Markdown 笔记正文的对齐也补上。

Canvas 原生**没有任何文字对齐设置**。右键菜单里的"对齐 / 分布"是**排列卡片**（把方块摆整齐），和"字往哪边靠"完全是两回事。本插件就是补这个空缺。

## 覆盖范围

| # | 文字在哪 | 怎么设 | 存在哪 |
|---|---|---|---|
| 1 | 卡片正文（文本卡） | 右键卡片，**逐张** | 卡片自己的文字里 |
| 2 | 卡片内嵌笔记的正文 | 设置面板（全局） | 插件设置 |
| 3 | 卡片文件名标签 | 右键卡片，**逐张** | 插件数据 |
| 4 | 分组标签 | 右键分组，**逐组** | 插件数据 |
| 5 | 连线标签 | 右键连线，**逐条** | 插件数据 |
| 6 | 卡片内的 callout / 标题 / 代码块 | 跟随 #1 | — |

另外还支持 **Markdown 笔记正文**的左 / 中 / 右 / 两端对齐（原生同样没有），写法是往笔记的 `cssclasses` 里加一个类名，随时可撤销。

还附带一条命令：**一键把当前白板的全部卡片设成同一对齐**。

## 安装

### 手动
1. 从 Release 下载 `main.js`、`manifest.json`、`styles.css`
2. 放进 `<你的库>/.obsidian/plugins/canvas-node-align/`
3. 重启后到 设置 → 第三方插件 里启用

### BRAT
在 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 里添加 `jiangbianyan-gif/obsidian-canvas-node-align`。

> 尚未上架官方插件市场，正在 [community.obsidian.md](https://community.obsidian.md) 审核中。

### 环境要求
Obsidian **1.5.0** 及以上；开发与验证环境为 **1.13.7**。

## 用法

### 卡片正文（逐张）
右键卡片 → **卡片文字对齐** → 选 左对齐 / 居中 / 右对齐 / 两端对齐 / 清除。

原理是在卡片第一行的末尾插一段普通文本标记：

```
模型变换<span class="cta-c"></span>
```

四种标记、两种写法都认：

| 标记 | 标签写法 | 效果 |
|---|---|---|
| `<span class="cta-l"></span>` | `#cta-l` | 左对齐 |
| `<span class="cta-c"></span>` | `#cta-c` | 居中 |
| `<span class="cta-r"></span>` | `#cta-r` | 右对齐 |
| `<span class="cta-j"></span>` | `#cta-j` | 两端对齐 |

也可以**自己手写**——插件只是个方便的输入器。

标记一律加在**第一行末尾**，不能加在行首：行首插 HTML 会把 `- 列表`、`# 标题` 这类块级语法打断。

### 分组 / 连线 / 文件名标签（逐项）
右键分组（或连线、或文件卡片）→ **…标签对齐** → 选对齐方式。

这三处**用不了文字标记**：Obsidian 是用 `setText()` / `textContent` 渲染它们的，塞 HTML 进去会原样显示出乱码。插件改成运行时给元素挂类名，并把选择记在自己的数据文件里。

**代价**：因为不写进 `.canvas`，禁用插件后这三项的对齐会失效。卡片正文（#1）没有这个问题。

### 整块白板统一
命令面板 → **整块白板：所有卡片居中**（另有三种），或 **整块白板：所有卡片清除对齐**。

### 笔记正文
命令面板 → **笔记正文：居中** / 右对齐 / 两端对齐 / 清除对齐。

会往笔记 frontmatter 写 `cssclasses: [cta-note-center]`，已有的 `cssclasses` 会保留。想还原就执行"清除对齐"。实时预览下语法标记会跟着文字一起动，阅读视图最干净。

### 设置
设置 → Canvas Node Align。五个下拉决定各处"没有单独设置过"时的默认值；另有"清除所有单独设置"按钮。

## 为什么不污染画布文件

不少 Canvas 增强插件会往 `.canvas` 里写私有字段（*Advanced JSON Canvas* 格式）。本插件刻意不这么做：

- **卡片正文**只写普通文本，`.canvas` 始终是标准 [JSON Canvas](https://jsoncanvas.org/)；换个工具打开，那串标记只是几个看不见的字符
- **分组 / 连线 / 文件名标签**的选择存在 `.obsidian/plugins/canvas-node-align/data.json`，完全不碰 `.canvas`
- 不往卡片的 `unknownData` 里塞东西；卸载插件后文件依旧合法可读

渲染效果全部由 CSS 负责（`styles.css`，或等价的 CSS 片段 `canvas-text-align.css`），插件本身不直接改 DOM 样式。

## 和 Advanced Canvas 的区别

[Advanced Canvas](https://github.com/developer-mike/obsidian-advanced-canvas) 的 **Node Styles** 里也带卡片文字对齐。想要整套功能（演示模式、节点形状、可折叠分组、节点模板、导出 PNG/SVG 等）就选它。

想要下面这些，选本插件：

- 只要对齐，不想捎带一大堆功能
- 卡片正文的对齐**在卸载插件后依然有效**
- `.canvas` 保持标准 JSON Canvas 格式，而不是私有格式

## 兼容性说明

插件用到了几处**不在官方 API 文档里**的 Canvas 内部接口：

| 用到 | 用途 |
|---|---|
| `canvas:node-menu` / `canvas:edge-menu` / `canvas:selection-menu` 事件 | 加右键菜单项 |
| `canvas.nodes`、`canvas.edges`、`canvas.selection` | 遍历与读取节点/连线 |
| `node.text` / `node.setText()` | 读写卡片文字 |
| `node.labelEl`、`edge.labelElement.textareaEl` | 给标签挂对齐类名 |
| `canvas.requestSave()` | 存盘并进入撤销历史 |

每一处都做了特性检测或回退，将来 Obsidian 改名的后果是"某个功能失灵"而不是"插件报错"。已在 Obsidian **1.13.7** 上验证。

`MenuItem.setSubmenu()` 同样做了检测：版本不支持时，对齐项会平铺进主菜单而不是收进子菜单。

## 已知限制

- 分组 / 连线 / 文件名标签的对齐在禁用插件后会失效（原因见上）
- 文件名标签的对齐要等标签比文字宽才看得见，所以 `styles.css` 给 `.canvas-node-label` 加了 `width: 100%`；副作用是超长文件名会被省略号截断
- 笔记正文在实时预览下对齐时，语法标记会跟着动；阅读视图更干净
- 对齐作用于卡片的**渲染态**。光标停在卡片里时是编辑态，标记还没渲染，该卡片会退回默认值——点一下白板空白处退出编辑即可看到效果

## 开发

```
main.js                       插件源码（ES2017，无构建步骤、无依赖）
styles.css                    全部渲染规则
manifest.json                 插件清单
versions.json                 版本 → 最低主程序版本
test/align.test.js            纯函数单测
tools/set-author.mjs          一次性替换作者与 GitHub 占位符
tools/check-manifest.mjs      按官方规则校验清单字段
tools/install.sh              把插件装进指定库，方便本地测试
docs/SUBMISSION.md            发版与提交市场的完整清单
.github/workflows/release.yml 打 tag 时自动建 Release
```

没有打包流程，`main.js` 手写后直接被加载。

```bash
npm run verify                  # node --check main.js && node test/align.test.js
tools/install.sh "/库的路径"
```

单测的做法是**从 `main.js` 里切出纯函数再用 `new Function` 执行**，测的就是实际发布的那份代码。48 条断言覆盖标记读写、幂等替换、清除、列表/标题语法安全、Windows 换行、类名清理、frontmatter 合并。

源码注释为中文。

## 发版与提交

改版本要同时动三处（`manifest.json`、`versions.json`、git tag），**tag 必须与 manifest 里的版本完全一致**，否则 Obsidian 装不上。完整清单见 `docs/SUBMISSION.md`，里面也写了当前社区目录的提交流程。

## 许可

[MIT](LICENSE)
