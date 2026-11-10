// Reconnaissance fiable des types de fichiers : extensions, types MIME canoniques,
// signatures binaires (« magic bytes ») et décodage de texte accentué (UTF-8 / Windows-1252).

export const MIME_MAP = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
  tsv: 'text/tab-separated-values;charset=utf-8',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odt: 'application/vnd.oasis.opendocument.text',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
  txt: 'text/plain;charset=utf-8',
  log: 'text/plain;charset=utf-8',
  md: 'text/markdown;charset=utf-8',
  markdown: 'text/markdown;charset=utf-8',
  json: 'application/json;charset=utf-8',
  xml: 'application/xml;charset=utf-8',
  html: 'text/html;charset=utf-8',
  htm: 'text/html;charset=utf-8',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  webm: 'video/webm',
  zip: 'application/zip',
};

// Correspondance inverse (type MIME → extension canonique) au cas où le type stocké est un MIME.
const MIME_TO_EXT = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'text/tab-separated-values': 'tsv',
  'application/vnd.oasis.opendocument.spreadsheet': 'ods',
  'application/vnd.oasis.opendocument.text': 'odt',
  'application/vnd.oasis.opendocument.presentation': 'odp',
  'application/rtf': 'rtf',
  'text/rtf': 'rtf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'application/json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'text/html': 'html',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/zip': 'zip',
};

/** Extrait l'extension en minuscules à partir d'un nom de fichier. */
export function extFromName(fileName) {
  const name = String(fileName || '').trim().split(/[?#]/)[0];
  const idx = name.lastIndexOf('.');
  if (idx <= 0 || idx === name.length - 1) return '';
  return name.slice(idx + 1).toLowerCase();
}

/** Normalise une extension ou un type de fichier vers l'extension canonique sans point. */
export function normalizeExt(fileType, fileName) {
  const raw = String(fileType || '').trim().toLowerCase();
  if (raw) {
    const clean = raw.replace(/^\.+/, '').split(';')[0].trim();
    if (MIME_MAP[clean]) return clean;
    if (MIME_TO_EXT[clean]) return MIME_TO_EXT[clean];
  }
  const fromName = extFromName(fileName);
  if (fromName && MIME_MAP[fromName]) return fromName;
  return raw.replace(/^\.+/, '') || fromName || '';
}

/** Renvoie le type MIME canonique d'un fichier à partir de son type et/ou de son nom. */
export function mimeFor(fileType, fileName) {
  const ext = normalizeExt(fileType, fileName);
  return MIME_MAP[ext] || 'application/octet-stream';
}

/** Garantit qu'un nom de fichier possède bien son extension pour l'enregistrement local. */
export function ensureFileName(fileName, fileType, fallbackTitle = 'document') {
  const ext = normalizeExt(fileType, fileName);
  const base = String(fileName || fallbackTitle || 'document')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '_');
  if (!ext) return base || 'document';
  if (extFromName(base).toLowerCase() === ext) return base;
  // Si jpg/jpeg équivalents, on conserve l'extension existante.
  if ((ext === 'jpg' || ext === 'jpeg') && ['jpg', 'jpeg'].includes(extFromName(base))) {
    return base;
  }
  return `${base || 'document'}.${ext}`;
}

/**
 * Corrige le type MIME d'un Blob.
 * Certains navigateurs mobiles ou serveurs de stockage renvoient « text/plain » ou
 * « application/octet-stream » pour les fichiers Office, PDF ou images, ce qui
 * provoquait l'affichage d'octets bruts illisibles à l'ouverture.
 */
export function normalizeBlob(blob, fileName, fileType) {
  if (!blob) return blob;
  const expected = mimeFor(fileType, fileName);
  const currentBase = String(blob.type || '').split(';')[0].trim().toLowerCase();
  const expectedBase = expected.split(';')[0].trim().toLowerCase();

  // Si on connaît le type attendu grâce à l'extension / métadonnée, il prime toujours
  // sur les types génériques (« text/plain », « application/octet-stream », « application/zip »).
  if (expectedBase !== 'application/octet-stream' && currentBase !== expectedBase) {
    return new Blob([blob], { type: expected });
  }
  if (!currentBase) {
    return new Blob([blob], { type: expected });
  }
  return blob;
}

// Table Windows-1252 (0x80..0x9F) pour les fichiers français issus de Word/Excel sous Windows.
const CP1252_EXTRA = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
  0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178,
};

