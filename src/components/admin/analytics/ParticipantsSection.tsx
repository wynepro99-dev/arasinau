import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, Search } from 'lucide-react';
import {
  ANALYTICS_ENDPOINTS,
  PARTICIPANT_PAGE_SIZE_DEFAULT,
  QUERY_KEYS,
  filtersToQuery,
} from '../../../lib/analytics/contract';
import type { AnalyticsFilters, ParticipantListResponse, ParticipantSortKey } from '../../../lib/analytics/contract';
import { analyticsGetJson, describeAnalyticsError } from '../../../lib/analyticsApi';
import { companyLabel, fmtDateTime, fmtInt, fmtNum } from './format';
import {
  EmptyState,
  ErrorState,
  INPUT_CLASS,
  LoadingState,
  SectionCard,
  SortableTh,
  StatusBadge,
  TABLE_CLASS,
  THEAD_CLASS,
} from './ui';
import type { SortDir } from './ui';

/**
 * Daftar peserta (paginasi di server). Baru dimuat saat bagian ini mendekati layar,
 * lalu mengikuti filter & versi data ringkasan yang sedang ditampilkan.
 */

const SEARCH_DEBOUNCE_MS = 300;
/** Kolom angka/tanggal default menurun (sama dengan default server). */
const DESC_FIRST_KEYS: ReadonlySet<ParticipantSortKey> = new Set<ParticipantSortKey>([
  'score',
  'correct',
  'wrong',
  'empty',
  'completedAt',
]);

const TH = 'px-3 py-2.5 whitespace-nowrap';
const TD = 'px-3 py-2.5 align-middle';
const TD_NUM = `${TD} text-right tabular-nums whitespace-nowrap`;
const PAGER_BTN =
  'px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed text-slate-700 dark:text-zinc-300 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors';

