import React from 'react';
import { BackLink, Card, SectionTitle } from '../components/UI.jsx';

export default function Privacy() {
  return (
    <div className="container">
      <BackLink to="/" />
      <h1>Confidentialité et conditions</h1>
      <p className="text-secondary">
        Tchatz Klassio est conçu pour protéger la vie privée des étudiants et rester simple pour
        tout le monde. Voici comment vos données sont traitées.
      </p>

      <SectionTitle>Étudiants</SectionTitle>
      <Card className="card-flat">
        <p>
          <strong>Aucun compte n'est demandé.</strong> Tchatz Klassio ne demande ni email, ni numéro
          de téléphone, ni mot de passe à l'étudiant. L'accès se fait uniquement avec le code de la
          classe.
        </p>
        <p>
          La classe rejointe est enregistrée sur votre appareil (stockage local du navigateur). Un
          identifiant technique anonyme de l'appareil peut être enregistré pour vous envoyer des
          alertes de nouveaux documents ; il ne contient aucune donnée personnelle.
        </p>
        <p className="mb-0">
          En cas de réinstallation ou de changement d'appareil, ressaisissez simplement le code de la
          classe. Vous pouvez retirer une classe de votre appareil à tout moment depuis les
          paramètres.
        </p>
      </Card>

      <SectionTitle>Responsables de classe</SectionTitle>
      <Card className="card-flat">
        <p>
          Le responsable crée un compte avec une adresse email et un mot de passe. Ces informations
          servent uniquement à sécuriser l'accès à la gestion de ses espaces de classe.
        </p>
        <p className="mb-0">
          Le responsable est responsable des documents qu'il publie ou fait publier. Il peut fermer,
          rouvrir ou supprimer un espace, ainsi que les matières et documents associés, à tout moment.
        </p>
      </Card>

      <SectionTitle>Documents et enseignants</SectionTitle>
      <Card className="card-flat">
        <p>
          Les documents sont stockés dans un espace privé. Leur consultation passe par des liens
          temporaires et sécurisés. Les enseignants publient via un lien privé, sans compte ; le nom
          affiché est celui qu'ils renseignent eux-mêmes.
        </p>
        <p className="mb-0">
          Les liens de publication peuvent être révoqués ou renouvelés par le responsable. La
          suppression d'un document retire également son fichier du stockage.
        </p>
      </Card>

      <SectionTitle>Conditions d'utilisation</SectionTitle>
      <Card className="card-flat">
        <p>
          Tchatz Klassio est un outil de partage pédagogique. En l'utilisant, vous vous engagez à ne
          publier que des documents destinés à la classe concernée et à respecter les droits d'auteur.
        </p>
        <p className="mb-0">
          Le service est fourni « tel quel », sans garantie de disponibilité permanente. Conservez
          toujours une copie de vos documents importants.
        </p>
      </Card>

      <p className="text-sm text-muted mt-3 text-center">
        Tchatz Klassio · Une solution de Tchatz — Samson Adjaho.
      </p>
    </div>
  );
}
