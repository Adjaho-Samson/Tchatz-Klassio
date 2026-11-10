// Tests unitaires : conversion des niveaux, traduction des erreurs, récupération auth,
// normalisation des types MIME et lecture de tous les formats de fichiers (DOCX, DOC,
// PPTX, PPT, XLSX, XLS, CSV, RTF, ODT, ODP, PDF, images, texte/Markdown, binaire inconnu).
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

// Environnement minimal pour l'initialisation du client Supabase et DOMParser.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
const { window } = dom;
for (const k of ['window', 'document', 'DOMParser', 'navigator', 'localStorage', 'location', 'crypto', 'Node', 'HTMLElement']) {
  try {
    Object.defineProperty(global, k, { value: window[k], configurable: true, writable: true });
  } catch { /* certaines globales Node ne sont pas redéfinissables */ }
}
global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '', headers: new Map() });

await build({
  entryPoints: [join(root, 'test/units-entry.js')],
  bundle: true,
  format: 'esm',
  outfile: join(root, 'test/units-bundle.mjs'),
  loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty' },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
});

const {
  parseLevel,
  friendlyError,
  errorCode,
  normalizeAuthCallback,
  extFromName,
  normalizeExt,
  mimeFor,
  ensureFileName,
  normalizeBlob,
  decodeSmartText,
  isLikelyText,
  detectBufferFormat,
  sanitizeHtml,
  parseSpreadsheet,
  parsePptx,
  parsePptBinary,
  parseDocBinary,
  parseRtf,
  parseOpenDocument,
  renderMarkdownToHtml,
  parseZipArchive,
} = await import(pathToFileURL(join(root, 'test/units-bundle.mjs')).href);

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log('✓ ' + name);
  } catch (err) {
    failed++;
    console.log('✗ ' + name + ' — ' + (err?.stack || err?.message || err));
  }
}

// --- Récupération de mot de passe ---
await check('lien de récupération avec route et jetons normalisé', () => {
  const result = normalizeAuthCallback('https://example.com/app/#/reinitialiser#access_token=abc&refresh_token=def&type=recovery');
  assert.strictEqual(result.href, 'https://example.com/app/#access_token=abc&refresh_token=def&type=recovery');
  assert.strictEqual(result.recovery, true);
});
await check('lien Supabase standard reconnu sans modification', () => {
  const result = normalizeAuthCallback('https://example.com/app/#access_token=abc&refresh_token=def&type=recovery');
  assert.strictEqual(result.changed, false);
  assert.strictEqual(result.recovery, true);
});
await check('erreur de lien expiré reconnue et route normale préservée', () => {
  assert.strictEqual(normalizeAuthCallback('https://example.com/#error=access_denied&error_code=otp_expired').recovery, true);
  assert.strictEqual(normalizeAuthCallback('https://example.com/#/responsable').recovery, false);
});

// --- Conversion des niveaux ---
await check('parseLevel("Licence 2") → Licence + 2', () =>
  assert.deepStrictEqual(parseLevel('Licence 2'), { level: 'Licence', studyYear: '2' }));
await check('parseLevel("Master 1") → Master + 1', () =>
  assert.deepStrictEqual(parseLevel('Master 1'), { level: 'Master', studyYear: '1' }));
await check('parseLevel("BTS 2") → BTS + 2', () =>
  assert.deepStrictEqual(parseLevel('BTS 2'), { level: 'BTS', studyYear: '2' }));
await check('parseLevel("Doctorat") → Doctorat + 1', () =>
  assert.deepStrictEqual(parseLevel('Doctorat'), { level: 'Doctorat', studyYear: '1' }));
await check('parseLevel("Classe préparatoire") → Autre', () =>
  assert.deepStrictEqual(parseLevel('Classe préparatoire'), { level: 'Autre', studyYear: 'Classe préparatoire' }));

