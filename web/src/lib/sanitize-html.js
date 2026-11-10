// Nettoyage strict des fragments HTML issus des documents bureautiques (PPTX, RTF, HTML/DOC, ODT).
// Empêche toute exécution de script (XSS) et corrige les styles inline qui cassent la mise en page.

const ALLOWED_TAGS = new Set([
  'p', 'div', 'span', 'br', 'hr',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'mark', 'sub', 'sup', 'small',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'img', 'a', 'section', 'article', 'figure', 'figcaption',
]);

const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'applet',
  'head', 'title', 'meta', 'link', 'base', 'noscript', 'template',
  'form', 'input', 'button', 'select', 'textarea', 'svg', 'math', 'xml',
]);

const ALLOWED_STYLE_PROPS = new Set([
  'color', 'background-color', 'background',
  'font-size', 'font-weight', 'font-style', 'font-family', 'font-variant',
  'text-decoration', 'text-decoration-line', 'text-align', 'text-transform',
  'line-height', 'letter-spacing',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'border', 'border-top', 'border-bottom', 'border-left', 'border-right',
  'border-color', 'border-width', 'border-style', 'border-collapse', 'border-spacing', 'border-radius',
  'vertical-align', 'list-style-type', 'list-style', 'white-space',
  'display', 'justify-content', 'align-items', 'flex-direction',
]);

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanStyle(rawStyle, { preserveExactFontSizes = false } = {}) {
  const parts = String(rawStyle || '').split(';');
  const kept = [];
  for (const part of parts) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const prop = part.slice(0, colon).trim().toLowerCase();
    const val = part.slice(colon + 1).trim();
    if (!val || !ALLOWED_STYLE_PROPS.has(prop)) continue;
    const lowerVal = val.toLowerCase();
    if (
      lowerVal.includes('url(') ||
      lowerVal.includes('expression(') ||
      lowerVal.includes('javascript:') ||
      lowerVal.includes('@import')
    ) {
      continue;
    }
    // Évite les marges négatives de Word qui poussent le texte hors de l'écran.
    if ((prop.startsWith('margin') || prop === 'text-indent') && /-\s*\d/.test(lowerVal)) {
      continue;
    }
    if (prop === 'display' && !['inline', 'inline-block', 'block', 'flex', 'list-item', 'table', 'table-row', 'table-cell'].includes(lowerVal)) {
      continue;
    }
    if (!preserveExactFontSizes && prop === 'white-space' && lowerVal === 'nowrap') {
      continue;
    }
    kept.push(`${prop}: ${val}`);
  }
  return kept.join('; ');
}

function isSafeHref(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('#')) return true;
  try {
    const parsed = new URL(trimmed, 'https://klassio.local');
    return ['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function isSafeImgSrc(src) {
  const trimmed = String(src || '').trim();
  if (!trimmed) return false;
  if (/^data:image\/(png|jpe?g|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith('blob:')) return true;
  try {
    const parsed = new URL(trimmed, 'https://klassio.local');
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Nettoie un fragment HTML en ne conservant que les balises et attributs sûrs.
 * @param {string} dirtyHtml
 * @param {{ preserveSlideStyles?: boolean }} options
 */
export function sanitizeHtml(dirtyHtml, { preserveSlideStyles = false } = {}) {
  const input = String(dirtyHtml || '');
  if (!input.trim()) return '';
  if (typeof DOMParser === 'undefined') {
    return escapeHtml(input.replace(/<[^>]*>/g, ' '));
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(input, 'text/html');

  function cleanNode(node, outDoc) {
    if (node.nodeType === 3) {
      return outDoc.createTextNode(node.nodeValue || '');
    }
    if (node.nodeType !== 1) return null;

    const rawTag = node.tagName.toLowerCase();
    // Ignore les balises Office à préfixe d'espace de noms (ex. o:p, v:shape, w:sdt) en gardant leur texte.
    if (rawTag.includes(':')) {
      const frag = outDoc.createDocumentFragment();
      for (const child of Array.from(node.childNodes)) {
        const cleaned = cleanNode(child, outDoc);
        if (cleaned) frag.appendChild(cleaned);
      }
      return frag;
    }

    if (DROP_WITH_CONTENT.has(rawTag)) return null;

    if (!ALLOWED_TAGS.has(rawTag)) {
      const frag = outDoc.createDocumentFragment();
      for (const child of Array.from(node.childNodes)) {
        const cleaned = cleanNode(child, outDoc);
        if (cleaned) frag.appendChild(cleaned);
      }
      return frag;
    }

    const el = outDoc.createElement(rawTag);

    if (rawTag === 'a') {
      const href = node.getAttribute('href');
      if (isSafeHref(href)) {
        el.setAttribute('href', href.trim());
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      }
    } else if (rawTag === 'img') {
      const src = node.getAttribute('src');
      if (!isSafeImgSrc(src)) return null;
      el.setAttribute('src', src.trim());
      const alt = node.getAttribute('alt');
      el.setAttribute('alt', alt || '');
    } else if (rawTag === 'td' || rawTag === 'th' || rawTag === 'col') {
      for (const attr of ['colspan', 'rowspan', 'span']) {
        const v = parseInt(node.getAttribute(attr) || '', 10);
        if (Number.isFinite(v) && v > 1 && v <= 100) {
          el.setAttribute(attr, String(v));
        }
      }
    }

    const style = node.getAttribute('style');
    if (style) {
      const cleanedStyle = cleanStyle(style, { preserveExactFontSizes: preserveSlideStyles });
      if (cleanedStyle) el.setAttribute('style', cleanedStyle);
    }

    for (const child of Array.from(node.childNodes)) {
      const cleaned = cleanNode(child, outDoc);
      if (cleaned) el.appendChild(cleaned);
    }
    return el;
  }

  const outDoc = document.implementation.createHTMLDocument('');
  const root = outDoc.body;
  for (const child of Array.from(doc.body.childNodes)) {
    const cleaned = cleanNode(child, outDoc);
    if (cleaned) root.appendChild(cleaned);
  }
  return root.innerHTML;
}
