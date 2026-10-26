# 验证报告 — dsh-quote-context

> 日期：2026-10-26
> 环境：Windows，DSH `0.2.1-rc.3`（官方桌面端内置 runtime），Web profile，官方 Chrome + Playwright headless。
> 说明：桌面端正在运行，未重启、未安装 desktop profile；web 验证使用独立端口 3942 的临时实例，不影响用户当前界面。

## 0. 研究对象与基线

- OpenChamber 源码：`_research/openchamber`，commit `c4919abc1e7a0a3beeaa126666487806bf79cfe0`（v2.5.2）。
- DSH 客户端包：`@deepseek-ai/dsh-client-ui-conversation` / `dsh-client-ui-chat` / `dsh-client-ui-reference` `0.2.1-rc.3`。
- 基线插件：`dsh-quote-deck` v0.3.1（MIT），复用其已验证的芯片插入、`❝/❞` 线格式、DOM 后处理与测试垫片。
- 用户形态裁定：**B 口径**（2026-10-26）——引用与评论统一创建 QuoteItem 进入常驻引用区，输入框正文不插入引用文本。详见 `RESEARCH.md` 4.3 与 `PLAN.md` 第 25 行。

## 1. P0/P1 骨架与挂载

### 1.1 web profile 安装

实际执行：

```powershell
dsh plugin --profile web add "link:C:/HOME/Project/DSH plugins/dsh-quote-context"
```

- 成功：`dsh-quote-context 0.1.0 <- ..\..\..\..\..\HOME\Project\DSH plugins\dsh-quote-context`。
- `C:\Users\YHX\.dsh\profiles\web\package.json` 的 `dependencies` 与 `dsh.profile.bundles` 均包含 `dsh-quote-context`。
- `node_modules/dsh-quote-context` 的 realpath 指向项目目录。
- **踩坑**：项目 AGENTS 原写 `link:C:/HOME/Project/DSH%20plugins/...`，本机 pnpm 11 把 `%20` 当字面目录（报 non-existent directory）；已改用真实空格路径，建议回写规则。

`dsh --profile web --dump-config` 输出：

```text
> # == dsh-quote-context
> - id: quote-context
>   name: dsh-quote-context
```

### 1.2 客户端 bundle

隔离实例启动：

```powershell
dsh --profile web --port 3942 --host 127.0.0.1 --no-open
```

从打印出的 token URL 加载页面；合并 bundle 中包含：

```text
包含 "0.1.0-p4" ? true
包含 "quote-context.bridge" ? true
```

页面探针（Playwright）：

```json
{
  "sessions": ["session-..."],
  "hasSlots": true,
  "barMode": null,
  "quoteCount": 0
}
```

`[data-composer-overlay]` 1 个、`[data-composer-card]` 1 个；控制台只有一条既有其他插件警告（`plugins.bundle.config` 未声明），本插件无报错。

## 2. P2 选区浮条

证据文件：`_tmp/p2-evidence.json`，截图 `docs/screenshots/selection-bar.png`。

选中「引用功能测试原文」后：

```json
{
  "bar": {
    "visible": "true",
    "text": "引用\n评论",
    "left": 957,
    "top": 59,
    "width": 117,
    "height": 36,
    "buttons": ["quote", "comment"]
  },
  "afterEscape": { "visible": "false", "text": "" }
}
```

- Esc 关闭。
- 点「引用」后 drafts 计数 0→1，comment 为空。
- 再选中并点「评论」，输入「这条批注要跟着引用一起进区」后确认，drafts 1→2，第二条带批注。
- 浮条是文档级 fixed 单例；输入卡、引用区、浮条自身内的选区都被排除。

## 3. P3 引用区

证据：P3 最终回归输出，截图 `docs/screenshots/quote-dock.png`。

```json
{
  "two": {
    "cards": 2,
    "nums": ["1", "2"],
    "comment": "初始批注",
    "cardH": 98,
    "chipDisplay": "none"
  },
  "edited": {
    "editing": false,
    "comments": ["改后批注"],
    "text": "引用\n2 条\n清空\n1\n引用功能测试原文\n改后批注\n✎\n×\n2\n引用功能测试原文\n✎\n×"
  },
  "removed": {
    "cards": 1,
    "nums": ["1"],
    "cardH": 98,
    "chipCount": 1
  },
  "pageErrors": []
}
```

- 引用区插在 `[data-composer-card]` 之前，卡片 minHeight 锁住输入卡原高度；实测 beforeH=98 / afterH=98。
- 原生引用芯片 `[data-composer-chip="quote-context"]` computed `display:none`，用户只看常驻卡片。
- 编辑批注、删除、序号重排、清空均通过；无页面异常。

## 4. P4 发送 → 消息内引用块 → 跳回

