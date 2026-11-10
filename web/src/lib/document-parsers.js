// Moteurs d'extraction et de mise en forme côté navigateur pour tous les formats
// hors PDF et DOCX natifs : Excel/CSV/ODS, PowerPoint PPTX/PPT/ODP, Word 97-2003 (.doc),
// RTF, OpenDocument (.odt), Markdown et archives ZIP.
// Fonctionne 100 % dans le navigateur (en ligne comme hors connexion), sans service tiers.

import { decodeSmartText, decodeWindows1252 } from './file-types.js';
import { escapeHtml, sanitizeHtml } from './sanitize-html.js';

// ============================================================================
// 1. TABLEURS : .xlsx, .xls, .ods, .csv, .tsv
// ============================================================================

/** Détecte le séparateur le plus cohérent d'un fichier CSV (; en français, , ou tabulation). */
function detectCsvDelimiter(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 25);
  if (lines.length === 0) return ';';

  const candidates = [';', '\t', ',', '|'];
  let best = ';';
  let bestScore = -1;

  for (const delim of candidates) {
    const counts = lines.map((line) => {
      let inQuotes = false;
      let count = 0;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') i++;
          else inQuotes = !inQuotes;
        } else if (ch === delim && !inQuotes) {
          count++;
        }
      }
      return count;
    });
    const nonZero = counts.filter((c) => c > 0);
    if (nonZero.length === 0) continue;
    const first = nonZero[0];
    const consistent = nonZero.filter((c) => c === first).length;
    // Favorise un séparateur régulier d'une ligne à l'autre (ex. « ; » sur CSV Excel français).
    const score = consistent * 10 + Math.min(first, 30);
    if (score > bestScore) {
      bestScore = score;
      best = delim;
    }
  }
  return best;
}

/** Découpe un texte CSV/TSV en grille 2D selon RFC 4180. */
function parseCsvRows(text, forcedDelimiter = null) {
  const delim = forcedDelimiter || detectCsvDelimiter(text);
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  // Retire les lignes entièrement vides en fin de fichier.
  while (rows.length > 0 && rows[rows.length - 1].every((c) => !String(c).trim())) {
    rows.pop();
  }
  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const formattedRows = rows.map((r) => {
    const cells = [];
    for (let c = 0; c < colCount; c++) {
      const val = (r[c] ?? '').trim();
      const isNum = val !== '' && /^-?\d+(?:[.,]\d+)?(?:\s*%)?$/.test(val);
      cells.push({ text: val, align: isNum ? 'right' : 'left' });
    }
    return cells;
  });

  return {
    sheets: [
      {
        name: 'Données',
        rows: formattedRows,
        colCount,
        colWidths: Array(colCount).fill(null),
      },
    ],
  };
}

/** Convertit un numéro de colonne (0 → A, 25 → Z, 26 → AA). */
export function columnLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Extrait toutes les feuilles d'un classeur Excel (.xlsx, .xls), OpenDocument (.ods) ou CSV/TSV. */
export async function parseSpreadsheet(arrayBuffer, ext = 'xlsx') {
  if (ext === 'csv' || ext === 'tsv') {
    const text = decodeSmartText(arrayBuffer);
    return parseCsvRows(text, ext === 'tsv' ? '\t' : null);
  }

  const XLSX = await import('xlsx');
  const workbook = XLSX.read(arrayBuffer, {
    type: 'array',
    cellDates: true,
    cellNF: true,
    WTF: false,
  });

  const sheets = (workbook.SheetNames || []).map((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet || !sheet['!ref']) {
      return { name, rows: [], colCount: 0, colWidths: [] };
    }

    const range = XLSX.utils.decode_range(sheet['!ref']);
    const startR = range.s.r;
    const startC = range.s.c;
    // Plafonne l'exploration pour éviter les feuilles avec 1 million de lignes vides formatées.
    const capR = Math.min(range.e.r, startR + 5000);
    const capC = Math.min(range.e.c, startC + 120);

    let maxNonEmptyR = -1;
    let maxNonEmptyC = -1;

    for (let r = startR; r <= capR; r++) {
      for (let c = startC; c <= capC; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[addr];
        if (cell && cell.v !== undefined && cell.v !== null && String(cell.v).trim() !== '') {
          if (r > maxNonEmptyR) maxNonEmptyR = r;
          if (c > maxNonEmptyC) maxNonEmptyC = c;
        }
      }
    }

    // Prend aussi en compte les fusions qui couvrent des cellules non vides.
    const rawMerges = Array.isArray(sheet['!merges']) ? sheet['!merges'] : [];
    for (const m of rawMerges) {
      if (m.s.r <= maxNonEmptyR && m.s.c <= maxNonEmptyC) {
        maxNonEmptyR = Math.max(maxNonEmptyR, Math.min(m.e.r, capR));
        maxNonEmptyC = Math.max(maxNonEmptyC, Math.min(m.e.c, capC));
      }
    }

    if (maxNonEmptyR < startR || maxNonEmptyC < startC) {
      return { name, rows: [], colCount: 0, colWidths: [] };
    }

    const rowCount = maxNonEmptyR - startR + 1;
    const colCount = maxNonEmptyC - startC + 1;

    // Carte des cellules fusionnées (ancre + cellules masquées).
    const mergeAnchor = new Map();
    const mergeCovered = new Set();
    for (const m of rawMerges) {
      const sr = Math.max(m.s.r, startR);
      const sc = Math.max(m.s.c, startC);
      const er = Math.min(m.e.r, maxNonEmptyR);
      const ec = Math.min(m.e.c, maxNonEmptyC);
      if (er < sr || ec < sc) continue;
      const rowSpan = er - sr + 1;
      const colSpan = ec - sc + 1;
      if (rowSpan === 1 && colSpan === 1) continue;
      mergeAnchor.set(`${sr - startR}:${sc - startC}`, { rowSpan, colSpan });
      for (let r = sr; r <= er; r++) {
        for (let c = sc; c <= ec; c++) {
          if (r === sr && c === sc) continue;
          mergeCovered.add(`${r - startR}:${c - startC}`);
        }
      }
    }

    const rows = [];
    for (let r = 0; r < rowCount; r++) {
      const row = [];
      for (let c = 0; c < colCount; c++) {
        const key = `${r}:${c}`;
        if (mergeCovered.has(key)) {
          row.push({ skip: true });
          continue;
        }
        const addr = XLSX.utils.encode_cell({ r: startR + r, c: startC + c });
        const cell = sheet[addr];
        let text = '';
        let align = 'left';
        if (cell) {
          if (cell.t === 'n') align = 'right';
          else if (cell.t === 'b') align = 'center';
          try {
            text = XLSX.utils.format_cell(cell) ?? '';
          } catch {
            text = cell.v != null ? String(cell.v) : '';
          }
        }
        const span = mergeAnchor.get(key);
        row.push({
          text,
          align,
          rowSpan: span?.rowSpan || 1,
          colSpan: span?.colSpan || 1,
        });
      }
      rows.push(row);
    }

    const rawCols = Array.isArray(sheet['!cols']) ? sheet['!cols'] : [];
    const colWidths = [];
    for (let c = 0; c < colCount; c++) {
      const info = rawCols[startC + c];
      const px = info?.wpx || (info?.wch ? Math.round(info.wch * 8) : null);
      colWidths.push(px ? Math.max(68, Math.min(360, px)) : null);
    }

    return { name, rows, colCount, colWidths };
  });

  return { sheets };
}

