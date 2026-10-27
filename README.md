<p align="center">
  <img src="docs/screenshots/hero.png" alt="dsh-quote-context：在 DSH 里选中一句话，引用、批注，发送后仍能跳回原文" width="100%">
</p>

# dsh-quote-context

[![release](https://img.shields.io/github/v/release/Yhx888/dsh-quote-context?style=flat-square&color=4D6BFE)](https://github.com/Yhx888/dsh-quote-context/releases)
[![license](https://img.shields.io/badge/license-MIT-4D6BFE?style=flat-square)](LICENSE)
[![dsh](https://img.shields.io/badge/DSH-%E2%89%A5%200.2.1--rc.3-4D6BFE?style=flat-square)](package.json)
[![stars](https://img.shields.io/github/stars/Yhx888/dsh-quote-context?style=flat-square&color=4D6BFE)](https://github.com/Yhx888/dsh-quote-context)

> 在 DSH 聊天里选中一段文字 → 引用或评论 → 引用进入输入卡上方的常驻引用区 → 发送后消息里出现「引用自先前的消息」引用块，可一键跳回原文并高亮。

**中文** · [English](README.en.md)

这是 [OpenChamber](https://github.com/openchamber/openchamber) 聊天引用模式的 DSH 原生复刻。视觉沿用 DSH 的输入卡、品牌蓝、发丝线、圆角与字号，不搬运 OpenChamber 的外观。

## 界面

| 01 · 划词即引 | 02 · 就地批注 |
| --- | --- |
| ![在消息正文里选中一句，浮出「引用 / 评论」](docs/screenshots/01-selection.png) | ![浮层内联成评论框，写一句批注](docs/screenshots/02-comment.png) |

| 03 · 常驻引用区 | 04 · 发送后可跳回 |
| --- | --- |
| ![引用与批注停在输入卡上方，可编辑、可删除](docs/screenshots/03-dock.png) | ![消息内渲染引用块，点击回到原消息](docs/screenshots/04-message.png) |

![深色主题：只使用 DSH 语义 CSS 变量，浅色与深色自动适配](docs/screenshots/05-dark.png)

## 特性

- **选区浮条**：在消息正文里选中文字，浮出「引用」「评论」两个动作；Esc 关闭，点击外部关闭。
- **评论**：浮条内联 textarea 写可选批注，Enter 提交、Shift+Enter 换行；确认后引用 + 批注一起进入引用区。
- **引用**：不写批注，直接进入引用区。
- **常驻引用区**（B 口径）：插在 `[data-composer-card]` 之前，输入卡尺寸不变、只让上方内容上移。每条 = 序号 + 单行原文 + 批注 + 编辑/删除；删除后序号自动重排，支持清空。
- **发送后引用块**：消息里显示「引用自先前的消息」+ 原文（默认 4 行折叠）+ 批注 + 「在原消息中显示」；点击滚动回原消息并高亮原文。
- **刷新可回读**：引用坐标作为传输行写进消息正文，刷新会话后仍能解析、跳回。
- **深浅主题**：只使用 DSH 语义 CSS 变量（`--dsw-alias-*`），浅色/深色自动适配。

## 安装

要求 DSH `0.2.1-rc.3` 或兼容版本、Node ≥ 18。纯 Node 实现，无构建链。

从 GitHub 安装：

```powershell
dsh plugin --profile web add github:Yhx888/dsh-quote-context
```

从 Release tarball 安装：

```powershell
dsh plugin --profile web add https://github.com/Yhx888/dsh-quote-context/releases/download/v0.1.1/dsh-quote-context-0.1.1.tgz
```

本地开发（link）：

```powershell
dsh plugin --profile web add "link:C:/path/to/dsh-quote-context"
```

> 路径含空格时直接使用空格；pnpm 11 会把 `%20` 当字面量目录，不要编码。

桌面端：官方桌面端的 profile 由 Electron 独占管理，CLI 不直接写入；在应用内「插件」页从本仓库目录安装，或按 profile 的 pnpm 流程加入 `dsh.profile.bundles`。

挂载后会通过包内 `cordis.patch.yml` 插入 `quote-context` Loader 行。验证记录见 [docs/verification.md](docs/verification.md)。

## 使用

1. 在任意用户或助手消息里选中文字。
2. 点「引用」直接加入引用区；点「评论」写批注后 Enter / 「添加」。
3. 引用区里可点原文跳回来源、点 ✎ 编辑批注、点 × 删除。
4. 在输入框继续写你的问题并发送。引用块会随消息一起发出，并在消息里显示成引用卡片。

引用与评论都不会把引用原文写进输入框正文；输入框只保留你自己的文字。

## 线格式

引用与评论在发送时由引用源 codec 展开为下面的纯文本（DSH 消息是纯文本，这是模型可读、刷新可回读的载体）：

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

- 目标：DSH `0.2.1-rc.3` Web 客户端；DOM 契约包括 `[data-conversation-content]`、`[data-conversation-session]`、`[data-chat-anchor-key]`、`[data-composer-card]`、`[data-composer-input]`。
- 依赖的宿主服务：`slots`、`locale`、`conversation.input`（插入引用芯片）、`inputTriggers`（发送时 codec）。缺失时引用动作会提示失败，不会把半截内容写进消息。
- 与内置 `@` 引用、`dsh-quote-deck` 不共享 trigger/source；如需同时安装，注意两者都会争夺选区浮条，建议二选一。

## 开发

```bash
node --check lib/client.js
npm test
```

`npm test` 运行：
- `test/check.mjs`：manifest/patch/locale/图标/bundle 特征；
- `test/quote.mjs`：线格式、坐标、转义、跨行解析；
- `test/render.mjs`：借 `dsh-quote-deck` 的最小 DOM 垫片渲染消息内引用卡。

## 验证

见 [docs/verification.md](docs/verification.md)：web profile `--dump-config`、隔离 web 实例页面探针、真实发送→回读→跳回、desktop profile 文件级检查。

## 暂不做（BACKLOG）

- 文件、终端、diff、PR、浏览器标注等其它上下文类型；
- 朗读、加入笔记、By the way… 草稿；
- 右侧引用清单、引用导出、逐条回应；
- 引用区拖拽排序（当前只保证序号连续）。

## 许可与致谢

MIT。选区/线格式/芯片插入与 DOM 测试垫片参考并复用了 [dsh-quote-deck](https://github.com/YHX/dsh-quote-deck)（MIT，fork 自 `dsh-client-ui-quote`）的已验证做法；交互参照 [OpenChamber](https://github.com/openchamber/openchamber) 的聊天引用模式。
