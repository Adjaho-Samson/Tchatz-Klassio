// Formatage lisible : tailles, dates et types de fichiers, en français.
export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateFmt.format(d);
}

export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : dateTimeFmt.format(d);
}

export function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.round(h / 24);
  if (days < 7) return `il y a ${days} j`;
  return formatDate(iso);
}

export const FILE_KINDS = {
  pdf: { label: 'PDF', tone: 'red' },
  doc: { label: 'DOC', tone: 'blue' },
  docx: { label: 'DOCX', tone: 'blue' },
  odt: { label: 'ODT', tone: 'blue' },
  rtf: { label: 'RTF', tone: 'blue' },
  ppt: { label: 'PPT', tone: 'orange' },
  pptx: { label: 'PPTX', tone: 'orange' },
  odp: { label: 'ODP', tone: 'orange' },
  xls: { label: 'XLS', tone: 'green' },
  xlsx: { label: 'XLSX', tone: 'green' },
  ods: { label: 'ODS', tone: 'green' },
  csv: { label: 'CSV', tone: 'green' },
  tsv: { label: 'TSV', tone: 'green' },
  jpg: { label: 'JPG', tone: 'purple' },
  jpeg: { label: 'JPG', tone: 'purple' },
  png: { label: 'PNG', tone: 'purple' },
  webp: { label: 'WEBP', tone: 'purple' },
  gif: { label: 'GIF', tone: 'purple' },
  svg: { label: 'SVG', tone: 'purple' },
  bmp: { label: 'BMP', tone: 'purple' },
  txt: { label: 'TXT', tone: 'gray' },
  md: { label: 'MD', tone: 'gray' },
  html: { label: 'HTML', tone: 'gray' },
  json: { label: 'JSON', tone: 'gray' },
  xml: { label: 'XML', tone: 'gray' },
  zip: { label: 'ZIP', tone: 'gray' },
};

export function fileKind(type) {
  return FILE_KINDS[(type || '').toLowerCase()] || { label: (type || 'FIC').toUpperCase().slice(0, 4), tone: 'gray' };
}

/** Année académique par défaut : juillet → juin. */
export function defaultAcademicYear() {
  const now = new Date();
  const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${y + 1}`;
}

export function plural(n, singular, pluralForm) {
  return `${n} ${n > 1 ? pluralForm || singular + 's' : singular}`;
}
