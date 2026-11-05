import React, { useState } from 'react';
import { useApp, navigate } from '../App.jsx';
import { BackLink, Button, Card, Field, Icon, Input, Notice } from '../components/UI.jsx';
import { friendlyError } from '../lib/api.js';

export default function Join() {
  const { joinClassroom, toast, online } = useApp();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const clean = code.replace(/\s/g, '').toUpperCase();
    if (clean.length < 4) {
      setError('Code de classe incomplet.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await joinClassroom(clean);
      toast('Classe rejointe.', 'success');
      navigate('/classe');
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <BackLink to="/" />
      <h1>Rejoindre une classe</h1>
      <p className="text-secondary">
        Saisissez le code de classe fourni par le responsable. Aucun compte n'est nécessaire.
      </p>

      {!online && (
        <Notice tone="warning">
          Pas de connexion internet. Connectez-vous pour rejoindre une classe.
        </Notice>
      )}

      <Card className="mt-2">
        <form onSubmit={submit}>
          <Field label="Code de classe" htmlFor="join-code" hint="8 caractères, fourni par le responsable de la classe.">
            <Input
              id="join-code"
              className="input-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="EXEMPLE1"
              maxLength={12}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              disabled={busy || !online}
            />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" block icon="key" disabled={busy || !online}>
            {busy ? 'Connexion…' : 'Accéder à la classe'}
          </Button>
        </form>
      </Card>

      <div className="mt-3">
        <Card className="card-flat">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Icon name="info" className="text-muted" />
            <p className="card-sub mb-0">
              Tchatz Klassio ne demande ni email, ni numéro de téléphone, ni mot de passe à l'étudiant.
              La classe reste enregistrée sur cet appareil. En cas de réinstallation, ressaisissez
              simplement le code.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
