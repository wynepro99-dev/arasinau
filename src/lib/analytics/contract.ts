/**
 * Kontrak bersama fitur Exam Analytics + Download Soal.
 *
 * Dipakai oleh server (server/analytics/*, di-bundle esbuild) dan klien (Vite).
 * Murni TypeScript tanpa import agar aman di kedua sisi.
 *
 * Seluruh angka analitik dihitung DETERMINISTIK dari data existing
 * (exam_packages, questions, exam_attempts.answers, users). Tidak ada AI.
 */

// ═══════════════════════════════════════════════════════════════
// ENDPOINT
// ═══════════════════════════════════════════════════════════════

export const ANALYTICS_API_PREFIX = '/api/analytics';

const enc = (v: string) => encodeURIComponent(v);

export const ANALYTICS_ENDPOINTS = {
  token: `${ANALYTICS_API_PREFIX}/auth/token`,
  summary: (examId: string) => `${ANALYTICS_API_PREFIX}/exams/${enc(examId)}/summary`,
  questionDetail: (examId: string, questionId: string) =>
    `${ANALYTICS_API_PREFIX}/exams/${enc(examId)}/questions/${enc(questionId)}`,
  questionExport: (examId: string, questionId: string) =>
    `${ANALYTICS_API_PREFIX}/exams/${enc(examId)}/questions/${enc(questionId)}/export.xlsx`,
  participants: (examId: string) => `${ANALYTICS_API_PREFIX}/exams/${enc(examId)}/participants`,
  participantDetail: (examId: string, userId: string) =>
    `${ANALYTICS_API_PREFIX}/exams/${enc(examId)}/participants/${enc(userId)}`,
  errors: (examId: string) => `${ANALYTICS_API_PREFIX}/exams/${enc(examId)}/errors`,
  analyticsExport: (examId: string) => `${ANALYTICS_API_PREFIX}/exams/${enc(examId)}/export.xlsx`,
  /** Download Soal. Query `withKey=1` untuk menyertakan kunci jawaban. */
  questionSheet: (examId: string) => `${ANALYTICS_API_PREFIX}/exams/${enc(examId)}/download-soal.xlsx`,
} as const;

/** Nama query parameter yang dipakai seluruh endpoint analitik. */
export const QUERY_KEYS = {
  company: 'company',
  department: 'department',
  from: 'from',
  to: 'to',
  fresh: 'fresh',
  search: 'search',
  sort: 'sort',
  dir: 'dir',
  page: 'page',
  pageSize: 'pageSize',
  limit: 'limit',
  withKey: 'withKey',
} as const;

export const PARTICIPANT_PAGE_SIZE_DEFAULT = 25;
export const PARTICIPANT_PAGE_SIZE_MAX = 200;
export const ERROR_ROWS_LIMIT_DEFAULT = 2000;
export const ERROR_ROWS_LIMIT_MAX = 20000;
export const QUESTION_NON_CORRECT_ROWS_MAX = 5000;
export const TEXT_PREVIEW_LENGTH = 160;

// ═══════════════════════════════════════════════════════════════
// KONSTANTA DOMAIN (mengikuti perilaku existing)
// ═══════════════════════════════════════════════════════════════

/** aiFeedback yang ditulis ExamTakingScreen untuk essay/case yang menunggu penilaian manual. */
export const PENDING_GRADING_FEEDBACK = 'Menunggu penilaian manual dari Admin.';

/** Status yang dipakai Scores Dashboard existing. */
export const STATUS_LABELS = {
  passed: 'LULUS',
  failed: 'TIDAK LULUS',
  pending: 'MENUNGGU PENILAIAN',
} as const;
export type ParticipantStatus = (typeof STATUS_LABELS)[keyof typeof STATUS_LABELS];

export const ATTEMPT_BASIS_NOTE =
  'Analisis memakai attempt pertama setiap peserta pada paket ini (aturan yang sama dengan Rekap Nilai). ' +
  'Total Attempt menghitung semua attempt, termasuk pengulangan.';

