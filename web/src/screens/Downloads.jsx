import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import { getDownloads } from '../lib/store.js';
import { getOfflineBlob, deleteOffline, downloadBlob, normalizeBlob } from '../lib/offline.js';
import { Button, Card, EmptyState, FileBadge, LinkButton, Notice } from '../components/UI.jsx';
import DocumentViewer from '../components/DocumentViewer.jsx';
import { formatBytes, formatDate } from '../lib/format.js';

export default function Downloads() {
  const { toast } = useApp();
  const [downloads, setDownloads] = useState(getDownloads);
  const [busy, setBusy] = useState('');
  const [viewerItem, setViewerItem] = useState(null); // { doc, blob }

  const open = async (d) => {
    setBusy(d.id);
    const blob = await getOfflineBlob(d.id);
    if (blob) {
      const typed = normalizeBlob(blob, d.fileName, d.fileType);
      setViewerItem({
        doc: {
          id: d.id,
          title: d.title,
          file_name: d.fileName,
          file_type: d.fileType,
          file_size: d.fileSize,
        },
        blob: typed,
      });
    } else {
      toast('Fichier introuvable sur cet appareil.', 'error');
      const next = getDownloads().filter((x) => x.id !== d.id);
      setDownloads(next);
    }
    setBusy('');
  };

  const saveToDevice = async (d) => {
    const blob = await getOfflineBlob(d.id);
    if (blob) {
      downloadBlob(blob, d.fileName, d.fileType, d.title);
    } else {
      toast('Fichier introuvable sur cet appareil.', 'error');
    }
  };

  const remove = async (d) => {
    await deleteOffline(d.id);
    setDownloads(getDownloads());
    toast('Document retiré des téléchargements.');
  };

  const totalSize = downloads.reduce((sum, d) => sum + (d.fileSize || 0), 0);

  return (
    <div className="container">
      <h1 style={{ fontSize: '1.5rem' }}>Téléchargements</h1>
      <p className="text-secondary">
        Vos documents enregistrés sur cet appareil, consultables même sans connexion.
      </p>

      {downloads.length === 0 ? (
        <EmptyState
          icon="download"
          title="Aucun téléchargement"
          action={<LinkButton to="/bibliotheque" variant="outline" icon="book">Parcourir la bibliothèque</LinkButton>}
        >
          Téléchargez des documents depuis la bibliothèque pour les retrouver ici, hors connexion.
        </EmptyState>
      ) : (
        <>
          <Notice tone="info" icon="info">
            {downloads.length} document{downloads.length > 1 ? 's' : ''} · {formatBytes(totalSize)} sur cet appareil.
          </Notice>
          <div className="stack">
            {downloads.map((d) => (
              <Card key={d.id} className="card-flat" style={{ padding: 16 }}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <FileBadge type={d.fileType} />
                  <div className="grow">
                    <div className="doc-title">{d.title}</div>
                    <div className="doc-meta">
                      {d.subjectName && <span>{d.subjectName}</span>}
                      <span>{formatBytes(d.fileSize)}</span>
                      {d.downloadedAt && <span>Enregistré le {formatDate(d.downloadedAt)}</span>}
                    </div>
                    <div className="row wrap mt-1" style={{ gap: 8 }}>
                      <Button size="sm" variant="primary" icon="eye" onClick={() => open(d)} disabled={busy === d.id}>
                        {busy === d.id ? 'Ouverture…' : 'Lire'}
                      </Button>
                      <Button size="sm" variant="outline" icon="download" onClick={() => saveToDevice(d)}>
                        Enregistrer
                      </Button>
                      <Button size="sm" variant="ghost" icon="trash" onClick={() => remove(d)}>
                        Retirer
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      <DocumentViewer
        open={Boolean(viewerItem)}
        blob={viewerItem?.blob}
        doc={viewerItem?.doc}
        onClose={() => setViewerItem(null)}
        onDownload={() => {
          if (viewerItem) {
            downloadBlob(
              viewerItem.blob,
              viewerItem.doc.file_name,
              viewerItem.doc.file_type,
              viewerItem.doc.title
            );
          }
        }}
      />
    </div>
  );
}
