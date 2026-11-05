// Tchatz Klassio — configuration publique.
// L'URL et la clé « publishable » de Supabase sont conçues pour être publiques :
// la sécurité repose sur les règles d'accès (RLS) et les fonctions du serveur,
// jamais sur le secret de cette clé. Aucune clé service_role n'est utilisée ici.
export const SUPABASE_URL = 'https://hohxfwemcvpvtqnwwvds.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_yjOOCQ0FYRA993w5vu2hKg_gPEJlN9H';

export const APP_NAME = 'Tchatz Klassio';
export const APP_VERSION = '1.0.0';
export const APP_TAGLINE = 'Une solution de Tchatz — Samson Adjaho';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 Mo
export const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'jpg', 'jpeg', 'png'];

export const LEVEL_OPTIONS = [
  'Licence 1',
  'Licence 2',
  'Licence 3',
  'Master 1',
  'Master 2',
  'Doctorat',
  'BTS 1',
  'BTS 2',
  'Classe préparatoire',
];

// Le serveur n'accepte que les niveaux de base (Licence, Master, BTS, DUT,
// Doctorat, Autre) et stocke l'année d'étude à part. On convertit donc le
// libellé choisi (« Licence 2 ») en { level: 'Licence', studyYear: '2' }.
const CANONICAL_LEVELS = { licence: 'Licence', master: 'Master', bts: 'BTS', dut: 'DUT', doctorat: 'Doctorat' };

export function parseLevel(label) {
  const text = String(label || '').trim();
  const match = text.match(/^(Licence|Master|BTS|DUT|Doctorat)(?:\s+(\d+))?$/i);
  if (match) {
    return { level: CANONICAL_LEVELS[match[1].toLowerCase()], studyYear: match[2] || '1' };
  }
  // « Classe préparatoire » ou autre : rangé dans « Autre », libellé conservé.
  return { level: 'Autre', studyYear: text || '1' };
}