export const DIFFICULTY_DISCLAIMER =
  'Indikasi Tingkat Kesulitan: soal pilihan ganda / benar-salah dari persentase jawaban benar (benar ÷ total × 100); ' +
  'soal essay / studi kasus dari persentase skor (total poin ÷ (jawaban dinilai + kosong) × poin maksimal × 100; ' +
  'jawaban kosong bernilai 0, jawaban yang menunggu penilaian belum dihitung). ' +
  'Ini indikasi sederhana, bukan analisis psikometri formal.';

export const MATERIAL_UNAVAILABLE_MESSAGE =
  'Analisis materi belum tersedia karena soal pada paket ini belum memiliki metadata materi.';

/**
 * Threshold Indikasi Tingkat Kesulitan (persen jawaban benar).
 * Ubah angka di sini untuk menggeser batas Mudah/Sedang/Sulit.
 */
export const DIFFICULTY_THRESHOLDS = {
  /** pctCorrect >= easyMinPct  → Mudah */
  easyMinPct: 80,
  /** pctCorrect >= mediumMinPct → Sedang (di bawahnya → Sulit) */
  mediumMinPct: 50,
} as const;

export type DifficultyLabel = 'Mudah' | 'Sedang' | 'Sulit';

/** Klasifikasi dari pctCorrect yang SUDAH dibulatkan 2 desimal (sama dengan yang ditampilkan). */
export function difficultyFor(pctCorrect: number | null | undefined): DifficultyLabel | null {
  if (pctCorrect === null || pctCorrect === undefined || !Number.isFinite(pctCorrect)) return null;
  if (pctCorrect >= DIFFICULTY_THRESHOLDS.easyMinPct) return 'Mudah';
  if (pctCorrect >= DIFFICULTY_THRESHOLDS.mediumMinPct) return 'Sedang';
  return 'Sulit';
}

/**
 * Kolom metadata materi yang dicari pada baris `questions` (urutan = prioritas).
 * Tabel questions existing TIDAK punya kolom ini; bila suatu saat ditambahkan,
 * analisis materi otomatis aktif. Tidak ada kategori yang dibuat-buat / AI.
 */
export const MATERI_FIELD_CANDIDATES = [
  'materi',
  'material',
  'topic',
  'topik',
  'category',
  'kategori',
  'module',
  'modul',
  'subject',
] as const;

export type QuestionTypeCode = 'multiple_choice' | 'true_false' | 'case_study' | 'essay';

export const QUESTION_TYPE_LABELS: Record<QuestionTypeCode, string> = {
  multiple_choice: 'Pilihan Ganda',
  true_false: 'Benar/Salah',
  case_study: 'Studi Kasus',
  essay: 'Essay',
};

export function questionTypeLabel(type: string | null | undefined): string {
  return (QUESTION_TYPE_LABELS as Record<string, string>)[type || ''] || type || '-';
}

/** Soal objektif = bisa dinilai benar/salah otomatis (MC & True/False). */
export function isObjectiveType(type: string | null | undefined): boolean {
  return type === 'multiple_choice' || type === 'true_false';
}

/** Label huruf opsi berdasarkan POSISI di array options (sama dengan ExamTakingScreen & email). */
export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;

/** Rentang histogram nilai (skor 0–100). Skor 100 masuk bin terakhir. */
export const SCORE_BINS: ReadonlyArray<{ label: string; min: number; max: number }> = [
  { label: '0–9', min: 0, max: 9 },
  { label: '10–19', min: 10, max: 19 },
  { label: '20–29', min: 20, max: 29 },
  { label: '30–39', min: 30, max: 39 },
  { label: '40–49', min: 40, max: 49 },
  { label: '50–59', min: 50, max: 59 },
  { label: '60–69', min: 60, max: 69 },
  { label: '70–79', min: 70, max: 79 },
  { label: '80–89', min: 80, max: 89 },
  { label: '90–100', min: 90, max: 100 },
];

