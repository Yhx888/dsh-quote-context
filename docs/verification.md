# 验证记录

> 每一条都是可复核的证据：命令、环境、输出摘要。最后更新：2026-10-31（v0.2.2）。

## 环境

- DSH 实现：`0.2.1-rc.5`（`C:\Users\YHX\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh`）
- 浏览器：Chromium 1243（Playwright）
- 隔离实例：`DSH_HOME=_shots\home`，profile `shots`，端口 5799，模型 `free-egg / deepseek-v4.1-flash`
- 真机 profile（未重启）：`profiles/desktop`，插件以 `link:C:/HOME/Project/DSH plugins/dsh-quote-context` 挂载

## 1. Node 测试

```
$ npm test
OK  manifest: dsh-quote-context@0.2.2
OK  exports : . ./client ./package.json ./locale/*.json
OK  patch   : quote-context / dsh-quote-context
OK  locale  : 37 keys (zh/en aligned)
OK  bundle  : 94332 chars, key markers present
OK  线格式/坐标断言: 10 组
OK  消息内引用卡断言: 20 组
```

覆盖：线格式往返、`※` 转义、坐标 base64url、旧消息兼容、**发送折叠（引用块在前 / 用户正文在后 / 多条顺序 / 纯引用 / 零宽标记剔除）**、消息内引用卡渲染与多段连续引用。

## 2. 隔离实例端到端（真实模型）

脚本：`_shots\v2-e2e.py`（Playwright）。步骤与实测输出（节选，`window.__dshQuoteContext.state()`）：

| 步骤 | 断言 | 实测 |
| --- | --- | --- |
| 划词「把关键原文摘出来放进消息里」→ 引用 | 芯片出现、浮层自动展开、草稿里没有引用文本 | `chips=1`，`chipText="聊天引用\n1"`，`anchorInCard=true`，`panelEntries=1`，`panelLabels=["所选文本","用户评论"]`，`draftText="\u200b"` |
| 在输入框狂按 8 次 Backspace + 8 次 Delete | **引用不动** | `chips=1`，`state.drafts[..].count=1`，引用仍在 |
| 再引用一条并写批注 | 计数变 2、浮层 2 条 | `chipText="聊天引用\n2"`，`panelEntries=2` |
| 等 2.6 秒 | 自动收起 | `chipOpen=false`，`panelVisible=false` |
| 悬停芯片 | 展开 | `panelVisible=true` |
| Esc | 收起 | `panelVisible=false` |
| 输入问题 + Enter | 引用折叠进正文、芯片清空、消息里出现引用卡 | `after_send`：`chips=0`、`drafts.count=0`；`sent_view`：`cards=4`（2 条历史 + 2 条新）、`leak=false` |
| 刷新页面重进会话 | 引用卡仍在、坐标不泄漏 | `after_reload`：`cards=4`，`leak=false` |
| 深色主题下再引用 | 芯片与浮层正常 | `chips=1`，`panelVisible=true`，`panelEntries=1` |

`pageerror` 全程为 0。服务端下发的客户端包经确认是当前构建（`fetch(client.js)` 命中 `98%,transparent` → 后改为实心表面）。

## 3. 视觉

- `docs/screenshots/01-chip.png`：收起态（输入卡内只有一行「聊天引用 1」）。
- `docs/screenshots/02-panel.png`：浅色悬停展开，两条引用 + 批注 + 清空。
- `docs/screenshots/03-panel-dark.png`：深色浮层。
- `docs/screenshots/04-sent.png`、`05-sent-dark.png`：发送后的信使式引用卡。
- 采集：1440×900 @2x，真实模型对话，隔离 `DSH_HOME`，不含个人工作区内容。

## 4. 真机 profile（文件级）

```
profiles/desktop/package.json
  dependencies."dsh-quote-context" = "link:C:/HOME/Project/DSH plugins/dsh-quote-context"
  dsh.profile.bundles 含 "dsh-quote-context"
node_modules/dsh-quote-context -> C:\HOME\Project\DSH plugins\dsh-quote-context（链接）
```

桌面端只在重启后才会加载新的 client bundle；重启前需用户确认。

## 5. 已知限制

- 引用以纯文本行写进消息正文（模型可读、刷新可回读），因此消息文本里能看到 `> ❝` 行；界面渲染时隐藏原始 run。
- 命令消息（`/` 开头）不附带引用，会 toast 提示。
- 富文本/图片选区、跨消息选区不支持（沿用 0.1.x 的 DOM 契约）。
