import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// Client Supabase : gère la session « responsable » (connexion, rafraîchissement
// automatique du jeton). Les étudiants n'ont pas de compte : ils utilisent un
// jeton de classe obtenu avec le code de la classe.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'klassio-owner-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Erreur applicative avec un message déjà prêt à afficher (en français). */
export class AppError extends Error {
  constructor(message, code = 'UNKNOWN') {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

// Correspondance codes serveur → messages clairs. Aucun code technique,
// aucune trace interne n'est affichée à l'utilisateur.
const MESSAGES = {
  CODE_REQUIRED: 'Saisissez le code de classe fourni par le responsable.',
  CLASSROOM_NOT_FOUND: 'Aucune classe ne correspond à ce code.',
  SESSION_INVALID: 'Cette session a expiré. Rejoignez la classe à nouveau.',
  DOCUMENT_NOT_FOUND: 'Ce document n’est plus disponible.',
  SUBJECT_NOT_FOUND: 'Cette matière n’existe plus.',
  SUBJECT_NOT_IN_CLASSROOM: 'Cette matière ne fait pas partie de la classe.',
  LINK_INVALID: 'Ce lien de publication n’est pas valide.',
  LINK_REVOKED: 'Ce lien a été révoqué par le responsable.',
  RATE_LIMITED: 'Trop de publications. Réessayez plus tard.',
  FILE_TOO_LARGE: 'Fichier trop volumineux (10 Mo maximum).',
  FILE_TYPE_NOT_ALLOWED: 'Format de fichier non autorisé.',
  FILE_REQUIRED: 'Choisissez un fichier à publier.',
  TITLE_REQUIRED: 'Le titre est requis (2 caractères minimum).',
  TEACHER_NAME_REQUIRED: 'Le nom de l’enseignant est requis (2 caractères minimum).',
  NAME_REQUIRED: 'Le nom est requis (2 caractères minimum).',
  NOT_AUTHENTICATED: 'Connexion requise.',
  ADMIN_ONLY: 'Cette page est réservée à l’administrateur du site.',
  UPLOAD_INCOMPLETE: 'L’envoi du fichier n’a pas abouti. Réessayez.',
  FILE_SIZE_MISMATCH: 'Le fichier envoyé ne correspond pas. Réessayez.',
  ACADEMIC_YEAR_INVALID: 'L’année académique doit être au format 2025-2026.',
  LEVEL_INVALID: 'Niveau invalide. Choisissez un niveau dans la liste.',
  JOIN_CODE_GENERATION_FAILED: 'Impossible de générer un code de classe. Réessayez.',
  EMAIL_CONFIRMATION_REQUIRED: 'Compte créé. Une confirmation par email est requise avant la connexion.',
  DEVICE_IDENTIFIER_REQUIRED: 'Appareil non reconnu. Réessayez.',
  DEVICE_NOT_FOUND: 'Appareil non enregistré. Rejoignez la classe à nouveau.',
  invalid_credentials: 'Email ou mot de passe incorrect.',
  user_already_exists: 'Un compte existe déjà avec cet email.',
  email_exists: 'Un compte existe déjà avec cet email.',
  weak_password: 'Mot de passe trop faible (6 caractères minimum).',
  over_request_rate_limit: 'Trop de tentatives. Réessayez dans quelques instants.',
  NETWORK: 'Pas de connexion internet.',
};

function extractCode(err) {
  if (!err) return 'UNKNOWN';
  // Rassemble tous les champs susceptibles de porter un code ou un message :
  // le code SQL (P0001, 23514…) ne doit jamais masquer le message réel.
  const candidates = [];
  if (typeof err === 'string') {
    candidates.push(err.trim());
  } else if (typeof err === 'object') {
    for (const key of ['message', 'code', 'error_code', 'error_description', 'msg', 'error', 'details', 'hint']) {
      const value = err[key];
      if (typeof value === 'string' && value.trim()) candidates.push(value.trim());
    }
  }
  if (candidates.length === 0) return 'UNKNOWN';

  // 1) Code connu présent tel quel (ex. « user_already_exists », « LINK_REVOKED »).
  for (const c of candidates) {
    if (MESSAGES[c]) return c;
  }
  // 2) Code serveur en majuscules dans le texte (ex. « CLASSROOM_NOT_FOUND »),
  //    même si err.code ne contient que le code SQL « P0001 ».
  for (const c of candidates) {
    const match = c.match(/[A-Z][A-Z_]{3,}/);
    if (match && MESSAGES[match[0]]) return match[0];
  }
  // 3) Heuristiques sur le texte (authentification, réseau, contraintes…).
  const lower = candidates.join(' ').toLowerCase();
  if (lower.includes('invalid login credentials')) return 'invalid_credentials';
  if (lower.includes('already registered') || lower.includes('already been registered') || lower.includes('user_already_exists') || lower.includes('email_exists')) return 'user_already_exists';
  if (lower.includes('password should be') || lower.includes('weak password')) return 'weak_password';
  if (lower.includes('email not confirmed')) return 'EMAIL_CONFIRMATION_REQUIRED';
  if (lower.includes('rate limit') || lower.includes('too many')) return 'over_request_rate_limit';
  if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('load failed')) return 'NETWORK';
  if (lower.includes('classrooms_level_check')) return 'LEVEL_INVALID';
  if (lower.includes('classrooms_academic_year_check')) return 'ACADEMIC_YEAR_INVALID';
  // 4) Dernier recours : un code majuscule quelconque, sinon message générique.
  for (const c of candidates) {
    const match = c.match(/[A-Z][A-Z_]{3,}/);
    if (match) return match[0];
  }
  return 'UNKNOWN';
}

/** Transforme n'importe quelle erreur en message français affichable. */
export function friendlyError(err) {
  const code = extractCode(err);
  if (MESSAGES[code]) return MESSAGES[code];
  if (code === 'UNKNOWN') return 'Une erreur est survenue. Réessayez.';
  // Code connu du serveur mais sans traduction : message générique, jamais le code brut.
  return 'Opération impossible pour le moment. Réessayez.';
}

export function errorCode(err) {
  return extractCode(err);
}

/** Appel d'une fonction PostgreSQL exposée par l'API. */
export async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new AppError(friendlyError(error), errorCode(error));
  return data;
}