// ============================================================================
// 2. PRÉSENTATIONS POWERPOINT : .pptx, .ppt (OLE2), .odp
// ============================================================================

function normalizeSlideHtml(raw) {
  if (typeof raw !== 'string' || !raw) return '';
  // pptxtojson convertit tous les espaces en &nbsp;, ce qui bloque le retour à la ligne
  // naturel entre les mots. Avec white-space: pre-wrap sur .slide-rich-text, remplacer
  // &nbsp; par un espace standard préserve les espaces multiples tout en autorisant la césure.
  return sanitizeHtml(raw.replace(/&nbsp;|\u00a0/g, ' '), { preserveSlideStyles: true });
}

function sanitizeSlideElement(el) {
  if (!el || typeof el !== 'object') return null;
  const copy = { ...el };
  if (typeof copy.content === 'string') {
    copy.content = normalizeSlideHtml(copy.content);
  }
  if (copy.type === 'table' && Array.isArray(copy.data)) {
    copy.data = copy.data.map((row) =>
      Array.isArray(row)
        ? row.map((cell) =>
            cell && typeof cell === 'object'
              ? { ...cell, text: normalizeSlideHtml(cell.text || '') }
              : cell
          )
        : []
    );
  }
  if ((copy.type === 'group' || copy.type === 'diagram') && Array.isArray(copy.elements)) {
    copy.elements = copy.elements.map(sanitizeSlideElement).filter(Boolean);
  }
  return copy;
}

/** Analyse fidèle d'une présentation .pptx (mise en page, formes, tableaux, images, notes). */
export async function parsePptx(arrayBuffer) {
  try {
    const mod = await import('pptxtojson');
    const parseFn = mod.parse || mod.default?.parse;
    const parsed = await parseFn(arrayBuffer, { imageMode: 'base64' });
    if (parsed && Array.isArray(parsed.slides) && parsed.slides.length > 0) {
      const width = parsed.size?.width || 960;
      const height = parsed.size?.height || 540;
      const slides = parsed.slides.map((slide, idx) => ({
        index: idx + 1,
        mode: 'canvas',
        fill: slide.fill || { type: 'color', value: '#ffffff' },
        layoutElements: (slide.layoutElements || []).map(sanitizeSlideElement).filter(Boolean),
        elements: (slide.elements || []).map(sanitizeSlideElement).filter(Boolean),
        note: typeof slide.note === 'string' ? sanitizeHtml(slide.note) : '',
      }));
      return { width, height, slides };
    }
  } catch {
    /* Repli sur l'extracteur XML direct ci-dessous */
  }
  return parsePptxXmlFallback(arrayBuffer);
}

/** Repli XML direct si un fichier .pptx atypique échoue dans le moteur graphique. */
async function parsePptxXmlFallback(arrayBuffer) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slideFiles = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/i)[1], 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/i)[1], 10);
      return na - nb;
    });

  const slides = [];
  const parser = new DOMParser();

  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i];
    const xmlStr = await zip.files[slidePath].async('string');
    const xml = parser.parseFromString(xmlStr, 'application/xml');

    // Relations pour charger les images de la diapositive.
    const relPath = slidePath.replace('ppt/slides/', 'ppt/slides/_rels/') + '.rels';
    const images = [];
    if (zip.files[relPath]) {
      const relXml = parser.parseFromString(await zip.files[relPath].async('string'), 'application/xml');
      for (const rel of Array.from(relXml.getElementsByTagName('Relationship'))) {
        const target = rel.getAttribute('Target') || '';
        const mediaPath = target.startsWith('../') ? `ppt/${target.slice(3)}` : target.replace(/^\//, '');
        if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(mediaPath) && zip.files[mediaPath]) {
          const b64 = await zip.files[mediaPath].async('base64');
          const ext = mediaPath.split('.').pop().toLowerCase();
          const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
          images.push(`data:${mime};base64,${b64}`);
        }
      }
    }

    const paragraphs = [];
    for (const p of Array.from(xml.getElementsByTagNameNS('*', 'p'))) {
      const texts = Array.from(p.getElementsByTagNameNS('*', 't')).map((t) => t.textContent || '');
      const line = texts.join('').trim();
      if (line) paragraphs.push(line);
    }

    slides.push({
      index: i + 1,
      mode: 'structured',
      title: paragraphs[0] || `Diapositive ${i + 1}`,
      bullets: paragraphs.slice(1),
      images,
      note: '',
    });
  }

  return { width: 960, height: 540, slides };
}

