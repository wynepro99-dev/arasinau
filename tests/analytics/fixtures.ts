/**
 * Fixture SINTETIS Exam Analytics dalam bentuk baris mentah Supabase (snake_case),
 * persis seperti yang dikembalikan tabel exam_packages / questions / exam_attempts / users.
 * Tidak ada data asli. Dipakai ulang oleh test compute, router, dan export.
 *
 * ── PAKET ─────────────────────────────────────────────────────────────────────────
 *  exam-ana-1      BANK, author 'Rina Kusuma', passing 70, jadwal 1 Sep–31 Okt 2026 (paket utama)
 *  exam-ana-2      SEC,  author 'Yoga Firmansyah' (tidak ada di users), passing 60 (untuk test IDOR)
 *  exam-ana-materi BANK, author 'Rina Kusuma', soal punya kolom `materi`/`topik` (analisis materi aktif)
 *
 * ── SOAL exam-ana-1 (urutan kanonik = sort id) ────────────────────────────────────
 *  No 1 q-ana1-01  MC 5 opsi (A–E), kunci opt-c (C), 10 poin
 *  No 2 q-ana1-02  MC 4 opsi (soal lama), kunci opt-b (B); satu jawaban 'opt-e' → "Lainnya"
 *  No 3 q-ana1-03  Benar/Salah, options berupa STRING JSON, kunci 'false' (Salah)
 *  No 4 q-ana1-04  MC 4 opsi, kunci SEKARANG opt-d; saat ujian kunci opt-a → isCorrect tersimpan
 *                  berbeda dari kunci sekarang (scoring mismatch = 5)
 *  No 5 q-ana1-05  Essay 20 poin (graded / pending / kosong / spasi saja / format lama)
 *  No 6 q-ana1-06  Studi kasus 20 poin, teks panjang multi-baris (preview dipotong)
 *  No 7 q-ana1-07  MC 5 opsi, kunci opt-a, dibuat 2026-09-20 → tidak disajikan ke attempt September
 *  —    q-ana1-del soal yang SUDAH DIHAPUS: tidak ada di questions, hanya di answers attempt Indra
 *
 * ── PESERTA & ATTEMPT exam-ana-1 ──────────────────────────────────────────────────
 *  u-p01 Andi Saputra    BANK  att-ana1-01  01 Okt 02:00Z  nilai 84 LULUS; user_department ' Kredit ' (spasi)
 *  u-p02 Budi Hartono    BANK  att-ana1-02  01 Okt 03:00Z  nilai 33 MENUNGGU PENILAIAN
 *  u-p03 Citra Lestari   SEC   att-ana1-03  01 Okt 04:00Z  nilai 33 MENUNGGU PENILAIAN; answers STRING JSON
 *  u-p04 Dewi Anggraini  ALL   att-ana1-04  02 Okt 02:00Z  nilai '47' (string) TIDAK LULUS
 *  u-p05 Eko Prasetyo    BANK  att-ana1-05  01 Okt 05:00Z  nilai 11 MENUNGGU PENILAIAN (attempt pertama)
 *                              att-ana1-06  03 Okt 05:00Z  nilai 94 → PENGULANGAN, diabaikan
 *  u-p06 Fajar Nugraha   BANK  att-ana1-07  10 Sep 02:00Z  nilai 79 LULUS (passed 'true' string, tanpa soal no 7)
 *                              att-ana1-08  02 Okt 06:00Z  nilai 56 → pengulangan; dengan filter Oktober Fajar
 *                                                          hanya muncul lewat attempt ini (Total Attempt saja)
 *  u-p07 Gilang Ramadhan  —    att-ana1-09  02 Okt 07:00Z  nilai 22 MENUNGGU; user TIDAK ADA di tabel users
 *  u-p08 Hana Pertiwi    SEC   att-ana1-10  completed_at 'Invalid Date', user_name null, nilai 63 TIDAK LULUS
 *  u-p09 Indra Wijaya    null→BANK att-ana1-11 05 Sep 02:00Z nilai 33 TIDAK LULUS; answers format LAMA
 *                              (tanpa essayAnswer/aiFeedback) + jawaban soal q-ana1-del
 *
 * ── exam-ana-2 (SEC) ── q-ana2-01 MC kunci opt-e, q-ana2-02 B/S kunci 'true', q-ana2-03 essay
 *  att-ana2-01 u-p03 Citra (nilai 75 LULUS), att-ana2-02 u-p10 Joko Susilo SEC (nilai 0, menunggu)
 *
 * ── exam-ana-materi ── qm-01..qm-07, attempt att-mat-01..04 (u-p01, u-p02, u-p05, u-p09)
 *
 * ── STAF (bukan peserta) ──────────────────────────────────────────────────────────
 *  u-admin-rina  'Rina Kusuma'    admin BANK  → penulis exam-ana-1 & exam-ana-materi
 *  u-admin-dimas 'Dimas Pratama'  admin BANK  → bukan penulis paket mana pun
 *  u-admin-taka  'Taka Hiroshi'   admin BANK  → super admin (nama mengandung "taka")
 *  u-super-wulan 'Wulan Maharani' super_admin BANK → super admin lewat role DB (nama TANPA "taka")
 *  u-egi-sari    'Sari Wulandari' egi   SEC
 *  u-egi-bayu    'Bayu Nugroho'   egi   BANK  → password null (login memakai default '123456')
 *  Karyawan untuk test 403: u-p01 (Andi).  Password tiap user: FIXTURE_PASSWORDS.
 */

import { buildDataset } from '../../server/analytics/compute';
import type { ExamDataset } from '../../server/analytics/types';
import type { AnalyticsSummary, AppliedFilters } from '../../src/lib/analytics/contract';

// ═══════════════════════════════════════════════════════════════
// TIPE BARIS MENTAH
// ═══════════════════════════════════════════════════════════════

