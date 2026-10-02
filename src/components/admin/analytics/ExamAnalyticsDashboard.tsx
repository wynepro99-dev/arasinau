import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  CheckCircle2,
  ChevronDown,
  CircleArrowDown,
  CircleArrowUp,
  CircleMinus,
  ClipboardList,
  FileSpreadsheet,
  Loader2,
  PackageSearch,
  Printer,
  RefreshCw,
  Repeat,
  RotateCcw,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { ExamPackage, User } from '../../../types';
import {
  ANALYTICS_ENDPOINTS,
  DIFFICULTY_DISCLAIMER,
  DIFFICULTY_THRESHOLDS,
  MATERIAL_UNAVAILABLE_MESSAGE,
  QUERY_KEYS,
  canViewExamAnalytics,
  filtersToQuery,
  isAnalyticsRole,
  isObjectiveType,
} from '../../../lib/analytics/contract';
import type {
  AnalyticsFilters,
  AnalyticsSummary,
  ApiErrorCode,
  EssayStat,
  ExamAnalyticsSummaryResponse,
  MaterialStat,
  QuestionStat,
} from '../../../lib/analytics/contract';
import { AnalyticsApiError, analyticsDownload, analyticsGetJson, describeAnalyticsError } from '../../../lib/analyticsApi';
import {
  companyLabel,
  fmtDateTime,
  fmtInt,
  fmtNum,
  fmtPct,
  localDateStamp,
  localDateToIsoEnd,
  localDateToIsoStart,
  safeFilePart,
} from './format';
import {
  BTN_SECONDARY,
  BTN_SUCCESS,
  DifficultyBadge,
  EmptyState,
  ErrorState,
  INPUT_CLASS,
  InfoNote,
  LoadingState,
  SectionCard,
  SortableTh,
  StatTile,
  TABLE_CLASS,
  THEAD_CLASS,
} from './ui';
import type { SortDir } from './ui';
import { MaterialPerformanceChart, PassFailMeter, ScoreDistributionChart, TopWrongChart } from './AnalyticsCharts';
import { ParticipantsSection } from './ParticipantsSection';
import { QuestionDetailModal } from './QuestionDetailModal';
import { ParticipantDetailModal } from './ParticipantDetailModal';
import { printAnalyticsReport } from './analyticsPrint';

/**
 * Halaman "Analisis Paket Ujian" (tab Analytics di menu Scores).
 * Semua angka berasal dari endpoint analitik server (deterministik, read-only);
 * komponen ini hanya mengatur filter, pemuatan, dan tampilan.
 */

type ToastFn = (msg: string, type?: 'success' | 'info' | 'error') => void;

interface ExamAnalyticsDashboardProps {
  currentUser: User;
  exams: ExamPackage[];
  /** Paket yang langsung dibuka (mis. dari tombol "Lihat Analisis" di Exam Management). */
  initialExamId?: string | null;
  onToast: ToastFn;
}

/** Nilai mentah kontrol filter ('' = Semua / kosong). Tanggal = 'YYYY-MM-DD' dari input date. */
interface FilterDraft {
  company: string;
  department: string;
  fromDate: string;
  toDate: string;
}

interface LoadedSummary {
  key: string;
  data: ExamAnalyticsSummaryResponse;
  /** Filter yang menghasilkan `data` (dipakai juga oleh modal, export, cetak & daftar peserta). */
  filters: AnalyticsFilters;
}

interface LoadError {
  key: string;
  message: string;
  code: ApiErrorCode | null;
}

type QuestionSortKey = 'no' | 'pctCorrect' | 'pctWrong' | 'wrong' | 'empty';

const EMPTY_DRAFT: FilterDraft = { company: '', department: '', fromDate: '', toDate: '' };
const EXAM_STORAGE_KEY = 'ara_analytics_exam_id';

const QUESTION_SORT_DEFAULT_DIR: Record<QuestionSortKey, SortDir> = {
  no: 'asc',
  pctCorrect: 'asc',
  pctWrong: 'desc',
  wrong: 'desc',
  empty: 'desc',
};

const QUESTION_SORT_OPTIONS: Array<{ key: QuestionSortKey; dir: SortDir; label: string }> = [
  { key: 'no', dir: 'asc', label: 'No. soal (awal → akhir)' },
  { key: 'no', dir: 'desc', label: 'No. soal (akhir → awal)' },
  { key: 'pctCorrect', dir: 'asc', label: '% Benar terendah' },
  { key: 'pctCorrect', dir: 'desc', label: '% Benar tertinggi' },
  { key: 'pctWrong', dir: 'desc', label: '% Salah tertinggi' },
  { key: 'pctWrong', dir: 'asc', label: '% Salah terendah' },
  { key: 'wrong', dir: 'desc', label: 'Salah terbanyak' },
  { key: 'wrong', dir: 'asc', label: 'Salah tersedikit' },
  { key: 'empty', dir: 'desc', label: 'Kosong terbanyak' },
  { key: 'empty', dir: 'asc', label: 'Kosong tersedikit' },
];

const CARD_CLASS = 'bg-white dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 rounded-2xl shadow-sm';
const TABLE_WRAP = 'overflow-x-auto rounded-xl border border-slate-200/80 dark:border-zinc-800';
const TH = 'px-3 py-2.5 whitespace-nowrap';
const TD = 'px-3 py-2.5 align-top';
const TD_NUM = `${TD} text-right tabular-nums whitespace-nowrap`;
const ROW_CLICKABLE = 'hover:bg-slate-50/80 dark:hover:bg-zinc-950/40 cursor-pointer transition-colors';
const OPTION_CLASS = 'dark:bg-zinc-900';
const DASH = <span className="text-slate-400 dark:text-zinc-500">-</span>;

