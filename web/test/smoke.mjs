import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const { window } = dom;
for (const k of ['window', 'document', 'navigator', 'localStorage', 'location', 'HTMLElement', 'Node', 'crypto', 'XMLHttpRequest', 'CustomEvent', 'Event', 'getComputedStyle', 'HashChangeEvent']) {
  try {
    Object.defineProperty(global, k, { value: window[k], configurable: true, writable: true });
  } catch {
    /* certaines globales Node ne sont pas redéfinissables */
  }
}
window.scrollTo = () => {};
window.matchMedia = window.matchMedia || (() => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
global.matchMedia = window.matchMedia;
const fetchStub = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '', headers: new Map() });
global.fetch = fetchStub;
window.fetch = fetchStub;
global.caches = { open: async () => ({ match: async () => null, put: async () => {}, delete: async () => {}, keys: async () => [] }) };
window.caches = global.caches;
window.addEventListener('error', (e) => errors.push('window: ' + e.message));
process.on('unhandledRejection', (e) => errors.push('unhandledRejection: ' + (e?.message || e)));
const origErr = console.error;
console.error = (...a) => { errors.push('console.error: ' + a.map(String).join(' ').slice(0, 300)); origErr(...a); };

await build({
  entryPoints: [join(root, 'test/smoke-entry.jsx')],
  bundle: true,
  format: 'esm',
  outfile: join(root, 'test/smoke-bundle.mjs'),
  jsx: 'automatic',
  loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty' },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
});

await import(pathToFileURL(join(root, 'test/smoke-bundle.mjs')).href);
window.__renderApp();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(120);

const routes = ['/', '/rejoindre', '/classe', '/bibliotheque', '/telechargements', '/parametres', '/responsable', '/responsable/espace/abc', '/reinitialiser', '/installer', '/confidentialite', '/publier/testtoken', '/document/abc'];
let failures = 0;
for (const r of routes) {
  const before = errors.length;
  window.location.hash = r;
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await wait(90);
  const html = window.document.getElementById('root').innerHTML;
  const ok = html.length > 200 && errors.length === before;
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${r.padEnd(22)} rendu ${html.length} octets${errors.length > before ? ' — ' + errors.slice(before).join(' | ') : ''}`);
}
console.log(failures === 0 ? '\n✓ Toutes les routes se rendent sans erreur.' : `\n✗ ${failures} route(s) en erreur.`);
process.exit(failures === 0 ? 0 : 1);
