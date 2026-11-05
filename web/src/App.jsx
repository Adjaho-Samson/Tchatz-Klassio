import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, studentApi, errorCode } from './lib/api.js';
import * as store from './lib/store.js';
import { Icon, Logo, Toasts } from './components/UI.jsx';

import Home from './screens/Home.jsx';
import Join from './screens/Join.jsx';
import Classroom from './screens/Classroom.jsx';
import Library from './screens/Library.jsx';
import DocumentDetail from './screens/DocumentDetail.jsx';
import Downloads from './screens/Downloads.jsx';
import Settings from './screens/Settings.jsx';
import OwnerAuth from './screens/OwnerAuth.jsx';
import OwnerDashboard from './screens/OwnerDashboard.jsx';
import OwnerSpace from './screens/OwnerSpace.jsx';
import Publish from './screens/Publish.jsx';
import Install from './screens/Install.jsx';
import Privacy from './screens/Privacy.jsx';
import ResetPassword from './screens/ResetPassword.jsx';

// ------------------------------------------------------------------ routeur
export function navigate(path) {
  window.location.hash = path.startsWith('/') ? path : `/${path}`;
}

function parseRoute() {
  const hash = window.location.hash.replace(/^#/, '');
  // Les liens de récupération Supabase (#access_token=…) sont gérés à part.
  if (!hash || hash === '/' || hash.includes('access_token=') || hash.includes('error=')) {
    return { name: 'home', params: {} };
  }
  const parts = hash.split('?')[0].split('/').filter(Boolean);
  switch (parts[0]) {
    case 'rejoindre': return { name: 'join', params: {} };
    case 'classe': return { name: 'classroom', params: {} };
    case 'bibliotheque': return { name: 'library', params: { subject: parts[1] || null } };
    case 'document': return { name: 'document', params: { id: parts[1] || null } };
    case 'telechargements': return { name: 'downloads', params: {} };
    case 'parametres': return { name: 'settings', params: {} };
    case 'responsable':
      return parts[1] === 'espace'
        ? { name: 'ownerSpace', params: { id: parts[2] || null } }
        : { name: 'owner', params: {} };
    case 'publier': return { name: 'publish', params: { token: parts[1] || null } };
    case 'installer': return { name: 'install', params: {} };
    case 'confidentialite': return { name: 'privacy', params: {} };
    case 'reinitialiser': return { name: 'reset', params: {} };
    default: return { name: 'home', params: {} };
  }
}

// ------------------------------------------------------------------ contexte
const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const STUDENT_ROUTES = ['classroom', 'library', 'document', 'downloads', 'settings'];

export default function App() {
  const [route, setRoute] = useState(parseRoute);
  const [sessions, setSessions] = useState(store.getSessions);
  const [activeToken, setActiveTokenState] = useState(store.getActiveToken);
  const [ownerSession, setOwnerSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [toasts, setToasts] = useState([]);
  const [settings, setSettings] = useState(store.getSettings);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(
    typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches
  );
  const toastId = useRef(0);

  const activeSession = useMemo(
    () => sessions.find((s) => s.token === activeToken) || sessions[0] || null,
    [sessions, activeToken]
  );

  // --- navigation
  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // --- connexion / hors connexion
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  // --- thème (clair / sombre / système)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && mq.matches);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', dark ? '#0F172A' : '#163B70');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);

  // --- session responsable (Supabase Auth)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setOwnerSession(data.session || null);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setOwnerSession(session || null);
      if (event === 'PASSWORD_RECOVERY') navigate('/reinitialiser');
      if (event === 'SIGNED_OUT') setOwnerSession(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // --- installation PWA
  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // --- toasts
  const toast = useCallback((message, tone = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  // --- sessions étudiantes
  const refreshSessions = useCallback(() => {
    setSessions(store.getSessions());
    setActiveTokenState(store.getActiveToken());
  }, []);

  const setActiveToken = useCallback((token) => {
    store.setActiveToken(token);
    setActiveTokenState(token);
  }, []);

  const joinClassroom = useCallback(
    async (code) => {
      const result = await studentApi.join(code);
      const session = {
        token: result.session_token,
        classroom: result.classroom,
        expiresAt: result.expires_at,
        joinedAt: new Date().toISOString(),
        lastUpdateCheck: new Date().toISOString(),
      };
      store.saveSession(session);
      refreshSessions();
      // Enregistre l'appareil pour les alertes de nouveaux documents.
      try {
        await studentApi.registerDevice(session.token, store.deviceId(), store.getSettings().notifications);
      } catch {
        /* l'enregistrement de l'appareil n'est pas bloquant */
      }
      return session;
    },
    [refreshSessions]
  );

  const leaveClassroom = useCallback(
    (token) => {
      store.removeSession(token);
      refreshSessions();
    },
    [refreshSessions]
  );

  const handleSessionInvalid = useCallback(
    (token) => {
      store.removeSession(token);
      refreshSessions();
      toast('Cette session a expiré. Rejoignez la classe à nouveau.', 'error');
      navigate('/rejoindre');
    },
    [refreshSessions, toast]
  );

  const updateSettings = useCallback((patch) => {
    store.saveSettings(patch);
    setSettings(store.getSettings());
  }, []);

  // --- alertes de nouveaux documents (pendant que l'application est ouverte)
  useEffect(() => {
    if (!activeSession || !online || !settings.notifications) return undefined;
    let cancelled = false;
    const check = async () => {
      try {
        const since = activeSession.lastUpdateCheck || activeSession.joinedAt;
        const updates = await studentApi.updates(activeSession.token, since);
        if (cancelled) return;
        if (Array.isArray(updates) && updates.length > 0) {
          const latest = updates[0];
          store.updateSession(activeSession.token, { lastUpdateCheck: new Date().toISOString() });
          refreshSessions();
          const body = `${latest.title} — ${latest.subject_name}`;
          toast(`Nouveau document : ${latest.title}`, 'success');
          if ('Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification('Tchatz Klassio — nouveau document', { body, icon: './icons/icon-192.png' });
            } catch {
              /* notification non disponible */
            }
          }
        } else {
          store.updateSession(activeSession.token, { lastUpdateCheck: new Date().toISOString() });
        }
      } catch (err) {
        if (errorCode(err) === 'SESSION_INVALID') handleSessionInvalid(activeSession.token);
      }
    };
    const timer = setInterval(check, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeSession, online, settings.notifications, toast, refreshSessions, handleSessionInvalid]);

  const ctx = useMemo(
    () => ({
      route,
      navigate,
      sessions,
      activeSession,
      setActiveToken,
      joinClassroom,
      leaveClassroom,
      refreshSessions,
      handleSessionInvalid,
      ownerSession,
      authReady,
      online,
      toast,
      settings,
      updateSettings,
      installPrompt,
      installed,
    }),
    [route, sessions, activeSession, setActiveToken, joinClassroom, leaveClassroom, refreshSessions,
      handleSessionInvalid, ownerSession, authReady, online, toast, settings, updateSettings, installPrompt, installed]
  );

  const showBottomNav = Boolean(activeSession) && STUDENT_ROUTES.includes(route.name);

  return (
    <AppContext.Provider value={ctx}>
      <div className="app-shell">
        {!online && (
          <div className="offline-bar">
            Hors connexion — seuls les documents déjà téléchargés sont accessibles.
          </div>
        )}
        <Header />
        <main className="page" id="contenu">
          <Screen route={route} />
        </main>
        {!showBottomNav && <Footer />}
        {showBottomNav && <BottomNav route={route} />}
        <Toasts toasts={toasts} />
      </div>
    </AppContext.Provider>
  );
}

// ------------------------------------------------------------------ écran
function Screen({ route }) {
  switch (route.name) {
    case 'join': return <Join />;
    case 'classroom': return <Classroom />;
    case 'library': return <Library subjectId={route.params.subject} />;
    case 'document': return <DocumentDetail id={route.params.id} />;
    case 'downloads': return <Downloads />;
    case 'settings': return <Settings />;
    case 'owner': return <OwnerAuth />;
    case 'ownerSpace': return <OwnerSpace id={route.params.id} />;
    case 'publish': return <Publish token={route.params.token} />;
    case 'install': return <Install />;
    case 'privacy': return <Privacy />;
    case 'reset': return <ResetPassword />;
    default: return <Home />;
  }
}

// ------------------------------------------------------------------ en-tête
function Header() {
  const { route, settings, updateSettings, installed } = useApp();
  const dark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const toggleTheme = () => updateSettings({ theme: dark ? 'light' : 'dark' });

  return (
    <header className="app-header">
      <div className={`container app-header-inner ${route.name === 'home' ? 'container-wide' : ''}`}>
        <a href="#/" className="brand" aria-label="Tchatz Klassio — accueil">
          <Logo />
          <span>Tchatz Klassio</span>
        </a>
        <div className="header-spacer" />
        {!installed && (
          <a href="#/installer" className="header-action" title="Installer l'application">
            <Icon name="download" size={18} />
            <span className="hide-sm">Installer</span>
          </a>
        )}
        <button type="button" className="header-action" onClick={toggleTheme} aria-label="Changer de thème" title="Thème clair / sombre">
          <Icon name={dark ? 'sun' : 'moon'} size={18} />
        </button>
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ navigation basse
function BottomNav({ route }) {
  const items = [
    { to: '/classe', icon: 'home', label: 'Ma classe', name: 'classroom' },
    { to: '/bibliotheque', icon: 'book', label: 'Bibliothèque', name: 'library' },
    { to: '/telechargements', icon: 'download', label: 'Téléchargés', name: 'downloads' },
    { to: '/parametres', icon: 'settings', label: 'Paramètres', name: 'settings' },
  ];
  return (
    <nav className="bottom-nav" aria-label="Navigation principale">
      {items.map((item) => (
        <a key={item.to} href={`#${item.to}`} className={route.name === item.name || (item.name === 'library' && route.name === 'document') ? 'active' : ''}>
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}

// ------------------------------------------------------------------ pied de page
function Footer() {
  return (
    <footer className="app-footer">
      <div className="container">
        <div>Tchatz Klassio · Version 1.0.0 — Une solution de Tchatz · Samson Adjaho</div>
        <div className="footer-links">
          <a href="#/confidentialite">Confidentialité et conditions</a>
          <a href="#/installer">Télécharger l'application</a>
          <a href="#/responsable">Espace responsable</a>
        </div>
      </div>
    </footer>
  );
}
