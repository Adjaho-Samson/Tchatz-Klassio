import React, { useCallback, useEffect, useState } from 'react';
import { useApp, navigate } from '../App.jsx';
import { ownerApi, adminApi, supabase, friendlyError } from '../lib/api.js';
import { defaultAcademicYear } from '../lib/format.js';
import { LEVEL_OPTIONS, parseLevel } from '../lib/config.js';
import { Badge, Button, Card, EmptyState, Field, Icon, Input, Loading, Modal, Notice, Select, SectionTitle } from '../components/UI.jsx';

export default function OwnerDashboard() {
  const { ownerSession, toast, online } = useApp();
  const [classrooms, setClassrooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!ownerSession) return;
    adminApi.isAdmin().then((v) => setIsAdmin(Boolean(v))).catch(() => {});
  }, [ownerSession]);

  const user = ownerSession?.user;
  const displayName = user?.user_metadata?.full_name || user?.email || 'Responsable';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await ownerApi.listClassrooms();
      setClassrooms(Array.isArray(result) ? result : []);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (online) load();
    else setLoading(false);
  }, [load, online]);

  const signOut = async () => {
    await supabase.auth.signOut();
    toast('Déconnecté.');
    navigate('/');
  };

  return (
    <div className="container">
      <div className="row-between wrap mb-2">
        <div>
          <h1 className="mb-0" style={{ fontSize: '1.5rem' }}>Tableau de bord</h1>
          <p className="text-secondary mb-0">Bonjour, {displayName}</p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {isAdmin && (
            <Button variant="outline" size="sm" icon="grid" onClick={() => navigate('/statistiques')}>
              Statistiques
            </Button>
          )}
          <Button variant="outline" size="sm" icon="logout" onClick={signOut}>
            Se déconnecter
          </Button>
        </div>
      </div>

      {!online && <Notice tone="warning" icon="wifiOff">Pas de connexion. Les données se chargeront au retour du réseau.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}

      <div className="row-between mt-2">
        <SectionTitle>Mes espaces de classe</SectionTitle>
        <Button size="sm" icon="plus" onClick={() => setShowCreate(true)} disabled={!online}>
          Nouvelle classe
        </Button>
      </div>

      {loading ? (
        <Loading label="Chargement de vos classes…" />
      ) : classrooms.length === 0 ? (
        <EmptyState
          icon="cap"
          title="Aucune classe"
          action={<Button icon="plus" onClick={() => setShowCreate(true)} disabled={!online}>Créer un espace de classe</Button>}
        >
          Créez votre premier espace de classe pour générer un code étudiant.
        </EmptyState>
      ) : (
        <div className="stack">
          {classrooms.map((c) => (
            <button key={c.id} type="button" className="doc-row" onClick={() => navigate(`/responsable/espace/${c.id}`)}>
              <span className="file-badge tone-blue"><Icon name="cap" size={22} /></span>
              <span className="doc-info">
                <span className="doc-title">
                  {c.class_name}
                  {c.is_archived && <Badge tone="orange">Fermée</Badge>}
                </span>
                <span className="doc-meta">
                  <span>{c.institution_name}</span>
                  <span>{c.level}</span>
                  <span>{c.academic_year}</span>
                </span>
                <span className="doc-meta mt-1">
                  <span>{c.subject_count} matière{c.subject_count > 1 ? 's' : ''}</span>
                  <span>{c.document_count} document{c.document_count > 1 ? 's' : ''}</span>
                  <span className="mono">Code : {c.join_code}</span>
                </span>
              </span>
              <Icon name="chevronRight" className="doc-chevron" />
            </button>
          ))}
        </div>
      )}

      <CreateClassroomModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(result) => {
          setShowCreate(false);
          toast('Classe créée avec succès.', 'success');
          load();
          navigate(`/responsable/espace/${result.id}`);
        }}
      />
    </div>
  );
}

function CreateClassroomModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    className: '',
    institutionName: '',
    fieldOfStudy: '',
    level: LEVEL_OPTIONS[0],
    academicYear: defaultAcademicYear(),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.className.trim() || !form.institutionName.trim() || !form.fieldOfStudy.trim()) {
      setError('Renseignez le nom de la classe, l’établissement et la filière.');
      return;
    }
    if (!/^\d{4}-\d{4}$/.test(form.academicYear.trim())) {
      setError('L’année académique doit être au format 2025-2026.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { level, studyYear } = parseLevel(form.level);
      const result = await ownerApi.createClassroom({
        className: form.className.trim(),
        institutionName: form.institutionName.trim(),
        fieldOfStudy: form.fieldOfStudy.trim(),
        level,
        studyYear,
        academicYear: form.academicYear.trim(),
      });
      onCreated(result);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nouvelle classe">
      <form onSubmit={submit}>
        <Field label="Nom de la classe" htmlFor="cc-name">
          <Input id="cc-name" value={form.className} onChange={set('className')} placeholder="Ex. : Licence 3 SIL" />
        </Field>
        <Field label="Établissement" htmlFor="cc-inst">
          <Input id="cc-inst" value={form.institutionName} onChange={set('institutionName')} placeholder="Ex. : ESM Bénin" />
        </Field>
        <Field label="Filière" htmlFor="cc-field">
          <Input id="cc-field" value={form.fieldOfStudy} onChange={set('fieldOfStudy')} placeholder="Ex. : Systèmes Informatiques et Logiciels" />
        </Field>
        <div className="row" style={{ gap: 12 }}>
          <div className="grow">
            <Field label="Niveau" htmlFor="cc-level">
              <Select id="cc-level" value={form.level} onChange={set('level')}>
                {LEVEL_OPTIONS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grow">
            <Field label="Année académique" htmlFor="cc-year">
              <Input id="cc-year" value={form.academicYear} onChange={set('academicYear')} placeholder="2025-2026" />
            </Field>
          </div>
        </div>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="btn-row mt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>Annuler</Button>
          <Button type="submit" icon="plus" disabled={busy}>{busy ? 'Création…' : 'Créer'}</Button>
        </div>
      </form>
    </Modal>
  );
}