// --- Traduction des erreurs ---
await check('P0001 + CLASSROOM_NOT_FOUND → message code classe', () => {
  assert.strictEqual(errorCode({ code: 'P0001', message: 'CLASSROOM_NOT_FOUND' }), 'CLASSROOM_NOT_FOUND');
  assert.strictEqual(friendlyError({ code: 'P0001', message: 'CLASSROOM_NOT_FOUND' }), 'Aucune classe ne correspond à ce code.');
});
await check('user_already_exists → « Un compte existe déjà »', () => {
  assert.strictEqual(errorCode({ code: 'user_already_exists', message: 'User already registered' }), 'user_already_exists');
  assert.strictEqual(friendlyError({ code: 'user_already_exists', message: 'User already registered' }), 'Un compte existe déjà avec cet email.');
});
await check('contrainte classrooms_level_check → niveau invalide', () =>
  assert.strictEqual(friendlyError({ code: '23514', message: 'new row for relation "classrooms" violates check constraint "classrooms_level_check"' }), 'Niveau invalide. Choisissez un niveau dans la liste.'));
await check('P0001 + NOT_AUTHENTICATED → connexion requise', () =>
  assert.strictEqual(errorCode({ code: 'P0001', message: 'NOT_AUTHENTICATED' }), 'NOT_AUTHENTICATED'));
await check('P0001 + ACADEMIC_YEAR_INVALID → format année', () =>
  assert.strictEqual(errorCode({ code: 'P0001', message: 'ACADEMIC_YEAR_INVALID' }), 'ACADEMIC_YEAR_INVALID'));
await check('Failed to fetch → réseau', () =>
  assert.strictEqual(errorCode(new Error('Failed to fetch')), 'NETWORK'));
await check('Invalid login credentials → identifiants', () =>
  assert.strictEqual(errorCode({ message: 'Invalid login credentials' }), 'invalid_credentials'));
await check('erreur inconnue → message générique (jamais de code brut)', () =>
  assert.strictEqual(friendlyError({ code: 'XX000', message: 'something unexpected' }), 'Une erreur est survenue. Réessayez.'));

