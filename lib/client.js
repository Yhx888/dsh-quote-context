/**
 * dsh-quote-context — 在消息里选中文字，引用或评论，引用进入输入卡上方的
 * 引用区，发送后消息里出现可跳回的引用块。
 *
 * P1 骨架：这里只注册 conversation.input.overlay 的不可见桥接组件，
 * 把每个会话的 inputActions 与翻译函数记下来，供后续选区浮条与引用区使用。
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
		"collapse": "收起"
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
		"collapse": "Collapse"
};

		/** 插件名，ModuleLoader 与样式标记共用。 */
		const PLUGIN_ID = "dsh-quote-context";

		/** 每个会话在宿主输入框里的能力面；由不可见桥接组件写入。 */
		const sessions = new Map();

		/** 当前插件的 ctx，供后续读取服务用。 */
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

		/**
		 * 不可见桥接：宿主在 conversation.input.overlay 里渲染它，并把
		 * sessionId、inputActions、t 作为 props 传进来。引用浮条是文档级单例，
		 * 必须靠这张表找到"当前看得见的会话"对应的输入框。
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
				return () => {
					if (sessions.get(sessionId) === entry) sessions.delete(sessionId);
				};
			}, [props.sessionId]);

			return null;
		}


		/* ------------------------------------------------------------------ *
		 * P2 选区浮条
		 * ------------------------------------------------------------------ */

		const BAR_ID = "dsh-quote-context-bar";
		const STYLE_ID = "dsh-quote-context-style";
		const TOAST_ID = "dsh-quote-context-toast";
		const CONTENT_SELECTOR = "[data-conversation-content]";
		const CARD_SELECTOR = "[data-composer-card]";
		const COMPOSER_SELECTOR = "[data-composer-input]";
		const GAP = 8;
		const EDGE = 8;
		const SETTLE_MS = 180;
		const TOAST_MS = 1800;

		/** 每个会话的草稿引用；P3 起会渲染成输入卡上方的常驻卡片。 */
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

		/** 浮条、引用区与消息块共用的一份样式。 */
		const STYLE_TEXT = [
			"#dsh-quote-context-bar{position:fixed;z-index:80;box-sizing:border-box;display:flex;align-items:center;gap:2px;padding:3px;border-radius:999px;background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1,#fff));border:.5px solid var(--dsw-alias-border-l1,rgba(15,23,42,.14));box-shadow:var(--dsw-elevation-panel,0 8px 24px rgba(15,23,42,.14));backdrop-filter:var(--dsw-menu-backdrop-filter,blur(12px));-webkit-backdrop-filter:var(--dsw-menu-backdrop-filter,blur(12px));color:var(--dsw-alias-label-primary,#0f1115);font-family:inherit}",
			"#dsh-quote-context-bar[data-visible=false]{display:none}",
			"#dsh-quote-context-bar .qctx-bar-btn{box-sizing:border-box;min-height:0;min-width:0;display:inline-flex;align-items:center;height:28px;padding:0 12px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:500;line-height:20px;cursor:pointer;white-space:nowrap}",
			"#dsh-quote-context-bar .qctx-bar-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(15,23,42,.06))}",
			"#dsh-quote-context-bar .qctx-bar-btn[data-action=quote]{color:var(--dsw-alias-brand-primary,#4176e6)}",
			"#dsh-quote-context-bar .qctx-bar-sep{width:1px;height:16px;margin:0 2px;background:var(--dsw-alias-border-l1,rgba(15,23,42,.14));flex:none}",
			"#dsh-quote-context-bar .qctx-comment-box{display:flex;flex-direction:column;gap:8px;width:300px;max-width:calc(100vw - 32px);padding:10px;border-radius:16px}",
			"#dsh-quote-context-bar .qctx-comment-input{box-sizing:border-box;width:100%;min-height:52px;max-height:160px;padding:2px 3px;border:0;border-radius:0;background:transparent;color:inherit;font:inherit;font-size:13px;line-height:20px;resize:none;outline:none}",
			"#dsh-quote-context-bar .qctx-comment-input::placeholder{color:var(--dsw-alias-label-tertiary,rgba(15,23,42,.48))}",
			"#dsh-quote-context-bar .qctx-comment-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px}",
			"#dsh-quote-context-bar .qctx-comment-actions .qctx-bar-btn{height:26px;padding:0 10px;font-size:12px}",
			"#dsh-quote-context-bar .qctx-comment-actions .qctx-bar-btn[data-action=confirm]{background:var(--dsw-alias-brand-primary,#4176e6);color:var(--dsw-alias-label-primary-foreground,#fff)}",
			"#dsh-quote-context-bar .qctx-comment-actions .qctx-bar-btn[data-action=confirm]:disabled{opacity:.45;cursor:default}",
			"#dsh-quote-context-toast{position:fixed;z-index:90;transform:translateX(-50%);box-sizing:border-box;max-width:320px;padding:7px 11px;border-radius:9px;background:var(--dsw-alias-toast-bg,rgba(15,23,42,.92));color:var(--dsw-alias-toast-label,#fff);font:inherit;font-size:12px;line-height:18px;box-shadow:var(--dsw-elevation-prominent,0 10px 24px rgba(15,23,42,.2));display:none}",
			".qctx-dock{box-sizing:border-box;display:flex;flex-direction:column;gap:6px;width:100%;max-width:var(--dsh-composer-card-max-width,100%);margin:0 auto 6px;font-family:inherit;color:var(--dsw-alias-label-primary,#0f1115)}",
			".qctx-dock-head{display:flex;align-items:center;gap:7px;padding:0 2px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,rgba(15,23,42,.48))}",
			".qctx-dock-title{font-weight:500;color:var(--dsw-alias-label-secondary,rgba(15,23,42,.62))}",
			".qctx-dock-count{color:var(--dsw-alias-label-tertiary,rgba(15,23,42,.48))}",
			".qctx-dock-clear{margin-left:auto;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-tertiary,rgba(15,23,42,.48));font:inherit;font-size:11px;cursor:pointer}",
			".qctx-dock-clear:hover{color:var(--dsw-alias-label-primary,#0f1115)}",
			".qctx-dock-list{display:flex;flex-direction:column;gap:5px}",
			".qctx-dock-card{display:flex;align-items:flex-start;gap:8px;box-sizing:border-box;padding:8px 9px;border:.5px solid var(--dsw-alias-border-l1,rgba(15,23,42,.14));border-radius:12px;background:var(--dsw-alias-bg-layer-1,#fff)}",
			".qctx-dock-num{flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;margin-top:1px;border-radius:6px;background:var(--dsw-alias-brand-primary,#4176e6);color:var(--dsw-alias-label-primary-foreground,#fff);font-size:11px;font-weight:600;line-height:1}",
			".qctx-dock-main{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1 1 auto}",
			".qctx-dock-quote{display:block;width:100%;min-width:0;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary,#0f1115);font:inherit;font-size:13px;font-weight:400;line-height:20px;text-align:start;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}",
			".qctx-dock-quote:hover{color:var(--dsw-alias-brand-primary,#4176e6)}",
			".qctx-dock-comment{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary,rgba(15,23,42,.62));white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
			".qctx-dock-tools{display:flex;align-items:center;gap:2px;flex:none;margin-top:-2px}",
			".qctx-dock-tool{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-tertiary,rgba(15,23,42,.48));font:inherit;font-size:13px;line-height:1;cursor:pointer}",
			".qctx-dock-tool:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(15,23,42,.06));color:var(--dsw-alias-label-primary,#0f1115)}",
			".qctx-dock-remove:hover{color:var(--dsw-alias-state-error-primary,#c9383d)}",
			".qctx-dock-edit{box-sizing:border-box;width:100%;min-height:40px;max-height:140px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l1,rgba(15,23,42,.14));border-radius:8px;background:transparent;color:inherit;font:inherit;font-size:12.5px;line-height:18px;resize:none;outline:none}",
			".qctx-dock-edit:focus{border-color:var(--dsw-alias-brand-primary,#4176e6)}",
			".qctx-dock-edit-actions{display:flex;justify-content:flex-end;gap:6px}",
			".qctx-dock-btn{height:24px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1,rgba(15,23,42,.14));border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,rgba(15,23,42,.62));font:inherit;font-size:11.5px;cursor:pointer}",
			".qctx-dock-btn-primary{border-color:transparent;background:var(--dsw-alias-brand-primary,#4176e6);color:var(--dsw-alias-label-primary-foreground,#fff)}",
			"[data-composer-card].qctx-has-dock [class*=\"_refChip_\"],[data-composer-card].qctx-has-dock [data-dshq-chip],[data-composer-card].qctx-has-dock [data-composer-chip=\"quote-context\"]{display:none!important}",
			".qctx-quote-card{box-sizing:border-box;margin:4px 0 8px;padding-inline-start:12px;border-inline-start:2px solid var(--dsw-alias-border-l1,rgba(15,23,42,.14));color:var(--dsw-alias-label-secondary,rgba(15,23,42,.62))}",
			".qctx-quote-loose{display:block;white-space:pre-wrap;word-break:break-word}",
			".qctx-quote-head{display:flex;align-items:center;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,rgba(15,23,42,.48))}",
			".qctx-quote-mark{color:var(--dsw-alias-brand-primary,#4176e6);font-weight:600}",
			".qctx-quote-title{min-width:0;font-weight:500;color:var(--dsw-alias-label-secondary,rgba(15,23,42,.62))}",
			".qctx-quote-reveal{margin-inline-start:auto;flex:none;padding:0;border:0;background:transparent;color:var(--dsw-alias-brand-primary,#4176e6);font:inherit;font-size:11.5px;line-height:18px;cursor:pointer;white-space:nowrap}",
			".qctx-quote-reveal:hover{text-decoration:underline}",
			".qctx-quote-body{margin-top:2px;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary,rgba(15,23,42,.62));display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;cursor:pointer}",
			".qctx-quote-card[data-expanded=true] .qctx-quote-body{display:block;-webkit-line-clamp:unset;overflow:visible}",
			".qctx-quote-comment{margin-top:4px;white-space:pre-wrap;word-break:break-word;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#0f1115)}",
			".qctx-flash-layer{position:fixed;inset:0;pointer-events:none;z-index:75}",
			".qctx-flash-mark{position:fixed;border-radius:3px;background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4176e6) 28%,transparent);animation:qctx-flash 1.6s ease-out forwards}",
			"@keyframes qctx-flash{0%{opacity:1}80%{opacity:1}100%{opacity:0}}",
			"#dsh-quote-context-toast[data-visible=true]{display:block}",
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
		 * 读取当前选区。只在 [data-conversation-content] 里生效；输入卡、引用区
		 * 和浮条自己的文字都不算。返回选区原文、会话、锚点行和同文本序号。
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

		function quoteItemsOf(sessionId) {
			if (typeof sessionId !== "string" || sessionId === "") return [];
			let list = draftQuotes.get(sessionId);
			if (list === undefined) {
				list = [];
				draftQuotes.set(sessionId, list);
			}
			return list;
		}

		/** 创建一条 QuoteItem；P3 的引用区会读这张表。 */
		function focusComposer() {
			const editor = document.querySelector(COMPOSER_SELECTOR);
			if (editor === null) return;
			const editable = editor.querySelector('[contenteditable="true"]') || editor;
			if (editable !== null && typeof editable.focus === "function") editable.focus({ preventScroll: true });
		}

		function commitQuote(comment) {
			const found = barState.quote;
			if (found === null || typeof found.text !== "string" || found.text.trim() === "") {
				hideBar();
				return;
			}
			// B 口径：引用与评论都只创建 QuoteItem，输入框正文不出现引用文本。
			// 芯片只做发送时的序列化载体，视觉上完全由引用区承担。
			const item = makeQuoteItem(found, comment);
			if (insertChipForItem(item, found.sessionId) !== true) {
				hideBar();
				toast(translateFor(found.sessionId, "failed"));
				return;
			}
			quoteItemsOf(found.sessionId).push(item);
			saveDrafts();
			scheduleDocks();
			hideBar();
			queueMicrotask(focusComposer);
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
		 * P3 引用区：输入卡上方的常驻卡片
		 *
		 * 「引用」和「评论」都只创建 QuoteItem；输入框里放一枚隐藏的原生引用
		 * 芯片，芯片只负责把序列化身份带过发送边界。用户看到的是这张常驻
		 * 卡片列表。卡片插在 [data-composer-card] 之前，输入卡本身尺寸不变。
		 * ------------------------------------------------------------------ */

		const SOURCE_NAME = "quote-context";
		const SOURCE_TRIGGER = "#";
		const REF_PREFIX = "qc1:";
		const QUOTE_MARK = "\u275D";
		const COMMENT_MARK = "\u275E";
		const REF_LINE = /^\s*※\s*[^│\n]*?│qc1:([A-Za-z0-9_-]+)(.*)$/u;
		const DRAFT_KEY = "dsh-quote-context:v1:drafts";

		const docks = new Map();
		const editingQuotes = new Map();
		let dockTimer = null;
		let dockObserver = null;
		let draftSaveTimer = null;

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
					body.push(lines[index].replace(/^>\s?/u, ""));
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

		function findItem(sessionId, itemId) {
			const list = draftQuotes.get(sessionId);
			return Array.isArray(list) ? list.find((item) => item.id === itemId) || null : null;
		}

		function refForItem(item, sessionId) {
			return encodeRef({ v: 1, s: sessionId, i: item.id, t: item.text, c: item.comment || "", a: item.anchor || null });
		}

		function blockForRef(wireRef) {
			const data = decodeRef(wireRef);
			if (data === null) return "";
			const live = findItem(data.s, data.i);
			return quoteBlock(live === null ? data.t : live.text, live === null ? data.c : live.comment, wireRef);
		}

		/** 芯片的发送投影：前后留空行，用户正文才不会跟 ※ 行黏在一起。 */
		function chipPayloadForRef(wireRef) {
			const block = blockForRef(wireRef);
			return block === "" ? "" : "\n" + block + "\n\n";
		}

		function loadDrafts() {
			try {
				if (typeof localStorage === "undefined") return;
				const raw = localStorage.getItem(DRAFT_KEY);
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
							chipLabel: typeof value.chipLabel === "string" ? value.chipLabel : "",
							chip: value.chip === true,
							chipSeenAt: Date.now(),
						});
					}
					if (items.length > 0) draftQuotes.set(sessionId, items);
				}
			} catch (error) {
				// 坏掉的本地草稿不影响插件启动。
			}
		}

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
							chipLabel: item.chipLabel,
							chip: item.chip === true,
						}));
					}
					localStorage.setItem(DRAFT_KEY, JSON.stringify(plain));
				} catch (error) {
					// 存储满了也不能让引用区消失。
				}
			}, 120);
		}

		function uniqueChipLabel(sessionId, text) {
			const list = draftQuotes.get(sessionId) || [];
			const base = translateFor(sessionId, "quoteLabel") + " · " + firstLineOf(text, 40);
			let label = base;
			let counter = 2;
			const taken = new Set(list.map((item) => normalizeLabel(item.chipLabel)));
			while (taken.has(normalizeLabel(label))) {
				label = base + " · " + String(counter);
				counter += 1;
			}
			return label;
		}

		function makeQuoteItem(found, comment) {
			const item = {
				id: "qc-" + String(Date.now()) + "-" + String(Math.floor(Math.random() * 100000)),
				text: found.text,
				comment: typeof comment === "string" ? comment.trim() : "",
				anchor: found.anchor,
				createdAt: Date.now(),
				chipLabel: "",
				chip: false,
				chipSeenAt: 0,
			};
			item.chipLabel = uniqueChipLabel(found.sessionId, item.text);
			return item;
		}

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

		function insertionEntry(sessionId) {
			const entry = sessions.get(sessionId);
			if (entry !== undefined && entry !== null) return entry;
			const shell = inputShellFor(sessionId);
			if (shell === null || shell.actions === null || shell.actions === undefined) return null;
			return { actions: () => shell.actions };
		}

		function insertChipForItem(item, sessionId) {
			if (ensureSource() !== true) return false;
			const shell = inputShellFor(sessionId);
			const entry = insertionEntry(sessionId);
			if (entry === null) return false;
			const wireRef = refForItem(item, sessionId);
			const attachment = {
				source: SOURCE_NAME,
				ref: wireRef,
				label: item.chipLabel,
				appearance: "session",
				clipboardText: chipPayloadForRef(wireRef),
			};
			for (let attempt = 0; attempt < 2; attempt += 1) {
				const actions = entry.actions();
				if (actions === null || actions === undefined || typeof actions.captureInsertion !== "function") return false;
				const captured = actions.captureInsertion();
				let span = captured;
				try {
					const draft = shell !== null && typeof shell.compose === "function" ? String(shell.compose().draft || "") : "";
					if (draft.trim() !== "") span = Object.assign({}, captured, { start: 0, end: 0 });
				} catch (error) {
					// 读不到草稿就按当前光标插入。
				}
				if (shell !== null && typeof shell.insertReference === "function") {
					try {
						if (shell.insertReference(attachment, span) === true) {
							item.chip = true;
							item.chipSeenAt = Date.now();
							return true;
						}
					} catch (error) {
						// 下一轮重取 span 再试。
					}
				}
			}
			return false;
		}

		function removeChipForItem(item, sessionId) {
			const shell = inputShellFor(sessionId);
			if (shell === null || typeof shell.compose !== "function" || typeof shell.consumeToken !== "function") return false;
			let state = null;
			try {
				state = shell.compose();
			} catch (error) {
				return false;
			}
			if (state === null || state === undefined || !Array.isArray(state.occurrences)) return false;
			const draft = typeof state.draft === "string" ? state.draft : "";
			const draftRev = Number(state.draftRev);
			if (!Number.isFinite(draftRev)) return false;
			let shift = 0;
			let found = null;
			for (const occurrence of state.occurrences) {
				if (occurrence === null || occurrence === undefined) continue;
				const length = Number(occurrence.length);
				const offset = Number(occurrence.offset);
				if (!Number.isFinite(length) || !Number.isFinite(offset)) continue;
				const start = offset - shift;
				shift += length - 1;
				if (occurrence.source !== SOURCE_NAME) continue;
				if (normalizeLabel(occurrence.label) !== normalizeLabel(item.chipLabel)) continue;
				if (found !== null) return false;
				found = { start: start, end: start + 1 + (draft.charAt(offset + length) === " " ? 1 : 0), draftRev: draftRev };
			}
			if (found === null) return false;
			try {
				return shell.consumeToken({ kind: "span", span: found }) === true;
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

		function chipLabelsIn(card) {
			const labels = new Set();
			if (card === null || typeof card.querySelectorAll !== "function") return labels;
			for (const element of card.querySelectorAll("*")) {
				const text = normalizeLabel(element.textContent);
				if (text !== "") labels.add(text);
			}
			return labels;
		}

		function labelPresent(labels, label) {
			const wanted = normalizeLabel(label);
			if (wanted === "") return false;
			if (labels.has(wanted)) return true;
			for (const value of labels) {
				if (value.length >= 8 && (value.startsWith(wanted) || wanted.startsWith(value))) return true;
			}
			return false;
		}

		function ensureDock(card) {
			const known = docks.get(card);
			if (known !== undefined && known.isConnected) return known;
			const dock = document.createElement("div");
			dock.setAttribute("data-qctx", "dock");
			dock.className = "qctx-dock";
			dock.setAttribute("role", "region");
			// 芯片被藏起来后卡片会塌一截；先把原来的高度锁成下限，视觉上只让上方内容上移。
			const baseline = Number(card.getBoundingClientRect().height) || 0;
			if (baseline > 0) card.style.minHeight = baseline + "px";
			card.classList.add("qctx-has-dock");
			const host = card.parentElement === null || card.parentElement === undefined ? null : card.parentElement;
			if (host !== null) host.insertBefore(dock, card);
			else document.body.appendChild(dock);
			docks.set(card, dock);
			return dock;
		}

		function removeDock(card) {
			const dock = docks.get(card);
			docks.delete(card);
			if (dock !== undefined && dock.isConnected) dock.remove();
			if (card !== null && card !== undefined && card.classList !== undefined) card.classList.remove("qctx-has-dock");
			if (card !== null && card !== undefined && card.style !== undefined) card.style.minHeight = "";
		}

		function dockHeightFor(card) {
			const dock = docks.get(card);
			return dock === undefined || dock.isConnected !== true ? 0 : Number(dock.offsetHeight) || 0;
		}

		function followDock(card, heightBefore) {
			const port = closestFrom(card, "[data-conversation-scroll]");
			if (port === null) return;
			const pinned = Number(port.scrollHeight) - Number(port.clientHeight) - Number(port.scrollTop) <= 72;
			const dock = docks.get(card);
			const heightAfter = dock === undefined ? 0 : Number(dock.offsetHeight) || 0;
			if (pinned === true && heightAfter !== heightBefore) port.scrollTop = port.scrollHeight;
		}

		function removeQuoteItem(sessionId, itemId) {
			const list = draftQuotes.get(sessionId);
			if (!Array.isArray(list)) return false;
			const item = list.find((entry) => entry.id === itemId);
			if (item === undefined) return false;
			if (item.chip === true && removeChipForItem(item, sessionId) !== true) {
				toast(translateFor(sessionId, "failed"));
				return false;
			}
			draftQuotes.set(sessionId, list.filter((entry) => entry.id !== itemId));
			editingQuotes.delete(sessionId);
			saveDrafts();
			scheduleDocks();
			return true;
		}

		function clearQuoteItems(sessionId) {
			const list = draftQuotes.get(sessionId);
			if (!Array.isArray(list) || list.length === 0) return;
			const kept = [];
			for (const item of list) {
				if (item.chip === true && removeChipForItem(item, sessionId) !== true) kept.push(item);
			}
			draftQuotes.set(sessionId, kept);
			editingQuotes.delete(sessionId);
			saveDrafts();
			scheduleDocks();
		}

		function setQuoteComment(sessionId, itemId, comment) {
			const item = findItem(sessionId, itemId);
			if (item === null) return false;
			item.comment = typeof comment === "string" ? comment.trim() : "";
			editingQuotes.delete(sessionId);
			saveDrafts();
			scheduleDocks();
			return true;
		}

		function renderDock(dock, sessionId, items) {
			dock.replaceChildren();
			dock.setAttribute("aria-label", translateFor(sessionId, "dockTitle"));
			const head = document.createElement("div");
			head.className = "qctx-dock-head";
			const title = document.createElement("span");
			title.className = "qctx-dock-title";
			title.textContent = translateFor(sessionId, "dockTitle");
			const count = document.createElement("span");
			count.className = "qctx-dock-count";
			count.textContent = String(translateFor(sessionId, "dockCount")).replace("{n}", String(items.length));
			head.append(title, count);
			if (items.length > 1) {
				const clear = document.createElement("button");
				clear.type = "button";
				clear.className = "qctx-dock-clear";
				clear.textContent = translateFor(sessionId, "dockClear");
				clear.addEventListener("click", (event) => {
					event.preventDefault();
					clearQuoteItems(sessionId);
				});
				head.append(clear);
			}
			dock.append(head);
			const list = document.createElement("div");
			list.className = "qctx-dock-list";
			items.forEach((item, index) => {
				const card = document.createElement("div");
				card.className = "qctx-dock-card";
				card.setAttribute("data-qctx-item", item.id);
				const num = document.createElement("span");
				num.className = "qctx-dock-num";
				num.textContent = String(index + 1);
				const main = document.createElement("div");
				main.className = "qctx-dock-main";
				const quote = document.createElement("button");
				quote.type = "button";
				quote.className = "qctx-dock-quote";
				quote.textContent = firstLineOf(item.text, 220);
				quote.title = item.text;
				quote.addEventListener("click", (event) => {
					event.preventDefault();
					jumpToAnchor(sessionId, item.anchor, item.text);
				});
				main.append(quote);
				const editing = editingQuotes.get(sessionId) === item.id;
				if (editing === true) {
					const editor = document.createElement("textarea");
					editor.className = "qctx-dock-edit";
					editor.rows = 2;
					editor.placeholder = translateFor(sessionId, "dockEditPlaceholder");
					editor.value = item.comment || "";
					const actions = document.createElement("div");
					actions.className = "qctx-dock-edit-actions";
					const cancel = document.createElement("button");
					cancel.type = "button";
					cancel.className = "qctx-dock-btn";
					cancel.textContent = translateFor(sessionId, "cancel");
					cancel.addEventListener("click", (event) => {
						event.preventDefault();
						editingQuotes.delete(sessionId);
						scheduleDocks();
					});
					const save = document.createElement("button");
					save.type = "button";
					save.className = "qctx-dock-btn qctx-dock-btn-primary";
					save.textContent = translateFor(sessionId, "save");
					save.addEventListener("click", (event) => {
						event.preventDefault();
						setQuoteComment(sessionId, item.id, editor.value);
					});
					actions.append(cancel, save);
					main.append(editor, actions);
					setTimeout(() => editor.focus({ preventScroll: true }), 0);
				} else if (item.comment.trim() !== "") {
					const comment = document.createElement("div");
					comment.className = "qctx-dock-comment";
					comment.textContent = item.comment;
					comment.title = item.comment;
					main.append(comment);
				}
				const tools = document.createElement("div");
				tools.className = "qctx-dock-tools";
				if (editing !== true) {
					const edit = document.createElement("button");
					edit.type = "button";
					edit.className = "qctx-dock-tool";
					edit.textContent = "✎";
					edit.setAttribute("aria-label", translateFor(sessionId, "edit"));
					edit.title = translateFor(sessionId, "edit");
					edit.addEventListener("click", (event) => {
						event.preventDefault();
						editingQuotes.set(sessionId, item.id);
						scheduleDocks();
					});
					const remove = document.createElement("button");
					remove.type = "button";
					remove.className = "qctx-dock-tool qctx-dock-remove";
					remove.textContent = "×";
					remove.setAttribute("aria-label", translateFor(sessionId, "remove"));
					remove.title = translateFor(sessionId, "remove");
					remove.addEventListener("click", (event) => {
						event.preventDefault();
						removeQuoteItem(sessionId, item.id);
					});
					tools.append(edit, remove);
				}
				card.append(num, main, tools);
				list.append(card);
			});
			dock.append(list);
		}

		function syncDocks() {
			if (typeof document === "undefined") return;
			const seen = new Set();
			for (const card of Array.from(document.querySelectorAll(CARD_SELECTOR))) {
				const sessionId = sessionOfCard(card);
				if (sessionId === null) continue;
				seen.add(card);
				let items = draftQuotes.get(sessionId) || [];
				const labels = chipLabelsIn(card);
				if (items.length > 0) {
					const kept = [];
					const now = Date.now();
					for (const item of items) {
						const missing = item.chip === true && item.chipLabel !== "" && labelPresent(labels, item.chipLabel) !== true;
						if (missing === true && item.chipSeenAt > 0 && now - item.chipSeenAt > 1200) continue;
						kept.push(item);
					}
					if (kept.length !== items.length) {
						draftQuotes.set(sessionId, kept);
						items = kept;
						saveDrafts();
					}
				}
				const heightBefore = dockHeightFor(card);
				if (items.length === 0) {
					removeDock(card);
					followDock(card, heightBefore);
					continue;
				}
				const dock = ensureDock(card);
				const editing = editingQuotes.get(sessionId) || "";
				const signature = sessionId + "|" + items.map((item) => item.id + ":" + item.text + ":" + item.comment + ":" + String(item.chip)).join("\u0001") + "|" + editing;
				if (dock.dataset.signature !== signature) {
					dock.dataset.signature = signature;
					renderDock(dock, sessionId, items);
				}
				followDock(card, heightBefore);
			}
			for (const card of Array.from(docks.keys())) {
				if (!seen.has(card) || card.isConnected !== true) removeDock(card);
			}
		}

		function scheduleDocks() {
			if (dockTimer !== null) return;
			dockTimer = setTimeout(() => {
				dockTimer = null;
				syncDocks();
			}, 24);
		}

		function onDockMutations(records) {
			for (const record of records) {
				const target = record.target !== null && record.target.nodeType === 1 ? record.target : record.target.parentElement;
				if (target !== null && target !== undefined && typeof target.closest === "function" && target.closest("[data-qctx]") !== null) continue;
				scheduleDocks();
				return;
			}
		}

		function installDocks() {
			loadDrafts();
			scheduleDocks();
			if (typeof MutationObserver === "function" && document.body !== null) {
				if (dockObserver === null) {
					dockObserver = new MutationObserver(onDockMutations);
					dockObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
				}
			}
			return uninstallDocks;
		}

		function uninstallDocks() {
			if (dockObserver !== null) {
				dockObserver.disconnect();
				dockObserver = null;
			}
			if (dockTimer !== null) {
				clearTimeout(dockTimer);
				dockTimer = null;
			}
			for (const card of Array.from(docks.keys())) removeDock(card);
			editingQuotes.clear();
		}

		const quoteSource = {
			trigger: SOURCE_TRIGGER,
			name: SOURCE_NAME,
			showGroupTitle: false,
			candidates: () => [],
			codec: {
				clipboardText: (ref) => chipPayloadForRef(ref),
				serialize: (ref) => Promise.resolve(chipPayloadForRef(ref)),
			},
		};

		let sourceDisposer = null;
		let sourceRegistered = false;
		let sourceHolders = 0;

		function ensureSource() {
			if (sourceRegistered === true) return true;
			if (pluginCtx === null) return false;
			let service = null;
			try {
				service = pluginCtx.get("inputTriggers");
			} catch (error) {
				service = null;
			}
			if (service === null || service === undefined || typeof service.registerSource !== "function") return false;
			try {
				const disposer = service.registerSource(quoteSource);
				sourceDisposer = typeof disposer === "function" ? disposer : () => {};
				sourceRegistered = true;
				return true;
			} catch (error) {
				sourceRegistered = true;
				sourceDisposer = null;
				return true;
			}
		}

		function holdSource() {
			sourceHolders += 1;
			ensureSource();
		}

		function releaseSource() {
			sourceHolders = Math.max(0, sourceHolders - 1);
			if (sourceHolders > 0) return;
			sourceRegistered = false;
			const disposer = sourceDisposer;
			sourceDisposer = null;
			if (disposer === null) return;
			try {
				disposer();
			} catch (error) {
				// 宿主已经忘记注册时，释放失败不影响页面。
			}
		}

		/* ------------------------------------------------------------------ *
		 * P4 发送后的消息内引用块与跳回高亮
		 *
		 * DSH 把发送后的用户消息存成纯文本；引用块因此以 > ❝ 线格式躺在
		 * 消息正文里。这里只隐藏原始文本 run、在它旁边插入引用卡片，
		 * 不移动 React 节点；卸载时把原文恢复。
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

		/** 在行的文本流里找第 ordinal 个 quote，并还原成 DOM Range。 */
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
			let spans = [];
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
			document.body.appendChild(layer);
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

		/** 一条发送后的引用卡片：来源标题 + 原文（4 行折叠）+ 批注 + 跳回按钮。 */
		function quoteCardFor(segment, sessionId) {
			const ref = segment.ref === undefined || segment.ref === null ? null : segment.ref;
			const card = document.createElement("div");
			card.setAttribute("data-qctx", "quote");
			card.className = "qctx-quote-card";
			card.setAttribute("role", "group");
			const head = document.createElement("div");
			head.className = "qctx-quote-head";
			const mark = document.createElement("span");
			mark.className = "qctx-quote-mark";
			mark.textContent = QUOTE_MARK;
			const title = document.createElement("span");
			title.className = "qctx-quote-title";
			title.textContent = translateFor(sessionId, "sourceFrom");
			head.append(mark, title);
			if (ref !== null && ref.a !== null && typeof ref.a === "object" && (ref.a.key || ref.a.nodeKey)) {
				const reveal = document.createElement("button");
				reveal.type = "button";
				reveal.className = "qctx-quote-reveal";
				reveal.textContent = translateFor(sessionId, "showSource");
				reveal.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					jumpToAnchor(ref.s || sessionId, ref.a, segment.quote);
				});
				head.append(reveal);
			}
			const body = document.createElement("div");
			body.className = "qctx-quote-body";
			body.textContent = segment.quote;
			card.append(head, body);
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
				card.dataset.expanded = card.dataset.expanded === "true" ? "false" : "true";
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
			ctx.effect(() => {
				holdSource();
				return releaseSource;
			}, "quote-context: reference source");
			ctx.effect(() => {
				installDocks();
				return uninstallDocks;
			}, "quote-context: quote dock");
			ctx.effect(() => {
				installTranscript();
				return uninstallTranscript;
			}, "quote-context: transcript quotes");
			ctx.effect(() => {
				if (typeof window === "undefined") return () => {};
				window.__dshQuoteContext = {
					version: "0.1.0-p4",
					sessions: () => Array.from(sessions.keys()),
					probe: () => ({
						sessions: Array.from(sessions.keys()),
						hasSlots: pluginCtx !== null && typeof pluginCtx.get === "function" && pluginCtx.get("slots") !== undefined,
						barMode: barState.mode,
						quoteCount: Array.from(draftQuotes.values()).reduce((sum, list) => sum + list.length, 0),
					}),
					state: () => ({
						mode: barState.mode,
						quote: barState.quote === null ? null : barState.quote.text,
						sessionId: barState.sessionId,
						docks: Array.from(docks.entries()).map(([card, dock]) => ({ sessionId: sessionOfCard(card), cards: dock.querySelectorAll("[data-qctx-item]").length })),
						drafts: Array.from(draftQuotes.entries()).map(([id, list]) => ({ sessionId: id, count: list.length, quotes: list.map((item) => ({ id: item.id, text: item.text, comment: item.comment, chip: item.chip === true, chipLabel: item.chipLabel })) })),
					}),
					syncDocks: () => syncDocks(),
					dockSignatures: () => Array.from(docks.values()).map((dock) => String(dock.dataset.signature || "")),
					dockTimer: () => dockTimer,
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
			blockForRef,
			chipPayloadForRef,
			quoteCardFor,
		};
		return module.exports;
	},
});
