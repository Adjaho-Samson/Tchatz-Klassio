import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import JSZip from 'jszip';
import * as XLSXNs from 'xlsx';

const XLSX = XLSXNs.default || XLSXNs;
const CFB = XLSXNs.CFB || XLSX.CFB;

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const { window } = dom;
for (const k of [
  'window', 'document', 'DOMParser', 'XMLSerializer', 'navigator', 'localStorage',
  'location', 'HTMLElement', 'Element', 'DocumentFragment', 'Node', 'crypto',
  'XMLHttpRequest', 'CustomEvent', 'Event', 'KeyboardEvent', 'MouseEvent',
  'getComputedStyle', 'HashChangeEvent',
]) {
  try {
    Object.defineProperty(global, k, { value: window[k], configurable: true, writable: true });
  } catch {
    /* certaines globales Node ne sont pas redéfinissables */
  }
}
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = () => 'blob:http://localhost/mock-blob';
  window.URL.revokeObjectURL = () => {};
}
global.URL.createObjectURL = window.URL.createObjectURL;
global.URL.revokeObjectURL = window.URL.revokeObjectURL;

window.matchMedia = window.matchMedia || (() => ({
  matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
}));
global.matchMedia = window.matchMedia;

const fetchStub = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '', headers: new Map() });
global.fetch = fetchStub;
window.fetch = fetchStub;

// Cache Storage simulé en mémoire pour tester la lecture réelle des documents téléchargés.
const memoryCache = new Map();
const cacheImpl = {
  match: async (key) => {
    const entry = memoryCache.get(String(key));
    if (!entry) return null;
    return new Response(entry.bytes.slice(0), { headers: entry.headers });
  },
  put: async (key, response) => {
    const ab = await response.arrayBuffer();
    memoryCache.set(String(key), {
      bytes: ab,
      headers: { 'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream' },
    });
  },
  delete: async (key) => memoryCache.delete(String(key)),
  keys: async () => Array.from(memoryCache.keys()),
};
global.caches = { open: async () => cacheImpl };
window.caches = global.caches;

window.addEventListener('error', (e) => errors.push('window: ' + e.message));
process.on('unhandledRejection', (e) => errors.push('unhandledRejection: ' + (e?.message || e)));
const origErr = console.error;
console.error = (...a) => {
  const msg = a.map(String).join(' ');
  // Ignore l'avertissement jsdom sur <canvas>.getContext non implémenté sans paquet natif canvas.
  if (msg.includes('Not implemented: HTMLCanvasElement.prototype.getContext')) return;
  errors.push('console.error: ' + msg.slice(0, 300));
  origErr(...a);
};

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

const routes = [
  '/', '/rejoindre', '/classe', '/bibliotheque', '/telechargements', '/parametres',
  '/responsable', '/responsable/espace/abc', '/reinitialiser', '/installer',
  '/confidentialite', '/publier/testtoken', '/document/abc', '/statistiques',
];
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

// ============================================================================
// Tests d'intégration du lecteur intégré (DocumentViewer) sur tous les formats
// ============================================================================

