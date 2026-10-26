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

console.log('OK  消息内引用卡断言:', count, '组');