/** Analyse binaire d'une présentation PowerPoint 97-2003 (.ppt, conteneur OLE2). */
export async function parsePptBinary(arrayBuffer) {
  const XLSXMod = await import('xlsx');
  const CFB = XLSXMod.CFB || XLSXMod.default?.CFB;
  const cfb = CFB.read(new Uint8Array(arrayBuffer), { type: 'array' });
  const pptEntry = CFB.find(cfb, 'PowerPoint Document');
  if (!pptEntry || !pptEntry.content) {
    throw new Error('PPT_STREAM_MISSING');
  }

  // Extraction des images PNG / JPEG du flux « Pictures » éventuel.
  const pictures = [];
  const picEntry = CFB.find(cfb, 'Pictures');
  if (picEntry && picEntry.content) {
    const picBytes = picEntry.content instanceof Uint8Array ? picEntry.content : new Uint8Array(picEntry.content);
    extractPptPictures(picBytes, pictures);
  }

  const bytes = pptEntry.content instanceof Uint8Array ? pptEntry.content : new Uint8Array(pptEntry.content);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const slideGroups = [];
  const listGroups = [];

  function extractTextsFromRange(start, end) {
    const items = [];
    let currentKind = 1; // 0/6 = titre, 1/5/7/8 = corps, 2 = notes
    let pos = start;
    while (pos + 8 <= end) {
      const verInst = view.getUint16(pos, true);
      const recVer = verInst & 0x0f;
      const recType = view.getUint16(pos + 2, true);
      const recLen = view.getUint32(pos + 4, true);
      const bodyStart = pos + 8;
      const bodyEnd = Math.min(end, bodyStart + recLen);
      if (bodyStart > end) break;

      if (recVer === 0x0f) {
        const sub = extractTextsFromRange(bodyStart, bodyEnd);
        items.push(...sub);
      } else if (recType === 0x0f9f && recLen >= 4) {
        currentKind = view.getUint32(bodyStart, true);
      } else if (recType === 0x0fa0 && recLen > 0) {
        const str = new TextDecoder('utf-16le').decode(bytes.subarray(bodyStart, bodyEnd));
        items.push({ kind: currentKind, text: str });
      } else if (recType === 0x0fa8 && recLen > 0) {
        const str = decodeWindows1252(bytes.subarray(bodyStart, bodyEnd));
        items.push({ kind: currentKind, text: str });
      } else if (recType === 0x03f3) {
        // SlidePersistAtom : marque le début d'une nouvelle diapositive dans SlideListWithText.
        items.push({ separator: true });
      }
      pos = bodyEnd;
    }
    return items;
  }

  // Parcours de premier niveau pour repérer Slide (0x03EE) et SlideListWithText (0x0FF0).
  function walkTop(start, end) {
    let pos = start;
    while (pos + 8 <= end) {
      const verInst = view.getUint16(pos, true);
      const recVer = verInst & 0x0f;
      const recInstance = verInst >> 4;
      const recType = view.getUint16(pos + 2, true);
      const recLen = view.getUint32(pos + 4, true);
      const bodyStart = pos + 8;
      const bodyEnd = Math.min(end, bodyStart + recLen);
      if (bodyStart > end) break;

      if (recType === 0x03ee) {
        slideGroups.push(extractTextsFromRange(bodyStart, bodyEnd));
      } else if (recType === 0x0ff0 && recInstance === 0) {
        // Instance 0 = diapositives principales (1 = maîtres, 2 = notes).
        const tokens = extractTextsFromRange(bodyStart, bodyEnd);
        let bucket = null;
        for (const tok of tokens) {
          if (tok.separator) {
            if (bucket && bucket.length > 0) listGroups.push(bucket);
            bucket = [];
          } else {
            if (!bucket) bucket = [];
            bucket.push(tok);
          }
        }
        if (bucket && bucket.length > 0) listGroups.push(bucket);
      } else if (recVer === 0x0f) {
        walkTop(bodyStart, bodyEnd);
      }
      pos = bodyEnd;
    }
  }

  walkTop(0, bytes.length);

  const count = Math.max(slideGroups.length, listGroups.length);
  const slides = [];
  for (let i = 0; i < count; i++) {
    const combined = [...(listGroups[i] || []), ...(slideGroups[i] || [])];
    const seen = new Set();
    let title = '';
    const bullets = [];
    const notes = [];

    for (const item of combined) {
      if (!item.text) continue;
      const lines = item.text
        .replace(/\r\n/g, '\n')
        .replace(/[\r\v]/g, '\n')
        .split('\n')
        .map((l) => l.replace(/[\x00-\x08\x0e-\x1f]/g, '').trim())
        .filter(Boolean);
      for (const line of lines) {
        if (seen.has(line)) continue;
        seen.add(line);
        if (item.kind === 2) {
          notes.push(line);
        } else if (!title && (item.kind === 0 || item.kind === 6)) {
          title = line;
        } else if (!title && bullets.length === 0) {
          title = line;
        } else {
          bullets.push(line);
        }
      }
    }

    if (title || bullets.length > 0) {
      slides.push({
        index: slides.length + 1,
        mode: 'structured',
        title: title || `Diapositive ${slides.length + 1}`,
        bullets,
        images: i === 0 && count === 1 ? pictures : [],
        note: notes.map(escapeHtml).join('<br/>'),
      });
    }
  }

  // Si des illustrations ont été extraites et non rattachées, les ajoute en annexe visuelle.
  if (pictures.length > 0 && slides.length > 1) {
    slides.push({
      index: slides.length + 1,
      mode: 'structured',
      title: 'Illustrations intégrées',
      bullets: [],
      images: pictures,
      note: '',
    });
  }

  return { width: 960, height: 540, slides };
}

