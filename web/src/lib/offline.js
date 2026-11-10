// Gestion des documents téléchargés : conservés dans le cache du navigateur
// pour rester consultables hors connexion, sur cet appareil uniquement.
import { addDownload, removeDownload, getDownloads } from './store.js';
import { ensureFileName, mimeFor, normalizeBlob } from './file-types.js';
import { preloadViewerFor } from './viewer-preload.js';

const DOCS_CACHE = 'klassio-docs-v1';

function docKey(id) {
  return `${location.origin}/__klassio_offline__/${id}`;
}

export async function saveOffline(document, blob) {
  const mime = mimeFor(document.file_type, document.file_name);
  const typed = normalizeBlob(blob, document.file_name, document.file_type);
  const cache = await caches.open(DOCS_CACHE);
  await cache.put(
    docKey(document.id),
    new Response(typed, { headers: { 'Content-Type': mime } })
  );
  addDownload({
    id: document.id,
    title: document.title,
    fileName: document.file_name,
    fileType: document.file_type,
    fileSize: document.file_size,
    subjectName: document.subject_name,
    teacher: document.teacher_display_name,
    createdAt: document.created_at,
    classroomId: document.classroom_id || null,
    downloadedAt: new Date().toISOString(),
  });
  // Précharge le moteur de lecture adapté pour garantir l'ouverture hors connexion.
  preloadViewerFor(document.file_type, document.file_name);
}

export async function getOfflineBlob(id) {
  const cache = await caches.open(DOCS_CACHE);
  const response = await cache.match(docKey(id));
  if (!response) return null;
  return response.blob();
}

export async function deleteOffline(id) {
  const cache = await caches.open(DOCS_CACHE);
  await cache.delete(docKey(id));
  removeDownload(id);
}

export function listOffline() {
  return getDownloads();
}

/** Enregistre proprement un Blob sur l'appareil avec son vrai type MIME et son extension. */
export function downloadBlob(blob, fileName, fileType, fallbackTitle = 'document') {
  const typed = normalizeBlob(blob, fileName, fileType);
  const safeName = ensureFileName(fileName, fileType, fallbackTitle);
  const url = URL.createObjectURL(typed);
  triggerDownload(url, safeName);
  setTimeout(() => URL.revokeObjectURL(url), 300_000);
}

/** Ouvre un document : aperçu natif ou téléchargement avec type MIME corrigé. */
export function openBlob(blob, fileName, fileType, { forceDownload = false } = {}) {
  const typed = normalizeBlob(blob, fileName, fileType);
  const type = mimeFor(fileType, fileName).split(';')[0].trim();
  const safeName = ensureFileName(fileName, fileType);
  const viewable = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'].includes(type);
  const url = URL.createObjectURL(typed);
  if (viewable && !forceDownload) {
    const win = window.open(url, '_blank', 'noopener');
    if (!win) {
      triggerDownload(url, safeName);
    }
  } else {
    triggerDownload(url, safeName);
  }
  setTimeout(() => URL.revokeObjectURL(url), 300_000);
}

function triggerDownload(url, fileName) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'document';
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export { mimeFor, normalizeBlob, ensureFileName };
