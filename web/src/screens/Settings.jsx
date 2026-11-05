import React, { useState } from 'react';
import { useApp, navigate } from '../App.jsx';
import { studentApi, friendlyError } from '../lib/api.js';
import * as store from '../lib/store.js';
import { Button, Card, ConfirmModal, Icon, LinkButton, Notice, SectionTitle, Select, Switch } from '../components/UI.jsx';
import { APP_VERSION } from '../lib/config.js';
import { formatDate } from '../lib/format.js';

export default function Settings() {
  const { settings, updateSettings, sessions, activeSession, setActiveToken, leaveClassroom, toast, online, installed } = useApp();
  const [confirmLeave, setConfirmLeave] = useState(null);

  const toggleNotifications = async (enabled) => {
    updateSettings({ notifications: enabled });
    if (enabled && 'Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch {
        /* refus */
      }
    }
    if (activeSession && online) {
      try {
        await studentApi.setNotifications(activeSession.token, store.deviceId(), enabled);
      } catch {
        /* préférence locale conservée */
      }
    }
    toast(enabled ? 'Alertes activées.' : 'Alertes désactivées.', 'success');
  };

  return (
    <div className="container">
      <h1 style={{ fontSize: '1.5rem' }}>Paramètres</h1>

      <SectionTitle>Préférences</SectionTitle>
      <Card className="card-flat">
        <div className="row-between">
          <div className="grow">
            <div className="card-title">Alertes nouveaux documents</div>
            <p className="card-sub">Recevoir une alerte lorsqu'un nouveau document est publié (application ouverte).</p>
          </div>
          <Switch checked={settings.notifications} onChange={toggleNotifications} label="Alertes nouveaux documents" />
        </div>
        <div className="divider" />
        <div className="row-between">
          <div className="grow">
            <div className="card-title">Mesure d'audience anonyme</div>
            <p className="card-sub">Compter les visites du site, sans cookie ni donnée personnelle.</p>
          </div>
          <Switch checked={settings.analytics !== false} onChange={(v) => updateSettings({ analytics: v })} label="Mesure d'audience anonyme" />
        </div>
        <div className="divider" />
        <div className="row-between">
          <div className="grow">
            <div className="card-title">Apparence</div>
            <p className="card-sub">Thème de l'application.</p>
          </div>
          <Select
            value={settings.theme}
            onChange={(e) => updateSettings({ theme: e.target.value })}
            style={{ width: 150 }}
            aria-label="Thème"
          >
            <option value="system">Système</option>
            <option value="light">Clair</option>
            <option value="dark">Sombre</option>
          </Select>
        </div>
      </Card>

      <SectionTitle>Mes classes</SectionTitle>
      {sessions.length === 0 ? (
        <Card className="card-flat">
          <p className="card-sub mb-0">
            Aucune classe rejointe. <a href="#/rejoindre">Rejoindre une classe</a>.
          </p>
        </Card>
      ) : (
        <div className="stack">
          {sessions.map((s) => (
            <Card key={s.token} className="card-flat" style={{ padding: 16 }}>
              <div className="row-between wrap">
                <div className="grow">
                  <div className="card-title">
                    {s.classroom?.class_name}
                    {activeSession?.token === s.token && <span className="badge badge-blue" style={{ marginLeft: 8 }}>Active</span>}
                  </div>
                  <p className="card-sub">
                    {s.classroom?.institution_name} · Rejointe le {formatDate(s.joinedAt)}
                  </p>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {activeSession?.token !== s.token && (
                    <Button size="sm" variant="outline" onClick={() => { setActiveToken(s.token); navigate('/classe'); }}>
                      Ouvrir
                    </Button>
                  )}
                  <Button size="sm" variant="danger-soft" icon="logout" onClick={() => setConfirmLeave(s)}>
                    Quitter
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle>Application</SectionTitle>
      <Card className="card-flat">
        <div className="stack" style={{ gap: 0 }}>
          {!installed && (
            <a href="#/installer" className="doc-row" style={{ border: 'none', padding: '12px 0' }}>
              <Icon name="download" className="text-muted" />
              <span className="grow doc-title" style={{ fontSize: '0.95rem' }}>Installer l'application</span>
              <Icon name="chevronRight" className="doc-chevron" />
            </a>
          )}
          <a href="#/confidentialite" className="doc-row" style={{ border: 'none', padding: '12px 0' }}>
            <Icon name="shield" className="text-muted" />
            <span className="grow">
              <span className="doc-title" style={{ fontSize: '0.95rem' }}>Confidentialité et conditions</span>
              <span className="doc-meta">Consulter la politique de confidentialité et les conditions d'utilisation.</span>
            </span>
            <Icon name="chevronRight" className="doc-chevron" />
          </a>
        </div>
      </Card>

      <Card className="card-flat mt-2">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <Icon name="info" className="text-muted" />
          <div>
            <div className="card-title">Tchatz Klassio · Version {APP_VERSION}</div>
            <p className="card-sub mb-0">Une solution de Tchatz — Samson Adjaho.</p>
          </div>
        </div>
      </Card>

      <ConfirmModal
        open={Boolean(confirmLeave)}
        onClose={() => setConfirmLeave(null)}
        onConfirm={() => {
          leaveClassroom(confirmLeave.token);
          setConfirmLeave(null);
          toast('Classe retirée de cet appareil.');
        }}
        title="Quitter la classe ?"
        message={`« ${confirmLeave?.classroom?.class_name} » sera retirée de cet appareil. Les documents téléchargés resteront disponibles. Vous pourrez rejoindre à nouveau avec le code.`}
        confirmLabel="Quitter la classe"
        danger
      />
    </div>
  );
}
