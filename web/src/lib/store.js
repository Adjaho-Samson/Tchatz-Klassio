// Petit utilitaire de stockage local (appareil de l'utilisateur uniquement).
const PREFIX = 'klassio.';

export function read(key, fallback = null) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function write(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* stockage plein ou indisponible : l'app continue de fonctionner */
  }
}

export function remove(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

/** Identifiant stable de cet appareil (pour les alertes de nouveaux documents). */
export function deviceId() {
  let id = read('device-id');
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : `web-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    write('device-id', id);
  }
  return id;
}

// ------------------------------------------------------- sessions étudiantes
export function getSessions() {
  return read('student-sessions', []);
}

export function saveSession(session) {
  const sessions = getSessions().filter((s) => s.classroom?.id !== session.classroom?.id);
  sessions.unshift(session);
  write('student-sessions', sessions);
  write('active-session', session.token);
}

export function updateSession(token, patch) {
  const sessions = getSessions().map((s) => (s.token === token ? { ...s, ...patch } : s));
  write('student-sessions', sessions);
}

export function removeSession(token) {
  const sessions = getSessions().filter((s) => s.token !== token);
  write('student-sessions', sessions);
  if (read('active-session') === token) {
    write('active-session', sessions[0]?.token || null);
  }
}

export function getActiveToken() {
  return read('active-session');
}

export function setActiveToken(token) {
  write('active-session', token);
}

export function getActiveSession() {
  const token = getActiveToken();
  return getSessions().find((s) => s.token === token) || getSessions()[0] || null;
}

// ---------------------------------------------------------------- paramètres
export function getSettings() {
  return { notifications: true, theme: 'system', analytics: true, ...read('settings', {}) };
}

export function saveSettings(patch) {
  write('settings', { ...getSettings(), ...patch });
}

// ------------------------------------------------------------- téléchargements
export function getDownloads() {
  return read('downloads', []);
}

export function addDownload(meta) {
  const downloads = getDownloads().filter((d) => d.id !== meta.id);
  downloads.unshift(meta);
  write('downloads', downloads);
}

export function removeDownload(id) {
  write('downloads', getDownloads().filter((d) => d.id !== id));
}

export function isDownloaded(id) {
  return getDownloads().some((d) => d.id === id);
}
