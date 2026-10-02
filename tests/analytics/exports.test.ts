import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32 as zlibCrc32, inflateRawSync } from 'node:zlib';
import {
  buildAnalyticsWorkbook,
  buildQuestionDetailWorkbook,
  buildQuestionSheetWorkbook,
  contentDisposition,
  dateStampWIB,
  formatDateTimeWIB,
  formatDateWIB,
  safeFileNamePart,
} from '../../server/analytics/exports';
import { buildXlsx } from '../../server/analytics/xlsx';
import { safeFilePart } from '../../src/components/admin/analytics/format';
import {
  ATTEMPT_BASIS_NOTE,
  DIFFICULTY_DISCLAIMER,
  MATERIAL_UNAVAILABLE_MESSAGE,
} from '../../src/lib/analytics/contract';
import type {
  AppliedFilters,
  ErrorRow,
  ExamAnalyticsSummaryResponse,
  OptionDistributionRow,
  ParticipantAnswerRow,
  ParticipantRow,
  QuestionDetailResponse,
  QuestionStat,
} from '../../src/lib/analytics/contract';
import type { NormExam, NormQuestion, XlsxSheet } from '../../server/analytics/types';

/** 2026-10-01T18:30Z = 2026-10-02 01:30 WIB (tanggal WIB berbeda dengan UTC). */
const NOW = Date.UTC(2026, 9, 1, 18, 30);

// ─── Helper ───

type Workbook = { sheets: XlsxSheet[]; fileName: string };

function sheet(wb: Workbook, name: string): XlsxSheet {
  const found = wb.sheets.find((s) => s.name === name);
  assert.ok(found, `sheet "${name}" ada`);
  return found;
}

const headers = (s: XlsxSheet) => (s.columns || []).map((c) => c.header);
const sheetNames = (wb: Workbook) => wb.sheets.map((s) => s.name);

/** Nilai kolom "Nilai" untuk label "Keterangan" (sheet key-value). */
function kv(s: XlsxSheet, label: string) {
  const row = s.rows.find((r) => r[0] === label);
  assert.ok(row, `baris "${label}" ada`);
  return row[1];
}

const hasLabel = (s: XlsxSheet, label: string) => s.rows.some((r) => r[0] === label);

/** Unzip lewat central directory, verifikasi CRC, kembalikan semua part XML. */
function unzipXml(buf: Buffer): Map<string, string> {
  const eocd = buf.length - 22;
  assert.equal(buf.readUInt32LE(eocd), 0x06054b50);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const skip = buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = inflateRawSync(buf.subarray(start, start + compSize));
    assert.equal(zlibCrc32(data), crc, `${name}: CRC`);
    out.set(name, data.toString('utf8'));
    p += 46 + nameLen + skip;
  }
  return out;
}

function allXml(wb: Workbook): string {
  return [...unzipXml(buildXlsx(wb.sheets, { createdAt: new Date(NOW).toISOString() })).values()].join('\n');
}

const NO_FILTERS: AppliedFilters = { company: null, department: null, from: null, to: null };

// ─── Fixture Download Soal ───

function makeExam(partial: Partial<NormExam> = {}): NormExam {
  return {
    id: 'exam-1',
    title: 'Ujian K3 Dasar (Batch #1)',
    description: 'Deskripsi',
    category: 'Keselamatan Kerja (K3)',
    scope: 'BANK',
    status: 'active',
    passingScore: 75,
    durationMinutes: 30,
    authorName: 'Admin K3',
    createdAt: '2026-09-01T00:00:00.000Z',
    startTime: '2026-10-01T08:00',
    endTime: '2026-10-01T17:00',
    ...partial,
  };
}

const LETTERS = 'ABCDE';
const options = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `opt-${LETTERS[i].toLowerCase()}`, text: `Opsi ${LETTERS[i]}` }));

function makeQuestion(partial: Partial<NormQuestion> & Pick<NormQuestion, 'id' | 'no' | 'type'>): NormQuestion {
  return {
    examId: 'exam-1',
    questionText: `Pertanyaan ${partial.no}`,
    options: [],
    correctAnswerId: '',
    explanation: null,
    points: 10,
    caseStudyStory: null,
    sampleAnswer: null,
    materi: null,
    ...partial,
  };
}

const TF_OPTIONS = [
  { id: 'true', text: 'Benar' },
  { id: 'false', text: 'Salah' },
];

/** Paket campuran; sengaja tidak urut agar urutan kanonik (no) diuji. */
function mixedQuestions(): NormQuestion[] {
  return [
    makeQuestion({ id: 'q-5', no: 5, type: 'multiple_choice', options: options(4), correctAnswerId: 'opt-a', explanation: 'PEMBAHASAN-MC-RAHASIA' }),
    makeQuestion({ id: 'q-2', no: 2, type: 'true_false', options: TF_OPTIONS, correctAnswerId: 'false', points: 5 }),
    makeQuestion({
      id: 'q-3',
      no: 3,
      type: 'essay',
      correctAnswerId: 'essay',
      sampleAnswer: 'RUBRIK-ESSAY-RAHASIA',
      explanation: 'PEMBAHASAN-ESSAY-RAHASIA',
      points: 20,
    }),
    makeQuestion({ id: 'q-1', no: 1, type: 'multiple_choice', options: options(5), correctAnswerId: 'opt-e' }),
    makeQuestion({
      id: 'q-4',
      no: 4,
      type: 'case_study',
      correctAnswerId: 'essay',
      caseStudyStory: 'Narasi kasus gudang',
      explanation: 'PEMBAHASAN-KASUS-RAHASIA',
      points: 25,
    }),
    makeQuestion({ id: 'q-6', no: 6, type: 'matching', correctAnswerId: 'KUNCI-LAIN-RAHASIA' }),
  ];
}

// ═══════════════════════════════════════════════════════════════
// Tanggal, nama file, header
// ═══════════════════════════════════════════════════════════════

