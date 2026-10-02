import { Capacitor } from '@capacitor/core';
import {
  ANALYTICS_ENDPOINTS,
  DIFFICULTY_DISCLAIMER,
  DIFFICULTY_THRESHOLDS,
  ERROR_ROWS_LIMIT_DEFAULT,
  MATERIAL_UNAVAILABLE_MESSAGE,
  QUERY_KEYS,
  filtersToQuery,
  isObjectiveType,
} from '../../../lib/analytics/contract';
import type {
  AnalyticsFilters,
  ErrorRowsResponse,
  ExamAnalyticsSummaryResponse,
  NonCorrectStatus,
  QuestionStat,
} from '../../../lib/analytics/contract';
import { analyticsGetJson, describeAnalyticsError } from '../../../lib/analyticsApi';
import { companyLabel, fmtDate, fmtDateTime, fmtInt, fmtNum, fmtPct, localDateStamp, safeFilePart } from './format';

/**
 * Laporan cetak / PDF analitik paket ujian (window.print lewat iframe tersembunyi).
 * Juga berisi helper teks yang dipakai bersama oleh modal detail soal & peserta.
 */

type ToastFn = (msg: string, type?: 'success' | 'info' | 'error') => void;

// ═══════════════════════════════════════════════════════════════
// HELPER TEKS BERSAMA
// ═══════════════════════════════════════════════════════════════

/**
 * Teks jawaban, seragam dengan file Excel: pilihan ganda "B. teks", benar/salah "Benar",
 * kosong "(Tidak menjawab)", id opsi yang tidak dikenal "Lainnya (id)".
 */
export function formatAnswerText(
  label: string | null | undefined,
  text: string | null | undefined,
  status?: NonCorrectStatus | null
): string {
  if (status === 'empty') return '(Tidak menjawab)';
  const l = label ?? '';
  const t = text ?? '';
  const hasText = t.trim() !== '';
  if (!l && !hasText) return '-';
  if (l === 'Lainnya') return hasText ? `Lainnya (${t})` : 'Lainnya';
  if (!l) return t;
  if (!hasText || t === l) return l;
  return `${l}. ${t}`;
}

function describePeriod(from?: string | null, to?: string | null): string | null {
  if (from && to) return `${fmtDate(from)} – ${fmtDate(to)}`;
  if (from) return `mulai ${fmtDate(from)}`;
  if (to) return `sampai ${fmtDate(to)}`;
  return null;
}

/** Ringkasan filter aktif, mis. "Company BANK · Department IT"; null bila tanpa filter. */
export function describeFiltersText(f: AnalyticsFilters | null | undefined): string | null {
  if (!f) return null;
  const parts: string[] = [];
  if (f.company) parts.push(`Company ${f.company}`);
  if (f.department) parts.push(`Department ${f.department}`);
  const period = describePeriod(f.from, f.to);
  if (period) parts.push(`Periode ${period}`);
  return parts.length ? parts.join(' · ') : null;
}

/** Batas Mudah / Sedang / Sulit (mengikuti DIFFICULTY_THRESHOLDS). */
export function difficultyThresholdText(): string {
  const { easyMinPct: easy, mediumMinPct: medium } = DIFFICULTY_THRESHOLDS;
  return `Batas: Mudah ≥ ${easy}% benar · Sedang ${medium}% sampai < ${easy}% · Sulit < ${medium}%.`;
}

// ═══════════════════════════════════════════════════════════════
// HTML AMAN (setiap nilai dinamis di-escape)
// ═══════════════════════════════════════════════════════════════

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

/** Escape teks untuk isi elemen maupun atribut ber-kutip. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"'`]/g, (c) => HTML_ESCAPES[c]);
}

/** Potongan HTML yang sudah aman. Hanya dibuat oleh tag `html` (atau konstanta statis di file ini). */
class SafeHtml {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  return escapeHtml(v);
}

/** Template HTML: semua nilai sisipan di-escape otomatis, kecuali hasil `html` lainnya. */
function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) out += renderValue(values[i]) + strings[i + 1];
  return new SafeHtml(out);
}

// ═══════════════════════════════════════════════════════════════
// DOKUMEN CETAK
// ═══════════════════════════════════════════════════════════════

const PRINT_ROOT_ID = 'ara-analytics-print';
const TOP_WRONG_LIMIT = 10;