/** Index bin untuk sebuah skor (dibatasi 0..9). */
export function scoreBinIndex(score: number): number {
  if (!Number.isFinite(score)) return 0;
  if (score >= 100) return SCORE_BINS.length - 1;
  return Math.min(SCORE_BINS.length - 1, Math.max(0, Math.floor(score / 10)));
}

/** Pembulatan 2 desimal yang konsisten di server & klien. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Persentase part/whole × 100 dibulatkan 2 desimal; null bila whole = 0. */
export function pct(part: number, whole: number): number | null {
  if (!whole) return null;
  return round2((part / whole) * 100);
}

// ═══════════════════════════════════════════════════════════════
// FILTER
// ═══════════════════════════════════════════════════════════════

export type CompanyCode = 'BANK' | 'SEC' | 'ALL';
export const COMPANY_CODES: CompanyCode[] = ['BANK', 'SEC', 'ALL'];

/**
 * Filter berlaku ke SELURUH analitik (ringkasan, soal, distribusi, materi, peserta, export).
 * - company    : company peserta (users.company) — BANK | SEC | ALL
 * - department : sama persis dengan exam_attempts.user_department (seperti filter Departemen di Rekap Nilai)
 * - from / to  : batas ISO datetime (inklusif) terhadap completed_at
 */
export interface AnalyticsFilters {
  company?: string | null;
  department?: string | null;
  from?: string | null;
  to?: string | null;
}

export interface AppliedFilters {
  company: string | null;
  department: string | null;
  from: string | null;
  to: string | null;
}

/** Ubah filter menjadi query string params (nilai kosong dibuang). */
export function filtersToQuery(f: AnalyticsFilters | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!f) return out;
  if (f.company) out[QUERY_KEYS.company] = f.company;
  if (f.department) out[QUERY_KEYS.department] = f.department;
  if (f.from) out[QUERY_KEYS.from] = f.from;
  if (f.to) out[QUERY_KEYS.to] = f.to;
  return out;
}

// ═══════════════════════════════════════════════════════════════
// ATURAN IZIN — meniru aturan UI existing PERSIS (dicek ulang di backend)
// ═══════════════════════════════════════════════════════════════

export interface PermissionUser {
  id: string;
  name: string;
  role: string;
  company?: string | null;
  /** Hasil normalizeUserRole (role 'super_admin' di database). */
  isSuperAdmin?: boolean | null;
}

export interface PermissionExam {
  id: string;
  scope?: string | null;
  authorName?: string | null;
}

/** Nilai kolom users.role untuk super admin. Disimpan di DB apa adanya (kolom TEXT, tanpa ubah skema). */
export const SUPER_ADMIN_ROLE = 'super_admin';

/** true untuk 'super_admin' / 'superadmin' / 'super admin' / 'super-admin' (tanpa membedakan huruf besar/kecil). */
export function isSuperAdminRoleValue(role: unknown): boolean {
  if (typeof role !== 'string') return false;
  const r = role.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return r === 'super_admin' || r === 'superadmin';
}

/**
 * Normalisasi role dari baris users di database.
 * 'super_admin' → role 'admin' + isSuperAdmin true, sehingga seluruh pengecekan
 * role === 'admin' yang sudah ada tetap berlaku. Role lain dikembalikan apa adanya.
 */
export function normalizeUserRole<T>(rawRole: T): { role: T | 'admin'; isSuperAdmin: boolean } {
  if (isSuperAdminRoleValue(rawRole)) return { role: 'admin', isSuperAdmin: true };
  return { role: rawRole, isSuperAdmin: false };
}

/** Super admin existing: nama mengandung "taka" (App.tsx & ExamManagement.tsx). */
export function isSuperAdminName(name: string | null | undefined): boolean {
  return (name || '').toLowerCase().includes('taka');
}

/** Super admin = role 'super_admin' di database ATAU nama mengandung "taka" (aturan lama tetap berlaku). */
export function isSuperAdminUser(
  user: { name?: string | null; role?: string | null; isSuperAdmin?: boolean | null } | null | undefined
): boolean {
  if (!user) return false;
  return user.isSuperAdmin === true || isSuperAdminRoleValue(user.role) || isSuperAdminName(user.name);
}

