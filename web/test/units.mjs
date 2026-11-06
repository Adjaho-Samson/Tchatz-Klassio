// Tests unitaires : conversion des niveaux + traduction des erreurs.
// Vérifie les deux correctifs qui rendaient la création de classe et les
// messages d'erreur inexploitables (« Une erreur est survenue » partout).
import assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Environnement minimal pour l'initialisation du client Supabase.
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
const { window } = dom;
for (const k of ['window', 'document', 'navigator', 'localStorage', 'location', 'crypto']) {
  try {
    Object.defineProperty(global, k, { value: window[k], configurable: true, writable: true });
  } catch { /* certaines globales Node ne sont pas redéfinissables */ }
}
global.fetch = async () => ({ ok: false, status: 500, json: async () => ({}), text: async () => '', headers: new Map() });

await build({
  entryPoints: [join(root, 'test/units-entry.js')],
  bundle: true,
  format: 'esm',
  outfile: join(root, 'test/units-bundle.mjs'),
  loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty' },
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
});

const { parseLevel, friendlyError, errorCode, normalizeAuthCallback } = await import(pathToFileURL(join(root, 'test/units-bundle.mjs')).href);

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log('✓ ' + name);
  } catch (err) {
    failed++;
    console.log('✗ ' + name + ' — ' + err.message);
  }
}

// Les anciens liens peuvent avoir deux fragments, le premier étant la route.
check('lien de récupération avec route et jetons normalisé', () => {
  const result = normalizeAuthCallback('https://example.com/app/#/reinitialiser#access_token=abc&refresh_token=def&type=recovery');
  assert.strictEqual(result.href, 'https://example.com/app/#access_token=abc&refresh_token=def&type=recovery');
  assert.strictEqual(result.recovery, true);
});
check('lien Supabase standard reconnu sans modification', () => {
  const result = normalizeAuthCallback('https://example.com/app/#access_token=abc&refresh_token=def&type=recovery');
  assert.strictEqual(result.changed, false);
  assert.strictEqual(result.recovery, true);
});
check('erreur de lien expiré reconnue et route normale préservée', () => {
  assert.strictEqual(normalizeAuthCallback('https://example.com/#error=access_denied&error_code=otp_expired').recovery, true);
  assert.strictEqual(normalizeAuthCallback('https://example.com/#/responsable').recovery, false);
});

// --- Conversion des niveaux (le serveur n'accepte que les niveaux de base) ---
check('parseLevel("Licence 2") → Licence + 2', () =>
  assert.deepStrictEqual(parseLevel('Licence 2'), { level: 'Licence', studyYear: '2' }));
check('parseLevel("Master 1") → Master + 1', () =>
  assert.deepStrictEqual(parseLevel('Master 1'), { level: 'Master', studyYear: '1' }));
check('parseLevel("BTS 2") → BTS + 2', () =>
  assert.deepStrictEqual(parseLevel('BTS 2'), { level: 'BTS', studyYear: '2' }));
check('parseLevel("Doctorat") → Doctorat + 1', () =>
  assert.deepStrictEqual(parseLevel('Doctorat'), { level: 'Doctorat', studyYear: '1' }));
check('parseLevel("Classe préparatoire") → Autre', () =>
  assert.deepStrictEqual(parseLevel('Classe préparatoire'), { level: 'Autre', studyYear: 'Classe préparatoire' }));

// --- Traduction des erreurs : le code SQL ne masque plus le message réel ---
check('P0001 + CLASSROOM_NOT_FOUND → message code classe', () => {
  assert.strictEqual(errorCode({ code: 'P0001', message: 'CLASSROOM_NOT_FOUND' }), 'CLASSROOM_NOT_FOUND');
  assert.strictEqual(friendlyError({ code: 'P0001', message: 'CLASSROOM_NOT_FOUND' }), 'Aucune classe ne correspond à ce code.');
});
check('user_already_exists → « Un compte existe déjà »', () => {
  assert.strictEqual(errorCode({ code: 'user_already_exists', message: 'User already registered' }), 'user_already_exists');
  assert.strictEqual(friendlyError({ code: 'user_already_exists', message: 'User already registered' }), 'Un compte existe déjà avec cet email.');
});
check('contrainte classrooms_level_check → niveau invalide', () =>
  assert.strictEqual(friendlyError({ code: '23514', message: 'new row for relation "classrooms" violates check constraint "classrooms_level_check"' }), 'Niveau invalide. Choisissez un niveau dans la liste.'));
check('P0001 + NOT_AUTHENTICATED → connexion requise', () =>
  assert.strictEqual(errorCode({ code: 'P0001', message: 'NOT_AUTHENTICATED' }), 'NOT_AUTHENTICATED'));
check('P0001 + ACADEMIC_YEAR_INVALID → format année', () =>
  assert.strictEqual(errorCode({ code: 'P0001', message: 'ACADEMIC_YEAR_INVALID' }), 'ACADEMIC_YEAR_INVALID'));
check('Failed to fetch → réseau', () =>
  assert.strictEqual(errorCode(new Error('Failed to fetch')), 'NETWORK'));
check('Invalid login credentials → identifiants', () =>
  assert.strictEqual(errorCode({ message: 'Invalid login credentials' }), 'invalid_credentials'));
check('erreur inconnue → message générique (jamais de code brut)', () =>
  assert.strictEqual(friendlyError({ code: 'XX000', message: 'something unexpected' }), 'Une erreur est survenue. Réessayez.'));

console.log(failed === 0 ? `\n✓ ${passed} tests unitaires réussis.` : `\n✗ ${failed} test(s) en échec (${passed} réussis).`);
process.exit(failed === 0 ? 0 : 1);
