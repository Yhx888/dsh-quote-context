# RESEARCH — dsh-quote-context（P0）

> 研究日期：2026-10-26
> 研究人：plugin-builder
> 目标：复刻 OpenChamber 的聊天引用交互，落到 DSH 0.2.1-rc.3 的 Web 客户端。

## 1. 研究范围与证据来源

| 来源 | 版本/位置 | 用途 |
|---|---|---|
| OpenChamber 源码 | `_research/openchamber`，commit `c4919abc1e7a0a3beeaa126666487806bf79cfe0`（release v2.5.2） | 引用行为、状态机、DOM/数据模型 |
| OpenChamber 安装包 | `C:\Users\YHX\AppData\Local\Programs\@openchamberelectron\resources\web-dist\assets` | 对照线上文案与构建产物（PLAN 已记录） |
| DSH 运行时 | `C:\Users\YHX\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh`，`@deepseek-ai/dsh-desktop-runtime 0.2.1-rc.3` | 槽位、输入框、DOM 契约、CSS 变量 |
| DSH 基线插件 | `dsh-quote-deck`（v0.3.1，MIT，fork 自 `dsh-client-ui-quote`） | 已验证的芯片插入、线格式、消息后处理、测试垫片 |

说明：PLAN 把 OpenChamber 的 `chatQuoteContext` / `showQuoteSource` / `textSelection.actions` 当作行为线索；本次已定位到它们的源码位置，而不是只看打包产物。

## 2. OpenChamber 行为拆解

### 2.1 选区浮条

源码：`packages/ui/src/components/chat/message/TextSelectionMenu.tsx`

- 选中消息文本后，`selectionchange` + `mouseup` 延迟 10ms 显示；`mousedown` 时先隐藏，拖动结束后再显示（防止拖动中乱跳）。
- 桌面端浮条是 `position: fixed` 的胶囊，定位在选区上方（下方空间不够时放到选区下方），左右按视口夹紧；移动端改为底部动作面板。
- 动作：评论（内联评论框）、引用/添加到对话、朗读、By the way…、加入笔记；本插件 MVP 只保留「引用」「评论」。
- 评论模式：浮条原地换成 `textarea + 取消 + 添加到对话`；`Escape` 关闭，`Enter` 提交、`Shift+Enter` 换行；评论模式期间用 overlay 矩形继续标亮选区。
- 「引用」在 OpenChamber 里是把 Markdown 引用块直接写进 composer（`addMarkdownToChat` → `setPendingInputText`），并不进入引用区；「评论」才创建 `chat-quote` 草稿并出现在输入框上方的 chips 预览中。

### 2.2 引用数据模型与锚点

源码：`packages/ui/src/lib/chatQuoteAnchor.ts`、`packages/ui/src/lib/messages/contextParts.ts`

```ts
type ChatQuoteContext = {
  kind: 'chat-quote'
  messageId?: string
  anchor?: {
    text: string      // 选区原文
    prefix: string    // 前 32 字符
    suffix: string    // 后 32 字符
    start: number     // 文本流偏移，仅作同文本多处时的平局裁决
  }
  quote: string
  text: string        // 用户批注
}
```

- 锚点是「文本 + 前后文 + 偏移」，不是 DOM 路径；消息重渲染、虚拟列表回收、刷新后都能按文本重新定位。
- 发送给模型的文本（`formatContextText`）是：

```text
Comment on this fragment of an earlier message in this conversation:
> 原文第一行
> 原文第二行

用户批注
```

- 显示层（`messageMarkdown.ts`）使用 `Quoted from an earlier message:` + blockquote + `**User comment:**`。

### 2.3 输入框上方引用区

源码：`packages/ui/src/components/chat/composer/ui/ComposerContextChips.tsx`

- 每个上下文类型聚成一个 chip（`chat-quote` 的组标题是 `chat.chatInput.chatQuoteContext` = 「Chat quotes」/「聊天引用」）。
- 悬停/点击 chip 打开 stacked preview：
  - 每条带序号（`index + 1`）、单行截断标题、编辑/删除按钮；
  - 展开区有 `Selected text` 和 `User comment` 两段；
  - 点击原文可 `reveal` 回原消息；
  - 评论可原地编辑，保存后写回 draft。
- 该 preview 是浮层，不是常驻卡片；PLAN 要求常驻在输入卡上方，因此 UI 形态需要按 DSH 重画，但信息层级一致：序号 → 原文 → 批注 → 删除/编辑。

### 2.4 发送后的消息内引用块

源码：`packages/ui/src/components/chat/message/parts/UserContextPart.tsx`

