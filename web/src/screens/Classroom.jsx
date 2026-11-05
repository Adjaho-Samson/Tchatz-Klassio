import React, { useCallback, useEffect, useState } from 'react';
import { useApp, navigate } from '../App.jsx';
import { studentApi, friendlyError, errorCode } from '../lib/api.js';
import * as store from '../lib/store.js';
import { Badge, Button, Card, EmptyState, Icon, LinkButton, Loading, Notice, SectionTitle } from '../components/UI.jsx';
import { formatDateTime, plural, timeAgo } from '../lib/format.js';
import DocumentRow from '../components/DocumentRow.jsx';

export default function Classroom() {
  const { activeSession, online, handleSessionInvalid, toast, refreshSessions } = useApp();
  const [data, setData] = useState(activeSession?.snapshot || null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(!activeSession?.snapshot);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!activeSession) return;
    if (!online) {
      setData(activeSession.snapshot || null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await studentApi.classroom(activeSession.token);
      setData(result);
      store.updateSession(activeSession.token, { snapshot: result, classroom: result.classroom });
      refreshSessions();
      const docs = await studentApi.documents(activeSession.token, { limit: 5 });
      setRecent(Array.isArray(docs) ? docs : []);
    } catch (err) {
      if (errorCode(err) === 'SESSION_INVALID') {
        handleSessionInvalid(activeSession.token);
        return;
      }
      setError(friendlyError(err));
      setData(activeSession.snapshot || null);
    } finally {
      setLoading(false);
    }
  }, [activeSession, online, handleSessionInvalid, refreshSessions]);

  useEffect(() => {
    load();
  }, [load]);

  if (!activeSession) {
    return (
      <div className="container">
        <EmptyState
          icon="cap"
          title="Aucune classe rejointe"
          action={<LinkButton to="/rejoindre" icon="key">Rejoindre une classe</LinkButton>}
        >
          Saisissez le code fourni par votre responsable pour accéder aux documents de votre classe.
        </EmptyState>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="container">
        <Loading label="Chargement de la classe…" />
      </div>
    );
  }

  const classroom = data?.classroom || activeSession.classroom;
  const subjects = data?.subjects || [];
  const documentCount = data?.document_count ?? 0;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(classroom.join_code);
      toast('Code copié.', 'success');
    } catch {
      toast('Copie impossible sur ce navigateur.', 'error');
    }
  };

  return (
    <div className="container">
      {error && <Notice tone="error">{error}</Notice>}
      {!online && (
        <Notice tone="warning" icon="wifiOff">
          Hors connexion : bibliothèque locale. Les documents déjà téléchargés restent disponibles.
        </Notice>
      )}

      <Card className="class-header">
        <div className="row-between wrap">
          <div>
            <h2>{classroom?.class_name}</h2>
            <div className="class-meta">{classroom?.institution_name}</div>
          </div>
          <button type="button" className="header-action" onClick={load} disabled={!online} title="Actualiser" style={{ color: '#fff' }}>
            <Icon name="refresh" size={18} />
          </button>
        </div>
        <div className="row wrap mt-2" style={{ gap: 8 }}>
          {classroom?.field_of_study && <Badge>{classroom.field_of_study}</Badge>}
          {classroom?.level && <Badge>{classroom.level}</Badge>}
          {classroom?.academic_year && <Badge>{classroom.academic_year}</Badge>}
        </div>
      </Card>

      <div className="stats-grid mt-2">
        <div className="stat-card">
          <div className="stat-value">{subjects.length}</div>
          <div className="stat-label">Matières</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{documentCount}</div>
          <div className="stat-label">Documents</div>
        </div>
        <button type="button" className="stat-card" onClick={copyCode} style={{ cursor: 'pointer', fontFamily: 'inherit' }} title="Copier le code de classe">
          <div className="stat-value mono" style={{ fontSize: '1.05rem', letterSpacing: '0.1em' }}>{classroom?.join_code}</div>
          <div className="stat-label">Code de classe · copier</div>
        </button>
      </div>

      <div className="row-between mt-3">
        <SectionTitle>Matières</SectionTitle>
      </div>
      {subjects.length === 0 ? (
        <Card className="card-flat">
          <p className="card-sub mb-0">Aucune matière pour le moment. Le responsable n'a pas encore créé de matière.</p>
        </Card>
      ) : (
        <div className="subject-grid">
          {subjects.map((s) => (
            <button key={s.id} type="button" className="subject-card" onClick={() => navigate(`/bibliotheque/${s.id}`)}>
              <span className="row-between">
                <span className="subject-name">{s.name}</span>
                <Badge tone="blue">{s.document_count}</Badge>
              </span>
              {s.description && <span className="subject-desc">{s.description}</span>}
              <span className="text-muted text-sm">
                {s.last_document_at ? `Dernier document ${timeAgo(s.last_document_at)}` : 'Aucun document'}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="row-between mt-3">
        <SectionTitle>Documents récents</SectionTitle>
        <LinkButton to="/bibliotheque" variant="ghost" className="btn-sm">
          Tout voir
        </LinkButton>
      </div>
      {!online ? (
        <Card className="card-flat">
          <p className="card-sub mb-0">
            Hors connexion : seuls les documents déjà téléchargés sont accessibles.{' '}
            <a href="#/telechargements">Voir mes téléchargements</a>.
          </p>
        </Card>
      ) : recent.length === 0 ? (
        <Card className="card-flat">
          <p className="card-sub mb-0">Aucun document publié pour le moment.</p>
        </Card>
      ) : (
        <div>
          {recent.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} />
          ))}
          <div className="mt-2">
            <LinkButton to="/bibliotheque" variant="outline" block icon="book">
              Voir toute la bibliothèque
            </LinkButton>
          </div>
        </div>
      )}
    </div>
  );
}
