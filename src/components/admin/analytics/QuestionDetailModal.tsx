import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, CheckCircle2, Download, Loader2, MinusCircle, XCircle } from 'lucide-react';
import {
  ANALYTICS_ENDPOINTS,
  DIFFICULTY_DISCLAIMER,
  QUESTION_NON_CORRECT_ROWS_MAX,
  filtersToQuery,
  isObjectiveType,
} from '../../../lib/analytics/contract';
import type {
  AnalyticsFilters,
  NonCorrectStatus,
  OptionDistributionRow,
  ParticipantAnswerRow,
  QuestionDetailResponse,
} from '../../../lib/analytics/contract';
import { analyticsDownload, analyticsGetJson, describeAnalyticsError } from '../../../lib/analyticsApi';
import { CHART_COLORS, companyLabel, fmtDateTime, fmtInt, fmtNum, fmtPct, localDateStamp } from './format';
import {
  BTN_SECONDARY,
  BTN_SUCCESS,
  DifficultyBadge,
  EmptyState,
  ErrorState,
  InfoNote,
  LoadingState,
  ModalShell,
  StatTile,
  TABLE_CLASS,
  THEAD_CLASS,
} from './ui';
import { describeFiltersText, difficultyThresholdText, formatAnswerText } from './analyticsPrint';

type ToastFn = (msg: string, type?: 'success' | 'info' | 'error') => void;

interface QuestionDetailModalProps {
  examId: string;
  questionId: string;
  filters: AnalyticsFilters;
  onClose: () => void;
  onToast: ToastFn;
}

/** Jumlah baris "Peserta yang Salah" yang dirender per langkah (daftar bisa ribuan). */
const ROWS_STEP = 200;

const pct2 = (n: number | null | undefined) => fmtPct(n, 2);

const H4_CLASS = 'text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider';
const TABLE_WRAP_CLASS = 'rounded-xl border border-slate-200/80 dark:border-zinc-800 overflow-hidden';

