import React from 'react';
import { navigate } from '../App.jsx';
import { FileBadge, Icon } from './UI.jsx';
import { formatBytes, timeAgo } from '../lib/format.js';
import { isDownloaded } from '../lib/store.js';

/** Ligne de document réutilisable (bibliothèque, récents, espace responsable). */
export default function DocumentRow({ doc, onClick, trailing }) {
  const downloaded = isDownloaded(doc.id);
  return (
    <button
      type="button"
      className="doc-row"
      onClick={onClick || (() => navigate(`/document/${doc.id}`))}
    >
      <FileBadge type={doc.file_type} />
      <span className="doc-info">
        <span className="doc-title">{doc.title}</span>
        <span className="doc-meta">
          {doc.subject_name && <span>{doc.subject_name}</span>}
          <span>{formatBytes(doc.file_size)}</span>
          {doc.created_at && <span>{timeAgo(doc.created_at)}</span>}
          {downloaded && (
            <span style={{ color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Icon name="check" size={13} /> Hors connexion
            </span>
          )}
        </span>
      </span>
      {trailing || <Icon name="chevronRight" className="doc-chevron" />}
    </button>
  );
}