// --- Normalisation MIME & protection contre les Blobs text/plain corrompus ---
await check('normalizeBlob corrige un Blob DOCX reçu avec Content-Type text/plain', () => {
  const broken = new Blob(['PK\x03\x04...'], { type: 'text/plain;charset=UTF-8' });
  const fixed = normalizeBlob(broken, 'Chapitre_1.docx', 'docx');
  assert.strictEqual(fixed.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});
await check('normalizeBlob corrige un Blob JPG/XLSX/PPTX reçu en application/octet-stream', () => {
  assert.strictEqual(normalizeBlob(new Blob(['x'], { type: 'application/octet-stream' }), 'photo.jpeg', 'jpg').type, 'image/jpeg');
  assert.strictEqual(normalizeBlob(new Blob(['x'], { type: 'application/zip' }), 'notes.xlsx', 'xlsx').type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.strictEqual(normalizeBlob(new Blob(['x'], { type: '' }), 'cours.pptx', '').type, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
});
await check('ensureFileName et mimeFor gèrent extensions, majuscules et points', () => {
  assert.strictEqual(extFromName('Cours.Pointeurs.DOCX'), 'docx');
  assert.strictEqual(normalizeExt('.PPTX', ''), 'pptx');
  assert.strictEqual(mimeFor('', 'notes.csv').startsWith('text/csv'), true);
  assert.strictEqual(ensureFileName('TD 2 Algèbre', 'pdf'), 'TD 2 Algèbre.pdf');
  assert.strictEqual(ensureFileName('image.jpeg', 'jpg'), 'image.jpeg');
});

// --- Décodage UTF-8 / Windows-1252 et détection binaire ---
await check('decodeSmartText préserve les accents Windows-1252 français (é, è, à, ç, œ)', () => {
  // « Évaluation à l’école : reçu » en Windows-1252 : É=0xC9, à=0xE0, ’=0x92, é=0xE9, ç=0xE7
  const win1252 = new Uint8Array([0xc9, 0x76, 0x61, 0x6c, 0x20, 0xe0, 0x20, 0x6c, 0x92, 0xe9, 0x63, 0x6f, 0x6c, 0x65, 0x20, 0xe7, 0x61]);
  assert.strictEqual(decodeSmartText(win1252), 'Éval à l’école ça');
});
await check('isLikelyText rejette les fichiers binaires contenant des octets nuls', () => {
  assert.strictEqual(isLikelyText(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x06, 0x00])), false);
  assert.strictEqual(isLikelyText(new TextEncoder().encode('Cours de programmation — Licence 2\nChapitre 1')), true);
});

// --- Détection par signature binaire (magic bytes) ---
await check('detectBufferFormat identifie PDF, PNG et JPEG même mal nommés', () => {
  const pdfBytes = new TextEncoder().encode('%PDF-1.7\n...');
  assert.strictEqual(detectBufferFormat(pdfBytes, 'inconnu.bin', '').kind, 'pdf');
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  assert.strictEqual(detectBufferFormat(pngBytes, 'scan', 'doc').kind, 'image');
  const jpgBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  assert.strictEqual(detectBufferFormat(jpgBytes, 'tableau.jpg', 'jpg').ext, 'jpg');
});

await check('detectBufferFormat distingue DOCX, PPTX, XLSX et ODT dans un conteneur ZIP', async () => {
  const docxZip = new JSZip();
  docxZip.file('[Content_Types].xml', '<Types/>');
  docxZip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>Bonjour</w:t></w:r></w:p></w:body></w:document>');
  const docxAb = await docxZip.generateAsync({ type: 'arraybuffer' });
  // Même si renommé en .doc, le moteur détecte qu'il s'agit d'un vrai DOCX :
  assert.strictEqual(detectBufferFormat(docxAb, 'cours.doc', 'doc').kind, 'docx');

  const pptxZip = new JSZip();
  pptxZip.file('ppt/presentation.xml', '<p:presentation/>');
  pptxZip.file('ppt/slides/slide1.xml', '<p:sld/>');
  const pptxAb = await pptxZip.generateAsync({ type: 'arraybuffer' });
  assert.strictEqual(detectBufferFormat(pptxAb, 'expose.ppt', 'ppt').kind, 'pptx');
});

// --- Lecture des tableurs : XLSX, XLS (BIFF8) et CSV Excel français ---
await check('parseSpreadsheet lit un classeur XLSX multi-feuilles avec fusions', async () => {
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet([
    ['Notes Licence 2 — Informatique', '', ''],
    ['Matricule', 'Étudiant', 'Moyenne'],
    ['2026-01', 'Adjaho Samson', 17.5],
    ['2026-02', 'Koffi Amina', 15.25],
  ]);
  ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Semestre 1');
  const ws2 = XLSX.utils.aoa_to_sheet([['Matière', 'Crédits'], ['Algorithmique', 6]]);
  XLSX.utils.book_append_sheet(wb, ws2, 'Crédits');

  const xlsxBuf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  assert.strictEqual(detectBufferFormat(xlsxBuf, 'notes.xlsx', 'xlsx').kind, 'spreadsheet');
  const parsed = await parseSpreadsheet(xlsxBuf, 'xlsx');
  assert.strictEqual(parsed.sheets.length, 2);
  assert.strictEqual(parsed.sheets[0].name, 'Semestre 1');
  assert.strictEqual(parsed.sheets[0].rows[0][0].colSpan, 3);
  assert.strictEqual(parsed.sheets[0].rows[0][1].skip, true);
  assert.strictEqual(parsed.sheets[0].rows[2][1].text, 'Adjaho Samson');

  // Test format binaire ancien .xls (BIFF8 / OLE2)
  const xlsBuf = XLSX.write(wb, { type: 'array', bookType: 'biff8' });
  assert.strictEqual(detectBufferFormat(xlsBuf, 'notes.xls', 'xls').kind, 'spreadsheet');
  const parsedXls = await parseSpreadsheet(xlsBuf, 'xls');
  assert.strictEqual(parsedXls.sheets[0].rows[3][1].text, 'Koffi Amina');
});

await check('parseSpreadsheet lit un CSV français « ; » en Windows-1252 avec décimales « , »', async () => {
  // "Nom;Prénom;Note\r\nAdjaho;Samson;16,50" avec é = 0xE9 en Windows-1252
  const bytes = new Uint8Array([
    ...new TextEncoder().encode('Nom;Pr'),
    0xe9,
    ...new TextEncoder().encode('nom;Note\r\nAdjaho;Samson;16,50'),
  ]);
  const res = await parseSpreadsheet(bytes.buffer, 'csv');
  assert.strictEqual(res.sheets[0].colCount, 3);
  assert.strictEqual(res.sheets[0].rows[0][1].text, 'Prénom');
  assert.strictEqual(res.sheets[0].rows[1][2].text, '16,50');
  assert.strictEqual(res.sheets[0].rows[1][2].align, 'right');
});

// --- Lecture PowerPoint : PPTX (OpenXML) et PPT (binaire OLE2 97-2003) ---
await check('parsePptx extrait les diapositives et le texte d’un fichier .pptx', async () => {
  const zip = new JSZip();
  zip.file('ppt/slides/slide1.xml', `<?xml version="1.0" encoding="UTF-8"?>
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
           xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <p:cSld><p:spTree>
        <p:sp><p:txBody><a:p><a:r><a:t>Chapitre 1 : Réseaux TCP/IP</a:t></a:r></a:p></p:txBody></p:sp>
        <p:sp><p:txBody><a:p><a:r><a:t>Modèle OSI et adressage IPv4</a:t></a:r></a:p></p:txBody></p:sp>
      </p:spTree></p:cSld>
    </p:sld>`);
  const ab = await zip.generateAsync({ type: 'arraybuffer' });
  const deck = await parsePptx(ab);
  assert.strictEqual(deck.slides.length, 1);
  const jsonStr = JSON.stringify(deck.slides[0]);
  assert.ok(jsonStr.includes('Chapitre 1 : Réseaux TCP/IP'));
  assert.ok(jsonStr.includes('Modèle OSI et adressage IPv4'));
});

await check('parsePptBinary extrait les diapositives d’un fichier PowerPoint 97-2003 (.ppt OLE2)', async () => {
  // Construit un flux « PowerPoint Document » minimal valide : RT_Slide (0x03EE, ver=0xF)
  // contenant TextHeaderAtom (0x0F9F = 0 Titre) + TextCharsAtom (0x0FA0 UTF-16LE) + TextBytesAtom (0x0FA8 CP1252).
  function rec(verInst, type, payload) {
    const out = new Uint8Array(8 + payload.length);
    const dv = new DataView(out.buffer);
    dv.setUint16(0, verInst, true);
    dv.setUint16(2, type, true);
    dv.setUint32(4, payload.length, true);
    out.set(payload, 8);
    return out;
  }
  const titleHdr = new Uint8Array(4); // 0 = Title
  const titleUtf16 = new Uint8Array('Architecture des ordinateurs'.length * 2);
  for (let i = 0; i < 'Architecture des ordinateurs'.length; i++) {
    titleUtf16[i * 2] = 'Architecture des ordinateurs'.charCodeAt(i);
  }
  const bodyHdr = new Uint8Array([1, 0, 0, 0]); // 1 = Body
  const bodyBytes = new TextEncoder().encode('Unite arithmetique et logique\rMemoire cache');

  const children = new Uint8Array([
    ...rec(0x0000, 0x0f9f, titleHdr),
    ...rec(0x0000, 0x0fa0, titleUtf16),
    ...rec(0x0000, 0x0f9f, bodyHdr),
    ...rec(0x0000, 0x0fa8, bodyBytes),
  ]);
  const slideContainer = rec(0x000f, 0x03ee, children);

  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, '/PowerPoint Document', slideContainer);
  const cfbBytes = CFB.write(cfb, { type: 'array' });

  assert.strictEqual(detectBufferFormat(cfbBytes, 'cours.ppt', 'ppt').kind, 'ppt');
  const deck = await parsePptBinary(cfbBytes);
  assert.strictEqual(deck.slides.length, 1);
  assert.strictEqual(deck.slides[0].title, 'Architecture des ordinateurs');
  assert.deepStrictEqual(deck.slides[0].bullets, ['Unite arithmetique et logique', 'Memoire cache']);
});

