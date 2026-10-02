import React, { useEffect } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, Clock, Info, Loader2, X, XCircle } from 'lucide-react';
import type { DifficultyLabel, ParticipantStatus } from '../../../lib/analytics/contract';
import { difficultyClasses, statusClasses } from './format';

/** Primitif UI bersama untuk halaman analitik (gaya mengikuti komponen admin existing). */

export const SectionCard: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, actions, className = '', children }) => (
  <section
    className={`bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl shadow-sm ${className}`}
  >
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 sm:px-5 pt-4 sm:pt-5">
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-slate-800 dark:text-white">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
    <div className="p-4 sm:p-5">{children}</div>
  </section>
);

export const StatTile: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
}> = ({ label, value, hint, icon }) => (
  <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl shadow-sm border border-slate-200/80 dark:border-zinc-800 flex items-start gap-3 min-w-0">
    {icon && (
      <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center shrink-0">
        {icon}
      </div>
    )}
    <div className="min-w-0">
      <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">{label}</p>
      <p className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white mt-0.5 leading-tight break-words">{value}</p>
      {hint && <p className="text-[11px] text-slate-400 dark:text-zinc-500 mt-0.5">{hint}</p>}
    </div>
  </div>
);

export const InfoNote: React.FC<{ tone?: 'info' | 'warning'; children: React.ReactNode }> = ({ tone = 'info', children }) => (
  <div
    className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] leading-relaxed ${
      tone === 'warning'
        ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200/70 dark:border-amber-900/40 text-amber-800 dark:text-amber-300'
        : 'bg-slate-50 dark:bg-zinc-950 border-slate-200/80 dark:border-zinc-800 text-slate-600 dark:text-zinc-400'
    }`}
  >
    {tone === 'warning' ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
    <div className="min-w-0">{children}</div>
  </div>
);

export const LoadingState: React.FC<{ message?: string }> = ({ message = 'Menghitung analisis...' }) => (
  <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-500 dark:text-zinc-400">
    <Loader2 className="w-4 h-4 animate-spin" />
    <span>{message}</span>
  </div>
);

export const ErrorState: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-10 px-4 text-center">
    <div className="flex items-start gap-2 text-xs text-rose-700 dark:text-rose-400 max-w-lg">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 rounded-lg text-xs font-semibold"
      >
        Coba lagi
      </button>
    )}
  </div>
);

export const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="py-8 text-center text-xs text-slate-400 dark:text-zinc-500">{message}</div>
);

export const DifficultyBadge: React.FC<{ label: DifficultyLabel | null | undefined }> = ({ label }) => (
  <span className={`inline-block px-2 py-0.5 rounded-md border text-[10px] font-bold whitespace-nowrap ${difficultyClasses(label)}`}>
    {label || '-'}
  </span>
);

/** Status selalu ikon + label (warna tidak pernah jadi satu-satunya penanda). */
export const StatusBadge: React.FC<{ status: ParticipantStatus | string }> = ({ status }) => (
  <span
    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-bold whitespace-nowrap ${statusClasses(status)}`}
  >
    {status === 'LULUS' ? (
      <CheckCircle2 className="w-3.5 h-3.5" />
    ) : status === 'TIDAK LULUS' ? (
      <XCircle className="w-3.5 h-3.5" />
    ) : (
      <Clock className="w-3.5 h-3.5" />
    )}
    <span>{status}</span>
  </span>
);

export type SortDir = 'asc' | 'desc';

export const SortableTh: React.FC<{
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
}> = ({ label, active, dir, onClick, align = 'left', className = '' }) => (
  <th
    scope="col"
    aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    className={`px-3 py-2.5 whitespace-nowrap ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'} ${className}`}
  >
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-indigo-600 dark:hover:text-indigo-400 ${
        active ? 'text-indigo-600 dark:text-indigo-400' : ''
      }`}
    >
      <span>{label}</span>
      {active ? dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" /> : <ArrowUpDown className="w-3 h-3 opacity-40" />}
    </button>
  </th>
);

/**
 * Modal analitik: layar penuh di mobile, kartu tengah di desktop.
 * Menutup dengan tombol X atau Escape.
 */
export const ModalShell: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
  maxWidthClass?: string;
  children: React.ReactNode;
}> = ({ title, subtitle, onClose, footer, maxWidthClass = 'sm:max-w-4xl', children }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch sm:items-center justify-center sm:p-4 bg-slate-950/60 dark:bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`relative w-full ${maxWidthClass} bg-white dark:bg-zinc-900 sm:border border-slate-200 dark:border-zinc-800 sm:rounded-2xl shadow-2xl overflow-hidden text-slate-900 dark:text-zinc-200 h-full sm:h-auto sm:max-h-[90vh] flex flex-col animate-fade-in`}
      >
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 bg-slate-50 dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
            {subtitle && <div className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-zinc-800 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">{children}</div>
        {footer && (
          <div className="px-4 sm:px-6 py-3 bg-slate-50 dark:bg-zinc-950 border-t border-slate-200 dark:border-zinc-800 flex flex-wrap items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

/** Kelas tombol yang sering dipakai. */
export const BTN_PRIMARY =
  'px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/20 dark:shadow-none transition-all inline-flex items-center gap-1.5';
export const BTN_SUCCESS =
  'px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 dark:shadow-none transition-all inline-flex items-center gap-1.5';
export const BTN_SECONDARY =
  'px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 disabled:opacity-60 disabled:cursor-not-allowed text-slate-700 dark:text-zinc-300 rounded-xl text-xs font-semibold transition-all inline-flex items-center gap-1.5';
export const INPUT_CLASS =
  'w-full px-3 py-2 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-indigo-500';
export const TABLE_CLASS = 'w-full text-left text-xs text-slate-600 dark:text-zinc-300 border-collapse';
export const THEAD_CLASS =
  'bg-slate-50 dark:bg-zinc-950 text-slate-700 dark:text-zinc-400 font-semibold border-b border-slate-200/80 dark:border-zinc-800 uppercase tracking-wider text-[10px]';