function extractPptPictures(bytes, out) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  while (pos + 8 <= bytes.length && out.length < 40) {
    const verInst = view.getUint16(pos, true);
    const recInstance = verInst >> 4;
    const recType = view.getUint16(pos + 2, true);
    const recLen = view.getUint32(pos + 4, true);
    const bodyStart = pos + 8;
    const bodyEnd = Math.min(bytes.length, bodyStart + recLen);
    if (recLen === 0 || bodyStart >= bytes.length) break;

    // JPEG (0xF01D) et PNG (0xF01E) dans OfficeArtBlip
    if (recType === 0xf01d || recType === 0xf01e) {
      const twoUid = (recType === 0xf01d && recInstance === 0x46b) || (recType === 0xf01e && recInstance === 0x6e1);
      const headerSkip = twoUid ? 33 : 17;
      if (bodyStart + headerSkip < bodyEnd) {
        const imgBytes = bytes.subarray(bodyStart + headerSkip, bodyEnd);
        const mime = recType === 0xf01e ? 'image/png' : 'image/jpeg';
        out.push(uint8ToDataUrl(imgBytes, mime));
      }
    }
    pos = bodyEnd;
  }
}

function uint8ToDataUrl(u8, mime) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

// ============================================================================
// 3. WORD 97-2003 (.doc binaire OLE2)
// ============================================================================

/** Nettoie les codes de champs Word (\x13 INSTRUCTION \x14 RÉSULTAT \x15 → RÉSULTAT). */
function stripWordFields(raw) {
  let s = raw;
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 20) {
    changed = false;
    s = s.replace(/\x13[^\x13\x14\x15]*(?:\x14([^\x13\x14\x15]*))?\x15/g, (_, visible) => {
      changed = true;
      return visible || '';
    });
  }
  return s.replace(/[\x13\x14\x15]/g, '');
}

/**
 * Analyse complète d'un document Word 97-2003 (.doc OLE2) via sa table des pièces (FIB + Clx).
 * Reconstitue les paragraphes, les titres, les tableaux (\x07) et les images intégrées.
 */
export async function parseDocBinary(arrayBuffer) {
  const XLSXMod = await import('xlsx');
  const CFB = XLSXMod.CFB || XLSXMod.default?.CFB;
  const u8 = new Uint8Array(arrayBuffer);
  const cfb = CFB.read(u8, { type: 'array' });
  const wordEntry = CFB.find(cfb, 'WordDocument');
  if (!wordEntry || !wordEntry.content) {
    throw new Error('WORD_STREAM_MISSING');
  }

  const wordBuf = wordEntry.content instanceof Uint8Array ? wordEntry.content : new Uint8Array(wordEntry.content);
  const wordView = new DataView(wordBuf.buffer, wordBuf.byteOffset, wordBuf.byteLength);

  const magic = wordView.getUint16(0, true);
  if (magic !== 0xa5ec && magic !== 0xa5dc) {
    throw new Error('INVALID_DOC_MAGIC');
  }

  const flags = wordView.getUint16(0x000a, true);
  const tableName = (flags & 0x0200) !== 0 ? '1Table' : '0Table';
  const tableEntry = CFB.find(cfb, tableName) || CFB.find(cfb, '1Table') || CFB.find(cfb, '0Table');

  let rawBody = '';
  let rawFootnotes = '';
  const rowBreakOffsets = new Set();

  if (tableEntry && tableEntry.content && wordBuf.length >= 0x01aa) {
    const tableBuf = tableEntry.content instanceof Uint8Array ? tableEntry.content : new Uint8Array(tableEntry.content);
    const tableView = new DataView(tableBuf.buffer, tableBuf.byteOffset, tableBuf.byteLength);

    const ccpText = wordView.getUint32(0x004c, true);
    const ccpFtn = wordView.getUint32(0x0050, true);
    const fcClx = wordView.getUint32(0x01a2, true);
    const lcbClx = wordView.getUint32(0x01a6, true);

    if (lcbClx > 0 && fcClx + lcbClx <= tableBuf.length) {
      let pos = fcClx;
      const clxEnd = fcClx + lcbClx;
      while (pos < clxEnd && tableBuf[pos] === 1) {
        const skip = tableView.getUint16(pos + 1, true);
        pos += 3 + skip;
      }
      if (pos < clxEnd && tableBuf[pos] === 2) {
        pos += 1;
        const pcdtSize = tableView.getUint32(pos, true);
        pos += 4;
        const pieceCount = Math.floor((pcdtSize - 4) / 12);
        const pieces = [];
        let cpCursor = 0;

        for (let i = 0; i < pieceCount; i++) {
          const cpStart = tableView.getUint32(pos + i * 4, true);
          const cpEnd = tableView.getUint32(pos + (i + 1) * 4, true);
          const pcdOffset = pos + (pieceCount + 1) * 4 + i * 8;
          let fcVal = tableView.getUint32(pcdOffset + 2, true);
          const compressed = (fcVal & 0x40000000) !== 0;
          let byteStart = compressed ? Math.floor((fcVal & ~0x40000000) / 2) : fcVal;
          const charCount = cpEnd - cpStart;
          const bpc = compressed ? 1 : 2;
          const byteLen = charCount * bpc;
          const slice = wordBuf.subarray(byteStart, Math.min(wordBuf.length, byteStart + byteLen));
          const text = compressed
            ? decodeWindows1252(slice)
            : new TextDecoder('utf-16le').decode(slice);

          pieces.push({
            startCp: cpCursor,
            endCp: cpCursor + text.length,
            startFc: byteStart,
            endFc: byteStart + slice.length,
            bpc,
            chars: Array.from(text),
          });
          cpCursor += text.length;
        }

        // Marque les passages supprimés (suivi des modifications sprmCFRMarkDel) et fins de lignes de tableau (sprmPFTtp 0x2417).
        applyDocFormattingHints(wordBuf, wordView, tableBuf, tableView, pieces, rowBreakOffsets);

        const fullChars = [];
        for (const p of pieces) {
          for (let k = 0; k < p.chars.length; k++) {
            fullChars.push(p.chars[k]);
          }
        }
        const fullStr = fullChars.join('');
        rawBody = fullStr.slice(0, ccpText);
        if (ccpFtn > 0) {
          rawFootnotes = fullStr.slice(ccpText, ccpText + Math.max(0, ccpFtn - 1));
        }
      }
    }
  }

  // Repli Word 6 / Word 95 (fcMin..fcMac direct dans WordDocument)
  if (!rawBody && wordBuf.length >= 0x20) {
    const fcMin = wordView.getUint32(0x0018, true);
    const fcMac = wordView.getUint32(0x001c, true);
    if (fcMac > fcMin && fcMin < wordBuf.length) {
      rawBody = decodeWindows1252(wordBuf.subarray(fcMin, Math.min(wordBuf.length, fcMac)));
    }
  }

  // Extraction d'images PNG/JPEG éventuellement stockées dans le flux « Data ».
  const images = [];
  const dataEntry = CFB.find(cfb, 'Data');
  if (dataEntry && dataEntry.content) {
    const dataBytes = dataEntry.content instanceof Uint8Array ? dataEntry.content : new Uint8Array(dataEntry.content);
    scanEmbeddedImages(dataBytes, images);
  }

  const blocks = buildDocBlocks(rawBody, rowBreakOffsets);
  const footnoteBlocks = rawFootnotes ? buildDocBlocks(rawFootnotes, new Set()) : [];

  return { blocks, footnotes: footnoteBlocks, images };
}

