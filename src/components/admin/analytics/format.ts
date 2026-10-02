import type { DifficultyLabel, ParticipantStatus } from '../../../lib/analytics/contract';

/** Formatter tampilan analitik (locale id-ID). Semua mengembalikan '-' untuk nilai kosong. */

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function fmtInt(n: number | null | undefined): string {
  return isNum(n) ? Math.round(n).toLocaleString('id-ID') : '-';
}

export function fmtNum(n: number | null | undefined, maxDigits = 1): string {
  return isNum(n) ? n.toLocaleString('id-ID', { maximumFractionDigits: maxDigits }) : '-';
}

export function fmtPct(n: number | null | undefined, maxDigits = 1): string {
  return isNum(n) ? `${fmtNum(n, maxDigits)}%` : '-';
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDuration(seconds: number | null | undefined): string {
  if (!isNum(seconds) || seconds < 0) return '-';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

/** 'YYYY-MM-DD' (input type=date, zona waktu lokal) → ISO awal hari. */
export function localDateToIsoStart(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 'YYYY-MM-DD' (input type=date, zona waktu lokal) → ISO akhir hari. */
export function localDateToIsoEnd(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Tanggal lokal 'YYYY-MM-DD' untuk nama file fallback. */
export function localDateStamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Bagian nama file aman: huruf/angka/strip, spasi → '_', maks 60 karakter. */
export function safeFilePart(s: string | null | undefined): string {
  const cleaned = (s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
  return cleaned || 'Paket';
}

export function companyLabel(code: string | null | undefined): string {
  return code || '-';
}

export function difficultyClasses(label: DifficultyLabel | null | undefined): string {
  switch (label) {
    case 'Mudah':
      return 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-900/40';
    case 'Sedang':
      return 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-900/40';
    case 'Sulit':
      return 'bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border-rose-200/60 dark:border-rose-900/40';
    default:
      return 'bg-slate-50 dark:bg-zinc-950 text-slate-500 dark:text-zinc-400 border-slate-200/60 dark:border-zinc-800';
  }
}

export function statusClasses(status: ParticipantStatus | string | null | undefined): string {
  if (status === 'LULUS') {
    return 'bg-emerald-100 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-transparent dark:border-emerald-900/40';
  }
  if (status === 'TIDAK LULUS') {
    return 'bg-rose-100 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border-transparent dark:border-rose-900/40';
  }
  return 'bg-amber-100 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-transparent dark:border-amber-900/40';
}

/**
 * Warna chart (divalidasi dengan validator palet dataviz).
 * - SERIES: satu seri / batang tunggal → indigo-500, lolos kontras di kartu terang (#fff) & gelap (#18181b).
 * - METER Lulus vs Tidak Lulus: satu hue (indigo) agar aman buta warna (pasangan hijau/merah gagal uji deutan).
 */
export const CHART_COLORS = {
  series: '#6366f1',
  meterLight: { passed: '#3730a3', failed: '#818cf8' },
  meterDark: { passed: '#a5b4fc', failed: '#4338ca' },
  grid: '#e2e8f0',
  gridDark: '#27272a',
  axis: '#94a3b8',
} as const;

/** Gaya tooltip Recharts yang sama dengan AdminDashboard existing. */
export const TOOLTIP_STYLE = {
  backgroundColor: '#18181b',
  borderColor: '#27272a',
  borderRadius: '12px',
  fontSize: '12px',
  color: '#fff',
} as const;
