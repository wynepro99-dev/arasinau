/**
 * Builder workbook XLSX: Download Soal, Download Analisis, dan Detail Soal.
 * Murni dari tipe kontrak (response analitik) + NormExam/NormQuestion — tanpa akses DB.
 * "No" selalu nomor kanonik paket (q.no / stat.no), bukan penomoran per sheet.
 */
import {
  DIFFICULTY_DISCLAIMER,
  DIFFICULTY_THRESHOLDS,
  MATERIAL_UNAVAILABLE_MESSAGE,
  OPTION_LETTERS,
  isObjectiveType,
  questionTypeLabel,
} from '../../src/lib/analytics/contract';
import type {
  AppliedFilters,
  ErrorRow,
  ExamAnalyticsSummaryResponse,
  NonCorrectStatus,
  OptionDistributionRow,
  ParticipantRow,
  QuestionDetailResponse,
} from '../../src/lib/analytics/contract';
import type { NormExam, NormQuestion, XlsxCell, XlsxColumn, XlsxSheet } from './types';

type Row = XlsxCell[];

// ═══════════════════════════════════════════════════════════════
// Tanggal (WIB) & nama file
// ═══════════════════════════════════════════════════════════════

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' atau 'YYYY-MM-DDTHH:mm[:ss[.fff]]' tanpa zona waktu (nilai input datetime-local). */
const NAIVE_DATE_TIME = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?$/;

function toMs(value: string | null | undefined): number {
  if (typeof value !== 'string') return NaN;
  const s = value.trim();
  if (!s) return NaN;
  // Jadwal paket berasal dari input datetime-local (jam dinding WIB tanpa zona) → baca sebagai WIB,
  // bukan zona waktu server.
  const naive = NAIVE_DATE_TIME.exec(s);
  if (naive) return Date.parse(`${naive[1]}T${naive[2] ?? '00:00'}+07:00`);
  return Date.parse(s);
}

interface WibParts {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
}

let wibFormatter: Intl.DateTimeFormat | null = null;

