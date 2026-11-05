import React, { useEffect, useRef } from 'react';

// ------------------------------------------------------------------ icônes
// Jeu d'icônes SVG inline (trait 2 px, style cohérent, aucune dépendance).
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.06-.4.1-.8.1-1.2Z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  chevronRight: 'm9 18 6-6-6-6',
  chevronLeft: 'm15 18-6-6 6-6',
  plus: 'M12 5v14M5 12h14',
  copy: 'M8 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2M6 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z',
  share: 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6',
  trash: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14ZM10 11v6M14 11v6',
  link: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M16 13H8M16 17H8M10 9H8',
  check: 'M20 6 9 17l-5-5',
  x: 'M18 6 6 18M6 6l12 12',
  alert: 'M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-6v-4m0-4h.01',
  wifiOff: 'M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Zm11 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  folder: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v11Z',
  cap: 'M22 10 12 5 2 10l10 5 10-5Zm-16 2.5V17c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M22 10v6',
  key: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777Zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  phone: 'M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Zm-5 18h.01',
  external: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5Z',
  archive: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-16v6l4 2',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm18 2-10 7L2 6',
  lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Zm3 0V7a4 4 0 0 1 8 0v4',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-15v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z',
  monitor: 'M2 4h20v12H2zM8 20h8m-4-4v4',
  sparkles: 'm12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Zm7 12 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z',
};

export function Icon({ name, size = 20, className = '', strokeWidth = 2 }) {
  const d = PATHS[name] || PATHS.file;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export function Logo({ size = 34, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 108 108" className={`brand-logo ${className}`} aria-hidden="true">
      <rect width="108" height="108" rx="24" fill="#163B70" />
      <path d="M26 26h12v56H26z" fill="#2563EB" />
      <path d="M38 54 62 26h15L52 54z" fill="#FFFFFF" />
      <path d="M52 54 77 82H62L38 54z" fill="#FFFFFF" />
      <path d="M66 26h14v12H66z" fill="#93C5FD" />
    </svg>
  );
}

// ------------------------------------------------------------------ boutons
export function Button({ variant = 'primary', size, block, icon, children, className = '', ...props }) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${block ? 'btn-block' : ''} ${className}`}
      {...props}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export function LinkButton({ to, variant = 'primary', icon, children, className = '', ...props }) {
  return (
    <a href={`#${to}`} className={`btn btn-${variant} ${className}`} {...props}>
      {icon && <Icon name={icon} />}
      {children}
    </a>
  );
}

// ------------------------------------------------------------------ champs
export function Field({ label, hint, children, htmlFor }) {
  return (
    <div className="field">
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export const Input = React.forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={`input ${className}`} {...props} />;
});

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`select ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={`textarea ${className}`} {...props} />;
}

export function Switch({ checked, onChange, label }) {
  return (
    <span className="switch">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span className="switch-track" />
    </span>
  );
}

// ------------------------------------------------------------------ divers
export function Badge({ tone = 'gray', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function FileBadge({ type }) {
  const kinds = {
    pdf: ['PDF', 'red'], doc: ['DOC', 'blue'], docx: ['DOCX', 'blue'],
    ppt: ['PPT', 'orange'], pptx: ['PPTX', 'orange'], xls: ['XLS', 'green'],
    xlsx: ['XLSX', 'green'], jpg: ['JPG', 'purple'], jpeg: ['JPG', 'purple'], png: ['PNG', 'purple'],
  };
  const [label, tone] = kinds[(type || '').toLowerCase()] || ['FIC', 'gray'];
  return <span className={`file-badge tone-${tone}`}>{label}</span>;
}

export function Card({ className = '', children, ...props }) {
  return (
    <div className={`card ${className}`} {...props}>
      {children}
    </div>
  );
}

export function SectionTitle({ children }) {
  return <div className="section-title">{children}</div>;
}

export function Notice({ tone = 'info', icon, children }) {
  const icons = { info: 'info', error: 'alert', warning: 'alert', success: 'check' };
  return (
    <div className={`notice notice-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={icon || icons[tone]} />
      <div>{children}</div>
    </div>
  );
}

export function EmptyState({ icon = 'folder', title, children, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name={icon} />
      </div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Loading({ label = 'Chargement…' }) {
  return (
    <div className="loading-block" role="status">
      <div className="spinner spinner-lg" />
      <span>{label}</span>
    </div>
  );
}

export function BackLink({ to, onClick, children = 'Retour' }) {
  if (onClick) {
    return (
      <button type="button" className="back-link" onClick={onClick}>
        <Icon name="chevronLeft" /> {children}
      </button>
    );
  }
  return (
    <a href={`#${to}`} className="back-link">
      <Icon name="chevronLeft" /> {children}
    </a>
  );
}

// ------------------------------------------------------------------ modale
export function Modal({ open, onClose, title, children, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref} style={wide ? { maxWidth: 640 } : undefined}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirmer', danger, busy }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-secondary">{message}</p>
      <div className="btn-row mt-2">
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Annuler
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
          {busy ? 'En cours…' : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ toasts
export function Toasts({ toasts }) {
  return (
    <div className="toast-wrap" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone === 'error' ? 'toast-error' : t.tone === 'success' ? 'toast-success' : ''}`}>
          <Icon name={t.tone === 'error' ? 'alert' : t.tone === 'success' ? 'check' : 'info'} size={18} />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