async function callEdge(action, { type, body, accessToken } = {}) {
  const params = new URLSearchParams({ action });
  if (type) params.set('type', type);
  const headers = {
    'Content-Type': 'application/json',
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
  };
  let response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/klassio-file?${params}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body || {}),
    });
  } catch {
    throw new AppError(MESSAGES.NETWORK, 'NETWORK');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload?.error || payload?.code || `HTTP_${response.status}`;
    throw new AppError(MESSAGES[code] || friendlyError(payload || code), code);
  }
  return payload;
}

/** URL signée de consultation d'un document (étudiant ou responsable). */
export function signDocument({ documentId, sessionToken, type = 'student', accessToken }) {
  return callEdge('sign', {
    type,
    accessToken,
    body: { document_id: documentId, session_token: sessionToken || '', expires_in: 600 },
  });
}

/** Valide un envoi de fichier (déplacement hors zone temporaire + vérification). */
export function finalizeUpload({ documentId, token }) {
  return callEdge('finalize', { body: { document_id: documentId, session_token: token } });
}

/** Supprime des fichiers du stockage après retrait en base. */
export function purgeFiles(paths) {
  if (!paths || paths.length === 0) return Promise.resolve({ removed: 0 });
  return callEdge('purge', { body: { paths } });
}

// ---------------------------------------------------------------- étudiant
export const studentApi = {
  join: (joinCode) =>
    rpc('api_join_classroom', { p_join_code: joinCode, p_label: 'Navigateur web', p_platform: 'web' }),
  classroom: (token) => rpc('api_student_classroom', { p_token: token }),
  documents: (token, { subjectId = null, search = null, limit = 30, offset = 0 } = {}) =>
    rpc('api_student_documents', {
      p_token: token,
      p_subject_id: subjectId,
      p_search: search,
      p_limit: limit,
      p_offset: offset,
    }),
  updates: (token, since) => rpc('api_student_updates', { p_token: token, p_since: since }),
  registerDevice: (token, deviceId, notificationsEnabled) =>
    rpc('api_register_device', {
      p_token: token,
      p_device_identifier: deviceId,
      p_label: 'Navigateur web',
      p_platform: 'web',
      p_notifications_enabled: notificationsEnabled,
    }),
  setNotifications: (token, deviceId, enabled) =>
    rpc('api_set_notifications', {
      p_token: token,
      p_device_identifier: deviceId,
      p_enabled: enabled,
    }),
};

