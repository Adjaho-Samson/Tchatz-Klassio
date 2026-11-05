import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import { BackLink, Button, Card, Icon, Notice, SectionTitle } from '../components/UI.jsx';
import { trackEvent } from '../lib/analytics.js';

export default function Install() {
  const { installPrompt, installed, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);
  const isStandalone = installed || window.matchMedia('(display-mode: standalone)').matches;

  const install = async () => {
    if (!installPrompt) return;
    trackEvent('install_click');
    setBusy(true);
    try {
      installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') toast('Application installée.', 'success');
    } catch {
      /* installation annulée */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <BackLink to="/" />
      <h1>Télécharger l'application</h1>
      <p className="text-secondary">
        Installez Tchatz Klassio sur votre appareil pour un accès rapide et la consultation hors
        connexion de vos documents.
      </p>

      {isStandalone ? (
        <Notice tone="success" icon="check">
          L'application est déjà installée sur cet appareil. Vous utilisez la version installée.
        </Notice>
      ) : (
        <Card className="mb-2">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <span className="file-badge tone-blue"><Icon name="phone" size={22} /></span>
            <div className="grow">
              <div className="card-title">Application web (recommandé)</div>
              <p className="card-sub">
                S'installe en un geste, sur Android, iPhone et ordinateur. Fonctionne hors connexion
                avec vos documents téléchargés.
              </p>
              {installPrompt ? (
                <Button icon="download" onClick={install} disabled={busy}>
                  {busy ? 'Installation…' : 'Installer l’application'}
                </Button>
              ) : isIOS ? (
                <Notice tone="info" icon="info">
                  Sur iPhone/iPad : ouvrez le menu <strong>Partager</strong> de Safari, puis
                  choisissez <strong>« Sur l'écran d'accueil »</strong>.
                </Notice>
              ) : (
                <Notice tone="info" icon="info">
                  {isAndroid
                    ? 'Dans le menu de votre navigateur, choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil ».'
                    : 'Dans la barre d’adresse de votre navigateur, cliquez sur l’icône d’installation (ou menu → Installer Tchatz Klassio).'}
                </Notice>
              )}
            </div>
          </div>
        </Card>
      )}

      <SectionTitle>Application Android (APK)</SectionTitle>
      <Card className="card-flat">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <span className="file-badge tone-green"><Icon name="phone" size={22} /></span>
          <div className="grow">
            <div className="card-title">Tchatz Klassio pour Android</div>
            <p className="card-sub">
              L'application Android native (version 1.0.0). Téléchargez le fichier APK et ouvrez-le
              sur votre téléphone Android pour l'installer.
            </p>
            <a className="btn btn-navy" href="./klassio.apk" download="Tchatz-Klassio.apk" onClick={() => trackEvent('install_click')}>
              <Icon name="download" /> Télécharger l'APK Android
            </a>
            <p className="text-sm text-muted mt-1">
              Android 8.0 ou plus récent. Autorisez « sources inconnues » si votre téléphone le
              demande. Même compte et mêmes classes que sur le site.
            </p>
          </div>
        </div>
      </Card>

      <SectionTitle>Pourquoi installer l'application ?</SectionTitle>
      <div className="steps">
        <Card className="step-card">
          <div className="step-num"><Icon name="wifiOff" size={18} /></div>
          <h3 className="card-title">Hors connexion</h3>
          <p className="card-sub">Vos documents téléchargés restent consultables sans réseau.</p>
        </Card>
        <Card className="step-card">
          <div className="step-num"><Icon name="bell" size={18} /></div>
          <h3 className="card-title">Alertes</h3>
          <p className="card-sub">Soyez prévenu dès qu'un nouveau document est publié dans votre classe.</p>
        </Card>
        <Card className="step-card">
          <div className="step-num"><Icon name="sparkles" size={18} /></div>
          <h3 className="card-title">Accès rapide</h3>
          <p className="card-sub">Une icône sur votre écran d'accueil, comme une vraie application.</p>
        </Card>
      </div>
    </div>
  );
}