function wibParts(ms: number): WibParts {
  try {
    if (!wibFormatter) {
      wibFormatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jakarta',
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    const p: Record<string, string> = {};
    for (const part of wibFormatter.formatToParts(ms)) p[part.type] = part.value;
    if (p.year && p.month && p.day && p.hour && p.minute) {
      return {
        year: p.year.padStart(4, '0'),
        month: p.month,
        day: p.day,
        hour: p.hour === '24' ? '00' : p.hour,
        minute: p.minute,
      };
    }
  } catch {
    // ICU tanpa data zona waktu → pakai offset tetap di bawah.
  }
  // WIB = UTC+7 tanpa DST.
  const d = new Date(ms + WIB_OFFSET_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    year: String(d.getUTCFullYear()).padStart(4, '0'),
    month: pad(d.getUTCMonth() + 1),
    day: pad(d.getUTCDate()),
    hour: pad(d.getUTCHours()),
    minute: pad(d.getUTCMinutes()),
  };
}

function formatMsWIB(ms: number): string {
  const p = wibParts(ms);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute} WIB`;
}

/** 'DD/MM/YYYY HH:mm WIB' (zona Asia/Jakarta); '-' bila kosong / tidak valid. */
export function formatDateTimeWIB(iso: string | null | undefined): string {
  const ms = toMs(iso);
  return Number.isFinite(ms) ? formatMsWIB(ms) : '-';
}

/** 'DD/MM/YYYY' (zona Asia/Jakarta); '-' bila kosong / tidak valid. */
export function formatDateWIB(iso: string | null | undefined): string {
  const ms = toMs(iso);
  if (!Number.isFinite(ms)) return '-';
  const p = wibParts(ms);
  return `${p.day}/${p.month}/${p.year}`;
}

/** 'YYYY-MM-DD' menurut tanggal WIB (untuk nama file). */
export function dateStampWIB(nowMs?: number): string {
  const ms = typeof nowMs === 'number' && Number.isFinite(new Date(nowMs).getTime()) ? nowMs : Date.now();
  const p = wibParts(ms);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Bagian nama file aman (aturan sama dengan safeFilePart di klien): A-Za-z0-9-, pemisah '_', ≤ 60. */
export function safeFileNamePart(s: string | null | undefined): string {
  const cleaned = (s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
  return cleaned || 'Paket';
}

/** Header Content-Disposition: fallback ASCII + filename* UTF-8 (RFC 6266 / 5987). */
export function contentDisposition(fileName: string): string {
  const name =
    Array.from(String(fileName ?? ''))
      .filter((ch) => {
        const code = ch.charCodeAt(0);
        if (ch.length === 1 && code >= 0xd800 && code <= 0xdfff) return false; // lone surrogate
        return code > 0x1f && code !== 0x7f;
      })
      .join('') || 'download.xlsx';
  const ascii = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

// ═══════════════════════════════════════════════════════════════
// Helper sel & sheet
// ═══════════════════════════════════════════════════════════════

const hasText = (v: string | null | undefined): v is string => typeof v === 'string' && v.trim() !== '';

/** Angka apa adanya; '-' bila null / tidak berlaku. */
const numOrDash = (v: number | null | undefined): XlsxCell =>
  typeof v === 'number' && Number.isFinite(v) ? v : '-';

const textOrDash = (v: string | null | undefined): string => (hasText(v) ? v : '-');

const optionLetter = (idx: number): string => OPTION_LETTERS[idx] ?? String(idx + 1);

const fmtCount = (n: number): string => n.toLocaleString('id-ID');

function keyValueSheet(name: string, rows: Row[]): XlsxSheet {
  return {
    name,
    columns: [
      { header: 'Keterangan', width: 34 },
      { header: 'Nilai', width: 80, wrap: true },
    ],
    rows,
    autoFilter: false,
  };
}

/** Sheet berisi satu baris pesan (tanpa header). */
function messageSheet(name: string, message: string): XlsxSheet {
  return { name, rows: [[message]] };
}

/** Header tetap ditampilkan, isinya satu baris pesan (tanpa autofilter). */
function emptyTableSheet(name: string, columns: XlsxColumn[], message: string): XlsxSheet {
  return { name, columns, rows: [[message]], autoFilter: false };
}

const MSG_NO_QUESTIONS = 'Paket ini belum memiliki soal.';
const MSG_NO_OBJECTIVE = 'Tidak ada soal objektif (pilihan ganda / benar-salah) pada paket ini.';
const MSG_NOT_APPLICABLE_ESSAY = 'Tidak berlaku untuk soal essay / studi kasus.';
const MSG_NO_PARTICIPANTS = 'Belum ada peserta yang sesuai filter.';
const MSG_NO_ERRORS = 'Tidak ada jawaban salah atau kosong pada soal objektif.';
const MSG_NO_NON_CORRECT = 'Tidak ada peserta yang salah atau tidak menjawab soal ini.';

const EXAM_STATUS_LABELS: Record<string, string> = {
  active: 'Aktif (Sesi Dibuka)',
  closed: 'Ditutup (Sesi Ditutup)',
  draft: 'Draft (Disembunyikan)',
};

function examStatusLabel(status: string | null | undefined): string {
  if (!hasText(status)) return '-';
  return Object.prototype.hasOwnProperty.call(EXAM_STATUS_LABELS, status) ? EXAM_STATUS_LABELS[status] : status;
}

function formatRange(start: string | null | undefined, end: string | null | undefined): string {
  if (hasText(start) && hasText(end)) return `${formatDateTimeWIB(start)} – ${formatDateTimeWIB(end)}`;
  if (hasText(start)) return `Mulai ${formatDateTimeWIB(start)}`;
  if (hasText(end)) return `Selesai ${formatDateTimeWIB(end)}`;
  return '-';
}

function formatPeriodFilter(from: string | null, to: string | null): string {
  if (from && to) return `${formatDateTimeWIB(from)} – ${formatDateTimeWIB(to)}`;
  if (from) return `Sejak ${formatDateTimeWIB(from)}`;
  if (to) return `Sampai ${formatDateTimeWIB(to)}`;
  return 'Semua';
}

function describeFilters(f: AppliedFilters): string {
  return (
    `Company: ${f.company || 'Semua'}; Department: ${f.department || 'Semua'}; ` +
    `Periode: ${formatPeriodFilter(f.from, f.to)}`
  );
}

function difficultyNote(): string {
  const { easyMinPct: easy, mediumMinPct: medium } = DIFFICULTY_THRESHOLDS;
  return (
    `${DIFFICULTY_DISCLAIMER} Batas: Mudah bila % benar ≥ ${easy}; ` +
    `Sedang bila ${medium} ≤ % benar < ${easy}; Sulit bila % benar < ${medium}.`
  );
}

/**
 * Format jawaban: MC "B. <teks>", B/S "Benar", opsi tak dikenal "Lainnya (<id>)".
 * label & text mengikuti describeAnswer (null/null = tidak ada jawaban).
 */
function formatAnswer(type: string | undefined, label: string | null, text: string | null, fallback: string): string {
  if (label === null && text === null) return fallback;
  if (label === 'Lainnya') return text ? `Lainnya (${text})` : 'Lainnya';
  if (type === 'true_false') return label || text || fallback;
  if (type === 'multiple_choice') return label && text ? `${label}. ${text}` : label || text || fallback;
  return label && text && label !== text ? `${label}. ${text}` : label || text || fallback;
}

function participantAnswer(
  type: string | undefined,
  status: NonCorrectStatus,
  label: string | null,
  text: string | null
): string {
  return status === 'empty' ? '(Tidak menjawab)' : formatAnswer(type, label, text, '-');
}

const nonCorrectStatusLabel = (status: NonCorrectStatus): string => (status === 'empty' ? 'Tidak Menjawab' : 'Salah');

const distributionStatus = (d: OptionDistributionRow): string =>
  d.kind === 'option' ? (d.isCorrect ? 'BENAR' : 'Salah') : '-';

function truncatedNote(shown: number): string {
  return `Catatan: daftar dipotong pada ${fmtCount(shown)} baris pertama (batas maksimum ekspor). Persempit filter untuk melihat sisanya.`;
}

// ═══════════════════════════════════════════════════════════════
// Download Soal
// ═══════════════════════════════════════════════════════════════

/** Jumlah kolom opsi = opsi terakhir yang berisi teks (+ posisi kunci bila withKey), bukan E kosong paksa. */
function mcOptionColumnCount(questions: NormQuestion[], withKey: boolean): number {
  let max = 0;
  for (const q of questions) {
    let n = 0;
    q.options.forEach((o, i) => {
      if (hasText(o.text)) n = i + 1;
    });
    if (withKey) {
      const keyIdx = q.options.findIndex((o) => o.id === q.correctAnswerId);
      if (keyIdx + 1 > n) n = keyIdx + 1;
    }
    if (n > max) max = n;
  }
  return max;
}

function mcKeyLetter(q: NormQuestion): string {
  if (!q.correctAnswerId) return '-';
  const idx = q.options.findIndex((o) => o.id === q.correctAnswerId);
  return idx >= 0 ? optionLetter(idx) : `Lainnya (${q.correctAnswerId})`;
}

function tfKeyLabel(q: NormQuestion): string {
  if (q.correctAnswerId === 'true') return 'Benar';
  if (q.correctAnswerId === 'false') return 'Salah';
  return q.correctAnswerId ? `Lainnya (${q.correctAnswerId})` : '-';
}

/** Kunci / rubrik essay & studi kasus = sampleAnswer, atau explanation bila kosong. */
function rubricText(q: NormQuestion): string | null {
  if (hasText(q.sampleAnswer)) return q.sampleAnswer;
  if (hasText(q.explanation)) return q.explanation;
  return null;
}

export function buildQuestionSheetWorkbook(
  exam: NormExam,
  questions: NormQuestion[],
  opts: { withKey: boolean; nowMs?: number }
): { sheets: XlsxSheet[]; fileName: string } {
  const withKey = opts.withKey === true;
  const nowMs = typeof opts.nowMs === 'number' && Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const ordered = [...(questions || [])].sort((a, b) => a.no - b.no);
  const hasMateri = ordered.some((q) => Boolean(q.materi));

  const sheets: XlsxSheet[] = [
    keyValueSheet('Info Paket', [
      ['Nama Paket', textOrDash(exam.title)],
      ['Kategori', textOrDash(exam.category)],
      ['Company', textOrDash(exam.scope)],
      ['Status', examStatusLabel(exam.status)],
      ['Passing Score', numOrDash(exam.passingScore)],
      ['Durasi (menit)', numOrDash(exam.durationMinutes)],
      ['Jadwal Mulai', formatDateTimeWIB(exam.startTime)],
      ['Jadwal Selesai', formatDateTimeWIB(exam.endTime)],
      ['Jumlah Soal', ordered.length],
      ['Kunci Jawaban', withKey ? 'Disertakan' : 'Tidak disertakan'],
      ['Diunduh pada (WIB)', formatMsWIB(nowMs)],
    ]),
  ];

  const mc: NormQuestion[] = [];
  const tf: NormQuestion[] = [];
  const caseStudy: NormQuestion[] = [];
  const essay: NormQuestion[] = [];
  const other: NormQuestion[] = [];
  for (const q of ordered) {
    if (q.type === 'multiple_choice') mc.push(q);
    else if (q.type === 'true_false') tf.push(q);
    else if (q.type === 'case_study') caseStudy.push(q);
    else if (q.type === 'essay') essay.push(q);
    else other.push(q);
  }

  const noCol: XlsxColumn = { header: 'No', width: 6 };
  const pointsCol: XlsxColumn = { header: 'Poin', width: 8 };
  const materiCol: XlsxColumn = { header: 'Materi', width: 24, wrap: true };
  const materiCell = (q: NormQuestion): XlsxCell => q.materi || null;
  /** Kolom kunci ([…]) hanya bila withKey; Materi hanya bila ada soal bermateri. */
  const tail = (keyCols: XlsxColumn[]): XlsxColumn[] => [
    ...(withKey ? keyCols : []),
    pointsCol,
    ...(hasMateri ? [materiCol] : []),
  ];
  const tailCells = (q: NormQuestion, keyCells: XlsxCell[]): XlsxCell[] => [
    ...(withKey ? keyCells : []),
    q.points,
    ...(hasMateri ? [materiCell(q)] : []),
  ];

  if (mc.length > 0) {
    const optionCount = mcOptionColumnCount(mc, withKey);
    const optionCols: XlsxColumn[] = [];
    for (let i = 0; i < optionCount; i++) optionCols.push({ header: optionLetter(i), width: 30, wrap: true });
    sheets.push({
      name: 'Pilihan Ganda',
      columns: [
        noCol,
        { header: 'Pertanyaan', width: 60, wrap: true },
        ...optionCols,
        ...tail([{ header: 'Jawaban Benar', width: 14 }]),
      ],
      rows: mc.map((q) => {
        const options: XlsxCell[] = [];
        for (let i = 0; i < optionCount; i++) options.push(q.options[i]?.text ?? null);
        return [q.no, q.questionText, ...options, ...tailCells(q, [mcKeyLetter(q)])];
      }),
    });
  }

  if (tf.length > 0) {
    sheets.push({
      name: 'Benar-Salah',
      columns: [noCol, { header: 'Pertanyaan', width: 70, wrap: true }, ...tail([{ header: 'Jawaban Benar', width: 14 }])],
      rows: tf.map((q) => [q.no, q.questionText, ...tailCells(q, [tfKeyLabel(q)])]),
    });
  }

  if (caseStudy.length > 0) {
    sheets.push({
      name: 'Studi Kasus',
      columns: [
        noCol,
        { header: 'Narasi Studi Kasus', width: 60, wrap: true },
        { header: 'Pertanyaan', width: 50, wrap: true },
        ...tail([{ header: 'Kunci / Rubrik', width: 50, wrap: true }]),
      ],
      rows: caseStudy.map((q) => [q.no, q.caseStudyStory, q.questionText, ...tailCells(q, [rubricText(q)])]),
    });
  }

  if (essay.length > 0) {
    sheets.push({
      name: 'Essay',
      columns: [
        noCol,
        { header: 'Pertanyaan', width: 70, wrap: true },
        ...tail([{ header: 'Kunci / Rubrik', width: 60, wrap: true }]),
      ],
      rows: essay.map((q) => [q.no, q.questionText, ...tailCells(q, [rubricText(q)])]),
    });
  }

  if (other.length > 0) {
    sheets.push({
      name: 'Lainnya',
      columns: [
        noCol,
        { header: 'Tipe', width: 16 },
        { header: 'Pertanyaan', width: 60, wrap: true },
        ...tail([{ header: 'Kunci', width: 40, wrap: true }]),
      ],
      rows: other.map((q) => {
        const key =
          rubricText(q) ?? (q.correctAnswerId && q.correctAnswerId !== 'essay' ? q.correctAnswerId : null);
        return [q.no, questionTypeLabel(q.type), q.questionText, ...tailCells(q, [key])];
      }),
    });
  }

  if (ordered.length === 0) sheets.push(messageSheet('Soal', MSG_NO_QUESTIONS));

  const suffix = withKey ? '_DenganKunci' : '';
  return {
    sheets,
    fileName: `Soal_${safeFileNamePart(exam.title)}_${dateStampWIB(nowMs)}${suffix}.xlsx`,
  };
}

// ═══════════════════════════════════════════════════════════════
// Download Analisis (6 sheet)
// ═══════════════════════════════════════════════════════════════

export function buildAnalyticsWorkbook(input: {
  summary: ExamAnalyticsSummaryResponse;
  participants: ParticipantRow[];
  errors: ErrorRow[];
  errorsTruncated: boolean;
  questionTexts?: Record<string, string>;
  nowMs?: number;
}): { sheets: XlsxSheet[]; fileName: string } {
  const { summary } = input;
  const exam = summary.exam;
  const s = summary.summary;
  const filters = summary.filters;
  const nowMs = typeof input.nowMs === 'number' && Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const questions = [...(summary.questions || [])].sort((a, b) => a.no - b.no);
  const hasMateri = summary.materialAvailable === true;
  const typeById = new Map(questions.map((q) => [q.questionId, q.type] as const));

  const fullText = (questionId: string, preview: string): string => {
    const full = input.questionTexts ? input.questionTexts[questionId] : undefined;
    return typeof full === 'string' && full !== '' ? full : preview;
  };

  // 1. Ringkasan
  const ringkasan: Row[] = [
    ['Nama Paket', textOrDash(exam.title)],
    ['Kategori', textOrDash(exam.category)],
    ['Company', textOrDash(exam.scope)],
    ['Jadwal Paket', formatRange(exam.startTime, exam.endTime)],
    ['Periode Pengerjaan', formatRange(s.firstCompletedAt, s.lastCompletedAt)],
    ['Filter Company', filters.company || 'Semua'],
    ['Filter Department', filters.department || 'Semua'],
    ['Filter Periode', formatPeriodFilter(filters.from, filters.to)],
    ['Total Peserta', s.totalParticipants],
    ['Total Attempt', s.totalAttempts],
    ['Total Soal', s.questionCount],
    ['Rata-rata Nilai', numOrDash(s.avgScore)],
    ['Nilai Tertinggi', numOrDash(s.maxScore)],
    ['Nilai Terendah', numOrDash(s.minScore)],
    ['Pass Rate (%)', numOrDash(s.passRatePct)],
    ['Passing Score', numOrDash(exam.passingScore)],
    ['Rata-rata Jawaban Benar (objektif)', numOrDash(s.avgCorrectObjective)],
    ['Total Tidak Menjawab', s.totalUnanswered],
    ['Peserta Menunggu Penilaian', s.pendingGradingParticipants],
    ['Data dihitung pada (WIB)', formatDateTimeWIB(summary.generatedAt)],
    ['Basis Perhitungan', summary.basisNote],
    ['Indikasi Kesulitan', difficultyNote()],
  ];
  if (summary.truncated) {
    ringkasan.push([
      'Peringatan',
      'Jumlah attempt melebihi batas aman pemuatan server; analisis hanya mencakup sebagian attempt.',
    ]);
  }

  // 2. Analisis Soal
  const hasEssay = questions.some((q) => q.essay != null || q.type === 'essay' || q.type === 'case_study');
  const soalColumns: XlsxColumn[] = [
    { header: 'No', width: 6 },
    { header: 'Soal', width: 60, wrap: true },
    { header: 'Tipe', width: 14 },
    ...(hasMateri ? [{ header: 'Materi', width: 24, wrap: true }] : []),
    { header: 'Total', width: 8 },
    { header: 'Benar', width: 8 },
    { header: 'Salah', width: 8 },
    { header: 'Kosong', width: 8 },
    { header: '% Benar', width: 10 },
    { header: '% Salah', width: 10 },
    { header: 'Indikasi Kesulitan', width: 18 },
    ...(hasEssay
      ? [
          { header: 'Rata-rata Skor Essay', width: 14 },
          { header: 'Skor Min', width: 10 },
          { header: 'Skor Maks', width: 10 },
          { header: 'Poin Maks', width: 10 },
          { header: 'Menunggu Penilaian', width: 14 },
        ]
      : []),
  ];
  const soalRows: Row[] = questions.map((q) => {
    const e = q.essay;
    return [
      q.no,
      fullText(q.questionId, q.textPreview),
      q.typeLabel || questionTypeLabel(q.type),
      ...(hasMateri ? [textOrDash(q.materi)] : []),
      q.total,
      numOrDash(q.correct),
      numOrDash(q.wrong),
      q.empty,
      numOrDash(q.pctCorrect),
      numOrDash(q.pctWrong),
      q.difficulty || '-',
      ...(hasEssay
        ? e
          ? [numOrDash(e.avgScore), numOrDash(e.minScore), numOrDash(e.maxScore), numOrDash(e.maxPoint), e.pending]
          : ['-', '-', '-', '-', '-']
        : []),
    ];
  });

  // 3. Distribusi Jawaban (objektif saja)
  const distRows: Row[] = [];
  for (const q of questions) {
    if (!isObjectiveType(q.type)) continue;
    const dist = summary.distributions ? summary.distributions[q.questionId] : undefined;
    if (!Array.isArray(dist)) continue;
    for (const d of dist) {
      distRows.push([q.no, q.textPreview, q.typeLabel, d.label, textOrDash(d.text), d.count, numOrDash(d.pct), distributionStatus(d)]);
    }
  }

  // 5. Peserta
  const pesertaColumns: XlsxColumn[] = [
    { header: 'Peserta', width: 28 },
    { header: 'Company', width: 12 },
    { header: 'Department', width: 22 },
    { header: 'Nilai', width: 8 },
    { header: 'Benar', width: 8 },
    { header: 'Salah', width: 8 },
    { header: 'Kosong', width: 8 },
    { header: 'Status', width: 20 },
    { header: 'Jumlah Attempt', width: 14 },
    { header: 'Waktu Selesai (WIB)', width: 22 },
  ];
  const pesertaRows: Row[] = (input.participants || []).map((p) => [
    p.name,
    textOrDash(p.company),
    textOrDash(p.department),
    numOrDash(p.score),
    p.correct,
    p.wrong,
    p.empty,
    p.status,
    p.attemptCount,
    formatDateTimeWIB(p.completedAt),
  ]);

  // 6. Detail Kesalahan (satu baris = satu jawaban objektif yang tidak benar)
  const errorColumns: XlsxColumn[] = [
    { header: 'Peserta', width: 28 },
    { header: 'Company', width: 12 },
    { header: 'Department', width: 22 },
    { header: 'No Soal', width: 8 },
    ...(hasMateri ? [{ header: 'Materi', width: 24, wrap: true }] : []),
    { header: 'Jawaban Peserta', width: 36, wrap: true },
    { header: 'Jawaban Benar', width: 36, wrap: true },
    { header: 'Poin', width: 8 },
    { header: 'Status', width: 16 },
    { header: 'Waktu Selesai', width: 22 },
    { header: 'Soal', width: 60, wrap: true },
  ];
  const errors = input.errors || [];
  const errorRows: Row[] = errors.map((e) => {
    const type = typeById.get(e.questionId);
    return [
      e.name,
      textOrDash(e.company),
      textOrDash(e.department),
      e.no,
      ...(hasMateri ? [textOrDash(e.materi)] : []),
      participantAnswer(type, e.status, e.answerLabel, e.answerText),
      formatAnswer(type, e.correctLabel, e.correctText, '-'),
      numOrDash(e.maxPoints),
      nonCorrectStatusLabel(e.status),
      formatDateTimeWIB(e.completedAt),
      e.textPreview,
    ];
  });
  // Baris kosong memisahkan catatan dari tabel (autofilter berhenti di baris kosong).
  if (input.errorsTruncated && errorRows.length > 0) errorRows.push([], [truncatedNote(errors.length)]);

  const sheets: XlsxSheet[] = [
    keyValueSheet('Ringkasan', ringkasan),
    soalRows.length > 0
      ? { name: 'Analisis Soal', columns: soalColumns, rows: soalRows }
      : emptyTableSheet('Analisis Soal', soalColumns, MSG_NO_QUESTIONS),
    distRows.length > 0
      ? {
          name: 'Distribusi Jawaban',
          columns: [
            { header: 'No', width: 6 },
            { header: 'Soal', width: 50, wrap: true },
            { header: 'Tipe', width: 14 },
            { header: 'Pilihan', width: 16 },
            { header: 'Teks Pilihan', width: 40, wrap: true },
            { header: 'Jumlah', width: 10 },
            { header: 'Persentase (%)', width: 14 },
            { header: 'Status', width: 10 },
          ],
          rows: distRows,
        }
      : messageSheet('Distribusi Jawaban', MSG_NO_OBJECTIVE),
    hasMateri
      ? {
          name: 'Analisis Materi',
          columns: [
            { header: 'Materi', width: 30, wrap: true },
            { header: 'Jumlah Soal', width: 12 },
            { header: 'Benar', width: 10 },
            { header: 'Salah', width: 10 },
            { header: 'Kosong', width: 10 },
            { header: '% Benar', width: 10 },
          ],
          rows: (summary.materials || []).map((m) => [
            m.materi,
            m.questionCount,
            m.correct,
            m.wrong,
            m.empty,
            numOrDash(m.pctCorrect),
          ]),
        }
      : messageSheet('Analisis Materi', MATERIAL_UNAVAILABLE_MESSAGE),
    pesertaRows.length > 0
      ? { name: 'Peserta', columns: pesertaColumns, rows: pesertaRows }
      : emptyTableSheet('Peserta', pesertaColumns, MSG_NO_PARTICIPANTS),
    errorRows.length > 0
      ? { name: 'Detail Kesalahan', columns: errorColumns, rows: errorRows }
      : emptyTableSheet('Detail Kesalahan', errorColumns, MSG_NO_ERRORS),
  ];

  return {
    sheets,
    fileName: `Analisis_${safeFileNamePart(exam.title)}_${dateStampWIB(nowMs)}.xlsx`,
  };
}

// ═══════════════════════════════════════════════════════════════
// Detail Soal (3 sheet)
// ═══════════════════════════════════════════════════════════════

export function buildQuestionDetailWorkbook(
  detail: QuestionDetailResponse,
  opts?: { nowMs?: number }
): { sheets: XlsxSheet[]; fileName: string } {
  const q = detail.question;
  const stat = detail.stat;
  const objective = isObjectiveType(q.type);
  const nowMs = typeof opts?.nowMs === 'number' && Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();

  const info: Row[] = [
    ['Paket', textOrDash(detail.exam.title)],
    ['No Soal', q.no],
    ['Tipe', q.typeLabel || questionTypeLabel(q.type)],
  ];
  if (detail.materialAvailable) info.push(['Materi', textOrDash(q.materi)]);
  info.push(['Poin', numOrDash(q.points)], ['Pertanyaan', textOrDash(q.questionText)]);
  if (hasText(q.caseStudyStory)) info.push(['Narasi', q.caseStudyStory]);
  if (objective) {
    (q.options || []).forEach((o, i) => {
      info.push([q.type === 'true_false' ? `Opsi ${i + 1}` : `Opsi ${o.label}`, textOrDash(o.text)]);
    });
    const key = q.correctAnswer;
    info.push(['Jawaban Benar', key ? formatAnswer(q.type, key.label, key.text, '-') : '-']);
  } else {
    info.push(['Kunci / Rubrik', textOrDash(q.sampleAnswer)]);
  }
  info.push(['Pembahasan', textOrDash(q.explanation)], ['Total Peserta', stat.total]);
  if (objective) {
    info.push(
      ['Benar', numOrDash(stat.correct)],
      ['Salah', numOrDash(stat.wrong)],
      ['Tidak Menjawab', stat.empty],
      ['% Benar', numOrDash(stat.pctCorrect)],
      ['% Salah', numOrDash(stat.pctWrong)],
      ['Indikasi Kesulitan', stat.difficulty || '-']
    );
    if (stat.scoringMismatchCount > 0) {
      info.push([
        'Catatan Kunci',
        `${fmtCount(stat.scoringMismatchCount)} jawaban tersimpan berbeda dengan kunci jawaban saat ini ` +
          '(kemungkinan kunci diubah setelah ujian). Statistik Benar/Salah mengikuti penilaian tersimpan.',
      ]);
    }
  } else {
    // Essay / studi kasus tidak dinilai benar/salah otomatis.
    const e = stat.essay;
    info.push(
      ['Tidak Menjawab', stat.empty],
      ['Dijawab', e ? e.answered : '-'],
      ['Sudah Dinilai', e ? e.graded : '-'],
      ['Menunggu Penilaian', e ? e.pending : '-'],
      ['Rata-rata Skor', numOrDash(e?.avgScore)],
      ['Skor Min', numOrDash(e?.minScore)],
      ['Skor Maks', numOrDash(e?.maxScore)],
      ['Poin Maks', numOrDash(e ? e.maxPoint : q.points)]
    );
  }
  info.push(['Filter', describeFilters(detail.filters)], ['Data dihitung pada', formatDateTimeWIB(detail.generatedAt)]);

  const sheets: XlsxSheet[] = [keyValueSheet('Soal', info)];

  if (!objective) {
    sheets.push(
      messageSheet('Distribusi Jawaban', MSG_NOT_APPLICABLE_ESSAY),
      messageSheet('Peserta yang Salah', MSG_NOT_APPLICABLE_ESSAY)
    );
  } else {
    sheets.push({
      name: 'Distribusi Jawaban',
      columns: [
        { header: 'Pilihan', width: 16 },
        { header: 'Teks', width: 50, wrap: true },
        { header: 'Jumlah', width: 10 },
        { header: 'Persentase (%)', width: 14 },
        { header: 'Status', width: 10 },
      ],
      rows: (detail.distribution || []).map((d) => [
        d.label,
        textOrDash(d.text),
        d.count,
        numOrDash(d.pct),
        distributionStatus(d),
      ]),
    });

    const wrongColumns: XlsxColumn[] = [
      { header: 'Peserta', width: 28 },
      { header: 'Company', width: 12 },
      { header: 'Department', width: 22 },
      { header: 'Status', width: 16 },
      { header: 'Jawaban', width: 36, wrap: true },
      { header: 'Jawaban Benar', width: 36, wrap: true },
      { header: 'Poin', width: 8 },
      { header: 'Waktu Selesai', width: 22 },
    ];
    const participants = detail.nonCorrectParticipants || [];
    const wrongRows: Row[] = participants.map((p) => [
      p.name,
      textOrDash(p.company),
      textOrDash(p.department),
      nonCorrectStatusLabel(p.status),
      participantAnswer(q.type, p.status, p.answerLabel, p.answerText),
      formatAnswer(q.type, p.correctLabel, p.correctText, '-'),
      numOrDash(p.maxPoints),
      formatDateTimeWIB(p.completedAt),
    ]);
    if (detail.truncated && wrongRows.length > 0) wrongRows.push([], [truncatedNote(participants.length)]);
    sheets.push(
      wrongRows.length > 0
        ? { name: 'Peserta yang Salah', columns: wrongColumns, rows: wrongRows }
        : emptyTableSheet('Peserta yang Salah', wrongColumns, MSG_NO_NON_CORRECT)
    );
  }

  return { sheets, fileName: `Detail_Soal_${q.no}_${dateStampWIB(nowMs)}.xlsx` };
}
