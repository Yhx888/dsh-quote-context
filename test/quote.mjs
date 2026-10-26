/**
 * 线格式/坐标/卡片纯函数测试。全部跑在 Node 里，不依赖浏览器。
 */
import { loadClient } from './load-client.mjs';

const { exports } = loadClient();
const t = exports.__testing;
let count = 0;
const eq = (actual, expected, label) => {
	count += 1;
	if (JSON.stringify(actual) !== JSON.stringify(expected)) {
		throw new Error(label + '\n期望: ' + JSON.stringify(expected) + '\n实际: ' + JSON.stringify(actual));
	}
};

// 1. 基本线格式：原文多行 + 批注 + 坐标
const block = t.quoteBlock('第一行\n第二行', '第一条批注\n第二条批注', 'qc1:AAAA');
eq(block, '> ❝ 第一行\n> 第二行\n> ❞ 第一条批注\n> 第二条批注\n> ※ │qc1:AAAA', '多行引用块');
eq(t.splitQuoteRuns(block), [{ type: 'quote', quote: '第一行\n第二行', comment: '第一条批注\n第二条批注' }], '多行引用块回读');

// 2. 无批注/无坐标
eq(t.quoteBlock('原文'), '> ❝ 原文', '无批注无坐标');
eq(t.splitQuoteRuns('> ❝ 原文'), [{ type: 'quote', quote: '原文', comment: '' }], '无批注回读');

// 3. 以 ※ 开头的正文要转义，回读还原
const escaped = t.quoteBlock('※ 正文不是坐标', '', '');
if (!escaped.startsWith('> ❝ \\※ 正文')) throw new Error('※ 行未转义: ' + escaped);
eq(t.splitQuoteRuns(escaped), [{ type: 'quote', quote: '※ 正文不是坐标', comment: '' }], '转义正文回读');

// 4. 坐标 UTF-8 往返（含中文和特殊字符）
const data = { v: 1, s: '会话 α/β', i: 'qc-1', t: '引用正文', c: '批注', a: { key: 'row-1', ordinal: 2, prefix: '前', suffix: '后' } };
const encoded = t.encodeRef(data);
if (!/^qc1:[A-Za-z0-9_-]+$/u.test(encoded)) throw new Error('坐标不是 base64url');
eq(t.decodeRef(encoded), data, '坐标 JSON 往返');
eq(t.decodeRef('qc1:AAAA'), null, '坏坐标返回 null');

// 5. 同一行 ref 后面跟用户正文：旧消息兼容
const trailing = t.quoteBlock('原文', '', 'qc1:AAAA') + '  用户正文';
const trailingSegments = t.splitQuoteRuns(trailing);
const trailingQuote = trailingSegments.find((segment) => segment.type === 'quote');
const trailingText = trailingSegments.find((segment) => segment.type === 'text');
if (trailingQuote === undefined || trailingQuote.quote !== '原文') throw new Error('ref 行后正文: 引用段丢失');
if (trailingText === undefined || trailingText.text !== '用户正文') throw new Error('ref 行后正文: 用户正文丢失');

// 6. 芯片载荷前后留空行，正文才会与 ※ 行分开
const payload = t.chipPayloadForRef(t.encodeRef({ v: 1, s: 's', i: 'i', t: '正文', c: '', a: null }));
if (!payload.startsWith('\n> ❝ 正文') || !payload.endsWith('\n\n')) throw new Error('芯片载荷空行不正确: ' + JSON.stringify(payload));

// 7. 单行截断/空白折叠
eq(t.normalizeLabel('  引用\n 文字  '), '引用 文字', '空白折叠');
if (t.firstLineOf('一二三四五六七八九十', 6) !== '一二三四五…') throw new Error('单行截断不正确');
if (t.firstLineOf('短', 6) !== '短') throw new Error('短文本不应截断');

console.log('OK  线格式/坐标断言:', count, '组');