export interface RawUserRow {
  id: string;
  name: string;
  email: string;
  password: string | null;
  /** Nilai mentah kolom users.role ('super_admin' = super admin, lihat normalizeUserRole). */
  role: 'admin' | 'karyawan' | 'egi' | 'super_admin';
  department: string | null;
  avatar: string | null;
  company: string | null;
  created_at: string;
}

export interface RawExamRow {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  duration_minutes: number;
  passing_score: number;
  created_at: string;
  status: string;
  author_name: string;
  scope: string;
  start_time: string | null;
  end_time: string | null;
}

export interface RawQuestionRow {
  id: string;
  exam_id: string;
  type: string;
  question_text: string;
  /** JSONB: array opsi, kadang datang sebagai string JSON. */
  options: Array<{ id: string; text: string }> | string;
  correct_answer_id: string;
  explanation: string;
  points: number;
  scope: string;
  case_study_story: string;
  sample_answer: string;
  created_at: string;
  /** Kolom tambahan (mis. `materi`, `topik`) — hanya pada paket materi. */
  [extra: string]: unknown;
}

export type RawAnswer = Record<string, unknown>;

export interface RawAttemptRow {
  id: string;
  exam_id: string;
  user_id: string;
  user_name: string | null;
  user_department: string | null;
  exam_title: string;
  score: number | string;
  total_points_earned: number;
  total_max_points: number;
  passed: boolean | string;
  started_at: string;
  completed_at: string;
  duration_seconds_used: number;
  /** JSONB answers: objek, atau string JSON. */
  answers: Record<string, RawAnswer> | string;
}

// ═══════════════════════════════════════════════════════════════
// ID
// ═══════════════════════════════════════════════════════════════

export const FIXTURE_LOADED_AT = '2026-10-05T03:00:00.000Z';

export const EXAM_IDS = {
  main: 'exam-ana-1',
  other: 'exam-ana-2',
  materi: 'exam-ana-materi',
} as const;

export const USER_IDS = {
  adminAuthor: 'u-admin-rina',
  adminOther: 'u-admin-dimas',
  superAdmin: 'u-admin-taka',
  /** role DB 'super_admin', nama tidak mengandung "taka". */
  superAdminRole: 'u-super-wulan',
  egiSec: 'u-egi-sari',
  egiBank: 'u-egi-bayu',
  karyawan: 'u-p01',
  andi: 'u-p01',
  budi: 'u-p02',
  citra: 'u-p03',
  dewi: 'u-p04',
  eko: 'u-p05',
  fajar: 'u-p06',
  /** Tidak ada barisnya di tabel users. */
  gilang: 'u-p07',
  hana: 'u-p08',
  indra: 'u-p09',
  joko: 'u-p10',
} as const;

export const QUESTION_IDS = {
  main: {
    mc5: 'q-ana1-01',
    mc4: 'q-ana1-02',
    tf: 'q-ana1-03',
    keyChanged: 'q-ana1-04',
    essay: 'q-ana1-05',
    caseStudy: 'q-ana1-06',
    addedLater: 'q-ana1-07',
    /** Sudah dihapus (hanya muncul di answers attempt lama). */
    deleted: 'q-ana1-del',
  },
  other: { mc5: 'q-ana2-01', tf: 'q-ana2-02', essay: 'q-ana2-03' },
  materi: ['qm-01', 'qm-02', 'qm-03', 'qm-04', 'qm-05', 'qm-06', 'qm-07'],
} as const;

export const ATTEMPT_IDS = {
  andi: 'att-ana1-01',
  budi: 'att-ana1-02',
  citra: 'att-ana1-03',
  dewi: 'att-ana1-04',
  ekoFirst: 'att-ana1-05',
  ekoRetake: 'att-ana1-06',
  fajarFirst: 'att-ana1-07',
  fajarRetake: 'att-ana1-08',
  gilang: 'att-ana1-09',
  hana: 'att-ana1-10',
  indra: 'att-ana1-11',
  otherCitra: 'att-ana2-01',
  otherJoko: 'att-ana2-02',
  materi: ['att-mat-01', 'att-mat-02', 'att-mat-03', 'att-mat-04'],
} as const;

/** Password plaintext (sama seperti tabel users produksi). null → AuthModal memakai '123456'. */
export const FIXTURE_PASSWORDS: Record<string, string | null> = {
  'u-admin-rina': 'rina-2026',
  'u-admin-dimas': 'dimas-2026',
  'u-admin-taka': 'taka-2026',
  'u-super-wulan': 'wulan-2026',
  'u-egi-sari': 'sari-2026',
  'u-egi-bayu': null,
  'u-p01': 'andi-2026',
  'u-p02': 'budi-2026',
  'u-p03': 'citra-2026',
  'u-p04': 'dewi-2026',
  'u-p05': 'eko-2026',
  'u-p06': 'fajar-2026',
  'u-p08': 'hana-2026',
  'u-p09': 'indra-2026',
  'u-p10': 'joko-2026',
};

export const NO_FILTERS: AppliedFilters = { company: null, department: null, from: null, to: null };

/** Periode Oktober 2026 (UTC) — Fajar (attempt pertama September) keluar dari peserta. */
export const OCTOBER_FILTERS: AppliedFilters = {
  company: null,
  department: null,
  from: '2026-10-01T00:00:00.000Z',
  to: '2026-10-31T23:59:59.999Z',
};

/** Ringkasan exam-ana-1 tanpa filter (dihitung manual, diverifikasi di compute.test.ts). */
export const MAIN_EXAM_EXPECTED_SUMMARY: AnalyticsSummary = {
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
};

// ═══════════════════════════════════════════════════════════════
// PEMBANGUN JAWABAN (bentuk persis yang ditulis aplikasi)
// ═══════════════════════════════════════════════════════════════

