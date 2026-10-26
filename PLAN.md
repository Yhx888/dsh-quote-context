# dsh-quote-context 插件构造计划（v1）

> 2026-10-26 · lead 制定 · 执行会话：plugin-builder（创造模式工作法）
> 项目根：`C:\HOME\Project\DSH plugins`；目标 profile：先 web 开发，再 desktop 交付。

## 一、目标

把 OpenChamber 的「聊天引用」交互模式复刻成 DSH 原生插件：**在消息里选中一段文字 → 引用/评论 → 引用进入输入框上方的引用区 → 发送后消息里出现可跳回的引用块**。视觉必须长在 DSH 里（沿用输入卡、品牌蓝、发丝线、圆角与字号），不搬运 OpenChamber 的视觉。

## 二、OpenChamber 的引用模式（本机实测依据）

安装位置：`C:\Users\YHX\AppData\Local\Programs\@openchamberelectron\resources\web-dist\assets`。
英文文案与键名集中在 `katex.min-C-YMeAHf.js`（偏移 2734198 起），可确认的行为：

| 环节 | OpenChamber 行为 | 文案键 |
|---|---|---|
| 选区浮条 | 选中文字后浮出动作：引用 / 评论 / 朗读 / By the way… / 加入笔记 | `chat.textSelection.actions.addToInput` = Quote、`.comment` = Comment |
| 评论 | 浮条变成内联评论框，可写可选批注后附加 | `chat.textSelection.comment.placeholder` = "Add an optional comment..." |
| 输入区 | 输入框上方有「Chat quotes」聚合区，可整组移除；上下文预览显示 Selected text / User comment，可编辑、删除 | `chat.chatInput.chatQuoteContext`、`contextPreview.*` |
| 发送后 | 消息里渲染引用块：「Quoted from an earlier message」，可「Show in the original message」跳回原文 | `chat.message.context.chatQuote`、`showQuoteSource` |
| 文件引用 | 文件内选区显示「Selection from {file}」 | `chat.message.context.fileQuote` |
| 代码注释 | 「Comment on {file}, lines x-y」 | `chat.message.context.codeComment` |

**MVP 复刻范围**：选区浮条（引用 / 评论）、输入框上方引用区（序号 + 单行原文 + 批注 + 删除）、发送后消息内引用块（点击跳回原文并高亮）。
**形态裁定（2026-10-26 用户拍板的 B 口径）**：引用与评论统一创建 QuoteItem 并进入输入框上方常驻引用区；输入框正文不插入任何引用文本（保持干净）。评论 = 浮条内联 textarea 写可选批注，引用 = 无批注直接进区；引用区是常驻卡片列表，插在 `[data-composer-card]` 前，输入卡尺寸不变、只让上方内容上移。
**暂不做**（记入 BACKLOG）：文件/终端/PR/浏览器标注等其它上下文类型、朗读、加入笔记、BTW 草稿、右侧引用清单。

## 三、成品定义

- 包名：`dsh-quote-context`（可改，但先固定，避免中途改名）
- 形态：client-only 插件（host 半只留空壳），与 `dsh-quote-deck` 同构
- 目录：`C:\HOME\Project\DSH plugins\dsh-quote-context\`
- 基线参考：`C:\HOME\Project\DSH plugins\dsh-quote-deck`（MIT，fork 自 dsh-client-ui-quote，已在 DSH 0.2.1-rc.3 验证过选区/线格式/芯片/高亮），**读它、复用它的 codec 与槽位做法，但按 OpenChamber 的信息架构重写 UI 层**
- 语言：全部中文注释与文案；纯 Node，不引入 Python/构建链

## 四、技术设计

### 4.1 挂载与注入

- `package.json`：`dsh.bundle.patch` + `dsh.client { platform: "web", inject: ["@deepseek-ai/dsh-client-ui-slots"] }`
- client 半 `exports.inject = ["slots", "locale"]`（与 quote-deck 一致，0.2.1-rc.3 实测可用；**不要**引用 `@deepseek-ai/dsh-client-runtime`，本版本不存在）
- `cordis.patch.yml`：`- insert: [{ id: quote-context, name: dsh-quote-context }]`

### 4.2 数据模型

```ts
QuoteItem = {
  id: string            // 会话内自增或 uuid
  text: string          // 原文（可多行，展示时截断）
  sourceMessageId: string
  sourceKey: string     // 用于跳回与高亮的稳定键（复用 quote-deck 的 sourceKeyOf）
  comment?: string      // 可选批注
}
```

草稿期存在客户端 store；发送时序列化进消息正文（模型可见）。

### 4.3 线格式（wire）

沿用 quote-deck 已验证的 `> ❝ …\n> ❞` 块格式（模型可读、可多段、可带批注），发送后由渲染层解析成引用块。
若研究阶段发现 DSH 原生 reference-chip 更合适，可替换，但必须先跑通「发送-回读-跳回」闭环再定稿。

### 4.4 三个 UI 面（全部用 DSH 设计语言）

1. **选区浮条**：选中消息/文件预览里的文字 → 浮出胶囊，两个动作「引用」「评论」。定位避开选区，Esc 关闭。
2. **引用区**：输入卡上方一层卡片（不挤压输入区），标题「引用」，每条 = 序号 + 单行原文 + 批注（可编辑）+ 删除；多条时纵向排列，超长省略。
3. **消息内引用块**：发送后渲染「引用自先前的消息」+ 原文（多行折叠）+「在原消息中显示」；点击滚动到原消息并高亮对应片段。

样式规则：只用 DSH 的 CSS 变量（背景/前景/边线/圆角/字号），品牌蓝沿用 quote-deck 的 `#4176e6` 与深色同色相提亮；不新增色板、不写死尺寸。