- `ContextCard` 的视觉：左侧 2px 竖线、`ps-3` 缩进、13px 次要色、标题行 + 正文最多 4 行、批注在正文下方作为普通消息文本。
- 标题是 `chat.message.context.chatQuote` = 「Quoted from an earlier message」/「引用自先前的消息」。
- 「Show in the original message」按钮在标题行右侧，点击调用 `quoteHighlights.reveal(messageId, anchor)`。
- 正文默认 `line-clamp-4`，点击卡片切换展开。
- 高亮由 `ChatQuoteHighlightLayer.tsx` 用 CSS Custom Highlight API 绘制，不改 Markdown DOM；跳回时先滚到消息，再解析 Range、`scrollIntoView({block:'center'})`、闪一下高亮。

### 2.5 文案键（英文原文）

| 键 | 英文 | 中文（本插件采用） |
|---|---|---|
| `chat.textSelection.actions.addToInput` | Quote | 引用 |
| `chat.textSelection.actions.comment` | Comment | 评论 |
| `chat.textSelection.comment.placeholder` | Add an optional comment... | 写一条批注（可选）… |
| `chat.chatInput.chatQuoteContext` | Chat quotes | 引用 |
| `chat.message.context.chatQuote` | Quoted from an earlier message | 引用自先前的消息 |
| `chat.message.context.showQuoteSource` | Show in the original message | 在原消息中显示 |
| `chat.chatInput.contextPreview.selectedLabel` | Selected text | 原文 |
| `chat.chatInput.contextPreview.commentLabel` | User comment | 批注 |

## 3. DSH 侧可用能力（0.2.1-rc.3）

### 3.1 包与注入

- 客户端插件仍是 `window.__ModuleLoader__.load({ id, factory })`，`exports.inject = ["slots", "locale"]` 即可；`dsh.client = { platform: "web" }`，`dsh.bundle.patch` 指向包内 `cordis.patch.yml`。
- Host 半保持零依赖零副作用，只提供 loader 行；本插件不需要 Host 路由。

### 3.2 槽位清单

| 槽位 | 类型/作用域 | 用途 | 结论 |
|---|---|---|---|
| `conversation.input.overlay` | list / session | 输入卡内部顶部 overlay 列表；props 含 `sessionId`、`inputActions`、`t` | **采用**：注册不可见桥接组件，保存每个 session 的 `inputActions` 与翻译函数 |
| `conversation.composer.dock` | list / session | 输入卡下方 dock（统计、上下文占用） | 不采用：位置在输入卡下方，与「输入卡上方引用区」相反 |
| `conversation.input.dock` | list / session | 输入区外层 dock，首页/输入座附近 | 不采用：位置由宿主排版，无法稳定挂在输入卡正上方 |
| `conversation.composer.bar` | single / session-maybe | 整个 composer bar 的单一占位 | 不采用：会替换官方输入栏 |
| `conversation.chat.turnTail` | list / session | 每轮末尾 | 不采用：引用块属于消息内部，不是轮末 |

引用区采用 **DOM 注入**：在 `[data-composer-card]` 的父节点里、卡片之前插入一个 `div[data-qctx="dock"]`。这与 quote-deck 的「引用 ×N」聚合条同一机制：输入栏整体向上长高，输入卡本身尺寸不变。

### 3.3 DOM 契约（已在 quote-deck 中验证）

| 选择器/属性 | 说明 |
|---|---|
| `[data-conversation-content]` | 一个会话的转录内容根 |
| `[data-conversation-session]` | 会话 id（用于取当前会话） |
| `[data-conversation-scroll]` | 转录滚动容器 |
| `[data-composer-card]` | 输入卡 |
| `[data-composer-input]` | 输入卡里的 Lexical 编辑区 |
| `[data-composer-seat]` | 输入座（判断滚动区底部） |
| `[data-chat-anchor-key]` | 消息行稳定键（跳回定位） |
| `[data-chat-node-key]` | 消息节点键（备用） |
| `[data-chat-turn]` | 消息所在轮次（可读标注） |

DSH 没有 `data-message-id`；因此锚点用 `data-chat-anchor-key` + 文本前后文 + 同文本序号。

### 3.4 原生引用芯片与发送编解码