/** Teks persis dari ExamTakingScreen. */
const PENDING = 'Menunggu penilaian manual dari Admin.';
const NOT_FILLED = 'Jawaban tidak diisi oleh peserta.';

/** MC / B-S format ExamTakingScreen. `isCorrect` = nilai TERSIMPAN (bisa beda dari kunci sekarang). */
function objective(questionId: string, selectedAnswerId: string, isCorrect: boolean, points = 10, isFlaggedDoubt = false): RawAnswer {
  return {
    questionId,
    selectedAnswerId,
    isCorrect,
    pointsEarned: isCorrect ? points : 0,
    isFlaggedDoubt,
    essayAnswer: '',
    aiFeedback: '',
  };
}

function essayPending(questionId: string, essayAnswer: string): RawAnswer {
  return { questionId, selectedAnswerId: '', isCorrect: false, pointsEarned: 0, isFlaggedDoubt: false, essayAnswer, aiFeedback: PENDING };
}

function essayEmpty(questionId: string, essayAnswer = ''): RawAnswer {
  return { questionId, selectedAnswerId: '', isCorrect: false, pointsEarned: 0, isFlaggedDoubt: false, essayAnswer, aiFeedback: NOT_FILLED };
}

/** Setelah handleSaveGrades (Rekap Nilai): isCorrect = poin >= round(maks × 0,55), feedback = catatan admin. */
function essayGraded(questionId: string, essayAnswer: string, points: number, maxPoints: number, note: string): RawAnswer {
  return {
    questionId,
    selectedAnswerId: '',
    isCorrect: points >= Math.round(maxPoints * 0.55),
    pointsEarned: points,
    isFlaggedDoubt: false,
    essayAnswer,
    aiFeedback: note,
  };
}

/** Format lama (data impor): tanpa key essayAnswer / aiFeedback. */
function legacy(questionId: string, selectedAnswerId: string, isCorrect: boolean, pointsEarned: number): RawAnswer {
  return { questionId, selectedAnswerId, isCorrect, pointsEarned, isFlaggedDoubt: false };
}

const opts = (...texts: string[]) => texts.map((text, i) => ({ id: `opt-${'abcde'[i]}`, text }));
const TF_OPTIONS = [
  { id: 'true', text: 'Benar' },
  { id: 'false', text: 'Salah' },
];

// ═══════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════

function user(id: string, name: string, role: RawUserRow['role'], company: string | null, department: string | null): RawUserRow {
  return {
    id,
    name,
    email: `${id}@example.com`,
    password: FIXTURE_PASSWORDS[id] ?? null,
    role,
    department,
    avatar: null,
    company,
    created_at: '2026-08-01T00:00:00.000Z',
  };
}

export const userRows: RawUserRow[] = [
  user('u-admin-rina', 'Rina Kusuma', 'admin', 'BANK', 'Learning & Development'),
  user('u-admin-dimas', 'Dimas Pratama', 'admin', 'BANK', 'Operasional'),
  user('u-admin-taka', 'Taka Hiroshi', 'admin', 'BANK', 'Direksi'),
  user('u-super-wulan', 'Wulan Maharani', 'super_admin', 'BANK', 'Direksi'),
  user('u-egi-sari', 'Sari Wulandari', 'egi', 'SEC', 'Audit Internal'),
  user('u-egi-bayu', 'Bayu Nugroho', 'egi', 'BANK', 'Audit Internal'),
  user('u-p01', 'Andi Saputra', 'karyawan', 'BANK', 'Kredit'),
  user('u-p02', 'Budi Hartono', 'karyawan', 'BANK', 'Operasional'),
  user('u-p03', 'Citra Lestari', 'karyawan', 'SEC', 'Akademik'),
  user('u-p04', 'Dewi Anggraini', 'karyawan', 'ALL', 'Kredit'),
  user('u-p05', 'Eko Prasetyo', 'karyawan', 'BANK', 'Operasional'),
  user('u-p06', 'Fajar Nugraha', 'karyawan', 'BANK', 'Kredit'),
  // u-p07 (Gilang Ramadhan) sengaja tidak ada: user sudah dihapus, attempt-nya masih ada
  user('u-p08', 'Hana Pertiwi', 'karyawan', 'SEC', 'Akademik'),
  user('u-p09', 'Indra Wijaya', 'karyawan', null, 'Operasional'),
  user('u-p10', 'Joko Susilo', 'karyawan', 'SEC', 'Akademik'),
];

// ═══════════════════════════════════════════════════════════════
// PAKET
// ═══════════════════════════════════════════════════════════════

export const examRows: RawExamRow[] = [
  {
    id: 'exam-ana-1',
    title: 'Ujian Kompetensi Analis Kredit Q3',
    description: 'Evaluasi pemahaman analisis kredit, kepatuhan, dan anti-fraud.',
    category: 'Perbankan',
    duration_minutes: 30,
    passing_score: 70,
    created_at: '2026-08-25T02:00:00.000Z',
    status: 'active',
    author_name: 'Rina Kusuma',
    scope: 'BANK',
    start_time: '2026-09-01T01:00:00.000Z',
    end_time: '2026-10-31T16:59:00.000Z',
  },
  {
    id: 'exam-ana-2',
    title: 'Tes Kompetensi Pengajar Matematika',
    description: 'Paket SEC untuk pengajar bimbel.',
    category: 'Akademik',
    duration_minutes: 20,
    passing_score: 60,
    created_at: '2026-09-01T02:00:00.000Z',
    status: 'active',
    author_name: 'Yoga Firmansyah',
    scope: 'SEC',
    start_time: null,
    end_time: null,
  },
  {
    id: 'exam-ana-materi',
    title: 'Kuis Layanan & Kepatuhan',
    description: 'Paket contoh dengan metadata materi per soal.',
    category: 'Perbankan',
    duration_minutes: 15,
    passing_score: 70,
    created_at: '2026-09-15T02:00:00.000Z',
    status: 'active',
    author_name: 'Rina Kusuma',
    scope: 'BANK',
    start_time: null,
    end_time: null,
  },
];