test('formatDateTimeWIB / formatDateWIB / dateStampWIB memakai zona Asia/Jakarta', () => {
  assert.equal(formatDateTimeWIB('2026-10-01T18:30:00.000Z'), '02/10/2026 01:30 WIB');
  assert.equal(formatDateTimeWIB('2026-10-01T17:00:00Z'), '02/10/2026 00:00 WIB', 'tengah malam = 00, bukan 24');
  assert.equal(formatDateTimeWIB('2026-08-20T08:00:00+00:00'), '20/08/2026 15:00 WIB');
  // nilai datetime-local tanpa zona (jadwal paket) dibaca sebagai jam WIB, bukan zona server
  assert.equal(formatDateTimeWIB('2026-08-20T08:00'), '20/08/2026 08:00 WIB');
  assert.equal(formatDateTimeWIB('2026-08-20T08:00:30.250'), '20/08/2026 08:00 WIB');
  assert.equal(formatDateTimeWIB('2026-08-20 08:00:00'), '20/08/2026 08:00 WIB');
  for (const bad of [null, undefined, '', '   ', 'bukan tanggal', '2026-13-45T99:99']) {
    assert.equal(formatDateTimeWIB(bad), '-', String(bad));
    assert.equal(formatDateWIB(bad), '-', String(bad));
  }
  assert.equal(formatDateWIB('2026-10-01T18:30:00Z'), '02/10/2026');
  assert.equal(formatDateWIB('2026-08-20'), '20/08/2026');

  assert.equal(dateStampWIB(NOW), '2026-10-02');
  assert.equal(dateStampWIB(Date.UTC(2026, 11, 31, 16, 59)), '2026-12-31');
  assert.equal(dateStampWIB(Date.UTC(2026, 11, 31, 17, 0)), '2027-01-01');
  assert.match(dateStampWIB(), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(dateStampWIB(Number.NaN), /^\d{4}-\d{2}-\d{2}$/);
});

test('safeFileNamePart: aturan sama persis dengan safeFilePart klien', () => {
  assert.equal(safeFileNamePart('Ujian K3 Dasar (Batch #1)'), 'Ujian_K3_Dasar_Batch_1');
  assert.equal(safeFileNamePart('Pelatihan Café Été'), 'Pelatihan_Cafe_Ete');
  assert.equal(safeFileNamePart('Ujian-SEC 2026'), 'Ujian-SEC_2026');
  for (const empty of ['', null, undefined, '###', '   ']) assert.equal(safeFileNamePart(empty), 'Paket');
  assert.ok(safeFileNamePart('x'.repeat(100)).length <= 60);
  const samples = [
    'Ujian K3 Dasar (Batch #1)',
    'Pelatihan Café Été',
    '  __Paket__  ',
    'Ujian/IT\\Security:2026?',
    'Ünïcödé — “kutip” 😀',
    `${'a'.repeat(59)} b c`,
    '',
    null,
  ];
  for (const s of samples) assert.equal(safeFileNamePart(s), safeFilePart(s), `sama dengan klien: ${s}`);
});

test('contentDisposition: fallback ASCII + filename* UTF-8, aman dari injeksi header', () => {
  assert.equal(
    contentDisposition('Soal_Ujian_2026-10-02.xlsx'),
    `attachment; filename="Soal_Ujian_2026-10-02.xlsx"; filename*=UTF-8''Soal_Ujian_2026-10-02.xlsx`
  );
  assert.equal(
    contentDisposition('Analisis Café "Uji" (1)\\x.xlsx'),
    `attachment; filename="Analisis Cafe _Uji_ (1)_x.xlsx"; filename*=UTF-8''Analisis%20Caf%C3%A9%20%22Uji%22%20%281%29%5Cx.xlsx`
  );
  const injected = contentDisposition('a.xlsx\r\nSet-Cookie: x=1');
  assert.ok(!/[\r\n]/.test(injected), 'tanpa CR/LF');
  assert.ok(contentDisposition('x\uD800.xlsx').includes(`filename*=UTF-8''x.xlsx`), 'lone surrogate dibuang');
  assert.ok(contentDisposition('').startsWith('attachment; filename="download.xlsx"'));
});

// ═══════════════════════════════════════════════════════════════
// Download Soal
// ═══════════════════════════════════════════════════════════════

test('Download Soal: paket PG saja dengan 4 opsi → tanpa kolom E; kunci hanya bila withKey', () => {
  const questions = [
    makeQuestion({ id: 'q-1', no: 1, type: 'multiple_choice', options: options(4), correctAnswerId: 'opt-b' }),
    makeQuestion({ id: 'q-2', no: 2, type: 'multiple_choice', options: options(4), correctAnswerId: 'opt-d', points: 15 }),
  ];
  const plain = buildQuestionSheetWorkbook(makeExam(), questions, { withKey: false, nowMs: NOW });
  assert.deepEqual(sheetNames(plain), ['Info Paket', 'Pilihan Ganda']);
  assert.equal(plain.fileName, 'Soal_Ujian_K3_Dasar_Batch_1_2026-10-02.xlsx');
  const pg = sheet(plain, 'Pilihan Ganda');
  assert.deepEqual(headers(pg), ['No', 'Pertanyaan', 'A', 'B', 'C', 'D', 'Poin']);
  assert.deepEqual(pg.rows, [
    [1, 'Pertanyaan 1', 'Opsi A', 'Opsi B', 'Opsi C', 'Opsi D', 10],
    [2, 'Pertanyaan 2', 'Opsi A', 'Opsi B', 'Opsi C', 'Opsi D', 15],
  ]);

  const info = sheet(plain, 'Info Paket');
  assert.deepEqual(headers(info), ['Keterangan', 'Nilai']);
  assert.deepEqual(
    info.rows.map((r) => r[0]),
    [
      'Nama Paket',
      'Kategori',
      'Company',
      'Status',
      'Passing Score',
      'Durasi (menit)',
      'Jadwal Mulai',
      'Jadwal Selesai',
      'Jumlah Soal',
      'Kunci Jawaban',
      'Diunduh pada (WIB)',
    ]
  );
  assert.equal(kv(info, 'Nama Paket'), 'Ujian K3 Dasar (Batch #1)');
  assert.equal(kv(info, 'Kategori'), 'Keselamatan Kerja (K3)');
  assert.equal(kv(info, 'Company'), 'BANK');
  assert.equal(kv(info, 'Status'), 'Aktif (Sesi Dibuka)');
  assert.equal(kv(info, 'Passing Score'), 75);
  assert.equal(kv(info, 'Durasi (menit)'), 30);
  assert.equal(kv(info, 'Jadwal Mulai'), '01/10/2026 08:00 WIB');
  assert.equal(kv(info, 'Jadwal Selesai'), '01/10/2026 17:00 WIB');
  assert.equal(kv(info, 'Jumlah Soal'), 2);
  assert.equal(kv(info, 'Kunci Jawaban'), 'Tidak disertakan');
  assert.equal(kv(info, 'Diunduh pada (WIB)'), '02/10/2026 01:30 WIB');

  const keyed = buildQuestionSheetWorkbook(makeExam(), questions, { withKey: true, nowMs: NOW });
  assert.equal(keyed.fileName, 'Soal_Ujian_K3_Dasar_Batch_1_2026-10-02_DenganKunci.xlsx');
  assert.deepEqual(headers(sheet(keyed, 'Pilihan Ganda')), ['No', 'Pertanyaan', 'A', 'B', 'C', 'D', 'Jawaban Benar', 'Poin']);
  assert.deepEqual(
    sheet(keyed, 'Pilihan Ganda').rows.map((r) => r[6]),
    ['B', 'D']
  );
  assert.equal(kv(sheet(keyed, 'Info Paket'), 'Kunci Jawaban'), 'Disertakan');
  assert.ok(!allXml(plain).includes('>E<'), 'tidak ada header E di file');
});

test('Download Soal: paket campuran (PG 5 opsi + B/S + studi kasus + essay + tipe lain) — sheet per tipe & No kanonik', () => {
  const plain = buildQuestionSheetWorkbook(makeExam(), mixedQuestions(), { withKey: false, nowMs: NOW });
  assert.deepEqual(sheetNames(plain), ['Info Paket', 'Pilihan Ganda', 'Benar-Salah', 'Studi Kasus', 'Essay', 'Lainnya']);
  assert.equal(kv(sheet(plain, 'Info Paket'), 'Jumlah Soal'), 6);

  const pg = sheet(plain, 'Pilihan Ganda');
  assert.deepEqual(headers(pg), ['No', 'Pertanyaan', 'A', 'B', 'C', 'D', 'E', 'Poin']);
  assert.deepEqual(pg.rows, [
    [1, 'Pertanyaan 1', 'Opsi A', 'Opsi B', 'Opsi C', 'Opsi D', 'Opsi E', 10],
    [5, 'Pertanyaan 5', 'Opsi A', 'Opsi B', 'Opsi C', 'Opsi D', null, 10],
  ]);
  assert.deepEqual(headers(sheet(plain, 'Benar-Salah')), ['No', 'Pertanyaan', 'Poin']);
  assert.deepEqual(sheet(plain, 'Benar-Salah').rows, [[2, 'Pertanyaan 2', 5]]);
  assert.deepEqual(headers(sheet(plain, 'Studi Kasus')), ['No', 'Narasi Studi Kasus', 'Pertanyaan', 'Poin']);
  assert.deepEqual(sheet(plain, 'Studi Kasus').rows, [[4, 'Narasi kasus gudang', 'Pertanyaan 4', 25]]);
  assert.deepEqual(headers(sheet(plain, 'Essay')), ['No', 'Pertanyaan', 'Poin']);
  assert.deepEqual(sheet(plain, 'Essay').rows, [[3, 'Pertanyaan 3', 20]]);
  assert.deepEqual(headers(sheet(plain, 'Lainnya')), ['No', 'Tipe', 'Pertanyaan', 'Poin']);
  assert.deepEqual(sheet(plain, 'Lainnya').rows, [[6, 'matching', 'Pertanyaan 6', 10]]);

  const keyed = buildQuestionSheetWorkbook(makeExam(), mixedQuestions(), { withKey: true, nowMs: NOW });
  assert.deepEqual(headers(sheet(keyed, 'Pilihan Ganda')), ['No', 'Pertanyaan', 'A', 'B', 'C', 'D', 'E', 'Jawaban Benar', 'Poin']);
  assert.deepEqual(sheet(keyed, 'Pilihan Ganda').rows.map((r) => [r[0], r[7]]), [[1, 'E'], [5, 'A']]);
  assert.deepEqual(sheet(keyed, 'Benar-Salah').rows, [[2, 'Pertanyaan 2', 'Salah', 5]]);
  assert.deepEqual(headers(sheet(keyed, 'Studi Kasus')), ['No', 'Narasi Studi Kasus', 'Pertanyaan', 'Kunci / Rubrik', 'Poin']);
  // sampleAnswer kosong → explanation
  assert.deepEqual(sheet(keyed, 'Studi Kasus').rows, [[4, 'Narasi kasus gudang', 'Pertanyaan 4', 'PEMBAHASAN-KASUS-RAHASIA', 25]]);
  assert.deepEqual(headers(sheet(keyed, 'Essay')), ['No', 'Pertanyaan', 'Kunci / Rubrik', 'Poin']);
  assert.deepEqual(sheet(keyed, 'Essay').rows, [[3, 'Pertanyaan 3', 'RUBRIK-ESSAY-RAHASIA', 20]]);
  assert.deepEqual(headers(sheet(keyed, 'Lainnya')), ['No', 'Tipe', 'Pertanyaan', 'Kunci', 'Poin']);
  assert.deepEqual(sheet(keyed, 'Lainnya').rows, [[6, 'matching', 'Pertanyaan 6', 'KUNCI-LAIN-RAHASIA', 10]]);
});

test('Download Soal tanpa kunci: tidak ada kolom kunci maupun teks rubrik/pembahasan di file', () => {
  const plainXml = allXml(buildQuestionSheetWorkbook(makeExam(), mixedQuestions(), { withKey: false, nowMs: NOW }));
  for (const secret of [
    '>Jawaban Benar<',
    '>Kunci / Rubrik<',
    '>Kunci<',
    'RUBRIK-ESSAY-RAHASIA',
    'PEMBAHASAN-ESSAY-RAHASIA',
    'PEMBAHASAN-KASUS-RAHASIA',
    'PEMBAHASAN-MC-RAHASIA',
    'KUNCI-LAIN-RAHASIA',
  ]) {
    assert.ok(!plainXml.includes(secret), `tanpa kunci tidak boleh memuat ${secret}`);
  }
  // pertanyaan & narasi (bukan kunci) tetap ada
  assert.ok(plainXml.includes('Narasi kasus gudang') && plainXml.includes('Pertanyaan 3'));

  const keyedXml = allXml(buildQuestionSheetWorkbook(makeExam(), mixedQuestions(), { withKey: true, nowMs: NOW }));
  for (const expected of ['>Jawaban Benar<', '>Kunci / Rubrik<', 'RUBRIK-ESSAY-RAHASIA', 'PEMBAHASAN-KASUS-RAHASIA', 'KUNCI-LAIN-RAHASIA']) {
    assert.ok(keyedXml.includes(expected), `dengan kunci memuat ${expected}`);
  }
});

test('Download Soal: kolom Materi hanya bila ada soal bermateri (di semua sheet tipe)', () => {
  const withMateri = mixedQuestions().map((q) => (q.no === 2 ? { ...q, materi: 'APD' } : q));
  const wb = buildQuestionSheetWorkbook(makeExam(), withMateri, { withKey: true, nowMs: NOW });
  for (const name of ['Pilihan Ganda', 'Benar-Salah', 'Studi Kasus', 'Essay', 'Lainnya']) {
    const s = sheet(wb, name);
    assert.equal(headers(s).at(-1), 'Materi', `${name}: kolom Materi terakhir`);
    assert.equal(headers(s).at(-2), 'Poin');
  }
  assert.deepEqual(sheet(wb, 'Benar-Salah').rows, [[2, 'Pertanyaan 2', 'Salah', 5, 'APD']]);
  assert.equal(sheet(wb, 'Essay').rows[0].at(-1), null, 'soal tanpa materi → sel kosong');

  const none = buildQuestionSheetWorkbook(makeExam(), mixedQuestions(), { withKey: true, nowMs: NOW });
  for (const s of none.sheets) assert.ok(!headers(s).includes('Materi'), `${s.name}: tanpa kolom Materi`);
});

test('Download Soal: opsi E kosong tidak memaksa kolom E; paket tanpa soal → pesan', () => {
  const blankE = [...options(4), { id: 'opt-e', text: '  ' }];
  const questions = [makeQuestion({ id: 'q-1', no: 1, type: 'multiple_choice', options: blankE, correctAnswerId: 'opt-c' })];
  const plain = buildQuestionSheetWorkbook(makeExam(), questions, { withKey: false, nowMs: NOW });
  assert.deepEqual(headers(sheet(plain, 'Pilihan Ganda')), ['No', 'Pertanyaan', 'A', 'B', 'C', 'D', 'Poin']);
  // kunci menunjuk opsi E yang kosong → kolom E dimunculkan agar huruf kunci punya kolom
  const keyOnE = [makeQuestion({ id: 'q-1', no: 1, type: 'multiple_choice', options: blankE, correctAnswerId: 'opt-e' })];
  const keyed = buildQuestionSheetWorkbook(makeExam(), keyOnE, { withKey: true, nowMs: NOW });
  assert.deepEqual(headers(sheet(keyed, 'Pilihan Ganda')), ['No', 'Pertanyaan', 'A', 'B', 'C', 'D', 'E', 'Jawaban Benar', 'Poin']);
  assert.equal(sheet(keyed, 'Pilihan Ganda').rows[0][7], 'E');
  // kunci tidak cocok dengan opsi mana pun
  const broken = [makeQuestion({ id: 'q-1', no: 1, type: 'multiple_choice', options: options(4), correctAnswerId: 'opt-x' })];
  assert.equal(sheet(buildQuestionSheetWorkbook(makeExam(), broken, { withKey: true, nowMs: NOW }), 'Pilihan Ganda').rows[0][6], 'Lainnya (opt-x)');

  const empty = buildQuestionSheetWorkbook(makeExam({ title: '', status: 'closed', startTime: null, endTime: null }), [], {
    withKey: true,
    nowMs: NOW,
  });
  assert.deepEqual(sheetNames(empty), ['Info Paket', 'Soal']);
  assert.deepEqual(sheet(empty, 'Soal').rows, [['Paket ini belum memiliki soal.']]);
  assert.equal(kv(sheet(empty, 'Info Paket'), 'Status'), 'Ditutup (Sesi Ditutup)');
  assert.equal(kv(sheet(empty, 'Info Paket'), 'Jadwal Mulai'), '-');
  assert.equal(kv(sheet(empty, 'Info Paket'), 'Jumlah Soal'), 0);
  assert.equal(empty.fileName, 'Soal_Paket_2026-10-02_DenganKunci.xlsx');
  // tetap menghasilkan file valid
  assert.ok(unzipXml(buildXlsx(empty.sheets)).has('xl/worksheets/sheet2.xml'));
});

// ═══════════════════════════════════════════════════════════════
// Fixture analitik
// ═══════════════════════════════════════════════════════════════

function stat(partial: Partial<QuestionStat> & Pick<QuestionStat, 'no' | 'questionId' | 'type'>): QuestionStat {
  return {
    typeLabel: partial.type === 'multiple_choice' ? 'Pilihan Ganda' : partial.type === 'true_false' ? 'Benar/Salah' : 'Essay',
    textPreview: `Preview soal ${partial.no}`,
    materi: null,
    points: 10,
    total: 4,
    correct: 2,
    wrong: 1,
    empty: 1,
    pctCorrect: 50,
    pctWrong: 25,
    pctEmpty: 25,
    difficulty: 'Sedang',
    essay: null,
    scoringMismatchCount: 0,
    ...partial,
  };
}

const dist = (
  optionId: string,
  label: string,
  text: string,
  count: number,
  pctValue: number | null,
  isCorrect: boolean,
  kind: OptionDistributionRow['kind'] = 'option'
): OptionDistributionRow => ({ optionId, label, text, count, pct: pctValue, isCorrect, kind });

function makeSummary(partial: Partial<ExamAnalyticsSummaryResponse> = {}): ExamAnalyticsSummaryResponse {
  const questions: QuestionStat[] = [
    stat({ no: 2, questionId: 'q-2', type: 'true_false', correct: 3, wrong: 1, empty: 0, pctCorrect: 75, pctWrong: 25, pctEmpty: 0 }),
    stat({ no: 1, questionId: 'q-1', type: 'multiple_choice', materi: 'APD' }),
    stat({
      no: 3,
      questionId: 'q-3',
      type: 'essay',
      materi: 'APD',
      points: 20,
      correct: null,
      wrong: null,
      empty: 1,
      pctCorrect: null,
      pctWrong: null,
      pctEmpty: 25,
      difficulty: 'Sedang',
      essay: { answered: 3, graded: 2, pending: 1, avgScore: 15, minScore: 10, maxScore: 20, maxPoint: 20, scorePct: 50 },
    }),
  ];
  return {
    exam: {
      id: 'exam-1',
      title: 'Ujian K3 Dasar (Batch #1)',
      description: null,
      category: 'Keselamatan Kerja (K3)',
      scope: 'BANK',
      status: 'active',
      passingScore: 75,
      durationMinutes: 30,
      authorName: 'Admin K3',
      createdAt: null,
      startTime: '2026-10-01T08:00',
      endTime: '2026-10-01T17:00',
    },
    filters: NO_FILTERS,
    filterOptions: { companies: ['BANK'], departments: ['IT', 'Ops'] },
    basisNote: ATTEMPT_BASIS_NOTE,
    summary: {
      totalParticipants: 4,
      totalAttempts: 5,
      avgScore: 72.5,
      maxScore: 95,
      minScore: 40,
      passedCount: 2,
      failedCount: 2,
      passRatePct: 50,
      avgCorrectObjective: 1.25,
      objectiveQuestionCount: 2,
      totalUnanswered: 2,
      pendingGradingParticipants: 1,
      questionCount: 3,
      firstCompletedAt: '2026-10-01T02:00:00.000Z',
      lastCompletedAt: '2026-10-01T09:15:00.000Z',
    },
    scoreDistribution: [],
    questions,
    distributions: {
      'q-1': [
        dist('opt-a', 'A', 'Helm', 0, 0, false),
        dist('opt-b', 'B', 'Rompi', 1, 25, false),
        dist('opt-c', 'C', 'Sepatu', 2, 50, true),
        dist('__unknown__', 'Lainnya', 'Opsi tidak ditemukan pada soal saat ini', 0, 0, false, 'unknown'),
        dist('__empty__', 'Tidak menjawab', '', 1, 25, false, 'empty'),
      ],
      'q-2': [
        dist('true', 'Benar', 'Benar', 1, 25, false),
        dist('false', 'Salah', 'Salah', 3, 75, true),
        dist('__empty__', 'Tidak menjawab', '', 0, 0, false, 'empty'),
      ],
    },
    materialAvailable: true,
    materials: [
      { materi: 'APD', questionCount: 2, objectiveQuestionCount: 1, correct: 2, wrong: 1, empty: 1, total: 4, pctCorrect: 50 },
      { materi: '(Tanpa materi)', questionCount: 1, objectiveQuestionCount: 1, correct: 3, wrong: 1, empty: 0, total: 4, pctCorrect: 75 },
    ],
    capabilities: { canExport: true, canDownloadQuestions: false },
    generatedAt: '2026-10-01T10:00:00.000Z',
    truncated: false,
    ...partial,
  };
}

function participant(partial: Partial<ParticipantRow> & Pick<ParticipantRow, 'userId' | 'name'>): ParticipantRow {
  return {
    attemptId: `att-${partial.userId}`,
    company: 'BANK',
    department: 'IT',
    score: 80,
    passed: true,
    status: 'LULUS',
    correct: 2,
    wrong: 0,
    empty: 0,
    pendingEssay: 0,
    attemptCount: 1,
    completedAt: '2026-10-01T02:00:00.000Z',
    durationSeconds: 600,
    ...partial,
  };
}

function errorRow(partial: Partial<ErrorRow> & Pick<ErrorRow, 'userId' | 'name' | 'no' | 'questionId'>): ErrorRow {
  return {
    attemptId: `att-${partial.userId}`,
    company: 'BANK',
    department: 'IT',
    materi: null,
    textPreview: `Preview soal ${partial.no}`,
    status: 'wrong',
    answerLabel: null,
    answerText: null,
    correctLabel: null,
    correctText: null,
    pointsEarned: 0,
    maxPoints: 10,
    completedAt: '2026-10-01T02:00:00.000Z',
    ...partial,
  };
}

function analyticsInput(overrides: Partial<Parameters<typeof buildAnalyticsWorkbook>[0]> = {}) {
  return {
    summary: makeSummary(),
    participants: [
      participant({ userId: 'u-1', name: 'Ani', score: 95 }),
      participant({
        userId: 'u-2',
        name: 'Budi',
        company: null,
        department: null,
        score: 40,
        passed: false,
        status: 'MENUNGGU PENILAIAN',
        correct: 1,
        wrong: 1,
        empty: 1,
        attemptCount: 2,
        completedAt: '2026-10-01T09:15:00.000Z',
      }),
    ],
    errors: [
      errorRow({ userId: 'u-2', name: 'Budi', no: 1, questionId: 'q-1', materi: 'APD', answerLabel: 'B', answerText: 'Rompi', correctLabel: 'C', correctText: 'Sepatu' }),
      errorRow({ userId: 'u-2', name: 'Budi', no: 2, questionId: 'q-2', answerLabel: 'Benar', answerText: 'Benar', correctLabel: 'Salah', correctText: 'Salah', maxPoints: 7 }),
      errorRow({ userId: 'u-3', name: 'Citra', no: 1, questionId: 'q-1', materi: 'APD', status: 'empty', correctLabel: 'C', correctText: 'Sepatu' }),
      errorRow({ userId: 'u-4', name: 'Dedi', no: 1, questionId: 'q-1', materi: 'APD', answerLabel: 'Lainnya', answerText: 'opt-x', correctLabel: 'C', correctText: 'Sepatu' }),
    ],
    errorsTruncated: false,
    questionTexts: { 'q-1': 'Teks lengkap soal 1 tentang APD yang panjang.' },
    nowMs: NOW,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Download Analisis
// ═══════════════════════════════════════════════════════════════

test('Analisis: 6 sheet berurutan + nama file', () => {
  const wb = buildAnalyticsWorkbook(analyticsInput());
  assert.deepEqual(sheetNames(wb), ['Ringkasan', 'Analisis Soal', 'Distribusi Jawaban', 'Analisis Materi', 'Peserta', 'Detail Kesalahan']);
  assert.equal(wb.fileName, 'Analisis_Ujian_K3_Dasar_Batch_1_2026-10-02.xlsx');
  const parts = unzipXml(buildXlsx(wb.sheets));
  for (let i = 1; i <= 6; i++) assert.ok(parts.has(`xl/worksheets/sheet${i}.xml`));
});

test('Analisis: Ringkasan berisi info paket, filter, angka & catatan basis/kesulitan', () => {
  const s = sheet(buildAnalyticsWorkbook(analyticsInput()), 'Ringkasan');
  assert.deepEqual(headers(s), ['Keterangan', 'Nilai']);
  assert.deepEqual(
    s.rows.map((r) => r[0]),
    [
      'Nama Paket',
      'Kategori',
      'Company',
      'Jadwal Paket',
      'Periode Pengerjaan',
      'Filter Company',
      'Filter Department',
      'Filter Periode',
      'Total Peserta',
      'Total Attempt',
      'Total Soal',
      'Rata-rata Nilai',
      'Nilai Tertinggi',
      'Nilai Terendah',
      'Pass Rate (%)',
      'Passing Score',
      'Rata-rata Jawaban Benar (objektif)',
      'Total Tidak Menjawab',
      'Peserta Menunggu Penilaian',
      'Data dihitung pada (WIB)',
      'Basis Perhitungan',
      'Indikasi Kesulitan',
    ]
  );
  assert.equal(kv(s, 'Jadwal Paket'), '01/10/2026 08:00 WIB – 01/10/2026 17:00 WIB');
  assert.equal(kv(s, 'Periode Pengerjaan'), '01/10/2026 09:00 WIB – 01/10/2026 16:15 WIB');
  assert.equal(kv(s, 'Filter Company'), 'Semua');
  assert.equal(kv(s, 'Filter Department'), 'Semua');
  assert.equal(kv(s, 'Filter Periode'), 'Semua');
  assert.equal(kv(s, 'Total Peserta'), 4);
  assert.equal(kv(s, 'Total Attempt'), 5);
  assert.equal(kv(s, 'Total Soal'), 3);
  assert.equal(kv(s, 'Rata-rata Nilai'), 72.5);
  assert.equal(kv(s, 'Pass Rate (%)'), 50);
  assert.equal(kv(s, 'Passing Score'), 75);
  assert.equal(kv(s, 'Rata-rata Jawaban Benar (objektif)'), 1.25);
  assert.equal(kv(s, 'Peserta Menunggu Penilaian'), 1);
  assert.equal(kv(s, 'Data dihitung pada (WIB)'), '01/10/2026 17:00 WIB');
  assert.equal(kv(s, 'Basis Perhitungan'), ATTEMPT_BASIS_NOTE);
  const difficulty = String(kv(s, 'Indikasi Kesulitan'));
  assert.ok(difficulty.startsWith(DIFFICULTY_DISCLAIMER));
  assert.ok(difficulty.includes('≥ 80') && difficulty.includes('< 50'));

  const filtered = sheet(
    buildAnalyticsWorkbook(
      analyticsInput({
        summary: makeSummary({
          filters: { company: 'SEC', department: 'Ops', from: '2026-09-30T17:00:00.000Z', to: '2026-10-01T16:59:59.999Z' },
          summary: { ...makeSummary().summary, totalParticipants: 0, avgScore: null, maxScore: null, minScore: null, passRatePct: null, avgCorrectObjective: null, firstCompletedAt: null, lastCompletedAt: null },
          exam: { ...makeSummary().exam, startTime: null, endTime: '2026-10-05T17:00', passingScore: null },
          truncated: true,
        }),
      })
    ),
    'Ringkasan'
  );
  assert.equal(kv(filtered, 'Filter Company'), 'SEC');
  assert.equal(kv(filtered, 'Filter Department'), 'Ops');
  assert.equal(kv(filtered, 'Filter Periode'), '01/10/2026 00:00 WIB – 01/10/2026 23:59 WIB');
  assert.equal(kv(filtered, 'Jadwal Paket'), 'Selesai 05/10/2026 17:00 WIB');
  assert.equal(kv(filtered, 'Periode Pengerjaan'), '-');
  assert.equal(kv(filtered, 'Rata-rata Nilai'), '-');
  assert.equal(kv(filtered, 'Pass Rate (%)'), '-');
  assert.equal(kv(filtered, 'Passing Score'), '-');
  assert.ok(String(kv(filtered, 'Peringatan')).includes('batas aman'));
});

test('Analisis: sheet Analisis Soal — teks lengkap, kolom Materi & kolom essay kondisional, sel tidak berlaku "-"', () => {
  const s = sheet(buildAnalyticsWorkbook(analyticsInput()), 'Analisis Soal');
  assert.deepEqual(headers(s), [
    'No',
    'Soal',
    'Tipe',
    'Materi',
    'Total',
    'Benar',
    'Salah',
    'Kosong',
    '% Benar',
    '% Salah',
    'Indikasi Kesulitan',
    'Rata-rata Skor Essay',
    'Skor Min',
    'Skor Maks',
    'Poin Maks',
    'Persentase Skor Essay (%)',
    'Menunggu Penilaian',
  ]);
  assert.deepEqual(s.rows, [
    [1, 'Teks lengkap soal 1 tentang APD yang panjang.', 'Pilihan Ganda', 'APD', 4, 2, 1, 1, 50, 25, 'Sedang', '-', '-', '-', '-', '-', '-'],
    [2, 'Preview soal 2', 'Benar/Salah', '-', 4, 3, 1, 0, 75, 25, 'Sedang', '-', '-', '-', '-', '-', '-'],
    [3, 'Preview soal 3', 'Essay', 'APD', 4, '-', '-', 1, '-', '-', 'Sedang', 15, 10, 20, 20, 50, 1],
  ]);

  // tanpa materi & tanpa essay → kolom tersebut tidak muncul
  const objectiveOnly = makeSummary({
    materialAvailable: false,
    materials: [],
    questions: makeSummary().questions.filter((q) => q.type !== 'essay').map((q) => ({ ...q, materi: null })),
  });
  const plain = sheet(buildAnalyticsWorkbook(analyticsInput({ summary: objectiveOnly, errors: [] })), 'Analisis Soal');
  assert.deepEqual(headers(plain), ['No', 'Soal', 'Tipe', 'Total', 'Benar', 'Salah', 'Kosong', '% Benar', '% Salah', 'Indikasi Kesulitan']);
  assert.equal(plain.rows.length, 2);
});

test('Analisis: Distribusi Jawaban hanya soal objektif, status BENAR / Salah / "-"', () => {
  const s = sheet(buildAnalyticsWorkbook(analyticsInput()), 'Distribusi Jawaban');
  assert.deepEqual(headers(s), ['No', 'Soal', 'Tipe', 'Pilihan', 'Teks Pilihan', 'Jumlah', 'Persentase (%)', 'Status']);
  assert.deepEqual(s.rows, [
    [1, 'Preview soal 1', 'Pilihan Ganda', 'A', 'Helm', 0, 0, 'Salah'],
    [1, 'Preview soal 1', 'Pilihan Ganda', 'B', 'Rompi', 1, 25, 'Salah'],
    [1, 'Preview soal 1', 'Pilihan Ganda', 'C', 'Sepatu', 2, 50, 'BENAR'],
    [1, 'Preview soal 1', 'Pilihan Ganda', 'Lainnya', 'Opsi tidak ditemukan pada soal saat ini', 0, 0, '-'],
    [1, 'Preview soal 1', 'Pilihan Ganda', 'Tidak menjawab', '-', 1, 25, '-'],
    [2, 'Preview soal 2', 'Benar/Salah', 'Benar', 'Benar', 1, 25, 'Salah'],
    [2, 'Preview soal 2', 'Benar/Salah', 'Salah', 'Salah', 3, 75, 'BENAR'],
    [2, 'Preview soal 2', 'Benar/Salah', 'Tidak menjawab', '-', 0, 0, '-'],
  ]);

  const essayOnly = makeSummary({ questions: makeSummary().questions.filter((q) => q.type === 'essay'), distributions: {} });
  const msg = sheet(buildAnalyticsWorkbook(analyticsInput({ summary: essayOnly, errors: [] })), 'Distribusi Jawaban');
  assert.equal(msg.columns, undefined);
  assert.equal(msg.rows.length, 1);
  assert.match(String(msg.rows[0][0]), /Tidak ada soal objektif/);
});

test('Analisis: Analisis Materi — tabel bila tersedia, pesan baku bila tidak', () => {
  const s = sheet(buildAnalyticsWorkbook(analyticsInput()), 'Analisis Materi');
  assert.deepEqual(headers(s), ['Materi', 'Jumlah Soal', 'Benar', 'Salah', 'Kosong', '% Benar']);
  assert.deepEqual(s.rows, [
    ['APD', 2, 2, 1, 1, 50],
    ['(Tanpa materi)', 1, 3, 1, 0, 75],
  ]);

  const noMateri = makeSummary({
    materialAvailable: false,
    materials: [],
    questions: makeSummary().questions.map((q) => ({ ...q, materi: null })),
  });
  const wb = buildAnalyticsWorkbook(analyticsInput({ summary: noMateri }));
  const msg = sheet(wb, 'Analisis Materi');
  assert.equal(msg.columns, undefined);
  assert.deepEqual(msg.rows, [[MATERIAL_UNAVAILABLE_MESSAGE]]);
  // tanpa materi → tidak ada kolom Materi di sheet mana pun
  for (const name of ['Analisis Soal', 'Detail Kesalahan']) assert.ok(!headers(sheet(wb, name)).includes('Materi'), name);
  assert.ok(allXml(wb).includes(MATERIAL_UNAVAILABLE_MESSAGE));
});

test('Analisis: sheet Peserta', () => {
  const s = sheet(buildAnalyticsWorkbook(analyticsInput()), 'Peserta');
  assert.deepEqual(headers(s), ['Peserta', 'Company', 'Department', 'Nilai', 'Benar', 'Salah', 'Kosong', 'Status', 'Jumlah Attempt', 'Waktu Selesai (WIB)']);
  assert.deepEqual(s.rows, [
    ['Ani', 'BANK', 'IT', 95, 2, 0, 0, 'LULUS', 1, '01/10/2026 09:00 WIB'],
    ['Budi', '-', '-', 40, 1, 1, 1, 'MENUNGGU PENILAIAN', 2, '01/10/2026 16:15 WIB'],
  ]);
  const empty = sheet(buildAnalyticsWorkbook(analyticsInput({ participants: [] })), 'Peserta');
  assert.equal(headers(empty).length, 10);
  assert.equal(empty.autoFilter, false);
  assert.deepEqual(empty.rows, [['Belum ada peserta yang sesuai filter.']]);
});

test('Analisis: Detail Kesalahan — format jawaban, Poin = bobot soal, status, catatan terpotong', () => {
  const wb = buildAnalyticsWorkbook(analyticsInput());
  const s = sheet(wb, 'Detail Kesalahan');
  assert.deepEqual(headers(s), [
    'Peserta',
    'Company',
    'Department',
    'No Soal',
    'Materi',
    'Jawaban Peserta',
    'Jawaban Benar',
    'Poin',
    'Status',
    'Waktu Selesai',
    'Soal',
  ]);
  assert.deepEqual(s.rows, [
    ['Budi', 'BANK', 'IT', 1, 'APD', 'B. Rompi', 'C. Sepatu', 10, 'Salah', '01/10/2026 09:00 WIB', 'Preview soal 1'],
    ['Budi', 'BANK', 'IT', 2, '-', 'Benar', 'Salah', 7, 'Salah', '01/10/2026 09:00 WIB', 'Preview soal 2'],
    ['Citra', 'BANK', 'IT', 1, 'APD', '(Tidak menjawab)', 'C. Sepatu', 10, 'Tidak Menjawab', '01/10/2026 09:00 WIB', 'Preview soal 1'],
    ['Dedi', 'BANK', 'IT', 1, 'APD', 'Lainnya (opt-x)', 'C. Sepatu', 10, 'Salah', '01/10/2026 09:00 WIB', 'Preview soal 1'],
  ]);

  const truncated = buildAnalyticsWorkbook(analyticsInput({ errorsTruncated: true }));
  const t = sheet(truncated, 'Detail Kesalahan');
  assert.equal(t.rows.length, 6);
  assert.deepEqual(t.rows[4], [], 'baris kosong pemisah');
  assert.match(String(t.rows[5][0]), /dipotong pada 4 baris pertama/);
  // autofilter berhenti sebelum catatan
  const xml = unzipXml(buildXlsx(truncated.sheets)).get('xl/worksheets/sheet6.xml')!;
  assert.ok(xml.includes('<autoFilter ref="A1:K5"/>'));

  const none = sheet(buildAnalyticsWorkbook(analyticsInput({ errors: [] })), 'Detail Kesalahan');
  assert.deepEqual(none.rows, [['Tidak ada jawaban salah atau kosong pada soal objektif.']]);
  assert.equal(none.autoFilter, false);
});

// ═══════════════════════════════════════════════════════════════
// Detail Soal
// ═══════════════════════════════════════════════════════════════

function nonCorrect(partial: Partial<ParticipantAnswerRow> & Pick<ParticipantAnswerRow, 'userId' | 'name' | 'status'>): ParticipantAnswerRow {
  return {
    attemptId: `att-${partial.userId}`,
    company: 'BANK',
    department: 'IT',
    answerOptionId: null,
    answerLabel: null,
    answerText: null,
    correctLabel: 'C',
    correctText: 'Sepatu',
    pointsEarned: 0,
    maxPoints: 10,
    completedAt: '2026-10-01T02:00:00.000Z',
    ...partial,
  };
}

function mcDetail(partial: Partial<QuestionDetailResponse> = {}): QuestionDetailResponse {
  return {
    exam: { id: 'exam-1', title: 'Ujian K3 Dasar (Batch #1)', scope: 'BANK' },
    filters: { company: 'BANK', department: null, from: null, to: null },
    question: {
      no: 1,
      questionId: 'q-1',
      type: 'multiple_choice',
      typeLabel: 'Pilihan Ganda',
      questionText: 'APD apa yang wajib di area gudang?',
      caseStudyStory: null,
      materi: 'APD',
      points: 10,
      options: [
        { optionId: 'opt-a', label: 'A', text: 'Helm', isCorrect: false },
        { optionId: 'opt-b', label: 'B', text: 'Rompi', isCorrect: false },
        { optionId: 'opt-c', label: 'C', text: 'Sepatu', isCorrect: true },
        { optionId: 'opt-d', label: 'D', text: 'Sarung tangan', isCorrect: false },
        { optionId: 'opt-e', label: 'E', text: 'Kacamata', isCorrect: false },
      ],
      correctAnswer: { optionId: 'opt-c', label: 'C', text: 'Sepatu' },
      sampleAnswer: null,
      explanation: 'Sepatu safety wajib.',
    },
    stat: stat({ no: 1, questionId: 'q-1', type: 'multiple_choice', materi: 'APD', scoringMismatchCount: 2 }),
    distribution: makeSummary().distributions['q-1'],
    nonCorrectParticipants: [
      nonCorrect({ userId: 'u-2', name: 'Budi', status: 'wrong', answerOptionId: 'opt-b', answerLabel: 'B', answerText: 'Rompi' }),
      nonCorrect({ userId: 'u-3', name: 'Citra', status: 'empty', company: null, department: null }),
    ],
    truncated: false,
    materialAvailable: true,
    generatedAt: '2026-10-01T10:00:00.000Z',
    ...partial,
  };
}

test('Detail Soal (PG): info soal, opsi, kunci, statistik, distribusi & peserta yang salah', () => {
  const wb = buildQuestionDetailWorkbook(mcDetail(), { nowMs: NOW });
  assert.deepEqual(sheetNames(wb), ['Soal', 'Distribusi Jawaban', 'Peserta yang Salah']);
  assert.equal(wb.fileName, 'Detail_Soal_1_2026-10-02.xlsx');

  const info = sheet(wb, 'Soal');
  assert.deepEqual(
    info.rows.map((r) => r[0]),
    [
      'Paket',
      'No Soal',
      'Tipe',
      'Materi',
      'Poin',
      'Pertanyaan',
      'Opsi A',
      'Opsi B',
      'Opsi C',
      'Opsi D',
      'Opsi E',
      'Jawaban Benar',
      'Pembahasan',
      'Total Peserta',
      'Benar',
      'Salah',
      'Tidak Menjawab',
      '% Benar',
      '% Salah',
      'Indikasi Kesulitan',
      'Catatan Kunci',
      'Filter',
      'Data dihitung pada',
    ]
  );
  assert.equal(kv(info, 'No Soal'), 1);
  assert.equal(kv(info, 'Materi'), 'APD');
  assert.equal(kv(info, 'Opsi D'), 'Sarung tangan');
  assert.equal(kv(info, 'Jawaban Benar'), 'C. Sepatu');
  assert.equal(kv(info, 'Pembahasan'), 'Sepatu safety wajib.');
  assert.equal(kv(info, 'Benar'), 2);
  assert.equal(kv(info, '% Salah'), 25);
  assert.equal(kv(info, 'Indikasi Kesulitan'), 'Sedang');
  assert.match(String(kv(info, 'Catatan Kunci')), /^2 jawaban tersimpan berbeda/);
  assert.equal(kv(info, 'Filter'), 'Company: BANK; Department: Semua; Periode: Semua');
  assert.equal(kv(info, 'Data dihitung pada'), '01/10/2026 17:00 WIB');
  assert.ok(!hasLabel(info, 'Dijawab') && !hasLabel(info, 'Kunci / Rubrik'));

  const d = sheet(wb, 'Distribusi Jawaban');
  assert.deepEqual(headers(d), ['Pilihan', 'Teks', 'Jumlah', 'Persentase (%)', 'Status']);
  assert.deepEqual(d.rows[2], ['C', 'Sepatu', 2, 50, 'BENAR']);
  assert.deepEqual(d.rows[4], ['Tidak menjawab', '-', 1, 25, '-']);

  const w = sheet(wb, 'Peserta yang Salah');
  assert.deepEqual(headers(w), ['Peserta', 'Company', 'Department', 'Status', 'Jawaban', 'Jawaban Benar', 'Poin', 'Waktu Selesai']);
  assert.deepEqual(w.rows, [
    ['Budi', 'BANK', 'IT', 'Salah', 'B. Rompi', 'C. Sepatu', 10, '01/10/2026 09:00 WIB'],
    ['Citra', '-', '-', 'Tidak Menjawab', '(Tidak menjawab)', 'C. Sepatu', 10, '01/10/2026 09:00 WIB'],
  ]);

  // tanpa materi di paket → baris Materi tidak ada; terpotong → catatan setelah baris kosong
  const other = buildQuestionDetailWorkbook(
    mcDetail({ materialAvailable: false, truncated: true, stat: stat({ no: 1, questionId: 'q-1', type: 'multiple_choice' }) }),
    { nowMs: NOW }
  );
  assert.ok(!hasLabel(sheet(other, 'Soal'), 'Materi'));
  assert.ok(!hasLabel(sheet(other, 'Soal'), 'Catatan Kunci'));
  const tw = sheet(other, 'Peserta yang Salah');
  assert.deepEqual(tw.rows[2], []);
  assert.match(String(tw.rows[3][0]), /dipotong pada 2 baris pertama/);

  const noWrong = sheet(buildQuestionDetailWorkbook(mcDetail({ nonCorrectParticipants: [] }), { nowMs: NOW }), 'Peserta yang Salah');
  assert.deepEqual(noWrong.rows, [['Tidak ada peserta yang salah atau tidak menjawab soal ini.']]);
  assert.ok(unzipXml(buildXlsx(wb.sheets)).has('xl/worksheets/sheet3.xml'));
});

test('Detail Soal (Benar/Salah): jawaban ditulis "Benar"/"Salah"', () => {
  const tf = mcDetail({
    question: {
      ...mcDetail().question,
      no: 2,
      questionId: 'q-2',
      type: 'true_false',
      typeLabel: 'Benar/Salah',
      options: [
        { optionId: 'true', label: 'Benar', text: 'Benar', isCorrect: false },
        { optionId: 'false', label: 'Salah', text: 'Salah', isCorrect: true },
      ],
      correctAnswer: { optionId: 'false', label: 'Salah', text: 'Salah' },
    },
    stat: stat({ no: 2, questionId: 'q-2', type: 'true_false' }),
    distribution: makeSummary().distributions['q-2'],
    nonCorrectParticipants: [
      nonCorrect({ userId: 'u-2', name: 'Budi', status: 'wrong', answerOptionId: 'true', answerLabel: 'Benar', answerText: 'Benar', correctLabel: 'Salah', correctText: 'Salah' }),
    ],
  });
  const wb = buildQuestionDetailWorkbook(tf, { nowMs: NOW });
  const info = sheet(wb, 'Soal');
  assert.equal(kv(info, 'Opsi 1'), 'Benar');
  assert.equal(kv(info, 'Opsi 2'), 'Salah');
  assert.equal(kv(info, 'Jawaban Benar'), 'Salah');
  assert.deepEqual(sheet(wb, 'Peserta yang Salah').rows[0].slice(3, 6), ['Salah', 'Benar', 'Salah']);
  assert.equal(wb.fileName, 'Detail_Soal_2_2026-10-02.xlsx');
});

test('Detail Soal (essay / studi kasus): tanpa istilah benar/salah, rubrik & statistik essay, pesan tidak berlaku', () => {
  const essay: QuestionDetailResponse = {
    ...mcDetail(),
    filters: { company: null, department: 'IT', from: '2026-09-30T17:00:00.000Z', to: null },
    question: {
      no: 3,
      questionId: 'q-3',
      type: 'case_study',
      typeLabel: 'Studi Kasus',
      questionText: 'Apa tindakan Anda?',
      caseStudyStory: 'Terjadi tumpahan oli di gudang.',
      materi: null,
      points: 20,
      options: [],
      correctAnswer: null,
      sampleAnswer: 'Amankan area, pasang rambu, bersihkan.',
      explanation: null,
    },
    stat: stat({
      no: 3,
      questionId: 'q-3',
      type: 'case_study',
      typeLabel: 'Studi Kasus',
      points: 20,
      correct: null,
      wrong: null,
      empty: 1,
      pctCorrect: null,
      pctWrong: null,
      difficulty: 'Sedang',
      essay: { answered: 3, graded: 2, pending: 1, avgScore: 15, minScore: 10, maxScore: 20, maxPoint: 20, scorePct: 50 },
    }),
    distribution: [],
    nonCorrectParticipants: [],
    materialAvailable: false,
  };
  const wb = buildQuestionDetailWorkbook(essay, { nowMs: NOW });
  assert.deepEqual(sheetNames(wb), ['Soal', 'Distribusi Jawaban', 'Peserta yang Salah']);
  assert.equal(wb.fileName, 'Detail_Soal_3_2026-10-02.xlsx');
  const info = sheet(wb, 'Soal');
  assert.deepEqual(
    info.rows.map((r) => r[0]),
    [
      'Paket',
      'No Soal',
      'Tipe',
      'Poin',
      'Pertanyaan',
      'Narasi',
      'Kunci / Rubrik',
      'Pembahasan',
      'Total Peserta',
      'Tidak Menjawab',
      'Dijawab',
      'Sudah Dinilai',
      'Menunggu Penilaian',
      'Rata-rata Skor',
      'Skor Min',
      'Skor Maks',
      'Poin Maks',
      'Persentase Skor (%)',
      'Indikasi Kesulitan',
      'Filter',
      'Data dihitung pada',
    ]
  );
  assert.equal(kv(info, 'Narasi'), 'Terjadi tumpahan oli di gudang.');
  assert.equal(kv(info, 'Kunci / Rubrik'), 'Amankan area, pasang rambu, bersihkan.');
  assert.equal(kv(info, 'Pembahasan'), '-');
  assert.equal(kv(info, 'Dijawab'), 3);
  assert.equal(kv(info, 'Rata-rata Skor'), 15);
  assert.equal(kv(info, 'Poin Maks'), 20);
  assert.equal(kv(info, 'Persentase Skor (%)'), 50);
  assert.equal(kv(info, 'Indikasi Kesulitan'), 'Sedang');
  assert.equal(kv(info, 'Filter'), 'Company: Semua; Department: IT; Periode: Sejak 01/10/2026 00:00 WIB');
  for (const label of ['Benar', 'Salah', '% Benar', '% Salah', 'Jawaban Benar']) {
    assert.ok(!hasLabel(info, label), `essay tanpa baris ${label}`);
  }
  for (const name of ['Distribusi Jawaban', 'Peserta yang Salah']) {
    const s = sheet(wb, name);
    assert.equal(s.columns, undefined);
    assert.deepEqual(s.rows, [['Tidak berlaku untuk soal essay / studi kasus.']]);
  }
  assert.ok(unzipXml(buildXlsx(wb.sheets)).has('xl/worksheets/sheet3.xml'));
});