### 4.5 跳回与高亮

复用 quote-deck 的「发送后胶囊 + 悬停卡 + 跳回 + 原文高亮」实现，改为 OpenChamber 的引用块外观。跳回失败（原文被编辑）时降级为纯文本并提示。

## 五、实施阶段（每阶段产出可复核证据）

| 阶段 | 内容 | 通过标准 |
|---|---|---|
| P0 研究 | clone `github.com/openchamber/openchamber` 到 `_research/openchamber`，定位 quote 组件/状态机；读 DSH 槽位 README 与 quote-deck 源码 | 产出 `RESEARCH.md`：行为对照表 + 可用槽位清单 + 复用/重写决策 |
| P1 骨架 | 建包、挂载、空面板 | web profile 热装有插件记录、控制台无报错 |
| P2 选区浮条 | 选区检测 + 两个动作 + Esc | 选中任意消息文字能浮出并关闭 |
| P3 引用区 | 卡片列表、增删改批注、序号 | 增删后序号连续、输入区尺寸不变 |
| P4 发送渲染 | 线格式序列化、消息内引用块、跳回高亮 | 发送→刷新→回读→跳回全通 |
| P5 打磨 | 键盘、深/浅色、长文本、错误态、i18n | 手工清单逐项过 |
| P6 交付 | 测试、README/CHANGELOG、git 仓库、安装报告 | 测试全绿 + 端到端录像/截图 |

## 六、验收清单

1. 消息内选中文字 → 浮条出现，位置正确，Esc 可关。
2. 「引用」→ 文字进入输入框上方引用区，输入区高度不被压缩。
3. 「评论」→ 可写批注，确认后引用 + 批注一起进引用区。
4. 引用区可编辑批注、可删除，序号自动重排。
5. 发送后消息里出现「引用自先前的消息」引用块，内容与原文一致。
6. 点「在原消息中显示」能滚到原消息并高亮原文。
7. 深浅主题下颜色、边框、间距与 DSH 输入卡一致。
8. 刷新会话后引用块仍可解析、可跳回。
9. `node --check` 通过；DOM 测试（借用 quote-deck 的 test harness）全绿。
10. web profile 真实模型一轮对话验证通过；desktop profile 文件级验证通过。

## 七、风险与备选

- **DSH 0.2.1-rc.3 API 漂移**：P0 先做可行性 spike，确认所有 inject 服务与槽位存在；不存在则退回"只用 slots + DOM 观察"的最小方案。
- **与内置 `dsh-client-ui-reference`（@ 引用）冲突**：使用独立 slot id 与独立浮条，不复用其 trigger。
- **与 `dsh-quote-deck` 同装冲突**：二者都是选区引用，明确二选一；本插件开发期不注册 quote-deck。
- **消息正文被模型改写**：线格式解析失败时降级为普通引用文本，不阻断发送。
- **长引用破坏布局**：卡片单行截断 + 展开查看；消息内引用块折叠。

## 八、执行会话开工须知

必读文件（按顺序）：
1. `C:\HOME\Project\DSH plugins\AGENTS.md`（项目规则）
2. `C:\HOME\Project\DSH plugins\插件制作范式.md`（8 步流程）
3. 本文件 `PLAN.md`
4. 创造模式技能（按需读全文）：
   - `C:\Users\YHX\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-agent-preset\skills\cordis-plugin-development\SKILL.md`
   - `...\skills\editing-cordis-compositions\SKILL.md`
   - `...\skills\agent-experience\SKILL.md`

硬规则：
- 每轮编辑前重读磁盘当前内容；最小增量编辑。
- 不删、不动其它插件；不重启桌面端（要先问用户）。
- 纯 Node 实现；不引入未使用依赖；注释写"为什么"。
- 每阶段给出可复核证据（命令输出/截图/测试结果）。
- 完成后按 Obsidian 记忆协议追加 log.md 与 brain 分片。

## 九、交付物

- `dsh-quote-context/` 完整源码（package.json、cordis.patch.yml、lib/index.js、lib/client.js、locale、test、docs、README、CHANGELOG）
- `RESEARCH.md`（P0 产出）
- 安装与验证报告（web + desktop 文件级）
- git 仓库（默认推送 GitHub）