/** Role yang boleh membuka analytics (admin + egi read-only; super admin = admin). Karyawan tidak boleh. */
export function isAnalyticsRole(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'egi' || isSuperAdminRoleValue(role);
}

/**
 * Melihat analytics sebuah paket = aturan visibilitas Rekap Nilai existing
 * (App.tsx `visibleAttemptsForAdmin`):
 *   company user 'ALL' atau super admin → semua paket;
 *   selain itu → hanya paket dengan (scope || 'BANK') === (company user || 'BANK').
 */
export function canViewExamAnalytics(
  user: PermissionUser | null | undefined,
  exam: PermissionExam | null | undefined
): boolean {
  if (!user || !exam || !isAnalyticsRole(user.role)) return false;
  const userCompany = user.company || 'BANK';
  if (userCompany === 'ALL' || isSuperAdminUser(user)) return true;
  return (exam.scope || 'BANK') === userCompany;
}

/** Export analytics = sama dengan melihat (EGI existing juga boleh "Export Excel" di Rekap Nilai). */
export function canExportExamAnalytics(
  user: PermissionUser | null | undefined,
  exam: PermissionExam | null | undefined
): boolean {
  return canViewExamAnalytics(user, exam);
}

/**
 * Download Soal (dengan/tanpa kunci) = hanya admin yang bisa mengelola paket itu
 * di Exam Management existing: super admin, atau admin pembuat paket (authorName).
 * EGI & karyawan tidak boleh.
 */
export function canDownloadExamQuestions(
  user: PermissionUser | null | undefined,
  exam: PermissionExam | null | undefined
): boolean {
  if (!user || !exam) return false;
  if (user.role !== 'admin' && !isSuperAdminRoleValue(user.role)) return false;
  if (isSuperAdminUser(user)) return true;
  if (!exam.authorName) return false;
  return exam.authorName.toLowerCase() === (user.name || '').toLowerCase();
}

// ═══════════════════════════════════════════════════════════════
// RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════

export type ApiErrorCode =
  | 'unauthenticated' // tidak ada / token salah format
  | 'token_invalid' // token kadaluarsa / tanda tangan salah → klien minta token baru sekali
  | 'invalid_credentials'
  | 'forbidden'
  | 'not_found'
  | 'bad_request'
  | 'rate_limited'
  | 'unavailable' // supabase belum dikonfigurasi di server / server analitik tidak ada
  | 'internal';

export interface ApiErrorBody {
  error: string;
  code: ApiErrorCode;
}

export interface TokenRequestBody {
  userId: string;
  password: string;
}

export interface TokenResponse {
  token: string;
  expiresAt: string;
  /** role sudah dinormalisasi (super_admin → 'admin' + isSuperAdmin). */
  user: { id: string; name: string; role: string; company: string | null; isSuperAdmin: boolean };
}

export interface ExamInfo {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  scope: string;
  status: string | null;
  passingScore: number | null;
  durationMinutes: number | null;
  authorName: string | null;
  createdAt: string | null;
  startTime: string | null;
  endTime: string | null;
}

export interface FilterOptions {
  /** Company peserta yang muncul pada attempt paket ini (tanpa filter). */
  companies: string[];
  /** Departemen (snapshot attempt) yang muncul pada attempt paket ini (tanpa filter). */
  departments: string[];
}

export interface AnalyticsSummary {
  /** Peserta unik (attempt pertama per peserta) setelah filter. */
  totalParticipants: number;
  /** Semua attempt (termasuk pengulangan) setelah filter. */
  totalAttempts: number;
  avgScore: number | null;
  maxScore: number | null;
  minScore: number | null;
  passedCount: number;
  failedCount: number;
  passRatePct: number | null;
  /** Rata-rata jumlah jawaban benar soal objektif (MC & B/S) per peserta. */
  avgCorrectObjective: number | null;
  objectiveQuestionCount: number;
  /** Total jawaban kosong (semua tipe) dari seluruh peserta. */
  totalUnanswered: number;
  /** Jumlah peserta yang masih punya essay "Menunggu penilaian". */
  pendingGradingParticipants: number;
  questionCount: number;
  firstCompletedAt: string | null;
  lastCompletedAt: string | null;
}