// ---------------------------------------------------------------- responsable
export const ownerApi = {
  listClassrooms: () => rpc('api_list_my_classrooms'),
  createClassroom: (fields) =>
    rpc('api_create_classroom', {
      p_institution_name: fields.institutionName,
      p_class_name: fields.className,
      p_field_of_study: fields.fieldOfStudy,
      p_level: fields.level,
      p_study_year: fields.studyYear,
      p_academic_year: fields.academicYear,
    }),
  space: (classroomId) => rpc('api_my_space', { p_classroom_id: classroomId }),
  documents: (classroomId, subjectId = null) =>
    rpc('api_owner_documents', { p_classroom_id: classroomId, p_subject_id: subjectId }),
  createSubject: (classroomId, name, description) =>
    rpc('api_create_subject', { p_classroom_id: classroomId, p_name: name, p_description: description || null }),
  updateSubject: (subjectId, name, description) =>
    rpc('api_update_subject', { p_subject_id: subjectId, p_name: name, p_description: description || null }),
  deleteSubject: (subjectId) => rpc('api_delete_subject', { p_subject_id: subjectId }),
  deleteDocument: (documentId) => rpc('api_delete_document', { p_document_id: documentId }),
  deleteClassroom: (classroomId) => rpc('api_delete_classroom', { p_classroom_id: classroomId }),
  archiveClassroom: (classroomId, archived) =>
    rpc('api_archive_classroom', { p_classroom_id: classroomId, p_archived: archived }),
  regenerateJoinCode: (classroomId) => rpc('api_regenerate_join_code', { p_classroom_id: classroomId }),
  rotateLink: (subjectId) => rpc('api_rotate_publication_link', { p_subject_id: subjectId }),
  revokeLink: (subjectId) => rpc('api_revoke_publication_link', { p_subject_id: subjectId }),
};

// ---------------------------------------------------------------- administration
export const adminApi = {
  isAdmin: () => rpc('api_is_admin'),
  stats: (days = 30) => rpc('api_admin_stats', { p_days: days }),
};

// ---------------------------------------------------------------- publication (enseignant)
export const publishApi = {
  context: (token) => rpc('api_publish_context', { p_token: token }),
  beginUpload: (token, { title, description, fileName, fileSize, teacherName }) =>
    rpc('api_begin_upload', {
      p_token: token,
      p_title: title,
      p_description: description || '',
      p_file_name: fileName,
      p_file_size: fileSize,
      p_teacher_name: teacherName,
    }),
  /** Envoie le fichier dans la zone temporaire du stockage privé. */
  async uploadFile(filePath, file, onProgress) {
    // Envoi direct avec suivi de progression via XMLHttpRequest.
    await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/documents/${filePath.split('/').map(encodeURIComponent).join('/')}`);
      xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Authorization', `Bearer ${SUPABASE_ANON_KEY}`);
      xhr.setRequestHeader('x-upsert', 'false');
      if (file.type) xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else {
          let code = 'UPLOAD_INCOMPLETE';
          try {
            const payload = JSON.parse(xhr.responseText);
            if (payload?.message?.includes('row-level security') || payload?.statusCode === '403') code = 'LINK_REVOKED';
            if (payload?.error === 'Duplicate') code = 'UPLOAD_INCOMPLETE';
          } catch {
            /* réponse illisible : on garde le code générique */
          }
          reject(new AppError(MESSAGES[code] || friendlyError(code), code));
        }
      };
      xhr.onerror = () => reject(new AppError(MESSAGES.NETWORK, 'NETWORK'));
      xhr.send(file);
    });
  },
};