// ═══════════════════════════════════════════════════════════════
// SOAL (urutan baris sengaja diacak; urutan kanonik = sort id)
// ═══════════════════════════════════════════════════════════════

const Q = QUESTION_IDS.main;
const Q2 = QUESTION_IDS.other;

function question(row: Partial<RawQuestionRow> & Pick<RawQuestionRow, 'id' | 'exam_id' | 'type' | 'question_text'>): RawQuestionRow {
  return {
    options: [],
    correct_answer_id: 'essay',
    explanation: '',
    points: 10,
    scope: 'BANK',
    case_study_story: '',
    sample_answer: '',
    created_at: '2026-08-25T02:10:00.000Z',
    ...row,
  };
}

export const CASE_STUDY_QUESTION_TEXT =
  'Berdasarkan kasus PT Maju Jaya di atas,\nanalisislah   risiko utama yang perlu dimitigasi sebelum menyetujui tambahan plafon.\n\n' +
  'Sebutkan pula dokumen pendukung yang wajib diminta dari debitur beserta alasan singkat untuk masing-masing dokumen.';

const mainQuestionRows: RawQuestionRow[] = [
  question({
    id: Q.keyChanged,
    exam_id: 'exam-ana-1',
    type: 'multiple_choice',
    question_text: 'Ketentuan Batas Maksimum Pemberian Kredit (BMPK) kepada pihak terkait ditetapkan oleh ...',
    options: opts('Direksi bank', 'Dewan Komisaris', 'Kepala cabang', 'Otoritas Jasa Keuangan'),
    correct_answer_id: 'opt-d',
    explanation: 'Kunci diperbarui setelah ujian: BMPK mengacu pada peraturan OJK.',
  }),
  question({
    id: Q.mc5,
    exam_id: 'exam-ana-1',
    type: 'multiple_choice',
    question_text: 'Prinsip 5C yang menilai kemampuan debitur membayar kembali pinjaman dari arus kas usahanya adalah ...',
    options: opts('Character', 'Capital', 'Capacity', 'Collateral', 'Condition of economy'),
    correct_answer_id: 'opt-c',
    explanation: 'Capacity menilai kemampuan membayar dari arus kas usaha.',
  }),
  question({
    id: Q.addedLater,
    exam_id: 'exam-ana-1',
    type: 'multiple_choice',
    question_text: 'Kanal resmi untuk melaporkan dugaan fraud oleh karyawan adalah ...',
    options: opts('Whistleblowing system', 'Grup chat divisi', 'Media sosial', 'Email pribadi atasan', 'Tidak perlu dilaporkan'),
    correct_answer_id: 'opt-a',
    explanation: 'Laporan fraud disampaikan melalui whistleblowing system resmi.',
    created_at: '2026-09-20T03:00:00.000Z',
  }),
  question({
    id: Q.tf,
    exam_id: 'exam-ana-1',
    type: 'true_false',
    question_text: 'Restrukturisasi kredit boleh dilakukan tanpa analisis ulang kemampuan bayar debitur.',
    options: JSON.stringify(TF_OPTIONS),
    correct_answer_id: 'false',
    explanation: 'Restrukturisasi wajib didahului analisis ulang kemampuan bayar.',
  }),
  question({
    id: Q.caseStudy,
    exam_id: 'exam-ana-1',
    type: 'case_study',
    question_text: CASE_STUDY_QUESTION_TEXT,
    points: 20,
    case_study_story:
      'PT Maju Jaya mengajukan tambahan plafon modal kerja Rp 2 miliar. Penjualan turun 15% dalam dua kuartal terakhir, sementara piutang dagang naik 30%.',
    sample_answer:
      'Risiko likuiditas dan kualitas piutang; minta laporan keuangan terbaru, aging piutang, proyeksi arus kas, dan rekening koran 6 bulan.',
  }),
  question({
    id: Q.mc4,
    exam_id: 'exam-ana-1',
    type: 'multiple_choice',
    question_text: 'Dokumen identitas utama yang wajib diverifikasi untuk calon debitur perorangan adalah ...',
    options: opts('Slip gaji', 'KTP elektronik', 'Rekening listrik', 'Kartu keluarga'),
    correct_answer_id: 'opt-b',
    explanation: 'KTP elektronik adalah identitas utama yang wajib diverifikasi.',
  }),
  question({
    id: Q.essay,
    exam_id: 'exam-ana-1',
    type: 'essay',
    question_text: 'Jelaskan langkah penanganan awal kredit bermasalah dengan kolektibilitas 3 (kurang lancar).',
    points: 20,
    sample_answer:
      'Identifikasi penyebab tunggakan, kunjungi debitur, analisis ulang arus kas, tawarkan opsi restrukturisasi, dokumentasikan seluruh langkah.',
  }),
];

const otherQuestionRows: RawQuestionRow[] = [
  question({
    id: Q2.mc5,
    exam_id: 'exam-ana-2',
    type: 'multiple_choice',
    question_text: 'Hasil dari 3/4 + 5/8 adalah ...',
    options: opts('1', '1 1/8', '1 1/4', '1 1/2', '1 3/8'),
    correct_answer_id: 'opt-e',
    scope: 'SEC',
    created_at: '2026-09-01T02:10:00.000Z',
  }),
  question({
    id: Q2.tf,
    exam_id: 'exam-ana-2',
    type: 'true_false',
    question_text: 'Bilangan prima terkecil adalah 2.',
    options: TF_OPTIONS.map((o) => ({ ...o })),
    correct_answer_id: 'true',
    scope: 'SEC',
    created_at: '2026-09-01T02:11:00.000Z',
  }),
  question({
    id: Q2.essay,
    exam_id: 'exam-ana-2',
    type: 'essay',
    question_text: 'Jelaskan strategi mengajarkan konsep pecahan senilai kepada siswa kelas 5 SD.',
    points: 20,
    scope: 'SEC',
    sample_answer: 'Gunakan benda konkret atau gambar, kaitkan dengan konteks sehari-hari, latihan bertahap.',
    created_at: '2026-09-01T02:12:00.000Z',
  }),
];

