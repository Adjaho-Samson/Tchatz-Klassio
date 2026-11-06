import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import { supabase, friendlyError } from '../lib/api.js';
import { BackLink, Button, Card, Field, Icon, Input, Notice } from '../components/UI.jsx';
import OwnerDashboard from './OwnerDashboard.jsx';

export default function OwnerAuth() {
  const { ownerSession, authReady, toast } = useApp();
  const [mode, setMode] = useState('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  if (authReady && ownerSession) {
    return <OwnerDashboard />;
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      if (mode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
        toast('Connexion réussie.', 'success');
      } else if (mode === 'signup') {
        if (fullName.trim().length < 2) {
          setError('Indiquez votre nom complet.');
          setBusy(false);
          return;
        }
        const { data, error: err } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { full_name: fullName.trim() } },
        });
        if (err) throw err;
        if (!data.session) {
          setInfo('Compte créé. Une confirmation par email est requise avant la connexion.');
          setMode('signin');
        } else {
          toast('Compte créé. Bienvenue sur Tchatz Klassio.', 'success');
        }
      } else if (mode === 'reset') {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}${window.location.pathname}`,
        });
        if (err) throw err;
        setInfo('Si un compte correspond à cette adresse, un email de réinitialisation a été envoyé. Vérifiez aussi les courriers indésirables.');
        setMode('signin');
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <BackLink to="/" />
      <h1>Espace responsable</h1>
      <p className="text-secondary">
        Gérez vos classes, matières et liens de publication. Seuls les responsables possèdent un
        compte. Les étudiants accèdent par code et les enseignants publient par lien.
      </p>

      <Card className="mt-2">
        {mode !== 'reset' && (
          <div className="tabs">
            <button type="button" className={`tab ${mode === 'signin' ? 'active' : ''}`} onClick={() => { setMode('signin'); setError(''); }}>
              Se connecter
            </button>
            <button type="button" className={`tab ${mode === 'signup' ? 'active' : ''}`} onClick={() => { setMode('signup'); setError(''); }}>
              Créer un compte
            </button>
          </div>
        )}

        <form onSubmit={submit}>
          {mode === 'signup' && (
            <Field label="Nom complet" htmlFor="owner-name">
              <Input id="owner-name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Votre nom" autoComplete="name" />
            </Field>
          )}
          <Field label="Adresse email" htmlFor="owner-email">
            <Input id="owner-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" autoComplete="email" required />
          </Field>
          {mode !== 'reset' && (
            <Field label="Mot de passe" htmlFor="owner-password" hint={mode === 'signup' ? '6 caractères minimum.' : undefined}>
              <Input id="owner-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={6} />
            </Field>
          )}

          {error && <Notice tone="error">{error}</Notice>}
          {info && <Notice tone="success">{info}</Notice>}

          <Button type="submit" block icon={mode === 'signup' ? 'plus' : 'lock'} disabled={busy}>
            {busy ? 'Connexion…' : mode === 'signin' ? 'Se connecter' : mode === 'signup' ? 'Créer mon compte' : 'Envoyer le lien'}
          </Button>

          {mode === 'signin' && (
            <button type="button" className="btn btn-ghost btn-block mt-1" onClick={() => { setMode('reset'); setError(''); setInfo(''); }}>
              Mot de passe oublié ?
            </button>
          )}
          {mode === 'reset' && (
            <button type="button" className="btn btn-ghost btn-block mt-1" onClick={() => { setMode('signin'); setError(''); setInfo(''); }}>
              Retour à la connexion
            </button>
          )}
        </form>
      </Card>

      <div className="mt-3">
        <Card className="card-flat">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Icon name="shield" className="text-muted" />
            <p className="card-sub mb-0">
              Votre compte ne sert qu'à gérer vos espaces de classe. Les étudiants n'ont jamais besoin
              de compte : ils rejoignent avec le code de la classe.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