// Konstanta statis (tanpa data dinamis).
const PRINT_STYLE = new SafeHtml(`
@page { size: A4 portrait; margin: 12mm 11mm 14mm; }
*, *::before, *::after { box-sizing: border-box; }
html, body { background: #fff; }
body { margin: 0; color: #0f172a; font: 10px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media screen { body { max-width: 210mm; margin: 0 auto; padding: 12mm; } }
h1 { font-size: 17px; line-height: 1.25; margin: 2px 0 4px; overflow-wrap: anywhere; }
h2 { font-size: 12px; margin: 16px 0 6px; padding-bottom: 3px; border-bottom: 1.5px solid #c7d2fe; color: #312e81; break-after: avoid; page-break-after: avoid; }
p { margin: 0 0 4px; }
.brand { font-size: 9px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #4f46e5; }
.muted { color: #64748b; }
.small { font-size: 8.5px; }
table { width: 100%; border-collapse: collapse; margin: 4px 0 6px; }
th, td { border: 1px solid #cbd5e1; padding: 3px 5px; text-align: left; vertical-align: top; }
td { overflow-wrap: anywhere; }
thead { display: table-header-group; }
thead th { background: #eef2ff; color: #1e1b4b; font-size: 8.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; }
tr { break-inside: avoid; page-break-inside: avoid; }
.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.nowrap { white-space: nowrap; }
.kv th { width: 30%; background: #f8fafc; font-weight: 600; color: #334155; }
.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin: 4px 0 6px; }
.tile { border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px; break-inside: avoid; page-break-inside: avoid; }
.tile .label { font-size: 8.5px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .03em; }
.tile .value { font-size: 15px; font-weight: 700; margin-top: 1px; }
.tile .hint, .hint { font-size: 8.5px; color: #64748b; margin-top: 1px; }
.note { border: 1px solid #e2e8f0; background: #f8fafc; border-radius: 4px; padding: 5px 7px; margin: 4px 0; break-inside: avoid; page-break-inside: avoid; }
.note.warn { border-color: #fcd34d; background: #fffbeb; color: #78350f; }
.page-break { break-before: page; page-break-before: always; }
.doc-foot { margin-top: 14px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 8.5px; color: #94a3b8; }
`);

/** Judul dokumen = usulan nama file "Save as PDF": Analisis_<paket>_<YYYY-MM-DD>. */
export function analyticsPrintTitle(summary: ExamAnalyticsSummaryResponse, now: Date = new Date()): string {
  return `Analisis_${safeFilePart(summary.exam.title)}_${localDateStamp(now)}`;
}

/** Top soal objektif dengan jawaban salah terbanyak (salah desc, % salah desc, nomor asc). */
function topWrongQuestions(questions: QuestionStat[], limit = TOP_WRONG_LIMIT): QuestionStat[] {
  return questions
    .filter((q) => isObjectiveType(q.type) && (q.wrong ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.wrong ?? 0) - (a.wrong ?? 0) ||
        (b.pctWrong ?? -1) - (a.pctWrong ?? -1) ||
        a.no - b.no
    )
    .slice(0, limit);
}

const kvRow = (label: string, value: unknown) => html`<tr><th scope="row">${label}</th><td>${value}</td></tr>`;

const tile = (label: string, value: string, hint?: string) =>
  html`<div class="tile"><div class="label">${label}</div><div class="value">${value}</div>${
    hint ? html`<div class="hint">${hint}</div>` : null
  }</div>`;