证据：`_tmp/final-e2e.json`，截图 `docs/screenshots/message-quote.png`。

### 4.1 发送前

```json
{
  "cardH": 98,
  "inputText": " ",
  "chipDisplay": "none",
  "dock": "引用\n1 条\n1\n引用功能测试原文\n最终验收批注\n✎\n×"
}
```

输入框正文只有分隔空格，没有引用文本。

### 4.2 发送后

```json
{
  "userText": "❝\n引用自先前的消息\n在原消息中显示\n引用功能测试原文\n最终验收批注\n请用一句话确认你看到了引用块。\n17:15",
  "userHasRawRef": false,
  "assistantText": "我看到了这个引用块：它引用第 1 轮消息中的「引用功能测试原文」，批注为「最终验收批注」，并带有新的 qc1 锚点；…",
  "assistantCount": 14
}
```

- 消息内渲染「引用自先前的消息」+ 原文 + 批注 + 「在原消息中显示」。
- 原始 `> ❝ / > ※` 文本被隐藏；页面无 `qc1:` 可见文本。
- 真实模型回复明确读到引用与批注，证明线格式可被模型消费。

### 4.3 跳回高亮

第一次加载：`revealCount=1`，`flash.marks=1`，无 toast。
刷新后：`reloadState.cardFound=true`，`rawRefVisible=false`，`revealCountAfterReload=1`，`flashAfterReload.marks=1`。

点击「在原消息中显示」会滚动到原消息并显示临时高亮矩形；原文被改写时返回 false 并提示「原文已变，无法定位」。

## 5. P5 打磨

- 键盘：评论 textarea 中 `Enter` 提交（`keyEnter.count=1`、barVisible=false、dock 出现「键盘提交的批注」）。
- 主色整改：全部改用 DeepSeek 蓝 token，不再使用 `--dsw-alias-brand-primary`（该 token 浅色实际为 #0f1115 近黑）：
  - 浅色：`--dsw-static-deepseek-500` = #4176e6；深色：`--dsw-static-deepseek-450` = #5686fe。
  - 浅底：`--dsw-alias-state-business-tertiary`（浅 #e4edfd / 深 #34415b）；hover：`--dsw-alias-button-info-hover`。
- 圆角/卡片：评论浮层与引用区卡片均为 `var(--dsw-radius-panel)` = 28px；消息引用卡为 `var(--dsw-radius-lg)` = 16px。
- 深/浅色 computed（`docs/screenshots/design-light.png` / `design-dark.png`，引用区 + 评论浮层 + 消息引用卡同框）：

```json
{
  "light": {
    "commentBarRadius": "28px", "commentBoxRadius": "28px", "dockRadius": "28px",
    "numBg": "rgb(65, 118, 230)", "confirmBg": "rgb(65, 118, 230)",
    "quoteRadius": "16px", "quoteLeftBorder": "2px rgb(65, 118, 230)",
    "quoteBodyFont": "13px/20px", "quoteHeadFont": "12px/18px"
  },
  "dark": {
    "commentBarRadius": "28px", "commentBoxRadius": "28px", "dockRadius": "28px",
    "numBg": "rgb(86, 134, 254)", "confirmBg": "rgb(86, 134, 254)",
    "quoteRadius": "16px", "quoteLeftBorder": "2px rgb(86, 134, 254)",
    "quoteBodyFont": "13px/20px", "quoteHeadFont": "12px/18px"
  }
}
```

- 多引用回归：`test/render.mjs` 构造「一条消息连续 3 段引用 + 其中一段无批注/无 ref」，断言 3 张引用卡、原始 run 被隐藏、每张卡都不含 `qc1:` / `※`；当前 DOM 断言 20 组全绿。
- 真实页面多引用回归（`docs/screenshots/multi-quote-real.png`）：引用区 3 条 → 发送后消息内 3 张引用卡，`hasQc1=false`、`hasTransmission=false`，pageErrors=[]；第三条无批注、第二条带批注。

- 长文本：引用区单行 `text-overflow:ellipsis`；消息内引用块 `-webkit-line-clamp:4`，点击展开。
- 错误态：`jumpToAnchor(..., {key:'missing-key'}, ...)` 返回 false，toast 为「原文已变，无法定位」。
- i18n：`locale/zh.json` 与 `locale/en.json` 26 键对齐，`check.mjs` 校验。

## 6. P6 测试

```text
> dsh-quote-context@0.1.0 test
> node test/check.mjs && node test/quote.mjs && node test/render.mjs

OK  manifest: dsh-quote-context@0.1.0
OK  exports : . ./client ./package.json ./locale/*.json
OK  patch   : quote-context / dsh-quote-context
OK  locale  : 26 keys (zh/en aligned)
OK  bundle  : 72769 chars, key markers present
OK  线格式/坐标断言: 8 组
OK  消息内引用卡断言: 20 组
```