function applyDocFormattingHints(wordBuf, wordView, tableBuf, tableView, pieces, rowBreakCps) {
  function fcToCp(fc) {
    for (const p of pieces) {
      if (fc >= p.startFc && fc <= p.endFc) {
        return p.startCp + Math.floor((fc - p.startFc) / p.bpc);
      }
    }
    return -1;
  }

  function walkSprms(buf, startOffset, onSprm) {
    let off = startOffset;
    while (off + 2 <= buf.length) {
      const sprm = buf[off] | (buf[off + 1] << 8);
      const spra = (sprm >> 13) & 0x07;
      off += 2;
      if (off > buf.length) break;
      onSprm(sprm, buf, off);
      if (spra === 0 || spra === 1) off += 1;
      else if (spra === 2 || spra === 4 || spra === 5) off += 2;
      else if (spra === 3) off += 4;
      else if (spra === 6) {
        if (off >= buf.length) break;
        off += buf[off] + 1;
      } else if (spra === 7) off += 3;
      else break;
    }
  }

  // 1) CHPX : masque le texte barré en révision supprimée (sprmCFRMarkDel : ispmd === 0).
  try {
    const fcChpx = wordView.getUint32(0x00fa, true);
    const lcbChpx = wordView.getUint32(0x00fe, true);
    if (lcbChpx >= 12 && fcChpx + lcbChpx <= tableBuf.length) {
      const count = Math.floor((lcbChpx - 4) / 8);
      const dataOff = (count + 1) * 4;
      for (let i = 0; i < count; i++) {
        const pn = tableView.getUint32(fcChpx + dataOff + i * 4, true);
        if ((pn + 1) * 512 > wordBuf.length) continue;
        const fkp = wordBuf.subarray(pn * 512, (pn + 1) * 512);
        const fkpView = new DataView(fkp.buffer, fkp.byteOffset, 512);
        const crun = fkp[511];
        for (let j = 0; j < crun; j++) {
          const rgfc = fkpView.getUint32(j * 4, true);
          const rgfcNext = fkpView.getUint32((j + 1) * 4, true);
          const rgb = fkp[(crun + 1) * 4 + j];
          if (rgb === 0 || rgb * 2 >= 511) continue;
          const cb = fkp[rgb * 2];
          const grpprl = fkp.subarray(rgb * 2 + 1, Math.min(511, rgb * 2 + 1 + cb));
          walkSprms(grpprl, 0, (sprm, b, o) => {
            if ((sprm & 0x1f) === 0 && o < b.length && (b[o] & 1) === 1) {
              for (const p of pieces) {
                const s = Math.max(rgfc, p.startFc);
                const e = Math.min(rgfcNext, p.endFc);
                if (e > s) {
                  const iStart = Math.floor((s - p.startFc) / p.bpc);
                  const iEnd = Math.floor((e - p.startFc) / p.bpc);
                  for (let idx = iStart; idx < iEnd && idx < p.chars.length; idx++) {
                    p.chars[idx] = '\x00';
                  }
                }
              }
            }
          });
        }
      }
    }
  } catch {
    /* ignore métadonnées CHPX partielles */
  }

  // 2) PAPX : repère les fins de lignes de tableaux (sprmPFTtp = 0x2417 ou 0x244B).
  try {
    const fcPapx = wordView.getUint32(0x0102, true);
    const lcbPapx = wordView.getUint32(0x0106, true);
    if (lcbPapx >= 12 && fcPapx + lcbPapx <= tableBuf.length) {
      const count = Math.floor((lcbPapx - 4) / 8);
      const dataOff = (count + 1) * 4;
      for (let i = 0; i < count; i++) {
        const pn = tableView.getUint32(fcPapx + dataOff + i * 4, true);
        if ((pn + 1) * 512 > wordBuf.length) continue;
        const fkp = wordBuf.subarray(pn * 512, (pn + 1) * 512);
        const fkpView = new DataView(fkp.buffer, fkp.byteOffset, 512);
        const crun = fkp[511];
        for (let j = 0; j < crun; j++) {
          const rgfc = fkpView.getUint32(j * 4, true);
          const bxOff = (crun + 1) * 4 + j * 13;
          if (bxOff >= 511) continue;
          const papxOff = fkp[bxOff] * 2;
          if (papxOff === 0 || papxOff >= 510) continue;
          const cb = fkp[papxOff];
          const grp = cb !== 0
            ? fkp.subarray(papxOff + 1, Math.min(511, papxOff + 2 * cb))
            : fkp.subarray(papxOff + 2, Math.min(511, papxOff + 2 + 2 * fkp[papxOff + 1]));
          if (grp.length < 2) continue;
          walkSprms(grp, 2, (sprm) => {
            if (sprm === 0x2417 || sprm === 0x244b) {
              const cp = fcToCp(rgfc);
              if (cp >= 0) rowBreakCps.add(cp);
            }
          });
        }
      }
    }
  } catch {
    /* ignore métadonnées PAPX partielles */
  }
}