/** Susun dokumen HTML laporan (murni, tanpa efek samping). */
export function buildAnalyticsPrintHtml(
  report: ExamAnalyticsSummaryResponse,
  errors: ErrorRowsResponse,
  opts: { now?: Date } = {}
): string {
  const now = opts.now ?? new Date();
  const title = analyticsPrintTitle(report, now);
  const { exam, summary: s, filters } = report;
  const showMateri = report.materialAvailable === true;
  const materiTh = showMateri ? html`<th>Materi</th>` : null;
  const materiTd = (materi: string | null) => (showMateri ? html`<td>${materi || '-'}</td>` : null);

  const schedule =
    exam.startTime || exam.endTime ? `${fmtDateTime(exam.startTime)} – ${fmtDateTime(exam.endTime)}` : '-';
  const workPeriod =
    s.firstCompletedAt || s.lastCompletedAt
      ? `${fmtDateTime(s.firstCompletedAt)} – ${fmtDateTime(s.lastCompletedAt)}`
      : '-';

  const info = html`<table class="kv"><tbody>
${kvRow('Nama Paket', exam.title)}
${kvRow('Kategori', exam.category || '-')}
${kvRow('Company (Scope)', companyLabel(exam.scope))}
${kvRow('Jadwal Paket', schedule)}
${kvRow('Periode Pengerjaan', workPeriod)}
${kvRow('Passing Score', fmtNum(exam.passingScore, 2))}
${kvRow('Jumlah Soal', `${fmtInt(s.questionCount)} (${fmtInt(s.objectiveQuestionCount)} objektif)`)}
${kvRow('Filter Company', filters?.company || 'Semua')}
${kvRow('Filter Department', filters?.department || 'Semua')}
${kvRow('Filter Periode', describePeriod(filters?.from, filters?.to) || 'Semua')}
${kvRow('Data dihitung pada', fmtDateTime(report.generatedAt))}
</tbody></table>`;

  const tiles = html`<div class="tiles">
${tile('Total Peserta', fmtInt(s.totalParticipants), 'attempt pertama per peserta')}
${tile('Total Attempt', fmtInt(s.totalAttempts), 'termasuk pengulangan')}
${tile('Rata-rata Nilai', fmtNum(s.avgScore, 2))}
${tile('Nilai Tertinggi', fmtNum(s.maxScore, 2))}
${tile('Nilai Terendah', fmtNum(s.minScore, 2))}
${tile('Pass Rate', fmtPct(s.passRatePct, 2), `Lulus ${fmtInt(s.passedCount)} · Tidak lulus ${fmtInt(s.failedCount)}`)}
${tile('Rata-rata Jawaban Benar', fmtNum(s.avgCorrectObjective, 2), `dari ${fmtInt(s.objectiveQuestionCount)} soal objektif`)}
${tile('Total Tidak Menjawab', fmtInt(s.totalUnanswered), 'semua tipe soal')}
</div>`;

  const mismatchNos = report.questions.filter((q) => q.scoringMismatchCount > 0).map((q) => q.no);
  const notes = html`
<div class="note">${report.basisNote}</div>
${
  s.pendingGradingParticipants > 0
    ? html`<div class="note warn">${fmtInt(s.pendingGradingParticipants)} peserta masih memiliki jawaban essay / studi kasus yang menunggu penilaian manual; nilai peserta tersebut dapat berubah setelah dinilai.</div>`
    : null
}
${
  mismatchNos.length
    ? html`<div class="note warn">Status Benar/Salah tersimpan berbeda dengan kunci jawaban saat ini pada soal No. ${mismatchNos.join(', ')} (indikasi kunci jawaban diubah setelah ujian). Statistik tetap mengikuti penilaian tersimpan, sama dengan Rekap Nilai.</div>`
    : null
}
${
  report.truncated
    ? html`<div class="note warn">Jumlah attempt melebihi batas aman pemuatan server, sehingga analisis hanya mencakup sebagian attempt.</div>`
    : null
}`;

  const questionRows = report.questions.map((q) => {
    const objective = isObjectiveType(q.type);
    const essayHint =
      !objective && q.essay
        ? html`<div class="hint">Rata-rata skor ${fmtNum(q.essay.avgScore, 2)} / ${fmtNum(q.essay.maxPoint)} · Dinilai ${fmtInt(q.essay.graded)} · Menunggu penilaian ${fmtInt(q.essay.pending)}</div>`
        : null;
    return html`<tr>
<td class="num">${q.no}</td>
<td>${q.textPreview || '-'}${essayHint}</td>
<td>${q.typeLabel}</td>
${materiTd(q.materi)}
<td class="num">${fmtInt(q.total)}</td>
<td class="num">${objective ? fmtInt(q.correct) : '-'}</td>
<td class="num">${objective ? fmtInt(q.wrong) : '-'}</td>
<td class="num">${fmtInt(q.empty)}</td>
<td class="num">${objective ? fmtPct(q.pctCorrect, 2) : '-'}</td>
<td class="num">${objective ? fmtPct(q.pctWrong, 2) : '-'}</td>
<td>${objective ? q.difficulty || '-' : '-'}</td>
</tr>`;
  });
  const questionSection = report.questions.length
    ? html`<table>
<thead><tr><th class="num">No</th><th>Soal</th><th>Tipe</th>${materiTh}<th class="num">Total</th><th class="num">Benar</th><th class="num">Salah</th><th class="num">Kosong</th><th class="num">% Benar</th><th class="num">% Salah</th><th>Indikasi Kesulitan</th></tr></thead>
<tbody>${questionRows}</tbody>
</table>
<p class="muted small">${DIFFICULTY_DISCLAIMER} ${difficultyThresholdText()}</p>`
    : html`<p class="muted">Paket ini belum memiliki soal.</p>`;

  const materiSection =
    showMateri && report.materials.length
      ? html`<table>
<thead><tr><th>Materi</th><th class="num">Jumlah Soal</th><th class="num">Benar</th><th class="num">Salah</th><th class="num">Kosong</th><th class="num">% Benar</th></tr></thead>
<tbody>${report.materials.map(
          (m) => html`<tr><td>${m.materi}</td><td class="num">${fmtInt(m.questionCount)}</td><td class="num">${fmtInt(m.correct)}</td><td class="num">${fmtInt(m.wrong)}</td><td class="num">${fmtInt(m.empty)}</td><td class="num">${fmtPct(m.pctCorrect, 2)}</td></tr>`
        )}</tbody>
</table>
<p class="muted small">Benar, Salah, dan Kosong dihitung dari soal objektif (pilihan ganda &amp; benar/salah).</p>`
      : html`<p class="muted">${MATERIAL_UNAVAILABLE_MESSAGE}</p>`;

  const top = topWrongQuestions(report.questions);
  const topSection = top.length
    ? html`<table>
<thead><tr><th class="num">Peringkat</th><th class="num">No</th><th>Soal</th>${materiTh}<th class="num">Salah</th><th class="num">Total</th><th class="num">% Salah</th></tr></thead>
<tbody>${top.map(
        (q, i) => html`<tr><td class="num">${i + 1}</td><td class="num">${q.no}</td><td>${q.textPreview || '-'}</td>${materiTd(q.materi)}<td class="num">${fmtInt(q.wrong)}</td><td class="num">${fmtInt(q.total)}</td><td class="num">${fmtPct(q.pctWrong, 2)}</td></tr>`
      )}</tbody>
</table>`
    : html`<p class="muted">Belum ada jawaban salah pada soal objektif.</p>`;

  const errorSection = errors.rows.length
    ? html`${
        errors.truncated
          ? html`<div class="note warn">Daftar dipotong: menampilkan ${fmtInt(errors.rows.length)} dari ${fmtInt(errors.total)} baris. Lihat file Download Analisis (Excel) untuk daftar yang lebih lengkap.</div>`
          : null
      }
<table>
<thead><tr><th class="num">No Soal</th><th>Peserta</th><th>Company</th><th>Department</th>${materiTh}<th>Jawaban Peserta</th><th>Jawaban Benar</th><th class="num">Poin</th><th>Status</th><th>Waktu Selesai</th></tr></thead>
<tbody>${errors.rows.map(
        (r) => html`<tr><td class="num">${r.no}</td><td>${r.name}</td><td>${companyLabel(r.company)}</td><td>${r.department || '-'}</td>${materiTd(r.materi)}<td>${formatAnswerText(r.answerLabel, r.answerText, r.status)}</td><td>${formatAnswerText(r.correctLabel, r.correctText)}</td><td class="num">${fmtNum(r.maxPoints)}</td><td>${r.status === 'empty' ? 'Tidak menjawab' : 'Salah'}</td><td class="nowrap">${fmtDateTime(r.completedAt)}</td></tr>`
      )}</tbody>
</table>`
    : html`<p class="muted">Tidak ada jawaban salah atau kosong pada soal objektif.</p>`;

  const doc = html`<html lang="id">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>${PRINT_STYLE}</style>
</head>
<body>
<main id="${PRINT_ROOT_ID}">
<header>
<div class="brand">Ara Sinau · Laporan Analisis Paket Ujian</div>
<h1>${exam.title}</h1>
<p class="muted">Data dihitung pada ${fmtDateTime(report.generatedAt)} · Dicetak ${fmtDateTime(now.toISOString())}</p>
</header>
<section><h2>Info Paket &amp; Filter</h2>${info}</section>
<section><h2>Ringkasan</h2>${tiles}${notes}</section>
<section><h2>Statistik per Soal</h2>${questionSection}</section>
<section><h2>Analisis Materi</h2>${materiSection}</section>
<section><h2>Soal Paling Banyak Salah (Top ${TOP_WRONG_LIMIT})</h2>${topSection}</section>
<section class="page-break"><h2>Detail Kesalahan</h2>
<p class="muted small">Satu baris = satu jawaban salah / tidak dijawab pada soal objektif. Poin = bobot soal.</p>
${errorSection}
</section>
<footer class="doc-foot">Dicetak dari Ara Sinau. Seluruh angka dihitung otomatis dari data ujian tersimpan.</footer>
</main>
</body>
</html>`;
  return `<!doctype html>\n${doc.value}`;
}