export interface ScoreBin {
  label: string;
  min: number;
  max: number;
  count: number;
}

export type DistributionKind = 'option' | 'empty' | 'unknown';

export interface OptionDistributionRow {
  /** id opsi; '__empty__' untuk tidak menjawab; '__unknown__' untuk id yang tidak ada di opsi saat ini. */
  optionId: string;
  /** 'A'..'E' (MC), 'Benar'/'Salah' (B/S), 'Tidak menjawab', 'Lainnya'. */
  label: string;
  text: string;
  count: number;
  /** count / total soal × 100 (2 desimal). Semua baris berjumlah ±100. */
  pct: number | null;
  /** true bila opsi ini = kunci jawaban SAAT INI. */
  isCorrect: boolean;
  kind: DistributionKind;
}

export interface EssayStat {
  answered: number;
  graded: number;
  pending: number;
  /** Rata-rata / min / max poin dari jawaban yang SUDAH dinilai. */
  avgScore: number | null;
  minScore: number | null;
  maxScore: number | null;
  maxPoint: number;
  /**
   * Persentase skor = total poin (dinilai + kosong) ÷ ((dinilai + kosong) × poin maks) × 100, 2 desimal.
   * Kosong bernilai 0; menunggu penilaian tidak dihitung. Dasar Indikasi Kesulitan essay / studi kasus.
   */
  scorePct: number | null;
}

export interface QuestionStat {
  /** Nomor urut kanonik (urutan id seperti getQuestionsByExamId), mulai 1. */
  no: number;
  questionId: string;
  type: QuestionTypeCode | string;
  typeLabel: string;
  textPreview: string;
  materi: string | null;
  points: number;
  /** Peserta yang mendapat soal ini = benar + salah + kosong. */
  total: number;
  /** null untuk essay / studi kasus (tidak dinilai benar/salah otomatis). */
  correct: number | null;
  wrong: number | null;
  empty: number;
  pctCorrect: number | null;
  pctWrong: number | null;
  pctEmpty: number | null;
  /** Objektif: dari pctCorrect. Essay / studi kasus: dari essay.scorePct. null bila belum ada data. */
  difficulty: DifficultyLabel | null;
  /** Hanya essay / studi kasus. */
  essay: EssayStat | null;
  /**
   * Soal objektif: jumlah jawaban yang `isCorrect` tersimpannya berbeda dengan
   * perbandingan terhadap kunci SAAT INI (indikasi kunci diubah setelah ujian).
   * Statistik Benar/Salah tetap mengikuti nilai tersimpan (= skor existing).
   */
  scoringMismatchCount: number;
}

export interface MaterialStat {
  materi: string;
  questionCount: number;
  objectiveQuestionCount: number;
  correct: number;
  wrong: number;
  empty: number;
  /** correct + wrong + empty (soal objektif saja). */
  total: number;
  pctCorrect: number | null;
}

export interface AnalyticsCapabilities {
  canExport: boolean;
  canDownloadQuestions: boolean;
}

export interface ExamAnalyticsSummaryResponse {
  exam: ExamInfo;
  filters: AppliedFilters;
  filterOptions: FilterOptions;
  basisNote: string;
  summary: AnalyticsSummary;
  scoreDistribution: ScoreBin[];
  questions: QuestionStat[];
  /** questionId → distribusi jawaban (soal objektif saja). */
  distributions: Record<string, OptionDistributionRow[]>;
  materialAvailable: boolean;
  materials: MaterialStat[];
  capabilities: AnalyticsCapabilities;
  generatedAt: string;
  /** true bila jumlah attempt melebihi batas aman pemuatan server. */
  truncated: boolean;
}

