// Gestion des documents téléchargés : conservés dans le cache du navigateur
// pour rester consultables hors connexion, sur cet appareil uniquement.
import { addDownload, removeDownload, getDownloads } from './store.js';

const DOCS_CACHE = 'klassio-docs-v1';

function docKey(id) {
  return `${location.origin}/__klassio_offline__/${id}`;
}

function mimeFor(type) {
  const map = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
  };
  return map[(type || '').toLowerCase()] || 'application/octet-stream';
}

export async function saveOffline(document, blob) {
  const cache = await caches.open(DOCS_CACHE);
  await cache.put(
    docKey(document.id),
    new Response(blob, { headers: { 'Content-Type': mimeFor(document.file_type) } })
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

/** Ouvre un document : aperçu dans le navigateur si possible, sinon téléchargement. */
export function openBlob(blob, fileName, fileType, { forceDownload = false } = {}) {
  const type = mimeFor(fileType);
  const viewable = ['application/pdf', 'image/jpeg', 'image/png'].includes(type);
  const url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type }));
  if (viewable && !forceDownload) {
    const win = window.open(url, '_blank', 'noopener');
    if (!win) {
      // Popup bloqué : on propose le téléchargement direct.
      triggerDownload(url, fileName);
    }
  } else {
    triggerDownload(url, fileName);
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function triggerDownload(url, fileName) {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'document';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export { mimeFor };