// ═══════════════════════════════════════════════════════════════
// CETAK LEWAT IFRAME TERSEMBUNYI
// ═══════════════════════════════════════════════════════════════

const LOAD_TIMEOUT_MS = 15000;
/** Cadangan pembersihan bila event afterprint tidak pernah terpicu. */
const CLEANUP_FALLBACK_MS = 5 * 60 * 1000;

function printHtmlDocument(docHtml: string, docTitle: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('tabindex', '-1');
    iframe.title = docTitle;
    // Ukuran viewport di luar layar (bukan display:none) agar tata letak cetak normal di semua browser.
    const w = Math.max(document.documentElement.clientWidth || 0, 800);
    const h = Math.max(document.documentElement.clientHeight || 0, 600);
    iframe.style.cssText = `position:fixed;left:-${w + 100}px;top:-${h + 100}px;width:${w}px;height:${h}px;border:0;`;

    let settled = false;
    let removed = false;
    let fallbackTimer: number | undefined;
    const removeFrame = () => {
      if (removed) return;
      removed = true;
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
      iframe.remove();
    };
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(loadTimer);
      removeFrame();
      reject(err);
    };
    const loadTimer = window.setTimeout(() => fail(new Error('Dokumen cetak tidak termuat.')), LOAD_TIMEOUT_MS);

    iframe.addEventListener('load', () => {
      if (settled) return;
      const win = iframe.contentWindow;
      // Abaikan load dokumen kosong awal (beberapa browser) — tunggu dokumen laporan.
      if (!win || !iframe.contentDocument?.getElementById(PRINT_ROOT_ID)) return;
      settled = true;
      window.clearTimeout(loadTimer);
      win.addEventListener('afterprint', () => window.setTimeout(removeFrame, 500));

      // Sebagian browser memakai judul dokumen teratas sebagai nama file PDF.
      const prevTitle = document.title;
      document.title = docTitle;
      try {
        win.focus();
        win.print();
      } catch (err) {
        removeFrame();
        reject(err);
        return;
      } finally {
        window.setTimeout(() => {
          if (document.title === docTitle) document.title = prevTitle;
        }, 1000);
      }
      fallbackTimer = window.setTimeout(removeFrame, CLEANUP_FALLBACK_MS);
      resolve();
    });

    iframe.srcdoc = docHtml;
    document.body.appendChild(iframe);
  });
}