// --- Lecture Word 97-2003 (.doc OLE2), RTF et ODT ---
await check('parseDocBinary lit la table des pièces (FIB + Clx) et les tableaux d’un .doc OLE2', async () => {
  // Construit un flux WordDocument + 1Table conforme MS-DOC (magic 0xA5EC, Clx Pcdt CP1252).
  const docText = 'CHAPITRE 1 : ALGORITHMIQUE\rDéfinition d\x92un pointeur\rColonne A\x07Colonne B\x07\x07Valeur 1\x07Valeur 2\x07\x07Fin du cours.\r';
  const textBytes = new Uint8Array(docText.length);
  for (let i = 0; i < docText.length; i++) textBytes[i] = docText.charCodeAt(i) & 0xff;

  const textOffset = 512;
  const wordStream = new Uint8Array(textOffset + textBytes.length);
  const wv = new DataView(wordStream.buffer);
  wv.setUint16(0x0000, 0xa5ec, true); // wIdent
  wv.setUint16(0x000a, 0x0200, true); // fWhichTblStm → 1Table
  wv.setUint32(0x0018, textOffset, true); // fcMin
  wv.setUint32(0x001c, textOffset + textBytes.length, true); // fcMac
  wv.setUint32(0x004c, textBytes.length, true); // ccpText
  wv.setUint32(0x01a2, 0, true); // fcClx

  // Clx : [0x02 (Pcdt)] [size=16 (uint32)] [cp0=0, cp1=len] [pcd (8 octets : 2 octets + fc compressé + 2 octets)]
  const clx = new Uint8Array(1 + 4 + 8 + 8);
  const tv = new DataView(clx.buffer);
  clx[0] = 0x02;
  tv.setUint32(1, 16, true);
  tv.setUint32(5, 0, true);
  tv.setUint32(9, textBytes.length, true);
  // Pour une pièce CP1252 compressée, fc porte le bit 0x40000000 et vaut (byteOffset * 2) | 0x40000000
  tv.setUint32(15, ((textOffset * 2) | 0x40000000) >>> 0, true);

  wv.setUint32(0x01a6, clx.length, true); // lcbClx
  wordStream.set(textBytes, textOffset);

  const cfb = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfb, '/WordDocument', wordStream);
  CFB.utils.cfb_add(cfb, '/1Table', clx);
  const cfbBytes = CFB.write(cfb, { type: 'array' });

  assert.strictEqual(detectBufferFormat(cfbBytes, 'polycopie.doc', 'doc').kind, 'doc');
  const parsed = await parseDocBinary(cfbBytes);
  assert.strictEqual(parsed.blocks[0].type, 'heading');
  assert.strictEqual(parsed.blocks[0].text, 'CHAPITRE 1 : ALGORITHMIQUE');
  assert.strictEqual(parsed.blocks[1].text, 'Définition d’un pointeur');
  const tableBlock = parsed.blocks.find((b) => b.type === 'table');
  assert.ok(tableBlock, 'le tableau Word binaire doit être reconstitué');
  assert.deepStrictEqual(tableBlock.rows[0], ['Colonne A', 'Colonne B']);
  assert.deepStrictEqual(tableBlock.rows[1], ['Valeur 1', 'Valeur 2']);
});

