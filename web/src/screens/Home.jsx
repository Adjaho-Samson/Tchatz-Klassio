import React from 'react';
import { useApp, navigate } from '../App.jsx';
import { Button, Card, Icon, LinkButton, SectionTitle, Badge } from '../components/UI.jsx';
import { plural } from '../lib/format.js';

export default function Home() {
  const { sessions, setActiveToken, installed } = useApp();

  const openClass = (token) => {
    setActiveToken(token);
    navigate('/classe');
  };

  return (
    <div className="container container-wide">
      <section className="hero">
        <div className="hero-kicker">
          <Icon name="cap" size={16} /> Documents de classe, sans désordre
        </div>
        <h1>Tous les documents de ta classe, organisés au même endroit.</h1>
        <p>
          Cours, TD, exercices : retrouvez-les par matière, sans groupes WhatsApp. Un responsable crée
          l'espace, un étudiant le rejoint avec un code, un enseignant publie avec un lien.
        </p>
        <div className="btn-row">
          <LinkButton to="/rejoindre" variant="primary" icon="key">
            Rejoindre une classe
          </LinkButton>
          <LinkButton to="/responsable" variant="outline" icon="shield">
            Espace responsable
          </LinkButton>
        </div>
      </section>

      {sessions.length > 0 && (
        <>
          <SectionTitle>Mes classes</SectionTitle>
          <div className="stack">
            {sessions.map((s) => (
              <button key={s.token} type="button" className="doc-row" onClick={() => openClass(s.token)}>
                <span className="file-badge tone-blue">
                  <Icon name="cap" size={22} />
                </span>
                <span className="doc-info">
                  <span className="doc-title">{s.classroom?.class_name}</span>
                  <span className="doc-meta">
                    <span>{s.classroom?.institution_name}</span>
                    {s.classroom?.level && <span>{s.classroom.level}</span>}
                    {s.classroom?.academic_year && <span>{s.classroom.academic_year}</span>}
                  </span>
                </span>
                <Icon name="chevronRight" className="doc-chevron" />
              </button>
            ))}
          </div>
          <div className="mt-2">
            <LinkButton to="/rejoindre" variant="outline" icon="plus" className="btn-sm">
              Rejoindre une autre classe
            </LinkButton>
          </div>
        </>
      )}

      <SectionTitle>Comment ça marche</SectionTitle>
      <div className="steps">
        <Card className="step-card">
          <div className="step-num">1</div>
          <h3 className="card-title">Le responsable crée l'espace</h3>
          <p className="card-sub">
            Il renseigne la classe et reçoit un code étudiant à partager. Il garde la main sur les
            matières et les liens de publication.
          </p>
        </Card>
        <Card className="step-card">
          <div className="step-num">2</div>
          <h3 className="card-title">L'étudiant rejoint avec un code</h3>
          <p className="card-sub">
            Aucun compte, ni email, ni mot de passe. La classe reste enregistrée sur l'appareil et les
            documents se consultent par matière.
          </p>
        </Card>
        <Card className="step-card">
          <div className="step-num">3</div>
          <h3 className="card-title">L'enseignant publie avec un lien</h3>
          <p className="card-sub">
            Chaque matière a un lien de publication privé. L'enseignant dépose son fichier, il est
            aussitôt disponible pour toute la classe.
          </p>
        </Card>
      </div>

      {!installed && (
        <>
          <SectionTitle>Emporte ta classe partout</SectionTitle>
          <div className="install-banner">
            <span className="file-badge tone-blue">
              <Icon name="phone" size={22} />
            </span>
            <div className="grow">
              <div className="card-title">Installe l'application</div>
              <p className="card-sub">
                Accès rapide depuis ton écran d'accueil, documents consultables hors connexion.
              </p>
            </div>
            <LinkButton to="/installer" variant="primary" className="btn-sm" icon="download">
              Télécharger
            </LinkButton>
          </div>
        </>
      )}

      <div className="mt-3">
        <Card className="card-flat">
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Icon name="shield" className="text-muted" />
            <p className="card-sub mb-0">
              Tchatz Klassio ne demande ni email, ni numéro de téléphone, ni mot de passe à l'étudiant.
              La classe reste enregistrée sur cet appareil. En cas de réinstallation, ressaisissez
              simplement le code.{' '}
              <a href="#/confidentialite">Confidentialité et conditions</a>.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