/** Transforme le flux de texte Word en blocs structurés (titres, paragraphes, tableaux, sauts). */
function buildDocBlocks(rawText, rowBreakCps) {
  const cleanedFields = stripWordFields(rawText);
  const blocks = [];
  let pendingRow = [];
  let pendingTable = [];

  function flushTable() {
    if (pendingRow.length > 0) {
      pendingTable.push(pendingRow);
      pendingRow = [];
    }
    if (pendingTable.length > 0) {
      const colCount = pendingTable.reduce((m, r) => Math.max(m, r.length), 0);
      if (colCount > 0) {
        const normalized = pendingTable.map((r) => {
          const copy = [...r];
          while (copy.length < colCount) copy.push('');
          return copy;
        });
        blocks.push({ type: 'table', rows: normalized });
      }
      pendingTable = [];
    }
  }

  // Dans Word binaire, \x07 termine chaque cellule ET une fois de plus la fin de ligne (\x07\x07 ou \r\x07).
  let i = 0;
  let cellBuf = '';
  let inCells = false;

  while (i < cleanedFields.length) {
    const ch = cleanedFields[i];
    if (ch === '\x07') {
      inCells = true;
      const cleanCell = cleanDocString(cellBuf);
      cellBuf = '';
      if (rowBreakCps.has(i) || cleanedFields[i + 1] === '\x07') {
        if (cleanCell || pendingRow.length > 0) {
          // Si \x07\x07 : le premier ferme la dernière cellule, le second ferme la ligne.
          if (cleanedFields[i + 1] === '\x07') {
            pendingRow.push(cleanCell);
            i += 2;
          } else {
            if (cleanCell) pendingRow.push(cleanCell);
            i += 1;
          }
          if (pendingRow.length > 0) {
            pendingTable.push(pendingRow);
            pendingRow = [];
          }
          continue;
        }
      } else {
        pendingRow.push(cleanCell);
      }
      i++;
      continue;
    }

    if (inCells && (ch === '\r' || ch === '\n' || ch === '\x0c')) {
      // Si du texte hors cellule commence après un tableau, on clôt le tableau.
      if (!cellBuf.trim() && cleanedFields.slice(i + 1, i + 120).indexOf('\x07') === -1) {
        flushTable();
        inCells = false;
        cellBuf = '';
        i++;
        continue;
      }
    }

    if (!inCells && (ch === '\r' || ch === '\n' || ch === '\x0c')) {
      if (ch === '\r' && cleanedFields[i + 1] === '\n') i++;
      const para = cleanDocString(cellBuf);
      cellBuf = '';
      if (para) {
        blocks.push(classifyParagraph(para));
      }
      if (ch === '\x0c' && blocks.length > 0 && blocks[blocks.length - 1].type !== 'hr') {
        blocks.push({ type: 'hr' });
      }
      i++;
      continue;
    }

    cellBuf += ch;
    i++;
  }

  if (inCells) {
    const last = cleanDocString(cellBuf);
    if (last) pendingRow.push(last);
    flushTable();
  } else {
    const last = cleanDocString(cellBuf);
    if (last) blocks.push(classifyParagraph(last));
  }

  return blocks;
}

function cleanDocString(s) {
  return s
    .replace(/\x0b/g, '\n')
    .replace(/\x1e/g, '\u2011')
    .replace(/[\x00-\x08\x0e-\x1f]/g, '')
    .trim();
}

function classifyParagraph(text) {
  // Repère naturellement les titres numérotés ou courts en majuscules des supports de cours.
  if (
    text.length <= 110 &&
    !/[.;:!?]$/.test(text) &&
    (/^(?:CHAPITRE|PARTIE|TITRE|SECTION|EXERCICE|TD|TP|COURS)\b/i.test(text) ||
      /^(?:[IVXLC]+\.|[0-9]+(?:\.[0-9]+){0,2}[.) -])\s+\S/.test(text))
  ) {
    const isMajor = /^(?:CHAPITRE|PARTIE|TITRE|COURS)\b/i.test(text) || /^[IVXLC]+\.\s/.test(text);
    return { type: 'heading', level: isMajor ? 2 : 3, text };
  }
  if (/^(?:[•◦▪–—*-]|\([a-z0-9]+\))\s+/.test(text)) {
    return { type: 'bullet', text: text.replace(/^(?:[•◦▪–—*-])\s+/, '') };
  }
  return { type: 'paragraph', text };
}

function scanEmbeddedImages(bytes, out) {
  for (let i = 0; i + 12 < bytes.length && out.length < 30; i++) {
    // Signature PNG : 89 50 4E 47 0D 0A 1A 0A ... IEND + CRC (49 45 4E 44 AE 42 60 82)
    if (
      bytes[i] === 0x89 && bytes[i + 1] === 0x50 && bytes[i + 2] === 0x4e && bytes[i + 3] === 0x47 &&
      bytes[i + 4] === 0x0d && bytes[i + 5] === 0x0a && bytes[i + 6] === 0x1a && bytes[i + 7] === 0x0a
    ) {
      for (let j = i + 8; j + 8 <= bytes.length; j++) {
        if (bytes[j] === 0x49 && bytes[j + 1] === 0x45 && bytes[j + 2] === 0x4e && bytes[j + 3] === 0x44) {
          const end = j + 8;
          if (end - i > 64) out.push(uint8ToDataUrl(bytes.subarray(i, end), 'image/png'));
          i = end - 1;
          break;
        }
      }
    }
  }
}

// ============================================================================
// 4. RTF (.rtf et .doc enregistrés au format RTF)
// ============================================================================

const RTF_SKIP_DESTINATIONS = new Set([
  'fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'object', 'datafield',
  'fldinst', 'header', 'footer', 'headerl', 'headerr', 'headerf', 'footerl',
  'footerr', 'footerf', 'xmlopen', 'themedata', 'colorschememapping', 'latentstyles',
  'datastore', 'rsidtbl', 'generator', 'listtable', 'listoverridetable', 'revtbl',
]);

