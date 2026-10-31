/**
 * dsh-quote-context — 在消息里选中文字，引用或评论。
 *
 * 引用不再写进输入框：它们收在输入卡顶部的「聊天引用 N」芯片里，悬停或
 * 点击展开预览浮层（所选文本 / 用户评论 / 逐条编辑删除）。发送的瞬间才把
 * 引用块拼进消息正文，所以输入框里永远只有用户自己的文字，Backspace 删不到
 * 任何引用。
 *
 * 全部代码是手写 ModuleLoader bundle，不依赖构建链。
 */
window.__ModuleLoader__.load({
	id: "dsh-quote-context",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");

		/** 本插件的 locale 命名空间。 */
		const NS = "ui-quote-context";

		/** 中文文案。 */
		const zh = {
			"quote": "引用",
			"comment": "评论",
			"quoteLabel": "引用",
			"commentPlaceholder": "写一条批注（可选）…",
			"addToChat": "添加到对话",
			"cancel": "取消",
			"confirm": "添加",
			"dockTitle": "引用",
			"dockCount": "{n} 条",
			"dockClear": "清空",
			"edit": "编辑批注",
			"save": "保存",
			"remove": "移除这条引用",
			"quoteMeta": "{lines} 行",
			"sourceFrom": "引用自先前的消息",
			"showSource": "在原消息中显示",
			"sourceLost": "原文已变，无法定位",
			"jumpFailed": "原文不在当前视图里",
			"failed": "操作失败，请重试",
			"commentEmpty": "写一句批注再添加",
			"dockEditPlaceholder": "写一条批注…",
			"quoteTooLong": "引用太长，已截断到 {n} 字",
			"emptyQuote": "没有可引用的文字",
			"expand": "展开",
			"collapse": "收起",
			"chipLabel": "聊天引用",
			"chipTitle": "聊天引用 · {n} 条",
			"selectedText": "所选文本",
			"userComment": "用户评论",
			"addComment": "添加评论…",
			"editComment": "编辑评论",
			"saveComment": "保存评论",
			"cancelEdit": "取消编辑",
			"clearAll": "清空",
			"commandQuotes": "命令消息不附带引用，引用会留在输入卡上",
			"foldFailed": "引用没能折进消息，已退回输入卡"
		};

		/** 英文文案。 */
		const en = {
			"quote": "Quote",
			"comment": "Comment",
			"quoteLabel": "Quote",
			"commentPlaceholder": "Add an optional comment…",
			"addToChat": "Add to chat",
			"cancel": "Cancel",
			"confirm": "Add",
			"dockTitle": "Quotes",
			"dockCount": "{n}",
			"dockClear": "Clear",
			"edit": "Edit comment",
			"save": "Save",
			"remove": "Remove this quote",
			"quoteMeta": "{lines} lines",
			"sourceFrom": "Quoted from an earlier message",
			"showSource": "Show in the original message",
			"sourceLost": "The source has changed",
			"jumpFailed": "The source is not in view right now",
			"failed": "Could not do that, try again",
			"commentEmpty": "Write a comment first",
			"dockEditPlaceholder": "Write a comment…",
			"quoteTooLong": "The quote was too long; cut to {n} characters",
			"emptyQuote": "Nothing to quote",
			"expand": "Expand",
			"collapse": "Collapse",
			"chipLabel": "Chat quotes",
			"chipTitle": "Chat quotes · {n}",
			"selectedText": "Selected text",
			"userComment": "Your comment",
			"addComment": "Add a comment…",
			"editComment": "Edit comment",
			"saveComment": "Save comment",
			"cancelEdit": "Cancel edit",
			"clearAll": "Clear",
			"commandQuotes": "A command message carries no quotes; they stay on the composer",
			"foldFailed": "The quotes could not fold into the message; they are back on the composer"
		};

		/** 插件名，ModuleLoader 与样式标记共用。 */
		const PLUGIN_ID = "dsh-quote-context";

		/** 每个会话在宿主输入框里的能力面；由不可见桥接组件写入。 */
		const sessions = new Map();

		/** 当前插件的 ctx，供读取宿主服务用。 */
		let pluginCtx = null;

		/** 把 props 里的翻译函数包成带默认回退的版本。 */
		function translateFor(sessionId, key) {
			const entry = typeof sessionId === "string" ? sessions.get(sessionId) : undefined;
			if (entry !== undefined && entry !== null) {
				const value = entry.translate(key);
				if (typeof value === "string" && value !== "") return value;
			}
			return zh[key] === undefined ? key : zh[key];
		}

		/** 文本里替换 {n} 这类占位。 */
		function withCount(text, count) {
			return String(text).replace("{n}", String(count));
		}

		/**
		 * 不可见桥接：宿主在 conversation.input.overlay 里渲染它，并把
		 * sessionId、inputActions、t 作为 props 传进来。引用芯片与浮层是文档级
		 * 单例，必须靠这张表找到"当前看得见的会话"对应的输入框。
		 */
		function QuoteBridge(props) {
			const latest = react.useRef(props);
			latest.current = props;

			react.useEffect(() => {
				const sessionId = props.sessionId;
				if (typeof sessionId !== "string") return undefined;
				const entry = {
					actions: () => {
						const actions = latest.current === null || latest.current === undefined ? null : latest.current.inputActions;
						return actions === null || actions === undefined ? null : actions;
					},
					translate: (key) => {
						const t = latest.current === null || latest.current === undefined ? null : latest.current.t;
						if (typeof t === "function") return t(key);
						return zh[key] === undefined ? key : zh[key];
					},
				};
				sessions.set(sessionId, entry);
				renderComposer(sessionId);
				return () => {
					if (sessions.get(sessionId) === entry) sessions.delete(sessionId);
					renderComposer(sessionId);
				};
			}, [props.sessionId]);

			return null;
		}

		/* ------------------------------------------------------------------ *
		 * 常量与文档级状态
		 * ------------------------------------------------------------------ */

		const BAR_ID = "dsh-quote-context-bar";
		const STYLE_ID = "dsh-quote-context-style";
		const TOAST_ID = "dsh-quote-context-toast";
		const PANEL_ID = "dsh-quote-context-panel";
		const CONTENT_SELECTOR = "[data-conversation-content]";
		const CARD_SELECTOR = "[data-composer-card]";
		const COMPOSER_SELECTOR = "[data-composer-input]";
		const GAP = 8;
		const EDGE = 8;
		const SETTLE_MS = 180;
		const TOAST_MS = 1800;
		const PANEL_CLOSE_MS = 420;
		const PANEL_AUTO_MS = 2400;
		const PANEL_MAX_WIDTH = 560;
		/** 只有引用没有正文时用来点亮发送按钮的零宽标记。 */
		const DRAFT_MARKER = "\u200B";

		/** 每个会话的待发引用。 */
		const draftQuotes = new Map();
		/** 当前选区浮条的状态。文档级单例，不分会话重复创建。 */
		const barState = {
			bar: null,
			quote: null,
			anchor: null,
			sessionId: null,
			mode: null,
			settle: null,
			suppress: false,
			pointerOnTranscript: false,
			toastTimer: null,
		};
		/** 输入卡里的芯片与预览浮层。 */
		const composerState = {
			anchors: new Map(),
			panel: null,
			sessionId: null,
			open: false,
			pinned: false,
			hover: false,
			editing: null,
			fresh: null,
			closeTimer: null,
			autoTimer: null,
			syncTimer: null,
			observer: null,
			ticker: null,
		};
		/** 发送瞬间折叠出去的引用，等待宿主确认或退回。 */
		const folds = new Map();

		/** 浮条、芯片、浮层、消息块与提示共用的一份样式。 */
		const STYLE_TEXT = [
			"body{--dshq-accent:var(--dsw-static-deepseek-500,#4176e6);--dshq-accent-soft:color-mix(in srgb,var(--dsw-static-deepseek-500,#4176e6) 12%,transparent);--dshq-accent-hover:var(--dsw-alias-button-info-hover,#7aaaff)}",
			"body[data-ds-dark-theme]{--dshq-accent:var(--dsw-static-deepseek-450,#5686fe);--dshq-accent-soft:color-mix(in srgb,var(--dsw-static-deepseek-450,#5686fe) 18%,transparent);--dshq-accent-hover:var(--dsw-static-deepseek-400,#7aaaff)}",
			"#dsh-quote-context-bar{position:fixed;z-index:80;box-sizing:border-box;display:flex;align-items:center;gap:4px;padding:4px;border-radius:999px;background:var(--dsw-menu-surface-fill,var(--dsw-alias-bg-overlay,#fff));-webkit-backdrop-filter:var(--dsw-menu-backdrop-filter,blur(40px) saturate(150%));backdrop-filter:var(--dsw-menu-backdrop-filter,blur(40px) saturate(150%));border:.5px solid var(--dsw-alias-border-l1,rgba(15,23,42,.14));box-shadow:var(--dsw-elevation-panel);color:var(--dsw-alias-label-primary,#0f1115);font-family:inherit;animation:qctx-bar-in .14s cubic-bezier(.2,.8,.25,1)}",
			"@keyframes qctx-bar-in{from{opacity:0;transform:translateY(2px) scale(.985)}to{opacity:1;transform:none}}",
			"#dsh-quote-context-bar[data-visible=false]{display:none}",
			"#dsh-quote-context-bar[data-mode=comment]{display:block;border-radius:16px;background:var(--dsw-menu-surface-fill,var(--dsw-alias-bg-overlay,#fff));border-color:var(--dsw-alias-border-l1,rgba(15,23,42,.14))}",
			"#dsh-quote-context-bar .qctx-bar-btn{box-sizing:border-box;min-height:0;min-width:0;display:inline-flex;align-items:center;height:28px;padding:0 12px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:500;line-height:20px;cursor:pointer;white-space:nowrap;transition:background-color .15s ease,color .15s ease,opacity .15s ease}",
			"#dsh-quote-context-bar .qctx-bar-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(15,23,42,.06))}",
			"#dsh-quote-context-bar .qctx-bar-btn[data-action=quote]{color:var(--dshq-accent,#4176e6)}",
			"#dsh-quote-context-bar .qctx-bar-sep{width:.5px;height:16px;margin:0 4px;background:var(--dsw-alias-border-l1,rgba(15,23,42,.14));flex:none}",
			"#dsh-quote-context-bar .qctx-comment-box{display:flex;flex-direction:column;gap:8px;width:300px;max-width:calc(100vw - 32px);padding:10px 12px 12px;border-radius:16px}",
			"#dsh-quote-context-bar .qctx-comment-input{box-sizing:border-box;width:100%;min-height:52px;max-height:160px;padding:4px 2px;border:0;border-radius:0;background:transparent;color:inherit;font:inherit;font-size:13px;line-height:20px;resize:none;outline:none}",
			"#dsh-quote-context-bar .qctx-comment-input::placeholder{color:var(--dsw-alias-label-caption,rgba(15,23,42,.4))}",
			"#dsh-quote-context-bar .qctx-comment-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px}",
			"#dsh-quote-context-bar .qctx-comment-actions .qctx-bar-btn{height:28px;padding:0 12px;font-size:12px;line-height:18px}",
			"#dsh-quote-context-bar .qctx-comment-actions .qctx-bar-btn[data-action=confirm]{background:var(--dshq-accent,#4176e6);color:var(--dsw-alias-label-primary-foreground,#fff)}",
			"#dsh-quote-context-bar .qctx-comment-actions .qctx-bar-btn[data-action=confirm]:hover{background:var(--dshq-accent-hover,#7aaaff)}",
			"#dsh-quote-context-bar .qctx-comment-actions .qctx-bar-btn[data-action=confirm]:disabled{opacity:.45;cursor:default}",
			"#dsh-quote-context-toast{position:fixed;z-index:90;transform:translateX(-50%);box-sizing:border-box;max-width:320px;padding:8px 12px;border-radius:12px;background:var(--dsw-alias-toast-bg,rgba(15,23,42,.92));color:var(--dsw-alias-toast-label,#fff);font:inherit;font-size:12px;line-height:18px;box-shadow:var(--dsw-elevation-prominent,0 10px 24px rgba(15,23,42,.2));display:none}",
			".qctx-anchor{order:-1;box-sizing:border-box;display:flex;align-items:center;gap:8px;min-width:0;padding:0 12px}",
			".qctx-chip{box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;height:28px;min-height:0;min-width:0;margin:0;padding:0 9px;border:.5px solid var(--dsw-alias-border-l1,rgba(15,23,42,.1));border-radius:9px;background:color-mix(in srgb,var(--dsw-alias-label-primary,#0f1115) 2%,transparent);color:var(--dsw-alias-label-secondary,rgba(15,23,42,.62));font:inherit;font-size:12px;font-weight:400;line-height:18px;cursor:pointer;-webkit-user-select:none;user-select:none;transition:background-color .14s ease,color .14s ease,border-color .14s ease}",
			".qctx-chip:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(15,23,42,.06));border-color:var(--dsw-alias-border-l2,rgba(15,23,42,.14));color:var(--dsw-alias-label-primary,#0f1115)}",
			".qctx-chip[data-open=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(15,23,42,.06));border-color:var(--dsw-alias-border-l2,rgba(15,23,42,.14));color:var(--dsw-alias-label-primary,#0f1115)}",
			".qctx-chip svg{flex:none;width:14px;height:14px}",
			".qctx-chip-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".qctx-chip-count{font-weight:600;color:var(--dshq-accent,#4176e6);font-variant-numeric:tabular-nums}",
			".qctx-chip-chevron{flex:none;width:12px;height:12px;color:var(--dsw-alias-label-caption,rgba(15,23,42,.4));transition:transform .16s ease}",
			".qctx-chip[data-open=true] .qctx-chip-chevron{transform:rotate(180deg)}",
			".qctx-panel{position:fixed;z-index:80;box-sizing:border-box;display:flex;flex-direction:column;min-width:0;border-radius:14px;background:var(--dsw-specific-input-major,#fbfcfd);-webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);box-shadow:0 1px 2px rgba(15,23,42,.06),0 14px 36px -10px rgba(15,23,42,.22),inset 0 1px 0 rgba(255,255,255,.45);border:.5px solid var(--dsw-alias-border-l1,rgba(15,23,42,.1));color:var(--dsw-alias-label-primary,#0f1115);font-family:var(--dsw-font-family,inherit);overflow:hidden;transform-origin:bottom left;animation:qctx-panel-in .16s cubic-bezier(.2,.8,.25,1)}",
			"@keyframes qctx-panel-in{from{opacity:0;transform:translateY(4px) scale(.985)}to{opacity:1;transform:none}}",
			".qctx-panel[data-visible=false]{display:none}",
			"body[data-ds-dark-theme] .qctx-panel{box-shadow:0 1px 2px rgba(0,0,0,.28),0 16px 40px -12px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.05)}",
			".qctx-panel-scroll{flex:0 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}",
			".qctx-panel-scroll::-webkit-scrollbar{width:8px}",
			".qctx-panel-scroll::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l2,rgba(15,23,42,.18));border-radius:999px}",
			".qctx-panel-scroll::-webkit-scrollbar-track{background:transparent}",
			".qctx-entry{position:relative}",
			".qctx-entry+.qctx-entry{border-top:.5px solid var(--dsw-alias-border-l1,rgba(15,23,42,.1))}",
			".qctx-entry-head{display:flex;align-items:center;gap:6px;padding:6px 8px 6px 12px;background:color-mix(in srgb,var(--dsw-alias-label-primary,#0f1115) 3%,transparent);transition:background-color .3s ease}",
			".qctx-entry[data-fresh=true] .qctx-entry-head{background:var(--dshq-accent-soft)}",
			".qctx-entry-index{flex:none;font-size:11px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-caption,rgba(15,23,42,.4));font-variant-numeric:tabular-nums}",
			".qctx-entry-title{min-width:0;flex:1 1 auto;font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary,rgba(15,23,42,.62));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".qctx-entry-tools{display:flex;align-items:center;gap:2px;flex:none;margin-inline-start:auto}",
			".qctx-icon-btn{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;min-height:0;min-width:0;padding:0;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-caption,rgba(15,23,42,.4));cursor:pointer;opacity:0;transition:opacity .12s ease,background-color .12s ease,color .12s ease}",
			".qctx-icon-btn svg{width:13px;height:13px}",
			".qctx-entry:hover .qctx-icon-btn,.qctx-entry:focus-within .qctx-icon-btn{opacity:1}",
			".qctx-icon-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(15,23,42,.06));color:var(--dsw-alias-label-primary,#0f1115)}",
			".qctx-icon-btn[data-danger=true]:hover{background:var(--dsw-alias-interactive-bg-hover-danger,rgba(239,68,68,.12));color:var(--dsw-alias-state-error-primary,#dc2626)}",
			".qctx-entry-body{display:flex;flex-direction:column;gap:3px;padding:8px 12px 10px}",
			".qctx-entry-label{font-size:10px;line-height:16px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-caption,rgba(15,23,42,.4));opacity:.85}",
			".qctx-entry-quote{display:block;box-sizing:border-box;width:100%;min-width:0;margin:0;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary,#0f1115);font:inherit;font-size:13px;line-height:20px;text-align:start;white-space:pre-wrap;word-break:break-word;cursor:pointer;transition:color .14s ease}",
			".qctx-entry-quote:hover{color:var(--dshq-accent,#4176e6);text-decoration:underline;text-underline-offset:2px;text-decoration-color:var(--dshq-accent-soft)}",
			".qctx-entry-comment{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#0f1115);white-space:pre-wrap;word-break:break-word}",
			".qctx-entry-comment[data-empty=true]{color:var(--dsw-alias-label-caption,rgba(15,23,42,.4));cursor:pointer}",
			".qctx-entry-comment[data-empty=true]:hover{color:var(--dshq-accent,#4176e6)}",
			".qctx-entry-edit{box-sizing:border-box;width:100%;min-height:52px;max-height:180px;margin:0;padding:6px 8px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:13px;line-height:20px;resize:none;outline:none;box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l2,rgba(15,23,42,.14));transition:box-shadow .14s ease}",
			".qctx-entry-edit:focus{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-label-primary,#0f1115) 26%,transparent)}",
			".qctx-entry-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px;margin-top:2px}",
			".qctx-entry-btn{height:24px;min-height:0;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,rgba(15,23,42,.62));font:inherit;font-size:12px;line-height:18px;cursor:pointer;transition:background-color .12s ease,color .12s ease}",
			".qctx-entry-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(15,23,42,.06));color:var(--dsw-alias-label-primary,#0f1115)}",
			".qctx-entry-btn[data-primary=true]{background:var(--dshq-accent,#4176e6);color:var(--dsw-alias-label-primary-foreground,#fff)}",
			".qctx-entry-btn[data-primary=true]:hover{background:var(--dshq-accent-hover,#7aaaff)}",
			".qctx-panel-foot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:5px 10px;border-top:.5px solid var(--dsw-alias-border-l1,rgba(15,23,42,.1));background:color-mix(in srgb,var(--dsw-alias-label-primary,#0f1115) 3%,transparent)}",
			".qctx-foot-btn{height:24px;min-height:0;padding:0 8px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,rgba(15,23,42,.62));font:inherit;font-size:12px;line-height:18px;cursor:pointer}",
			".qctx-foot-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(15,23,42,.06));color:var(--dsw-alias-label-primary,#0f1115)}",
			".qctx-quote-card{box-sizing:border-box;max-width:100%;margin:6px 0 10px;padding:0;border:0;background:transparent;font-family:inherit}",
			".qctx-quote-main{min-width:0;padding-inline-start:12px;border-inline-start:2px solid var(--dsw-alias-border-l2,rgba(15,23,42,.14))}",
			".qctx-quote-card[data-has-body=true] .qctx-quote-main{cursor:pointer}",
			".qctx-quote-head{display:flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-caption,rgba(15,23,42,.48))}",
			".qctx-quote-head>svg{flex:none;width:13px;height:13px;opacity:.9}",
			".qctx-quote-title{min-width:0;flex:0 1 auto;font-weight:400;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--dsw-alias-label-secondary,rgba(15,23,42,.62))}",
			".qctx-quote-reveal{flex:none;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;min-height:0;min-width:0;padding:0;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-caption,rgba(15,23,42,.48));cursor:pointer;transition:background-color .12s ease,color .12s ease}",
			".qctx-quote-reveal:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(15,23,42,.06));color:var(--dsw-alias-label-primary,#0f1115)}",
			".qctx-quote-reveal svg{width:13px;height:13px}",
			".qctx-quote-body{margin-top:2px;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary,rgba(15,23,42,.62));display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}",
			".qctx-quote-card[data-expanded=true] .qctx-quote-body{display:block;-webkit-line-clamp:unset;overflow:visible}",
			".qctx-quote-comment{margin-top:6px;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#0f1115)}",
			".qctx-quote-loose{display:block;white-space:pre-wrap;word-break:break-word}",
			".qctx-flash-layer{position:fixed;inset:0;pointer-events:none;z-index:75}",
			".qctx-flash-mark{position:fixed;border-radius:4px;background:color-mix(in srgb,var(--dshq-accent,#4176e6) 28%,transparent);animation:qctx-flash 1.6s ease-out forwards}",
			"@keyframes qctx-flash{0%{opacity:1}80%{opacity:1}100%{opacity:0}}",
			"#dsh-quote-context-toast[data-visible=true]{display:block}"
		].join("\n");

		function ensureStyle(doc) {
			if (doc === undefined || doc === null) return;
			if (doc.getElementById(STYLE_ID) !== null) return;
			const style = doc.createElement("style");
			style.id = STYLE_ID;
			style.setAttribute("data-plugin", PLUGIN_ID);
			style.textContent = STYLE_TEXT;
			(doc.head === null || doc.head === undefined ? doc.documentElement : doc.head).appendChild(style);
		}

		/* ------------------------------------------------------------------ *
		 * 小工具
		 * ------------------------------------------------------------------ */

		const SVG_NS = "http://www.w3.org/2000/svg";
		/** 线性图标路径；16×16 视图，描边 1.5。 */
		const ICONS = {
			chat: "M2.9 4.2c0-.9.7-1.6 1.6-1.6h7c.9 0 1.6.7 1.6 1.6v4.2c0 .9-.7 1.6-1.6 1.6H7.1L4.2 12.6v-2.6h-.1c-.7 0-1.2-.6-1.2-1.3z",
			pencil: "M11.2 2.6l2.2 2.2-7.4 7.4-2.9.7.7-2.9z",
			trash: "M2.8 4.4h10.4M6.4 4.4V2.9h3.2v1.5M4.4 4.4l.6 8.2h6l.6-8.2",
			chevron: "M4 6.2l4 3.8 4-3.8",
			arrowUp: "M8 12.4V3.8M4.6 7.2L8 3.8l3.4 3.4"
		};

		/** 造一个描边 SVG 图标；没有 SVG 能力时退回文字占位。 */
		function iconNode(name, className) {
			const doc = document;
			const path = ICONS[name];
			if (typeof doc.createElementNS === "function" && typeof path === "string") {
				const svg = doc.createElementNS(SVG_NS, "svg");
				svg.setAttribute("viewBox", "0 0 16 16");
				svg.setAttribute("fill", "none");
				svg.setAttribute("stroke", "currentColor");
				svg.setAttribute("stroke-width", "1.5");
				svg.setAttribute("stroke-linecap", "round");
				svg.setAttribute("stroke-linejoin", "round");
				svg.setAttribute("aria-hidden", "true");
				if (typeof className === "string" && className !== "") svg.setAttribute("class", className);
				const shape = doc.createElementNS(SVG_NS, "path");
				shape.setAttribute("d", path);
				svg.append(shape);
				return svg;
			}
			const fallback = doc.createElement("span");
			fallback.setAttribute("aria-hidden", "true");
			if (typeof className === "string" && className !== "") fallback.className = className;
			fallback.textContent = "•";
			return fallback;
		}

		function clamp(value, min, max) {
			return Math.min(Math.max(value, min), Math.max(min, max));
		}

		function closestFrom(node, selector) {
			if (node === null || node === undefined) return null;
			let element = node.nodeType === 1 ? node : node.parentElement;
			if (element === null || element === undefined || typeof element.closest !== "function") return null;
			return element.closest(selector);
		}

		function insideBar(node) {
			return closestFrom(node, "#" + BAR_ID + ", #" + TOAST_ID) !== null;
		}

		/** 把一段文字里目标串出现的次数数出来，用于同文本多次出现时选第几个。 */
		function occurrenceCount(haystack, needle) {
			const text = String(haystack);
			const target = String(needle);
			if (target === "") return 0;
			let count = 0;
			let at = text.indexOf(target);
			while (at !== -1) {
				count += 1;
				at = text.indexOf(target, at + 1);
			}
			return count;
		}

		/** 选区矩形在视觉视口里的副本；getBoundingClientRect 直接返回也能用。 */
		function rectOf(range) {
			if (range === null || range === undefined || typeof range.getBoundingClientRect !== "function") return null;
			let rect = range.getBoundingClientRect();
			if (rect === null || rect === undefined || (rect.width === 0 && rect.height === 0)) {
				const rects = typeof range.getClientRects === "function" ? range.getClientRects() : null;
				rect = rects === null || rects.length === 0 ? null : rects[0];
			}
			if (rect === null || rect === undefined) return null;
			return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
		}

		/**
		 * 读取当前选区。只在 [data-conversation-content] 里生效；输入卡、引用
		 * 浮层和浮条自己的文字都不算。返回选区原文、会话、锚点行和同文本序号。
		 */
		function readSelection() {
			const selection = document.getSelection === undefined ? null : document.getSelection();
			if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return null;
			const range = selection.getRangeAt(0);
			if (closestFrom(range.startContainer, CARD_SELECTOR) !== null) return null;
			if (closestFrom(range.endContainer, CARD_SELECTOR) !== null) return null;
			if (closestFrom(range.startContainer, "[data-qctx]") !== null) return null;
			const host = closestFrom(range.startContainer, CONTENT_SELECTOR);
			if (host === null) return null;
			let sessionId = host.getAttribute("data-conversation-session");
			if (typeof sessionId !== "string" || sessionId === "") {
				const active = document.querySelector(CONTENT_SELECTOR + "[data-conversation-session]");
				sessionId = active === null ? null : active.getAttribute("data-conversation-session");
			}
			if (typeof sessionId !== "string" || sessionId === "") return null;
			const text = String(selection.toString()).replace(/\u00a0/gu, " ").replace(/^\s+|\s+$/gu, "");
			if (text === "") return null;
			const rect = rectOf(range);
			if (rect === null || (rect.width === 0 && rect.height === 0)) return null;
			const row = closestFrom(range.startContainer, "[data-chat-anchor-key]");
			let ordinal = 1;
			let prefix = "";
			let suffix = "";
			if (row !== null) {
				try {
					const before = document.createRange();
					before.setStart(row, 0);
					before.setEnd(range.startContainer, range.startOffset);
					const beforeText = before.toString();
					const rowText = String(row.textContent || "");
					ordinal = occurrenceCount(beforeText, text) + 1;
					prefix = rowText.slice(Math.max(0, beforeText.length - 32), beforeText.length);
					suffix = rowText.slice(beforeText.length + text.length, beforeText.length + text.length + 32);
				} catch (error) {
					ordinal = 1;
				}
			}
			return {
				text: text,
				sessionId: sessionId,
				anchor: {
					key: row === null ? "" : String(row.getAttribute("data-chat-anchor-key") || ""),
					nodeKey: row === null ? "" : String(row.getAttribute("data-chat-node-key") || ""),
					turn: row === null ? "" : String(row.getAttribute("data-chat-turn") || ""),
					ordinal: ordinal,
					prefix: prefix,
					suffix: suffix,
				},
				rect: rect,
			};
		}
		
		/* ------------------------------------------------------------------ *
		 * 划词浮条
		 * ------------------------------------------------------------------ */

		function ensureBar() {
			ensureStyle(document);
			if (barState.bar !== null && barState.bar.isConnected) return barState.bar;
			const bar = document.createElement("div");
			bar.id = BAR_ID;
			bar.setAttribute("data-visible", "false");
			bar.addEventListener("mousedown", onBarMouseDown);
			bar.addEventListener("click", onBarClick);
			document.body.appendChild(bar);
			barState.bar = bar;
			return bar;
		}

		function onBarMouseDown(event) {
			const target = event.target;
			const tag = target === null || target === undefined ? "" : String(target.tagName || "").toLowerCase();
			if (tag === "textarea" || tag === "input") return;
			event.preventDefault();
		}

		function onBarClick(event) {
			const target = closestFrom(event.target, "[data-action]");
			if (target === null) return;
			const action = target.getAttribute("data-action");
			if (action === "quote") commitQuote("");
			else if (action === "comment") openComment();
			else if (action === "cancel") hideBar();
			else if (action === "confirm") {
				const input = barState.bar === null ? null : barState.bar.querySelector(".qctx-comment-input");
				commitQuote(input === null ? "" : String(input.value || ""));
			}
		}

		function renderMenu() {
			const bar = ensureBar();
			bar.setAttribute("data-mode", "menu");
			bar.setAttribute("role", "menu");
			bar.setAttribute("aria-label", translateFor(barState.sessionId, "quoteLabel"));
			bar.replaceChildren();
			const quote = document.createElement("button");
			quote.type = "button";
			quote.className = "qctx-bar-btn";
			quote.setAttribute("data-action", "quote");
			quote.setAttribute("role", "menuitem");
			quote.textContent = translateFor(barState.sessionId, "quote");
			const sep = document.createElement("span");
			sep.className = "qctx-bar-sep";
			const comment = document.createElement("button");
			comment.type = "button";
			comment.className = "qctx-bar-btn";
			comment.setAttribute("data-action", "comment");
			comment.setAttribute("role", "menuitem");
			comment.textContent = translateFor(barState.sessionId, "comment");
			bar.append(quote, sep, comment);
			bar.setAttribute("data-visible", "true");
		}

		function renderCommentBox() {
			const bar = ensureBar();
			bar.setAttribute("data-mode", "comment");
			bar.setAttribute("role", "dialog");
			bar.setAttribute("aria-label", translateFor(barState.sessionId, "comment"));
			bar.replaceChildren();
			const box = document.createElement("div");
			box.className = "qctx-comment-box";
			const input = document.createElement("textarea");
			input.className = "qctx-comment-input";
			input.rows = 2;
			input.placeholder = translateFor(barState.sessionId, "commentPlaceholder");
			input.value = "";
			const actions = document.createElement("div");
			actions.className = "qctx-comment-actions";
			const cancel = document.createElement("button");
			cancel.type = "button";
			cancel.className = "qctx-bar-btn";
			cancel.setAttribute("data-action", "cancel");
			cancel.textContent = translateFor(barState.sessionId, "cancel");
			const confirm = document.createElement("button");
			confirm.type = "button";
			confirm.className = "qctx-bar-btn";
			confirm.setAttribute("data-action", "confirm");
			confirm.textContent = translateFor(barState.sessionId, "confirm");
			input.addEventListener("input", () => {
				input.style.height = "auto";
				const next = input.scrollHeight;
				if (Number.isFinite(next) && next > 0) input.style.height = Math.min(next, 160) + "px";
			});
			input.addEventListener("keydown", (event) => {
				if (event.isComposing === true) return;
				if (event.key === "Escape") {
					event.stopPropagation();
					hideBar();
					return;
				}
				if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
					event.preventDefault();
					commitQuote(String(input.value || ""));
				}
			});
			actions.append(cancel, confirm);
			box.append(input, actions);
			bar.append(box);
			bar.setAttribute("data-visible", "true");
			return input;
		}

		function positionBar() {
			const bar = barState.bar;
			const found = barState.quote;
			if (bar === null || found === null) return;
			bar.style.visibility = "hidden";
			bar.setAttribute("data-visible", "true");
			const viewport = window.visualViewport;
			const width = viewport === null || viewport === undefined ? window.innerWidth : viewport.width;
			const height = viewport === null || viewport === undefined ? window.innerHeight : viewport.height;
			const offsetLeft = viewport === null || viewport === undefined ? 0 : viewport.offsetLeft;
			const offsetTop = viewport === null || viewport === undefined ? 0 : viewport.offsetTop;
			const barWidth = bar.offsetWidth;
			const barHeight = bar.offsetHeight;
			const rect = found.rect;
			let left = rect.left + rect.width / 2 - barWidth / 2;
			left = clamp(left, offsetLeft + EDGE, offsetLeft + width - barWidth - EDGE);
			let top = rect.top - barHeight - GAP;
			if (top < offsetTop + EDGE) top = rect.bottom + GAP;
			top = clamp(top, offsetTop + EDGE, offsetTop + height - barHeight - EDGE);
			bar.style.left = Math.round(left) + "px";
			bar.style.top = Math.round(top) + "px";
			bar.style.visibility = "";
		}

		function showBar(found) {
			const bar = ensureBar();
			barState.quote = found;
			barState.sessionId = found.sessionId;
			barState.anchor = found.anchor;
			barState.mode = "menu";
			barState.suppress = false;
			renderMenu();
			positionBar();
		}

		function openComment() {
			const bar = ensureBar();
			barState.mode = "comment";
			renderCommentBox();
			positionBar();
			const input = bar.querySelector(".qctx-comment-input");
			if (input !== null) input.focus({ preventScroll: true });
		}

		function hideBar() {
			barState.mode = null;
			barState.quote = null;
			barState.anchor = null;
			barState.sessionId = null;
			barState.suppress = true;
			if (barState.bar !== null) {
				barState.bar.setAttribute("data-visible", "false");
				barState.bar.replaceChildren();
			}
			const selection = document.getSelection === undefined ? null : document.getSelection();
			if (selection !== null) selection.removeAllRanges();
		}

		/** 把焦点交回输入框，接着写正文。 */
		function focusComposer() {
			if (typeof document === "undefined") return;
			const editor = document.querySelector(COMPOSER_SELECTOR);
			if (editor === null) return;
			const editable = editor.querySelector('[contenteditable="true"]') || editor;
			if (editable !== null && typeof editable.focus === "function") editable.focus({ preventScroll: true });
		}

		function toast(text) {
			ensureStyle(document);
			let node = document.getElementById(TOAST_ID);
			if (node === null) {
				node = document.createElement("div");
				node.id = TOAST_ID;
				node.setAttribute("role", "status");
				node.setAttribute("aria-live", "polite");
				document.body.appendChild(node);
			}
			node.textContent = text;
			node.style.left = Math.round(window.innerWidth / 2) + "px";
			node.style.top = "24px";
			node.setAttribute("data-visible", "true");
			if (barState.toastTimer !== null) clearTimeout(barState.toastTimer);
			barState.toastTimer = setTimeout(() => {
				barState.toastTimer = null;
				node.setAttribute("data-visible", "false");
			}, TOAST_MS);
		}

		function refreshSelection() {
			if (barState.suppress === true) return;
			if (barState.mode === "comment") return;
			const found = readSelection();
			if (found === null) {
				if (barState.mode !== null) hideBar();
				return;
			}
			showBar(found);
		}

		function onSelectionChange() {
			if (insideBar(document.activeElement)) return;
			if (barState.settle !== null) clearTimeout(barState.settle);
			barState.settle = setTimeout(() => {
				barState.settle = null;
				refreshSelection();
			}, SETTLE_MS);
		}

		function onPointerDown(event) {
			if (insideBar(event.target)) return;
			barState.pointerOnTranscript = closestFrom(event.target, CONTENT_SELECTOR) !== null;
			barState.suppress = false;
		}

		function onPointerUp(event) {
			if (barState.pointerOnTranscript !== true) return;
			barState.pointerOnTranscript = false;
			if (insideBar(event.target)) return;
			barState.suppress = false;
			refreshSelection();
		}

		function onMouseDown(event) {
			if (insideBar(event.target)) return;
			const selection = document.getSelection === undefined ? null : document.getSelection();
			if (event.button === 0 && event.detail > 1 && selection !== null && selection.rangeCount === 1 && !selection.isCollapsed) {
				const range = selection.getRangeAt(0);
				const element = event.target !== null && event.target.nodeType === 1 ? event.target : event.target.parentElement;
				if (element !== null && typeof range.intersectsNode === "function" && range.intersectsNode(element)) return;
			}
			if (barState.mode !== null || barState.quote !== null) hideBar();
		}

		function onKeyDown(event) {
			if (event.key !== "Escape" || event.isComposing === true) return;
			if (insideBar(event.target)) return;
			hideBar();
		}

		function onScrollOrResize(event) {
			if (barState.mode === null) return;
			if (event !== undefined && insideBar(event.target)) return;
			if (barState.mode === "comment") positionBar();
			else hideBar();
		}

		let p2Listeners = false;
		function attachP2Listeners() {
			if (p2Listeners === true) return;
			p2Listeners = true;
			document.addEventListener("selectionchange", onSelectionChange);
			document.addEventListener("pointerdown", onPointerDown, true);
			document.addEventListener("pointerup", onPointerUp, true);
			document.addEventListener("pointercancel", onPointerUp, true);
			document.addEventListener("mousedown", onMouseDown, true);
			document.addEventListener("keydown", onKeyDown, true);
			document.addEventListener("scroll", onScrollOrResize, true);
			window.addEventListener("resize", onScrollOrResize);
		}

		function detachP2Listeners() {
			if (p2Listeners !== true) return;
			p2Listeners = false;
			document.removeEventListener("selectionchange", onSelectionChange);
			document.removeEventListener("pointerdown", onPointerDown, true);
			document.removeEventListener("pointerup", onPointerUp, true);
			document.removeEventListener("pointercancel", onPointerUp, true);
			document.removeEventListener("mousedown", onMouseDown, true);
			document.removeEventListener("keydown", onKeyDown, true);
			document.removeEventListener("scroll", onScrollOrResize, true);
			window.removeEventListener("resize", onScrollOrResize);
			hideBar();
			if (barState.bar !== null) barState.bar.remove();
			barState.bar = null;
			const style = document.getElementById(STYLE_ID);
			if (style !== null) style.remove();
		}

		/* ------------------------------------------------------------------ *
		 * 线格式
		 *
		 * 引用块以 > ❝ 原文 / > ❞ 批注 / > ※ │qc1:<ref> 三段落进消息正文：
		 * 模型能读，刷新后还能从正文里解析回卡片。发送瞬间才拼进正文。
		 * ------------------------------------------------------------------ */

		const REF_PREFIX = "qc1:";
		const QUOTE_MARK = "\u275D";
		const COMMENT_MARK = "\u275E";
		const REF_LINE = /^\s*※\s*[^│\n]*?│qc1:([A-Za-z0-9_-]+)(.*)$/u;
		const DRAFT_KEY = "dsh-quote-context:v2:drafts";
		const LEGACY_DRAFT_KEY = "dsh-quote-context:v1:drafts";

		function blockLines(text) {
			return String(text === null || text === undefined ? "" : text).replace(/\r\n?/gu, "\n").split("\n");
		}

		function escapeBodyLine(line) {
			return /^[\u275D\u275E\u203B\u2502]/u.test(line) ? "\\" + line : line;
		}

		function unescapeBodyLine(line) {
			if (line.charAt(0) === "\\" && /^[\u275D\u275E\u203B\u2502]/u.test(line.slice(1))) return line.slice(1);
			return line;
		}

		/** 引用块线格式：> ❝ 原文 / > ❞ 批注 / > ※ │qc1:<ref>。 */
		function quoteBlock(text, comment, wireRef) {
			const body = String(text === null || text === undefined ? "" : text).replace(/\r\n?/gu, "\n").replace(/\s+$/u, "");
			if (body.trim() === "") return "";
			const out = [];
			const quoteLines = blockLines(body);
			for (let index = 0; index < quoteLines.length; index += 1) {
				const line = quoteLines[index];
				if (index === 0) out.push(line === "" ? "> " + QUOTE_MARK : "> " + QUOTE_MARK + " " + escapeBodyLine(line));
				else out.push(line === "" ? ">" : "> " + escapeBodyLine(line));
			}
			const commentBody = String(comment === null || comment === undefined ? "" : comment).replace(/\r\n?/gu, "\n").replace(/\s+$/u, "");
			if (commentBody.trim() !== "") {
				const commentLines = blockLines(commentBody);
				for (let index = 0; index < commentLines.length; index += 1) {
					const line = commentLines[index];
					if (index === 0) out.push(line === "" ? "> " + COMMENT_MARK : "> " + COMMENT_MARK + " " + escapeBodyLine(line));
					else out.push(line === "" ? ">" : "> " + escapeBodyLine(line));
				}
			}
			if (typeof wireRef === "string" && wireRef !== "") out.push("> \u203B \u2502" + wireRef);
			return out.join("\n");
		}

		/** 从发送后的消息正文里读回引用块；解析失败返回 null。 */
		function splitQuoteRuns(text) {
			const value = String(text === null || text === undefined ? "" : text);
			if (value.indexOf(QUOTE_MARK) === -1) return null;
			const lines = value.split("\n");
			const segments = [];
			let loose = "";
			let index = 0;
			while (index < lines.length) {
				const line = lines[index];
				const mark = line.indexOf(QUOTE_MARK);
				const head = mark === -1 ? "" : line.slice(0, mark);
				const opens = head !== "" && (head.replace(/^[>\s]*$/u, "") === "" || />[ \t]*$/u.test(head));
				if (mark === -1 || opens !== true) {
					loose += (loose === "" ? "" : "\n") + line;
					index += 1;
					continue;
				}
				const prefix = head.replace(/>[ \t]*$/u, "");
				if (prefix !== "") loose += (loose === "" ? "" : "\n") + prefix;
				const body = [line.slice(mark + QUOTE_MARK.length).replace(/^\s/u, "")];
				index += 1;
				while (index < lines.length && lines[index].startsWith(">")) {
					const nextBody = lines[index].replace(/^>\s?/u, "");
					// 连续多段引用之间可能没有空行；遇到下一段的 ❝ 必须收口，
					// 否则后一段会被吞进前一段的批注里，ref 行也会原样漏出来。
					if (nextBody.startsWith(QUOTE_MARK)) break;
					body.push(nextBody);
					index += 1;
				}
				const before = loose.replace(/^\s+/u, "").replace(/\s+$/u, "");
				if (before !== "") segments.push({ type: "text", text: before });
				loose = "";
				const carried = [];
				let wireRef = null;
				let trailing = "";
				for (const entry of body) {
					const match = REF_LINE.exec(entry);
					if (match !== null) {
						if (wireRef === null) wireRef = decodeRef(match[1]);
						trailing += String(match[2] || "").replace(/^\s+/u, "");
						continue;
					}
					carried.push(entry);
				}
				const cut = carried.findIndex((entry) => entry.replace(/^\s+/u, "").startsWith(COMMENT_MARK));
				let quoteLines = cut === -1 ? carried : carried.slice(0, cut);
				let commentLines = cut === -1 ? [] : carried.slice(cut);
				if (commentLines.length > 0) {
					commentLines[0] = commentLines[0].replace(/^\s+/u, "").slice(COMMENT_MARK.length).replace(/^\s/u, "");
				}
				const quote = quoteLines.map(unescapeBodyLine).join("\n").replace(/\s+$/u, "");
				const comment = commentLines.map(unescapeBodyLine).join("\n").replace(/\s+$/u, "");
				if (quote.trim() !== "" || comment.trim() !== "") {
					const segment = { type: "quote", quote: quote, comment: comment };
					if (wireRef !== null) segment.ref = wireRef;
					segments.push(segment);
					if (trailing.trim() !== "") segments.push({ type: "text", text: trailing.trim() });
				}
			}
			const tail = loose.replace(/^\s+/u, "").replace(/\s+$/u, "");
			if (tail !== "") segments.push({ type: "text", text: tail });
			return segments.length === 0 ? null : segments;
		}

		function bytesToBase64Url(bytes) {
			let binary = "";
			for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
			return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
		}

		function base64UrlToBytes(value) {
			const text = String(value).replace(/-/gu, "+").replace(/_/gu, "/");
			const padded = text + "=".repeat((4 - (text.length % 4)) % 4);
			const binary = atob(padded);
			const bytes = new Uint8Array(binary.length);
			for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
			return bytes;
		}

		function encodeRef(data) {
			return REF_PREFIX + bytesToBase64Url(new TextEncoder().encode(JSON.stringify(data)));
		}

		function decodeRef(value) {
			if (typeof value !== "string" || value === "") return null;
			const raw = value.startsWith(REF_PREFIX) ? value.slice(REF_PREFIX.length) : value;
			try {
				const data = JSON.parse(new TextDecoder().decode(base64UrlToBytes(raw)));
				if (data === null || typeof data !== "object" || Array.isArray(data)) return null;
				if (data.v !== 1 || typeof data.s !== "string" || data.s === "") return null;
				if (typeof data.i !== "string" || data.i === "") return null;
				if (typeof data.t !== "string") return null;
				return { v: 1, s: data.s, i: data.i, t: data.t, c: typeof data.c === "string" ? data.c : "", a: data.a !== null && typeof data.a === "object" ? data.a : null };
			} catch (error) {
				return null;
			}
		}

		function normalizeLabel(value) {
			return String(value === null || value === undefined ? "" : value).replace(/\s+/gu, " ").replace(/^ +| +$/gu, "");
		}

		function firstLineOf(text, max) {
			const flat = String(text === null || text === undefined ? "" : text).replace(/\s+/gu, " ").replace(/^ +| +$/gu, "");
			const limit = Number.isSafeInteger(max) && max > 0 ? max : 48;
			return flat.length > limit ? flat.slice(0, limit - 1) + "…" : flat;
		}

		/* ------------------------------------------------------------------ *
		 * 待发引用：每会话一张表，按会话持久化
		 * ------------------------------------------------------------------ */

		function quoteItemsOf(sessionId) {
			if (typeof sessionId !== "string" || sessionId === "") return [];
			let list = draftQuotes.get(sessionId);
			if (list === undefined) {
				list = [];
				draftQuotes.set(sessionId, list);
			}
			return list;
		}

		function makeQuoteItem(found, comment) {
			return {
				id: "qc-" + String(Date.now()) + "-" + String(Math.floor(Math.random() * 100000)),
				text: found.text,
				comment: typeof comment === "string" ? comment.trim() : "",
				anchor: found.anchor,
				createdAt: Date.now(),
			};
		}

		function findItem(sessionId, itemId) {
			const list = draftQuotes.get(sessionId);
			return Array.isArray(list) ? list.find((item) => item.id === itemId) || null : null;
		}

		/** 一条引用在消息里的传输坐标（刷新后靠它跳回原文）。 */
		function refForItem(item, sessionId) {
			return encodeRef({ v: 1, s: sessionId, i: item.id, t: item.text, c: item.comment || "", a: item.anchor || null });
		}

		function loadDrafts() {
			try {
				if (typeof localStorage === "undefined") return;
				const raw = localStorage.getItem(DRAFT_KEY) || localStorage.getItem(LEGACY_DRAFT_KEY);
				if (typeof raw !== "string" || raw === "") return;
				const parsed = JSON.parse(raw);
				if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return;
				for (const [sessionId, list] of Object.entries(parsed)) {
					if (!Array.isArray(list)) continue;
					const items = [];
					for (const value of list) {
						if (value === null || typeof value !== "object") continue;
						if (typeof value.id !== "string" || typeof value.text !== "string") continue;
						items.push({
							id: value.id,
							text: value.text,
							comment: typeof value.comment === "string" ? value.comment : "",
							anchor: value.anchor !== null && typeof value.anchor === "object" ? value.anchor : {},
							createdAt: Number(value.createdAt) || Date.now(),
						});
					}
					if (items.length > 0) draftQuotes.set(sessionId, items);
				}
			} catch (error) {
				// 坏掉的本地草稿不影响插件启动。
			}
		}

		let draftSaveTimer = null;
		function saveDrafts() {
			if (draftSaveTimer !== null) clearTimeout(draftSaveTimer);
			draftSaveTimer = setTimeout(() => {
				draftSaveTimer = null;
				try {
					if (typeof localStorage === "undefined") return;
					const plain = {};
					for (const [sessionId, list] of draftQuotes) {
						plain[sessionId] = list.map((item) => ({
							id: item.id,
							text: item.text,
							comment: item.comment,
							anchor: item.anchor,
							createdAt: item.createdAt,
						}));
					}
					localStorage.setItem(DRAFT_KEY, JSON.stringify(plain));
				} catch (error) {
					// 存储满了也不能让引用芯片消失。
				}
			}, 120);
		}

		/* ------------------------------------------------------------------ *
		 * 输入卡能力面
		 * ------------------------------------------------------------------ */

		function inputShellFor(sessionId) {
			if (pluginCtx === null || typeof sessionId !== "string" || sessionId === "") return null;
			try {
				const conversation = pluginCtx.get("conversation");
				if (conversation === null || conversation === undefined || conversation.input === undefined) return null;
				if (typeof conversation.input.shell !== "function") return null;
				const shell = conversation.input.shell(sessionId);
				return shell === null || shell === undefined ? null : shell;
			} catch (error) {
				return null;
			}
		}

		/** 读当前草稿与宿主输入状态；会话没挂载时返回 null。 */
		function composerSliceOf(sessionId) {
			const shell = inputShellFor(sessionId);
			if (shell === null || typeof shell.compose !== "function") return null;
			try {
				const state = shell.compose();
				return state === null || state === undefined ? null : { shell: shell, state: state };
			} catch (error) {
				return null;
			}
		}

		function actionsOf(sessionId) {
			const entry = sessions.get(sessionId);
			if (entry !== undefined && entry !== null) {
				const actions = entry.actions();
				if (actions !== null && actions !== undefined) return actions;
			}
			const shell = inputShellFor(sessionId);
			if (shell !== null && shell.actions !== null && shell.actions !== undefined) return shell.actions;
			return null;
		}

		function draftOf(sessionId) {
			const slice = composerSliceOf(sessionId);
			return slice === null ? "" : String(slice.state.draft || "");
		}

		function writeDraft(sessionId, text) {
			const actions = actionsOf(sessionId);
			if (actions === null || typeof actions.setDraft !== "function") return false;
			try {
				actions.setDraft(text);
				return true;
			} catch (error) {
				return false;
			}
		}

		function sessionOfCard(card) {
			const host = closestFrom(card, CONTENT_SELECTOR);
			const id = host === null ? null : host.getAttribute("data-conversation-session");
			if (typeof id === "string" && id !== "") return id;
			return sessions.size === 1 ? Array.from(sessions.keys())[0] : null;
		}

		
		/* ------------------------------------------------------------------ *
		 * 输入卡里的「聊天引用 N」芯片
		 * ------------------------------------------------------------------ */

		function composerCards() {
			if (typeof document === "undefined") return [];
			return Array.from(document.querySelectorAll(CARD_SELECTOR));
		}

		function ensureAnchor(card) {
			const known = composerState.anchors.get(card);
			if (known !== undefined && known.isConnected) return known;
			const anchor = document.createElement("div");
			anchor.className = "qctx-anchor";
			anchor.setAttribute("data-qctx", "anchor");
			// 追加在卡片末尾、靠 CSS order:-1 排到最前，避免和 React 抢子节点顺序。
			card.append(anchor);
			composerState.anchors.set(card, anchor);
			return anchor;
		}

		function removeAnchor(card) {
			const anchor = composerState.anchors.get(card);
			composerState.anchors.delete(card);
			if (anchor !== undefined && anchor.isConnected) anchor.remove();
		}

		function findChipFor(sessionId) {
			for (const [card, anchor] of composerState.anchors) {
				if (anchor.isConnected !== true) continue;
				if (sessionOfCard(card) !== sessionId) continue;
				const chip = typeof anchor.querySelector === "function" ? anchor.querySelector(".qctx-chip") : null;
				if (chip !== null) return chip;
			}
			return null;
		}

		/** 芯片本体：气泡图标 + 「聊天引用」+ 计数 + 展开箭头。 */
		function renderAnchor(anchor, sessionId, items) {
			const count = items.length;
			const signature = sessionId + "|" + String(count) + "|" + (items.length > 0 ? items[0].id : "");
			if (anchor.getAttribute("data-signature") === signature) {
				syncChipStates();
				return;
			}
			anchor.setAttribute("data-signature", signature);
			anchor.replaceChildren();
			const chip = document.createElement("button");
			chip.type = "button";
			chip.className = "qctx-chip";
			chip.setAttribute("data-qctx", "chip");
			chip.setAttribute("data-session", sessionId);
			chip.setAttribute("aria-haspopup", "dialog");
			chip.setAttribute("aria-expanded", "false");
			chip.title = withCount(translateFor(sessionId, "chipTitle"), count);
			const label = document.createElement("span");
			label.className = "qctx-chip-label";
			label.textContent = translateFor(sessionId, "chipLabel");
			const badge = document.createElement("span");
			badge.className = "qctx-chip-count";
			badge.textContent = String(count);
			chip.append(iconNode("chat"), label, badge, iconNode("chevron", "qctx-chip-chevron"));
			chip.addEventListener("pointerenter", () => {
				cancelPanelClose();
				if (composerState.open !== true || composerState.sessionId !== sessionId) openPanel(sessionId, { hover: true });
				else composerState.hover = true;
			});
			chip.addEventListener("pointerleave", () => {
				composerState.hover = false;
				schedulePanelClose();
			});
			chip.addEventListener("click", (event) => {
				event.preventDefault();
				event.stopPropagation();
				if (composerState.open === true && composerState.sessionId === sessionId && composerState.pinned === true) closePanel();
				else openPanel(sessionId, { pin: true });
			});
			anchor.append(chip);
			syncChipStates();
		}

		function syncChipStates() {
			for (const [card, anchor] of composerState.anchors) {
				if (anchor.isConnected !== true) continue;
				const chip = typeof anchor.querySelector === "function" ? anchor.querySelector(".qctx-chip") : null;
				if (chip === null) continue;
				const open = composerState.open === true && composerState.sessionId === sessionOfCard(card);
				chip.setAttribute("data-open", open ? "true" : "false");
				chip.setAttribute("aria-expanded", open ? "true" : "false");
			}
		}

		/** 只有引用、没有正文时给草稿放一枚零宽标记，让宿主自己的发送按钮可用。 */
		const markerCooldown = new Map();
		function maintainMarker(sessionId) {
			const now = Date.now();
			const until = markerCooldown.get(sessionId) || 0;
			if (now < until) return;
			const draft = draftOf(sessionId);
			const items = quoteItemsOf(sessionId).length;
			if (items > 0) {
				if (draft === "") {
					markerCooldown.set(sessionId, now + 800);
					writeDraft(sessionId, DRAFT_MARKER);
				}
				return;
			}
			if (draft === DRAFT_MARKER) {
				markerCooldown.set(sessionId, now + 800);
				writeDraft(sessionId, "");
			}
		}

		function panelSignature(sessionId) {
			const items = quoteItemsOf(sessionId);
			const parts = items.map((item) => item.id + ":" + item.comment);
			return sessionId + "|" + String(composerState.editing || "") + "|" + String(composerState.fresh || "") + "|" + parts.join("\u0001");
		}

		function syncComposers() {
			if (typeof document === "undefined") return;
			const cards = composerCards();
			const liveSessions = new Set();
			for (const card of cards) {
				const sessionId = sessionOfCard(card);
				if (sessionId === null) continue;
				liveSessions.add(sessionId);
				const items = quoteItemsOf(sessionId);
				if (items.length === 0) {
					removeAnchor(card);
					continue;
				}
				renderAnchor(ensureAnchor(card), sessionId, items);
				maintainMarker(sessionId);
			}
			for (const card of Array.from(composerState.anchors.keys())) {
				if (card.isConnected !== true || !liveSessions.has(sessionOfCard(card))) removeAnchor(card);
			}
			if (composerState.open !== true || composerState.sessionId === null) return;
			const sessionId = composerState.sessionId;
			if (!liveSessions.has(sessionId) || quoteItemsOf(sessionId).length === 0) {
				closePanel();
				return;
			}
			const panel = composerState.panel;
			const signature = panelSignature(sessionId);
			if (panel === null || panel.getAttribute("data-signature") !== signature) renderPanel();
			positionPanel();
		}

		function scheduleSync() {
			if (composerState.syncTimer !== null) return;
			composerState.syncTimer = setTimeout(() => {
				composerState.syncTimer = null;
				syncComposers();
			}, 24);
		}

		function renderComposer(sessionId) {
			if (typeof sessionId !== "string" || sessionId === "") {
				scheduleSync();
				return;
			}
			const items = quoteItemsOf(sessionId);
			for (const card of composerCards()) {
				if (sessionOfCard(card) !== sessionId) continue;
				if (items.length === 0) removeAnchor(card);
				else renderAnchor(ensureAnchor(card), sessionId, items);
			}
		}

		/* ------------------------------------------------------------------ *
		 * 预览浮层：OpenChamber 式的堆叠条目
		 * ------------------------------------------------------------------ */

		function ensurePanel() {
			ensureStyle(document);
			if (composerState.panel !== null && composerState.panel.isConnected) return composerState.panel;
			const panel = document.createElement("div");
			panel.id = PANEL_ID;
			panel.className = "qctx-panel";
			panel.setAttribute("data-qctx", "panel");
			panel.setAttribute("data-visible", "false");
			panel.setAttribute("role", "dialog");
			panel.addEventListener("pointerenter", () => {
				composerState.hover = true;
				cancelPanelClose();
			});
			panel.addEventListener("pointerleave", () => {
				composerState.hover = false;
				schedulePanelClose();
			});
			panel.addEventListener("click", onPanelClick);
			panel.addEventListener("keydown", onPanelKeyDown);
			document.body.append(panel);
			composerState.panel = panel;
			return panel;
		}

		function cancelPanelClose() {
			if (composerState.closeTimer !== null) {
				clearTimeout(composerState.closeTimer);
				composerState.closeTimer = null;
			}
		}

		function schedulePanelClose() {
			if (composerState.pinned === true) return;
			cancelPanelClose();
			composerState.closeTimer = setTimeout(() => {
				composerState.closeTimer = null;
				if (composerState.pinned === true || composerState.hover === true) return;
				closePanel();
			}, PANEL_CLOSE_MS);
		}

		function openPanel(sessionId, options) {
			const items = quoteItemsOf(sessionId);
			if (items.length === 0) return;
			const opts = options === null || options === undefined ? {} : options;
			if (composerState.sessionId !== sessionId) {
				composerState.editing = null;
				composerState.pinned = false;
				composerState.fresh = null;
			}
			composerState.sessionId = sessionId;
			composerState.open = true;
			if (findChipFor(sessionId) === null) syncComposers();
			if (opts.hover === true) composerState.hover = true;
			if (opts.pin === true) composerState.pinned = true;
			if (opts.fresh !== undefined) composerState.fresh = opts.fresh;
			const panel = ensurePanel();
			panel.setAttribute("aria-label", translateFor(sessionId, "chipLabel"));
			renderPanel();
			panel.setAttribute("data-visible", "true");
			positionPanel();
			syncChipStates();
			if (opts.auto === true) {
				if (composerState.autoTimer !== null) clearTimeout(composerState.autoTimer);
				composerState.autoTimer = setTimeout(() => {
					composerState.autoTimer = null;
					if (composerState.pinned === true || composerState.hover === true) return;
					closePanel();
				}, PANEL_AUTO_MS);
			}
		}

		function closePanel() {
			composerState.open = false;
			composerState.pinned = false;
			composerState.hover = false;
			composerState.editing = null;
			composerState.fresh = null;
			cancelPanelClose();
			if (composerState.autoTimer !== null) {
				clearTimeout(composerState.autoTimer);
				composerState.autoTimer = null;
			}
			if (composerState.panel !== null) composerState.panel.setAttribute("data-visible", "false");
			syncChipStates();
		}

		function positionPanel() {
			const panel = composerState.panel;
			const sessionId = composerState.sessionId;
			if (panel === null || sessionId === null || panel.isConnected !== true) return;
			if (typeof window === "undefined" || typeof document === "undefined") return;
			const chip = findChipFor(sessionId);
			if (chip === null) {
				closePanel();
				return;
			}
			const chipRect = chip.getBoundingClientRect();
			const card = closestFrom(chip, CARD_SELECTOR);
			const cardRect = card === null ? chipRect : card.getBoundingClientRect();
			const viewportWidth = Number(window.innerWidth) || 1200;
			const viewportHeight = Number(window.innerHeight) || 800;
			const width = Math.round(Math.min(Math.max(Number(cardRect.width) || 0, 280), PANEL_MAX_WIDTH));
			const left = Math.round(clamp(Number(cardRect.left) || EDGE, EDGE, viewportWidth - width - EDGE));
			let topBound = EDGE;
			const chat = document.querySelector("[data-conversation-scroll]");
			if (chat !== null) topBound = Math.max(EDGE, Math.round(chat.getBoundingClientRect().top) + 6);
			const anchorTop = Math.round(Number(chipRect.top) || 0);
			const bottomEdge = Math.min(viewportHeight - EDGE, anchorTop - GAP);
			const maxHeight = Math.max(140, bottomEdge - topBound);
			panel.style.left = left + "px";
			panel.style.width = width + "px";
			panel.style.bottom = Math.round(viewportHeight - Math.max(bottomEdge, topBound + 140)) + "px";
			panel.style.maxHeight = maxHeight + "px";
		}

		function panelEntry(item, index, sessionId) {
			const entry = document.createElement("div");
			entry.className = "qctx-entry";
			entry.setAttribute("data-qctx-item", item.id);
			if (composerState.fresh === item.id) entry.setAttribute("data-fresh", "true");
			const head = document.createElement("div");
			head.className = "qctx-entry-head";
			const num = document.createElement("span");
			num.className = "qctx-entry-index";
			num.textContent = String(index + 1);
			const title = document.createElement("span");
			title.className = "qctx-entry-title";
			title.textContent = translateFor(sessionId, "sourceFrom");
			title.title = firstLineOf(item.text, 80);
			const tools = document.createElement("div");
			tools.className = "qctx-entry-tools";
			const edit = document.createElement("button");
			edit.type = "button";
			edit.className = "qctx-icon-btn";
			edit.setAttribute("data-act", "edit");
			edit.setAttribute("aria-label", translateFor(sessionId, "editComment"));
			edit.title = translateFor(sessionId, "editComment");
			edit.append(iconNode("pencil"));
			const remove = document.createElement("button");
			remove.type = "button";
			remove.className = "qctx-icon-btn";
			remove.setAttribute("data-act", "remove");
			remove.setAttribute("data-danger", "true");
			remove.setAttribute("aria-label", translateFor(sessionId, "remove"));
			remove.title = translateFor(sessionId, "remove");
			remove.append(iconNode("trash"));
			tools.append(edit, remove);
			head.append(num, title, tools);

			const body = document.createElement("div");
			body.className = "qctx-entry-body";
			const quoteLabel = document.createElement("div");
			quoteLabel.className = "qctx-entry-label";
			quoteLabel.textContent = translateFor(sessionId, "selectedText");
			const quote = document.createElement("button");
			quote.type = "button";
			quote.className = "qctx-entry-quote";
			quote.setAttribute("data-act", "jump");
			quote.textContent = item.text;
			quote.title = translateFor(sessionId, "showSource");
			body.append(quoteLabel, quote);

			const commentLabel = document.createElement("div");
			commentLabel.className = "qctx-entry-label";
			commentLabel.textContent = translateFor(sessionId, "userComment");
			body.append(commentLabel);

			const editing = composerState.editing === item.id;
			if (editing === true) {
				const editor = document.createElement("textarea");
				editor.className = "qctx-entry-edit";
				editor.setAttribute("data-role", "comment");
				editor.rows = 2;
				editor.placeholder = translateFor(sessionId, "dockEditPlaceholder");
				editor.value = item.comment || "";
				const actions = document.createElement("div");
				actions.className = "qctx-entry-actions";
				const cancel = document.createElement("button");
				cancel.type = "button";
				cancel.className = "qctx-entry-btn";
				cancel.setAttribute("data-act", "cancel-edit");
				cancel.textContent = translateFor(sessionId, "cancel");
				const save = document.createElement("button");
				save.type = "button";
				save.className = "qctx-entry-btn";
				save.setAttribute("data-act", "save-comment");
				save.setAttribute("data-primary", "true");
				save.textContent = translateFor(sessionId, "save");
				actions.append(cancel, save);
				body.append(editor, actions);
			} else if (item.comment.trim() !== "") {
				const comment = document.createElement("div");
				comment.className = "qctx-entry-comment";
				comment.textContent = item.comment;
				body.append(comment);
			} else {
				const empty = document.createElement("div");
				empty.className = "qctx-entry-comment";
				empty.setAttribute("data-empty", "true");
				empty.setAttribute("data-act", "edit");
				empty.textContent = translateFor(sessionId, "addComment");
				body.append(empty);
			}
			entry.append(head, body);
			return entry;
		}

		function renderPanel() {
			const sessionId = composerState.sessionId;
			if (sessionId === null) return;
			const panel = ensurePanel();
			const items = quoteItemsOf(sessionId);
			if (items.length === 0) {
				closePanel();
				return;
			}
			panel.setAttribute("data-signature", panelSignature(sessionId));
			panel.replaceChildren();
			const scroll = document.createElement("div");
			scroll.className = "qctx-panel-scroll";
			items.forEach((item, index) => scroll.append(panelEntry(item, index, sessionId)));
			panel.append(scroll);
			if (items.length > 1) {
				const foot = document.createElement("div");
				foot.className = "qctx-panel-foot";
				const clear = document.createElement("button");
				clear.type = "button";
				clear.className = "qctx-foot-btn";
				clear.setAttribute("data-act", "clear");
				clear.textContent = translateFor(sessionId, "clearAll");
				foot.append(clear);
				panel.append(foot);
			}
		}

		function editingTextarea() {
			const panel = composerState.panel;
			if (panel === null) return null;
			return typeof panel.querySelector === "function" ? panel.querySelector(".qctx-entry-edit") : null;
		}

		function saveEditedComment() {
			const sessionId = composerState.sessionId;
			const editor = editingTextarea();
			if (sessionId === null || editor === null) return;
			const items = quoteItemsOf(sessionId);
			const index = items.findIndex((item) => item.id === composerState.editing);
			if (index === -1) return;
			items[index].comment = String(editor.value || "").trim();
			composerState.editing = null;
			saveDrafts();
			renderPanel();
			positionPanel();
		}

		function onPanelClick(event) {
			const target = closestFrom(event.target, "[data-act]");
			if (target === null) return;
			const sessionId = composerState.sessionId;
			if (sessionId === null) return;
			const act = target.getAttribute("data-act");
			const entry = closestFrom(target, "[data-qctx-item]");
			const itemId = entry === null ? null : entry.getAttribute("data-qctx-item");
			if (act === "jump" && itemId !== null) {
				event.preventDefault();
				const item = findItem(sessionId, itemId);
				if (item !== null) jumpToAnchor(sessionId, item.anchor, item.text);
				return;
			}
			if (act === "edit" && itemId !== null) {
				event.preventDefault();
				composerState.editing = itemId;
				renderPanel();
				positionPanel();
				const editor = editingTextarea();
				if (editor !== null) {
					editor.focus({ preventScroll: true });
					try {
						editor.setSelectionRange(editor.value.length, editor.value.length);
					} catch (error) {
						// 垫片没有选区 API。
					}
				}
				return;
			}
			if (act === "remove" && itemId !== null) {
				event.preventDefault();
				removeQuoteItem(sessionId, itemId);
				return;
			}
			if (act === "clear") {
				event.preventDefault();
				clearQuoteItems(sessionId);
				return;
			}
			if (act === "cancel-edit") {
				event.preventDefault();
				composerState.editing = null;
				renderPanel();
				positionPanel();
				return;
			}
			if (act === "save-comment") {
				event.preventDefault();
				saveEditedComment();
			}
		}

		function onPanelKeyDown(event) {
			if (event.key === "Escape") {
				event.preventDefault();
				event.stopPropagation();
				if (composerState.editing !== null) {
					composerState.editing = null;
					renderPanel();
					positionPanel();
					return;
				}
				closePanel();
				return;
			}
			const target = event.target;
			const className = target === null || target === undefined ? "" : String(target.className || "");
			if (className.indexOf("qctx-entry-edit") === -1) return;
			if (event.key === "Enter" && event.shiftKey !== true && event.isComposing !== true) {
				event.preventDefault();
				saveEditedComment();
			}
		}

		/* ------------------------------------------------------------------ *
		 * 发送瞬间：把引用块折进正文，交给宿主自己的发送路径
		 * ------------------------------------------------------------------ */

		function stripMarker(text) {
			return String(text === null || text === undefined ? "" : text).split(DRAFT_MARKER).join("");
		}

		/** 折叠后的正文：引用块在前，用户正文在后。 */
		function composeOutgoing(sessionId, draft, items) {
			const text = stripMarker(draft).replace(/^\s+/, "");
			const blocks = [];
			for (const item of items) {
				const block = quoteBlock(item.text, item.comment || "", refForItem(item, sessionId));
				if (block !== "") blocks.push(block);
			}
			if (blocks.length === 0) return text;
			const head = blocks.join("\n\n");
			return text === "" ? head : head + "\n\n" + text;
		}

		function menuOpenIn(card) {
			if (card === null) return false;
			try {
				if (card.querySelector('[role="listbox"]') !== null) return true;
				if (card.querySelector('[role="menu"]') !== null) return true;
			} catch (error) {
				return false;
			}
			return false;
		}

		function foldPendingQuotes(sessionId) {
			const items = quoteItemsOf(sessionId).slice();
			if (items.length === 0) return false;
			const slice = composerSliceOf(sessionId);
			if (slice === null) return false;
			const draft = String(slice.state.draft || "");
			if (draft.trim().charAt(0) === "/") {
				toast(translateFor(sessionId, "commandQuotes"));
				return false;
			}
			const composed = composeOutgoing(sessionId, draft, items);
			if (composed === "") return false;
			const userDraft = stripMarker(draft).replace(/^\s+/, "");
			if (writeDraft(sessionId, composed) !== true) return false;
			draftQuotes.set(sessionId, []);
			saveDrafts();
			scheduleSync();
			if (composerState.open === true && composerState.sessionId === sessionId) closePanel();
			const record = { composed: composed, userDraft: userDraft, items: items, at: Date.now(), seenOther: false, timer: null };
			folds.set(sessionId, record);
			watchFold(sessionId);
			return true;
		}

		function finishFold(sessionId, record) {
			if (record.timer !== null) {
				clearInterval(record.timer);
				record.timer = null;
			}
			if (folds.get(sessionId) === record) folds.delete(sessionId);
		}

		/** 宿主拒绝发送时会把折叠后的正文还原回草稿：把它拆回引用 + 用户正文。 */
		function restoreFold(sessionId, record) {
			const existing = draftQuotes.get(sessionId) || [];
			draftQuotes.set(sessionId, record.items.concat(existing));
			saveDrafts();
			scheduleSync();
			writeDraft(sessionId, record.userDraft);
			toast(translateFor(sessionId, "foldFailed"));
		}

		function watchFold(sessionId) {
			const record = folds.get(sessionId);
			if (record === undefined) return;
			if (record.timer !== null) clearInterval(record.timer);
			const started = Date.now();
			record.timer = setInterval(() => {
				const current = folds.get(sessionId);
				if (current !== record) {
					if (record.timer !== null) clearInterval(record.timer);
					return;
				}
				const slice = composerSliceOf(sessionId);
				if (slice === null) {
					finishFold(sessionId, record);
					return;
				}
				const draft = String(slice.state.draft || "");
				if (draft !== record.composed) record.seenOther = true;
				if (record.seenOther === true && draft === record.composed) {
					finishFold(sessionId, record);
					restoreFold(sessionId, record);
					return;
				}
				if (Date.now() - started > 30000) finishFold(sessionId, record);
			}, 240);
		}

		function onSendKeyDownCapture(event) {
			if (event.key !== "Enter" || event.isComposing === true) return;
			if (event.shiftKey === true || event.altKey === true) return;
			const card = closestFrom(event.target, CARD_SELECTOR);
			if (card === null) return;
			if (closestFrom(event.target, "[data-qctx]") !== null) return;
			if (closestFrom(event.target, COMPOSER_SELECTOR) === null) return;
			if (menuOpenIn(card) === true) return;
			const sessionId = sessionOfCard(card);
			if (sessionId === null) return;
			if (quoteItemsOf(sessionId).length === 0) return;
			foldPendingQuotes(sessionId);
		}

		function isPrimarySendButton(button) {
			if (button === null || button.disabled === true) return false;
			const className = typeof button.className === "string" ? button.className : String(button.getAttribute("class") || "");
			if (className.indexOf("_primary") === -1) return false;
			// 停止按钮用方块图标，发送按钮用纸飞机。
			try {
				if (button.querySelector("svg rect") !== null) return false;
			} catch (error) {
				return false;
			}
			return true;
		}

		function onSendClickCapture(event) {
			const target = event.target;
			if (target === null || target === undefined || target.nodeType !== 1) return;
			const card = closestFrom(target, CARD_SELECTOR);
			if (card === null) return;
			const button = typeof target.closest === "function" ? target.closest("button") : null;
			if (button === null) return;
			if (closestFrom(button, "[data-qctx]") !== null) return;
			if (isPrimarySendButton(button) !== true) return;
			const sessionId = sessionOfCard(card);
			if (sessionId === null) return;
			if (quoteItemsOf(sessionId).length === 0) return;
			foldPendingQuotes(sessionId);
		}

		function onGlobalPointerDown(event) {
			if (composerState.open !== true) return;
			const target = event.target;
			if (closestFrom(target, "#" + PANEL_ID) !== null) return;
			if (closestFrom(target, ".qctx-chip") !== null) return;
			if (closestFrom(target, "#" + BAR_ID) !== null) return;
			closePanel();
		}

		function onGlobalKeyDown(event) {
			if (event.key !== "Escape" || event.isComposing === true) return;
			if (composerState.open !== true) return;
			if (closestFrom(event.target, "#" + PANEL_ID) !== null) return;
			closePanel();
		}

		function onGlobalScroll(event) {
			if (composerState.open !== true) return;
			if (closestFrom(event.target, "#" + PANEL_ID) !== null) return;
			closePanel();
		}

		function onGlobalResize() {
			if (composerState.open === true) positionPanel();
			scheduleSync();
		}

		/* ------------------------------------------------------------------ *
		 * 待发引用的增删改
		 * ------------------------------------------------------------------ */

		function commitQuote(comment) {
			const found = barState.quote;
			if (found === null || typeof found.text !== "string" || found.text.trim() === "") {
				hideBar();
				return;
			}
			const item = makeQuoteItem(found, comment);
			const sessionId = found.sessionId;
			quoteItemsOf(sessionId).push(item);
			saveDrafts();
			hideBar();
			scheduleSync();
			maintainMarker(sessionId);
			openPanel(sessionId, { auto: true, fresh: item.id });
			queueMicrotask(focusComposer);
		}

		function removeQuoteItem(sessionId, itemId) {
			const list = draftQuotes.get(sessionId);
			if (!Array.isArray(list)) return false;
			const next = list.filter((entry) => entry.id !== itemId);
			if (next.length === list.length) return false;
			draftQuotes.set(sessionId, next);
			if (composerState.editing === itemId) composerState.editing = null;
			saveDrafts();
			scheduleSync();
			if (composerState.open === true && composerState.sessionId === sessionId) {
				if (next.length === 0) closePanel();
				else {
					renderPanel();
					positionPanel();
				}
			}
			return true;
		}

		function clearQuoteItems(sessionId) {
			const list = draftQuotes.get(sessionId);
			if (!Array.isArray(list) || list.length === 0) return false;
			draftQuotes.set(sessionId, []);
			composerState.editing = null;
			saveDrafts();
			scheduleSync();
			if (composerState.open === true && composerState.sessionId === sessionId) closePanel();
			return true;
		}

		
		/* ------------------------------------------------------------------ *
		 * 已发送消息里的引用块
		 *
		 * DSH 把用户消息存成纯文本，引用块因此以 > ❝ 线格式躺在正文里。这里只
		 * 把那段原始文本隐藏、在旁边渲染成 OpenChamber 式的信使引用：左侧一根
		 * 细竖线，来源标题，原文（4 行折叠，点开全文），批注是正文。
		 * ------------------------------------------------------------------ */

		const quoteRuns = new Map();
		const quoteDirty = new Set();
		let quoteObserver = null;
		let quoteTimer = null;

		function transcriptRoot(sessionId) {
			const roots = Array.from(document.querySelectorAll(CONTENT_SELECTOR));
			if (typeof sessionId !== "string" || sessionId === "") return roots[0] || null;
			return roots.find((root) => root.getAttribute("data-conversation-session") === sessionId) || roots[0] || null;
		}

		function collectTextNodes(node, into) {
			for (let child = node.firstChild; child !== null; child = child.nextSibling) {
				if (child.nodeType === 3) into.push(child);
				else if (child.nodeType === 1) collectTextNodes(child, into);
			}
			return into;
		}

		/** 折叠空白并保留“折叠后字符 -> 原文字符”的映射，跨段落引用也能找回。 */
		function foldWhitespace(value) {
			const source = String(value);
			let folded = "";
			const map = [];
			let spaced = false;
			for (let index = 0; index < source.length; index += 1) {
				const char = source[index];
				if (/\s/u.test(char)) {
					if (!spaced && folded !== "") {
						folded += " ";
						map.push(index);
						spaced = true;
					}
					continue;
				}
				folded += char;
				map.push(index);
				spaced = false;
			}
			if (folded.endsWith(" ")) {
				folded = folded.slice(0, -1);
				map.pop();
			}
			return { text: folded, map };
		}

		function rangeForQuote(row, quote, ordinal) {
			const target = String(quote === null || quote === undefined ? "" : quote);
			if (target === "" || row === null) return null;
			const nodes = collectTextNodes(row, []);
			let full = "";
			for (const node of nodes) full += node.nodeValue === null ? "" : node.nodeValue;
			const spans = [];
			let at = full.indexOf(target);
			while (at !== -1) {
				spans.push({ start: at, end: at + target.length });
				at = full.indexOf(target, at + 1);
			}
			if (spans.length === 0) {
				const foldedFull = foldWhitespace(full);
				const foldedTarget = foldWhitespace(target);
				if (foldedTarget.text === "") return null;
				let foldedAt = foldedFull.text.indexOf(foldedTarget.text);
				while (foldedAt !== -1) {
					const start = foldedFull.map[foldedAt];
					const after = foldedAt + foldedTarget.text.length;
					const end = after < foldedFull.map.length ? foldedFull.map[after] : full.length;
					spans.push({ start: start, end: end });
					foldedAt = foldedFull.text.indexOf(foldedTarget.text, foldedAt + 1);
				}
			}
			if (spans.length === 0) return null;
			const index = Math.min(Math.max((Number(ordinal) || 1) - 1, 0), spans.length - 1);
			const span = spans[index];
			let consumed = 0;
			let startNode = null;
			let startOffset = 0;
			let endNode = null;
			let endOffset = 0;
			for (const node of nodes) {
				const length = node.nodeValue === null ? 0 : node.nodeValue.length;
				if (startNode === null && span.start < consumed + length) {
					startNode = node;
					startOffset = span.start - consumed;
				}
				if (startNode !== null && span.end <= consumed + length) {
					endNode = node;
					endOffset = span.end - consumed;
					break;
				}
				consumed += length;
			}
			if (startNode === null || endNode === null) return null;
			const range = document.createRange();
			range.setStart(startNode, startOffset);
			range.setEnd(endNode, endOffset);
			return range;
		}

		/** 画一层临时高亮；只读 Range，不改消息 DOM。 */
		function flashRange(range) {
			if (range === null || typeof range.getClientRects !== "function") return;
			const layer = document.createElement("div");
			layer.setAttribute("data-qctx", "flash");
			layer.className = "qctx-flash-layer";
			for (const rect of Array.from(range.getClientRects())) {
				if (rect === null || rect.width <= 0 || rect.height <= 0) continue;
				const mark = document.createElement("div");
				mark.className = "qctx-flash-mark";
				mark.style.left = Math.round(rect.left) + "px";
				mark.style.top = Math.round(rect.top) + "px";
				mark.style.width = Math.round(rect.width) + "px";
				mark.style.height = Math.round(rect.height) + "px";
				layer.append(mark);
			}
			if (layer.childNodes.length === 0) return;
			document.body.append(layer);
			setTimeout(() => layer.remove(), 1600);
		}

		/** 「在原消息中显示」：按行键找原消息，再按文本序号找原文并闪一下。 */
		function jumpToAnchor(sessionId, anchor, quote) {
			const root = transcriptRoot(sessionId);
			if (root === null) {
				toast(translateFor(sessionId, "jumpFailed"));
				return false;
			}
			let row = null;
			if (anchor !== null && anchor !== undefined && typeof anchor.key === "string" && anchor.key !== "") {
				try {
					row = root.querySelector('[data-chat-anchor-key="' + CSS.escape(anchor.key) + '"]');
				} catch (error) {
					row = null;
				}
			}
			if (row === null) {
				const rows = Array.from(root.querySelectorAll("[data-chat-anchor-key]"));
				row = rows.find((candidate) => String(candidate.textContent || "").includes(String(quote || ""))) || null;
			}
			if (row === null) {
				toast(translateFor(sessionId, "sourceLost"));
				return false;
			}
			const range = rangeForQuote(row, quote, anchor === null || anchor === undefined ? 1 : anchor.ordinal);
			if (range === null) {
				toast(translateFor(sessionId, "sourceLost"));
				return false;
			}
			try {
				const host = range.startContainer.parentElement;
				if (host !== null && typeof host.scrollIntoView === "function") host.scrollIntoView({ block: "center", inline: "nearest" });
			} catch (error) {
				// 滚动失败时仍画出高亮，至少能看见原文位置。
			}
			flashRange(range);
			return true;
		}

		function sessionOfElement(element) {
			const host = closestFrom(element, CONTENT_SELECTOR);
			const id = host === null ? null : host.getAttribute("data-conversation-session");
			return typeof id === "string" && id !== "" ? id : null;
		}

		/** 一条发送后的引用：来源标题 + 原文（4 行折叠）+ 批注。 */
		function quoteCardFor(segment, sessionId) {
			const ref = segment.ref === undefined || segment.ref === null ? null : segment.ref;
			const card = document.createElement("div");
			card.className = "qctx-quote-card";
			card.setAttribute("data-qctx", "quote");
			card.setAttribute("role", "group");
			const main = document.createElement("div");
			main.className = "qctx-quote-main";
			const head = document.createElement("div");
			head.className = "qctx-quote-head";
			head.append(iconNode("chat"));
			const title = document.createElement("span");
			title.className = "qctx-quote-title";
			title.textContent = translateFor(sessionId, "sourceFrom");
			head.append(title);
			if (ref !== null && ref.a !== null && typeof ref.a === "object" && (ref.a.key || ref.a.nodeKey)) {
				const reveal = document.createElement("button");
				reveal.type = "button";
				reveal.className = "qctx-quote-reveal";
				reveal.setAttribute("aria-label", translateFor(sessionId, "showSource"));
				reveal.title = translateFor(sessionId, "showSource");
				reveal.append(iconNode("arrowUp"));
				reveal.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					jumpToAnchor(ref.s || sessionId, ref.a, segment.quote);
				});
				head.append(reveal);
			}
			main.append(head);
			if (typeof segment.quote === "string" && segment.quote.trim() !== "") {
				const body = document.createElement("div");
				body.className = "qctx-quote-body";
				body.textContent = segment.quote;
				main.append(body);
				card.setAttribute("data-has-body", "true");
			}
			card.append(main);
			if (typeof segment.comment === "string" && segment.comment.trim() !== "") {
				const comment = document.createElement("div");
				comment.className = "qctx-quote-comment";
				comment.textContent = segment.comment;
				card.append(comment);
			}
			card.addEventListener("click", (event) => {
				const target = event.target;
				if (target !== null && target !== undefined && target.nodeType === 1 && typeof target.closest === "function" && target.closest("button") !== null) return;
				const selection = document.getSelection === undefined ? null : document.getSelection();
				if (selection !== null && selection.isCollapsed === false) return;
				if (card.getAttribute("data-has-body") !== "true") return;
				card.setAttribute("data-expanded", card.getAttribute("data-expanded") === "true" ? "false" : "true");
			});
			return card;
		}

		/** 消息里的纯文本 run：只有一个文本子节点，且带引用记号。 */
		function isQuoteRun(element) {
			if (element === null || element === undefined || element.nodeType !== 1 || element.childNodes.length !== 1) return false;
			const child = element.childNodes[0];
			if (child.nodeType !== 3 || typeof child.nodeValue !== "string") return false;
			if (child.nodeValue.indexOf(QUOTE_MARK) === -1) return false;
			if (typeof element.closest !== "function") return false;
			if (element.closest("[data-qctx]") !== null) return false;
			return element.closest(CONTENT_SELECTOR) !== null;
		}

		function dropQuoteRun(run) {
			const known = quoteRuns.get(run);
			quoteRuns.delete(run);
			run.style.removeProperty("display");
			if (known === undefined) return;
			for (const node of known.nodes) if (node.isConnected) node.remove();
		}

		function enhanceQuoteRun(run) {
			if (!run.isConnected) {
				dropQuoteRun(run);
				return;
			}
			const text = run.textContent === null ? "" : String(run.textContent);
			const segments = splitQuoteRuns(text);
			const known = quoteRuns.get(run);
			if (segments === null) {
				if (known !== undefined) dropQuoteRun(run);
				return;
			}
			if (known !== undefined && known.text === text && known.nodes.every((node) => node.isConnected)) return;
			if (known !== undefined) dropQuoteRun(run);
			const doc = run.ownerDocument;
			const sessionId = sessionOfElement(run);
			const nodes = [];
			for (const segment of segments) {
				if (segment.type === "text") {
					const body = doc.createElement("span");
					body.className = "qctx-quote-loose";
					body.textContent = segment.text;
					nodes.push(body);
				} else {
					nodes.push(quoteCardFor(segment, sessionId));
				}
			}
			const parent = run.parentNode;
			if (parent === null) return;
			quoteRuns.set(run, { text: text, nodes: nodes });
			run.style.display = "none";
			for (const node of nodes) parent.insertBefore(node, run);
		}

		function collectQuoteRuns(node, into) {
			const element = node !== null && node !== undefined && node.nodeType === 1 ? node : null;
			if (element === null) return;
			if (isQuoteRun(element)) into.add(element);
			if (typeof element.querySelectorAll !== "function") return;
			for (const candidate of element.querySelectorAll("*")) {
				if (isQuoteRun(candidate)) into.add(candidate);
			}
		}

		function onQuoteMutations(records) {
			try {
				for (const record of records) {
					const target = record.target !== null && record.target.nodeType === 1 ? record.target : record.target.parentElement;
					if (target !== null && target !== undefined && typeof target.closest === "function" && target.closest("[data-qctx]") !== null) continue;
					if (record.type === "characterData") {
						collectQuoteRuns(record.target, quoteDirty);
						continue;
					}
					for (const node of record.addedNodes) collectQuoteRuns(node, quoteDirty);
					for (const node of record.removedNodes) {
						if (node.nodeType === 1 && quoteRuns.has(node)) quoteDirty.add(node);
					}
					if (target !== null && quoteRuns.has(target)) quoteDirty.add(target);
				}
			} catch (error) {
				// 扫描失败不能把转录永久留在原始文本上。
			}
			scheduleQuoteFlush();
		}

		function scheduleQuoteFlush() {
			if (quoteTimer !== null) return;
			quoteTimer = setTimeout(() => {
				quoteTimer = null;
				const runs = Array.from(quoteDirty);
				quoteDirty.clear();
				for (const run of Array.from(quoteRuns.keys())) {
					if (!run.isConnected) dropQuoteRun(run);
				}
				for (const run of runs) {
					try {
						if (run.isConnected) enhanceQuoteRun(run);
						else if (quoteRuns.has(run)) dropQuoteRun(run);
					} catch (error) {
						// 单条消息渲染失败时保持原文，不影响其他消息。
					}
				}
			}, 32);
		}

		function installTranscript() {
			if (typeof MutationObserver === "function" && document.body !== null) {
				if (quoteObserver === null) {
					quoteObserver = new MutationObserver(onQuoteMutations);
					quoteObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
				}
			}
			for (const host of document.querySelectorAll(CONTENT_SELECTOR)) collectQuoteRuns(host, quoteDirty);
			scheduleQuoteFlush();
			return uninstallTranscript;
		}

		function uninstallTranscript() {
			if (quoteObserver !== null) {
				quoteObserver.disconnect();
				quoteObserver = null;
			}
			if (quoteTimer !== null) {
				clearTimeout(quoteTimer);
				quoteTimer = null;
			}
			quoteDirty.clear();
			for (const run of Array.from(quoteRuns.keys())) dropQuoteRun(run);
		}

		/* ------------------------------------------------------------------ *
		 * 插件入口
		 * ------------------------------------------------------------------ */

		function installComposer() {
			loadDrafts();
			ensureStyle(document);
			scheduleSync();
			if (typeof MutationObserver === "function" && document.body !== null && composerState.observer === null) {
				composerState.observer = new MutationObserver(onComposerMutations);
				composerState.observer.observe(document.body, { childList: true, subtree: true });
			}
			document.addEventListener("keydown", onSendKeyDownCapture, true);
			document.addEventListener("click", onSendClickCapture, true);
			document.addEventListener("pointerdown", onGlobalPointerDown, true);
			document.addEventListener("keydown", onGlobalKeyDown, true);
			document.addEventListener("scroll", onGlobalScroll, true);
			window.addEventListener("resize", onGlobalResize);
			if (composerState.ticker === null) composerState.ticker = setInterval(onComposerTick, 900);
			return uninstallComposer;
		}

		function onComposerMutations(records) {
			for (const record of records) {
				const target = record.target !== null && record.target !== undefined && record.target.nodeType === 1 ? record.target : record.target === null || record.target === undefined ? null : record.target.parentElement;
				if (target !== null && typeof target.closest === "function") {
					if (target.closest("[data-qctx]") !== null) continue;
					if (target.closest("#" + PANEL_ID) !== null) continue;
				}
				scheduleSync();
				return;
			}
		}

		function onComposerTick() {
			for (const sessionId of Array.from(draftQuotes.keys())) {
				if (quoteItemsOf(sessionId).length > 0) maintainMarker(sessionId);
			}
			if (composerState.open === true) positionPanel();
		}

		function uninstallComposer() {
			document.removeEventListener("keydown", onSendKeyDownCapture, true);
			document.removeEventListener("click", onSendClickCapture, true);
			document.removeEventListener("pointerdown", onGlobalPointerDown, true);
			document.removeEventListener("keydown", onGlobalKeyDown, true);
			document.removeEventListener("scroll", onGlobalScroll, true);
			window.removeEventListener("resize", onGlobalResize);
			if (composerState.observer !== null) {
				composerState.observer.disconnect();
				composerState.observer = null;
			}
			if (composerState.ticker !== null) {
				clearInterval(composerState.ticker);
				composerState.ticker = null;
			}
			if (composerState.syncTimer !== null) {
				clearTimeout(composerState.syncTimer);
				composerState.syncTimer = null;
			}
			for (const record of Array.from(folds.values())) {
				if (record.timer !== null) clearInterval(record.timer);
			}
			folds.clear();
			closePanel();
			if (composerState.panel !== null) {
				composerState.panel.remove();
				composerState.panel = null;
			}
			for (const card of Array.from(composerState.anchors.keys())) removeAnchor(card);
		}

		const inject = ["slots", "locale"];

		function apply(ctx) {
			if (typeof document === "undefined") return;
			pluginCtx = ctx;
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "quote-context: dictionaries");
			ctx.slots.inject("conversation.input.overlay", () =>
				ctx.slots.register(
					{
						name: "conversation.input.overlay",
						id: "quote-context.bridge",
						order: 10,
						locale: NS,
						inject: () => ({}),
					},
					QuoteBridge
				)
			);
			ctx.effect(() => {
				if (typeof document === "undefined") return () => {};
				ensureStyle(document);
				attachP2Listeners();
				return () => detachP2Listeners();
			}, "quote-context: selection bar");
			ctx.effect(() => installComposer(), "quote-context: quote chip");
			ctx.effect(() => {
				installTranscript();
				return uninstallTranscript;
			}, "quote-context: transcript quotes");
			ctx.effect(() => {
				if (typeof window === "undefined") return () => {};
				window.__dshQuoteContext = {
					version: "0.2.0",
					sessions: () => Array.from(sessions.keys()),
					probe: () => ({
						sessions: Array.from(sessions.keys()),
						hasSlots: pluginCtx !== null && typeof pluginCtx.get === "function" && pluginCtx.get("slots") !== undefined,
						barMode: barState.mode,
						quoteCount: Array.from(draftQuotes.values()).reduce((sum, list) => sum + list.length, 0),
						panelOpen: composerState.open,
					}),
					state: () => ({
						mode: barState.mode,
						quote: barState.quote === null ? null : barState.quote.text,
						sessionId: barState.sessionId,
						chips: Array.from(composerState.anchors.entries()).map(([card, anchor]) => ({ sessionId: sessionOfCard(card), count: (anchor.querySelector(".qctx-chip-count") || {}).textContent || "" })),
						panel: { open: composerState.open, sessionId: composerState.sessionId, pinned: composerState.pinned, editing: composerState.editing },
						drafts: Array.from(draftQuotes.entries()).map(([id, list]) => ({ sessionId: id, count: list.length, quotes: list.map((item) => ({ id: item.id, text: item.text, comment: item.comment })) })),
					}),
					composeOutgoing: (sessionId, draft, items) => composeOutgoing(sessionId, draft, items || quoteItemsOf(sessionId)),
					fold: (sessionId) => foldPendingQuotes(sessionId),
					openPanel: (sessionId) => openPanel(sessionId, { pin: true }),
					closePanel: () => closePanel(),
					renderPanel: () => { renderPanel(); positionPanel(); },
					addQuote: (sessionId, text, comment) => {
						const item = makeQuoteItem({ text: text, anchor: { key: "", ordinal: 1, prefix: "", suffix: "" } }, comment || "");
						quoteItemsOf(sessionId).push(item);
						saveDrafts();
						scheduleSync();
						return item.id;
					},
					clearQuotes: (sessionId) => clearQuoteItems(sessionId),
					jumpToAnchor: (sessionId, anchor, quote) => jumpToAnchor(sessionId, anchor, quote),
					quoteRuns: () => Array.from(quoteRuns.keys()).length,
					quoteBlock: (text, comment, ref) => quoteBlock(text, comment, ref),
					splitQuoteRuns: (text) => splitQuoteRuns(text),
					encodeRef: (data) => encodeRef(data),
					decodeRef: (value) => decodeRef(value),
				};
				return () => {
					delete window.__dshQuoteContext;
				};
			}, "quote-context: probe");
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.__testing = {
			translateFor,
			sessions,
			quoteBlock,
			splitQuoteRuns,
			encodeRef,
			decodeRef,
			firstLineOf,
			normalizeLabel,
			withCount,
			stripMarker,
			composeOutgoing,
			quoteCardFor,
			enhanceQuoteRun,
		};
		return module.exports;
	},
});
