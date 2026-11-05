import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../App.jsx';
import { adminApi, friendlyError, errorCode } from '../lib/api.js';
import { BackLink, Button, Card, EmptyState, Icon, Loading, Notice, SectionTitle } from '../components/UI.jsx';

const PAGE_LABELS = {
  home: 'Accueil',
  join: 'Rejoindre une classe',
  classroom: 'Ma classe',
  library: 'Bibliothèque',
  document: 'Consultation de document',
  downloads: 'Téléchargements',
  settings: 'Paramètres',
  owner: 'Espace responsable',
  owner_space: 'Gestion d’une classe',
  publish: 'Publication (enseignant)',
  install: 'Installation',
  privacy: 'Confidentialité',
  reset: 'Réinitialisation',
  stats: 'Statistiques',
};

const EVENT_LABELS = {
  join_classroom: 'Classes rejointes',
  install_click: 'Clics « Installer »',
  app_installed: 'Applications installées',
};

function fmtDay(iso) {
  // iso = « 2026-11-05 »
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

/** Graphique en barres SVG, sans dépendance (visiteurs + pages vues par jour). */
function TrafficChart({ series }) {
  const [hover, setHover] = useState(null);
  if (!series || series.length === 0) return null;
  const W = 720;
  const H = 220;
  const PAD = { top: 14, right: 8, bottom: 26, left: 34 };
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;
  const max = Math.max(1, ...series.map((s) => s.views));
  const step = iw / series.length;
  const bw = Math.max(2, Math.min(18, step * 0.34));
  const y = (v) => PAD.top + ih - (v / max) * ih;
  const ticks = [0, Math.ceil(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const labelEvery = Math.max(1, Math.ceil(series.length / 8));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Visiteurs et pages vues par jour" style={{ width: '100%', height: 'auto', display: 'block' }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">{t}</text>
          </g>
        ))}
        {series.map((s, i) => {
          const cx = PAD.left + i * step + step / 2;
          return (
            <g key={s.day}
              onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(null)}
              onTouchStart={() => setHover(s)}>
              <rect x={cx - step / 2} y={PAD.top} width={step} height={ih} fill="transparent" />
              <rect x={cx - bw - 1} y={y(s.views)} width={bw} height={Math.max(0, PAD.top + ih - y(s.views))} rx="2" fill="var(--sky)" opacity="0.85" />
              <rect x={cx + 1} y={y(s.visitors)} width={bw} height={Math.max(0, PAD.top + ih - y(s.visitors))} rx="2" fill="var(--blue)" />
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" fontSize="10.5" fill="var(--text-muted)">{fmtDay(s.day)}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="row wrap mt-1" style={{ gap: 16, alignItems: 'center' }}>
        <span className="text-sm text-secondary"><span className="legend-dot" style={{ background: 'var(--blue)' }} /> Visiteurs uniques</span>
        <span className="text-sm text-secondary"><span className="legend-dot" style={{ background: 'var(--sky)' }} /> Pages vues</span>
        {hover && (
          <span className="text-sm" style={{ marginLeft: 'auto', fontWeight: 650 }}>
            {fmtDay(hover.day)} · {hover.visitors} visiteur{hover.visitors > 1 ? 's' : ''} · {hover.views} page{hover.views > 1 ? 's' : ''} vue{hover.views > 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}

function StatCard({ value, label }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default function Stats() {
  const { ownerSession, authReady, online } = useApp();
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [denied, setDenied] = useState(false);

  const load = useCallback(async () => {
    if (!ownerSession) return;
    setLoading(true);
    setError('');
    setDenied(false);
    try {
      const result = await adminApi.stats(days);
      setData(result);
    } catch (err) {
      if (errorCode(err) === 'ADMIN_ONLY') setDenied(true);
      else setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [ownerSession, days]);

  useEffect(() => {
    if (authReady && ownerSession && online) load();
    else if (authReady) setLoading(false);
  }, [authReady, ownerSession, online, load]);

  if (!authReady) return <div className="container"><Loading /></div>;

  if (!ownerSession) {
    return (
      <div className="container">
        <BackLink to="/" />
        <EmptyState
          icon="lock"
          title="Statistiques du site"
          action={<Button icon="lock" onClick={() => { window.location.hash = '/responsable'; }}>Se connecter</Button>}
        >
          Cette page est réservée à l'administrateur. Connectez-vous avec votre compte responsable.
        </EmptyState>
      </div>
    );
  }

  if (denied) {
    return (
      <div className="container">
        <BackLink to="/responsable" />
        <EmptyState icon="shield" title="Accès réservé">
          Les statistiques du site ne sont visibles que par l'administrateur de Tchatz Klassio.
        </EmptyState>
      </div>
    );
  }

  const t = data?.totals || {};
  const b = data?.business || {};
  const ev = data?.events || {};
  const top = data?.top_pages || [];
  const topMax = Math.max(1, ...top.map((p) => p.views));

  return (
    <div className="container container-wide">
      <BackLink to="/responsable" />
      <div className="row-between wrap mb-2">
        <div>
          <h1 className="mb-0" style={{ fontSize: '1.5rem' }}>Statistiques du site</h1>
          <p className="text-secondary mb-0">Audience anonyme — sans cookie, sans donnée personnelle.</p>
        </div>
        <Button variant="outline" size="sm" icon="refresh" onClick={load} disabled={!online || loading}>
          Actualiser
        </Button>
      </div>

      {!online && <Notice tone="warning" icon="wifiOff">Pas de connexion. Les statistiques se chargeront au retour du réseau.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="chips" role="tablist" aria-label="Période">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" className={`chip ${days === d ? 'active' : ''}`} onClick={() => setDays(d)}>
            {d} jours
          </button>
        ))}
      </div>

      {loading && !data ? (
        <Loading label="Chargement des statistiques…" />
      ) : data ? (
        <>
          <div className="stats-grid stats-grid-4">
            <StatCard value={t.visitors_today ?? 0} label="Visiteurs aujourd'hui" />
            <StatCard value={t.visitors_7d ?? 0} label="Visiteurs · 7 jours" />
            <StatCard value={t.visitors_30d ?? 0} label="Visiteurs · 30 jours" />
            <StatCard value={t.visitors_total ?? 0} label="Visiteurs depuis le début" />
          </div>
          <div className="stats-grid mt-2">
            <StatCard value={t.views_today ?? 0} label="Pages vues aujourd'hui" />
            <StatCard value={t.views_7d ?? 0} label="Pages vues · 7 jours" />
            <StatCard value={t.views_period ?? 0} label={`Pages vues · ${days} jours`} />
          </div>

          <Card className="mt-2">
            <SectionTitle>Audience jour par jour</SectionTitle>
            <TrafficChart series={data.series} />
          </Card>

          <div className="stats-two-col mt-2">
            <Card>
              <SectionTitle>Pages les plus consultées</SectionTitle>
              {top.length === 0 ? (
                <p className="card-sub mb-0">Aucune page vue sur la période.</p>
              ) : (
                <div className="stack" style={{ gap: 10 }}>
                  {top.map((p) => (
                    <div key={p.page}>
                      <div className="row-between">
                        <span className="text-sm" style={{ fontWeight: 600 }}>{PAGE_LABELS[p.page] || p.page}</span>
                        <span className="text-sm text-secondary">{p.views}</span>
                      </div>
                      <div className="progress mt-1" style={{ height: 6 }}>
                        <div className="progress-bar" style={{ width: `${(p.views / topMax) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <SectionTitle>Actions clés · {days} jours</SectionTitle>
              <div className="stack" style={{ gap: 12 }}>
                {Object.entries(EVENT_LABELS).map(([key, label]) => (
                  <div key={key} className="row-between">
                    <span className="row text-sm" style={{ gap: 8, fontWeight: 600 }}>
                      <Icon name={key === 'join_classroom' ? 'key' : key === 'app_installed' ? 'check' : 'download'} size={17} className="text-muted" />
                      {label}
                    </span>
                    <span className="stat-value" style={{ fontSize: '1.15rem' }}>{ev[key] ?? 0}</span>
                  </div>
                ))}
              </div>
              <div className="divider" />
              <p className="text-sm text-muted mb-0">
                « Classes rejointes » compte les connexions réussies avec un code, y compris après
                réinstallation.
              </p>
            </Card>
          </div>

          <SectionTitle>Activité des classes</SectionTitle>
          <div className="stats-grid stats-grid-4">
            <StatCard value={b.classrooms ?? 0} label={`Classes (${b.classrooms_active ?? 0} actives)`} />
            <StatCard value={b.subjects ?? 0} label="Matières" />
            <StatCard value={b.documents ?? 0} label="Documents publiés" />
            <StatCard value={b.owners ?? 0} label="Responsables inscrits" />
          </div>
          <div className="stats-grid mt-2">
            <StatCard value={b.student_sessions ?? 0} label="Connexions étudiants (total)" />
            <StatCard value={b.student_sessions_active_7d ?? 0} label="Sessions actives · 7 jours" />
            <StatCard value={b.devices ?? 0} label="Appareils enregistrés" />
          </div>

          <p className="text-sm text-muted mt-3 text-center">
            Mesure anonyme : identifiant aléatoire par appareil, aucun cookie, aucune adresse IP
            conservée. Rétention : 12 mois. Les visiteurs peuvent la désactiver dans leurs Paramètres.
          </p>
        </>
      ) : null}
    </div>
  );
}