/** Label Salah / Tidak menjawab (ikon + teks, tidak hanya warna). */
export const NonCorrectBadge: React.FC<{ status: NonCorrectStatus }> = ({ status }) =>
  status === 'empty' ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold whitespace-nowrap bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 border-slate-200 dark:border-zinc-700">
      <MinusCircle className="w-3 h-3" />
      <span>Tidak menjawab</span>
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold whitespace-nowrap bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400 border-rose-200/60 dark:border-rose-900/40">
      <XCircle className="w-3 h-3" />
      <span>Salah</span>
    </span>
  );

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} dan ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, dan ${items[items.length - 1]}`;
}

/** Kalimat fakta deterministik dari distribusi jawaban (tanpa interpretasi / dugaan penyebab). */
function distributionFacts(rows: OptionDistributionRow[], total: number, isMC: boolean): string[] {
  if (!total) return [];
  const optionName = (r: OptionDistributionRow) => (isMC ? r.label : `“${r.label}”`);
  const share = (r: OptionDistributionRow) => `${pct2(r.pct)} peserta (${fmtInt(r.count)} dari ${fmtInt(total)})`;
  const facts: string[] = [];

  const key = rows.find((r) => r.kind === 'option' && r.isCorrect);
  if (key) facts.push(`Kunci jawaban (opsi ${optionName(key)}) dipilih oleh ${share(key)}.`);

  const others = rows.filter((r) => r.kind === 'option' && !r.isCorrect && r.count > 0);
  if (others.length) {
    const max = Math.max(...others.map((r) => r.count));
    const top = others.filter((r) => r.count === max);
    facts.push(
      top.length === 1
        ? `Opsi ${optionName(top[0])} dipilih oleh ${share(top[0])} — terbanyak di antara opsi selain kunci jawaban.`
        : `Opsi ${joinList(top.map(optionName))} masing-masing dipilih oleh ${share(top[0])} — terbanyak di antara opsi selain kunci jawaban.`
    );
  }

  const empty = rows.find((r) => r.kind === 'empty');
  if (empty && empty.count > 0) {
    facts.push(`${fmtInt(empty.count)} peserta (${pct2(empty.pct)}) tidak menjawab soal ini.`);
  }
  const unknown = rows.find((r) => r.kind === 'unknown');
  if (unknown && unknown.count > 0) {
    facts.push(`${fmtInt(unknown.count)} jawaban (${pct2(unknown.pct)}) berisi opsi yang tidak ada pada soal saat ini.`);
  }
  return facts;
}

const PctBar: React.FC<{ pct: number | null }> = ({ pct }) => {
  const width = typeof pct === 'number' && Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
  return (
    <div className="flex items-center gap-2 min-w-[150px]">
      <div className="h-1.5 w-24 sm:w-32 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden shrink-0" aria-hidden="true">
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: CHART_COLORS.series }} />
      </div>
      <span className="tabular-nums text-slate-700 dark:text-zinc-300">{pct2(pct)}</span>
    </div>
  );
};

const OptionChip: React.FC<{ label: string; highlight?: boolean }> = ({ label, highlight }) => (
  <span
    className={`min-w-5 h-5 px-1 rounded-md flex items-center justify-center text-[10px] font-black border shrink-0 ${
      highlight
        ? 'bg-white dark:bg-zinc-900 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
        : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-700 text-slate-600 dark:text-zinc-300'
    }`}
  >
    {label}
  </span>
);

const DistributionChoice: React.FC<{ row: OptionDistributionRow; isMC: boolean }> = ({ row, isMC }) => {
  if (row.kind === 'empty') return <span className="italic text-slate-500 dark:text-zinc-400">Tidak menjawab</span>;
  if (row.kind === 'unknown') {
    return (
      <span>
        <span className="font-semibold text-slate-800 dark:text-zinc-200">{row.label}</span>
        {row.text && <span className="block text-[10px] text-slate-400 dark:text-zinc-500">{row.text}</span>}
      </span>
    );
  }
  if (!isMC) return <span className="font-semibold text-slate-800 dark:text-zinc-200">{row.text || row.label}</span>;
  return (
    <span className="flex items-start gap-2">
      <OptionChip label={row.label} highlight={row.isCorrect} />
      <span className="whitespace-pre-line break-words text-slate-700 dark:text-zinc-300">{row.text || '-'}</span>
    </span>
  );
};

const DistributionStatus: React.FC<{ row: OptionDistributionRow }> = ({ row }) => {
  if (row.kind !== 'option') return <span className="text-slate-400 dark:text-zinc-500">-</span>;
  if (row.isCorrect) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold whitespace-nowrap bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-900/40">
        <CheckCircle2 className="w-3 h-3" />
        <span>BENAR</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400 whitespace-nowrap">
      <XCircle className="w-3 h-3" />
      <span>Salah</span>
    </span>
  );
};

const DistributionTable: React.FC<{ rows: OptionDistributionRow[]; isMC: boolean }> = ({ rows, isMC }) => (
  <div className={TABLE_WRAP_CLASS}>
    <div className="overflow-x-auto">
      <table className={`${TABLE_CLASS} min-w-[560px]`}>
        <thead className={THEAD_CLASS}>
          <tr>
            <th scope="col" className="px-3 py-2.5">Pilihan</th>
            <th scope="col" className="px-3 py-2.5 text-right">Jumlah</th>
            <th scope="col" className="px-3 py-2.5">Persentase</th>
            <th scope="col" className="px-3 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
          {rows.map((r, idx) => (
            <tr key={`${r.optionId}-${idx}`} className={r.isCorrect ? 'bg-emerald-50/40 dark:bg-emerald-950/10' : ''}>
              <td className="px-3 py-2 align-top">
                <DistributionChoice row={r} isMC={isMC} />
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900 dark:text-white align-top">
                {fmtInt(r.count)}
              </td>
              <td className="px-3 py-2 align-top">
                <PctBar pct={r.pct} />
              </td>
              <td className="px-3 py-2 align-top">
                <DistributionStatus row={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

type ListMode = 'wrong' | 'empty' | 'all';

const NonCorrectSection: React.FC<{
  rows: ParticipantAnswerRow[];
  total: number;
  wrongCount: number;
  emptyCount: number;
  truncated: boolean;
}> = ({ rows, total, wrongCount, emptyCount, truncated }) => {
  const [mode, setMode] = useState<ListMode>('wrong');
  const [limit, setLimit] = useState(ROWS_STEP);

  const filtered = useMemo(() => (mode === 'all' ? rows : rows.filter((r) => r.status === mode)), [rows, mode]);
  // Jumlah pada tombol = statistik soal (tidak terpengaruh batas baris daftar).
  const modes: Array<{ key: ListMode; label: string; count: number }> = [
    { key: 'wrong', label: 'Salah', count: wrongCount },
    { key: 'empty', label: 'Tidak menjawab', count: emptyCount },
    { key: 'all', label: 'Semua', count: wrongCount + emptyCount },
  ];
  const expected = modes.find((m) => m.key === mode)?.count ?? filtered.length;
  const visible = filtered.slice(0, limit);
  const emptyMessage =
    total === 0
      ? 'Belum ada peserta yang mengerjakan soal ini.'
      : mode === 'wrong'
        ? 'Tidak ada peserta yang menjawab salah.'
        : mode === 'empty'
          ? 'Tidak ada peserta yang tidak menjawab.'
          : 'Semua peserta menjawab benar.';

  return (
    <div className="space-y-3">
      <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-slate-100 dark:bg-zinc-950 border border-slate-200/80 dark:border-zinc-800" role="group" aria-label="Tampilkan peserta">
        {modes.map((m) => (
          <button
            key={m.key}
            type="button"
            aria-pressed={mode === m.key}
            onClick={() => {
              setMode(m.key);
              setLimit(ROWS_STEP);
            }}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors ${
              mode === m.key
                ? 'bg-white dark:bg-zinc-800 text-indigo-700 dark:text-indigo-300 shadow-sm'
                : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {m.label} <span className="tabular-nums">({fmtInt(m.count)})</span>
          </button>
        ))}
      </div>

      {truncated && filtered.length < expected && (
        <InfoNote tone="warning">
          Daftar dibatasi {fmtInt(QUESTION_NON_CORRECT_ROWS_MAX)} baris: menampilkan {fmtInt(filtered.length)} dari{' '}
          {fmtInt(expected)} peserta pada pilihan ini.
        </InfoNote>
      )}

      {filtered.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <div className={TABLE_WRAP_CLASS}>
          <div className="overflow-x-auto">
            <table className={`${TABLE_CLASS} min-w-[760px]`}>
              <thead className={THEAD_CLASS}>
                <tr>
                  <th scope="col" className="px-3 py-2.5">Peserta</th>
                  <th scope="col" className="px-3 py-2.5">Company</th>
                  <th scope="col" className="px-3 py-2.5">Department</th>
                  <th scope="col" className="px-3 py-2.5">Jawaban</th>
                  <th scope="col" className="px-3 py-2.5">Jawaban Benar</th>
                  <th scope="col" className="px-3 py-2.5 text-right" title="Bobot soal">Poin</th>
                  <th scope="col" className="px-3 py-2.5">Waktu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {visible.map((r) => (
                  <tr key={`${r.attemptId}-${r.userId}`} className="hover:bg-slate-50/80 dark:hover:bg-zinc-950/40">
                    <td className="px-3 py-2 align-top font-semibold text-slate-900 dark:text-white">{r.name}</td>
                    <td className="px-3 py-2 align-top whitespace-nowrap">{companyLabel(r.company)}</td>
                    <td className="px-3 py-2 align-top">{r.department || '-'}</td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col items-start gap-1">
                        <NonCorrectBadge status={r.status} />
                        {r.status === 'wrong' && (
                          <span className="break-words">{formatAnswerText(r.answerLabel, r.answerText)}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top break-words">{formatAnswerText(r.correctLabel, r.correctText)}</td>
                    <td className="px-3 py-2 align-top text-right tabular-nums">{fmtNum(r.maxPoints)}</td>
                    <td className="px-3 py-2 align-top whitespace-nowrap text-[11px] text-slate-500 dark:text-zinc-400">
                      {fmtDateTime(r.completedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filtered.length > limit && (
        <div className="flex justify-center">
          <button type="button" onClick={() => setLimit((l) => l + ROWS_STEP)} className={BTN_SECONDARY}>
            Tampilkan lebih banyak ({fmtInt(filtered.length - limit)} lagi)
          </button>
        </div>
      )}
    </div>
  );
};

const QuestionInfo: React.FC<{ data: QuestionDetailResponse }> = ({ data }) => {
  const { question } = data;
  const objective = isObjectiveType(question.type);
  const isMC = question.type === 'multiple_choice';
  const story = question.caseStudyStory && question.caseStudyStory.trim() ? question.caseStudyStory : null;
  const hasKeyOption = question.options.some((o) => o.isCorrect);
  const keyText = question.correctAnswer
    ? formatAnswerText(question.correctAnswer.label, question.correctAnswer.text)
    : '-';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="px-2 py-0.5 rounded-md border font-bold bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 border-indigo-200/60 dark:border-indigo-900/40">
          Soal No. {question.no}
        </span>
        <span className="px-2 py-0.5 rounded-md font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
          {question.typeLabel}
        </span>
        {data.materialAvailable && (
          <span className="px-2 py-0.5 rounded-md font-semibold bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300">
            Materi: {question.materi || '-'}
          </span>
        )}
        <span className="font-semibold text-slate-500 dark:text-zinc-400">• {fmtNum(question.points)} Poin</span>
      </div>

      {story && (
        <div className="p-3 bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-900/40 rounded-xl text-xs space-y-1">
          <span className="font-bold text-purple-800 dark:text-purple-300 text-[11px] block">Cerita / Skenario Studi Kasus:</span>
          <p className="whitespace-pre-line break-words leading-relaxed text-slate-800 dark:text-zinc-200">{story}</p>
        </div>
      )}

      <div>
        <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 block mb-1">Pertanyaan:</span>
        <p className="text-sm font-semibold text-slate-900 dark:text-white leading-relaxed whitespace-pre-line break-words">
          {question.questionText || '-'}
        </p>
      </div>

      {objective && (
        <div className="space-y-1.5">
          <span className="text-[11px] font-bold text-slate-500 dark:text-zinc-400 block">Pilihan Jawaban:</span>
          {question.options.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-zinc-500">Soal ini tidak memiliki opsi jawaban.</p>
          ) : (
            <div className="grid grid-cols-1 gap-1.5">
              {question.options.map((opt, idx) => (
                <div
                  key={`${opt.optionId}-${idx}`}
                  className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${
                    opt.isCorrect
                      ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-300 font-medium'
                      : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300'
                  }`}
                >
                  {isMC && <OptionChip label={opt.label} highlight={opt.isCorrect} />}
                  <span className="flex-1 min-w-0 whitespace-pre-line break-words">
                    {isMC ? opt.text || '-' : opt.text || opt.label}
                  </span>
                  {opt.isCorrect && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold shrink-0">
                      <Check className="w-3 h-3" />
                      <span>Kunci</span>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {!hasKeyOption && (
            <InfoNote tone="warning">
              {keyText === '-'
                ? 'Soal ini tidak memiliki kunci jawaban yang cocok dengan opsinya.'
                : `Kunci jawaban tersimpan (${keyText}) tidak cocok dengan opsi mana pun pada soal ini.`}
            </InfoNote>
          )}
          {question.explanation && question.explanation.trim() && (
            <div className="text-[11px] text-slate-600 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-950 p-2.5 rounded-lg border border-slate-200 dark:border-zinc-800">
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">Pembahasan: </span>
              <span className="whitespace-pre-line break-words">{question.explanation}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const ObjectiveAnalysis: React.FC<{ data: QuestionDetailResponse }> = ({ data }) => {
  const { stat, distribution, question } = data;
  const isMC = question.type === 'multiple_choice';
  const facts = useMemo(() => distributionFacts(distribution, stat.total, isMC), [distribution, stat.total, isMC]);

  return (
    <>
      <section className="space-y-3">
        <h4 className={H4_CLASS}>Statistik Jawaban</h4>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Total Peserta" value={fmtInt(stat.total)} />
          <StatTile label="Benar" value={fmtInt(stat.correct)} />
          <StatTile label="Salah" value={fmtInt(stat.wrong)} />
          <StatTile label="Tidak Menjawab" value={fmtInt(stat.empty)} />
          <StatTile label="% Benar" value={pct2(stat.pctCorrect)} />
          <StatTile label="% Salah" value={pct2(stat.pctWrong)} />
          <StatTile label="% Tidak Menjawab" value={pct2(stat.pctEmpty)} />
          <StatTile label="Indikasi Tingkat Kesulitan" value={<DifficultyBadge label={stat.difficulty} />} />
        </div>
        <p className="text-[10px] leading-relaxed text-slate-400 dark:text-zinc-500">
          {DIFFICULTY_DISCLAIMER} {difficultyThresholdText()}
        </p>
        {stat.scoringMismatchCount > 0 && (
          <InfoNote tone="warning">
            {fmtInt(stat.scoringMismatchCount)} jawaban memiliki status Benar/Salah tersimpan yang berbeda dengan kunci
            jawaban saat ini (indikasi kunci jawaban diubah setelah ujian). Statistik Benar/Salah tetap mengikuti penilaian
            tersimpan, sama dengan nilai di Rekap Nilai.
          </InfoNote>
        )}
      </section>

      <section className="space-y-3">
        <h4 className={H4_CLASS}>Distribusi Jawaban</h4>
        {stat.total === 0 ? (
          <EmptyState message="Belum ada peserta yang mengerjakan soal ini." />
        ) : (
          <>
            <DistributionTable rows={distribution} isMC={isMC} />
            {facts.length > 0 && (
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600 dark:text-zinc-300">
                {facts.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="space-y-3">
        <h4 className={H4_CLASS}>Peserta yang Salah</h4>
        <NonCorrectSection
          rows={data.nonCorrectParticipants}
          total={stat.total}
          wrongCount={stat.wrong ?? 0}
          emptyCount={stat.empty}
          truncated={data.truncated}
        />
      </section>
    </>
  );
};

/** Essay / studi kasus: dinilai manual, tanpa label benar/salah otomatis. */
const EssayAnalysis: React.FC<{ data: QuestionDetailResponse }> = ({ data }) => {
  const { stat, question } = data;
  const essay = stat.essay;
  const maxPoint = essay?.maxPoint ?? question.points;
  const rubric = question.sampleAnswer && question.sampleAnswer.trim() ? question.sampleAnswer : null;
  const explanation =
    question.explanation && question.explanation.trim() && question.explanation !== question.sampleAnswer
      ? question.explanation
      : null;

  return (
    <>
      <section className="space-y-3">
        <h4 className={H4_CLASS}>Statistik Jawaban</h4>
        <InfoNote>
          Soal {question.typeLabel.toLowerCase()} dinilai manual oleh admin. Rata-rata, skor terendah, dan skor tertinggi
          dihitung dari jawaban yang sudah dinilai.
        </InfoNote>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatTile label="Total Peserta" value={fmtInt(stat.total)} />
          <StatTile label="Dijawab" value={fmtInt(essay?.answered)} />
          <StatTile label="Tidak Menjawab" value={fmtInt(stat.empty)} hint={stat.total ? pct2(stat.pctEmpty) : undefined} />
          <StatTile label="Sudah Dinilai" value={fmtInt(essay?.graded)} />
          <StatTile label="Menunggu Penilaian" value={fmtInt(essay?.pending)} />
          <StatTile
            label="Rata-rata Skor"
            value={essay && essay.avgScore !== null ? `${fmtNum(essay.avgScore, 2)} / ${fmtNum(maxPoint)}` : '-'}
          />
          <StatTile label="Skor Terendah" value={fmtNum(essay?.minScore, 2)} />
          <StatTile label="Skor Tertinggi" value={fmtNum(essay?.maxScore, 2)} />
          <StatTile label="Poin Maksimal" value={fmtNum(maxPoint)} />
        </div>
        {essay && essay.pending > 0 && (
          <InfoNote tone="warning">
            {fmtInt(essay.pending)} jawaban masih menunggu penilaian manual. Rata-rata, skor terendah, dan skor tertinggi
            hanya mencakup {fmtInt(essay.graded)} jawaban yang sudah dinilai.
          </InfoNote>
        )}
      </section>

      <section className="space-y-2">
        <h4 className={H4_CLASS}>Acuan Jawaban / Rubrik Penilaian</h4>
        {rubric ? (
          <div className="bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/40 dark:border-emerald-900/30 p-3 rounded-lg text-xs">
            <p className="italic text-slate-700 dark:text-zinc-300 whitespace-pre-line break-words font-medium">{rubric}</p>
          </div>
        ) : (
          <p className="text-xs text-slate-400 dark:text-zinc-500">Belum ada acuan jawaban / rubrik untuk soal ini.</p>
        )}
        {explanation && (
          <div className="text-[11px] text-slate-600 dark:text-zinc-300 bg-slate-50 dark:bg-zinc-950 p-2.5 rounded-lg border border-slate-200 dark:border-zinc-800">
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">Pembahasan: </span>
            <span className="whitespace-pre-line break-words">{explanation}</span>
          </div>
        )}
      </section>
    </>
  );
};

const QuestionDetailBody: React.FC<{ data: QuestionDetailResponse }> = ({ data }) => (
  <>
    <QuestionInfo data={data} />
    {isObjectiveType(data.question.type) ? <ObjectiveAnalysis data={data} /> : <EssayAnalysis data={data} />}
  </>
);

export const QuestionDetailModal: React.FC<QuestionDetailModalProps> = ({ examId, questionId, filters, onClose, onToast }) => {
  const [data, setData] = useState<QuestionDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const reqIdRef = useRef(0);
  const mountedRef = useRef(true);
  const rootRef = useRef<HTMLDivElement>(null);
  // Kunci stabil agar objek filter baru dengan isi sama tidak memicu fetch ulang.
  const queryKey = JSON.stringify(filtersToQuery(filters));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await analyticsGetJson<QuestionDetailResponse>(
        ANALYTICS_ENDPOINTS.questionDetail(examId, questionId),
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
  }, [examId, questionId, queryKey]);

  useEffect(() => {
    void load();
    return () => {
      // Abaikan respons yang datang setelah unmount / ganti soal.
      reqIdRef.current += 1;
    };
  }, [load]);

  // Escape / tombol tutup hanya berlaku bila modal ini yang paling atas.
  const handleClose = useCallback(() => {
    const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
    const top = dialogs[dialogs.length - 1];
    if (top && rootRef.current && !top.contains(rootRef.current)) return;
    onClose();
  }, [onClose]);

  const handleDownload = async () => {
    if (!data || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const fileName = await analyticsDownload(
        ANALYTICS_ENDPOINTS.questionExport(examId, questionId),
        filtersToQuery(filters),
        `Detail_Soal_${data.stat.no}_${localDateStamp()}.xlsx`
      );
      onToast(`File ${fileName} berhasil diunduh.`, 'success');
    } catch (err) {
      const msg = describeAnalyticsError(err);
      if (mountedRef.current) setDownloadError(msg);
      onToast(msg, 'error');
    } finally {
      if (mountedRef.current) setDownloading(false);
    }
  };

  const filterText = describeFiltersText(data ? data.filters : filters);
  const subtitle = data ? (
    <>
      <span className="font-semibold">Soal No. {data.stat.no}</span>
      <span> · {data.exam.title}</span>
      {filterText && <span className="block text-[11px] text-slate-400 dark:text-zinc-500">Filter: {filterText}</span>}
    </>
  ) : undefined;

  const footer = (
    <>
      {downloadError && (
        <p role="alert" className="mr-auto max-w-md text-[11px] text-rose-600 dark:text-rose-400">
          {downloadError}
        </p>
      )}
      <button type="button" onClick={handleDownload} disabled={!data || downloading} className={BTN_SUCCESS}>
        {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        <span>{downloading ? 'Mengunduh...' : 'Download Detail Soal'}</span>
      </button>
      <button type="button" onClick={handleClose} className={BTN_SECONDARY}>
        Tutup
      </button>
    </>
  );

  return (
    <ModalShell title="Detail Analisis Soal" subtitle={subtitle} onClose={handleClose} footer={footer} maxWidthClass="sm:max-w-5xl">
      <div ref={rootRef} className="space-y-5">
        {loading ? (
          <LoadingState message="Memuat detail soal..." />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : data ? (
          <QuestionDetailBody data={data} />
        ) : null}
      </div>
    </ModalShell>
  );
};
