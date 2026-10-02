import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, MinusCircle } from 'lucide-react';
import { ANALYTICS_ENDPOINTS, STATUS_LABELS, filtersToQuery } from '../../../lib/analytics/contract';
import type {
  AnalyticsFilters,
  EssayState,
  ParticipantDetailResponse,
  ParticipantEssayQuestion,
  ParticipantWrongQuestion,
} from '../../../lib/analytics/contract';
import { analyticsGetJson, describeAnalyticsError } from '../../../lib/analyticsApi';
import { companyLabel, fmtDateTime, fmtDuration, fmtInt, fmtNum } from './format';
import {
  BTN_SECONDARY,
  EmptyState,
  ErrorState,
  InfoNote,
  LoadingState,
  ModalShell,
  StatTile,
  StatusBadge,
  TABLE_CLASS,
  THEAD_CLASS,
} from './ui';
import { describeFiltersText, formatAnswerText } from './analyticsPrint';
import { NonCorrectBadge } from './QuestionDetailModal';

type ToastFn = (msg: string, type?: 'success' | 'info' | 'error') => void;

interface ParticipantDetailModalProps {
  examId: string;
  userId: string;
  filters: AnalyticsFilters;
  onClose: () => void;
  onToast: ToastFn;
  onOpenQuestion?: (questionId: string) => void;
}

const H4_CLASS = 'text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider';
const TABLE_WRAP_CLASS = 'rounded-xl border border-slate-200/80 dark:border-zinc-800 overflow-hidden';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 uppercase tracking-wider">{label}</dt>
    <dd className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5 break-words">{children}</dd>
  </div>
);

const ESSAY_STATE_LABELS: Record<EssayState, string> = {
  empty: 'Kosong',
  pending: 'Menunggu penilaian',
  graded: 'Sudah dinilai',
};

