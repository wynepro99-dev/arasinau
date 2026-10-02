import React, { useState } from 'react';
import { ChartColumn, Table2 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { pct } from '../../../lib/analytics/contract';
import type { MaterialStat, QuestionStat, ScoreBin } from '../../../lib/analytics/contract';
import { CHART_COLORS, TOOLTIP_STYLE, fmtInt, fmtPct } from './format';
import { EmptyState, SectionCard, TABLE_CLASS, THEAD_CLASS } from './ui';

/**
 * Grafik halaman Analisis Paket Ujian (tepat 4: Distribusi Nilai, Lulus vs Tidak Lulus,
 * Performa Materi, Top Soal Salah). Aturan: satu warna seri, batang <= 24px dengan ujung data
 * membulat 4px, grid garis tipis solid, teks memakai warna teks (bukan warna seri), tanpa sumbu
 * ganda. Tabel tetap menjadi sumber angka utama; tooltip hanya pelengkap.
 */

const AXIS_TICK = { fill: CHART_COLORS.axis, fontSize: 11 };
/** Label kategori (No. soal / materi) memakai warna teks sekunder, ikut mode gelap. */
const CATEGORY_TICK = { fontSize: 11, fill: '#475569', className: 'fill-slate-600 dark:fill-zinc-300' };
const VALUE_LABEL_CLASS = 'fill-slate-700 dark:fill-zinc-200';
const GRID_DARK_CLASS = 'dark:stroke-zinc-800';
const HOVER_CURSOR = { fill: 'rgba(148, 163, 184, 0.14)' };
const ACTIVE_BAR = { fillOpacity: 0.85 };

interface TooltipText {
  value: string;
  label: string;
}

/** Tooltip "nilai dulu": angka tebal di atas, keterangan sekunder di bawah. */
const ValueTooltip: React.FC<TooltipText> = ({ value, label }) => (
  <div
    style={{
      ...TOOLTIP_STYLE,
      borderWidth: 1,
      borderStyle: 'solid',
      padding: '6px 10px',
      boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)',
      maxWidth: 260,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        aria-hidden="true"
        style={{ display: 'inline-block', width: 10, height: 2, borderRadius: 1, backgroundColor: CHART_COLORS.series }}
      />
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
    <div style={{ marginTop: 2, color: '#a1a1aa' }}>{label}</div>
  </div>
);

function tooltipContent<T>(describe: (datum: T) => TooltipText) {
  return function ChartTooltipContent(props: TooltipContentProps<any, any>) {
    const datum = props.active ? (props.payload?.[0]?.payload as T | undefined) : undefined;
    return datum ? <ValueTooltip {...describe(datum)} /> : null;
  };
}

function truncateLabel(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

// ─── 1. Distribusi Nilai (kolom) + tabel kembar ─────────────────────────────

export const ScoreDistributionChart: React.FC<{
  bins: ScoreBin[];
  totalParticipants: number;
  className?: string;
}> = ({ bins, totalParticipants, className = '' }) => {
  const [showTable, setShowTable] = useState(false);
  const hasData = totalParticipants > 0;

  const toggle = hasData ? (
    <button
      type="button"
      onClick={() => setShowTable((v) => !v)}
      aria-pressed={showTable}
      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1 transition-colors"
    >
      {showTable ? <ChartColumn className="w-3.5 h-3.5" /> : <Table2 className="w-3.5 h-3.5" />}
      <span>{showTable ? 'Lihat grafik' : 'Lihat tabel'}</span>
    </button>
  ) : undefined;

  return (
    <SectionCard
      title="Distribusi Nilai"
      subtitle="Jumlah peserta per rentang nilai (skala 0–100)"
      actions={toggle}
      className={className}
    >
      {!hasData ? (
        <EmptyState message="Belum ada peserta pada filter ini." />
      ) : showTable ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-zinc-800">
          <table className={TABLE_CLASS}>
            <thead className={THEAD_CLASS}>
              <tr>
                <th scope="col" className="px-3 py-2.5 whitespace-nowrap">Rentang Nilai</th>
                <th scope="col" className="px-3 py-2.5 whitespace-nowrap text-right">Jumlah Peserta</th>
                <th scope="col" className="px-3 py-2.5 whitespace-nowrap text-right">Persentase</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
              {bins.map((b) => (
                <tr key={b.label}>
                  <td className="px-3 py-2 whitespace-nowrap">{b.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtInt(b.count)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtPct(pct(b.count, totalParticipants), 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // Tinggi wadah sudah mencakup pita sumbu X (tanpa scroll bersarang).
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bins} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} className={GRID_DARK_CLASS} />
              <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} width={32} />
              <Tooltip
                cursor={HOVER_CURSOR}
                content={tooltipContent<ScoreBin>((b) => ({
                  value: `${fmtInt(b.count)} peserta`,
                  label: `Nilai ${b.label} · ${fmtPct(pct(b.count, totalParticipants), 2)}`,
                }))}
              />
              <Bar
                dataKey="count"
                name="Peserta"
                fill={CHART_COLORS.series}
                maxBarSize={24}
                radius={[4, 4, 0, 0]}
                activeBar={ACTIVE_BAR}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
};

// ─── 2. Lulus vs Tidak Lulus (meter HTML dua segmen, bukan pie) ─────────────

/** Warna segmen diambil dari CHART_COLORS lewat CSS variable agar terang/gelap tetap satu sumber. */
const SEGMENT_CLASS = 'bg-[color:var(--seg-light)] dark:bg-[color:var(--seg-dark)]';
const segmentVars = (light: string, dark: string) => ({ '--seg-light': light, '--seg-dark': dark }) as React.CSSProperties;
const PASSED_VARS = segmentVars(CHART_COLORS.meterLight.passed, CHART_COLORS.meterDark.passed);
const FAILED_VARS = segmentVars(CHART_COLORS.meterLight.failed, CHART_COLORS.meterDark.failed);

export const PassFailMeter: React.FC<{
  passed: number;
  failed: number;
  pending: number;
  className?: string;
}> = ({ passed, failed, pending, className = '' }) => {
  const total = passed + failed;
  const rows = [
    { key: 'passed', label: 'Lulus', count: passed, pct: pct(passed, total), vars: PASSED_VARS },
    { key: 'failed', label: 'Tidak Lulus', count: failed, pct: pct(failed, total), vars: FAILED_VARS },
  ];
  const segments = rows.filter((r) => r.count > 0);
  const ariaLabel = rows.map((r) => `${r.label} ${fmtInt(r.count)} peserta (${fmtPct(r.pct, 2)})`).join(', ');

  return (
    <SectionCard
      title="Lulus vs Tidak Lulus"
      subtitle="Proporsi peserta berdasarkan status kelulusan tersimpan"
      className={className}
    >
      {total === 0 ? (
        <EmptyState message="Belum ada peserta pada filter ini." />
      ) : (
        <div className="space-y-4">
          {/* Celah 2px memperlihatkan permukaan kartu di antara segmen. */}
          <div role="img" aria-label={ariaLabel} className="flex h-4 w-full gap-[2px]">
            {segments.map((r, i) => (
              <div
                key={r.key}
                title={`${r.label}: ${fmtInt(r.count)} peserta (${fmtPct(r.pct, 2)})`}
                className={`${SEGMENT_CLASS} h-full min-w-[4px] ${i === 0 ? 'rounded-l-[4px]' : ''} ${
                  i === segments.length - 1 ? 'rounded-r-[4px]' : ''
                }`}
                style={{ ...r.vars, flexGrow: r.count, flexBasis: 0 }}
              />
            ))}
          </div>

          <ul className="space-y-2 text-xs">
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-2">
                <span aria-hidden="true" className={`${SEGMENT_CLASS} w-2.5 h-2.5 rounded-[3px] shrink-0`} style={r.vars} />
                <span className="font-medium text-slate-700 dark:text-zinc-300">{r.label}</span>
                <span className="ml-auto tabular-nums font-semibold text-slate-900 dark:text-white whitespace-nowrap">
                  {fmtInt(r.count)} peserta
                </span>
                <span className="w-16 text-right tabular-nums text-slate-500 dark:text-zinc-400">{fmtPct(r.pct, 2)}</span>
              </li>
            ))}
          </ul>

          {pending > 0 && (
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-zinc-400">
              Termasuk {fmtInt(pending)} peserta yang masih menunggu penilaian essay / studi kasus; status kelulusannya
              dapat berubah setelah dinilai.
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
};

// ─── 3. Performa Materi (batang horizontal % benar, 0–100) ──────────────────

export const MaterialPerformanceChart: React.FC<{ materials: MaterialStat[]; className?: string }> = ({
  materials,
  className = '',
}) => {
  const height = Math.max(140, materials.length * 34 + 36);

  return (
    <SectionCard
      title="Performa Materi"
      subtitle="% jawaban benar soal objektif per materi (0–100%)"
      className={className}
    >
      {materials.length === 0 ? (
        <EmptyState message="Belum ada data materi." />
      ) : (
        <div className="w-full" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart layout="vertical" data={materials} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid horizontal={false} stroke={CHART_COLORS.grid} className={GRID_DARK_CLASS} />
              <XAxis
                type="number"
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                type="category"
                dataKey="materi"
                width={128}
                tick={CATEGORY_TICK}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => truncateLabel(String(v), 20)}
              />
              <Tooltip
                cursor={HOVER_CURSOR}
                content={tooltipContent<MaterialStat>((m) => ({
                  value: m.pctCorrect === null ? 'Tidak ada jawaban soal objektif' : `${fmtPct(m.pctCorrect, 2)} benar`,
                  label: `${m.materi} · ${fmtInt(m.correct)} benar dari ${fmtInt(m.total)} jawaban`,
                }))}
              />
              <Bar
                dataKey="pctCorrect"
                name="% Benar"
                fill={CHART_COLORS.series}
                maxBarSize={20}
                radius={[0, 4, 4, 0]}
                activeBar={ACTIVE_BAR}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
};

// ─── 4. Top Soal Salah (batang horizontal jumlah salah, nilai di ujung batang) ──

interface TopWrongDatum {
  questionId: string;
  label: string;
  wrong: number;
  total: number;
  pctWrong: number | null;
}

export const TopWrongChart: React.FC<{
  /** Sudah diurutkan & dibatasi 10 oleh pemanggil (sama dengan tabel Top 10). */
  questions: QuestionStat[];
  emptyMessage: string;
  onOpenQuestion: (questionId: string) => void;
  className?: string;
}> = ({ questions, emptyMessage, onOpenQuestion, className = '' }) => {
  const data: TopWrongDatum[] = questions.map((q) => ({
    questionId: q.questionId,
    label: `No. ${q.no}`,
    wrong: q.wrong ?? 0,
    total: q.total,
    pctWrong: q.pctWrong,
  }));
  const height = data.length * 32 + 12;

  // Klik di mana pun pada pita baris (area hit lebih besar dari batang) membuka detail soal.
  const handleChartClick = (state: { activeTooltipIndex?: unknown; isTooltipActive?: boolean } | null | undefined) => {
    if (!state || !state.isTooltipActive) return;
    const idx = Number(state.activeTooltipIndex);
    const datum = Number.isInteger(idx) ? data[idx] : undefined;
    if (datum) onOpenQuestion(datum.questionId);
  };

  return (
    <SectionCard
      title="Top Soal Salah"
      subtitle="Jumlah jawaban salah, 10 soal objektif teratas · klik batang untuk detail"
      className={className}
    >
      {data.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <div className="w-full cursor-pointer" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={data}
              margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
              onClick={handleChartClick}
            >
              {/* Setiap batang berlabel nilai → sumbu nilai disembunyikan. */}
              <XAxis type="number" hide allowDecimals={false} domain={[0, 'dataMax']} />
              <YAxis type="category" dataKey="label" width={56} tick={CATEGORY_TICK} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={HOVER_CURSOR}
                content={tooltipContent<TopWrongDatum>((d) => ({
                  value: `${fmtInt(d.wrong)} jawaban salah`,
                  label: `${d.label} · ${fmtPct(d.pctWrong, 2)} dari ${fmtInt(d.total)} peserta`,
                }))}
              />
              <Bar
                dataKey="wrong"
                name="Salah"
                fill={CHART_COLORS.series}
                maxBarSize={20}
                radius={[0, 4, 4, 0]}
                activeBar={ACTIVE_BAR}
                onClick={(item) => {
                  const id = (item?.payload as TopWrongDatum | undefined)?.questionId;
                  if (id) onOpenQuestion(id);
                }}
              >
                <LabelList
                  dataKey="wrong"
                  position="right"
                  offset={6}
                  fill="#334155"
                  className={VALUE_LABEL_CLASS}
                  fontSize={11}
                  fontWeight={600}
                  formatter={(v) => fmtInt(Number(v))}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
};
