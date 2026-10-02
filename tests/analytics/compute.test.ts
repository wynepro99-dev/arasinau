/**
 * Test mesin analitik (server/analytics/compute.ts).
 * Jalankan: npx tsx --test tests/analytics/compute.test.ts
 *
 * Semua angka ekspektasi dihitung MANUAL dari fixture (lihat komentar di tests/analytics/fixtures.ts).
 * Tidak ada koneksi database; test data asli hanya membaca exam_attempts.csv (bila ada) dan
 * tidak pernah mencetak nama / data pribadi.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

import {
  applyFilters,
  buildDataset,
  computeErrorRows,
  computeParticipantDetail,
  computeParticipantRows,
  computeQuestionDetail,
  computeSummary,
  describeAnswer,
  detectMateri,
  listParticipants,
  normalizeAnswer,
  normalizeAttempts,
  normalizeExam,
  normalizeQuestions,
  parseFilters,
  selectFirstAttempts,
} from '../../server/analytics/compute';
import type { ExamDataset, NormQuestion } from '../../server/analytics/types';
import {
  ATTEMPT_BASIS_NOTE,
  ERROR_ROWS_LIMIT_DEFAULT,
  ERROR_ROWS_LIMIT_MAX,
  PARTICIPANT_PAGE_SIZE_DEFAULT,
  PARTICIPANT_PAGE_SIZE_MAX,
  QUESTION_NON_CORRECT_ROWS_MAX,
  SCORE_BINS,
  STATUS_LABELS,
  TEXT_PREVIEW_LENGTH,
  difficultyFor,
} from '../../src/lib/analytics/contract';
import type { AnalyticsCapabilities, AppliedFilters, QuestionStat } from '../../src/lib/analytics/contract';
import {
  ATTEMPT_IDS,
  CASE_STUDY_QUESTION_TEXT,
  EXAM_IDS,
  FIXTURE_LOADED_AT,
  MAIN_EXAM_EXPECTED_SUMMARY,
  NO_FILTERS,
  OCTOBER_FILTERS,
  QUESTION_IDS,
  USER_IDS,
  attemptRows,
  buildFixtureDataset,
  examRows,
  fixtureRowsForExam,
  questionRows,
  userRows,
} from './fixtures';

const Q = QUESTION_IDS.main;
const CAPS: AnalyticsCapabilities = { canExport: true, canDownloadQuestions: false };
const MAIN_TITLE = 'Ujian Kompetensi Analis Kredit Q3';
const PENDING = 'Menunggu penilaian manual dari Admin.';

const textOf = (id: string): string => String(questionRows.find((q) => q.id === id)?.question_text ?? '');
const statOf = (stats: QuestionStat[], id: string): QuestionStat => {
  const s = stats.find((x) => x.questionId === id);
  assert.ok(s, `stat ${id} ada`);
  return s;
};
const filters = (f: Partial<AppliedFilters>): AppliedFilters => ({ ...NO_FILTERS, ...f });

/** Preview soal studi kasus (dihitung manual: 160 karakter pertama setelah spasi dirapikan + '…'). */
const CASE_PREVIEW =
  'Berdasarkan kasus PT Maju Jaya di atas, analisislah risiko utama yang perlu dimitigasi sebelum menyetujui ' +
  'tambahan plafon. Sebutkan pula dokumen pendukung yang …';

/** Dataset 1 soal MC (kunci opt-a): `correct` dari `total` peserta menjawab benar, sisanya opt-b. */
function syntheticDataset(correct: number, total: number): ExamDataset {
  const attempts = Array.from({ length: total }, (_, i) => {
    const ok = i < correct;
    return {
      id: `att-${String(i).padStart(6, '0')}`,
      exam_id: 'exam-syn',
      user_id: `user-${i}`,
      user_name: `Peserta ${String(i).padStart(6, '0')}`,
      user_department: 'Uji',
      score: ok ? 100 : 0,
      passed: ok,
      completed_at: new Date(Date.UTC(2026, 0, 1) + i * 1000).toISOString(),
      answers: { 'q-syn': { selectedAnswerId: ok ? 'opt-a' : 'opt-b', isCorrect: ok, pointsEarned: ok ? 10 : 0 } },
    };
  });
  return buildDataset({
    examRow: { id: 'exam-syn', title: 'Sintetis', scope: 'BANK' },
    questionRows: [
      {
        id: 'q-syn',
        exam_id: 'exam-syn',
        type: 'multiple_choice',
        question_text: 'Soal sintetis',
        options: [
          { id: 'opt-a', text: 'A' },
          { id: 'opt-b', text: 'B' },
        ],
        correct_answer_id: 'opt-a',
        points: 10,
      },
    ],
    attemptRows: attempts,
    userRows: [],
    loadedAt: FIXTURE_LOADED_AT,
  });
}

// ═══════════════════════════════════════════════════════════════
// NORMALISASI
// ═══════════════════════════════════════════════════════════════

