# Tchatz Klassio

**Tous les documents de ta classe, organisés au même endroit.**

Tchatz Klassio est un outil de partage de documents pédagogiques : un **responsable**
crée un espace de classe, les **étudiants** le rejoignent avec un simple code (sans
compte), et les **enseignants** publient leurs supports via un lien privé. Cours, TD
et exercices sont retrouvés par matière, sans groupes WhatsApp.

Une solution de Tchatz — Samson Adjaho.

## Contenu du dépôt

| Élément | Description |
|---|---|
| `web/` | Le **site web + application installable (PWA)**, en React + Vite, connecté au backend Supabase. |
| `web/public/klassio.apk` | L'**application Android** native, reconstruite et signée, téléchargeable depuis le site. |
| `tools/build_apk.py` | Script qui reconstruit et signe l'APK (v1 + v2) à partir des fichiers Android extraits. |
| `AndroidManifest.xml`, `classes*.dex`, `res/`, `resources.arsc`, … | Fichiers extraits de l'application Android d'origine (source de l'APK). |

## Trois rôles, trois accès

- **Étudiant** — rejoint avec le code de classe. Aucun email, ni téléphone, ni mot de
  passe. Consulte et télécharge les documents, les garde hors connexion.
- **Responsable** — crée un compte, gère ses classes, matières, codes et liens de
  publication. Ferme ou supprime un espace à tout moment.
- **Enseignant** — publie un document via le lien privé de sa matière, sans compte.

## Lisibilité et confidentialité

Le site a été conçu pour la **lisibilité** : police Inter, corps de texte de 16 px,
interlignage généreux, contrastes élevés (texte principal ≈ 12:1), thème clair/sombre,
cibles tactiles confortables. Il n'affiche **que ce que l'utilisateur doit voir** :
aucun code d'erreur technique, aucune clé interne, aucun identifiant brut — les
messages sont en français, clairs et adaptés à chaque rôle. Les espaces sont cloisonnés
(session étudiante par code, compte responsable, lien de publication privé).

## Démarrer le site

```bash
cd web
npm install
npm run dev        # développement (http://localhost:5173)
npm run build      # build de production dans web/dist
npm run preview    # prévisualisation du build (http://localhost:4173)
```

## Déployer

Le site est statique (routage par `#`), déployable tel quel sur **Vercel**, Netlify ou
GitHub Pages :

- **Vercel** : importer le dépôt, définir le répertoire racine sur `web/`. Vercel
  détecte Vite (`npm run build`, sortie `dist`). Aucune règle de réécriture n'est
  nécessaire grâce au routage par ancre.
- L'APK Android est servi depuis `web/public/klassio.apk` et proposé au téléchargement
  sur la page « Télécharger l'application » (`#/installer`).

## Backend

Le backend est un projet **Supabase** (PostgreSQL + Auth + Storage + Edge Function).
La sécurité repose sur des fonctions PostgreSQL (`api_*`) et des règles d'accès (RLS) ;
la clé « publishable » côté client est publique par conception. La clé `service_role`
reste uniquement côté serveur (Edge Function) et n'est jamais exposée.

## Régénérer l'APK Android

```bash
python3 tools/build_apk.py
```

Le script réassemble le ZIP (alignement des ressources et bibliothèques natives),
passe `debuggable` à `false`, signe en v1 + v2 avec une clé auto-signée
(`tools/klassio-signing.pem`, à conserver pour les mises à jour) et vérifie le résultat.