async function makeDocxSample() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
    </Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
    </Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p><w:r><w:t>Support de cours : Structures de données en C</w:t></w:r></w:p>
        <w:tbl>
          <w:tr>
            <w:tc><w:p><w:r><w:t>Structure</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>Complexité</w:t></w:r></w:p></w:tc>
          </w:tr>
          <w:tr>
            <w:tc><w:p><w:r><w:t>Liste chaînée</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>O(n)</w:t></w:r></w:p></w:tc>
          </w:tr>
        </w:tbl>
      </w:body>
    </w:document>`);
  return zip.generateAsync({ type: 'arraybuffer' });
}

async function makePptxSample() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
    <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
      <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
      <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
      <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
      <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
    </Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
    </Relationships>`);
  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8"?>
    <p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
      <p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
      <p:sldSz cx="9144000" cy="5143500"/>
    </p:presentation>`);
  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
      <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
      <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>
    </Relationships>`);
  zip.file('ppt/slides/_rels/slide1.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
    </Relationships>`);
  zip.file('ppt/slideLayouts/slideLayout1.xml', `<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree/></p:cSld></p:sldLayout>`);
  zip.file('ppt/slideLayouts/_rels/slideLayout1.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
  zip.file('ppt/slideMasters/slideMaster1.xml', `<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree/></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:sldMaster>`);
  zip.file('ppt/slideMasters/_rels/slideMaster1.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`);
  zip.file('ppt/theme/theme1.xml', `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F497D"/></a:dk2><a:lt2><a:srgbClr val="EEECE1"/></a:lt2><a:accent1><a:srgbClr val="4F81BD"/></a:accent1><a:accent2><a:srgbClr val="C0504D"/></a:accent2><a:accent3><a:srgbClr val="9BBB59"/></a:accent3><a:accent4><a:srgbClr val="8064A2"/></a:accent4><a:accent5><a:srgbClr val="4BACC6"/></a:accent5><a:accent6><a:srgbClr val="F79646"/></a:accent6><a:hlink><a:srgbClr val="0000FF"/></a:hlink><a:folHlink><a:srgbClr val="800080"/></a:folHlink></a:clrScheme></a:themeElements></a:theme>`);
  zip.file('ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8"?>
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
           xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld><p:spTree>
        <p:sp>
          <p:spPr><a:xfrm><a:off x="457200" y="365125"/><a:ext cx="8229600" cy="1143000"/></a:xfrm></p:spPr>
          <p:txBody><a:bodyPr/><a:p><a:r><a:t>Introduction aux Bases de Données</a:t></a:r></a:p></p:txBody>
        </p:sp>
      </p:spTree></p:cSld>
    </p:sld>`);
  return zip.generateAsync({ type: 'arraybuffer' });
}

function makeXlsxSample() {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Étudiant', 'TP 1', 'Examen'],
    ['Adjaho', 18, 17],
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Résultats');
  const u8 = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return u8.buffer ? u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) : new Uint8Array(u8).buffer;
}

function makeDocSample() {
  const docText = 'COURS DE SYSTÈMES D\x92EXPLOITATION\rProcessus et ordonnancement préemptif.\r';
  const textBytes = new Uint8Array(docText.length);
  for (let i = 0; i < docText.length; i++) textBytes[i] = docText.charCodeAt(i) & 0xff;
  const textOffset = 512;
  const wordStream = new Uint8Array(textOffset + textBytes.length);
  const wv = new DataView(wordStream.buffer);
  wv.setUint16(0x0000, 0xa5ec, true);
  wv.setUint16(0x000a, 0x0200, true);
  wv.setUint32(0x0018, textOffset, true);
  wv.setUint32(0x001c, textOffset + textBytes.length, true);
  wv.setUint32(0x004c, textBytes.length, true);
  const clx = new Uint8Array(21);
  const tv = new DataView(clx.buffer);
  clx[0] = 0x02;
  tv.setUint32(1, 16, true);
  tv.setUint32(5, 0, true);
  tv.setUint32(9, textBytes.length, true);
  tv.setUint32(15, ((textOffset * 2) | 0x40000000) >>> 0, true);
  wv.setUint32(0x01a2, 0, true);
  wv.setUint32(0x01a6, clx.length, true);
  wordStream.set(textBytes, textOffset);
  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, '/WordDocument', wordStream);
  CFB.utils.cfb_add(cfb, '/1Table', clx);
  const out = CFB.write(cfb, { type: 'array' });
  return new Uint8Array(out).buffer;
}

const samples = [
  {
    id: 'doc-docx',
    title: 'Cours C',
    fileName: 'cours_c.docx',
    fileType: 'docx',
    bytes: await makeDocxSample(),
    expectText: 'Structures de données en C',
  },
  {
    id: 'doc-pptx',
    title: 'Diapo BDD',
    fileName: 'bdd.pptx',
    fileType: 'pptx',
    bytes: await makePptxSample(),
    expectText: 'Introduction aux Bases de Données',
  },
  {
    id: 'doc-xlsx',
    title: 'Notes L2',
    fileName: 'notes.xlsx',
    fileType: 'xlsx',
    bytes: makeXlsxSample(),
    expectText: 'Adjaho',
  },
  {
    id: 'doc-legacy',
    title: 'Polycopié SE',
    fileName: 'systemes.doc',
    fileType: 'doc',
    bytes: makeDocSample(),
    expectText: 'Processus et ordonnancement préemptif.',
  },
  {
    id: 'doc-rtf',
    title: 'Support RTF',
    fileName: 'cours_rtf.doc',
    fileType: 'doc',
    bytes: new TextEncoder().encode('{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\pard\\b Synth\\\'e8se logique\\b0\\par}').buffer,
    expectText: 'Synthèse logique',
  },
  {
    id: 'doc-csv',
    title: 'Liste présence',
    fileName: 'presence.csv',
    fileType: 'csv',
    bytes: new TextEncoder().encode('Matricule;Nom;Statut\n101;Adjaho;Présent').buffer,
    expectText: 'Présent',
  },
  {
    id: 'doc-txt',
    title: 'Notes cours',
    fileName: 'notes.txt',
    fileType: 'txt',
    bytes: new TextEncoder().encode('Rappel : examen partiel vendredi à 8h00.').buffer,
    expectText: 'examen partiel vendredi',
  },
  {
    id: 'doc-png',
    title: 'Photo du tableau',
    fileName: 'tableau.png',
    fileType: 'png',
    // PNG 1x1 valide
    bytes: Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (c) => c.charCodeAt(0)).buffer,
    expectSelector: '.image-stage-inner img',
  },
];

// Injecte volontairement Content-Type: text/plain dans le cache pour reproduire l'ancien bug !
const downloadsMeta = [];
for (const s of samples) {
  memoryCache.set(`http://localhost/__klassio_offline__/${s.id}`, {
    bytes: s.bytes,
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
  });
  downloadsMeta.push({
    id: s.id,
    title: s.title,
    fileName: s.fileName,
    fileType: s.fileType,
    fileSize: s.bytes.byteLength,
    subjectName: 'Informatique',
    downloadedAt: '2026-11-10T10:00:00Z',
  });
}
window.localStorage.setItem('klassio.downloads', JSON.stringify(downloadsMeta));

