import React, { useCallback, useEffect, useState } from 'react';
import { useApp } from '../App.jsx';
import { signDocument, friendlyError, errorCode } from '../lib/api.js';
import { getDownloads, isDownloaded } from '../lib/store.js';
import { saveOffline, getOfflineBlob, deleteOffline, openBlob } from '../lib/offline.js';
import { BackLink, Badge, Button, Card, EmptyState, FileBadge, Icon, Loading, Notice } from '../components/UI.jsx';
import { formatBytes, formatDate } from '../lib/format.js';

export default function DocumentDetail({ id }) {
  const { activeSession, online, handleSessionInvalid, toast } = useApp();
  const [doc, setDoc] = useState(null);
  const [signedUrl, setSignedUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState(0);
  const [downloaded, setDownloaded] = useState(isDownloaded(id));

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    // Hors connexion (ou document déjà téléchargé) : métadonnées locales.
    const local = getDownloads().find((d) => d.id === id);
    if (!online) {
      if (local) {
        setDoc({
          id: local.id,
          title: local.title,
          file_name: local.fileName,
          file_type: local.fileType,
          file_size: local.fileSize,
          subject_name: local.subjectName,
          teacher_display_name: local.teacher,
          created_at: local.createdAt,
        });
        setLoading(false);
      } else {
        setError('Ce document n’est pas téléchargé. Connectez-vous pour le consulter.');
        setLoading(false);
      }
      return;
    }
    if (!activeSession) {
      if (local) {
        setDoc({
          id: local.id, title: local.title, file_name: local.fileName, file_type: local.fileType,
          file_size: local.fileSize, subject_name: local.subjectName,
          teacher_display_name: local.teacher, created_at: local.createdAt,
        });
        setLoading(false);
        return;
      }
      setError('Rejoignez la classe pour consulter ce document.');
      setLoading(false);
      return;
    }
    try {
      const result = await signDocument({ documentId: id, sessionToken: activeSession.token });
      setDoc(result.document);
      setSignedUrl(result.signed_url);
    } catch (err) {
      const code = errorCode(err);
      if (code === 'SESSION_INVALID') {
        handleSessionInvalid(activeSession.token);
        return;
      }
      if (local) {
        setDoc({
          id: local.id, title: local.title, file_name: local.fileName, file_type: local.fileType,
          file_size: local.fileSize, subject_name: local.subjectName,
          teacher_display_name: local.teacher, created_at: local.createdAt,
        });
      } else {
        setError(friendlyError(err));
      }
    } finally {
      setLoading(false);
    }
  }, [id, online, activeSession, handleSessionInvalid]);

  useEffect(() => {
    load();
  }, [load]);

  /** Récupère le contenu du fichier (cache local ou URL signée), avec progression. */
  const fetchBlob = async () => {
    const cached = await getOfflineBlob(id);
    if (cached) return cached;
    if (!signedUrl) throw new Error('Aucune URL');
    const response = await fetch(signedUrl);
    if (!response.ok) throw new Error('FETCH_FAILED');
    const total = Number(response.headers.get('content-length')) || doc?.file_size || 0;
    if (!response.body || !total) return response.blob();
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      setProgress(Math.min(99, Math.round((received / total) * 100)));
    }
    setProgress(100);
    return new Blob(chunks, { type: response.headers.get('content-type') || undefined });
  };

  const handleOpen = async () => {
    setBusy('open');
    setError('');
    try {
      const blob = await fetchBlob();
      openBlob(blob, doc.file_name, doc.file_type);
    } catch (err) {
      setError(online ? 'Impossible d’ouvrir le document. Réessayez.' : 'Document indisponible hors connexion.');
    } finally {
      setBusy('');
      setProgress(0);
    }
  };

  const handleDownload = async () => {
    setBusy('download');
    setError('');
    try {
      const blob = await fetchBlob();
      await saveOffline({ ...doc, classroom_id: activeSession?.classroom?.id }, blob);
      setDownloaded(true);
      openBlob(blob, doc.file_name, doc.file_type, { forceDownload: true });
      toast('Document enregistré sur l’appareil.', 'success');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy('');
      setProgress(0);
    }
  };

  const handleSaveDevice = async () => {
    setBusy('save');
    try {
      const blob = await fetchBlob();
      openBlob(blob, doc.file_name, doc.file_type, { forceDownload: true });
    } catch {
      setError('Impossible de récupérer le document.');
    } finally {
      setBusy('');
      setProgress(0);
    }
  };

  const handleRemove = async () => {
    await deleteOffline(id);
    setDownloaded(false);
    toast('Document retiré des téléchargements.');
  };

  const handleShare = async () => {
    try {
      const blob = await getOfflineBlob(id);
      if (blob && navigator.canShare?.({ files: [new File([blob], doc.file_name)] })) {
        await navigator.share({ files: [new File([blob], doc.file_name, { type: blob.type })], title: doc.title });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: doc.title, text: `${doc.title} — ${doc.subject_name || 'Tchatz Klassio'}` });
      } else {
        await navigator.clipboard.writeText(`${doc.title} — ${doc.subject_name || ''}`);
        toast('Titre copié.', 'success');
      }
    } catch {
      /* partage annulé */
    }
  };

  if (loading) {
    return (
      <div className="container">
        <Loading label="Chargement du document…" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="container">
        <BackLink to="/bibliotheque" />
        <EmptyState icon="file" title="Document introuvable">
          {error || 'Ce document n’est plus disponible.'}
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="container">
      <BackLink to="/bibliotheque" />
      {error && <Notice tone="error">{error}</Notice>}

      <Card>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <FileBadge type={doc.file_type} />
          <div className="grow">
            <h1 style={{ fontSize: '1.3rem', marginBottom: 6 }}>{doc.title}</h1>
            <div className="row wrap" style={{ gap: 8 }}>
              {doc.subject_name && <Badge tone="blue">{doc.subject_name}</Badge>}
              {downloaded && <Badge tone="green">Disponible hors connexion</Badge>}
            </div>
          </div>
        </div>
        {doc.description && <p className="text-secondary mt-2">{doc.description}</p>}

        <div className="divider" />
        <div className="detail-list">
          {doc.subject_name && (
            <div className="detail-line"><span className="detail-label">Matière</span><span className="detail-value">{doc.subject_name}</span></div>
          )}
          {doc.teacher_display_name && (
            <div className="detail-line"><span className="detail-label">Enseignant</span><span className="detail-value">{doc.teacher_display_name}</span></div>
          )}
          {doc.created_at && (
            <div className="detail-line"><span className="detail-label">Publié le</span><span className="detail-value">{formatDate(doc.created_at)}</span></div>
          )}
          <div className="detail-line"><span className="detail-label">Taille</span><span className="detail-value">{formatBytes(doc.file_size)}</span></div>
          <div className="detail-line"><span className="detail-label">Format</span><span className="detail-value">{(doc.file_type || '').toUpperCase()}</span></div>
          <div className="detail-line"><span className="detail-label">Fichier</span><span className="detail-value">{doc.file_name}</span></div>
        </div>
      </Card>

      {busy && progress > 0 && (
        <div className="mt-2">
          <div className="progress"><div className="progress-bar" style={{ width: `${progress}%` }} /></div>
          <p className="text-sm text-secondary text-center mt-1">Téléchargement… {progress}%</p>
        </div>
      )}

      <div className="btn-row mt-2">
        <Button icon="eye" onClick={handleOpen} disabled={Boolean(busy)}>
          {busy === 'open' ? 'Ouverture…' : 'Consulter'}
        </Button>
        {downloaded ? (
          <Button variant="outline" icon="download" onClick={handleSaveDevice} disabled={Boolean(busy)}>
            {busy === 'save' ? 'Envoi…' : 'Enregistrer sur l’appareil'}
          </Button>
        ) : (
          <Button variant="outline" icon="download" onClick={handleDownload} disabled={Boolean(busy) || (!online && !downloaded)}>
            {busy === 'download' ? 'Téléchargement…' : 'Télécharger'}
          </Button>
        )}
      </div>
      <div className="btn-row mt-1">
        <Button variant="ghost" icon="share" onClick={handleShare} disabled={Boolean(busy)}>
          Partager
        </Button>
        {downloaded && (
          <Button variant="ghost" icon="trash" onClick={handleRemove} disabled={Boolean(busy)}>
            Retirer des téléchargements
          </Button>
        )}
      </div>

      {!downloaded && online && (
        <p className="text-sm text-secondary text-center mt-2">
          Téléchargez le document pour le consulter hors connexion.
        </p>
      )}
    </div>
  );
}