export interface QuestionOptionInfo {
  optionId: string;
  label: string;
  text: string;
  isCorrect: boolean;
}

export interface QuestionDetailInfo {
  no: number;
  questionId: string;
  type: QuestionTypeCode | string;
  typeLabel: string;
  questionText: string;
  caseStudyStory: string | null;
  materi: string | null;
  points: number;
  options: QuestionOptionInfo[];
  correctAnswer: { optionId: string | null; label: string | null; text: string | null } | null;
  /** Acuan jawaban / rubrik essay & studi kasus. */
  sampleAnswer: string | null;
  explanation: string | null;
}

export type NonCorrectStatus = 'wrong' | 'empty';

export interface ParticipantAnswerRow {
  userId: string;
  attemptId: string;
  name: string;
  company: string | null;
  department: string | null;
  status: NonCorrectStatus;
  answerOptionId: string | null;
  answerLabel: string | null;
  answerText: string | null;
  correctLabel: string | null;
  correctText: string | null;
  pointsEarned: number;
  maxPoints: number;
  completedAt: string | null;
}

export interface QuestionDetailResponse {
  exam: { id: string; title: string; scope: string };
  filters: AppliedFilters;
  question: QuestionDetailInfo;
  stat: QuestionStat;
  /** Soal objektif saja (kosong untuk essay / studi kasus). */
  distribution: OptionDistributionRow[];
  /** Soal objektif: peserta yang salah + yang tidak menjawab (status membedakan). */
  nonCorrectParticipants: ParticipantAnswerRow[];
  truncated: boolean;
  materialAvailable: boolean;
  generatedAt: string;
}

export interface ParticipantRow {
  userId: string;
  attemptId: string;
  name: string;
  company: string | null;
  department: string | null;
  score: number;
  passed: boolean;
  status: ParticipantStatus;
  correct: number;
  wrong: number;
  empty: number;
  pendingEssay: number;
  /** Jumlah attempt peserta ini pada paket (setelah filter periode/departemen). */
  attemptCount: number;
  completedAt: string | null;
  durationSeconds: number | null;
}

export type ParticipantSortKey =
  | 'name'
  | 'company'
  | 'department'
  | 'score'
  | 'correct'
  | 'wrong'
  | 'empty'
  | 'completedAt';

export interface ParticipantListResponse {
  total: number;
  page: number;
  pageSize: number;
  rows: ParticipantRow[];
}

export interface ParticipantWrongQuestion {
  no: number;
  questionId: string;
  type: QuestionTypeCode | string;
  typeLabel: string;
  materi: string | null;
  textPreview: string;
  status: NonCorrectStatus;
  answerLabel: string | null;
  answerText: string | null;
  correctLabel: string | null;
  correctText: string | null;
  pointsEarned: number;
  maxPoints: number;
}

export type EssayState = 'empty' | 'pending' | 'graded';

export interface ParticipantEssayQuestion {
  no: number;
  questionId: string;
  typeLabel: string;
  materi: string | null;
  textPreview: string;
  state: EssayState;
  pointsEarned: number;
  maxPoints: number;
}

export interface ParticipantDetailResponse {
  exam: { id: string; title: string; scope: string; passingScore: number | null };
  participant: ParticipantRow;
  wrongQuestions: ParticipantWrongQuestion[];
  essayQuestions: ParticipantEssayQuestion[];
  materialAvailable: boolean;
  generatedAt: string;
}

export interface ErrorRow {
  userId: string;
  attemptId: string;
  name: string;
  company: string | null;
  department: string | null;
  no: number;
  questionId: string;
  materi: string | null;
  textPreview: string;
  status: NonCorrectStatus;
  answerLabel: string | null;
  answerText: string | null;
  correctLabel: string | null;
  correctText: string | null;
  pointsEarned: number;
  maxPoints: number;
  completedAt: string | null;
}

export interface ErrorRowsResponse {
  total: number;
  rows: ErrorRow[];
  truncated: boolean;
}
