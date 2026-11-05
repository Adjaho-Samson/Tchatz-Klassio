import React, { useState } from 'react';
import { useApp, navigate } from '../App.jsx';
import { supabase, friendlyError } from '../lib/api.js';
import { BackLink, Button, Card, Field, Input, Notice } from '../components/UI.jsx';

export default function ResetPassword() {
  const { ownerSession, toast } = useApp();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('Mot de passe trop faible (6 caractères minimum).');
      return;
    }
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      toast('Mot de passe mis à jour.', 'success');
      navigate('/responsable');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <BackLink to="/responsable" />
      <h1>Nouveau mot de passe</h1>
      {ownerSession ? (
        <>
          <p className="text-secondary">Choisissez un nouveau mot de passe pour votre compte responsable.</p>
          <Card>
            <form onSubmit={submit}>
              <Field label="Nouveau mot de passe" htmlFor="new-pass" hint="6 caractères minimum.">
                <Input id="new-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={6} />
              </Field>
              <Field label="Confirmer le mot de passe" htmlFor="confirm-pass">
                <Input id="confirm-pass" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={6} />
              </Field>
              {error && <Notice tone="error">{error}</Notice>}
              <Button type="submit" block icon="lock" disabled={busy}>
                {busy ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
              </Button>
            </form>
          </Card>
        </>
      ) : (
        <Card>
          <Notice tone="info">
            Cette page s'ouvre depuis le lien reçu par email. Si vous n'avez pas reçu de lien,
            utilisez « Mot de passe oublié ? » sur la page de connexion.
          </Notice>
          <Button variant="outline" block onClick={() => navigate('/responsable')}>
            Retour à la connexion
          </Button>
        </Card>
      )}
    </div>
  );
}