/** Paket materi: tabel questions "masa depan" yang punya kolom materi & topik. */
const materiQuestionRows: RawQuestionRow[] = [
  question({
    id: 'qm-01',
    exam_id: 'exam-ana-materi',
    type: 'multiple_choice',
    question_text: 'Agunan tambahan yang diserahkan debitur disebut ...',
    options: opts('Collateral', 'Capital', 'Covenant', 'Coupon'),
    correct_answer_id: 'opt-a',
    materi: 'Kredit',
    topik: null,
  }),
  question({
    id: 'qm-02',
    exam_id: 'exam-ana-materi',
    type: 'multiple_choice',
    question_text: 'Kredit dengan tunggakan lebih dari 180 hari termasuk kolektibilitas ...',
    options: opts('Lancar', 'Macet', 'Dalam perhatian khusus', 'Kurang lancar'),
    correct_answer_id: 'opt-b',
    materi: 'Kredit',
    topik: null,
  }),
  question({
    id: 'qm-03',
    exam_id: 'exam-ana-materi',
    type: 'true_false',
    question_text: 'Bank wajib menerapkan prinsip mengenal nasabah (KYC) saat pembukaan rekening.',
    options: TF_OPTIONS.map((o) => ({ ...o })),
    correct_answer_id: 'true',
    materi: 'Kepatuhan',
    topik: null,
  }),
  question({
    id: 'qm-04',
    exam_id: 'exam-ana-materi',
    type: 'essay',
    question_text: 'Jelaskan sikap yang tepat ketika menerima hadiah dari nasabah.',
    points: 20,
    materi: 'Etika',
    topik: null,
  }),
  question({
    id: 'qm-05',
    exam_id: 'exam-ana-materi',
    type: 'multiple_choice',
    question_text: 'Jam operasional layanan kas kantor cabang ditentukan oleh ...',
    options: opts('Nasabah', 'Satpam', 'Kebijakan bank', 'Teller'),
    correct_answer_id: 'opt-c',
    materi: null,
    topik: null,
  }),
  question({
    id: 'qm-06',
    exam_id: 'exam-ana-materi',
    type: 'multiple_choice',
    question_text: 'Langkah pertama saat menerima keluhan nasabah adalah ...',
    options: opts('Mendengarkan dengan empati', 'Membantah keluhan', 'Mengalihkan ke cabang lain', 'Menunda tanggapan'),
    correct_answer_id: 'opt-a',
    materi: null,
    topik: 'Layanan',
  }),
  question({
    id: 'qm-07',
    exam_id: 'exam-ana-materi',
    type: 'multiple_choice',
    question_text: 'Respons awal untuk keluhan melalui call center diberikan ...',
    options: opts('Sesegera mungkin sesuai SLA', 'Satu bulan kemudian', 'Tidak perlu direspons', 'Menunggu nasabah datang'),
    correct_answer_id: 'opt-a',
    materi: '   ',
    topik: 'Layanan',
  }),
];

export const questionRows: RawQuestionRow[] = [...mainQuestionRows, ...otherQuestionRows, ...materiQuestionRows];

// ═══════════════════════════════════════════════════════════════
// ATTEMPT (urutan baris sengaja diacak)
// ═══════════════════════════════════════════════════════════════

const TITLE_1 = 'Ujian Kompetensi Analis Kredit Q3';

