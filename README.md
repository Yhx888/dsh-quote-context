# dsh-quote-context

[![release](https://img.shields.io/github/v/release/Yhx888/dsh-quote-context?style=flat-square&color=4D6BFE)](https://github.com/Yhx888/dsh-quote-context/releases)
[![license](https://img.shields.io/badge/license-MIT-4D6BFE?style=flat-square)](LICENSE)
[![dsh](https://img.shields.io/badge/dsh-%E2%89%A5%200.2.1--rc.3-4D6BFE?style=flat-square)](package.json)

<p align="center">
  <img src="docs/screenshots/02-panel.png" alt="输入卡顶部的「聊天引用」芯片，悬停展开所选文本与用户评论" width="100%">
</p>

> 在 DSH 聊天里选中一段文字 → 引用或评论 → 引用收进输入卡顶部的「聊天引用 N」芯片；悬停或点击展开预览，逐条改批注、删条目；**发送的瞬间**才把引用块拼进消息正文。

**中文** · [English](README.en.md)

交互参照 [OpenChamber](https://github.com/openchamber/openchamber) 的聊天引用模式（芯片 + 悬停堆叠预览），视觉沿用 DSH 自己的输入卡、语义 token、发丝线与圆角。

## 界面

| 01 · 收起成一行 | 02 · 悬停展开 |
| --- | --- |
| ![输入卡顶部只剩一行「聊天引用 2」](docs/screenshots/01-chip.png) | ![浮层里逐条列出来源、所选文本与用户评论](docs/screenshots/02-panel.png) |

| 03 · 深色主题 | 04 · 发送后 |
| --- | --- |
| ![深色主题下的芯片与浮层](docs/screenshots/03-panel-dark.png) | ![消息里渲染成可跳回的信使式引用](docs/screenshots/04-sent.png) |

![深色主题下已发送的引用](docs/screenshots/05-sent-dark.png)

## 为什么引用不放进输入框

0.1.x 把每条引用做成输入框里的原生引用芯片（Lexical 原子装饰节点）。芯片虽然用 CSS 藏了起来，但它仍然**占着草稿文本流里的一个位置**：

- 在输入框里按 Backspace / Delete，会先把芯片选中、再删掉，引用跟着一起消失；
- 删字时还会「撞」到芯片，光标行为不自然；
- 芯片是宿主文本的一部分，撤销、全选、跨会话切换都会带上它。

0.2.0 起引用**完全移出草稿**：

- 输入卡顶部只剩一行「聊天引用 N」芯片，它是卡片自己的 chrome，不在可编辑文本里；
- 删除键只删你自己的文字，删不到引用；
- 发送瞬间（Enter、Ctrl/⌘+Enter、发送按钮）才把引用块拼进正文，仍走宿主自己的发送路径 —— 投递模式、附件、乐观回显都不变；
- 宿主拒绝发送时，把正文原样退回并把引用放回芯片，不会丢。

## 特性

- **选区浮条**：在消息正文里选中文字，浮出「引用」「评论」；Esc 关闭，点击外部关闭。
- **评论**：浮条内联 textarea 写可选批注，Enter 提交、Shift+Enter 换行；确认后引用与批注一起进入芯片。
- **折叠芯片**：输入卡内顶部一行「聊天引用 N」（气泡图标 + 计数），左侧对齐、28px 高、发丝边；引用为零时整行消失，输入卡高度随之回落。
- **预览浮层**：悬停即展开、点击固定；每条 = 序号 +「引用自先前的消息」+「所选文本」（点击跳回原文并高亮）+「用户评论」（就地编辑、Enter 保存）+ 删除；两条以上有多余时底部「清空」。浮层贴着芯片向上展开，最高不越过对话区顶部，超出时内部滚动。
- **新增即预览**：新加一条引用时浮层自动展开约 2.4 秒并高亮该条，之后自动收起（悬停中或已固定则不收）。
- **发送折叠**：引用块在前、你的正文在后，线格式不变；命令消息（以 / 开头）不会附带引用，会给出提示。
- **发送后引用块**：消息里渲染成信使式引用 —— 左侧细竖线、来源标题、原文（4 行折叠、点击展开）、批注作为正文；「在原消息中显示」一键滚回并高亮原文。
- **刷新可回读**：引用坐标作为传输行写进消息正文，刷新会话后仍能解析、跳回。
- **深浅主题**：只使用 DSH 语义 CSS 变量（`--dsw-alias-*`、`--dsw-elevation-*`、`--dsw-specific-input-major`）。

## 安装

要求 DSH `0.2.1-rc.3` 或兼容版本、Node ≥ 18。纯 Node 实现，无构建链。

从 Release tarball 安装（推荐）：

```powershell
dsh plugin --profile web add https://github.com/Yhx888/dsh-quote-context/releases/download/v0.2.1/dsh-quote-context-0.2.1.tgz
```

从 GitHub 源码安装：

```powershell
dsh plugin --profile web add github:Yhx888/dsh-quote-context
```

本地开发（link）：

```powershell
dsh plugin --profile web add "link:C:/path/to/dsh-quote-context"
```

> 路径含空格时直接使用空格；pnpm 会把 `%20` 当字面量目录，不要编码。

桌面端：官方桌面端的 profile 由 Electron 独占管理，CLI 不直接写入；在应用内「插件」页从本仓库目录安装，或按 profile 的 pnpm 流程加入 `dsh.profile.bundles`。

挂载后会通过包内 `cordis.patch.yml` 插入 `quote-context` Loader 行。验证记录见 [docs/verification.md](docs/verification.md)。

## 使用

1. 在任意用户或助手消息里选中文字。
2. 点「引用」直接加入芯片；点「评论」写批注后 Enter /「添加」。
3. 输入卡顶部出现「聊天引用 N」。悬停或点击它：逐条看所选文本与用户评论，点 ✎ 改批注、点垃圾桶删除，底部「清空」一次清掉。
4. 在输入框里正常写你的问题。**输入框里只有你自己的文字**，怎么删都删不到引用。
5. 发送：引用块会拼在你的正文前面一起发出，并在消息里显示成可跳回的引用卡。

## 线格式

引用与评论在发送时展开成下面的纯文本（DSH 消息是纯文本，这是模型可读、刷新可回读的载体）：

```text
> ❝ 原文第一行
> 原文第二行
> ❞ 批注第一行
> 批注第二行
> ※ │qc1:<base64url(JSON)>
```

- 无批注时省略 `❞` 段；`※` 行是传输坐标，界面渲染时剥离，模型仍可读。
- 坐标 JSON 含 `{v,s,i,t,c,a}`：版本、会话、引用 id、原文、批注、锚点（行键/同文本序号/前后文）。
- 解析失败时保持普通文本，不阻断发送。

## 兼容性

- 目标：DSH `0.2.1-rc.5` Web 客户端；DOM 契约包括 `[data-conversation-content]`、`[data-conversation-session]`、`[data-chat-anchor-key]`、`[data-chat-node-key]`、`[data-composer-card]`、`[data-composer-input]`、`[data-conversation-scroll]`。
- 依赖的宿主服务：`slots`、`locale`、`conversation.input.shell()`（读写草稿）。0.2.0 不再注册 `inputTriggers` 引用源，也不再往草稿里插芯片。
- 与内置 `@` 引用、`dsh-quote-deck` 不共享 source/trigger；如同时安装，注意两者都会争夺选区浮条，建议二选一。

## 开发

```bash
node --check lib/client.js
npm test
```

`npm test` 运行：
- `test/check.mjs`：manifest/patch/locale/图标/bundle 特征；
- `test/quote.mjs`：线格式、坐标、发送折叠、零宽标记；
- `test/render.mjs`：借 `dsh-quote-deck` 的最小 DOM 垫片渲染消息内引用卡。

## 验证

见 [docs/verification.md](docs/verification.md)：隔离实例里划词→引用→在输入框狂按删除→发送→刷新回读的完整链路，以及浅色/深色截图。

## 暂不做（BACKLOG）

- 文件、终端、diff、PR、浏览器标注等其它上下文类型；
- 朗读、加入笔记、By the way… 草稿；
- 右侧引用清单、引用导出、逐条回应；
- 引用芯片的拖拽排序（当前只保证序号连续）。

## 许可与致谢

MIT。线格式、选区浮条与 DOM 测试垫片参考并复用了 [dsh-quote-deck](https://github.com/YHX/dsh-quote-deck)（MIT，fork 自 `dsh-client-ui-quote`）的已验证做法；交互参照 [OpenChamber](https://github.com/openchamber/openchamber) 的聊天引用模式。