- 输入框的引用 chip 是「携带 owner 序列化身份的原子 decorator 节点，提交时经 owner codec 展开」（`dsh-client-ui-conversation` README 第 99 行）。
- 注册方式（quote-deck 已验证）：`ctx.get('inputTriggers').registerSource({ name, trigger, codec: { clipboardText, serialize } })`。
- 插入方式：`conversation.input.shell(sessionId).insertReference({ source, ref, label, appearance:'session', clipboardText }, span)`；或 `inputActions.captureInsertion()` + `insertText` 兜底。
- 发送时 `codec.serialize(ref)` 返回模型可读文本；返回 `Promise<string>` 也可。
- 该路径的价值：引用在草稿里是原子节点，删除/撤销/换行都由宿主处理；发送时展开成纯文本，刷新后仍在消息正文里。

### 3.5 主题变量

已确认的 DSH 语义别名（节选）：`--dsw-alias-bg-base`、`--dsw-alias-bg-layer-1/2`、`--dsw-alias-border-l1/l2`、`--dsw-alias-brand-primary`、`--dsw-alias-label-primary/secondary/tertiary`、`--dsw-alias-interactive-bg-hover`、`--dsw-alias-state-error-primary`、`--dsw-elevation-panel`、`--dsw-menu-surface-fill`。

引用区、浮条、消息块只使用这些变量，不另建色板；品牌蓝优先 `--dsw-alias-brand-primary`，缺失时回退 quote-deck 已验证的 `#4176e6`（深色用同色相提亮）。

## 4. quote-deck 基线可复用/需重写

### 4.1 直接复用（已验证）

1. **芯片插入链路**：`inputTriggers.registerSource` + `shell.insertReference` + `actions.captureInsertion`。
2. **线格式思路**：`> ❝ …` 开头、`> ❞ …` 批注半段、可选 `> ※ │q1:…` 传输坐标；`splitQuoteRuns` 严格剥离传输行。
3. **DOM 后处理**：只隐藏原文 run、在旁边插入自己的节点，不移除/移动 React 节点；MutationObserver 32ms 节流；卸载时恢复。
4. **跳回**：锚点行查找 → 文本匹配（精确优先、空白折叠兜底）→ `scrollIntoView` → 闪高亮；失败提示「原文已变」。
5. **测试垫片**：`test/dom.mjs` 提供最小 DOM/Range/MutationObserver/localStorage；纯函数和渲染函数都能在 Node 里跑。

### 4.2 必须重写（按 OpenChamber 信息架构）

| 部件 | quote-deck | 本插件 |
|---|---|---|
| 选区浮条 | 评论 / 添加到对话 / 侧边对话，Kimi 风格 | 引用 / 评论，胶囊 + 分隔线，DSH 品牌蓝主按钮 |
| 输入区引用 | 单行「引用 ×N」聚合条 + chip 悬停卡 | 常驻卡片列表：标题「引用」、序号、原文单行、批注行、编辑/删除 |
| 消息内引用 | 圆角胶囊 + 悬停卡 | 左侧 2px 竖线 + 「引用自先前的消息」+ 原文（4 行折叠）+ 批注 + 「在原消息中显示」 |
| 锚点 | 会话/轮次/行键 + 文本表 | 行键 + 前后文 + 同文本序号；不依赖 side table 也能跳回 |
| 额外功能 | 侧边对话、引用清单、文件/终端/diff 引用 | 全部不做（BACKLOG） |

### 4.3 形态裁定：用户拍板的 B 口径（2026-10-26）

OpenChamber 的「引用」直接写进 composer 文本；「评论」才进入引用区。用户已明确拍板采用 PLAN 的统一形态（B 口径），不照 OpenChamber 的分叉实现：

1. 「引用」与「评论」都创建 `QuoteItem`，统一进入输入框上方引用区；输入框正文不插入任何引用文本，正文保持干净。
2. 评论 = 浮条内联 textarea 写可选批注，确认后与引用一起进区；引用 = 无批注直接进区。
3. 引用区 = 常驻卡片列表（序号 + 单行原文 + 批注 + 编辑/删除），插在 `[data-composer-card]` 前，输入卡尺寸不变。
4. 发送后按 PLAN 渲染「引用自先前的消息」引用块与「在原消息中显示」跳回高亮，线格式与锚点按本文件第 5 节。

这是本插件与 OpenChamber 唯一有意的交互差异，后续 P3/P4 按此实现。

## 5. 实现方案（P1 起）

### 5.1 文件结构

```
dsh-quote-context/
├── package.json
├── cordis.patch.yml
├── lib/
│   ├── index.js        # Host 半：空壳
│   └── client.js       # Client 半：全部 UI 与状态
├── locale/{zh,en}.json
├── test/{check.mjs,dom.mjs,quote.mjs,render.mjs}
├── docs/…
├── README.md
├── CHANGELOG.md
└── icon.svg
```

