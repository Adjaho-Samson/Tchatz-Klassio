import React, { useCallback, useEffect, useState } from 'react';
import { useApp, navigate } from '../App.jsx';
import { ownerApi, signDocument, purgeFiles, friendlyError } from '../lib/api.js';
import { downloadBlob, normalizeBlob } from '../lib/offline.js';
import {
  BackLink, Badge, Button, Card, ConfirmModal, EmptyState, Field, Icon, Input, Loading, Modal,
  Notice, SectionTitle, Textarea,
} from '../components/UI.jsx';
import DocumentRow from '../components/DocumentRow.jsx';
import DocumentViewer from '../components/DocumentViewer.jsx';
import { formatBytes, formatDate } from '../lib/format.js';

function publishUrl(token) {
  return `${window.location.origin}${window.location.pathname}#/publier/${token}`;
}

export default function OwnerSpace({ id }) {
  const { ownerSession, authReady, toast, online } = useApp();
  const [space, setSpace] = useState(null);
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  // Modales
  const [showSubject, setShowSubject] = useState(false);
  const [editSubject, setEditSubject] = useState(null);
  const [linkInfo, setLinkInfo] = useState(null); // { token, subjectName, rotated }
  const [confirm, setConfirm] = useState(null); // { title, message, label, danger, action }
  const [docFilter, setDocFilter] = useState(null);
  const [viewerItem, setViewerItem] = useState(null); // { doc, blob }

  const load = useCallback(async () => {
    if (!id || !ownerSession) return;
    setLoading(true);
    setError('');
    try {
      const result = await ownerApi.space(id);
      setSpace(result);
      const documents = await ownerApi.documents(id, docFilter);
      setDocs(Array.isArray(documents) ? documents : []);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [id, ownerSession, docFilter]);

  useEffect(() => {
    if (authReady && !ownerSession) navigate('/responsable');
  }, [authReady, ownerSession]);

  useEffect(() => {
    if (online && ownerSession) load();
    else if (!online) setLoading(false);
  }, [load, online, ownerSession]);

  if (!authReady || (loading && !space)) {
    return <div className="container"><Loading label="Chargement de l'espace…" /></div>;
  }
  if (!ownerSession) return null;
  if (!space) {
    return (
      <div className="container">
        <BackLink to="/responsable" />
        <EmptyState icon="cap" title="Espace introuvable">{error || 'Cet espace de classe n’existe plus.'}</EmptyState>
      </div>
    );
  }

  const { classroom, subjects = [], stats = {} } = space;

  const copyText = async (text, label = 'Copié.') => {
    try {
      await navigator.clipboard.writeText(text);
      toast(label, 'success');
    } catch {
      toast('Copie impossible sur ce navigateur.', 'error');
    }
  };

  const shareText = async (title, text, url) => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        /* annulé */
      }
    }
    copyText(url || text, 'Lien copié.');
  };

  const run = async (key, fn, successMsg) => {
    setBusy(key);
    try {
      await fn();
      if (successMsg) toast(successMsg, 'success');
      await load();
    } catch (err) {
      toast(friendlyError(err), 'error');
    } finally {
      setBusy('');
      setConfirm(null);
    }
  };

  const viewDoc = async (doc) => {
    setBusy(`view-${doc.id}`);
    try {
      const result = await signDocument({
        documentId: doc.id,
        type: 'owner',
        accessToken: ownerSession.access_token,
      });
      const response = await fetch(result.signed_url);
      if (!response.ok) throw new Error('FETCH');
      const raw = await response.blob();
      const typed = normalizeBlob(raw, doc.file_name, doc.file_type);
      setViewerItem({ doc: result.document || doc, blob: typed });
    } catch {
      toast('Impossible d’ouvrir le document.', 'error');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="container">
      <BackLink to="/responsable">Mes espaces</BackLink>
      {error && <Notice tone="error">{error}</Notice>}
      {!online && <Notice tone="warning" icon="wifiOff">Pas de connexion. Actions indisponibles hors ligne.</Notice>}

      <Card className="class-header">
        <div className="row-between wrap">
          <div>
            <h2>{classroom.class_name}</h2>
            <div className="class-meta">{classroom.institution_name}</div>
          </div>
          {classroom.is_archived && <Badge tone="orange">Classe fermée</Badge>}
        </div>
        <div className="row wrap mt-2" style={{ gap: 8 }}>
          {classroom.field_of_study && <Badge>{classroom.field_of_study}</Badge>}
          {classroom.level && <Badge>{classroom.level}</Badge>}
          {classroom.academic_year && <Badge>{classroom.academic_year}</Badge>}
        </div>
      </Card>

      {classroom.is_archived && (
        <Notice tone="warning">
          Classe fermée : les étudiants n'y ont plus accès. Vous pouvez la réactiver à tout moment.
        </Notice>
      )}

      <div className="stats-grid mt-2">
        <div className="stat-card"><div className="stat-value">{stats.subjects ?? 0}</div><div className="stat-label">Matières</div></div>
        <div className="stat-card"><div className="stat-value">{stats.documents ?? 0}</div><div className="stat-label">Documents</div></div>
        <div className="stat-card"><div className="stat-value">{stats.devices ?? 0}</div><div className="stat-label">Appareils</div></div>
      </div>

      <SectionTitle>Code étudiant</SectionTitle>
      <Card className="card-flat">
        <p className="card-sub mb-1">Partagez ce code avec vos étudiants. Aucun compte n'est nécessaire pour rejoindre.</p>
        <div className="code-display">
          <span className="code-value mono">{classroom.join_code}</span>
          <div className="row" style={{ gap: 6 }}>
            <Button size="sm" variant="outline" icon="copy" onClick={() => copyText(classroom.join_code, 'Code copié.')} disabled={!online}>Copier</Button>
            <Button size="sm" variant="ghost" icon="share" onClick={() => shareText('Code de classe', `Rejoins la classe ${classroom.class_name} sur Tchatz Klassio avec le code : ${classroom.join_code}`, `${window.location.origin}${window.location.pathname}#/rejoindre`)} disabled={!online}>Partager</Button>
          </div>
        </div>
        <div className="mt-1">
          <Button size="sm" variant="ghost" icon="refresh" disabled={!online || busy === 'regen'}
            onClick={() => setConfirm({
              title: 'Générer un nouveau code ?',
              message: 'L’ancien code ne fonctionnera plus. Les étudiants déjà connectés gardent l’accès ; les nouveaux devront utiliser le nouveau code.',
              label: 'Nouveau code',
              action: () => run('regen', () => ownerApi.regenerateJoinCode(id), 'Nouveau code de classe généré.'),
            })}>
            {busy === 'regen' ? 'Génération…' : 'Renouveler le code'}
          </Button>
        </div>
      </Card>

      <div className="row-between owner-section-heading mt-3">
        <SectionTitle>Matières et liens de publication</SectionTitle>
        <Button size="sm" icon="plus" onClick={() => setShowSubject(true)} disabled={!online}>Nouvelle matière</Button>
      </div>
      <p className="text-secondary text-sm">
        Créez une matière : un lien de publication privé sera généré automatiquement. Transmettez-le à
        l'enseignant concerné.
      </p>

      {subjects.length === 0 ? (
        <Card className="card-flat"><p className="card-sub mb-0">Aucune matière. Créez la première matière de cette classe.</p></Card>
      ) : (
        <div className="stack">
          {subjects.map((s) => {
            const link = s.link;
            const revoked = !link || link.status !== 'active';
            return (
              <Card key={s.id} className={`admin-subject ${revoked ? 'revoked' : ''}`}>
                <div className="row-between wrap">
                  <div className="grow">
                    <div className="card-title">{s.name}</div>
                    {s.description && <p className="card-sub">{s.description}</p>}
                    <div className="row wrap mt-1" style={{ gap: 8 }}>
                      <Badge tone="blue">{s.document_count} document{s.document_count > 1 ? 's' : ''}</Badge>
                      {link && link.status === 'active' ? (
                        <Badge tone="green">Lien actif ···{link.token_hint}</Badge>
                      ) : (
                        <Badge tone="gray">Aucun lien actif</Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="admin-actions">
                  {link && link.status === 'active' && (
                    <>
                      <Button size="sm" variant="outline" icon="refresh" disabled={!online || busy === `rot-${s.id}`}
                        onClick={() => setConfirm({
                          title: 'Générer un nouveau lien ?',
                          message: 'L’ancien lien sera révoqué. L’enseignant devra utiliser le nouveau lien pour publier.',
                          label: 'Nouveau lien',
                          action: async () => {
                            setBusy(`rot-${s.id}`);
                            try {
                              const result = await ownerApi.rotateLink(s.id);
                              setLinkInfo({ token: result.link.token, subjectName: s.name, rotated: true });
                              toast('Nouveau lien généré. L’ancien lien est révoqué.', 'success');
                              await load();
                            } catch (err) {
                              toast(friendlyError(err), 'error');
                            } finally {
                              setBusy('');
                              setConfirm(null);
                            }
                          },
                        })}>
                        Nouveau lien
                      </Button>
                      <Button size="sm" variant="danger-soft" icon="x" disabled={!online || busy === `rev-${s.id}`}
                        onClick={() => setConfirm({
                          title: 'Révoquer le lien ?',
                          message: 'L’enseignant ne pourra plus publier avec ce lien. Les documents déjà publiés restent disponibles.',
                          label: 'Révoquer',
                          danger: true,
                          action: () => run(`rev-${s.id}`, () => ownerApi.revokeLink(s.id), 'Lien révoqué.'),
                        })}>
                        Révoquer
                      </Button>
                    </>
                  )}
                  {(!link || link.status !== 'active') && (
                    <Button size="sm" variant="outline" icon="link" disabled={!online || busy === `rot-${s.id}`}
                      onClick={async () => {
                        setBusy(`rot-${s.id}`);
                        try {
                          const result = await ownerApi.rotateLink(s.id);
                          setLinkInfo({ token: result.link.token, subjectName: s.name, rotated: false });
                          await load();
                        } catch (err) {
                          toast(friendlyError(err), 'error');
                        } finally {
                          setBusy('');
                        }
                      }}>
                      Générer un lien
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" icon="edit" disabled={!online} onClick={() => setEditSubject(s)}>Modifier</Button>
                  <Button size="sm" variant="ghost" icon="trash" disabled={!online}
                    onClick={() => setConfirm({
                      title: 'Supprimer la matière ?',
                      message: `« ${s.name} » et tous ses documents (${s.document_count}) seront définitivement supprimés.`,
                      label: 'Supprimer',
                      danger: true,
                      action: () => run(`del-${s.id}`, async () => {
                        const result = await ownerApi.deleteSubject(s.id);
                        await purgeFiles(result.file_paths || []);
                      }, 'Matière supprimée.'),
                    })}>
                    Supprimer
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="row-between owner-section-heading mt-3">
        <SectionTitle>Documents publiés</SectionTitle>
        {subjects.length > 0 && (
          <select className="select" style={{ width: 'auto', minHeight: 38, padding: '6px 36px 6px 12px', fontSize: '0.85rem' }}
            value={docFilter || ''} onChange={(e) => setDocFilter(e.target.value || null)} aria-label="Filtrer par matière">
            <option value="">Toutes les matières</option>
            {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>
      {docs.length === 0 ? (
        <Card className="card-flat"><p className="card-sub mb-0">Aucun document publié pour le moment.</p></Card>
      ) : (
        <div>
          {docs.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              onClick={() => viewDoc(doc)}
              trailing={
                <span className="row" style={{ gap: 4 }}>
                  <span className="btn btn-ghost btn-sm" style={{ minHeight: 34, padding: '6px 10px' }} title="Consulter">
                    <Icon name="eye" size={17} />
                  </span>
                  <span
                    className="btn btn-ghost btn-sm"
                    style={{ minHeight: 34, padding: '6px 10px', color: 'var(--danger)' }}
                    title="Supprimer"
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirm({
                        title: 'Supprimer le document ?',
                        message: `« ${doc.title} » sera définitivement supprimé, ainsi que son fichier.`,
                        label: 'Supprimer',
                        danger: true,
                        action: () => run(`deldoc-${doc.id}`, async () => {
                          const result = await ownerApi.deleteDocument(doc.id);
                          await purgeFiles([result.file_path].filter(Boolean));
                        }, 'Document supprimé et fichier retiré du stockage.'),
                      });
                    }}
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.click()}
                  >
                    <Icon name="trash" size={17} />
                  </span>
                </span>
              }
            />
          ))}
        </div>
      )}

      <SectionTitle>Gestion de l'espace</SectionTitle>
      <Card className="card-flat">
        <div className="stack" style={{ gap: 10 }}>
          <Button variant="outline" block icon={classroom.is_archived ? 'refresh' : 'archive'} disabled={!online || busy === 'archive'}
            onClick={() => run('archive', () => ownerApi.archiveClassroom(id, !classroom.is_archived), classroom.is_archived ? 'Classe réactivée.' : 'Classe fermée : les étudiants n’y ont plus accès.')}>
            {classroom.is_archived ? 'Réactiver la classe' : 'Fermer la classe'}
          </Button>
          <Button variant="danger-soft" block icon="trash" disabled={!online}
            onClick={() => setConfirm({
              title: 'Supprimer définitivement la classe ?',
              message: `« ${classroom.class_name} », ses matières, ses documents et tous les fichiers seront définitivement supprimés. Cette action est irréversible.`,
              label: 'Supprimer la classe',
              danger: true,
              action: () => run('delclass', async () => {
                const result = await ownerApi.deleteClassroom(id);
                await purgeFiles(result.file_paths || []);
                navigate('/responsable');
              }, 'Classe supprimée.'),
            })}>
            Supprimer la classe
          </Button>
        </div>
      </Card>

      {/* ---- modales ---- */}
      <SubjectModal
        open={showSubject || Boolean(editSubject)}
        subject={editSubject}
        classroomId={id}
        onClose={() => { setShowSubject(false); setEditSubject(null); }}
        onDone={async (result, isEdit) => {
          setShowSubject(false);
          setEditSubject(null);
          if (isEdit) {
            toast('Matière mise à jour.', 'success');
          } else {
            setLinkInfo({ token: result.link.token, subjectName: result.subject.name, rotated: false });
            toast('Matière créée. Partagez le lien avec l’enseignant.', 'success');
          }
          await load();
        }}
      />

      <LinkModal info={linkInfo} onClose={() => setLinkInfo(null)} onCopy={copyText} onShare={shareText} />

      <ConfirmModal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm?.action()}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        confirmLabel={confirm?.label || 'Confirmer'}
        danger={confirm?.danger}
        busy={Boolean(busy)}
      />

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

// ------------------------------------------------------------------ matière
function SubjectModal({ open, subject, classroomId, onClose, onDone }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isEdit = Boolean(subject);

  useEffect(() => {
    setName(subject?.name || '');
    setDescription(subject?.description || '');
    setError('');
  }, [subject, open]);

  const submit = async (e) => {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError('Le nom de la matière est requis (2 caractères minimum).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      // Le contexte de classe est récupéré depuis l'espace parent via l'API.
      const result = isEdit
        ? await ownerApi.updateSubject(subject.id, name.trim(), description.trim())
        : await ownerApi.createSubject(classroomId, name.trim(), description.trim());
      onDone(result, isEdit);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Modifier la matière' : 'Nouvelle matière'}>
      <form onSubmit={submit}>
        <Field label="Nom de la matière" htmlFor="subj-name">
          <Input id="subj-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Programmation orientée objet" />
        </Field>
        <Field label="Description (facultative)" htmlFor="subj-desc">
          <Textarea id="subj-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex. : Cours, TD et corrigés de POO" />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        {!isEdit && (
          <Notice tone="info">
            Un lien de publication privé sera généré automatiquement. Il ne sera affiché qu'une seule fois.
          </Notice>
        )}
        <div className="btn-row mt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button type="submit" icon={isEdit ? 'check' : 'plus'} disabled={busy}>
            {busy ? 'En cours…' : isEdit ? 'Enregistrer' : 'Créer la matière'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ lien de publication
function LinkModal({ info, onClose, onCopy, onShare }) {
  if (!info) return null;
  const url = publishUrl(info.token);
  return (
    <Modal open onClose={onClose} title={info.rotated ? 'Nouveau lien de publication' : 'Lien de publication'}>
      <Notice tone="warning">
        Ce lien n'est affiché qu'une seule fois. Copiez-le maintenant pour l'envoyer à l'enseignant.
      </Notice>
      <p className="text-secondary text-sm">
        Matière : <strong>{info.subjectName}</strong>. Toute personne disposant de ce lien peut publier
        des documents dans cette matière.
      </p>
      <div className="link-box">{url}</div>
      <div className="btn-row mt-2">
        <Button icon="copy" onClick={() => onCopy(url, 'Lien copié.')}>Copier le lien</Button>
        <Button variant="outline" icon="share" onClick={() => onShare(`Publier — ${info.subjectName}`, `Lien de publication Tchatz Klassio pour la matière « ${info.subjectName} » :`, url)}>
          Partager
        </Button>
      </div>
      <div className="mt-2">
        <Button variant="ghost" block onClick={onClose}>J'ai copié le lien</Button>
      </div>
    </Modal>
  );
}