const INVALID_RESPONSE_MESSAGE =
  'Respons server analitik tidak sesuai format yang diharapkan. Pastikan server aplikasi memakai versi terbaru.';

/** Cek bentuk minimum respons agar data tak terduga tidak membuat halaman crash. */
function isSummaryResponse(value: unknown): value is ExamAnalyticsSummaryResponse {
  const d = value as Partial<ExamAnalyticsSummaryResponse> | null;
  return (
    !!d &&
    typeof d === 'object' &&
    !!d.exam &&
    !!d.summary &&
    !!d.filterOptions &&
    Array.isArray(d.filterOptions.companies) &&
    Array.isArray(d.filterOptions.departments) &&
    Array.isArray(d.questions) &&
    Array.isArray(d.scoreDistribution) &&
    Array.isArray(d.materials)
  );
}

function readStoredExamId(): string | null {
  try {
    return localStorage.getItem(EXAM_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeExamId(id: string) {
  try {
    localStorage.setItem(EXAM_STORAGE_KEY, id);
  } catch {
    // localStorage tidak tersedia (mis. mode privat) → abaikan
  }
}

function createdAtMs(exam: ExamPackage): number {
  const t = Date.parse(exam.createdAt || '');
  return Number.isFinite(t) ? t : -Infinity;
}

/** Pastikan nilai filter yang sedang dipilih tetap tampil walau tidak ada di opsi paket ini. */
function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [...options, current] : options;
}

function formatRange(start: string | null, end: string | null): string {
  const a = fmtDateTime(start);
  const b = fmtDateTime(end);
  if (a === '-' && b === '-') return '-';
  if (b === '-') return `mulai ${a}`;
  if (a === '-') return `sampai ${b}`;
  return `${a} – ${b}`;
}

function examStatusLabel(status: string | null): string | null {
  if (status === 'active') return 'Sesi Dibuka';
  if (status === 'closed') return 'Sesi Ditutup';
  if (status === 'draft') return 'Draft';
  return status || null;
}

/** Urutkan salinan daftar soal; nilai kosong (essay) selalu di akhir, seri → No. naik. */
function sortQuestions(list: QuestionStat[], key: QuestionSortKey, dir: SortDir): QuestionStat[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (key === 'no') return sign * (a.no - b.no);
    const va = a[key];
    const vb = b[key];
    if (va == null || vb == null) {
      if (va == null && vb == null) return a.no - b.no;
      return va == null ? 1 : -1;
    }
    return sign * (va - vb) || a.no - b.no;
  });
}

/** Top 10 soal objektif: salah terbanyak, seri → % salah lebih tinggi, lalu No. naik. */
function topWrongQuestions(list: QuestionStat[]): QuestionStat[] {
  return list
    .filter((q) => isObjectiveType(q.type) && (q.wrong ?? 0) > 0)
    .sort((a, b) => (b.wrong ?? 0) - (a.wrong ?? 0) || (b.pctWrong ?? 0) - (a.pctWrong ?? 0) || a.no - b.no)
    .slice(0, 10);
}

function essayHint(essay: EssayStat): string {
  const parts = [
    essay.avgScore === null
      ? 'Belum ada jawaban yang dinilai'
      : `Rata-rata ${fmtNum(essay.avgScore, 2)} / ${fmtNum(essay.maxPoint, 2)}`,
  ];
  if (essay.pending > 0) parts.push(`${fmtInt(essay.pending)} menunggu penilaian`);
  return parts.join(' · ');
}

// ═══════════════════════════════════════════════════════════════
// Bagian-bagian halaman
// ═══════════════════════════════════════════════════════════════

const Field: React.FC<{ label: string; htmlFor: string; className?: string; children: React.ReactNode }> = ({
  label,
  htmlFor,
  className = '',
  children,
}) => (
  <div className={`min-w-0 ${className}`}>
    <label htmlFor={htmlFor} className="block text-[11px] font-semibold text-slate-500 dark:text-zinc-400 mb-1">
      {label}
    </label>
    {children}
  </div>
);

const NoticeCard: React.FC<{ icon: React.ReactNode; title: string; message: string }> = ({ icon, title, message }) => (
  <div className="bg-white dark:bg-zinc-900 border border-dashed border-slate-300 dark:border-zinc-700 rounded-2xl px-6 py-10 text-center">
    <div className="w-11 h-11 mx-auto bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 rounded-xl flex items-center justify-center">
      {icon}
    </div>
    <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-white">{title}</p>
    <p className="mt-1 text-xs text-slate-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">{message}</p>
  </div>
);

/** Tombol teks soal di dalam baris tabel (akses keyboard; klik baris juga membuka detail). */
const QuestionLink: React.FC<{ onOpen: () => void; children: React.ReactNode }> = ({ onOpen, children }) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onOpen();
    }}
    className="w-full text-left text-slate-800 dark:text-zinc-200 hover:text-indigo-600 dark:hover:text-indigo-400 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
  >
    {children}
  </button>
);

