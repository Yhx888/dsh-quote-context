/**
 * DOM 渲染测试：借 dsh-quote-deck 的最小 DOM 垫片，验证消息内引用卡片。
 */
import { loadClient } from './load-client.mjs';

const { exports, dom } = loadClient();
const t = exports.__testing;
let count = 0;
const ok = (value, label) => {
	count += 1;
	if (!value) throw new Error(label);
};

const ref = t.decodeRef(t.encodeRef({ v: 1, s: 's1', i: 'qc-1', t: '原文', c: '批注', a: { key: 'row-1', ordinal: 1 } }));
const card = t.quoteCardFor({ type: 'quote', quote: '原文', comment: '批注', ref }, 's1');
dom.document.body.append(card);

ok(card.getAttribute('data-qctx') === 'quote', '卡片缺 data-qctx');
ok(card.getAttribute('role') === 'group', '卡片缺 role=group');
ok(card.textContent.includes('引用自先前的消息'), '卡片缺来源标题');
ok(card.textContent.includes('原文'), '卡片缺原文');
ok(card.textContent.includes('批注'), '卡片缺批注');
ok(card.querySelector('.qctx-quote-reveal') !== null, '卡片缺跳回按钮');

const noRef = t.quoteCardFor({ type: 'quote', quote: '没有坐标', comment: '' }, 's1');
ok(noRef.querySelector('.qctx-quote-reveal') === null, '无坐标不应有跳回按钮');

// 回归：一条消息连续 3 段引用（其中一段无批注、一段无 ref），
// 块之间只有单个换行也不能把 ※ │qc1 行漏到界面上。
const refFor = (n) => t.encodeRef({ v: 1, s: 's1', i: 'q' + n, t: '原文' + n, c: '', a: { key: 'row-1', ordinal: n } });
const wire = [
	t.quoteBlock('第一段', '', refFor(1)),
	t.quoteBlock('第二段', '第二段批注', refFor(2)),
	t.quoteBlock('第三段', '', ''),
].join('\n');
const host = dom.document.createElement('div');
host.setAttribute('data-conversation-content', '');
host.setAttribute('data-conversation-session', 's1');
const run = dom.document.createElement('div');
run.textContent = wire;
host.append(run);
dom.document.body.append(host);
t.enhanceQuoteRun(run);

const cards = host.querySelectorAll('[data-qctx="quote"]');
ok(cards.length === 3, '多引用应渲染 3 张引用卡，实际 ' + cards.length);
ok(run.style.display === 'none', '原始引用文本应被隐藏');
for (const card of cards) {
	ok(!card.textContent.includes('qc1:'), '引用卡泄漏了 qc1 坐标');
	ok(!card.textContent.includes('※'), '引用卡泄漏了 ※ 传输行');
	ok(card.textContent.includes('引用自先前的消息'), '引用卡缺来源标题');
}
ok(cards[1].textContent.includes('第二段批注'), '第二段的批注丢失');
ok(cards[0].textContent.includes('第一段') && cards[2].textContent.includes('第三段'), '多段原文丢失');

console.log('OK  消息内引用卡断言:', count, '组');