const mainAttemptRows: RawAttemptRow[] = [
  {
    id: 'att-ana1-06',
    exam_id: 'exam-ana-1',
    user_id: 'u-p05',
    user_name: 'Eko Prasetyo',
    user_department: 'Operasional',
    exam_title: TITLE_1,
    score: 94,
    total_points_earned: 85,
    total_max_points: 90,
    passed: true,
    started_at: '2026-10-03T04:35:00.000Z',
    completed_at: '2026-10-03T05:00:00.000Z',
    duration_seconds_used: 1500,
    answers: {
      [Q.mc5]: objective(Q.mc5, 'opt-c', true),
      [Q.mc4]: objective(Q.mc4, 'opt-b', true),
      [Q.tf]: objective(Q.tf, 'false', true),
      [Q.keyChanged]: objective(Q.keyChanged, 'opt-a', true),
      [Q.essay]: essayGraded(Q.essay, 'Analisis penyebab, kunjungan, restrukturisasi, dan dokumentasi.', 18, 20, 'Baik sekali.'),
      [Q.caseStudy]: essayGraded(Q.caseStudy, 'Risiko likuiditas; minta aging piutang dan proyeksi arus kas.', 17, 20, 'Lengkap.'),
      [Q.addedLater]: objective(Q.addedLater, 'opt-a', true),
    },
  },
  {
    id: 'att-ana1-01',
    exam_id: 'exam-ana-1',
    user_id: 'u-p01',
    user_name: 'Andi Saputra',
    user_department: ' Kredit ',
    exam_title: TITLE_1,
    score: 84,
    total_points_earned: 76,
    total_max_points: 90,
    passed: true,
    started_at: '2026-10-01T01:35:00.000Z',
    completed_at: '2026-10-01T02:00:00.000Z',
    duration_seconds_used: 1500,
    answers: {
      [Q.mc5]: objective(Q.mc5, 'opt-c', true),
      [Q.mc4]: objective(Q.mc4, 'opt-b', true),
      [Q.tf]: objective(Q.tf, 'false', true),
      [Q.keyChanged]: objective(Q.keyChanged, 'opt-a', true),
      [Q.essay]: essayGraded(Q.essay, 'Identifikasi penyebab tunggakan, kunjungi debitur, susun ulang jadwal angsuran.', 16, 20, 'Jawaban cukup lengkap.'),
      [Q.caseStudy]: essayGraded(Q.caseStudy, 'Risiko penjualan turun; minta laporan keuangan.', 10, 20, 'Analisis risiko belum lengkap.'),
      [Q.addedLater]: objective(Q.addedLater, 'opt-a', true),
    },
  },
  {
    id: 'att-ana1-10',
    exam_id: 'exam-ana-1',
    user_id: 'u-p08',
    user_name: null,
    user_department: 'Akademik',
    exam_title: TITLE_1,
    score: 63,
    total_points_earned: 57,
    total_max_points: 90,
    passed: false,
    started_at: '2026-10-02T08:00:00.000Z',
    completed_at: 'Invalid Date',
    duration_seconds_used: 1650,
    answers: {
      [Q.mc5]: objective(Q.mc5, 'opt-c', true),
      [Q.mc4]: objective(Q.mc4, 'opt-d', false),
      [Q.tf]: objective(Q.tf, 'false', true),
      [Q.keyChanged]: objective(Q.keyChanged, '', false),
      [Q.essay]: essayGraded(Q.essay, 'Langkah lengkap: identifikasi, kunjungan, analisis ulang, restrukturisasi, dokumentasi.', 20, 20, 'Sangat baik.'),
      [Q.caseStudy]: essayGraded(Q.caseStudy, 'Perlu cek piutang.', 7, 20, ''),
      [Q.addedLater]: objective(Q.addedLater, 'opt-a', true),
    },
  },
  {
    id: 'att-ana1-03',
    exam_id: 'exam-ana-1',
    user_id: 'u-p03',
    user_name: 'Citra Lestari',
    user_department: 'Akademik',
    exam_title: TITLE_1,
    score: 33,
    total_points_earned: 30,
    total_max_points: 90,
    passed: false,
    started_at: '2026-10-01T03:32:00.000Z',
    completed_at: '2026-10-01T04:00:00.000Z',
    duration_seconds_used: 1680,
    // JSONB yang datang sebagai string
    answers: JSON.stringify({
      [Q.mc5]: objective(Q.mc5, 'opt-c', true),
      [Q.mc4]: objective(Q.mc4, 'opt-a', false, 10, true),
      [Q.tf]: objective(Q.tf, 'false', true),
      [Q.keyChanged]: objective(Q.keyChanged, 'opt-d', false),
      [Q.essay]: essayEmpty(Q.essay),
      [Q.caseStudy]: essayPending(Q.caseStudy, 'Piutang naik sehingga perlu cek aging piutang.'),
      [Q.addedLater]: objective(Q.addedLater, 'opt-a', true),
    }),
  },
  {
    id: 'att-ana1-08',
    exam_id: 'exam-ana-1',
    user_id: 'u-p06',
    user_name: 'Fajar Nugraha',
    user_department: 'Kredit',
    exam_title: TITLE_1,
    score: 56,
    total_points_earned: 50,
    total_max_points: 90,
    passed: false,
    started_at: '2026-10-02T05:35:00.000Z',
    completed_at: '2026-10-02T06:00:00.000Z',
    duration_seconds_used: 1500,
    answers: {
      [Q.mc5]: objective(Q.mc5, 'opt-c', true),
      [Q.mc4]: objective(Q.mc4, 'opt-b', true),
      [Q.tf]: objective(Q.tf, 'false', true),
      [Q.keyChanged]: objective(Q.keyChanged, 'opt-a', true),
      [Q.essay]: essayPending(Q.essay, 'Kunjungi debitur.'),
      [Q.caseStudy]: essayPending(Q.caseStudy, 'Minta proyeksi arus kas.'),
      [Q.addedLater]: objective(Q.addedLater, 'opt-a', true),
    },
  },
  {
    id: 'att-ana1-05',
    exam_id: 'exam-ana-1',
    user_id: 'u-p05',
    user_name: 'Eko Prasetyo',
    user_department: 'Operasional',
    exam_title: TITLE_1,
    score: 11,
    total_points_earned: 10,
    total_max_points: 90,
    passed: false,
    started_at: '2026-10-01T04:40:00.000Z',
    completed_at: '2026-10-01T05:00:00.000Z',
    duration_seconds_used: 1200,
    answers: {
      [Q.mc5]: objective(Q.mc5, 'opt-b', false),
      [Q.mc4]: objective(Q.mc4, 'opt-b', true),
      [Q.tf]: objective(Q.tf, '', false),
      [Q.keyChanged]: objective(Q.keyChanged, 'opt-c', false),
      [Q.essay]: essayPending(Q.essay, 'Segera menagih ke rumah debitur.'),
      [Q.caseStudy]: essayEmpty(Q.caseStudy),
      [Q.addedLater]: objective(Q.addedLater, 'opt-e', false),
    },
  },
  {
    id: 'att-ana1-11',
    exam_id: 'exam-ana-1',
    user_id: 'u-p09',
    user_name: 'Indra Wijaya',
    user_department: 'Operasional',
    exam_title: TITLE_1,
    score: 33,
    total_points_earned: 30,
    total_max_points: 90,
    passed: false,
    started_at: '2026-09-05T01:40:00.000Z',
    completed_at: '2026-09-05T02:00:00.000Z',
    duration_seconds_used: 1200,
    answers: {
      [Q.mc5]: legacy(Q.mc5, 'opt-c', true, 10),
      [Q.mc4]: legacy(Q.mc4, 'opt-b', true, 10),
      [Q.tf]: legacy(Q.tf, 'true', false, 0),
      [Q.keyChanged]: legacy(Q.keyChanged, 'opt-a', true, 10),
      [Q.essay]: legacy(Q.essay, '', false, 0),
      [Q.caseStudy]: legacy(Q.caseStudy, '', false, 0),
      [Q.deleted]: legacy(Q.deleted, 'opt-b', false, 0),
    },
  },
  {
    id: 'att-ana1-02',
    exam_id: 'exam-ana-1',
    user_id: 'u-p02',
    user_name: 'Budi Hartono',
    user_department: 'Operasional',
    exam_title: TITLE_1,
    score: 33,
    total_points_earned: 30,
    total_max_points: 90,
    passed: false,
    started_at: '2026-10-01T02:31:00.000Z',
    completed_at: '2026-10-01T03:00:00.000Z',
    duration_seconds_used: 1740,
    answers: {
      [Q.mc5]: objective(Q.mc5, 'opt-a', false),
      [Q.mc4]: objective(Q.mc4, 'opt-b', true),
      [Q.tf]: objective(Q.tf, 'true', false),
      [Q.keyChanged]: objective(Q.keyChanged, 'opt-a', true),
      [Q.essay]: essayPending(Q.essay, 'Menghubungi debitur dan menagih tunggakan.'),
      [Q.caseStudy]: essayPending(Q.caseStudy, 'Risiko utama adalah turunnya penjualan.'),
      [Q.addedLater]: objective(Q.addedLater, 'opt-a', true),
    },
  },
  {
    id: 'att-ana1-09',
    exam_id: 'exam-ana-1',
    user_id: 'u-p07',
    user_name: 'Gilang Ramadhan',
    user_department: 'Treasury',
    exam_title: TITLE_1,
    score: 22,
    total_points_earned: 20,
    total_max_points: 90,
    passed: false,
    started_at: '2026-10-02T06:30:00.000Z',
    completed_at: '2026-10-02T07:00:00.000Z',
    duration_seconds_used: 1800,
    answers: {
      [Q.mc5]: objective(Q.mc5, '', false),
      [Q.mc4]: objective(Q.mc4, 'opt-b', true),
      [Q.tf]: objective(Q.tf, 'true', false),
      [Q.keyChanged]: objective(Q.keyChanged, 'opt-b', false),
      [Q.essay]: essayEmpty(Q.essay, '   '),
      [Q.caseStudy]: essayPending(Q.caseStudy, 'Minta laporan keuangan terbaru.'),
      [Q.addedLater]: objective(Q.addedLater, 'opt-a', true),
    },
  },
  {
    id: 'att-ana1-07',
    exam_id: 'exam-ana-1',
    user_id: 'u-p06',
    user_name: 'Fajar Nugraha',
    user_department: 'Kredit',
    exam_title: TITLE_1,
    score: 79,
    total_points_earned: 63,
    total_max_points: 80,
    passed: 'true',
    started_at: '2026-09-10T01:30:00.000Z',
    completed_at: '2026-09-10T02:00:00.000Z',
    duration_seconds_used: 1800,
    // soal no 7 belum ada saat attempt ini
    answers: {
      [Q.mc5]: objective(Q.mc5, 'opt-c', true),
      [Q.mc4]: objective(Q.mc4, 'opt-b', true),
      [Q.tf]: objective(Q.tf, 'false', true),
      [Q.keyChanged]: objective(Q.keyChanged, 'opt-a', true),
      [Q.essay]: essayGraded(Q.essay, 'Tagih debitur.', 8, 20, 'Kurang lengkap.'),
      [Q.caseStudy]: essayGraded(Q.caseStudy, 'Risiko likuiditas; minta rekening koran dan aging piutang.', 15, 20, 'Baik.'),
    },
  },
  {
    id: 'att-ana1-04',
    exam_id: 'exam-ana-1',
    user_id: 'u-p04',
    user_name: 'Dewi Anggraini',
    user_department: 'Kredit',
    exam_title: TITLE_1,
    score: '47',
    total_points_earned: 42,
    total_max_points: 90,
    passed: false,
    started_at: '2026-10-02T01:30:00.000Z',
    completed_at: '2026-10-02T02:00:00.000Z',
    duration_seconds_used: 1800,
    answers: {
      [Q.mc5]: objective(Q.mc5, 'opt-c', true),
      [Q.mc4]: objective(Q.mc4, 'opt-e', false),
      [Q.tf]: objective(Q.tf, 'false', true),
      [Q.keyChanged]: objective(Q.keyChanged, 'opt-b', false),
      [Q.essay]: essayGraded(Q.essay, 'Lakukan restrukturisasi dan pantau pembayaran.', 12, 20, ''),
      [Q.caseStudy]: essayEmpty(Q.caseStudy),
      [Q.addedLater]: objective(Q.addedLater, 'opt-a', true),
    },
  },
];