/** Décode un tableau d'octets en Windows-1252 (accents français : é, è, ê, à, ç, œ, «, », ’…). */
export function decodeWindows1252(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder('windows-1252').decode(u8);
  } catch {
    let out = '';
    for (let i = 0; i < u8.length; i++) {
      const b = u8[i];
      const cp = (b >= 0x80 && b <= 0x9f && CP1252_EXTRA[b]) ? CP1252_EXTRA[b] : b;
      out += String.fromCharCode(cp);
    }
    return out;
  }
}

/**
 * Décode intelligemment un fichier texte (UTF-8 avec/sans BOM, UTF-16LE/BE ou Windows-1252).
 * Évite les caractères «  » sur les fichiers CSV / TXT / HTML enregistrés sous Windows.
 */
export function decodeSmartText(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
  if (u8.length === 0) return '';

  // BOM UTF-8
  if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(u8.subarray(3));
  }
  // BOM UTF-16LE / UTF-16BE
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(u8.subarray(2));
  }
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(u8.subarray(2));
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(u8);
  } catch {
    return decodeWindows1252(u8);
  }
}

/** Détermine si un tampon correspond à du texte lisible (et non à un binaire quelconque). */
export function isLikelyText(buffer) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer || 0);
  if (u8.length === 0) return true;
  // BOM UTF-16
  if (u8.length >= 2 && ((u8[0] === 0xff && u8[1] === 0xfe) || (u8[0] === 0xfe && u8[1] === 0xff))) {
    return true;
  }
  const sampleLen = Math.min(u8.length, 4096);
  let suspicious = 0;
  for (let i = 0; i < sampleLen; i++) {
    const b = u8[i];
    if (b === 0) return false; // Octet nul hors UTF-16 = fichier binaire
    if (b < 32 && b !== 9 && b !== 10 && b !== 13 && b !== 12) {
      suspicious++;
    }
  }
  return suspicious / sampleLen < 0.03;
}

/** Lit rapidement les noms d'entrées d'une archive ZIP sans tout décompresser. */
function listZipEntryNames(u8) {
  const names = [];
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  // Recherche de l'EOCD (PK\x05\x06) depuis la fin pour lire le répertoire central.
  const minPos = Math.max(0, u8.length - 65558);
  let eocd = -1;
  for (let i = u8.length - 22; i >= minPos; i--) {
    if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd !== -1 && eocd + 20 <= u8.length) {
    const total = view.getUint16(eocd + 10, true);
    let ptr = view.getUint32(eocd + 16, true);
    for (let n = 0; n < total && ptr + 46 <= u8.length; n++) {
      if (view.getUint32(ptr, true) !== 0x02014b50) break;
      const nameLen = view.getUint16(ptr + 28, true);
      const extraLen = view.getUint16(ptr + 30, true);
      const commentLen = view.getUint16(ptr + 32, true);
      if (ptr + 46 + nameLen <= u8.length) {
        names.push(new TextDecoder('utf-8').decode(u8.subarray(ptr + 46, ptr + 46 + nameLen)));
      }
      ptr += 46 + nameLen + extraLen + commentLen;
    }
    if (names.length > 0) return names;
  }
  // Repli sur les en-têtes locaux (PK\x03\x04) au début du fichier.
  let p = 0;
  while (p + 30 <= u8.length && names.length < 60) {
    if (view.getUint32(p, true) !== 0x04034b50) break;
    const compSize = view.getUint32(p + 18, true);
    const nameLen = view.getUint16(p + 26, true);
    const extraLen = view.getUint16(p + 28, true);
    if (p + 30 + nameLen > u8.length) break;
    names.push(new TextDecoder('utf-8').decode(u8.subarray(p + 30, p + 30 + nameLen)));
    if (compSize === 0) break;
    p += 30 + nameLen + extraLen + compSize;
  }
  return names;
}