await check('parseRtf ignore fonttbl/stylesheet et décode les accents et tableaux RTF (y compris .doc RTF)', () => {
  const rtf = `{\\rtf1\\ansi\\ansicpg1252{\\fonttbl{\\f0 Arial;}}{\\colortbl;\\red0\\green0\\blue0;}
\\pard\\b Cours d\\'e9lectronique\\b0\\par
Chapitre \\u233?tudi\\'e9 en classe.\\par
\\trowd\\H1\\b Module\\b0\\cell Coefficient\\cell\\row
\\trowd Logique\\cell 4\\cell\\row}`;
  const ab = new TextEncoder().encode(rtf).buffer;
  assert.strictEqual(detectBufferFormat(ab, 'support.doc', 'doc').kind, 'rtf');
  const html = parseRtf(ab);
  assert.ok(!html.includes('Arial'), 'fonttbl ne doit pas apparaître dans le document');
  assert.ok(html.includes('<strong>Cours d’électronique</strong>') || html.includes('<strong>Cours délectronique</strong>') || html.includes('électronique'));
  assert.ok(html.includes('Chapitre étudié en classe.'));
  assert.ok(html.includes('<table>') && html.includes('<td>Logique</td>'));
});

await check('parseOpenDocument lit un fichier .odt (titres, paragraphes, listes, tableaux)', async () => {
  const zip = new JSZip();
  zip.file('mimetype', 'application/vnd.oasis.opendocument.text');
  zip.file('content.xml', `<?xml version="1.0" encoding="UTF-8"?>
    <office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
      xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
      xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0">
      <office:body><office:text>
        <text:h text:outline-level="2">Travaux dirigés n°3</text:h>
        <text:p>Résoudre les équations suivantes :</text:p>
        <table:table><table:table-row><table:table-cell><text:p>Exercice 1</text:p></table:table-cell></table:table-row></table:table>
      </office:text></office:body>
    </office:document-content>`);
  const ab = await zip.generateAsync({ type: 'arraybuffer' });
  assert.strictEqual(detectBufferFormat(ab, 'td3.odt', 'odt').kind, 'odt');
  const html = await parseOpenDocument(ab, 'odt');
  assert.ok(html.includes('<h2>Travaux dirigés n°3</h2>'));
  assert.ok(html.includes('<td><p>Exercice 1</p></td>'));
});