/** Convertit un document RTF en HTML propre et structuré (paragraphes, gras/italique, tableaux, accents). */
export function parseRtf(arrayBuffer) {
  const u8 = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer || 0);
  // Le flux RTF est ASCII 7 bits avec échappements \'xx et \uN.
  const src = decodeWindows1252(u8);

  const stack = [];
  let state = { bold: false, italic: false, underline: false, uc: 1, skip: false, align: '' };

  let paragraphs = [];
  let currentRuns = [];
  let currentText = '';
  let inTable = false;
  let tableRows = [];
  let currentRow = [];

  function flushRun() {
    if (!currentText) return;
    let html = escapeHtml(currentText);
    if (state.bold) html = `<strong>${html}</strong>`;
    if (state.italic) html = `<em>${html}</em>`;
    if (state.underline) html = `<u>${html}</u>`;
    currentRuns.push(html);
    currentText = '';
  }

  function flushParagraph() {
    flushRun();
    const joined = currentRuns.join('').trim();
    currentRuns = [];
    if (inTable) {
      inTable = false;
    }
    if (tableRows.length > 0) {
      paragraphs.push(renderRtfTable(tableRows));
      tableRows = [];
    }
    if (joined) {
      const style = state.align ? ` style="text-align: ${state.align}"` : '';
      paragraphs.push(`<p${style}>${joined}</p>`);
    }
  }

  let i = 0;
  const len = src.length;

  while (i < len) {
    const ch = src[i];

    if (ch === '{') {
      flushRun();
      stack.push({ ...state });
      i++;
      // Groupes {\*\destination ...} à ignorer
      if (src[i] === '\\' && src[i + 1] === '*') {
        state.skip = true;
        i += 2;
      }
      continue;
    }

    if (ch === '}') {
      flushRun();
      if (stack.length > 0) state = stack.pop();
      i++;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      i++;
      continue;
    }

    if (ch === '\\') {
      i++;
      if (i >= len) break;
      const next = src[i];

      // Caractères échappés littéraux
      if (next === '\\' || next === '{' || next === '}') {
        if (!state.skip) currentText += next;
        i++;
        continue;
      }
      if (next === '~') {
        if (!state.skip) currentText += '\u00a0';
        i++;
        continue;
      }
      if (next === '-') {
        i++;
        continue;
      }
      if (next === '_') {
        if (!state.skip) currentText += '\u2011';
        i++;
        continue;
      }
      if (next === '\n' || next === '\r') {
        if (!state.skip) flushParagraph();
        i++;
        continue;
      }
      // Échappement hexadécimal Windows-1252 : \'e9 → é
      if (next === "'") {
        const hex = src.slice(i + 1, i + 3);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          if (!state.skip) {
            const byte = parseInt(hex, 16);
            currentText += decodeWindows1252(new Uint8Array([byte]));
          }
          i += 3;
          continue;
        }
      }

      // Mot de contrôle \word[-]N[ ]
      let word = '';
      while (i < len && /[a-zA-Z]/.test(src[i])) {
        word += src[i++];
      }
      let sign = 1;
      if (src[i] === '-') {
        sign = -1;
        i++;
      }
      let numStr = '';
      while (i < len && /[0-9]/.test(src[i])) {
        numStr += src[i++];
      }
      const hasNum = numStr.length > 0;
      const param = hasNum ? sign * parseInt(numStr, 10) : null;
      if (src[i] === ' ') i++; // L'espace délimiteur est consommé

      if (RTF_SKIP_DESTINATIONS.has(word)) {
        state.skip = true;
        continue;
      }
      if (state.skip) continue;

      switch (word) {
        case 'par':
        case 'sect':
          flushParagraph();
          break;
        case 'page':
          flushParagraph();
          paragraphs.push('<hr/>');
          break;
        case 'line':
          flushRun();
          currentRuns.push('<br/>');
          break;
        case 'tab':
          currentText += '    ';
          break;
        case 'bullet':
          currentText += '• ';
          break;
        case 'endash':
          currentText += '–';
          break;
        case 'emdash':
          currentText += '—';
          break;
        case 'lquote':
          currentText += '‘';
          break;
        case 'rquote':
          currentText += '’';
          break;
        case 'ldblquote':
          currentText += '“';
          break;
        case 'rdblquote':
          currentText += '”';
          break;
        case 'b':
          flushRun();
          state.bold = param !== 0;
          break;
        case 'i':
          flushRun();
          state.italic = param !== 0;
          break;
        case 'ul':
          flushRun();
          state.underline = param !== 0;
          break;
        case 'ulnone':
          flushRun();
          state.underline = false;
          break;
        case 'plain':
          flushRun();
          state.bold = false;
          state.italic = false;
          state.underline = false;
          break;
        case 'pard':
          state.align = '';
          break;
        case 'qc':
          state.align = 'center';
          break;
        case 'qr':
          state.align = 'right';
          break;
        case 'qj':
          state.align = 'justify';
          break;
        case 'ql':
          state.align = 'left';
          break;
        case 'uc':
          if (hasNum && param >= 0) state.uc = param;
          break;
        case 'u':
          if (hasNum) {
            const code = param < 0 ? param + 65536 : param;
            currentText += String.fromCodePoint(code);
            // Saute les N caractères de substitution ANSI suivant \uN
            let toSkip = state.uc;
            while (toSkip > 0 && i < len) {
              if (src[i] === '\\' && src[i + 1] === "'") {
                i += 4;
              } else if (src[i] === '{' || src[i] === '}') {
                break;
              } else {
                i++;
              }
              toSkip--;
            }
          }
          break;
        case 'trowd':
          inTable = true;
          break;
        case 'cell': {
          flushRun();
          currentRow.push(currentRuns.join('').trim());
          currentRuns = [];
          inTable = true;
          break;
        }
        case 'row': {
          if (currentRuns.length > 0 || currentText) {
            flushRun();
            currentRow.push(currentRuns.join('').trim());
            currentRuns = [];
          }
          if (currentRow.length > 0) {
            tableRows.push(currentRow);
            currentRow = [];
          }
          break;
        }
        default:
          break;
      }
      continue;
    }

    if (!state.skip) {
      currentText += ch;
    }
    i++;
  }

  flushParagraph();
  if (currentRow.length > 0) tableRows.push(currentRow);
  if (tableRows.length > 0) paragraphs.push(renderRtfTable(tableRows));

  return sanitizeHtml(paragraphs.join('\n'));
}