/**
 * Inspecte le contenu réel d'un fichier (magic bytes + structure interne + extension)
 * pour choisir le bon moteur de lecture, même si l'extension ou le MIME est erroné.
 *
 * @returns {{ kind: string, ext: string, mime: string }}
 */
export function detectBufferFormat(arrayBuffer, fileName = '', fileType = '') {
  const ext = normalizeExt(fileType, fileName);
  const u8 = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer || 0);

  // 1. PDF : %PDF-
  if (u8.length >= 5 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) {
    return { kind: 'pdf', ext: 'pdf', mime: MIME_MAP.pdf };
  }

  // 2. Images binaires (PNG, JPEG, GIF, WEBP, BMP)
  if (u8.length >= 8 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) {
    return { kind: 'image', ext: 'png', mime: MIME_MAP.png };
  }
  if (u8.length >= 3 && u8[0] === 0xff && u8[1] === 0xd8 && u8[2] === 0xff) {
    return { kind: 'image', ext: 'jpg', mime: MIME_MAP.jpg };
  }
  if (u8.length >= 6 && u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x38) {
    return { kind: 'image', ext: 'gif', mime: MIME_MAP.gif };
  }
  if (
    u8.length >= 12 &&
    u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 &&
    u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50
  ) {
    return { kind: 'image', ext: 'webp', mime: MIME_MAP.webp };
  }
  if (u8.length >= 2 && u8[0] === 0x42 && u8[1] === 0x4d && ext === 'bmp') {
    return { kind: 'image', ext: 'bmp', mime: MIME_MAP.bmp };
  }

  // 3. Conteneurs ZIP : DOCX, PPTX, XLSX, ODT, ODS, ODP ou archive ZIP
  if (
    u8.length >= 4 &&
    u8[0] === 0x50 && u8[1] === 0x4b &&
    (u8[2] === 0x03 || u8[2] === 0x05 || u8[2] === 0x07)
  ) {
    const entries = listZipEntryNames(u8);
    if (entries.some((e) => e.startsWith('word/'))) {
      return { kind: 'docx', ext: 'docx', mime: MIME_MAP.docx };
    }
    if (entries.some((e) => e.startsWith('ppt/'))) {
      return { kind: 'pptx', ext: 'pptx', mime: MIME_MAP.pptx };
    }
    if (entries.some((e) => e.startsWith('xl/'))) {
      return { kind: 'spreadsheet', ext: 'xlsx', mime: MIME_MAP.xlsx };
    }
    if (entries.includes('content.xml')) {
      // OpenDocument : distingue texte (ODT), classeur (ODS) et présentation (ODP).
      const headAscii = decodeWindows1252(u8.subarray(0, Math.min(u8.length, 300)));
      if (headAscii.includes('opendocument.spreadsheet') || ext === 'ods') {
        return { kind: 'spreadsheet', ext: 'ods', mime: MIME_MAP.ods };
      }
      if (headAscii.includes('opendocument.presentation') || ext === 'odp') {
        return { kind: 'odp', ext: 'odp', mime: MIME_MAP.odp };
      }
      return { kind: 'odt', ext: 'odt', mime: MIME_MAP.odt };
    }
    // Si le répertoire central n'a pu être lu mais que l'extension est connue :
    if (ext === 'docx') return { kind: 'docx', ext: 'docx', mime: MIME_MAP.docx };
    if (ext === 'pptx') return { kind: 'pptx', ext: 'pptx', mime: MIME_MAP.pptx };
    if (ext === 'xlsx' || ext === 'ods') return { kind: 'spreadsheet', ext, mime: MIME_MAP[ext] };
    if (ext === 'odt') return { kind: 'odt', ext: 'odt', mime: MIME_MAP.odt };
    if (ext === 'odp') return { kind: 'odp', ext: 'odp', mime: MIME_MAP.odp };
    return { kind: 'zip', ext: 'zip', mime: MIME_MAP.zip };
  }

  // 4. Conteneurs OLE2 Compound File Binary (Word 97-2003 .doc, Excel .xls, PowerPoint .ppt)
  if (
    u8.length >= 8 &&
    u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0 &&
    u8[4] === 0xa1 && u8[5] === 0xb1 && u8[6] === 0x1a && u8[7] === 0xe1
  ) {
    if (ext === 'xls') return { kind: 'spreadsheet', ext: 'xls', mime: MIME_MAP.xls };
    if (ext === 'ppt') return { kind: 'ppt', ext: 'ppt', mime: MIME_MAP.ppt };
    if (ext === 'doc') return { kind: 'doc', ext: 'doc', mime: MIME_MAP.doc };
    // Détection par nom de flux UTF-16LE dans le répertoire OLE2 (« WordDocument », « Workbook », « PowerPoint Document »)
    const oleScan = decodeUtf16AsciiHints(u8);
    if (oleScan.includes('PowerPoint Document')) return { kind: 'ppt', ext: 'ppt', mime: MIME_MAP.ppt };
    if (oleScan.includes('Workbook') || oleScan.includes('Book')) {
      return { kind: 'spreadsheet', ext: 'xls', mime: MIME_MAP.xls };
    }
    return { kind: 'doc', ext: 'doc', mime: MIME_MAP.doc };
  }

  // 5. Formats audio / vidéo connus par extension
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
    return { kind: 'audio', ext, mime: MIME_MAP[ext] };
  }
  if (['mp4', 'webm'].includes(ext)) {
    return { kind: 'video', ext, mime: MIME_MAP[ext] };
  }

  // 6. Inspection d'en-tête textuel (RTF, SVG, HTML exporté en .doc/.xls, CSV, Markdown, Texte)
  const headSample = decodeSmartText(u8.subarray(0, Math.min(u8.length, 2048))).trimStart();

  if (headSample.startsWith('{\\rtf')) {
    return { kind: 'rtf', ext: 'rtf', mime: MIME_MAP.rtf };
  }

  const headLower = headSample.slice(0, 600).toLowerCase();
  if (ext === 'svg' || (headLower.includes('<svg') && !headLower.includes('<html'))) {
    return { kind: 'image', ext: 'svg', mime: MIME_MAP.svg };
  }

  if (
    headLower.startsWith('<!doctype html') ||
    headLower.startsWith('<html') ||
    headLower.startsWith('<head') ||
    headLower.startsWith('<body') ||
    headLower.startsWith('<table') ||
    headLower.includes('urn:schemas-microsoft-com:office:word') ||
    headLower.includes('urn:schemas-microsoft-com:office:excel')
  ) {
    if (ext === 'xls' || ext === 'xlsx' || headLower.includes('office:excel')) {
      return { kind: 'spreadsheet', ext: 'xls', mime: MIME_MAP.xls };
    }
    return { kind: 'html', ext: ext || 'html', mime: MIME_MAP.html };
  }

  if (ext === 'csv' || ext === 'tsv') {
    return { kind: 'spreadsheet', ext, mime: MIME_MAP[ext] };
  }

  if (ext === 'md' || ext === 'markdown') {
    return { kind: 'markdown', ext: 'md', mime: MIME_MAP.md };
  }

  if (isLikelyText(u8)) {
    return { kind: 'text', ext: ext || 'txt', mime: MIME_MAP[ext] || MIME_MAP.txt };
  }

  return { kind: 'binary', ext, mime: MIME_MAP[ext] || 'application/octet-stream' };
}

/** Extrait les chaînes UTF-16LE ASCII d'un conteneur OLE2 pour identifier ses flux. */
function decodeUtf16AsciiHints(u8) {
  let out = '';
  const limit = Math.min(u8.length - 1, 65536);
  for (let i = 0; i < limit; i += 2) {
    const lo = u8[i];
    const hi = u8[i + 1];
    if (hi === 0 && lo >= 32 && lo <= 126) {
      out += String.fromCharCode(lo);
    } else if (out.length > 0 && out[out.length - 1] !== ' ') {
      out += ' ';
    }
  }
  return out;
}