const EssayStateBadge: React.FC<{ state: EssayState }> = ({ state }) => {
  const cls =
    state === 'pending'
      ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-900/40'
      : state === 'graded'
        ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-900/40'
        : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-700';
  const Icon = state === 'pending' ? Clock : state === 'graded' ? CheckCircle2 : MinusCircle;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold whitespace-nowrap ${cls}`}>
      <Icon className="w-3 h-3" />
      <span>{ESSAY_STATE_LABELS[state] ?? state}</span>
    </span>
  );
};

/** Props baris yang bisa diklik (mouse & keyboard) untuk membuka detail soal. */
function clickableRowProps(questionId: string, onOpenQuestion?: (questionId: string) => void) {
  if (!onOpenQuestion) return { className: '' };
  return {
    className:
      'cursor-pointer hover:bg-slate-50/80 dark:hover:bg-zinc-950/40 focus:outline-none focus-visible:bg-indigo-50/60 dark:focus-visible:bg-indigo-950/20',
    tabIndex: 0,
    title: 'Lihat detail soal',
    onClick: () => onOpenQuestion(questionId),
    onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onOpenQuestion(questionId);
      }
    },
  };
}

const WrongQuestionsTable: React.FC<{
  rows: ParticipantWrongQuestion[];
  materialAvailable: boolean;
  onOpenQuestion?: (questionId: string) => void;
}> = ({ rows, materialAvailable, onOpenQuestion }) => (
  <div className={TABLE_WRAP_CLASS}>
    <div className="overflow-x-auto">
      <table className={`${TABLE_CLASS} ${materialAvailable ? 'min-w-[820px]' : 'min-w-[700px]'}`}>
        <thead className={THEAD_CLASS}>
          <tr>
            <th scope="col" className="px-3 py-2.5 text-right">No</th>
            {materialAvailable && <th scope="col" className="px-3 py-2.5">Materi</th>}
            <th scope="col" className="px-3 py-2.5">Soal</th>
            <th scope="col" className="px-3 py-2.5">Jawaban Peserta</th>
            <th scope="col" className="px-3 py-2.5">Jawaban Benar</th>
            <th scope="col" className="px-3 py-2.5 text-right" title="Bobot soal">Poin</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
          {rows.map((q) => {
            const { className, ...rowProps } = clickableRowProps(q.questionId, onOpenQuestion);
            return (
              <tr key={q.questionId} className={className} {...rowProps}>
                <td className="px-3 py-2 align-top text-right tabular-nums font-bold text-slate-900 dark:text-white">{q.no}</td>
                {materialAvailable && <td className="px-3 py-2 align-top">{q.materi || '-'}</td>}
                <td className="px-3 py-2 align-top">
                  <span className="block text-slate-800 dark:text-zinc-200 break-words">{q.textPreview || '-'}</span>
                  <span className="block text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">{q.typeLabel}</span>
                </td>
                <td className="px-3 py-2 align-top">
                  <div className="flex flex-col items-start gap-1">
                    <NonCorrectBadge status={q.status} />
                    {q.status === 'wrong' && <span className="break-words">{formatAnswerText(q.answerLabel, q.answerText)}</span>}
                  </div>
                </td>
                <td className="px-3 py-2 align-top break-words">{formatAnswerText(q.correctLabel, q.correctText)}</td>
                <td className="px-3 py-2 align-top text-right tabular-nums">{fmtNum(q.maxPoints)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

const EssayQuestionsTable: React.FC<{
  rows: ParticipantEssayQuestion[];
  onOpenQuestion?: (questionId: string) => void;
}> = ({ rows, onOpenQuestion }) => (
  <div className={TABLE_WRAP_CLASS}>
    <div className="overflow-x-auto">
      <table className={`${TABLE_CLASS} min-w-[560px]`}>
        <thead className={THEAD_CLASS}>
          <tr>
            <th scope="col" className="px-3 py-2.5 text-right">No</th>
            <th scope="col" className="px-3 py-2.5">Soal</th>
            <th scope="col" className="px-3 py-2.5">Status</th>
            <th scope="col" className="px-3 py-2.5 text-right">Poin</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
          {rows.map((q) => {
            const { className, ...rowProps } = clickableRowProps(q.questionId, onOpenQuestion);
            return (
              <tr key={q.questionId} className={className} {...rowProps}>
                <td className="px-3 py-2 align-top text-right tabular-nums font-bold text-slate-900 dark:text-white">{q.no}</td>
                <td className="px-3 py-2 align-top">
                  <span className="block text-slate-800 dark:text-zinc-200 break-words">{q.textPreview || '-'}</span>
                  <span className="block text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5">{q.typeLabel}</span>
                </td>
                <td className="px-3 py-2 align-top">
                  <EssayStateBadge state={q.state} />
                </td>
                <td className="px-3 py-2 align-top text-right tabular-nums whitespace-nowrap">
                  {q.state === 'pending' ? '-' : fmtNum(q.pointsEarned, 2)} / {fmtNum(q.maxPoints)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

const ParticipantDetailBody: React.FC<{
  data: ParticipantDetailResponse;
  onOpenQuestion?: (questionId: string) => void;
}> = ({ data, onOpenQuestion }) => {
  const p = data.participant;
  const wrongCount = data.wrongQuestions.filter((q) => q.status === 'wrong').length;
  const emptyCount = data.wrongQuestions.length - wrongCount;
  const isPending = p.status === STATUS_LABELS.pending;

  return (
    <>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 p-4 bg-slate-50 dark:bg-zinc-950 border border-slate-200/80 dark:border-zinc-800 rounded-xl">
        <Field label="Nama">{p.name}</Field>
        <Field label="Company">{companyLabel(p.company)}</Field>
        <Field label="Department">{p.department || '-'}</Field>
        <Field label="Paket Ujian">{data.exam.title}</Field>
        <Field label="Nilai">
          <span className="text-sm font-black">{fmtNum(p.score, 2)}</span>
          <span className="text-[10px] font-normal text-slate-400 dark:text-zinc-500"> / 100</span>
          {data.exam.passingScore !== null && (
            <span className="block text-[10px] font-normal text-slate-400 dark:text-zinc-500">
              Passing score {fmtNum(data.exam.passingScore, 2)}
            </span>
          )}
        </Field>
        <Field label="Status">
          <StatusBadge status={p.status} />
        </Field>
        <Field label="Jumlah Attempt">{fmtInt(p.attemptCount)}</Field>
        <Field label="Waktu Selesai">{fmtDateTime(p.completedAt)}</Field>
        <Field label="Durasi">{fmtDuration(p.durationSeconds)}</Field>
      </dl>

      {p.attemptCount > 1 && (
        <InfoNote>
          Peserta ini memiliki {fmtInt(p.attemptCount)} attempt pada paket ini; analisis memakai attempt pertama.
        </InfoNote>
      )}
      {isPending && (
        <InfoNote tone="warning">
          Masih ada jawaban essay / studi kasus yang menunggu penilaian manual; nilai dapat berubah setelah dinilai.
        </InfoNote>
      )}

      <section className="space-y-3">
        <h4 className={H4_CLASS}>Statistik</h4>
        <div className={`grid grid-cols-2 gap-3 ${p.pendingEssay > 0 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
          <StatTile label="Benar" value={fmtInt(p.correct)} hint="soal objektif" />
          <StatTile label="Salah" value={fmtInt(p.wrong)} hint="soal objektif" />
          <StatTile label="Kosong" value={fmtInt(p.empty)} hint="semua tipe soal" />
          {p.pendingEssay > 0 && (
            <StatTile label="Menunggu Penilaian" value={fmtInt(p.pendingEssay)} hint="essay / studi kasus" />
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className={H4_CLASS}>Soal yang Salah</h4>
          <span className="text-[11px] text-slate-500 dark:text-zinc-400">
            {fmtInt(wrongCount)} salah · {fmtInt(emptyCount)} tidak menjawab (soal objektif)
          </span>
        </div>
        {data.wrongQuestions.length === 0 ? (
          <EmptyState message="Tidak ada soal objektif yang dijawab salah atau tidak dijawab." />
        ) : (
          <>
            {onOpenQuestion && (
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">Klik baris untuk melihat detail analisis soal.</p>
            )}
            <WrongQuestionsTable
              rows={data.wrongQuestions}
              materialAvailable={data.materialAvailable}
              onOpenQuestion={onOpenQuestion}
            />
          </>
        )}
      </section>

      {data.essayQuestions.length > 0 && (
        <section className="space-y-3">
          <h4 className={H4_CLASS}>Soal Essay / Studi Kasus</h4>
          <EssayQuestionsTable rows={data.essayQuestions} onOpenQuestion={onOpenQuestion} />
        </section>
      )}
    </>
  );
};

export const ParticipantDetailModal: React.FC<ParticipantDetailModalProps> = ({
  examId,
  userId,
  filters,
  onClose,
  onOpenQuestion,
}) => {
  const [data, setData] = useState<ParticipantDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reqIdRef = useRef(0);
  const rootRef = useRef<HTMLDivElement>(null);
  // Kunci stabil agar objek filter baru dengan isi sama tidak memicu fetch ulang.
  const queryKey = JSON.stringify(filtersToQuery(filters));

  const load = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await analyticsGetJson<ParticipantDetailResponse>(
        ANALYTICS_ENDPOINTS.participantDetail(examId, userId),
        JSON.parse(queryKey) as Record<string, string>
      );
      if (reqId !== reqIdRef.current) return;
      setData(res);
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setError(describeAnalyticsError(err));
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [examId, userId, queryKey]);

  useEffect(() => {
    void load();
    return () => {
      // Abaikan respons yang datang setelah unmount / ganti peserta.
      reqIdRef.current += 1;
    };
  }, [load]);

  // Escape / tombol tutup hanya berlaku bila modal ini yang paling atas
  // (detail soal bisa dibuka di atas modal ini).
  const handleClose = useCallback(() => {
    const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
    const top = dialogs[dialogs.length - 1];
    if (top && rootRef.current && !top.contains(rootRef.current)) return;
    onClose();
  }, [onClose]);

  const filterText = describeFiltersText(filters);
  const subtitle = data ? (
    <>
      <span className="font-semibold">{data.participant.name}</span>
      <span> · {data.exam.title}</span>
      {filterText && <span className="block text-[11px] text-slate-400 dark:text-zinc-500">Filter: {filterText}</span>}
    </>
  ) : undefined;

  const footer = (
    <button type="button" onClick={handleClose} className={BTN_SECONDARY}>
      Tutup
    </button>
  );

  return (
    <ModalShell title="Analisis Peserta" subtitle={subtitle} onClose={handleClose} footer={footer}>
      <div ref={rootRef} className="space-y-5">
        {loading ? (
          <LoadingState message="Memuat analisis peserta..." />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : data ? (
          <ParticipantDetailBody data={data} onOpenQuestion={onOpenQuestion} />
        ) : null}
      </div>
    </ModalShell>
  );
};
