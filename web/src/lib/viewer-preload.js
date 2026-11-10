// Préchargement silencieux des moteurs de lecture afin que les documents enregistrés
// pour un usage hors connexion restent lisibles même si l'utilisateur coupe internet
// avant d'avoir ouvert un fichier de ce format.

import { normalizeExt } from './file-types.js';

export async function preloadViewerFor(fileType, fileName) {
  const ext = normalizeExt(fileType, fileName);
  try {
    if (ext === 'pdf') {
      await import('pdfjs-dist/legacy/build/pdf.mjs');
      if (typeof fetch === 'function' && typeof Worker !== 'undefined') {
        const workerHref = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).href;
        await fetch(workerHref).catch(() => {});
      }
    } else if (ext === 'docx') {
      await import('docx-preview');
    } else if (['xlsx', 'xls', 'ods', 'doc', 'ppt'].includes(ext)) {
      await import('xlsx');
    } else if (ext === 'pptx') {
      await import('pptxtojson');
      await import('jszip');
    } else if (['odt', 'odp', 'zip'].includes(ext)) {
      await import('jszip');
    }
  } catch {
    /* Le préchargement est opportuniste : ne bloque jamais le téléchargement. */
  }
}
