// Mesure d'audience anonyme — aucun cookie, aucune donnée personnelle.
// Chaque visiteur reçoit un identifiant aléatoire stocké sur son appareil ;
// seules les pages consultées et quelques actions clés sont comptées.
// L'utilisateur peut désactiver la mesure dans les Paramètres (et Do Not Track
// est respecté). Les envois sont « fire and forget » : jamais bloquants.
import { supabase } from './api.js';
import * as store from './store.js';

// Noms de pages envoyés au serveur (minuscules + tirets bas uniquement).
const PAGES = {
  home: 'home',
  join: 'join',
  classroom: 'classroom',
  library: 'library',
  document: 'document',
  downloads: 'downloads',
  settings: 'settings',
  owner: 'owner',
  ownerSpace: 'owner_space',
  publish: 'publish',
  install: 'install',
  privacy: 'privacy',
  reset: 'reset',
  stats: 'stats',
};

function visitorId() {
  let id = store.read('visitor-id');
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : ((r & 0x3) | 0x8)).toString(16);
      });
    store.write('visitor-id', id);
  }
  return id;
}

function enabled() {
  try {
    if (typeof navigator === 'undefined' || !navigator.onLine) return false;
    if (navigator.doNotTrack === '1') return false;
    if (store.getSettings().analytics === false) return false;
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return false;
    return true;
  } catch {
    return false;
  }
}

function send(event, page = '') {
  if (!enabled()) return;
  try {
    supabase
      .rpc('api_track_event', { p_visitor_id: visitorId(), p_event: event, p_page: page })
      .then(() => {}, () => {});
  } catch {
    /* la mesure d'audience ne doit jamais gêner l'utilisation du site */
  }
}

let lastPage = null;
let lastAt = 0;

/** Compte une page vue (appelé à chaque changement de route). */
export function trackPage(routeName) {
  const page = PAGES[routeName];
  if (!page) return;
  const now = Date.now();
  if (page === lastPage && now - lastAt < 3000) return; // anti-doubleenvoi
  lastPage = page;
  lastAt = now;
  send('page_view', page);
}

/** Compte une action clé : join_classroom, install_click, app_installed. */
export function trackEvent(event) {
  send(event);
}
