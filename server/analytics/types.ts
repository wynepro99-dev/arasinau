/**
 * Tipe internal server untuk Exam Analytics.
 * Bentuk data publik (response API) ada di src/lib/analytics/contract.ts.
 */

/** Klien Supabase minimal yang dibutuhkan (SupabaseClient asli & fake test sama-sama memenuhi). */
export interface SupabaseLike {
  from: (table: string) => any;
}

/** Dependency yang di-inject oleh server.ts (memudahkan test dengan fake client). */
export interface AnalyticsRouterDeps {
  /**
   * Opsional. Bila tidak diisi / mengembalikan null, klien dibuat dari env proses lalu file .env*
   * (SUPABASE_URL || VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || VITE_SUPABASE_ANON_KEY).
   */
  getSupabase?: () => SupabaseLike | null;
  /** Secret HMAC token. Bila kosong: ANALYTICS_TOKEN_SECRET → turunan SUPABASE_SERVICE_ROLE_KEY → acak per proses. */
  tokenSecret?: string;
  /** Override waktu (test). */
  now?: () => number;
  /** TTL cache dataset per paket (ms). Default 30_000. 0 = tanpa cache. */
  datasetCacheTtlMs?: number;
  /**
   * Override pencarian env (test): direktori file .env & pengganti process.env.
   * Test WAJIB mengisinya agar tidak pernah membaca .env asli (database produksi).
   */
  envLookup?: { cwd?: string; env?: Record<string, string | undefined> };
}

/** User terautentikasi untuk request analytics (dibaca ulang dari DB, bukan dari isi token). */
export interface AnalyticsUser {
  id: string;
  name: string;
  /** Sudah dinormalisasi dengan normalizeUserRole: 'super_admin' di DB → 'admin'. */
  role: string;
  company: string | null;
  /** true bila users.role = 'super_admin' (atau nama mengandung "taka", aturan lama). */
  isSuperAdmin: boolean;
}

export interface NormExam {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  /** exam_packages.scope || 'BANK' */
  scope: string;
  status: string | null;
  passingScore: number | null;
  durationMinutes: number | null;
  authorName: string | null;
  createdAt: string | null;
  startTime: string | null;
  endTime: string | null;
}

export interface NormOption {
  id: string;
  text: string;
}

export interface NormQuestion {
  id: string;
  examId: string;
  /** Nomor urut kanonik 1..n (sort id dengan localeCompare, sama dengan getQuestionsByExamId). */
  no: number;
  type: string;
  questionText: string;
  options: NormOption[];
  correctAnswerId: string;
  explanation: string | null;
  points: number;
  caseStudyStory: string | null;
  sampleAnswer: string | null;
  /** Dari kolom MATERI_FIELD_CANDIDATES pertama yang terisi; null bila tidak ada. */
  materi: string | null;
}

export interface NormAnswer {
  selectedAnswerId: string;
  isCorrect: boolean;
  pointsEarned: number;
  essayAnswer: string;
  aiFeedback: string | null;
}

export interface NormAttempt {
  id: string;
  examId: string;
  userId: string;
  userName: string;
  /** Snapshot departemen saat ujian (exam_attempts.user_department). */
  userDepartment: string | null;
  score: number;
  passed: boolean;
  totalPointsEarned: number | null;
  totalMaxPoints: number | null;
  startedAt: string | null;
  completedAt: string | null;
  /** Date.parse(completedAt); NaN bila tidak valid. */
  completedAtMs: number;
  durationSecondsUsed: number | null;
  /** questionId → jawaban (sudah dinormalisasi). */
  answers: Record<string, NormAnswer>;
}

export interface UserLite {
  id: string;
  name: string;
  company: string | null;
  department: string | null;
}

/** Semua data mentah satu paket yang dibutuhkan analitik (dimuat sekali, di-cache singkat). */
export interface ExamDataset {
  exam: NormExam;
  questions: NormQuestion[];
  /** SEMUA attempt paket ini (termasuk pengulangan), belum difilter. */
  attempts: NormAttempt[];
  /** userId → data user (tanpa password). */
  users: Map<string, UserLite>;
  loadedAt: string;
  /** true bila pemuatan attempt dihentikan di batas aman. */
  truncated: boolean;
}

// ═══════════════════════════════════════════════════════════════
// XLSX (writer zero-dependency di server/analytics/xlsx.ts)
// ═══════════════════════════════════════════════════════════════

export type XlsxCell = string | number | boolean | null | undefined;

export interface XlsxColumn {
  header: string;
  /** Lebar kolom dalam satuan karakter Excel. */
  width?: number;
  /** Bungkus teks panjang (soal, opsi, rubrik). */
  wrap?: boolean;
}

export interface XlsxSheet {
  /** Disanitasi otomatis (maks 31 karakter, tanpa []:*?/\, unik). */
  name: string;
  /** Baris header (bold + latar, di-freeze, autofilter). Opsional. */
  columns?: XlsxColumn[];
  rows: XlsxCell[][];
  /** Default true bila columns ada. */
  freezeHeader?: boolean;
  /** Default true bila columns ada dan rows tidak kosong. */
  autoFilter?: boolean;
}

export interface XlsxMeta {
  title?: string;
  creator?: string;
  /** ISO datetime; default sekarang. */
  createdAt?: string;
}