// --- Sécurité HTML, Markdown et ZIP ---
await check('sanitizeHtml supprime les scripts/événements XSS et les marges négatives', () => {
  const dirty = '<div style="margin-left: -90px; color: #163b70" onclick="alert(1)"><script>evil()</script><p>Texte propre</p><img src="javascript:alert(1)" /><a href="javascript:void(0)">Lien</a></div>';
  const clean = sanitizeHtml(dirty);
  assert.ok(!clean.includes('<script'));
  assert.ok(!clean.includes('onclick'));
  assert.ok(!clean.includes('javascript:'));
  assert.ok(!clean.includes('-90px'));
  assert.ok(clean.includes('Texte propre'));
});

await check('renderMarkdownToHtml et parseZipArchive fonctionnent proprement', async () => {
  const md = renderMarkdownToHtml('# Titre\n- Premier point\n- **Second** point');
  assert.ok(md.includes('<h1>Titre</h1>') && md.includes('<strong>Second</strong>'));

  const zip = new JSZip();
  zip.file('sujet.pdf', 'contenu');
  const ab = await zip.generateAsync({ type: 'arraybuffer' });
  const archive = await parseZipArchive(ab);
  assert.strictEqual(archive.files.length, 1);
  assert.strictEqual(archive.files[0].name, 'sujet.pdf');
});

console.log(failed === 0 ? `\n✓ ${passed} tests unitaires réussis.` : `\n✗ ${failed} test(s) en échec (${passed} réussis).`);
process.exit(failed === 0 ? 0 : 1);
