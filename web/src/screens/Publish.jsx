import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import { publishApi, finalizeUpload, friendlyError, errorCode } from '../lib/api.js';
import { ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES } from '../lib/config.js';
import { extFromName } from '../lib/file-types.js';
import { Badge, Button, Card, Field, Icon, Input, Loading, Notice, Textarea } from '../components/UI.jsx';
import DocumentViewer from '../components/DocumentViewer.jsx';
import { formatBytes } from '../lib/format.js';

export default function Publish({ token }) {
  const { toast, online } = useApp();
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [published, setPublished] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    if (!token) {
      setFatal('Ce lien de publication n’est pas valide.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await publishApi.context(token);
      setContext(result);
      if (result.teacher_name_hint) setTeacherName(result.teacher_name_hint);
    } catch (err) {
      setFatal(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const pickFile = (f) => {
    setError('');
    if (!f) return;
    const allowed = (context?.allowed_extensions || ALLOWED_EXTENSIONS).map((e) => e.toLowerCase());
    const ext = extFromName(f.name);
    if (!ext || !allowed.includes(ext)) {
      setError('Format de fichier non autorisé. Formats acceptés : ' + allowed.join(', ') + '.');
      return;
    }
    const max = context?.max_upload_bytes || MAX_UPLOAD_BYTES;
    if (f.size > max) {
      setError(`Fichier trop volumineux (${formatBytes(f.size)}). Maximum : ${formatBytes(max)}.`);
      return;
    }
    setFile(f);
    if (!title.trim()) {
      // Pré-remplit le titre avec le nom du fichier (sans extension).
      setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Choisissez un fichier à publier.');
      return;
    }
    if (title.trim().length < 2) {
      setError('Le titre est requis (2 caractères minimum).');
      return;
    }
    if (teacherName.trim().length < 2) {
      setError('Le nom de l’enseignant est requis (2 caractères minimum).');
      return;
    }
    setBusy(true);
    setError('');
    setProgress(0);
    try {
      setStage('Préparation…');
      const begin = await publishApi.beginUpload(token, {
        title: title.trim(),
        description: description.trim(),
        fileName: file.name,
        fileSize: file.size,
        teacherName: teacherName.trim(),
      });
      setStage('Envoi du fichier…');
      await publishApi.uploadFile(begin.file_path, file, (p) => setProgress(Math.round(p * 100)));
      setStage('Validation…');
      setProgress(100);
      const result = await finalizeUpload({ documentId: begin.document_id, token });
      setPublished(result.document);
      toast('Document publié.', 'success');
    } catch (err) {
      const code = errorCode(err);
      if (code === 'LINK_REVOKED' || code === 'LINK_INVALID') {
        setFatal(friendlyError(err));
      } else {
        setError(friendlyError(err));
      }
    } finally {
      setBusy(false);
      setStage('');
    }
  };

  const reset = () => {
    setPublished(null);
    setTitle('');
    setDescription('');
    setFile(null);
    setProgress(0);
    load();
  };

  if (loading) {
    return <div className="container"><Loading label="Vérification du lien…" /></div>;
  }

  if (fatal) {
    return (
      <div className="container">
        <Card>
          <div className="empty" style={{ padding: '24px 0' }}>
            <div className="empty-icon"><Icon name="link" /></div>
            <h3>Lien indisponible</h3>
            <p>{fatal}</p>
            <p className="text-sm text-muted mt-2">
              Demandez un nouveau lien de publication au responsable de la classe.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (published) {
    return (
      <div className="container">
        <Card>
          <div className="empty" style={{ padding: '24px 0' }}>
            <div className="empty-icon" style={{ background: 'var(--success-bg)', color: 'var(--success)', borderColor: 'transparent' }}>
              <Icon name="check" />
            </div>
            <h3>Document publié</h3>
            <p>
              « {published.title} » est maintenant disponible pour la classe{' '}
              <strong>{published.classroom_name || context?.classroom?.class_name}</strong> dans la
              matière <strong>{published.subject_name || context?.subject?.name}</strong>.
            </p>
            <Button icon="plus" onClick={reset} className="mt-2">Publier un autre document</Button>
          </div>
        </Card>
      </div>
    );
  }

  const max = context?.max_upload_bytes || MAX_UPLOAD_BYTES;
  const extensions = context?.allowed_extensions || ALLOWED_EXTENSIONS;

  return (
    <div className="container">
      <h1>Publier un document</h1>
      <p className="text-secondary">
        Vous publiez via un lien privé. Le document sera visible par toute la classe, sans compte.
      </p>

      <Card className="class-header mb-2">
        <div className="class-meta">Matière</div>
        <h2 style={{ marginBottom: 8 }}>{context?.subject?.name}</h2>
        <div className="class-meta">
          {context?.classroom?.class_name} · {context?.classroom?.institution_name}
        </div>
        <div className="row wrap mt-2" style={{ gap: 8 }}>
          {context?.classroom?.level && <Badge>{context.classroom.level}</Badge>}
          {context?.classroom?.academic_year && <Badge>{context.classroom.academic_year}</Badge>}
        </div>
      </Card>

      {!online && <Notice tone="warning" icon="wifiOff">Pas de connexion internet. Connectez-vous pour publier.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <Card>
        <form onSubmit={submit}>
          <Field label="Titre du document" htmlFor="pub-title">
            <Input id="pub-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. : Chapitre 3 — Les pointeurs" maxLength={160} />
          </Field>
          <Field label="Description (facultative)" htmlFor="pub-desc">
            <Textarea id="pub-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex. : Support de cours avec exercices corrigés" maxLength={500} />
          </Field>
          <Field label="Nom de l'enseignant" htmlFor="pub-teacher">
            <Input id="pub-teacher" value={teacherName} onChange={(e) => setTeacherName(e.target.value)} placeholder="Ex. : M. Adjaho" maxLength={120} />
          </Field>

          <Field label="Fichier">
            <div
              className={`dropzone ${drag ? 'drag' : ''}`}
              onClick={() => !busy && inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                if (!busy) pickFile(e.dataTransfer.files?.[0]);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
            >
              <Icon name={file ? 'file' : 'upload'} />
              {file ? (
                <>
                  <div className="dropzone-title">{file.name}</div>
                  <div className="dropzone-hint">{formatBytes(file.size)} · Cliquez pour changer</div>
                </>
              ) : (
                <>
                  <div className="dropzone-title">Choisir un fichier ou le déposer ici</div>
                  <div className="dropzone-hint">
                    {extensions.join(', ')} · {formatBytes(max)} maximum
                  </div>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                hidden
                accept={extensions.map((e) => '.' + e).join(',')}
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </div>
            {file && !busy && (
              <div className="mt-1">
                <Button size="sm" variant="outline" icon="eye" onClick={() => setPreviewOpen(true)}>
                  Aperçu du fichier avant publication
                </Button>
              </div>
            )}
          </Field>

          {busy && (
            <div className="mb-2">
              <div className="progress"><div className="progress-bar" style={{ width: `${progress}%` }} /></div>
              <p className="text-sm text-secondary text-center mt-1">{stage} {progress > 0 && progress < 100 ? `${progress}%` : ''}</p>
            </div>
          )}

          <Button type="submit" block icon="upload" disabled={busy || !online}>
            {busy ? 'Publication…' : 'Publier le document'}
          </Button>
          <p className="text-sm text-muted text-center mt-1">
            En publiant, vous confirmez que ce document est destiné à cette classe.
          </p>
        </form>
      </Card>

      <DocumentViewer
        open={previewOpen && Boolean(file)}
        blob={file}
        doc={file ? {
          title: title.trim() || file.name,
          file_name: file.name,
          file_type: extFromName(file.name),
          file_size: file.size,
        } : null}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