function renderRtfTable(rows) {
  const colCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const trs = rows
    .map((r) => {
      const cells = [];
      for (let c = 0; c < colCount; c++) {
        cells.push(`<td>${r[c] || ''}</td>`);
      }
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('');
  return `<table><tbody>${trs}</tbody></table>`;
}

// ============================================================================
// 5. OPENDOCUMENT : .odt (texte) et .odp (présentation)
// ============================================================================

export async function parseOpenDocument(arrayBuffer, kind = 'odt') {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(arrayBuffer);
  const contentFile = zip.files['content.xml'];
  if (!contentFile) throw new Error('ODF_CONTENT_MISSING');

  // Prépare les images du dossier Pictures/ en URLs data:
  const mediaMap = new Map();
  for (const path of Object.keys(zip.files)) {
    if (/^Pictures\/.+\.(png|jpe?g|gif|webp|bmp)$/i.test(path)) {
      const b64 = await zip.files[path].async('base64');
      const ext = path.split('.').pop().toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
      mediaMap.set(path, `data:${mime};base64,${b64}`);
    }
  }

  const xmlStr = await contentFile.async('string');
  const xml = new DOMParser().parseFromString(xmlStr, 'application/xml');

  if (kind === 'odp') {
    const pages = Array.from(xml.getElementsByTagNameNS('*', 'page'));
    const slides = pages.map((page, idx) => {
      const paras = Array.from(page.getElementsByTagNameNS('*', 'p'))
        .map((p) => (p.textContent || '').trim())
        .filter(Boolean);
      const imgs = Array.from(page.getElementsByTagNameNS('*', 'image'))
        .map((im) => mediaMap.get(im.getAttribute('xlink:href') || im.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || ''))
        .filter(Boolean);
      return {
        index: idx + 1,
        mode: 'structured',
        title: paras[0] || `Diapositive ${idx + 1}`,
        bullets: paras.slice(1),
        images: imgs,
        note: '',
      };
    });
    return { width: 960, height: 540, slides };
  }

  function renderOdfNode(node) {
    if (node.nodeType === 3) return escapeHtml(node.nodeValue || '');
    if (node.nodeType !== 1) return '';
    const local = node.localName || node.tagName.split(':').pop();
    const childrenHtml = () => Array.from(node.childNodes).map(renderOdfNode).join('');

    switch (local) {
      case 'h': {
        const lvl = Math.min(4, Math.max(1, parseInt(node.getAttribute('text:outline-level') || '2', 10)));
        return `<h${lvl}>${childrenHtml()}</h${lvl}>`;
      }
      case 'p': {
        const inner = childrenHtml().trim();
        return inner ? `<p>${inner}</p>` : '';
      }
      case 'span':
        return `<span>${childrenHtml()}</span>`;
      case 's': {
        const count = Math.min(20, parseInt(node.getAttribute('text:c') || '1', 10));
        return '&nbsp;'.repeat(count);
      }
      case 'tab':
        return '&emsp;';
      case 'line-break':
        return '<br/>';
      case 'list':
        return `<ul>${childrenHtml()}</ul>`;
      case 'list-item':
        return `<li>${childrenHtml()}</li>`;
      case 'table':
        return `<table><tbody>${childrenHtml()}</tbody></table>`;
      case 'table-row':
        return `<tr>${childrenHtml()}</tr>`;
      case 'table-cell':
        return `<td>${childrenHtml()}</td>`;
      case 'image': {
        const href = node.getAttribute('xlink:href') || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || '';
        const src = mediaMap.get(href);
        return src ? `<p><img src="${src}" alt="" /></p>` : '';
      }
      default:
        return childrenHtml();
    }
  }

  const officeText = xml.getElementsByTagNameNS('*', 'text')[0] || xml.documentElement;
  const html = renderOdfNode(officeText);
  return sanitizeHtml(html);
}

// ============================================================================
// 6. MARKDOWN & ARCHIVES ZIP
// ============================================================================

export function renderMarkdownToHtml(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inCode = false;
  let codeBuf = [];
  let inList = false;

  const inlineFmt = (s) =>
    escapeHtml(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  function closeList() {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  }

  for (const raw of lines) {
    if (raw.trim().startsWith('```')) {
      closeList();
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(raw);
      continue;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      closeList();
      continue;
    }

    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      closeList();
      const lvl = hMatch[1].length;
      out.push(`<h${lvl}>${inlineFmt(hMatch[2])}</h${lvl}>`);
      continue;
    }

    if (/^[-*•]\s+/.test(trimmed)) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inlineFmt(trimmed.replace(/^[-*•]\s+/, ''))}</li>`);
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      closeList();
      out.push(`<blockquote>${inlineFmt(trimmed.replace(/^>\s?/, ''))}</blockquote>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      closeList();
      out.push('<hr/>');
      continue;
    }

    closeList();
    out.push(`<p>${inlineFmt(trimmed)}</p>`);
  }

  closeList();
  if (inCode && codeBuf.length > 0) {
    out.push(`<pre><code>${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
  }
  return sanitizeHtml(out.join('\n'));
}

export async function parseZipArchive(arrayBuffer) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(arrayBuffer);
  const files = Object.values(zip.files)
    .filter((f) => !f.dir)
    .map((f) => ({
      name: f.name,
      size: f._data?.uncompressedSize ?? null,
    }));
  return { files };
}