let printInProgress = false;

/**
 * Cetak / simpan PDF laporan analitik paket. Tidak pernah melempar error:
 * seluruh kegagalan dilaporkan lewat toast.
 */
export async function printAnalyticsReport(args: {
  summary: ExamAnalyticsSummaryResponse;
  filters: AnalyticsFilters;
  onToast: ToastFn;
}): Promise<void> {
  const { summary, filters, onToast } = args;
  if (Capacitor.isNativePlatform()) {
    onToast('Cetak PDF belum tersedia di aplikasi Android. Gunakan versi web.', 'error');
    return;
  }
  if (printInProgress) {
    onToast('Laporan sedang disiapkan, mohon tunggu.', 'info');
    return;
  }
  printInProgress = true;
  try {
    // Detail kesalahan memakai filter yang sama persis dengan ringkasan yang dicetak.
    const appliedFilters: AnalyticsFilters = summary.filters ?? filters;
    let errors: ErrorRowsResponse;
    try {
      errors = await analyticsGetJson<ErrorRowsResponse>(ANALYTICS_ENDPOINTS.errors(summary.exam.id), {
        ...filtersToQuery(appliedFilters),
        [QUERY_KEYS.limit]: ERROR_ROWS_LIMIT_DEFAULT,
      });
    } catch (err) {
      onToast(`Gagal menyiapkan laporan cetak. ${describeAnalyticsError(err)}`, 'error');
      return;
    }

    const now = new Date();
    let docHtml: string;
    try {
      docHtml = buildAnalyticsPrintHtml(summary, errors, { now });
    } catch {
      onToast('Gagal menyusun laporan cetak.', 'error');
      return;
    }

    try {
      await printHtmlDocument(docHtml, analyticsPrintTitle(summary, now));
    } catch {
      onToast('Gagal membuka dialog cetak. Coba lagi, atau gunakan Download Analisis (Excel).', 'error');
    }
  } finally {
    printInProgress = false;
  }
}