describe('normalisasi baris DB', () => {
  test('normalizeExam: scope default BANK, angka via Number, string apa adanya', () => {
    assert.deepEqual(
      normalizeExam({
        id: 'x',
        title: 'Paket',
        description: undefined,
        category: '',
        scope: null,
        status: 'active',
        passing_score: '70',
        duration_minutes: 'abc',
        author_name: 'Rina',
        created_at: '2026-01-01',
        start_time: null,
        end_time: '2026-02-01',
      }),
      {
        id: 'x',
        title: 'Paket',
        description: null,
        category: '',
        scope: 'BANK',
        status: 'active',
        passingScore: 70,
        durationMinutes: null,
        authorName: 'Rina',
        createdAt: '2026-01-01',
        startTime: null,
        endTime: '2026-02-01',
      }
    );
    assert.equal(normalizeExam({ id: 'y', scope: 'SEC', passing_score: null }).passingScore, null);
    assert.equal(normalizeExam({ id: 'y', scope: 'SEC' }).scope, 'SEC');
    assert.equal(normalizeExam(null).scope, 'BANK');
    assert.equal(normalizeExam(null).id, '');
  });

  test('detectMateri: prioritas kandidat, nilai kosong dilewati, angka diterima', () => {
    assert.equal(detectMateri({ materi: 'Kredit', topic: 'Lain' }), 'Kredit');
    assert.equal(detectMateri({ materi: '   ', topik: ' Layanan ' }), 'Layanan');
    assert.equal(detectMateri({ materi: null, module: 3 }), '3');
    assert.equal(detectMateri({ materi: true, subject: Number.NaN }), null);
    assert.equal(detectMateri({ id: 'q', scope: 'BANK', type: 'essay', exam_id: 'e' }), null);
    assert.equal(detectMateri(null), null);
  });

  test('normalizeQuestions: urut id (localeCompare), no 1..n, options string/array, default Benar/Salah', () => {
    const qs = normalizeQuestions([
      {
        id: 'q-b',
        exam_id: 'e',
        type: 'multiple_choice',
        question_text: 'B',
        options: '[{"id":"opt-a","text":"A"},null,{"id":"opt-b"}]',
        correct_answer_id: 'opt-a',
        points: '5',
      },
      { id: 'q-a', exam_id: 'e', type: 'true_false', question_text: 'A', options: [], correct_answer_id: 'true', points: null },
      { id: 'q-c', exam_id: 'e', type: 'essay', question_text: null, options: '{rusak', correct_answer_id: null, points: 'x' },
      { id: 'q-d', exam_id: 'e', type: 'multiple_choice', question_text: 'D', options: null, correct_answer_id: 'opt-a' },
      null,
    ]);
    assert.deepEqual(
      qs.map((q) => [q.no, q.id]),
      [
        [1, 'q-a'],
        [2, 'q-b'],
        [3, 'q-c'],
        [4, 'q-d'],
      ]
    );
    assert.deepEqual(qs[0].options, [
      { id: 'true', text: 'Benar' },
      { id: 'false', text: 'Salah' },
    ]);
    assert.equal(qs[0].points, 0);
    assert.deepEqual(qs[1].options, [
      { id: 'opt-a', text: 'A' },
      { id: 'opt-b', text: '' },
    ]);
    assert.equal(qs[1].points, 5);
    assert.deepEqual(qs[2].options, []);
    assert.equal(qs[2].correctAnswerId, '');
    assert.equal(qs[2].questionText, '');
    assert.equal(qs[2].points, 0);
    assert.equal(qs[2].materi, null);
    assert.deepEqual(qs[3].options, [], 'MC tanpa opsi tidak diberi opsi Benar/Salah');
  });

  test('normalizeQuestions: urutan fixture mengikuti id walau baris diacak', () => {
    const ds = buildFixtureDataset();
    assert.deepEqual(
      ds.questions.map((q) => `${q.no}:${q.id}`),
      ['1:q-ana1-01', '2:q-ana1-02', '3:q-ana1-03', '4:q-ana1-04', '5:q-ana1-05', '6:q-ana1-06', '7:q-ana1-07']
    );
    // options string JSON (B/S) ter-parse
    assert.deepEqual(ds.questions[2].options, [
      { id: 'true', text: 'Benar' },
      { id: 'false', text: 'Salah' },
    ]);
  });

  test('normalizeAnswer: default & tipe', () => {
    assert.deepEqual(normalizeAnswer(undefined), {
      selectedAnswerId: '',
      isCorrect: false,
      pointsEarned: 0,
      essayAnswer: '',
      aiFeedback: null,
    });
    assert.deepEqual(
      normalizeAnswer({ selectedAnswerId: 7, isCorrect: 'true', pointsEarned: '12.5', essayAnswer: 5, aiFeedback: '' }),
      { selectedAnswerId: '7', isCorrect: false, pointsEarned: 12.5, essayAnswer: '', aiFeedback: '' }
    );
    assert.equal(normalizeAnswer({ pointsEarned: 'NaN' }).pointsEarned, 0);
    assert.equal(normalizeAnswer({ selectedAnswerId: null }).selectedAnswerId, '');
    // format lama (tanpa essayAnswer/aiFeedback)
    assert.deepEqual(normalizeAnswer({ questionId: 'q', selectedAnswerId: 'opt-a', isCorrect: true, pointsEarned: 10 }), {
      selectedAnswerId: 'opt-a',
      isCorrect: true,
      pointsEarned: 10,
      essayAnswer: '',
      aiFeedback: null,
    });
  });

  test('normalizeAttempts: answers string/objek/invalid, passed, score, department, completedAtMs', () => {
    const [a, b, c] = normalizeAttempts([
      {
        id: 'a1',
        exam_id: 'e',
        user_id: 'u1',
        user_name: 'U',
        user_department: '  Kredit ',
        score: '47',
        passed: 'true',
        completed_at: '2026-10-01T02:00:00.000Z',
        duration_seconds_used: '90',
        answers: '{"q1":{"questionId":"lain","selectedAnswerId":"opt-a","isCorrect":true,"pointsEarned":10}}',
      },
      {
        id: 'a2',
        exam_id: 'e',
        user_id: 'u2',
        user_department: '   ',
        score: null,
        passed: 'yes',
        completed_at: 'Invalid Date',
        answers: '{rusak',
      },
      { id: 'a3', exam_id: 'e', user_id: 'u3', passed: true, answers: [1, 2] },
    ]);
    assert.equal(a.userDepartment, 'Kredit');
    assert.equal(a.score, 47);
    assert.equal(a.passed, true);
    assert.equal(a.completedAtMs, Date.UTC(2026, 9, 1, 2));
    assert.equal(a.durationSecondsUsed, 90);
    assert.deepEqual(Object.keys(a.answers), ['q1'], 'key = key objek answers, bukan field questionId');
    assert.equal(a.answers.q1.isCorrect, true);

    assert.equal(b.userDepartment, null);
    assert.equal(b.userName, '');
    assert.equal(b.score, 0);
    assert.equal(b.passed, false);
    assert.ok(Number.isNaN(b.completedAtMs));
    assert.deepEqual(b.answers, {});

    assert.equal(c.passed, true);
    assert.deepEqual(c.answers, {});
    assert.equal(c.completedAt, null);
    assert.ok(Number.isNaN(c.completedAtMs));
    assert.equal(c.totalPointsEarned, null);
  });

  test('normalizeAttempts: key "__proto__" disimpan sebagai data biasa (tanpa polusi prototype)', () => {
    const [a] = normalizeAttempts([
      { id: 'a', exam_id: 'e', user_id: 'u', answers: '{"__proto__":{"isCorrect":true},"q1":{"isCorrect":true}}' },
    ]);
    assert.equal(Object.getPrototypeOf(a.answers), Object.prototype);
    assert.deepEqual(Object.keys(a.answers).sort(), ['__proto__', 'q1']);
    assert.equal(({} as Record<string, unknown>).isCorrect, undefined);
  });

  test('buildDataset: users tanpa password, company kosong → BANK, baris paket lain dibuang', () => {
    const ds = buildDataset({
      examRow: examRows[0],
      questionRows,
      attemptRows,
      userRows,
      loadedAt: '2026-10-05T00:00:00.000Z',
      truncated: true,
    });
    assert.equal(ds.exam.id, EXAM_IDS.main);
    assert.deepEqual(
      ds.questions.map((q) => q.id),
      [Q.mc5, Q.mc4, Q.tf, Q.keyChanged, Q.essay, Q.caseStudy, Q.addedLater]
    );
    assert.equal(ds.attempts.length, 11);
    assert.ok(ds.attempts.every((a) => a.examId === EXAM_IDS.main));
    assert.equal(ds.loadedAt, '2026-10-05T00:00:00.000Z');
    assert.equal(ds.truncated, true);
    assert.deepEqual(ds.users.get(USER_IDS.indra), {
      id: USER_IDS.indra,
      name: 'Indra Wijaya',
      company: 'BANK',
      department: 'Operasional',
    });
    assert.equal(ds.users.has(USER_IDS.gilang), false);
    for (const u of ds.users.values()) assert.equal('password' in u, false);

    const fresh = buildDataset({ examRow: examRows[0], questionRows: [], attemptRows: [], userRows: [] });
    assert.ok(Number.isFinite(Date.parse(fresh.loadedAt)), 'loadedAt default = sekarang (ISO)');
    assert.equal(fresh.truncated, false);
  });

  test('buildDataset fixture: answers string JSON ter-parse, format lama & soal terhapus tetap terbaca', () => {
    const ds = buildFixtureDataset();
    const citra = ds.attempts.find((a) => a.id === ATTEMPT_IDS.citra);
    assert.ok(citra);
    assert.equal(Object.keys(citra.answers).length, 7);
    const indra = ds.attempts.find((a) => a.id === ATTEMPT_IDS.indra);
    assert.ok(indra);
    assert.ok(Object.keys(indra.answers).includes(Q.deleted));
    assert.equal(indra.answers[Q.essay].essayAnswer, '');
    assert.equal(indra.answers[Q.essay].aiFeedback, null);
  });
});

describe('describeAnswer', () => {
  const ds = buildFixtureDataset();
  const q = (id: string) => ds.questions.find((x) => x.id === id) as NormQuestion;

  test('kosong, opsi MC (huruf posisi), B/S (teks), id tidak dikenal', () => {
    assert.deepEqual(describeAnswer(q(Q.mc5), ''), { label: null, text: null });
    assert.deepEqual(describeAnswer(q(Q.mc5), 'opt-c'), { label: 'C', text: 'Capacity' });
    assert.deepEqual(describeAnswer(q(Q.mc5), 'opt-e'), { label: 'E', text: 'Condition of economy' });
    assert.deepEqual(describeAnswer(q(Q.tf), 'false'), { label: 'Salah', text: 'Salah' });
    assert.deepEqual(describeAnswer(q(Q.mc4), 'opt-e'), { label: 'Lainnya', text: 'opt-e' });
  });

  test('B/S tanpa teks memakai Benar/Salah; opsi ke-11 memakai angka', () => {
    const tf: NormQuestion = { ...q(Q.tf), options: [{ id: 'true', text: '' }, { id: 'false', text: '' }] };
    assert.deepEqual(describeAnswer(tf, 'true'), { label: 'Benar', text: '' });
    assert.deepEqual(describeAnswer(tf, 'false'), { label: 'Salah', text: '' });
    const many: NormQuestion = {
      ...q(Q.mc5),
      options: Array.from({ length: 11 }, (_, i) => ({ id: `o${i}`, text: `T${i}` })),
    };
    assert.deepEqual(describeAnswer(many, 'o10'), { label: '11', text: 'T10' });
    assert.deepEqual(describeAnswer(many, 'o9'), { label: 'J', text: 'T9' });
  });
});

// ═══════════════════════════════════════════════════════════════
// ATTEMPT PERTAMA
// ═══════════════════════════════════════════════════════════════

