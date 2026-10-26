/**
 * 在 Node 里加载 client 半的 ModuleLoader bundle。
 * 不启动浏览器：用 test/dom.mjs 的最小 DOM 垫片，只调用纯函数/渲染函数。
 */
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDom } from './dom.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** react 只用 useRef/useEffect 的占位；测试不渲染 QuoteBridge。 */
const reactStub = {
	useRef: (value) => ({ current: value }),
	useEffect: () => undefined,
	createElement: () => null,
};

export function loadClient() {
	const dom = createDom();
	const registrations = [];
	const window = {
		__ModuleLoader__: { load: (registration) => registrations.push(registration) },
		innerWidth: 1200,
		innerHeight: 800,
		addEventListener: () => {},
		removeEventListener: () => {},
		visualViewport: { width: 1200, height: 800, offsetLeft: 0, offsetTop: 0 },
	};
	const context = {
		window,
		document: dom.document,
		navigator: dom.navigator,
		localStorage: dom.localStorage,
		getComputedStyle: dom.getComputedStyle,
		MutationObserver: dom.MutationObserver,
		KeyboardEvent: dom.KeyboardEvent,
		Element: dom.Element,
		btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
		atob: (value) => Buffer.from(value, 'base64').toString('binary'),
		TextEncoder,
		TextDecoder,
		console,
		setTimeout,
		clearTimeout,
		queueMicrotask,
	};
	const source = readFileSync(join(here, '..', 'lib', 'client.js'), 'utf8');
	runInNewContext(source, context, { filename: 'lib/client.js' });
	const registration = registrations[0];
	if (registration === undefined) throw new Error('client bundle 没有调用 __ModuleLoader__.load');
	if (registration.id !== 'dsh-quote-context') throw new Error('module id 不对: ' + registration.id);
	const exports = registration.factory((specifier) => {
		if (specifier === 'react') return reactStub;
		throw new Error('unexpected require: ' + specifier);
	});
	return { exports, dom, window };
}
