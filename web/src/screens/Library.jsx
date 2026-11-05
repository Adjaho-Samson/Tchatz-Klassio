import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp, navigate } from '../App.jsx';
import { studentApi, friendlyError, errorCode } from '../lib/api.js';
import { getDownloads } from '../lib/store.js';
import { Button, EmptyState, Icon, Input, LinkButton, Loading, Notice } from '../components/UI.jsx';
import DocumentRow from '../components/DocumentRow.jsx';

const PAGE_SIZE = 30;

export default function Library({ subjectId }) {
  const { activeSession, online, handleSessionInvalid } = useApp();
  const [subjects, setSubjects] = useState(activeSession?.snapshot?.subjects || []);
  const [docs, setDocs] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(subjectId || null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setFilter(subjectId || null);
  }, [subjectId]);

  // Charge la liste des matières pour les filtres.
  useEffect(() => {
    if (!activeSession || !online) return;
    studentApi
      .classroom(activeSession.token)
      .then((result) => setSubjects(result.subjects || []))
      .catch(() => {});
  }, [activeSession, online]);

  const load = useCallback(
    async (offset = 0, append = false) => {
      if (!activeSession) return;
      if (!online) {
        // Hors connexion : uniquement les documents téléchargés.
        const local = getDownloads().map((d) => ({
          id: d.id,
          title: d.title,
          file_type: d.fileType,
          file_size: d.fileSize,
          subject_name: d.subjectName,
          created_at: d.createdAt,
          _offline: true,
        }));
        setDocs(local);
        setHasMore(false);
        setLoading(false);
        return;
      }
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);
      setError('');
      try {
        const result = await studentApi.documents(activeSession.token, {
          subjectId: filter,
          search: search.trim() || null,
          limit: PAGE_SIZE,
          offset,
        });
        const list = Array.isArray(result) ? result : [];
        setDocs((prev) => (append ? [...prev, ...list] : list));
        setHasMore(list.length === PAGE_SIZE);
      } catch (err) {
        if (errorCode(err) === 'SESSION_INVALID') {
          handleSessionInvalid(activeSession.token);
          return;
        }
        setError(friendlyError(err));
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeSession, online, filter, search, handleSessionInvalid]
  );

  // Recherche avec anti-rebond.
  useEffect(() => {
    const timer = setTimeout(() => load(0, false), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const filteredOffline = useMemo(() => {
    if (online) return docs;
    return docs.filter(
      (d) =>
        (!filter || d.subject_id === filter || d.subjectName === subjects.find((s) => s.id === filter)?.name) &&
        (!search.trim() || d.title.toLowerCase().includes(search.trim().toLowerCase()))
    );
  }, [docs, online, filter, search, subjects]);

  if (!activeSession) {
    return (
      <div className="container">
        <EmptyState
          icon="cap"
          title="Aucune classe rejointe"
          action={<LinkButton to="/rejoindre" icon="key">Rejoindre une classe</LinkButton>}
        >
          Rejoignez une classe pour accéder à sa bibliothèque de documents.
        </EmptyState>
      </div>
    );
  }

  const activeSubject = subjects.find((s) => s.id === filter);

  return (
    <div className="container">
      <div className="row-between mb-2">
        <h1 className="mb-0" style={{ fontSize: '1.5rem' }}>Bibliothèque</h1>
        {activeSubject && <span className="badge badge-blue">{activeSubject.name}</span>}
      </div>

      {!online && (
        <Notice tone="warning" icon="wifiOff">
          Hors connexion : seuls les documents déjà téléchargés sont affichés.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="search-wrap">
        <Icon name="search" />
        <Input
          type="search"
          placeholder="Rechercher un document…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Rechercher un document"
        />
      </div>

      <div className="chips" role="tablist" aria-label="Filtrer par matière">
        <button type="button" className={`chip ${!filter ? 'active' : ''}`} onClick={() => { setFilter(null); navigate('/bibliotheque'); }}>
          Toutes
        </button>
        {subjects.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`chip ${filter === s.id ? 'active' : ''}`}
            onClick={() => { setFilter(s.id); navigate(`/bibliotheque/${s.id}`); }}
          >
            {s.name} ({s.document_count})
          </button>
        ))}
      </div>

      {loading ? (
        <Loading label="Chargement des documents…" />
      ) : filteredOffline.length === 0 ? (
        <EmptyState icon="file" title={search ? `Aucun résultat pour « ${search} »` : 'Aucun document'}>
          {search
            ? 'Essayez un autre mot-clé ou changez de matière.'
            : online
              ? 'Les documents publiés par vos enseignants apparaîtront ici.'
              : 'Téléchargez des documents quand vous êtes connecté pour les consulter hors connexion.'}
        </EmptyState>
      ) : (
        <>
          <div>
            {filteredOffline.map((doc) => (
              <DocumentRow key={doc.id} doc={doc} />
            ))}
          </div>
          {hasMore && online && (
            <div className="mt-2">
              <Button variant="outline" block onClick={() => load(docs.length, true)} disabled={loadingMore}>
                {loadingMore ? 'Chargement…' : 'Charger plus de documents'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