describe('aturan attempt pertama', () => {
  test('selectFirstAttempts: per user+paket, completedAt naik, tidak valid paling akhir, seri → id', () => {
    const atts = normalizeAttempts([
      { id: 'b', exam_id: 'e', user_id: 'u1', completed_at: '2026-10-02T00:00:00.000Z' },
      { id: 'a', exam_id: 'e', user_id: 'u1', completed_at: '2026-10-02T00:00:00.000Z' },
      { id: 'f', exam_id: 'e', user_id: 'u1', completed_at: '2026-09-01T00:00:00.000Z' },
      { id: 'c', exam_id: 'e', user_id: 'u2', completed_at: 'Invalid Date' },
      { id: 'd', exam_id: 'e', user_id: 'u2', completed_at: '2026-12-01T00:00:00.000Z' },
      { id: 'e1', exam_id: 'e', user_id: 'u3', completed_at: null },
      { id: 'e0', exam_id: 'e', user_id: 'u3', completed_at: 'bukan tanggal' },
      { id: 'y', exam_id: 'e', user_id: 'u4', completed_at: '2026-10-02T00:00:00.000Z' },
      { id: 'x', exam_id: 'e', user_id: 'u4', completed_at: '2026-10-02T00:00:00.000Z' },
      { id: 'g', exam_id: 'lain', user_id: 'u1', completed_at: '2026-12-31T00:00:00.000Z' },
    ]);
    const before = atts.map((a) => a.id);
    assert.deepEqual(
      selectFirstAttempts(atts).map((a) => a.id),
      ['f', 'x', 'd', 'g', 'e0']
    );
    assert.deepEqual(
      atts.map((a) => a.id),
      before,
      'input tidak diubah'
    );
  });

  test('fixture: retake Eko & Fajar diabaikan, urutan baris tidak berpengaruh', () => {
    const expected = [
      ATTEMPT_IDS.indra,
      ATTEMPT_IDS.fajarFirst,
      ATTEMPT_IDS.andi,
      ATTEMPT_IDS.budi,
      ATTEMPT_IDS.citra,
      ATTEMPT_IDS.ekoFirst,
      ATTEMPT_IDS.dewi,
      ATTEMPT_IDS.gilang,
      ATTEMPT_IDS.hana,
    ];
    assert.deepEqual(
      selectFirstAttempts(buildFixtureDataset().attempts).map((a) => a.id),
      expected
    );
    const rows = fixtureRowsForExam(EXAM_IDS.main);
    const reversed = buildDataset({ ...rows, attemptRows: [...rows.attemptRows].reverse() });
    assert.deepEqual(
      selectFirstAttempts(reversed.attempts).map((a) => a.id),
      expected
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// FILTER (parse)
// ═══════════════════════════════════════════════════════════════

describe('parseFilters', () => {
  test('nilai valid dinormalisasi; kosong → null; key lain diabaikan', () => {
    assert.deepEqual(
      parseFilters({
        company: ' SEC ',
        department: '  Kredit ',
        from: '2026-10-01',
        to: '2026-10-31T23:59:59+07:00',
        fresh: '1',
        search: 'x',
      }),
      {
        ok: true,
        filters: {
          company: 'SEC',
          department: 'Kredit',
          from: '2026-10-01T00:00:00.000Z',
          to: '2026-10-31T16:59:59.000Z',
        },
      }
    );
    assert.deepEqual(parseFilters({}), { ok: true, filters: NO_FILTERS });
    assert.deepEqual(parseFilters({ company: '', department: '   ', from: '', to: undefined }), {
      ok: true,
      filters: NO_FILTERS,
    });
    for (const company of ['BANK', 'SEC', 'ALL']) assert.equal(parseFilters({ company }).ok, true, company);
    assert.equal(parseFilters({ department: 'x'.repeat(200) }).ok, true);
    const same = parseFilters({ from: '2026-10-01T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' });
    assert.equal(same.ok, true, 'from == to boleh');
  });

  test('input tidak valid ditolak dengan pesan', () => {
    const bad: Array<Record<string, unknown>> = [
      { company: 'XYZ' },
      { company: 'bank' },
      { company: ['BANK', 'SEC'] },
      { department: ['A'] },
      { department: 'x'.repeat(201) },
      { from: 'bukan-tanggal' },
      { to: '2026-13-45' },
      { from: { a: 1 } },
      { from: '2026-10-02T00:00:00.000Z', to: '2026-10-01T00:00:00.000Z' },
    ];
    for (const query of bad) {
      const r = parseFilters(query);
      assert.equal(r.ok, false, `ditolak: ${Object.keys(query).join(',')}`);
      if (!r.ok) assert.ok(r.error.length > 10);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// RINGKASAN
// ═══════════════════════════════════════════════════════════════

describe('computeSummary — paket utama tanpa filter', () => {
  const ds = buildFixtureDataset();
  const s = computeSummary(ds, NO_FILTERS, CAPS);

  test('angka ringkasan (dihitung manual)', () => {
    // nilai peserta valid: 84, 33, 33, 47, 11, 79, 22, 63, 33 → jumlah 405 / 9 = 45
    assert.deepEqual(s.summary, {
      totalParticipants: 9,
      totalAttempts: 11,
      avgScore: 45,
      maxScore: 84,
      minScore: 11,
      passedCount: 2,
      failedCount: 7,
      passRatePct: 22.22,
      avgCorrectObjective: 3,
      objectiveQuestionCount: 5,
      totalUnanswered: 9,
      pendingGradingParticipants: 4,
      questionCount: 7,
      firstCompletedAt: '2026-09-05T02:00:00.000Z',
      lastCompletedAt: '2026-10-02T07:00:00.000Z',
    });
    assert.deepEqual(s.summary, MAIN_EXAM_EXPECTED_SUMMARY, 'konstanta fixture sinkron');
  });

  test('info paket, filter, catatan basis, capabilities, waktu data', () => {
    assert.deepEqual(s.exam, {
      id: EXAM_IDS.main,
      title: MAIN_TITLE,
      description: 'Evaluasi pemahaman analisis kredit, kepatuhan, dan anti-fraud.',
      category: 'Perbankan',
      scope: 'BANK',
      status: 'active',
      passingScore: 70,
      durationMinutes: 30,
      authorName: 'Rina Kusuma',
      createdAt: '2026-08-25T02:00:00.000Z',
      startTime: '2026-09-01T01:00:00.000Z',
      endTime: '2026-10-31T16:59:00.000Z',
    });
    assert.deepEqual(s.filters, NO_FILTERS);
    assert.equal(s.basisNote, ATTEMPT_BASIS_NOTE);
    assert.deepEqual(s.capabilities, { canExport: true, canDownloadQuestions: false });
    assert.equal(s.generatedAt, FIXTURE_LOADED_AT);
    assert.equal(s.truncated, false);
    assert.equal(computeSummary(buildFixtureDataset(EXAM_IDS.main, { truncated: true }), NO_FILTERS, CAPS).truncated, true);
  });

  test('filterOptions dari attempt pertama tanpa filter (user hilang tidak punya company)', () => {
    assert.deepEqual(s.filterOptions, {
      companies: ['ALL', 'BANK', 'SEC'],
      departments: ['Akademik', 'Kredit', 'Operasional', 'Treasury'],
    });
  });

  test('distribusi nilai (histogram)', () => {
    assert.deepEqual(
      s.scoreDistribution.map((b) => b.label),
      SCORE_BINS.map((b) => b.label)
    );
    assert.deepEqual(
      s.scoreDistribution.map((b) => b.count),
      [0, 1, 1, 3, 1, 0, 1, 1, 1, 0]
    );
  });

  test('statistik per soal (benar/salah/kosong, %, kesulitan, essay, mismatch)', () => {
    const base = (no: number, id: string, type: string, typeLabel: string, points = 10) => ({
      no,
      questionId: id,
      type,
      typeLabel,
      textPreview: textOf(id),
      materi: null,
      points,
    });
    assert.deepEqual(s.questions, [
      {
        ...base(1, Q.mc5, 'multiple_choice', 'Pilihan Ganda'),
        total: 9,
        correct: 6,
        wrong: 2,
        empty: 1,
        pctCorrect: 66.67,
        pctWrong: 22.22,
        pctEmpty: 11.11,
        difficulty: 'Sedang',
        essay: null,
        scoringMismatchCount: 0,
      },
      {
        ...base(2, Q.mc4, 'multiple_choice', 'Pilihan Ganda'),
        total: 9,
        correct: 6,
        wrong: 3,
        empty: 0,
        pctCorrect: 66.67,
        pctWrong: 33.33,
        pctEmpty: 0,
        difficulty: 'Sedang',
        essay: null,
        scoringMismatchCount: 0,
      },
      {
        ...base(3, Q.tf, 'true_false', 'Benar/Salah'),
        total: 9,
        correct: 5,
        wrong: 3,
        empty: 1,
        pctCorrect: 55.56,
        pctWrong: 33.33,
        pctEmpty: 11.11,
        difficulty: 'Sedang',
        essay: null,
        scoringMismatchCount: 0,
      },
      {
        // kunci sekarang D; Benar/Salah tetap dari isCorrect tersimpan (kunci lama A)
        ...base(4, Q.keyChanged, 'multiple_choice', 'Pilihan Ganda'),
        total: 9,
        correct: 4,
        wrong: 4,
        empty: 1,
        pctCorrect: 44.44,
        pctWrong: 44.44,
        pctEmpty: 11.11,
        difficulty: 'Sulit',
        essay: null,
        scoringMismatchCount: 5,
      },
      {
        ...base(5, Q.essay, 'essay', 'Essay', 20),
        total: 9,
        correct: null,
        wrong: null,
        empty: 3,
        pctCorrect: null,
        pctWrong: null,
        pctEmpty: 33.33,
        difficulty: null,
        essay: { answered: 6, graded: 4, pending: 2, avgScore: 14, minScore: 8, maxScore: 20, maxPoint: 20 },
        scoringMismatchCount: 0,
      },
      {
        ...base(6, Q.caseStudy, 'case_study', 'Studi Kasus', 20),
        textPreview: CASE_PREVIEW,
        total: 9,
        correct: null,
        wrong: null,
        empty: 3,
        pctCorrect: null,
        pctWrong: null,
        pctEmpty: 33.33,
        difficulty: null,
        essay: { answered: 6, graded: 3, pending: 3, avgScore: 10.67, minScore: 7, maxScore: 15, maxPoint: 20 },
        scoringMismatchCount: 0,
      },
      {
        // tidak disajikan ke attempt September (Fajar pertama & Indra)
        ...base(7, Q.addedLater, 'multiple_choice', 'Pilihan Ganda'),
        total: 7,
        correct: 6,
        wrong: 1,
        empty: 0,
        pctCorrect: 85.71,
        pctWrong: 14.29,
        pctEmpty: 0,
        difficulty: 'Mudah',
        essay: null,
        scoringMismatchCount: 0,
      },
    ]);
  });

  test('preview soal: spasi dirapikan, dipotong 160 karakter + "…"', () => {
    assert.equal(CASE_PREVIEW.length, TEXT_PREVIEW_LENGTH + 1);
    assert.equal(statOf(s.questions, Q.caseStudy).textPreview, CASE_PREVIEW);
    assert.ok(CASE_STUDY_QUESTION_TEXT.includes('\n'));
  });

  test('distribusi jawaban: urutan opsi, Lainnya, Tidak menjawab, kunci saat ini', () => {
    assert.deepEqual(Object.keys(s.distributions), [Q.mc5, Q.mc4, Q.tf, Q.keyChanged, Q.addedLater]);
    const opt = (optionId: string, label: string, text: string, count: number, pctValue: number | null, isCorrect = false) => ({
      optionId,
      label,
      text,
      count,
      pct: pctValue,
      isCorrect,
      kind: 'option',
    });
    const empty = (count: number, pctValue: number | null) => ({
      optionId: '__empty__',
      label: 'Tidak menjawab',
      text: '',
      count,
      pct: pctValue,
      isCorrect: false,
      kind: 'empty',
    });
    assert.deepEqual(s.distributions[Q.mc5], [
      opt('opt-a', 'A', 'Character', 1, 11.11),
      opt('opt-b', 'B', 'Capital', 1, 11.11),
      opt('opt-c', 'C', 'Capacity', 6, 66.67, true),
      opt('opt-d', 'D', 'Collateral', 0, 0),
      opt('opt-e', 'E', 'Condition of economy', 0, 0),
      empty(1, 11.11),
    ]);
    assert.deepEqual(s.distributions[Q.mc4], [
      opt('opt-a', 'A', 'Slip gaji', 1, 11.11),
      opt('opt-b', 'B', 'KTP elektronik', 6, 66.67, true),
      opt('opt-c', 'C', 'Rekening listrik', 0, 0),
      opt('opt-d', 'D', 'Kartu keluarga', 1, 11.11),
      {
        optionId: '__unknown__',
        label: 'Lainnya',
        text: 'Opsi tidak ditemukan pada soal saat ini',
        count: 1,
        pct: 11.11,
        isCorrect: false,
        kind: 'unknown',
      },
      empty(0, 0),
    ]);
    assert.deepEqual(s.distributions[Q.tf], [
      opt('true', 'Benar', 'Benar', 3, 33.33),
      opt('false', 'Salah', 'Salah', 5, 55.56, true),
      empty(1, 11.11),
    ]);
    assert.deepEqual(s.distributions[Q.keyChanged], [
      opt('opt-a', 'A', 'Direksi bank', 4, 44.44),
      opt('opt-b', 'B', 'Dewan Komisaris', 2, 22.22),
      opt('opt-c', 'C', 'Kepala cabang', 1, 11.11),
      opt('opt-d', 'D', 'Otoritas Jasa Keuangan', 1, 11.11, true),
      empty(1, 11.11),
    ]);
    assert.deepEqual(s.distributions[Q.addedLater], [
      opt('opt-a', 'A', 'Whistleblowing system', 6, 85.71, true),
      opt('opt-b', 'B', 'Grup chat divisi', 0, 0),
      opt('opt-c', 'C', 'Media sosial', 0, 0),
      opt('opt-d', 'D', 'Email pribadi atasan', 0, 0),
      opt('opt-e', 'E', 'Tidak perlu dilaporkan', 1, 14.29),
      empty(0, 0),
    ]);
    for (const [id, rows] of Object.entries(s.distributions)) {
      const total = statOf(s.questions, id).total;
      assert.equal(
        rows.reduce((acc, r) => acc + r.count, 0),
        total,
        `jumlah distribusi = total (${id})`
      );
    }
  });

  test('soal terhapus diabaikan; analisis materi tidak tersedia', () => {
    assert.equal(
      s.questions.some((q) => q.questionId === Q.deleted),
      false
    );
    assert.equal(s.distributions[Q.deleted], undefined);
    assert.equal(s.materialAvailable, false);
    assert.deepEqual(s.materials, []);
  });
});

describe('computeSummary — filter', () => {
  const ds = buildFixtureDataset();

  test('company BANK (user company null dianggap BANK)', () => {
    const s = computeSummary(ds, filters({ company: 'BANK' }), CAPS);
    // valid: Andi 84, Budi 33, Eko 11, Fajar 79, Indra 33; semua attempt BANK termasuk retake = 7
    assert.deepEqual(s.summary, {
      totalParticipants: 5,
      totalAttempts: 7,
      avgScore: 48,
      maxScore: 84,
      minScore: 11,
      passedCount: 2,
      failedCount: 3,
      passRatePct: 40,
      avgCorrectObjective: 3.2,
      objectiveQuestionCount: 5,
      totalUnanswered: 4,
      pendingGradingParticipants: 2,
      questionCount: 7,
      firstCompletedAt: '2026-09-05T02:00:00.000Z',
      lastCompletedAt: '2026-10-01T05:00:00.000Z',
    });
    assert.deepEqual(s.filters, filters({ company: 'BANK' }));
    assert.deepEqual(s.filterOptions.companies, ['ALL', 'BANK', 'SEC'], 'opsi filter tidak ikut terfilter');
    // Q1 BANK: Andi ✓, Budi ✗, Eko ✗, Fajar ✓, Indra ✓
    const q1 = statOf(s.questions, Q.mc5);
    assert.deepEqual([q1.total, q1.correct, q1.wrong, q1.empty, q1.pctCorrect], [5, 3, 2, 0, 60]);
  });

  test('company SEC & ALL', () => {
    const sec = computeSummary(ds, filters({ company: 'SEC' }), CAPS).summary;
    assert.deepEqual(
      [sec.totalParticipants, sec.totalAttempts, sec.avgScore, sec.maxScore, sec.minScore, sec.passRatePct],
      [2, 2, 48, 63, 33, 0]
    );
    assert.equal(sec.pendingGradingParticipants, 1);
    assert.equal(sec.firstCompletedAt, '2026-10-01T04:00:00.000Z');
    assert.equal(sec.lastCompletedAt, '2026-10-01T04:00:00.000Z', 'completed_at tidak valid diabaikan');
    const all = computeSummary(ds, filters({ company: 'ALL' }), CAPS).summary;
    assert.deepEqual([all.totalParticipants, all.totalAttempts, all.avgScore], [1, 1, 47]);
  });

  test('department (snapshot attempt, sudah di-trim)', () => {
    const ops = computeSummary(ds, filters({ department: 'Operasional' }), CAPS).summary;
    assert.deepEqual([ops.totalParticipants, ops.totalAttempts], [3, 4]);
    const parsed = parseFilters({ department: ' Kredit ' });
    assert.ok(parsed.ok);
    if (!parsed.ok) return;
    const kredit = computeSummary(ds, parsed.filters, CAPS).summary;
    // Andi (' Kredit ' di-trim), Dewi, Fajar; attempt: + retake Fajar
    assert.deepEqual([kredit.totalParticipants, kredit.totalAttempts], [3, 4]);
  });

  test('periode Oktober: dedupe attempt pertama DULU baru filter', () => {
    const s = computeSummary(ds, OCTOBER_FILTERS, CAPS);
    // Fajar keluar (attempt pertama September) walau retake-nya Oktober; Hana keluar (tanggal tidak valid)
    assert.deepEqual(s.summary, {
      totalParticipants: 6,
      totalAttempts: 8,
      avgScore: 38.33,
      maxScore: 84,
      minScore: 11,
      passedCount: 1,
      failedCount: 5,
      passRatePct: 16.67,
      avgCorrectObjective: 2.83,
      objectiveQuestionCount: 5,
      // kosong: Citra 1, Dewi 1, Eko 2, Gilang 2
      totalUnanswered: 6,
      pendingGradingParticipants: 4,
      questionCount: 7,
      firstCompletedAt: '2026-10-01T02:00:00.000Z',
      lastCompletedAt: '2026-10-02T07:00:00.000Z',
    });
    const q1 = statOf(s.questions, Q.mc5);
    assert.deepEqual([q1.total, q1.correct, q1.wrong, q1.empty, q1.pctCorrect, q1.difficulty], [6, 3, 2, 1, 50, 'Sedang']);
    const q7 = statOf(s.questions, Q.addedLater);
    assert.deepEqual([q7.total, q7.correct, q7.wrong, q7.pctCorrect, q7.difficulty], [6, 5, 1, 83.33, 'Mudah']);

    const view = applyFilters(ds, OCTOBER_FILTERS);
    assert.deepEqual(
      view.valid.map((a) => a.userId).sort(),
      ['u-p01', 'u-p02', 'u-p03', 'u-p04', 'u-p05', 'u-p07']
    );
    assert.equal(view.rawMatching.length, 8);
    assert.equal(view.attemptCountByUser.get(USER_IDS.eko), 2);
    assert.equal(view.attemptCountByUser.get(USER_IDS.fajar), 1, 'Fajar hanya muncul lewat attempt ulang');
    assert.equal(
      view.valid.some((a) => a.userId === USER_IDS.fajar),
      false
    );
  });

  test('kombinasi company + periode', () => {
    const s = computeSummary(ds, { ...OCTOBER_FILTERS, company: 'BANK' }, CAPS).summary;
    assert.deepEqual([s.totalParticipants, s.totalAttempts], [3, 5]);
  });

  test('filter tanpa hasil → angka null / 0, tidak ada pembagian dengan nol', () => {
    const s = computeSummary(ds, filters({ from: '2027-01-01T00:00:00.000Z' }), CAPS);
    assert.deepEqual(s.summary, {
      totalParticipants: 0,
      totalAttempts: 0,
      avgScore: null,
      maxScore: null,
      minScore: null,
      passedCount: 0,
      failedCount: 0,
      passRatePct: null,
      avgCorrectObjective: null,
      objectiveQuestionCount: 5,
      totalUnanswered: 0,
      pendingGradingParticipants: 0,
      questionCount: 7,
      firstCompletedAt: null,
      lastCompletedAt: null,
    });
    for (const q of s.questions) {
      assert.equal(q.total, 0);
      assert.equal(q.pctCorrect, null);
      assert.equal(q.pctEmpty, null);
      assert.equal(q.difficulty, null);
    }
    assert.deepEqual(statOf(s.questions, Q.essay).essay, {
      answered: 0,
      graded: 0,
      pending: 0,
      avgScore: null,
      minScore: null,
      maxScore: null,
      maxPoint: 20,
    });
    assert.ok(s.distributions[Q.mc5].every((r) => r.count === 0 && r.pct === null));
    assert.ok(s.scoreDistribution.every((b) => b.count === 0));
    assert.deepEqual(s.filterOptions.departments, ['Akademik', 'Kredit', 'Operasional', 'Treasury']);
  });

  test('batas periode yang tidak bisa di-parse tidak meloloskan apa pun (fail closed)', () => {
    const s = computeSummary(ds, filters({ from: 'rusak' }), CAPS);
    assert.equal(s.summary.totalParticipants, 0);
  });
});

describe('aturan status menunggu penilaian (sama dengan Rekap Nilai)', () => {
  test('feedback pending pada soal yang sudah dihapus tetap membuat status MENUNGGU PENILAIAN', () => {
    const ds = buildDataset({
      examRow: { id: 'ex', title: 'X' },
      questionRows: [
        {
          id: 'q1',
          exam_id: 'ex',
          type: 'multiple_choice',
          question_text: 'Q',
          options: [{ id: 'opt-a', text: 'A' }],
          correct_answer_id: 'opt-a',
          points: 10,
        },
      ],
      attemptRows: [
        {
          id: 'a1',
          exam_id: 'ex',
          user_id: 'u1',
          user_name: 'Ani',
          completed_at: '2026-10-01T00:00:00.000Z',
          score: 100,
          passed: true,
          answers: {
            q1: { selectedAnswerId: 'opt-a', isCorrect: true, pointsEarned: 10 },
            'q-hapus': { selectedAnswerId: '', essayAnswer: 'teks', aiFeedback: PENDING },
          },
        },
      ],
      userRows: [],
    });
    const [row] = computeParticipantRows(ds, NO_FILTERS);
    assert.equal(row.status, STATUS_LABELS.pending);
    assert.equal(row.pendingEssay, 0, 'pendingEssay hanya menghitung soal yang masih ada');
    assert.equal(computeSummary(ds, NO_FILTERS, CAPS).summary.pendingGradingParticipants, 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// PESERTA
// ═══════════════════════════════════════════════════════════════

describe('peserta', () => {
  const ds = buildFixtureDataset();
  const rows = computeParticipantRows(ds, NO_FILTERS);
  const namesOf = (list: Array<{ name: string }>) => list.map((r) => r.name.split(' ')[0]);

  test('computeParticipantRows: seluruh baris, urut nama', () => {
    const row = (
      userId: string,
      attemptId: string,
      name: string,
      company: string | null,
      department: string,
      score: number,
      passed: boolean,
      status: string,
      counts: [number, number, number, number],
      attemptCount: number,
      completedAt: string,
      durationSeconds: number
    ) => ({
      userId,
      attemptId,
      name,
      company,
      department,
      score,
      passed,
      status,
      correct: counts[0],
      wrong: counts[1],
      empty: counts[2],
      pendingEssay: counts[3],
      attemptCount,
      completedAt,
      durationSeconds,
    });
    const { passed: LULUS, failed: GAGAL, pending: MENUNGGU } = STATUS_LABELS;
    assert.deepEqual(rows, [
      row('u-p01', 'att-ana1-01', 'Andi Saputra', 'BANK', 'Kredit', 84, true, LULUS, [5, 0, 0, 0], 1, '2026-10-01T02:00:00.000Z', 1500),
      row('u-p02', 'att-ana1-02', 'Budi Hartono', 'BANK', 'Operasional', 33, false, MENUNGGU, [3, 2, 0, 2], 1, '2026-10-01T03:00:00.000Z', 1740),
      row('u-p03', 'att-ana1-03', 'Citra Lestari', 'SEC', 'Akademik', 33, false, MENUNGGU, [3, 2, 1, 1], 1, '2026-10-01T04:00:00.000Z', 1680),
      row('u-p04', 'att-ana1-04', 'Dewi Anggraini', 'ALL', 'Kredit', 47, false, GAGAL, [3, 2, 1, 0], 1, '2026-10-02T02:00:00.000Z', 1800),
      row('u-p05', 'att-ana1-05', 'Eko Prasetyo', 'BANK', 'Operasional', 11, false, MENUNGGU, [1, 3, 2, 1], 2, '2026-10-01T05:00:00.000Z', 1200),
      row('u-p06', 'att-ana1-07', 'Fajar Nugraha', 'BANK', 'Kredit', 79, true, LULUS, [4, 0, 0, 0], 2, '2026-09-10T02:00:00.000Z', 1800),
      row('u-p07', 'att-ana1-09', 'Gilang Ramadhan', null, 'Treasury', 22, false, MENUNGGU, [2, 2, 2, 1], 1, '2026-10-02T07:00:00.000Z', 1800),
      row('u-p08', 'att-ana1-10', 'Hana Pertiwi', 'SEC', 'Akademik', 63, false, GAGAL, [3, 1, 1, 0], 1, 'Invalid Date', 1650),
      row('u-p09', 'att-ana1-11', 'Indra Wijaya', 'BANK', 'Operasional', 33, false, GAGAL, [3, 1, 2, 0], 1, '2026-09-05T02:00:00.000Z', 1200),
    ]);
  });

  test('konsistensi antar-endpoint: jumlah per peserta = jumlah per soal', () => {
    const s = computeSummary(ds, NO_FILTERS, CAPS);
    const sum = (f: (q: QuestionStat) => number) => s.questions.reduce((acc, q) => acc + f(q), 0);
    assert.equal(
      rows.reduce((a, r) => a + r.correct, 0),
      sum((q) => q.correct ?? 0)
    );
    assert.equal(
      rows.reduce((a, r) => a + r.wrong, 0),
      sum((q) => q.wrong ?? 0)
    );
    assert.equal(
      rows.reduce((a, r) => a + r.empty, 0),
      s.summary.totalUnanswered
    );
  });

  test('nama/department/company fallback: user_name kosong & user hilang', () => {
    const syn = buildDataset({
      examRow: { id: 'ex', title: 'X' },
      questionRows: [
        { id: 'q1', exam_id: 'ex', type: 'multiple_choice', question_text: 'Q', options: [{ id: 'opt-a', text: 'A' }], correct_answer_id: 'opt-a' },
      ],
      attemptRows: [
        { id: 'a1', exam_id: 'ex', user_id: 'u-x', user_name: '', user_department: null, completed_at: '2026-10-01T00:00:00.000Z', answers: { q1: { selectedAnswerId: 'opt-a', isCorrect: true } } },
        { id: 'a2', exam_id: 'ex', user_id: 'u-y', user_name: '', user_department: null, completed_at: '2026-10-01T00:00:00.000Z', answers: {} },
      ],
      userRows: [{ id: 'u-y', name: 'Yanti', company: 'SEC', department: 'Keuangan' }],
    });
    const [x, y] = computeParticipantRows(syn, NO_FILTERS).sort((a, b) => a.userId.localeCompare(b.userId));
    assert.deepEqual([x.name, x.company, x.department, x.correct], ['u-x', null, null, 1]);
    assert.deepEqual([y.name, y.company, y.department, y.correct, y.wrong, y.empty], ['Yanti', 'SEC', 'Keuangan', 0, 0, 0]);
  });

  test('listParticipants: default urut nama asc, halaman 1, pageSize default', () => {
    const r = listParticipants(ds, NO_FILTERS, {});
    assert.equal(r.total, 9);
    assert.equal(r.page, 1);
    assert.equal(r.pageSize, PARTICIPANT_PAGE_SIZE_DEFAULT);
    assert.deepEqual(namesOf(r.rows), ['Andi', 'Budi', 'Citra', 'Dewi', 'Eko', 'Fajar', 'Gilang', 'Hana', 'Indra']);
  });

  test('listParticipants: sort angka default desc, null selalu terakhir, tiebreak nama', () => {
    const order = (sort: string, dir?: string) => namesOf(listParticipants(ds, NO_FILTERS, { sort, dir }).rows);
    assert.deepEqual(order('score'), ['Andi', 'Fajar', 'Hana', 'Dewi', 'Budi', 'Citra', 'Indra', 'Gilang', 'Eko']);
    assert.deepEqual(order('score', 'asc'), ['Eko', 'Gilang', 'Budi', 'Citra', 'Indra', 'Dewi', 'Hana', 'Fajar', 'Andi']);
    assert.deepEqual(order('correct'), ['Andi', 'Fajar', 'Budi', 'Citra', 'Dewi', 'Hana', 'Indra', 'Gilang', 'Eko']);
    assert.deepEqual(order('wrong'), ['Eko', 'Budi', 'Citra', 'Dewi', 'Gilang', 'Hana', 'Indra', 'Andi', 'Fajar']);
    assert.deepEqual(order('empty'), ['Eko', 'Gilang', 'Indra', 'Citra', 'Dewi', 'Hana', 'Andi', 'Budi', 'Fajar']);
    // completedAt default desc; 'Invalid Date' (Hana) paling akhir
    assert.deepEqual(order('completedAt'), ['Gilang', 'Dewi', 'Eko', 'Citra', 'Budi', 'Andi', 'Fajar', 'Indra', 'Hana']);
    assert.deepEqual(order('completedAt', 'asc'), ['Indra', 'Fajar', 'Andi', 'Budi', 'Citra', 'Eko', 'Dewi', 'Gilang', 'Hana']);
    // company null (Gilang, user hilang) terakhir di kedua arah
    assert.deepEqual(order('company'), ['Dewi', 'Andi', 'Budi', 'Eko', 'Fajar', 'Indra', 'Citra', 'Hana', 'Gilang']);
    assert.deepEqual(order('company', 'desc'), ['Citra', 'Hana', 'Andi', 'Budi', 'Eko', 'Fajar', 'Indra', 'Dewi', 'Gilang']);
    assert.deepEqual(order('department'), ['Citra', 'Hana', 'Andi', 'Dewi', 'Fajar', 'Budi', 'Eko', 'Indra', 'Gilang']);
    assert.deepEqual(order('name', 'desc'), ['Indra', 'Hana', 'Gilang', 'Fajar', 'Eko', 'Dewi', 'Citra', 'Budi', 'Andi']);
    // key tidak dikenal → name; dir tidak dikenal → default
    assert.deepEqual(order('password', 'desc'), ['Indra', 'Hana', 'Gilang', 'Fajar', 'Eko', 'Dewi', 'Citra', 'Budi', 'Andi']);
    assert.deepEqual(order('score', 'acak'), order('score'));
  });

  test('listParticipants: pencarian nama/department/company tanpa beda huruf besar-kecil', () => {
    const search = (term: string) => namesOf(listParticipants(ds, NO_FILTERS, { search: term }).rows);
    assert.deepEqual(search('  kREDIT '), ['Andi', 'Dewi', 'Fajar']);
    assert.deepEqual(search('sec'), ['Citra', 'Hana']);
    assert.deepEqual(search('RAMADHAN'), ['Gilang']);
    const none = listParticipants(ds, NO_FILTERS, { search: 'tidak-ada' });
    assert.deepEqual([none.total, none.page, none.rows.length], [0, 1, 0]);
  });

  test('listParticipants: paginasi, clamp halaman & ukuran', () => {
    const page = (p: number | string | undefined, size: number | string | undefined) =>
      listParticipants(ds, NO_FILTERS, { page: p, pageSize: size });
    assert.deepEqual(namesOf(page(1, 4).rows), ['Andi', 'Budi', 'Citra', 'Dewi']);
    assert.deepEqual(namesOf(page('2', '4').rows), ['Eko', 'Fajar', 'Gilang', 'Hana']);
    const last = page(3, 4);
    assert.deepEqual([last.page, last.total, namesOf(last.rows)], [3, 9, ['Indra']]);
    assert.equal(page(99, 4).page, 3, 'halaman di-clamp ke halaman terakhir');
    assert.equal(page(0, 4).page, 1);
    assert.equal(page('-2', 4).page, 1);
    assert.equal(page('abc', 4).page, 1);
    assert.equal(page('2.5', 4).page, 2);
    assert.equal(page(1, '0').pageSize, PARTICIPANT_PAGE_SIZE_DEFAULT);
    assert.equal(page(1, 'x').pageSize, PARTICIPANT_PAGE_SIZE_DEFAULT);
    assert.equal(page(1, 1000).pageSize, PARTICIPANT_PAGE_SIZE_MAX);
    assert.equal(page(1, '2.9').pageSize, 2);
  });

  test('computeParticipantDetail: Eko memakai attempt pertama (bukan retake)', () => {
    const d = computeParticipantDetail(ds, NO_FILTERS, USER_IDS.eko);
    assert.ok(d);
    assert.deepEqual(d.exam, { id: EXAM_IDS.main, title: MAIN_TITLE, scope: 'BANK', passingScore: 70 });
    assert.deepEqual(d.participant, rows.find((r) => r.userId === USER_IDS.eko));
    assert.equal(d.participant.attemptId, ATTEMPT_IDS.ekoFirst);
    assert.equal(d.participant.attemptCount, 2);
    assert.deepEqual(d.wrongQuestions, [
      {
        no: 1,
        questionId: Q.mc5,
        type: 'multiple_choice',
        typeLabel: 'Pilihan Ganda',
        materi: null,
        textPreview: textOf(Q.mc5),
        status: 'wrong',
        answerLabel: 'B',
        answerText: 'Capital',
        correctLabel: 'C',
        correctText: 'Capacity',
        pointsEarned: 0,
        maxPoints: 10,
      },
      {
        no: 3,
        questionId: Q.tf,
        type: 'true_false',
        typeLabel: 'Benar/Salah',
        materi: null,
        textPreview: textOf(Q.tf),
        status: 'empty',
        answerLabel: null,
        answerText: null,
        correctLabel: 'Salah',
        correctText: 'Salah',
        pointsEarned: 0,
        maxPoints: 10,
      },
      {
        no: 4,
        questionId: Q.keyChanged,
        type: 'multiple_choice',
        typeLabel: 'Pilihan Ganda',
        materi: null,
        textPreview: textOf(Q.keyChanged),
        status: 'wrong',
        answerLabel: 'C',
        answerText: 'Kepala cabang',
        correctLabel: 'D',
        correctText: 'Otoritas Jasa Keuangan',
        pointsEarned: 0,
        maxPoints: 10,
      },
      {
        no: 7,
        questionId: Q.addedLater,
        type: 'multiple_choice',
        typeLabel: 'Pilihan Ganda',
        materi: null,
        textPreview: textOf(Q.addedLater),
        status: 'wrong',
        answerLabel: 'E',
        answerText: 'Tidak perlu dilaporkan',
        correctLabel: 'A',
        correctText: 'Whistleblowing system',
        pointsEarned: 0,
        maxPoints: 10,
      },
    ]);
    assert.deepEqual(d.essayQuestions, [
      {
        no: 5,
        questionId: Q.essay,
        typeLabel: 'Essay',
        materi: null,
        textPreview: textOf(Q.essay),
        state: 'pending',
        pointsEarned: 0,
        maxPoints: 20,
      },
      {
        no: 6,
        questionId: Q.caseStudy,
        typeLabel: 'Studi Kasus',
        materi: null,
        textPreview: CASE_PREVIEW,
        state: 'empty',
        pointsEarned: 0,
        maxPoints: 20,
      },
    ]);
    assert.equal(d.materialAvailable, false);
    assert.equal(d.generatedAt, FIXTURE_LOADED_AT);
  });

  test('computeParticipantDetail: Andi tanpa kesalahan (tidak dinilai ulang dengan kunci baru), essay sudah dinilai', () => {
    const d = computeParticipantDetail(ds, NO_FILTERS, USER_IDS.andi);
    assert.ok(d);
    assert.deepEqual(d.wrongQuestions, []);
    assert.deepEqual(
      d.essayQuestions.map((e) => [e.no, e.state, e.pointsEarned, e.maxPoints]),
      [
        [5, 'graded', 16, 20],
        [6, 'graded', 10, 20],
      ]
    );
  });

  test('computeParticipantDetail: Indra (format lama) — soal terhapus diabaikan, essay kosong', () => {
    const d = computeParticipantDetail(ds, NO_FILTERS, USER_IDS.indra);
    assert.ok(d);
    assert.deepEqual(
      d.wrongQuestions.map((w) => [w.no, w.status, w.answerLabel]),
      [[3, 'wrong', 'Benar']]
    );
    assert.deepEqual(
      d.essayQuestions.map((e) => [e.no, e.state]),
      [
        [5, 'empty'],
        [6, 'empty'],
      ]
    );
  });

  test('computeParticipantDetail: null bila peserta tidak ada / paket lain / tersaring filter', () => {
    assert.equal(computeParticipantDetail(ds, NO_FILTERS, 'u-tidak-ada'), null);
    assert.equal(computeParticipantDetail(ds, NO_FILTERS, USER_IDS.joko), null, 'peserta paket lain');
    assert.equal(computeParticipantDetail(ds, NO_FILTERS, USER_IDS.adminAuthor), null);
    assert.equal(computeParticipantDetail(ds, OCTOBER_FILTERS, USER_IDS.fajar), null);
    assert.equal(computeParticipantDetail(ds, OCTOBER_FILTERS, USER_IDS.hana), null);
    assert.equal(computeParticipantDetail(ds, filters({ company: 'SEC' }), USER_IDS.andi), null);
  });
});

// ═══════════════════════════════════════════════════════════════
// DETAIL KESALAHAN
// ═══════════════════════════════════════════════════════════════

describe('computeErrorRows', () => {
  const ds = buildFixtureDataset();

  test('semua jawaban objektif tidak benar, urut nama lalu no soal', () => {
    const r = computeErrorRows(ds, NO_FILTERS);
    assert.equal(r.total, 16);
    assert.equal(r.truncated, false);
    assert.deepEqual(
      r.rows.map((x) => [x.name.split(' ')[0], x.no, x.status, x.answerLabel]),
      [
        ['Budi', 1, 'wrong', 'A'],
        ['Budi', 3, 'wrong', 'Benar'],
        ['Citra', 2, 'wrong', 'A'],
        ['Citra', 4, 'wrong', 'D'],
        ['Dewi', 2, 'wrong', 'Lainnya'],
        ['Dewi', 4, 'wrong', 'B'],
        ['Eko', 1, 'wrong', 'B'],
        ['Eko', 3, 'empty', null],
        ['Eko', 4, 'wrong', 'C'],
        ['Eko', 7, 'wrong', 'E'],
        ['Gilang', 1, 'empty', null],
        ['Gilang', 3, 'wrong', 'Benar'],
        ['Gilang', 4, 'wrong', 'B'],
        ['Hana', 2, 'wrong', 'D'],
        ['Hana', 4, 'empty', null],
        ['Indra', 3, 'wrong', 'Benar'],
      ]
    );
    assert.deepEqual(r.rows[4], {
      userId: USER_IDS.dewi,
      attemptId: ATTEMPT_IDS.dewi,
      name: 'Dewi Anggraini',
      company: 'ALL',
      department: 'Kredit',
      no: 2,
      questionId: Q.mc4,
      materi: null,
      textPreview: textOf(Q.mc4),
      status: 'wrong',
      answerLabel: 'Lainnya',
      answerText: 'opt-e',
      correctLabel: 'B',
      correctText: 'KTP elektronik',
      pointsEarned: 0,
      maxPoints: 10,
      completedAt: '2026-10-02T02:00:00.000Z',
    });
    assert.deepEqual(r.rows[10], {
      userId: USER_IDS.gilang,
      attemptId: ATTEMPT_IDS.gilang,
      name: 'Gilang Ramadhan',
      company: null,
      department: 'Treasury',
      no: 1,
      questionId: Q.mc5,
      materi: null,
      textPreview: textOf(Q.mc5),
      status: 'empty',
      answerLabel: null,
      answerText: null,
      correctLabel: 'C',
      correctText: 'Capacity',
      pointsEarned: 0,
      maxPoints: 10,
      completedAt: '2026-10-02T07:00:00.000Z',
    });
    assert.equal(
      r.rows.some((x) => x.questionId === Q.deleted),
      false
    );
  });

  test('batas baris: clamp [1, max], total tetap semua, truncated', () => {
    const five = computeErrorRows(ds, NO_FILTERS, 5);
    assert.deepEqual([five.total, five.rows.length, five.truncated], [16, 5, true]);
    assert.deepEqual(
      five.rows.map((x) => `${x.name.split(' ')[0]}#${x.no}`),
      ['Budi#1', 'Budi#3', 'Citra#2', 'Citra#4', 'Dewi#2']
    );
    assert.deepEqual([computeErrorRows(ds, NO_FILTERS, 0).rows.length, computeErrorRows(ds, NO_FILTERS, 0).truncated], [1, true]);
    assert.equal(computeErrorRows(ds, NO_FILTERS, -3).rows.length, 1);
    assert.equal(computeErrorRows(ds, NO_FILTERS, 2.7).rows.length, 2);
    assert.equal(computeErrorRows(ds, NO_FILTERS, Number.NaN).rows.length, 16);
    const huge = computeErrorRows(ds, NO_FILTERS, 10 ** 9);
    assert.deepEqual([huge.rows.length, huge.truncated], [16, false]);
  });

  test('filter berlaku', () => {
    const sec = computeErrorRows(ds, filters({ company: 'SEC' }));
    assert.deepEqual(
      sec.rows.map((x) => `${x.name.split(' ')[0]}#${x.no}`),
      ['Citra#2', 'Citra#4', 'Hana#2', 'Hana#4']
    );
  });

  test('default & maksimum batas dari kontrak', () => {
    const many = syntheticDataset(0, ERROR_ROWS_LIMIT_MAX + 1);
    const byDefault = computeErrorRows(many, NO_FILTERS);
    assert.deepEqual(
      [byDefault.total, byDefault.rows.length, byDefault.truncated],
      [ERROR_ROWS_LIMIT_MAX + 1, ERROR_ROWS_LIMIT_DEFAULT, true]
    );
    const capped = computeErrorRows(many, NO_FILTERS, ERROR_ROWS_LIMIT_MAX * 10);
    assert.deepEqual([capped.rows.length, capped.truncated], [ERROR_ROWS_LIMIT_MAX, true]);
  });
});

// ═══════════════════════════════════════════════════════════════
// DETAIL SOAL
// ═══════════════════════════════════════════════════════════════

describe('computeQuestionDetail', () => {
  const ds = buildFixtureDataset();
  const summary = computeSummary(ds, NO_FILTERS, CAPS);

  test('soal kunci berubah: info soal, stat = ringkasan, peserta tidak benar (salah dulu)', () => {
    const d = computeQuestionDetail(ds, NO_FILTERS, Q.keyChanged);
    assert.ok(d);
    assert.deepEqual(d.exam, { id: EXAM_IDS.main, title: MAIN_TITLE, scope: 'BANK' });
    assert.deepEqual(d.filters, NO_FILTERS);
    assert.deepEqual(d.question, {
      no: 4,
      questionId: Q.keyChanged,
      type: 'multiple_choice',
      typeLabel: 'Pilihan Ganda',
      questionText: textOf(Q.keyChanged),
      caseStudyStory: '',
      materi: null,
      points: 10,
      options: [
        { optionId: 'opt-a', label: 'A', text: 'Direksi bank', isCorrect: false },
        { optionId: 'opt-b', label: 'B', text: 'Dewan Komisaris', isCorrect: false },
        { optionId: 'opt-c', label: 'C', text: 'Kepala cabang', isCorrect: false },
        { optionId: 'opt-d', label: 'D', text: 'Otoritas Jasa Keuangan', isCorrect: true },
      ],
      correctAnswer: { optionId: 'opt-d', label: 'D', text: 'Otoritas Jasa Keuangan' },
      sampleAnswer: '',
      explanation: 'Kunci diperbarui setelah ujian: BMPK mengacu pada peraturan OJK.',
    });
    assert.deepEqual(d.stat, statOf(summary.questions, Q.keyChanged));
    assert.deepEqual(d.distribution, summary.distributions[Q.keyChanged]);
    assert.deepEqual(
      d.nonCorrectParticipants.map((r) => [r.name.split(' ')[0], r.status, r.answerLabel]),
      [
        ['Citra', 'wrong', 'D'],
        ['Dewi', 'wrong', 'B'],
        ['Eko', 'wrong', 'C'],
        ['Gilang', 'wrong', 'B'],
        ['Hana', 'empty', null],
      ]
    );
    assert.deepEqual(d.nonCorrectParticipants[4], {
      userId: USER_IDS.hana,
      attemptId: ATTEMPT_IDS.hana,
      name: 'Hana Pertiwi',
      company: 'SEC',
      department: 'Akademik',
      status: 'empty',
      answerOptionId: null,
      answerLabel: null,
      answerText: null,
      correctLabel: 'D',
      correctText: 'Otoritas Jasa Keuangan',
      pointsEarned: 0,
      maxPoints: 10,
      completedAt: 'Invalid Date',
    });
    assert.equal(d.truncated, false);
    assert.equal(d.materialAvailable, false);
    assert.equal(d.generatedAt, FIXTURE_LOADED_AT);
    // jumlah baris = salah + kosong pada stat
    assert.equal(d.nonCorrectParticipants.length, (d.stat.wrong ?? 0) + d.stat.empty);
  });

  test('opsi tidak dikenal & Benar/Salah', () => {
    const mc4 = computeQuestionDetail(ds, NO_FILTERS, Q.mc4);
    assert.ok(mc4);
    const dewi = mc4.nonCorrectParticipants.find((r) => r.userId === USER_IDS.dewi);
    assert.ok(dewi);
    assert.deepEqual([dewi.answerOptionId, dewi.answerLabel, dewi.answerText], ['opt-e', 'Lainnya', 'opt-e']);
    assert.deepEqual(
      mc4.nonCorrectParticipants.map((r) => r.name.split(' ')[0]),
      ['Citra', 'Dewi', 'Hana']
    );

    const tf = computeQuestionDetail(ds, NO_FILTERS, Q.tf);
    assert.ok(tf);
    assert.deepEqual(tf.question.options, [
      { optionId: 'true', label: 'Benar', text: 'Benar', isCorrect: false },
      { optionId: 'false', label: 'Salah', text: 'Salah', isCorrect: true },
    ]);
    assert.deepEqual(tf.question.correctAnswer, { optionId: 'false', label: 'Salah', text: 'Salah' });
    assert.deepEqual(
      tf.nonCorrectParticipants.map((r) => [r.name.split(' ')[0], r.status, r.answerLabel]),
      [
        ['Budi', 'wrong', 'Benar'],
        ['Gilang', 'wrong', 'Benar'],
        ['Indra', 'wrong', 'Benar'],
        ['Eko', 'empty', null],
      ]
    );
  });

  test('essay & studi kasus: tanpa distribusi / benar-salah, rubrik & narasi lengkap', () => {
    const essay = computeQuestionDetail(ds, NO_FILTERS, Q.essay);
    assert.ok(essay);
    assert.deepEqual(essay.distribution, []);
    assert.deepEqual(essay.nonCorrectParticipants, []);
    assert.deepEqual(essay.question.options, []);
    assert.equal(essay.question.correctAnswer, null);
    assert.equal(essay.question.sampleAnswer, String(questionRows.find((q) => q.id === Q.essay)?.sample_answer));
    assert.deepEqual(essay.stat, statOf(summary.questions, Q.essay));

    const kasus = computeQuestionDetail(ds, NO_FILTERS, Q.caseStudy);
    assert.ok(kasus);
    assert.equal(kasus.question.questionText, CASE_STUDY_QUESTION_TEXT, 'teks penuh, bukan preview');
    assert.ok(kasus.question.caseStudyStory?.startsWith('PT Maju Jaya'));
    assert.equal(kasus.stat.textPreview, CASE_PREVIEW);
  });

  test('filter berlaku di detail soal', () => {
    const d = computeQuestionDetail(ds, OCTOBER_FILTERS, Q.mc5);
    assert.ok(d);
    assert.deepEqual([d.stat.total, d.stat.correct, d.stat.wrong, d.stat.empty], [6, 3, 2, 1]);
    assert.deepEqual(
      d.nonCorrectParticipants.map((r) => [r.name.split(' ')[0], r.status]),
      [
        ['Budi', 'wrong'],
        ['Eko', 'wrong'],
        ['Gilang', 'empty'],
      ]
    );
    assert.deepEqual(d.filters, OCTOBER_FILTERS);
  });

  test('null untuk soal tidak dikenal, soal terhapus, dan soal paket lain (IDOR)', () => {
    assert.equal(computeQuestionDetail(ds, NO_FILTERS, 'tidak-ada'), null);
    assert.equal(computeQuestionDetail(ds, NO_FILTERS, Q.deleted), null);
    assert.equal(computeQuestionDetail(ds, NO_FILTERS, QUESTION_IDS.other.mc5), null);
  });

  test('baris peserta tidak benar dipotong di batas kontrak', () => {
    const big = syntheticDataset(0, QUESTION_NON_CORRECT_ROWS_MAX + 1);
    const d = computeQuestionDetail(big, NO_FILTERS, 'q-syn');
    assert.ok(d);
    assert.equal(d.truncated, true);
    assert.equal(d.nonCorrectParticipants.length, QUESTION_NON_CORRECT_ROWS_MAX);
    assert.equal(d.stat.wrong, QUESTION_NON_CORRECT_ROWS_MAX + 1);
  });
});

// ═══════════════════════════════════════════════════════════════
// INDIKASI KESULITAN
// ═══════════════════════════════════════════════════════════════

describe('indikasi tingkat kesulitan', () => {
  test('difficultyFor: batas 80 / 79.99 / 50 / 49.99', () => {
    assert.equal(difficultyFor(100), 'Mudah');
    assert.equal(difficultyFor(80), 'Mudah');
    assert.equal(difficultyFor(79.99), 'Sedang');
    assert.equal(difficultyFor(50), 'Sedang');
    assert.equal(difficultyFor(49.99), 'Sulit');
    assert.equal(difficultyFor(0), 'Sulit');
    assert.equal(difficultyFor(null), null);
  });

  test('pctCorrect dibulatkan 2 desimal DULU baru diklasifikasi', () => {
    const cases: Array<[number, number, number, string]> = [
      [4, 5, 80, 'Mudah'],
      [1067, 1334, 79.99, 'Sedang'], // 79,985007…%
      [3203, 4004, 80, 'Mudah'], // 79,995004…% → 80
      [1, 2, 50, 'Sedang'],
      [1667, 3335, 49.99, 'Sulit'], // 49,985007…%
    ];
    for (const [correct, total, pctCorrect, label] of cases) {
      const s = computeSummary(syntheticDataset(correct, total), NO_FILTERS, CAPS);
      const q = s.questions[0];
      assert.equal(q.total, total);
      assert.equal(q.pctCorrect, pctCorrect, `${correct}/${total}`);
      assert.equal(q.difficulty, label, `${correct}/${total}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// ANALISIS MATERI
// ═══════════════════════════════════════════════════════════════

describe('analisis materi (kolom materi tersedia)', () => {
  const ds = buildFixtureDataset(EXAM_IDS.materi);
  const s = computeSummary(ds, NO_FILTERS, CAPS);

  test('materi terdeteksi per soal (kandidat kolom, nilai kosong dilewati)', () => {
    assert.equal(s.materialAvailable, true);
    assert.deepEqual(
      s.questions.map((q) => q.materi),
      ['Kredit', 'Kredit', 'Kepatuhan', 'Etika', null, 'Layanan', 'Layanan']
    );
  });

  test('pengelompokan & urutan: % benar terendah dulu, null terakhir, seri → nama', () => {
    assert.deepEqual(s.materials, [
      { materi: '(Tanpa materi)', questionCount: 1, objectiveQuestionCount: 1, correct: 1, wrong: 3, empty: 0, total: 4, pctCorrect: 25 },
      { materi: 'Kredit', questionCount: 2, objectiveQuestionCount: 2, correct: 5, wrong: 2, empty: 1, total: 8, pctCorrect: 62.5 },
      { materi: 'Kepatuhan', questionCount: 1, objectiveQuestionCount: 1, correct: 3, wrong: 1, empty: 0, total: 4, pctCorrect: 75 },
      { materi: 'Layanan', questionCount: 2, objectiveQuestionCount: 2, correct: 6, wrong: 2, empty: 0, total: 8, pctCorrect: 75 },
      { materi: 'Etika', questionCount: 1, objectiveQuestionCount: 0, correct: 0, wrong: 0, empty: 0, total: 0, pctCorrect: null },
    ]);
  });

  test('materi ikut di detail peserta & baris kesalahan', () => {
    const errors = computeErrorRows(ds, NO_FILTERS);
    assert.ok(errors.rows.length > 0);
    for (const row of errors.rows) {
      const q = ds.questions.find((x) => x.id === row.questionId);
      assert.equal(row.materi, q?.materi ?? null);
    }
    const d = computeParticipantDetail(ds, NO_FILTERS, USER_IDS.andi);
    assert.ok(d);
    assert.equal(d.materialAvailable, true);
    assert.deepEqual(
      d.wrongQuestions.map((w) => [w.questionId, w.materi]),
      [
        ['qm-05', null],
        ['qm-07', 'Layanan'],
      ]
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// ISOLASI PAKET (IDOR)
// ═══════════════════════════════════════════════════════════════

describe('isolasi antar-paket', () => {
  test('dataset paket lain terpisah; peserta yang sama memakai attempt paketnya sendiri', () => {
    const ds2 = buildFixtureDataset(EXAM_IDS.other);
    assert.deepEqual(
      ds2.questions.map((q) => q.id),
      [QUESTION_IDS.other.mc5, QUESTION_IDS.other.tf, QUESTION_IDS.other.essay]
    );
    const s2 = computeSummary(ds2, NO_FILTERS, CAPS);
    assert.deepEqual([s2.summary.totalParticipants, s2.summary.totalAttempts, s2.exam.scope], [2, 2, 'SEC']);
    assert.deepEqual(s2.distributions[QUESTION_IDS.other.mc5].find((r) => r.isCorrect)?.label, 'E');
    const citra = computeParticipantDetail(ds2, NO_FILTERS, USER_IDS.citra);
    assert.equal(citra?.participant.attemptId, ATTEMPT_IDS.otherCitra);
    assert.equal(computeQuestionDetail(ds2, NO_FILTERS, Q.mc5), null);
  });

  test('buildDataset membuang baris milik paket lain walau ikut terkirim', () => {
    const mixed = buildDataset({ examRow: examRows[1], questionRows, attemptRows, userRows: [], loadedAt: FIXTURE_LOADED_AT });
    const clean = buildFixtureDataset(EXAM_IDS.other);
    assert.deepEqual(
      mixed.questions.map((q) => q.id),
      clean.questions.map((q) => q.id)
    );
    assert.deepEqual(
      mixed.attempts.map((a) => a.id).sort(),
      clean.attempts.map((a) => a.id).sort()
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// DATA ASLI (snapshot exam_attempts.csv) — invariant saja
// ═══════════════════════════════════════════════════════════════

const CSV_PATH = fileURLToPath(new URL('../../exam_attempts.csv', import.meta.url));

describe('data asli exam_attempts.csv (invariant, tanpa mencetak data pribadi)', () => {
  test('invariant ringkasan & per soal', { skip: existsSync(CSV_PATH) ? false : 'exam_attempts.csv tidak ada' }, () => {
    const rows = parse(readFileSync(CSV_PATH, 'utf8'), { columns: true, skip_empty_lines: true }) as Array<
      Record<string, string>
    >;
    assert.ok(rows.length > 0, 'CSV berisi baris');
    const examIds = [...new Set(rows.map((r) => r.exam_id))];
    assert.equal(examIds.length, 1, 'snapshot berisi satu paket');
    const examId = examIds[0];

    const answersOf = rows.map((r): Record<string, any> => {
      try {
        const v = JSON.parse(r.answers);
        return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
      } catch {
        return {};
      }
    });

    // soal MC sintetis: opt-a..opt-d, kunci = jawaban mana pun yang isCorrect, selain itu opt-a
    const keyByQuestion = new Map<string, string>();
    for (const answers of answersOf) {
      for (const [qid, ans] of Object.entries(answers)) {
        if (!keyByQuestion.has(qid)) keyByQuestion.set(qid, '');
        if (ans && ans.isCorrect === true && !keyByQuestion.get(qid)) {
          keyByQuestion.set(qid, String(ans.selectedAnswerId ?? ''));
        }
      }
    }
    const csvQuestionRows = [...keyByQuestion].map(([id, key]) => ({
      id,
      exam_id: examId,
      type: 'multiple_choice',
      question_text: 'Soal sintetis',
      options: ['a', 'b', 'c', 'd'].map((l) => ({ id: `opt-${l}`, text: `Opsi ${l.toUpperCase()}` })),
      correct_answer_id: key || 'opt-a',
      points: 10,
    }));

    const ds = buildDataset({
      examRow: { id: examId, title: 'Snapshot', scope: 'BANK' },
      questionRows: csvQuestionRows,
      attemptRows: rows,
      userRows: [],
      loadedAt: FIXTURE_LOADED_AT,
    });
    const s = computeSummary(ds, NO_FILTERS, CAPS);

    assert.equal(s.summary.totalAttempts, rows.length);
    assert.equal(s.summary.totalParticipants, new Set(rows.map((r) => r.user_id)).size);
    assert.equal(s.summary.questionCount, keyByQuestion.size);
    assert.equal(s.summary.passedCount + s.summary.failedCount, s.summary.totalParticipants);
    assert.equal(
      s.scoreDistribution.reduce((a, b) => a + b.count, 0),
      s.summary.totalParticipants
    );

    // attempt pertama dihitung ulang secara independen
    const order = rows
      .map((r, i) => ({ r, i, ms: Date.parse(r.completed_at) }))
      .sort((x, y) => {
        const a = Number.isFinite(x.ms) ? x.ms : Infinity;
        const b = Number.isFinite(y.ms) ? y.ms : Infinity;
        if (a !== b) return a < b ? -1 : 1;
        return x.r.id < y.r.id ? -1 : x.r.id > y.r.id ? 1 : 0;
      });
    const seen = new Set<string>();
    const firstIdx: number[] = [];
    for (const o of order) {
      const key = `${o.r.user_id}-${o.r.exam_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      firstIdx.push(o.i);
    }
    assert.equal(firstIdx.length, s.summary.totalParticipants);

    let wrongPlusEmpty = 0;
    for (const stat of s.questions) {
      const label = `soal no ${stat.no}`;
      assert.equal((stat.correct ?? 0) + (stat.wrong ?? 0) + stat.empty, stat.total, label);
      assert.ok(stat.total <= s.summary.totalParticipants, label);
      const dist = s.distributions[stat.questionId];
      assert.ok(dist, label);
      assert.equal(
        dist.reduce((a, r) => a + r.count, 0),
        stat.total,
        label
      );
      if (stat.total > 0) {
        const pctSum = dist.reduce((a, r) => a + (r.pct ?? 0), 0);
        assert.ok(Math.abs(pctSum - 100) < 0.1, label);
      }
      const expectedCorrect = firstIdx.filter((i) => answersOf[i][stat.questionId]?.isCorrect === true).length;
      assert.equal(stat.correct, expectedCorrect, label);
      wrongPlusEmpty += (stat.wrong ?? 0) + stat.empty;
    }

    const participants = computeParticipantRows(ds, NO_FILTERS);
    assert.equal(participants.length, s.summary.totalParticipants);
    assert.equal(
      participants.reduce((a, r) => a + r.correct, 0),
      s.questions.reduce((a, q) => a + (q.correct ?? 0), 0)
    );
    assert.equal(computeErrorRows(ds, NO_FILTERS, ERROR_ROWS_LIMIT_MAX).total, wrongPlusEmpty);
  });
});