### 5.2 客户端模块划分（单文件内分区）

1. **纯函数层**：`quoteBlock` / `splitQuoteRuns` / `encodeRef` / `decodeRef` / `findSpans` / `foldWhitespace` / `textMapOf`。
2. **会话桥**：`conversation.input.overlay` 不可见组件，保存 `sessionId → { actions, t }`。
3. **引用源 codec**：`name: "quote-context"`，`trigger: "#"`，`codec.serialize` 按 ref 中的 id 读当前 `QuoteItem`（含最新批注），生成 wire block。
4. **选区浮条**：document 级单例，`position: fixed`，Esc/外点关闭，评论内联框。
5. **引用区**：每个 composer card 一个 `div[data-qctx="dock"]`；从芯片扫描 + 会话 store 还原条目；增删改批注、序号重排、滚动跟随。
6. **消息渲染**：MutationObserver 找 `❝` 文本 run，`splitQuoteRuns` 后插入引用卡片；只改自己的节点。
7. **跳回高亮**：锚点行 + 文本映射 + Range + 临时 overlay/高亮；失败降级。
8. **样式**：一个 `<style data-plugin="dsh-quote-context">`，只用 DSH CSS 变量；深浅色由变量自适应。

### 5.3 线格式（定稿）

```text
> ❝ 原文第一行
> 原文第二行
> ❞ 批注第一行
> 批注第二行
> ※ │qc1:<base64url(JSON)>
```

- 无批注时省略 `❞` 段。
- `※` 行是传输坐标，渲染与复制时剥离；模型可读，但不会污染界面。
- `JSON` 含 `{v:1,s:sessionId,k:anchorKey,n:nodeKey,t:turn,o:ordinal}`，编码用 UTF-8 + base64url，避免空白与 `>` 断行。
- 解析失败时退化为普通引用文本，不阻断发送。

### 5.4 验收对照的可行性

| 验收项 | 方案 | 风险 |
|---|---|---|
| 1 浮条出现/Esc | document selection + fixed bar | 低（quote-deck 同路径） |
| 2 引用进引用区/不压输入区 | chip + DOM sibling dock | 中（需实测 chip 隐藏后高度） |
| 3 评论批注 | 浮条内联 textarea | 低 |
| 4 编辑/删除/序号 | dock store + chip 删除 | 中（删除用 `consumeToken`，失败退回 Backspace） |
| 5 发送后引用块 | codec serialize + DOM enhancer | 中（需真实发送验证） |
| 6 跳回高亮 | anchorKey + text map | 中（虚拟列表需实测） |
| 7 深浅主题 | DSH 变量 | 低 |
| 8 刷新后解析/跳回 | 消息正文自带 `※` 坐标 | 低 |
| 9 node --check + DOM 测试 | 纯 Node 测试 | 低 |
| 10 web E2E + desktop 文件级 | 临时 web 实例 + Playwright | 中（需 token URL） |

## 6. P1 计划

1. 建包骨架：`package.json`、`cordis.patch.yml`、`lib/index.js`、`lib/client.js`（空壳 slot + 样式注入）、`locale/zh.json`、`locale/en.json`、`icon.svg`。
2. 先只注册 `conversation.input.overlay` 的不可见桥接组件，页面无报错、不改变现有 UI。
3. web profile link 安装（`link:C:/HOME/Project/DSH%20plugins/dsh-quote-context`），用 `--dump-config` 验证 bundles 记录。
4. 启动隔离 web 实例（临时 `DSH_HOME` 或现有 web profile 的高位端口），确认 `curl /plugins/dsh-quote-context/client.js` 命中最新代码、页面无 `Failed to load plugins`。
5. 在 P1 末尾把「空面板」截图/控制台输出作为证据，再进入 P2。

## 7. 待确认/风险

- **DSH 版本锁定 0.2.1-rc.3**：所有 DOM 契约按此版本验证；升级后需重跑 P0 的探针。
- **多 composer**：主会话与侧边面板可能同时存在多个 `[data-composer-card]`；引用区按每个卡片的 `data-conversation-session` 分别渲染，不假设全局唯一。
- **芯片被宿主重绘**：扫描按 label 匹配，label 必须稳定；批注不进 label，避免编辑批注导致芯片失配。
- **发送时 codec 生命周期**：quote-deck 踩过「多 mount 互相 dispose」的坑；本插件用 holder 计数共享一次注册，最后一个 mount 才释放。
- **不做文件/终端/diff 引用**：PLAN 明确暂不做，记入 BACKLOG；选区只在 `[data-conversation-content]` 内生效，避免误伤。