window.location.hash = '/telechargements';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await wait(120);

for (let idx = 0; idx < samples.length; idx++) {
  const s = samples[idx];
  const beforeErr = errors.length;
  const readButtons = Array.from(window.document.querySelectorAll('button')).filter((b) => b.textContent.trim() === 'Lire');
  assert.ok(readButtons[idx], `Bouton Lire introuvable pour ${s.fileName}`);
  readButtons[idx].click();
  await wait(350);

  const overlay = window.document.querySelector('.doc-viewer-overlay');
  const overlayText = overlay ? overlay.textContent : '';
  const hasGarbledZip = overlayText.includes('PK\x03\x04') || overlayText.includes('[Content_Types].xml');
  const contentOk = s.expectText
    ? overlayText.includes(s.expectText)
    : Boolean(overlay && overlay.querySelector(s.expectSelector));

  // Pour DOCX, teste également la bascule en « Mode lecture »
  if (s.fileType === 'docx' && overlay) {
    const flowTab = Array.from(overlay.querySelectorAll('button')).find((b) => b.textContent.includes('Mode lecture'));
    if (flowTab) {
      flowTab.click();
      await wait(200);
    }
  }

  const ok = Boolean(overlay) && !hasGarbledZip && contentOk && errors.length === beforeErr;
  if (!ok) failures++;
  console.log(
    `${ok ? '✓' : '✗'} lecture ${s.fileType.toUpperCase().padEnd(6)} (${s.fileName}) — ${
      ok ? 'affiché proprement' : `overlay=${Boolean(overlay)} contentOk=${contentOk} errs=${errors.slice(beforeErr).join(' | ')}`
    }`
  );

  // Referme la visionneuse
  const closeBtn = window.document.querySelector('.doc-viewer-close');
  if (closeBtn) closeBtn.click();
  await wait(80);
}

console.log(failures === 0 ? '\n✓ Toutes les routes et tous les lecteurs de fichiers fonctionnent sans erreur.' : `\n✗ ${failures} vérification(s) en erreur.`);
process.exit(failures === 0 ? 0 : 1);
