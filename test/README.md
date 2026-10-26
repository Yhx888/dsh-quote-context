# test

纯 Node 回归网，无测试框架：

- `check.mjs`：manifest、exports、bundle patch、locale 对齐、图标、client bundle 特征。
- `quote.mjs`：线格式、坐标 base64url、\u203b 转义、ref 行尾正文兼容、芯片载荷空行。
- `render.mjs`：借 `dsh-quote-deck` 的最小 DOM 垫片渲染消息内引用卡。
- `dom.mjs`：最小 DOM/Range/MutationObserver/localStorage 垫片（MIT，来自 dsh-quote-deck）。

## 命令

```bash
npm test
```

## 红线

新增行为必须带断言；不许删断言或放宽期望值换绿。