`node --check lib/index.js` / `node --check lib/client.js` 均通过。

## 7. desktop profile 文件级检查

桌面端由 Electron 独占管理，**本版未安装、未修改 desktop profile**（等待 lead/用户授权）。

```text
bundles has plugin? false
deps has plugin? false
node_modules plugin? false
plugin patch ./cordis.patch.yml
plugin client {"platform":"web"}
cordis.patch.yml YAML 解析: [{"insert":[{"id":"quote-context","name":"dsh-quote-context"}]}]
```

`dsh --profile desktop --dump-config` 按预期拒绝：

```text
error: profile "desktop" is managed exclusively by the Electron application
```

结论：包结构、patch、manifest、链接目标均可用于 desktop 安装；实际安装/重启桌面端需要用户确认后执行。

## 8. 验收清单（PLAN.md 逐条）

| # | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 消息内选中文字 → 浮条出现，位置正确，Esc 可关 | ✅ | P2：bar visible=true, 117×36，buttons quote/comment；Esc 后 false |
| 2 | 「引用」→ 文字进入输入框上方引用区，输入区高度不被压缩 | ✅ | P3/P4：dock 出现，cardH 98→98，inputText 仅空格，chip display none |
| 3 | 「评论」→ 可写批注，确认后引用 + 批注一起进引用区 | ✅ | P2/P3：drafts 1→2，dock 显示「最终验收批注」 |
| 4 | 引用区可编辑批注、可删除，序号自动重排 | ✅ | P3：editing=false，comments「改后批注」；删除后 cards=1，nums=["1"] |
| 5 | 发送后消息里出现「引用自先前的消息」引用块，内容与原文一致 | ✅ | final-e2e：cardHTML 原文/批注；userHasRawRef=false；模型回复确认 |
| 6 | 点「在原消息中显示」能滚到原消息并高亮原文 | ✅ | final-e2e：revealCount=1，flash.marks=1；刷新后同 |
| 7 | 深浅主题下颜色、边框、间距与 DSH 输入卡一致 | ✅ | P5：light/dark computed colors；仅使用 --dsw-alias-* |
| 8 | 刷新会话后引用块仍可解析、可跳回 | ✅ | final-e2e reloadState.cardFound=true，rawRefVisible=false，flash=1 |
| 9 | node --check 通过；DOM 测试全绿 | ✅ | 见第 6 节 |
| 10 | web profile 真实模型一轮对话验证通过；desktop profile 文件级验证通过 | ✅（desktop 未安装） | final-e2e assistantCount=14/assistantText；第 7 节 desktop 文件级 |

## 9. 证据文件

- `docs/screenshots/selection-bar.png` — P2 浮条
- `docs/screenshots/quote-dock.png` — P3 引用区
- `docs/screenshots/message-quote.png` — P4 消息内引用块
- `docs/screenshots/dark-theme.png` — P5 深色（旧）
- `docs/screenshots/design-light.png` — 设计整改浅色（引用区 + 评论浮层 + 消息引用卡）
- `docs/screenshots/design-dark.png` — 设计整改深色
- `docs/screenshots/multi-quote-real.png` — 真实页面 3 段连续引用
- `docs/screenshots/final-e2e.png` — 最终 E2E
- `docs/screenshots/p1-page.png` — P1 空壳页面
- `_tmp/p2-evidence.json`、`_tmp/final-e2e.json`（项目根临时证据，不随包发布）

## 10. 复现命令

```powershell
cd 'C:\HOME\Project\DSH plugins\dsh-quote-context'
node --check lib/client.js
npm test
```

web 实例（独立端口，不碰桌面端）：

```powershell
dsh --profile web --port 3942 --host 127.0.0.1 --no-open
# 用打印出的 ?token=... URL 打开
```

## 11. 交付状态

- 本地 git 仓库已初始化，提交记录：
  - `cc4a3f0` feat: 新增 dsh-quote-context 聊天引用插件
  - `e32356a` chore: 补充仓库元数据与测试断言
  - `473f907` chore: 清理测试加载器未用导入
  - `17619e0` fix: 评论批注改为可选并同步验证报告
  - `2aa05d0` fix: 对齐 DeepSeek 蓝与输入卡圆角，修复多引用 ref 泄漏
- 工作区 clean（`git status --short` 为空）。
- GitHub 推送：**未完成**。本机 `gh auth status` 报 token invalid，且直连/代理访问 `api.github.com` 均返回 EOF；已尝试 `gh repo create dsh-quote-context --public --source . --push` 失败。需要用户重新 `gh auth login` 或提供可用网络后再推送。
- desktop profile：**未安装、未修改**，只做了文件级检查；实际安装/重启桌面端需先征得用户同意。