const otherAttemptRows: RawAttemptRow[] = [
  {
    id: 'att-ana2-02',
    exam_id: 'exam-ana-2',
    user_id: 'u-p10',
    user_name: 'Joko Susilo',
    user_department: 'Akademik',
    exam_title: 'Tes Kompetensi Pengajar Matematika',
    score: 0,
    total_points_earned: 0,
    total_max_points: 40,
    passed: false,
    started_at: '2026-10-04T02:45:00.000Z',
    completed_at: '2026-10-04T03:00:00.000Z',
    duration_seconds_used: 900,
    answers: {
      [Q2.mc5]: objective(Q2.mc5, 'opt-b', false),
      [Q2.tf]: objective(Q2.tf, 'false', false),
      [Q2.essay]: essayPending(Q2.essay, 'Pakai gambar pizza.'),
    },
  },
  {
    id: 'att-ana2-01',
    exam_id: 'exam-ana-2',
    user_id: 'u-p03',
    user_name: 'Citra Lestari',
    user_department: 'Akademik',
    exam_title: 'Tes Kompetensi Pengajar Matematika',
    score: 75,
    total_points_earned: 30,
    total_max_points: 40,
    passed: true,
    started_at: '2026-10-04T01:45:00.000Z',
    completed_at: '2026-10-04T02:00:00.000Z',
    duration_seconds_used: 900,
    answers: {
      [Q2.mc5]: objective(Q2.mc5, 'opt-e', true),
      [Q2.tf]: objective(Q2.tf, 'true', true),
      [Q2.essay]: essayGraded(Q2.essay, 'Gunakan benda konkret lalu latihan bertahap.', 10, 20, 'Cukup.'),
    },
  },
];

