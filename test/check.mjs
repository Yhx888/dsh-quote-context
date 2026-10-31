/**
 * 清单/契约检查：包名、导出、bundle patch、locale、图标、client bundle 特征。
 * 不启动浏览器；Node 直接跑。
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadClient } from './load-client.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(join(root, name), 'utf8');
const manifest = JSON.parse(read('package.json'));

if (manifest.name !== 'dsh-quote-context') throw new Error('包名必须是 dsh-quote-context');
if (manifest.type !== 'module') throw new Error('package.json 必须是 ESM');
if (manifest.main !== 'lib/index.js') throw new Error('main 必须是 lib/index.js');
if (manifest.exports?.['./client'] !== './lib/client.js') throw new Error('必须导出 ./client');
if (manifest.dsh?.bundle?.patch !== './cordis.patch.yml') throw new Error('dsh.bundle.patch 缺失');
if (manifest.dsh?.client?.platform !== 'web') throw new Error('dsh.client.platform 必须是 web');
if (!Array.isArray(manifest.files) || !manifest.files.includes('lib') || !manifest.files.includes('locale')) throw new Error('files 必须包含 lib/locale');

for (const file of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml', 'locale/zh.json', 'locale/en.json', 'icon.svg', 'README.md', 'CHANGELOG.md']) {
	if (!existsSync(join(root, file))) throw new Error('缺少文件: ' + file);
}

const patch = read('cordis.patch.yml');
if (!patch.includes('id: quote-context') || !patch.includes('name: dsh-quote-context')) throw new Error('cordis.patch.yml 行不正确');

const zh = JSON.parse(read('locale/zh.json'));
const en = JSON.parse(read('locale/en.json'));
if (typeof zh.meta?.title !== 'string' || typeof zh.meta?.description !== 'string') throw new Error('zh meta 不完整');
if (typeof en.meta?.title !== 'string' || typeof en.meta?.description !== 'string') throw new Error('en meta 不完整');
for (const key of Object.keys(zh)) {
	if (key === 'meta') continue;
	if (typeof en[key] !== 'string') throw new Error('英文词典缺键: ' + key);
}

const client = read('lib/client.js');
for (const needle of ['conversation.input.overlay', 'quote-context.bridge', 'quoteBlock', 'splitQuoteRuns', 'composeOutgoing', 'DRAFT_MARKER', 'qctx-chip', 'qctx-panel', 'onSendKeyDownCapture', 'data-qctx', '-webkit-line-clamp:4', 'text-overflow:ellipsis']) {
	if (!client.includes(needle)) throw new Error('client bundle 缺特征: ' + needle);
}
if (client.includes('@deepseek-ai/dsh-client-runtime')) throw new Error('client 不应依赖 dsh-client-runtime');

const loaded = loadClient();
if (loaded.exports.inject.join(',') !== 'slots,locale') throw new Error('client inject 必须是 slots,locale');
if (loaded.exports.__testing.quoteBlock('正文') !== '> ❝ 正文') throw new Error('quoteBlock 契约失败');

console.log('OK  manifest:', manifest.name + '@' + manifest.version);
console.log('OK  exports :', Object.keys(manifest.exports).join(' '));
console.log('OK  patch   : quote-context / dsh-quote-context');
console.log('OK  locale  :', Object.keys(zh).length, 'keys (zh/en aligned)');
console.log('OK  bundle  :', client.length, 'chars, key markers present');