const ExamInfoCard: React.FC<{ summary: ExamAnalyticsSummaryResponse }> = ({ summary }) => {
  const { exam, summary: s } = summary;
  const hasSchedule = !!(exam.startTime || exam.endTime);
  const status = examStatusLabel(exam.status);
  const items: Array<{ label: string; value: string }> = [
    { label: 'Company', value: companyLabel(exam.scope) },
    { label: 'Kategori', value: exam.category || '-' },
    { label: 'Passing Score', value: fmtNum(exam.passingScore, 2) },
    { label: 'Jumlah Soal', value: fmtInt(s.questionCount) },
    { label: 'Jumlah Peserta', value: fmtInt(s.totalParticipants) },
    { label: 'Jumlah Attempt', value: fmtInt(s.totalAttempts) },
  ];

  return (
    <div className={`p-4 sm:p-5 ${CARD_CLASS}`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">Nama Paket</p>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug break-words">
            {exam.title}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 sm:justify-end">
          {status && (
            <span className="px-2 py-0.5 rounded-md border border-slate-200/80 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400">
              {status}
            </span>
          )}
          <span className="text-[11px] text-slate-400 dark:text-zinc-500">Data per {fmtDateTime(summary.generatedAt)}</span>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
        {items.map((it) => (
          <div key={it.label} className="min-w-0">
            <dt className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">{it.label}</dt>
            <dd className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-white break-words">{it.value}</dd>
          </div>
        ))}
        <div className="col-span-2 min-w-0">
          <dt className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
            {hasSchedule ? 'Periode (jadwal paket)' : 'Periode (waktu pengerjaan)'}
          </dt>
          <dd className="mt-0.5 text-xs font-semibold text-slate-900 dark:text-white break-words">
            {hasSchedule ? formatRange(exam.startTime, exam.endTime) : formatRange(s.firstCompletedAt, s.lastCompletedAt)}
          </dd>
        </div>
      </dl>
    </div>
  );
};

const SummaryNotes: React.FC<{ summary: ExamAnalyticsSummaryResponse; filtersActive: boolean }> = ({
  summary,
  filtersActive,
}) => {
  const s = summary.summary;
  const mismatched = summary.questions.filter((q) => (q.scoringMismatchCount || 0) > 0);
  const mismatchTotal = mismatched.reduce((acc, q) => acc + q.scoringMismatchCount, 0);
  const mismatchNos = mismatched.map((q) => q.no).sort((a, b) => a - b);
  const shownNos =
    mismatchNos.slice(0, 20).join(', ') + (mismatchNos.length > 20 ? `, dan ${mismatchNos.length - 20} soal lainnya` : '');

  return (
    <div className="space-y-2">
      <InfoNote>{summary.basisNote}</InfoNote>
      {s.totalParticipants === 0 && (
        <InfoNote tone="warning">
          {filtersActive
            ? 'Tidak ada peserta yang sesuai dengan filter yang dipilih.'
            : 'Belum ada peserta yang menyelesaikan paket ini.'}
        </InfoNote>
      )}
      {s.pendingGradingParticipants > 0 && (
        <InfoNote tone="warning">
          {fmtInt(s.pendingGradingParticipants)} peserta masih memiliki jawaban essay / studi kasus yang menunggu penilaian
          manual. Nilai dan status kelulusan mereka dapat berubah setelah dinilai.
        </InfoNote>
      )}
      {mismatchTotal > 0 && (
        <InfoNote tone="warning">
          {fmtInt(mismatchTotal)} jawaban pada soal No. {shownNos} memiliki status benar/salah tersimpan yang berbeda
          dengan kunci jawaban saat ini (indikasi kunci jawaban diubah setelah ujian). Statistik Benar/Salah tetap
          mengikuti penilaian tersimpan, sama dengan nilai peserta.
        </InfoNote>
      )}
      {summary.truncated && (
        <InfoNote tone="warning">
          Jumlah attempt paket ini melebihi batas aman pemuatan server, sehingga analisis hanya mencakup sebagian attempt.
        </InfoNote>
      )}
    </div>
  );
};

const SummaryTiles: React.FC<{ s: AnalyticsSummary }> = ({ s }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
    <StatTile
      label="Total Peserta"
      value={fmtInt(s.totalParticipants)}
      hint="attempt pertama"
      icon={<Users className="w-5 h-5" />}
    />
    <StatTile
      label="Total Attempt"
      value={fmtInt(s.totalAttempts)}
      hint="termasuk pengulangan"
      icon={<Repeat className="w-5 h-5" />}
    />
    <StatTile
      label="Rata-rata Nilai"
      value={fmtNum(s.avgScore, 2)}
      hint="skala 0–100"
      icon={<TrendingUp className="w-5 h-5" />}
    />
    <StatTile label="Nilai Tertinggi" value={fmtNum(s.maxScore, 2)} icon={<CircleArrowUp className="w-5 h-5" />} />
    <StatTile label="Nilai Terendah" value={fmtNum(s.minScore, 2)} icon={<CircleArrowDown className="w-5 h-5" />} />
    <StatTile
      label="Pass Rate"
      value={fmtPct(s.passRatePct, 2)}
      hint={`${fmtInt(s.passedCount)} dari ${fmtInt(s.totalParticipants)} lulus`}
      icon={<CheckCircle2 className="w-5 h-5" />}
    />
    <StatTile
      label="Rata-rata Jawaban Benar"
      value={fmtNum(s.avgCorrectObjective, 2)}
      hint={
        s.objectiveQuestionCount > 0 ? `dari ${fmtInt(s.objectiveQuestionCount)} soal objektif` : 'tidak ada soal objektif'
      }
      icon={<Target className="w-5 h-5" />}
    />
    <StatTile
      label="Total Tidak Menjawab"
      value={fmtInt(s.totalUnanswered)}
      hint="jawaban kosong, semua tipe"
      icon={<CircleMinus className="w-5 h-5" />}
    />
  </div>
);

const QuestionAnalysisTable: React.FC<{
  questions: QuestionStat[];
  materialAvailable: boolean;
  onOpenQuestion: (questionId: string) => void;
}> = ({ questions, materialAvailable, onOpenQuestion }) => {
  const sortSelectId = useId();
  const [sortKey, setSortKey] = useState<QuestionSortKey>('no');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const sorted = useMemo(() => sortQuestions(questions, sortKey, sortDir), [questions, sortKey, sortDir]);

  const handleSort = (key: QuestionSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(QUESTION_SORT_DEFAULT_DIR[key]);
    }
  };

  const sortTh = (key: QuestionSortKey, label: string, align: 'left' | 'right' = 'left') => (
    <SortableTh label={label} active={sortKey === key} dir={sortDir} onClick={() => handleSort(key)} align={align} />
  );

  // Pengurutan ringkas untuk layar kecil (header tabel tetap bisa diklik saat digeser).
  const mobileSort =
    questions.length > 1 ? (
      <div className="sm:hidden w-full">
        <label htmlFor={sortSelectId} className="sr-only">
          Urutkan soal
        </label>
        <select
          id={sortSelectId}
          value={`${sortKey}:${sortDir}`}
          onChange={(e) => {
            const opt = QUESTION_SORT_OPTIONS.find((o) => `${o.key}:${o.dir}` === e.target.value);
            if (opt) {
              setSortKey(opt.key);
              setSortDir(opt.dir);
            }
          }}
          className={INPUT_CLASS}
        >
          {QUESTION_SORT_OPTIONS.map((o) => (
            <option key={`${o.key}:${o.dir}`} value={`${o.key}:${o.dir}`} className={OPTION_CLASS}>
              Urutkan: {o.label}
            </option>
          ))}
        </select>
      </div>
    ) : undefined;

  return (
    <SectionCard
      title="Analisis Soal"
      subtitle="Statistik per butir soal · klik baris untuk melihat detail soal dan distribusi jawaban"
      actions={mobileSort}
    >
      {questions.length === 0 ? (
        <EmptyState message="Paket ini belum memiliki soal." />
      ) : (
        <>
          <div className={TABLE_WRAP}>
            <table className={`${TABLE_CLASS} ${materialAvailable ? 'min-w-[1000px]' : 'min-w-[900px]'}`}>
              <thead className={THEAD_CLASS}>
                <tr>
                  {sortTh('no', 'No')}
                  <th scope="col" className={TH}>Soal</th>
                  <th scope="col" className={TH}>Tipe</th>
                  {materialAvailable && <th scope="col" className={TH}>Materi</th>}
                  <th scope="col" className={`${TH} text-right`}>Total</th>
                  <th scope="col" className={`${TH} text-right`}>Benar</th>
                  {sortTh('wrong', 'Salah', 'right')}
                  {sortTh('empty', 'Kosong', 'right')}
                  {sortTh('pctCorrect', '% Benar', 'right')}
                  {sortTh('pctWrong', '% Salah', 'right')}
                  <th scope="col" className={TH}>Indikasi Kesulitan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {sorted.map((q) => {
                  const objective = isObjectiveType(q.type);
                  const open = () => onOpenQuestion(q.questionId);
                  return (
                    <tr key={q.questionId} onClick={open} className={ROW_CLICKABLE}>
                      <td className={`${TD} font-semibold text-slate-900 dark:text-white tabular-nums`}>{q.no}</td>
                      <td className={`${TD} min-w-[260px] max-w-[420px]`}>
                        <QuestionLink onOpen={open}>
                          <span className="line-clamp-2">{q.textPreview || '(Teks soal kosong)'}</span>
                        </QuestionLink>
                        {q.essay && (
                          <p className="mt-0.5 text-[10px] text-slate-500 dark:text-zinc-400">{essayHint(q.essay)}</p>
                        )}
                      </td>
                      <td className={`${TD} whitespace-nowrap`}>{q.typeLabel}</td>
                      {materialAvailable && <td className={TD}>{q.materi || '-'}</td>}
                      <td className={TD_NUM}>{fmtInt(q.total)}</td>
                      <td className={TD_NUM}>{objective ? fmtInt(q.correct) : DASH}</td>
                      <td className={TD_NUM}>{objective ? fmtInt(q.wrong) : DASH}</td>
                      <td className={TD_NUM}>{fmtInt(q.empty)}</td>
                      <td className={TD_NUM}>{objective ? fmtPct(q.pctCorrect, 2) : DASH}</td>
                      <td className={TD_NUM}>{objective ? fmtPct(q.pctWrong, 2) : DASH}</td>
                      <td className={TD}>{objective && q.difficulty ? <DifficultyBadge label={q.difficulty} /> : DASH}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3">
            <InfoNote>
              {DIFFICULTY_DISCLAIMER} Batas yang dipakai: Mudah ≥ {DIFFICULTY_THRESHOLDS.easyMinPct}% benar · Sedang{' '}
              {DIFFICULTY_THRESHOLDS.mediumMinPct}% sampai {'<'} {DIFFICULTY_THRESHOLDS.easyMinPct}% · Sulit {'<'}{' '}
              {DIFFICULTY_THRESHOLDS.mediumMinPct}%. Soal essay / studi kasus tidak diberi indikasi kesulitan.
            </InfoNote>
          </div>
        </>
      )}
    </SectionCard>
  );
};

const TopWrongTable: React.FC<{
  rows: QuestionStat[];
  materialAvailable: boolean;
  emptyMessage: string;
  onOpenQuestion: (questionId: string) => void;
  className?: string;
}> = ({ rows, materialAvailable, emptyMessage, onOpenQuestion, className = '' }) => (
  <SectionCard
    title="Top 10 Soal dengan Kesalahan Tertinggi"
    subtitle="Soal objektif dengan jawaban salah terbanyak · klik baris untuk detail"
    className={className}
  >
    {rows.length === 0 ? (
      <EmptyState message={emptyMessage} />
    ) : (
      <div className={TABLE_WRAP}>
        <table className={`${TABLE_CLASS} ${materialAvailable ? 'min-w-[620px]' : 'min-w-[520px]'}`}>
          <thead className={THEAD_CLASS}>
            <tr>
              <th scope="col" className={`${TH} text-right`}>Rank</th>
              <th scope="col" className={TH}>Soal</th>
              {materialAvailable && <th scope="col" className={TH}>Materi</th>}
              <th scope="col" className={`${TH} text-right`}>Salah</th>
              <th scope="col" className={`${TH} text-right`}>Total</th>
              <th scope="col" className={`${TH} text-right`}>% Salah</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
            {rows.map((q, i) => {
              const open = () => onOpenQuestion(q.questionId);
              return (
                <tr key={q.questionId} onClick={open} className={ROW_CLICKABLE}>
                  <td className={`${TD_NUM} font-semibold text-slate-900 dark:text-white`}>{i + 1}</td>
                  <td className={`${TD} min-w-[220px]`}>
                    <QuestionLink onOpen={open}>
                      <span className="font-semibold text-slate-900 dark:text-white">No. {q.no}</span>
                      <span className="line-clamp-2 text-slate-600 dark:text-zinc-400">{q.textPreview || '-'}</span>
                    </QuestionLink>
                  </td>
                  {materialAvailable && <td className={TD}>{q.materi || '-'}</td>}
                  <td className={`${TD_NUM} font-semibold text-slate-900 dark:text-white`}>{fmtInt(q.wrong)}</td>
                  <td className={TD_NUM}>{fmtInt(q.total)}</td>
                  <td className={TD_NUM}>{fmtPct(q.pctWrong, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}
  </SectionCard>
);

const MaterialTable: React.FC<{ materials: MaterialStat[]; className?: string }> = ({ materials, className = '' }) => (
  <SectionCard
    title="Analisis Materi"
    subtitle="Jawaban soal objektif per materi, diurutkan dari % benar terendah"
    className={className}
  >
    {materials.length === 0 ? (
      <EmptyState message="Belum ada data materi." />
    ) : (
      <div className={TABLE_WRAP}>
        <table className={`${TABLE_CLASS} min-w-[520px]`}>
          <thead className={THEAD_CLASS}>
            <tr>
              <th scope="col" className={TH}>Materi</th>
              <th scope="col" className={`${TH} text-right`}>Jumlah Soal</th>
              <th scope="col" className={`${TH} text-right`}>Benar</th>
              <th scope="col" className={`${TH} text-right`}>Salah</th>
              <th scope="col" className={`${TH} text-right`}>Kosong</th>
              <th scope="col" className={`${TH} text-right`}>% Benar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
            {materials.map((m) => (
              <tr key={m.materi}>
                <td className={`${TD} font-semibold text-slate-900 dark:text-white`}>{m.materi}</td>
                <td className={TD_NUM}>
                  {fmtInt(m.questionCount)}
                  {m.objectiveQuestionCount !== m.questionCount && (
                    <span className="block text-[10px] font-normal text-slate-400 dark:text-zinc-500">
                      {fmtInt(m.objectiveQuestionCount)} objektif
                    </span>
                  )}
                </td>
                <td className={TD_NUM}>{fmtInt(m.correct)}</td>
                <td className={TD_NUM}>{fmtInt(m.wrong)}</td>
                <td className={TD_NUM}>{fmtInt(m.empty)}</td>
                <td className={`${TD_NUM} font-semibold text-slate-900 dark:text-white`}>{fmtPct(m.pctCorrect, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </SectionCard>
);

// ═══════════════════════════════════════════════════════════════
// Halaman utama
// ═══════════════════════════════════════════════════════════════

export const ExamAnalyticsDashboard: React.FC<ExamAnalyticsDashboardProps> = ({
  currentUser,
  exams,
  initialExamId,
  onToast,
}) => {
  const uid = useId();
  const fieldId = (name: string) => `${uid}-${name}`;
  const isNative = useMemo(() => Capacitor.isNativePlatform(), []);

  // onToast dari App dibuat ulang setiap render → bungkus agar identitasnya stabil untuk modal.
  const toastRef = useRef<ToastFn>(onToast);
  useEffect(() => {
    toastRef.current = onToast;
  }, [onToast]);
  const toast = useCallback<ToastFn>((msg, type) => toastRef.current(msg, type), []);

  // ─── Paket yang boleh dianalisis (aturan sama dengan Rekap Nilai), terbaru dulu ───
  const hasAccess = isAnalyticsRole(currentUser?.role);
  const visibleExams = useMemo(
    () =>
      exams
        .filter((e) => canViewExamAnalytics(currentUser, e))
        .sort((a, b) => createdAtMs(b) - createdAtMs(a) || (a.title || '').localeCompare(b.title || '', 'id')),
    [exams, currentUser]
  );
  const visibleIds = useMemo(() => new Set(visibleExams.map((e) => e.id)), [visibleExams]);

  // ─── Pilihan paket: initialExamId → terakhir dipilih (localStorage) → belum ada ───
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const pendingInitialRef = useRef<string | null>(initialExamId || null);
  const prevInitialRef = useRef<string | null>(initialExamId || null);

  useEffect(() => {
    const next = initialExamId || null;
    if (next && next !== prevInitialRef.current) pendingInitialRef.current = next;
    prevInitialRef.current = next;
  }, [initialExamId]);

  useEffect(() => {
    const pending = pendingInitialRef.current;
    if (pending && visibleIds.has(pending)) {
      pendingInitialRef.current = null;
      storeExamId(pending);
      if (pending !== selectedExamId) setSelectedExamId(pending);
      return;
    }
    // Daftar paket sudah termuat tetapi paket awal tidak boleh dilihat → abaikan.
    if (pending && visibleIds.size > 0) pendingInitialRef.current = null;
    if (selectedExamId && visibleIds.has(selectedExamId)) return;
    const stored = readStoredExamId();
    const next = stored && visibleIds.has(stored) ? stored : null;
    if (next !== selectedExamId) setSelectedExamId(next);
  }, [visibleIds, initialExamId, selectedExamId]);

  const examId = selectedExamId && visibleIds.has(selectedExamId) ? selectedExamId : null;

  const handleSelectExam = (id: string) => {
    if (!id || !visibleIds.has(id)) return;
    pendingInitialRef.current = null;
    storeExamId(id);
    setSelectedExamId(id);
  };

  // ─── Filter (berlaku ke seluruh isi halaman) ───
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_DRAFT);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const updateDraft = (patch: Partial<FilterDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const dateRangeInvalid = !!draft.fromDate && !!draft.toDate && draft.fromDate > draft.toDate;
  const appliedFilters = useMemo<AnalyticsFilters>(
    () => ({
      company: draft.company || null,
      department: draft.department || null,
      from: localDateToIsoStart(draft.fromDate),
      to: localDateToIsoEnd(draft.toDate),
    }),
    [draft.company, draft.department, draft.fromDate, draft.toDate]
  );
  const filtersKey = JSON.stringify(filtersToQuery(appliedFilters));
  const requestKey = examId ? `${examId}|${filtersKey}` : null;
  const activeFilterCount = [draft.company, draft.department, draft.fromDate, draft.toDate].filter(Boolean).length;

  // ─── Ringkasan analitik ───
  const [loaded, setLoaded] = useState<LoadedSummary | null>(null);
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [loading, setLoading] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const freshRef = useRef(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!examId || dateRangeInvalid) {
      requestIdRef.current += 1; // abaikan respons yang masih berjalan
      setLoading(false);
      return;
    }
    // Penjaga urutan respons: hanya permintaan terakhir yang boleh mengubah tampilan.
    const reqId = ++requestIdRef.current;
    const key = `${examId}|${filtersKey}`;
    const filters = appliedFilters;
    const fresh = freshRef.current;
    freshRef.current = false;
    setLoading(true);
    analyticsGetJson<ExamAnalyticsSummaryResponse>(ANALYTICS_ENDPOINTS.summary(examId), {
      ...filtersToQuery(filters),
      [QUERY_KEYS.fresh]: fresh ? 1 : undefined,
    })
      .then((data) => {
        if (reqId !== requestIdRef.current) return;
        if (isSummaryResponse(data)) {
          setLoaded({ key, data, filters });
          setLoadError(null);
        } else {
          setLoadError({ key, message: INVALID_RESPONSE_MESSAGE, code: 'internal' });
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (reqId !== requestIdRef.current) return;
        setLoadError({
          key,
          message: describeAnalyticsError(err),
          code: err instanceof AnalyticsApiError ? err.code : null,
        });
        setLoading(false);
      });
  }, [examId, filtersKey, appliedFilters, dateRangeInvalid, reloadNonce]);

  useEffect(
    () => () => {
      requestIdRef.current += 1;
    },
    []
  );

  const summary = loaded?.data ?? null;
  const displayFilters = loaded?.filters ?? appliedFilters;
  const isCurrent = !!loaded && loaded.key === requestKey;
  // Saat memuat ulang, tampilan sebelumnya tetap ada (redup) — tanpa skeleton / lompatan layout.
  const isRefreshing = !!loaded && (loading || !isCurrent);
  const currentError = loadError && loadError.key === requestKey && !loading ? loadError : null;
  const filterOptions = summary && summary.exam.id === examId ? summary.filterOptions : null;
  const companyOptions = withCurrent(filterOptions?.companies ?? [], draft.company);
  const departmentOptions = withCurrent(filterOptions?.departments ?? [], draft.department);
  const topWrong = useMemo(() => (summary ? topWrongQuestions(summary.questions) : []), [summary]);

  // ─── Modal detail ───
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const openQuestion = useCallback((id: string) => setActiveQuestionId(id), []);
  const closeQuestion = useCallback(() => setActiveQuestionId(null), []);
  const openParticipant = useCallback((id: string) => setActiveUserId(id), []);
  const closeParticipant = useCallback(() => setActiveUserId(null), []);

  useEffect(() => {
    setActiveQuestionId(null);
    setActiveUserId(null);
  }, [examId]);

  // ─── Aksi ───
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const actionsReady = !!summary && isCurrent && !loading;
  const canExport = !!summary?.capabilities?.canExport;

  const handleDownload = async () => {
    if (!summary || !actionsReady || downloading) return;
    setDownloading(true);
    try {
      const fileName = await analyticsDownload(
        ANALYTICS_ENDPOINTS.analyticsExport(summary.exam.id),
        filtersToQuery(displayFilters),
        `Analisis_${safeFilePart(summary.exam.title)}_${localDateStamp()}.xlsx`
      );
      toast(`File ${fileName} berhasil diunduh.`, 'success');
    } catch (err) {
      toast(describeAnalyticsError(err), 'error');
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = async () => {
    if (!summary || !actionsReady || printing) return;
    setPrinting(true);
    try {
      await printAnalyticsReport({ summary, filters: displayFilters, onToast: toast });
    } catch (err) {
      toast(describeAnalyticsError(err), 'error');
    } finally {
      setPrinting(false);
    }
  };

  const handleReload = () => {
    if (!examId || dateRangeInvalid) return;
    freshRef.current = true; // fresh=1 → server melewati cache dataset
    setReloadNonce((n) => n + 1);
  };

  const handleRetry = () => setReloadNonce((n) => n + 1);

  // ─── Render ───
  const showFilters = hasAccess && visibleExams.length > 0;
  const showActions = !!summary && !!examId && !currentError && (canExport || !isNative);

  const reloadButton = (
    <button
      type="button"
      onClick={handleReload}
      disabled={!examId || dateRangeInvalid}
      title="Muat ulang data terbaru dari server"
      className={`${BTN_SECONDARY} justify-center whitespace-nowrap`}
    >
      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
      <span>Muat Ulang</span>
    </button>
  );

  let body: React.ReactNode;
  if (!hasAccess) {
    body = (
      <NoticeCard
        icon={<ClipboardList className="w-5 h-5" />}
        title="Akses analitik tidak tersedia"
        message="Akun Anda tidak memiliki akses ke fitur analitik paket ujian."
      />
    );
  } else if (visibleExams.length === 0) {
    body = (
      <NoticeCard
        icon={<ClipboardList className="w-5 h-5" />}
        title="Belum ada paket ujian yang dapat dianalisis"
        message="Paket ujian yang tampil di sini mengikuti akses company akun Anda."
      />
    );
  } else if (!examId) {
    body = (
      <NoticeCard
        icon={<PackageSearch className="w-5 h-5" />}
        title="Pilih paket ujian untuk melihat analisis"
        message="Gunakan pilihan Paket Ujian di atas. Daftar paket diurutkan dari yang terbaru."
      />
    );
  } else if (currentError) {
    const message =
      currentError.code === 'unavailable'
        ? `${currentError.message} Rekap nilai pada tab Scores tetap dapat digunakan.`
        : currentError.message;
    const retryable = currentError.code !== 'forbidden' && currentError.code !== 'not_found';
    body = (
      <div className={CARD_CLASS}>
        <ErrorState message={message} onRetry={retryable ? handleRetry : undefined} />
      </div>
    );
  } else if (!summary) {
    body = (
      <div className={CARD_CLASS}>
        <LoadingState message="Menghitung analisis paket..." />
      </div>
    );
  } else {
    const s = summary.summary;
    const topWrongEmpty =
      s.totalParticipants === 0
        ? 'Belum ada peserta pada filter ini.'
        : s.objectiveQuestionCount === 0
          ? 'Paket ini tidak memiliki soal objektif (pilihan ganda / benar-salah).'
          : 'Tidak ada jawaban salah pada soal objektif.';

    body = (
      <div
        className={`space-y-4 sm:space-y-6 transition-opacity duration-200 ${
          isRefreshing ? 'opacity-60 pointer-events-none select-none' : ''
        }`}
        aria-busy={isRefreshing}
      >
        <ExamInfoCard summary={summary} />
        <SummaryNotes summary={summary} filtersActive={Object.keys(filtersToQuery(displayFilters)).length > 0} />
        <SummaryTiles s={s} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <ScoreDistributionChart
            bins={summary.scoreDistribution}
            totalParticipants={s.totalParticipants}
            className="lg:col-span-2 h-full"
          />
          <PassFailMeter
            passed={s.passedCount}
            failed={s.failedCount}
            pending={s.pendingGradingParticipants}
            className="h-full"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <TopWrongChart questions={topWrong} emptyMessage={topWrongEmpty} onOpenQuestion={openQuestion} className="h-full" />
          <TopWrongTable
            rows={topWrong}
            materialAvailable={summary.materialAvailable}
            emptyMessage={topWrongEmpty}
            onOpenQuestion={openQuestion}
            className="h-full"
          />
        </div>

        <QuestionAnalysisTable
          questions={summary.questions}
          materialAvailable={summary.materialAvailable}
          onOpenQuestion={openQuestion}
        />

        {summary.materialAvailable ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <MaterialPerformanceChart materials={summary.materials} className="h-full" />
            <MaterialTable materials={summary.materials} className="h-full" />
          </div>
        ) : (
          <SectionCard title="Analisis Materi">
            <InfoNote>{MATERIAL_UNAVAILABLE_MESSAGE}</InfoNote>
          </SectionCard>
        )}

        <ParticipantsSection
          key={summary.exam.id}
          examId={summary.exam.id}
          filters={displayFilters}
          dataVersion={summary.generatedAt}
          onOpenParticipant={openParticipant}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 text-slate-800 dark:text-zinc-200">
      {/* Header */}
      <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 sm:p-6 ${CARD_CLASS}`}>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white tracking-tight">Analisis Paket Ujian</h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1.5 leading-relaxed">
            Distribusi nilai, analisis butir soal, materi, dan peserta per paket ujian — dihitung langsung dari jawaban
            tersimpan.
          </p>
        </div>
        {showActions && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
            {canExport && (
              <button
                type="button"
                onClick={handleDownload}
                disabled={!actionsReady || downloading}
                className={`${BTN_SUCCESS} justify-center`}
              >
                {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                <span>{downloading ? 'Menyiapkan file...' : 'Download Analisis (Excel)'}</span>
              </button>
            )}
            {!isNative && (
              <button
                type="button"
                onClick={handlePrint}
                disabled={!actionsReady || printing}
                className={`${BTN_SECONDARY} justify-center`}
              >
                {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                <span>Cetak / PDF</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Filter: satu baris di atas seluruh isi yang dipengaruhinya */}
      {showFilters && (
        <div className={`p-4 space-y-3 ${CARD_CLASS}`}>
          <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-end gap-3">
            <Field label="Paket Ujian" htmlFor={fieldId('exam')} className="lg:flex-[2] lg:min-w-[240px]">
              <select
                id={fieldId('exam')}
                value={examId ?? ''}
                onChange={(e) => handleSelectExam(e.target.value)}
                className={INPUT_CLASS}
              >
                {!examId && (
                  <option value="" disabled className={OPTION_CLASS}>
                    Pilih paket ujian...
                  </option>
                )}
                {visibleExams.map((e) => (
                  <option key={e.id} value={e.id} className={OPTION_CLASS}>
                    {e.title} · {e.scope || 'BANK'}
                  </option>
                ))}
              </select>
            </Field>

            {/* Mobile: filter dilipat di balik tombol "Filter" */}
            <div className="flex gap-2 sm:hidden">
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
                aria-controls={fieldId('panel')}
                className={`${BTN_SECONDARY} flex-1 justify-center`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
              </button>
              {reloadButton}
            </div>

            <div
              id={fieldId('panel')}
              className={`${filtersOpen ? 'flex' : 'hidden'} sm:flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3 lg:flex-[5]`}
            >
              <Field label="Company" htmlFor={fieldId('company')} className="sm:flex-1 sm:min-w-[130px]">
                <select
                  id={fieldId('company')}
                  value={draft.company}
                  onChange={(e) => updateDraft({ company: e.target.value })}
                  className={INPUT_CLASS}
                >
                  <option value="" className={OPTION_CLASS}>
                    Semua
                  </option>
                  {companyOptions.map((c) => (
                    <option key={c} value={c} className={OPTION_CLASS}>
                      {companyLabel(c)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Department" htmlFor={fieldId('department')} className="sm:flex-1 sm:min-w-[160px]">
                <select
                  id={fieldId('department')}
                  value={draft.department}
                  onChange={(e) => updateDraft({ department: e.target.value })}
                  className={INPUT_CLASS}
                >
                  <option value="" className={OPTION_CLASS}>
                    Semua
                  </option>
                  {departmentOptions.map((d) => (
                    <option key={d} value={d} className={OPTION_CLASS}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Periode Dari" htmlFor={fieldId('from')} className="sm:flex-1 sm:min-w-[140px]">
                <input
                  id={fieldId('from')}
                  type="date"
                  value={draft.fromDate}
                  max={draft.toDate || undefined}
                  onChange={(e) => updateDraft({ fromDate: e.target.value })}
                  className={`${INPUT_CLASS} dark:scheme-dark`}
                />
              </Field>
              <Field label="Periode Sampai" htmlFor={fieldId('to')} className="sm:flex-1 sm:min-w-[140px]">
                <input
                  id={fieldId('to')}
                  type="date"
                  value={draft.toDate}
                  min={draft.fromDate || undefined}
                  onChange={(e) => updateDraft({ toDate: e.target.value })}
                  className={`${INPUT_CLASS} dark:scheme-dark`}
                />
              </Field>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDraft(EMPTY_DRAFT)}
                  disabled={activeFilterCount === 0}
                  className={`${BTN_SECONDARY} flex-1 sm:flex-none justify-center`}
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Reset</span>
                </button>
                <div className="hidden sm:block">{reloadButton}</div>
              </div>
            </div>
          </div>
          {dateRangeInvalid && (
            <InfoNote tone="warning">
              Tanggal "Periode Dari" tidak boleh setelah "Periode Sampai". Perbaiki rentang tanggal untuk memuat analisis.
            </InfoNote>
          )}
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {loading ? 'Memuat analisis...' : ''}
      </p>

      {body}

      {/* Modal peserta dirender dulu, modal soal sesudahnya agar tampil di atasnya. */}
      {summary && activeUserId && (
        <ParticipantDetailModal
          examId={summary.exam.id}
          userId={activeUserId}
          filters={displayFilters}
          onClose={closeParticipant}
          onToast={toast}
          onOpenQuestion={openQuestion}
        />
      )}
      {summary && activeQuestionId && (
        <QuestionDetailModal
          examId={summary.exam.id}
          questionId={activeQuestionId}
          filters={displayFilters}
          onClose={closeQuestion}
          onToast={toast}
        />
      )}
    </div>
  );
};