function materiAttempt(
  id: string,
  userId: string,
  userName: string,
  department: string,
  completedAt: string,
  score: number,
  earned: number,
  passed: boolean,
  answers: Record<string, RawAnswer>
): RawAttemptRow {
  return {
    id,
    exam_id: 'exam-ana-materi',
    user_id: userId,
    user_name: userName,
    user_department: department,
    exam_title: 'Kuis Layanan & Kepatuhan',
    score,
    total_points_earned: earned,
    total_max_points: 80,
    passed,
    started_at: new Date(Date.parse(completedAt) - 600_000).toISOString(),
    completed_at: completedAt,
    duration_seconds_used: 600,
    answers,
  };
}

const materiAttemptRows: RawAttemptRow[] = [
  materiAttempt('att-mat-01', 'u-p01', 'Andi Saputra', 'Kredit', '2026-09-16T02:00:00.000Z', 69, 55, false, {
    'qm-01': objective('qm-01', 'opt-a', true),
    'qm-02': objective('qm-02', 'opt-b', true),
    'qm-03': objective('qm-03', 'true', true),
    'qm-04': essayGraded('qm-04', 'Menolak dengan sopan dan melapor ke atasan.', 15, 20, 'Baik.'),
    'qm-05': objective('qm-05', 'opt-a', false),
    'qm-06': objective('qm-06', 'opt-a', true),
    'qm-07': objective('qm-07', 'opt-b', false),
  }),
  materiAttempt('att-mat-02', 'u-p02', 'Budi Hartono', 'Operasional', '2026-09-16T03:00:00.000Z', 50, 40, false, {
    'qm-01': objective('qm-01', 'opt-a', true),
    'qm-02': objective('qm-02', 'opt-c', false),
    'qm-03': objective('qm-03', 'true', true),
    'qm-04': essayPending('qm-04', 'Menerima jika nilainya kecil.'),
    'qm-05': objective('qm-05', 'opt-b', false),
    'qm-06': objective('qm-06', 'opt-a', true),
    'qm-07': objective('qm-07', 'opt-a', true),
  }),
  materiAttempt('att-mat-03', 'u-p05', 'Eko Prasetyo', 'Operasional', '2026-09-16T04:00:00.000Z', 38, 30, false, {
    'qm-01': objective('qm-01', 'opt-d', false),
    'qm-02': objective('qm-02', '', false),
    'qm-03': objective('qm-03', 'false', false),
    'qm-04': essayEmpty('qm-04'),
    'qm-05': objective('qm-05', 'opt-c', true),
    'qm-06': objective('qm-06', 'opt-a', true),
    'qm-07': objective('qm-07', 'opt-a', true),
  }),
  materiAttempt('att-mat-04', 'u-p09', 'Indra Wijaya', 'Operasional', '2026-09-16T05:00:00.000Z', 73, 58, true, {
    'qm-01': objective('qm-01', 'opt-a', true),
    'qm-02': objective('qm-02', 'opt-b', true),
    'qm-03': objective('qm-03', 'true', true),
    'qm-04': essayGraded('qm-04', 'Menolak hadiah sesuai kode etik dan mencatatnya.', 18, 20, 'Sangat baik.'),
    'qm-05': objective('qm-05', 'opt-d', false),
    'qm-06': objective('qm-06', 'opt-c', false),
    'qm-07': objective('qm-07', 'opt-a', true),
  }),
];

export const attemptRows: RawAttemptRow[] = [...mainAttemptRows, ...otherAttemptRows, ...materiAttemptRows];

/** Seluruh tabel untuk fake Supabase (nama tabel = nama asli). */
export const fixtureTables = {
  exam_packages: examRows,
  questions: questionRows,
  exam_attempts: attemptRows,
  users: userRows,
};

// ═══════════════════════════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════════════════════════

export interface ExamRawRows {
  examRow: RawExamRow | null;
  questionRows: RawQuestionRow[];
  attemptRows: RawAttemptRow[];
  /** Hanya user yang punya attempt, kolom id,name,company,department (tanpa password) — seperti dataset.ts. */
  userRows: Array<Pick<RawUserRow, 'id' | 'name' | 'company' | 'department'>>;
}

/** Baris mentah satu paket (salinan baru setiap panggilan, aman dimodifikasi). */
export function fixtureRowsForExam(examId: string): ExamRawRows {
  const examRow = examRows.find((e) => e.id === examId) ?? null;
  const attempts = attemptRows.filter((a) => a.exam_id === examId);
  const userIds = new Set(attempts.map((a) => a.user_id));
  return structuredClone({
    examRow,
    questionRows: questionRows.filter((q) => q.exam_id === examId),
    attemptRows: attempts,
    userRows: userRows
      .filter((u) => userIds.has(u.id))
      .map(({ id, name, company, department }) => ({ id, name, company, department })),
  });
}

/** ExamDataset dari fixture lewat buildDataset (jalur yang sama dengan server). */
export function buildFixtureDataset(
  examId: string = EXAM_IDS.main,
  opts: { loadedAt?: string; truncated?: boolean } = {}
): ExamDataset {
  const rows = fixtureRowsForExam(examId);
  return buildDataset({
    examRow: rows.examRow,
    questionRows: rows.questionRows,
    attemptRows: rows.attemptRows,
    userRows: rows.userRows,
    loadedAt: opts.loadedAt ?? FIXTURE_LOADED_AT,
    truncated: opts.truncated ?? false,
  });
}