export const ParticipantsSection: React.FC<{
  examId: string;
  /** Filter yang dipakai ringkasan yang sedang tampil. */
  filters: AnalyticsFilters;
  /** generatedAt ringkasan; berubah → daftar dimuat ulang (mis. setelah Muat Ulang). */
  dataVersion: string;
  onOpenParticipant: (userId: string) => void;
}> = ({ examId, filters, dataVersion, onOpenParticipant }) => {
  const searchId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [activated, setActivated] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ParticipantSortKey>('name');
  const [dir, setDir] = useState<SortDir>('asc');

  const filtersKey = JSON.stringify(filtersToQuery(filters));
  // Halaman otomatis kembali ke 1 setiap kali paket / filter / pencarian / urutan berubah.
  const queryKey = `${examId}|${filtersKey}|${search}|${sort}|${dir}`;
  const [pageState, setPageState] = useState<{ key: string; page: number }>({ key: '', page: 1 });
  const page = pageState.key === queryKey ? pageState.page : 1;
  const requestKey = `${queryKey}|${page}|${dataVersion}`;

  const [result, setResult] = useState<{ key: string; data: ParticipantListResponse } | null>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const requestIdRef = useRef(0);

  // Muat saat bagian peserta mendekati viewport.
  useEffect(() => {
    if (activated) return;
    const el = rootRef.current;
    if (!el || typeof window === 'undefined' || typeof window.IntersectionObserver !== 'function') {
      setActivated(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setActivated(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [activated]);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    if (!activated) return;
    const reqId = ++requestIdRef.current;
    const key = requestKey;
    setLoading(true);
    analyticsGetJson<ParticipantListResponse>(ANALYTICS_ENDPOINTS.participants(examId), {
      ...filtersToQuery(filters),
      [QUERY_KEYS.search]: search || undefined,
      [QUERY_KEYS.sort]: sort,
      [QUERY_KEYS.dir]: dir,
      [QUERY_KEYS.page]: page,
      [QUERY_KEYS.pageSize]: PARTICIPANT_PAGE_SIZE_DEFAULT,
    })
      .then((data) => {
        if (reqId !== requestIdRef.current) return;
        if (data && Array.isArray(data.rows) && typeof data.total === 'number') {
          setResult({ key, data });
          setError(null);
        } else {
          setError({ key, message: 'Respons daftar peserta dari server tidak sesuai format.' });
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (reqId !== requestIdRef.current) return;
        setError({ key, message: describeAnalyticsError(err) });
        setLoading(false);
      });
    // `filters` diwakili filtersKey (identitas objek boleh berubah tanpa isinya berubah).
  }, [activated, examId, filtersKey, search, sort, dir, page, dataVersion, retryNonce]);

  // Abaikan respons yang datang setelah komponen dilepas.
  useEffect(
    () => () => {
      requestIdRef.current += 1;
    },
    []
  );

  const handleSort = (key: ParticipantSortKey) => {
    if (key === sort) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setDir(DESC_FIRST_KEYS.has(key) ? 'desc' : 'asc');
    }
  };

  const data = result?.data ?? null;
  const rows = data?.rows ?? [];
  const showError = !!error && error.key === requestKey && !loading;
  const refreshing = !!result && (loading || result.key !== requestKey);
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize || PARTICIPANT_PAGE_SIZE_DEFAULT;
  const currentPage = data?.page ?? page;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, currentPage * pageSize);

  const goToPage = (target: number) => {
    setPageState({ key: queryKey, page: Math.min(Math.max(1, target), totalPages) });
  };

  const sortTh = (key: ParticipantSortKey, label: string, align: 'left' | 'right' = 'left') => (
    <SortableTh label={label} active={sort === key} dir={dir} onClick={() => handleSort(key)} align={align} />
  );

  let content: React.ReactNode;
  if (showError && error) {
    content = <ErrorState message={error.message} onRetry={() => setRetryNonce((n) => n + 1)} />;
  } else if (!result) {
    content = <LoadingState message="Memuat daftar peserta..." />;
  } else {
    content = (
      <div className={`transition-opacity duration-200 ${refreshing ? 'opacity-60' : ''}`} aria-busy={refreshing}>
        {rows.length === 0 ? (
          <EmptyState
            message={search ? 'Tidak ada peserta yang cocok dengan pencarian.' : 'Tidak ada peserta pada filter ini.'}
          />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-zinc-800">
            <table className={`${TABLE_CLASS} min-w-[980px]`}>
              <thead className={THEAD_CLASS}>
                <tr>
                  {sortTh('name', 'Peserta')}
                  {sortTh('company', 'Company')}
                  {sortTh('department', 'Department')}
                  {sortTh('score', 'Nilai', 'right')}
                  {sortTh('correct', 'Benar', 'right')}
                  {sortTh('wrong', 'Salah', 'right')}
                  {sortTh('empty', 'Kosong', 'right')}
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={`${TH} text-right`}>Attempt</th>
                  {sortTh('completedAt', 'Waktu Selesai')}
                  <th scope="col" className={`${TH} text-right`}>Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {rows.map((r) => (
                  <tr key={r.userId} className="hover:bg-slate-50/80 dark:hover:bg-zinc-950/40 transition-colors">
                    <td className={`${TD} font-semibold text-slate-900 dark:text-white`}>{r.name}</td>
                    <td className={`${TD} whitespace-nowrap`}>{companyLabel(r.company)}</td>
                    <td className={TD}>{r.department || '-'}</td>
                    <td className={`${TD_NUM} font-semibold text-slate-900 dark:text-white`}>{fmtNum(r.score, 2)}</td>
                    <td className={TD_NUM}>{fmtInt(r.correct)}</td>
                    <td className={TD_NUM}>{fmtInt(r.wrong)}</td>
                    <td className={TD_NUM}>{fmtInt(r.empty)}</td>
                    <td className={TD}>
                      <StatusBadge status={r.status} />
                    </td>
                    <td
                      className={TD_NUM}
                      title={r.attemptCount > 1 ? 'Peserta mengulang; analisis memakai attempt pertama.' : undefined}
                    >
                      {fmtInt(r.attemptCount)}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>{fmtDateTime(r.completedAt)}</td>
                    <td className={`${TD} text-right`}>
                      <button
                        type="button"
                        onClick={() => onOpenParticipant(r.userId)}
                        disabled={refreshing}
                        aria-label={`Detail analisis ${r.name}`}
                        className="px-2.5 py-1 bg-indigo-50 dark:bg-zinc-950 hover:bg-indigo-100 dark:hover:bg-zinc-800 disabled:opacity-60 text-indigo-700 dark:text-indigo-400 border border-transparent dark:border-zinc-800 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Detail</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-zinc-400">
          <span className="tabular-nums">
            {total > 0
              ? `Menampilkan ${fmtInt(rangeStart)}–${fmtInt(rangeEnd)} dari ${fmtInt(total)} peserta`
              : '0 peserta'}
          </span>
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2">
            <button
              type="button"
              className={PAGER_BTN}
              disabled={refreshing || currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Sebelumnya</span>
            </button>
            <span className="tabular-nums whitespace-nowrap">
              Halaman {fmtInt(currentPage)} dari {fmtInt(totalPages)}
            </span>
            <button
              type="button"
              className={PAGER_BTN}
              disabled={refreshing || currentPage >= totalPages}
              onClick={() => goToPage(currentPage + 1)}
            >
              <span>Berikutnya</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef}>
      <SectionCard
        title="Peserta"
        subtitle="Attempt pertama setiap peserta sesuai filter · klik Detail untuk analisis per peserta"
      >
        <div className="space-y-3">
          <div className="relative sm:max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden="true" />
            <label htmlFor={searchId} className="sr-only">
              Cari peserta
            </label>
            <input
              id={searchId}
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Cari nama, department, atau company..."
              className={`${INPUT_CLASS} pl-9`}
            />
          </div>
          {content}
        </div>
      </SectionCard>
    </div>
  );
};
