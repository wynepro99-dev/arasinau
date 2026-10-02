/**
 * Mesin analitik Exam Analytics — fungsi MURNI & deterministik (tanpa I/O, tanpa AI).
 *
 * Semantik mengikuti perilaku aplikasi existing:
 * - Benar/Salah selalu memakai `isCorrect` TERSIMPAN di exam_attempts.answers (= skor existing,
 *   tidak pernah dinilai ulang). Selisih dengan kunci saat ini hanya dilaporkan (scoringMismatchCount).
 * - Hanya attempt pertama per peserta per paket yang dianalisis (aturan Rekap Nilai); dedupe
 *   dilakukan SEBELUM filter.
 * - Soal yang tidak ada di answers sebuah attempt = ditambahkan setelah attempt itu ("tidak disajikan").
 * - Jawaban untuk soal yang sudah dihapus diabaikan, kecuali aturan status "Menunggu penilaian"
 *   yang (seperti Rekap Nilai) melihat semua nilai answers.
 */

import {
  ATTEMPT_BASIS_NOTE,
  COMPANY_CODES,
  ERROR_ROWS_LIMIT_DEFAULT,
  ERROR_ROWS_LIMIT_MAX,
  MATERI_FIELD_CANDIDATES,
  OPTION_LETTERS,
  PARTICIPANT_PAGE_SIZE_DEFAULT,
  PARTICIPANT_PAGE_SIZE_MAX,
  PENDING_GRADING_FEEDBACK,
  QUERY_KEYS,
  QUESTION_NON_CORRECT_ROWS_MAX,
  SCORE_BINS,
  STATUS_LABELS,
  TEXT_PREVIEW_LENGTH,
  difficultyFor,
  isObjectiveType,
  pct,
  questionTypeLabel,
  round2,
  scoreBinIndex,
} from '../../src/lib/analytics/contract';
import type {
  AnalyticsCapabilities,
  AppliedFilters,
  EssayState,
  ErrorRow,
  ErrorRowsResponse,
  ExamAnalyticsSummaryResponse,
  ExamInfo,
  FilterOptions,
  MaterialStat,
  OptionDistributionRow,
  ParticipantAnswerRow,
  ParticipantDetailResponse,
  ParticipantEssayQuestion,
  ParticipantListResponse,
  ParticipantRow,
  ParticipantSortKey,
  ParticipantWrongQuestion,
  QuestionDetailInfo,
  QuestionDetailResponse,
  QuestionStat,
  ScoreBin,
} from '../../src/lib/analytics/contract';
import type { ExamDataset, NormAnswer, NormAttempt, NormExam, NormOption, NormQuestion, UserLite } from './types';

const NO_MATERI_LABEL = '(Tanpa materi)';
const UNKNOWN_OPTION_ID = '__unknown__';
const EMPTY_OPTION_ID = '__empty__';
const DEPARTMENT_FILTER_MAX_LENGTH = 200;

/** Opsi Benar/Salah persis seperti yang ditulis QuestionEditorModal. */
const TRUE_FALSE_OPTIONS: ReadonlyArray<NormOption> = [
  { id: 'true', text: 'Benar' },
  { id: 'false', text: 'Salah' },
];

/** Sama dengan `a.localeCompare(b, 'id')` / `a.localeCompare(b, 'id', { sensitivity: 'base' })`, dibuat sekali. */
const COLLATOR_ID = new Intl.Collator('id');
const COLLATOR_ID_BASE = new Intl.Collator('id', { sensitivity: 'base' });

const PARTICIPANT_SORT_KEYS: ReadonlyArray<ParticipantSortKey> = [
  'name',
  'company',
  'department',
  'score',
  'correct',
  'wrong',
  'empty',
  'completedAt',
];
const DESC_BY_DEFAULT: ReadonlySet<ParticipantSortKey> = new Set<ParticipantSortKey>([
  'score',
  'correct',
  'wrong',
  'empty',
  'completedAt',
]);

// ═══════════════════════════════════════════════════════════════
// UTIL
// ═══════════════════════════════════════════════════════════════

const hasOwn = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

/** Properti milik sendiri (aman juga untuk key seperti "__proto__"). */
function setOwn<T>(obj: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

function strOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

function trimmedOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function numOrZero(v: unknown): number {
  return numOrNull(v) ?? 0;
}

/** JSONB bisa datang sebagai objek atau string JSON. undefined bila string tidak valid. */
function parseJsonMaybe(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
}

/** Integer dari number/string; null bila kosong / tidak valid. */
function toInt(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.floor(v) : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? Math.floor(n) : null;
  }
  return null;
}

const cmpCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function previewText(text: string): string {
  const collapsed = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (collapsed.length <= TEXT_PREVIEW_LENGTH) return collapsed;
  let cut = collapsed.slice(0, TEXT_PREVIEW_LENGTH);
  // jangan memotong di tengah pasangan surrogate (emoji)
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return `${cut}…`;
}

// ═══════════════════════════════════════════════════════════════
// NORMALISASI BARIS DB
// ═══════════════════════════════════════════════════════════════

export function normalizeExam(row: any): NormExam {
  const r = row && typeof row === 'object' ? row : {};
  return {
    id: String(r.id ?? ''),
    title: String(r.title ?? ''),
    description: strOrNull(r.description),
    category: strOrNull(r.category),
    scope: r.scope ? String(r.scope) : 'BANK',
    status: strOrNull(r.status),
    passingScore: numOrNull(r.passing_score),
    durationMinutes: numOrNull(r.duration_minutes),
    authorName: strOrNull(r.author_name),
    createdAt: strOrNull(r.created_at),
    startTime: strOrNull(r.start_time),
    endTime: strOrNull(r.end_time),
  };
}

/** Nilai string/angka pertama yang tidak kosong di antara MATERI_FIELD_CANDIDATES. */
export function detectMateri(row: any): string | null {
  if (!row || typeof row !== 'object') return null;
  for (const field of MATERI_FIELD_CANDIDATES) {
    const v = row[field];
    if (typeof v === 'string') {
      const s = v.trim();
      if (s) return s;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      return String(v);
    }
  }
  return null;
}

function normalizeOptions(raw: unknown, type: string): NormOption[] {
  const parsed = parseJsonMaybe(raw);
  const list: NormOption[] = [];
  if (Array.isArray(parsed)) {
    for (const o of parsed) {
      if (o === null || typeof o !== 'object') continue;
      list.push({ id: String(o.id ?? ''), text: String(o.text ?? '') });
    }
  }
  if (type === 'true_false' && list.length === 0) return TRUE_FALSE_OPTIONS.map((o) => ({ ...o }));
  return list;
}

/** Urut id dengan localeCompare (sama dengan getQuestionsByExamId), no = 1..n. */
export function normalizeQuestions(rows: any[]): NormQuestion[] {
  const out: NormQuestion[] = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r !== 'object') continue;
    const type = String(r.type ?? '');
    out.push({
      id: String(r.id ?? ''),
      examId: String(r.exam_id ?? ''),
      no: 0,
      type,
      questionText: String(r.question_text ?? ''),
      options: normalizeOptions(r.options, type),
      correctAnswerId: String(r.correct_answer_id ?? ''),
      explanation: strOrNull(r.explanation),
      points: numOrZero(r.points),
      caseStudyStory: strOrNull(r.case_study_story),
      sampleAnswer: strOrNull(r.sample_answer),
      materi: detectMateri(r),
    });
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  out.forEach((q, i) => {
    q.no = i + 1;
  });
  return out;
}

export function normalizeAnswer(raw: any): NormAnswer {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    selectedAnswerId: r.selectedAnswerId == null ? '' : String(r.selectedAnswerId),
    isCorrect: r.isCorrect === true,
    pointsEarned: numOrZero(r.pointsEarned),
    essayAnswer: typeof r.essayAnswer === 'string' ? r.essayAnswer : '',
    aiFeedback: typeof r.aiFeedback === 'string' ? r.aiFeedback : null,
  };
}

function normalizeAnswersRecord(raw: unknown): Record<string, NormAnswer> {
  const parsed = parseJsonMaybe(raw);
  const out: Record<string, NormAnswer> = {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return out;
  // key objek answers = questionId (bukan field questionId di dalamnya)
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    setOwn(out, key, normalizeAnswer(value));
  }
  return out;
}

export function normalizeAttempts(rows: any[]): NormAttempt[] {
  const out: NormAttempt[] = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r !== 'object') continue;
    const completedAt = strOrNull(r.completed_at);
    out.push({
      id: String(r.id ?? ''),
      examId: String(r.exam_id ?? ''),
      userId: String(r.user_id ?? ''),
      userName: String(r.user_name ?? ''),
      userDepartment: trimmedOrNull(r.user_department),
      score: numOrZero(r.score),
      passed: r.passed === true || r.passed === 'true',
      totalPointsEarned: numOrNull(r.total_points_earned),
      totalMaxPoints: numOrNull(r.total_max_points),
      startedAt: strOrNull(r.started_at),
      completedAt,
      completedAtMs: completedAt === null ? NaN : Date.parse(completedAt),
      durationSecondsUsed: numOrNull(r.duration_seconds_used),
      answers: normalizeAnswersRecord(r.answers),
    });
  }
  return out;
}

/** Baris tanpa exam_id ditoleransi; baris milik paket LAIN selalu dibuang (pertahanan berlapis, IDOR). */
function belongsToExam(row: any, examId: string): boolean {
  if (!row || typeof row !== 'object') return false;
  return row.exam_id === null || row.exam_id === undefined || String(row.exam_id) === examId;
}

export function buildDataset(input: {
  examRow: any;
  questionRows: any[];
  attemptRows: any[];
  userRows: any[];
  loadedAt?: string;
  truncated?: boolean;
}): ExamDataset {
  const exam = normalizeExam(input.examRow);
  const questionRows = (Array.isArray(input.questionRows) ? input.questionRows : []).filter((r) =>
    belongsToExam(r, exam.id)
  );
  const attemptRows = (Array.isArray(input.attemptRows) ? input.attemptRows : []).filter((r) =>
    belongsToExam(r, exam.id)
  );
  const users = new Map<string, UserLite>();
  for (const u of Array.isArray(input.userRows) ? input.userRows : []) {
    if (!u || typeof u !== 'object' || u.id === null || u.id === undefined) continue;
    const id = String(u.id);
    users.set(id, {
      id,
      name: String(u.name ?? ''),
      // sama dengan storage.ts: company kosong dianggap BANK
      company: u.company ? String(u.company) : 'BANK',
      department: trimmedOrNull(u.department),
    });
  }
  return {
    exam,
    questions: normalizeQuestions(questionRows),
    attempts: normalizeAttempts(attemptRows),
    users,
    loadedAt: typeof input.loadedAt === 'string' && input.loadedAt ? input.loadedAt : new Date().toISOString(),
    truncated: input.truncated === true,
  };
}

// ═══════════════════════════════════════════════════════════════
// ATTEMPT PERTAMA & FILTER
// ═══════════════════════════════════════════════════════════════

const chronoMs = (a: NormAttempt): number => (Number.isFinite(a.completedAtMs) ? a.completedAtMs : Infinity);

function compareChrono(a: NormAttempt, b: NormAttempt): number {
  const x = chronoMs(a);
  const y = chronoMs(b);
  if (x < y) return -1;
  if (x > y) return 1;
  return cmpCode(a.id, b.id);
}

/** Attempt pertama per (userId, examId) berdasar completedAt naik (tidak valid → paling akhir, seri → id). */
export function selectFirstAttempts(attempts: NormAttempt[]): NormAttempt[] {
  const sorted = [...attempts].sort(compareChrono);
  const seen = new Set<string>();
  const out: NormAttempt[] = [];
  for (const a of sorted) {
    const key = `${a.userId}-${a.examId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

type FilterParseResult = { ok: true; filters: AppliedFilters } | { ok: false; error: string };

/** Nilai query tunggal → string ter-trim ('' bila kosong); null bila bentuknya tidak valid (array/objek). */
function readQueryText(v: unknown): string | null {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).trim();
  return null;
}

/** null = tidak diisi; undefined = tidak valid; selain itu ISO ter-normalisasi. */
function readQueryDate(v: unknown): string | null | undefined {
  const s = readQueryText(v);
  if (s === null) return undefined;
  if (s === '') return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

export function parseFilters(query: Record<string, unknown>): FilterParseResult {
  const q: Record<string, unknown> = query && typeof query === 'object' ? query : {};

  const company = readQueryText(q[QUERY_KEYS.company]);
  if (company === null || (company !== '' && !(COMPANY_CODES as readonly string[]).includes(company))) {
    return { ok: false, error: `Filter company tidak valid. Gunakan salah satu: ${COMPANY_CODES.join(', ')}.` };
  }

  const department = readQueryText(q[QUERY_KEYS.department]);
  if (department === null) return { ok: false, error: 'Filter department tidak valid.' };
  if (department.length > DEPARTMENT_FILTER_MAX_LENGTH) {
    return {
      ok: false,
      error: `Filter department terlalu panjang (maksimal ${DEPARTMENT_FILTER_MAX_LENGTH} karakter).`,
    };
  }

  const from = readQueryDate(q[QUERY_KEYS.from]);
  if (from === undefined) return { ok: false, error: 'Tanggal awal periode (from) tidak valid.' };
  const to = readQueryDate(q[QUERY_KEYS.to]);
  if (to === undefined) return { ok: false, error: 'Tanggal akhir periode (to) tidak valid.' };
  if (from !== null && to !== null && Date.parse(from) > Date.parse(to)) {
    return { ok: false, error: 'Tanggal awal periode tidak boleh setelah tanggal akhir.' };
  }

  return { ok: true, filters: { company: company || null, department: department || null, from, to } };
}

function normalizeApplied(f: AppliedFilters | null | undefined): AppliedFilters {
  return {
    company: f?.company || null,
    department: f?.department || null,
    from: f?.from || null,
    to: f?.to || null,
  };
}

export interface FilteredView {
  /** Attempt pertama per peserta yang lolos filter (basis seluruh analitik). */
  valid: NormAttempt[];
  /** Semua attempt (termasuk pengulangan) yang lolos filter. */
  rawMatching: NormAttempt[];
  attemptCountByUser: Map<string, number>;
}

function buildPredicate(ds: ExamDataset, filters: AppliedFilters): (a: NormAttempt) => boolean {
  const f = normalizeApplied(filters);
  // batas periode yang tidak bisa di-parse → tidak ada attempt yang lolos (fail closed)
  const fromMs = f.from === null ? null : Date.parse(f.from);
  const toMs = f.to === null ? null : Date.parse(f.to);
  return (a) => {
    if (f.company !== null && (ds.users.get(a.userId)?.company ?? null) !== f.company) return false;
    if (f.department !== null && a.userDepartment !== f.department) return false;
    if (fromMs !== null && !(a.completedAtMs >= fromMs)) return false;
    if (toMs !== null && !(a.completedAtMs <= toMs)) return false;
    return true;
  };
}

function filterView(ds: ExamDataset, filters: AppliedFilters, firstAttempts: NormAttempt[]): FilteredView {
  const predicate = buildPredicate(ds, filters);
  // dedupe DULU baru filter (sama dengan Rekap Nilai)
  const valid = firstAttempts.filter(predicate);
  const rawMatching = ds.attempts.filter(predicate);
  const attemptCountByUser = new Map<string, number>();
  for (const a of rawMatching) attemptCountByUser.set(a.userId, (attemptCountByUser.get(a.userId) ?? 0) + 1);
  return { valid, rawMatching, attemptCountByUser };
}

export function applyFilters(ds: ExamDataset, filters: AppliedFilters): FilteredView {
  return filterView(ds, filters, selectFirstAttempts(ds.attempts));
}

// ═══════════════════════════════════════════════════════════════
// AGREGASI PER SOAL
// ═══════════════════════════════════════════════════════════════

interface QuestionMeta {
  q: NormQuestion;
  objective: boolean;
  typeLabel: string;
  textPreview: string;
  /** id opsi → index pertama (id kosong diabaikan agar tidak tertukar dengan "tidak menjawab"). */
  optionIndex: Map<string, number>;
  /** Kunci saat ini (soal objektif). */
  key: { label: string | null; text: string | null };
}

interface QuestionAcc {
  correct: number;
  wrong: number;
  empty: number;
  mismatch: number;
  optionCounts: number[];
  unknown: number;
  /** selectedAnswerId kosong (baris distribusi "Tidak menjawab"). */
  blank: number;
  pending: number;
  graded: number;
  gradedSum: number;
  gradedMin: number;
  gradedMax: number;
}

type Outcome = 'correct' | 'wrong' | 'empty' | 'pending' | 'graded';

function optionLabel(q: NormQuestion, idx: number): string {
  if (q.type === 'true_false') {
    const o = q.options[idx];
    return o.text || (o.id === 'true' ? 'Benar' : o.id === 'false' ? 'Salah' : o.id);
  }
  return OPTION_LETTERS[idx] ?? String(idx + 1);
}

const isKeyOption = (q: NormQuestion, optionId: string): boolean =>
  optionId !== '' && optionId === q.correctAnswerId;

export function describeAnswer(q: NormQuestion, optionId: string): { label: string | null; text: string | null } {
  const id = optionId === null || optionId === undefined ? '' : String(optionId);
  if (id === '') return { label: null, text: null };
  const idx = q.options.findIndex((o) => o.id === id);
  if (idx === -1) return { label: 'Lainnya', text: id };
  return { label: optionLabel(q, idx), text: q.options[idx].text };
}

function buildMeta(q: NormQuestion): QuestionMeta {
  const objective = isObjectiveType(q.type);
  const optionIndex = new Map<string, number>();
  q.options.forEach((o, i) => {
    if (o.id !== '' && !optionIndex.has(o.id)) optionIndex.set(o.id, i);
  });
  return {
    q,
    objective,
    typeLabel: questionTypeLabel(q.type),
    textPreview: previewText(q.questionText),
    optionIndex,
    key: objective ? describeAnswer(q, q.correctAnswerId) : { label: null, text: null },
  };
}

function getAnswer(a: NormAttempt, questionId: string): NormAnswer | undefined {
  const answers = a.answers;
  if (!answers || !hasOwn(answers, questionId)) return undefined;
  const ans = answers[questionId];
  return ans && typeof ans === 'object' ? ans : undefined;
}

/** Objektif: correct/wrong/empty dari isCorrect tersimpan. Selain itu (essay/studi kasus): empty/pending/graded. */
function outcomeOf(objective: boolean, ans: NormAnswer): Outcome {
  if (objective) {
    if (ans.isCorrect) return 'correct';
    return (ans.selectedAnswerId ?? '') === '' ? 'empty' : 'wrong';
  }
  if ((ans.essayAnswer || '').trim() === '') return 'empty';
  return ans.aiFeedback === PENDING_GRADING_FEEDBACK ? 'pending' : 'graded';
}

function newAcc(meta: QuestionMeta): QuestionAcc {
  return {
    correct: 0,
    wrong: 0,
    empty: 0,
    mismatch: 0,
    optionCounts: meta.q.options.map(() => 0),
    unknown: 0,
    blank: 0,
    pending: 0,
    graded: 0,
    gradedSum: 0,
    gradedMin: Infinity,
    gradedMax: -Infinity,
  };
}

function addAnswer(meta: QuestionMeta, acc: QuestionAcc, ans: NormAnswer): void {
  const outcome = outcomeOf(meta.objective, ans);
  if (outcome === 'correct') acc.correct += 1;
  else if (outcome === 'wrong') acc.wrong += 1;
  else if (outcome === 'empty') acc.empty += 1;
  else if (outcome === 'pending') acc.pending += 1;
  else {
    acc.graded += 1;
    acc.gradedSum += ans.pointsEarned;
    if (ans.pointsEarned < acc.gradedMin) acc.gradedMin = ans.pointsEarned;
    if (ans.pointsEarned > acc.gradedMax) acc.gradedMax = ans.pointsEarned;
  }

  if (!meta.objective) return;
  const selected = ans.selectedAnswerId ?? '';
  if ((selected === meta.q.correctAnswerId) !== ans.isCorrect) acc.mismatch += 1;
  if (selected === '') {
    acc.blank += 1;
  } else {
    const idx = meta.optionIndex.get(selected);
    if (idx === undefined) acc.unknown += 1;
    else acc.optionCounts[idx] += 1;
  }
}

/** O(attempt × soal): satu kali lewat untuk semua soal. */
function aggregateQuestions(metas: QuestionMeta[], attempts: NormAttempt[]): QuestionAcc[] {
  const accs = metas.map(newAcc);
  for (const a of attempts) {
    for (let i = 0; i < metas.length; i++) {
      const ans = getAnswer(a, metas[i].q.id);
      if (ans) addAnswer(metas[i], accs[i], ans);
    }
  }
  return accs;
}

function toQuestionStat(meta: QuestionMeta, acc: QuestionAcc): QuestionStat {
  const q = meta.q;
  const base = {
    no: q.no,
    questionId: q.id,
    type: q.type,
    typeLabel: meta.typeLabel,
    textPreview: meta.textPreview,
    materi: q.materi,
    points: q.points,
  };
  if (meta.objective) {
    const total = acc.correct + acc.wrong + acc.empty;
    const pctCorrect = pct(acc.correct, total);
    return {
      ...base,
      total,
      correct: acc.correct,
      wrong: acc.wrong,
      empty: acc.empty,
      pctCorrect,
      pctWrong: pct(acc.wrong, total),
      pctEmpty: pct(acc.empty, total),
      difficulty: difficultyFor(pctCorrect),
      essay: null,
      scoringMismatchCount: acc.mismatch,
    };
  }
  const answered = acc.pending + acc.graded;
  const total = acc.empty + answered;
  const hasGraded = acc.graded > 0;
  return {
    ...base,
    total,
    correct: null,
    wrong: null,
    empty: acc.empty,
    pctCorrect: null,
    pctWrong: null,
    pctEmpty: pct(acc.empty, total),
    difficulty: null,
    essay: {
      answered,
      graded: acc.graded,
      pending: acc.pending,
      avgScore: hasGraded ? round2(acc.gradedSum / acc.graded) : null,
      minScore: hasGraded ? round2(acc.gradedMin) : null,
      maxScore: hasGraded ? round2(acc.gradedMax) : null,
      maxPoint: q.points,
    },
    scoringMismatchCount: 0,
  };
}

function toDistribution(meta: QuestionMeta, acc: QuestionAcc): OptionDistributionRow[] {
  const q = meta.q;
  const total = acc.correct + acc.wrong + acc.empty;
  const rows = q.options.map(
    (o, idx): OptionDistributionRow => ({
      optionId: o.id,
      label: optionLabel(q, idx),
      text: o.text,
      count: acc.optionCounts[idx],
      pct: pct(acc.optionCounts[idx], total),
      isCorrect: isKeyOption(q, o.id),
      kind: 'option',
    })
  );
  if (acc.unknown > 0) {
    rows.push({
      optionId: UNKNOWN_OPTION_ID,
      label: 'Lainnya',
      text: 'Opsi tidak ditemukan pada soal saat ini',
      count: acc.unknown,
      pct: pct(acc.unknown, total),
      isCorrect: false,
      kind: 'unknown',
    });
  }
  rows.push({
    optionId: EMPTY_OPTION_ID,
    label: 'Tidak menjawab',
    text: '',
    count: acc.blank,
    pct: pct(acc.blank, total),
    isCorrect: false,
    kind: 'empty',
  });
  return rows;
}

function buildMaterials(metas: QuestionMeta[], accs: QuestionAcc[]): MaterialStat[] {
  const groups = new Map<string, MaterialStat>();
  metas.forEach((m, i) => {
    const key = m.q.materi || NO_MATERI_LABEL;
    let g = groups.get(key);
    if (!g) {
      g = {
        materi: key,
        questionCount: 0,
        objectiveQuestionCount: 0,
        correct: 0,
        wrong: 0,
        empty: 0,
        total: 0,
        pctCorrect: null,
      };
      groups.set(key, g);
    }
    g.questionCount += 1;
    if (m.objective) {
      g.objectiveQuestionCount += 1;
      g.correct += accs[i].correct;
      g.wrong += accs[i].wrong;
      g.empty += accs[i].empty;
    }
  });
  const list = [...groups.values()];
  for (const g of list) {
    g.total = g.correct + g.wrong + g.empty;
    g.pctCorrect = pct(g.correct, g.total);
  }
  // % benar terendah dulu (null paling akhir), lalu nama materi
  list.sort((a, b) => {
    if (a.pctCorrect !== b.pctCorrect) {
      if (a.pctCorrect === null) return 1;
      if (b.pctCorrect === null) return -1;
      return a.pctCorrect - b.pctCorrect;
    }
    return COLLATOR_ID.compare(a.materi, b.materi);
  });
  return list;
}

// ═══════════════════════════════════════════════════════════════
// PESERTA
// ═══════════════════════════════════════════════════════════════

/** Aturan status Rekap Nilai: ADA nilai answers dengan feedback "Menunggu penilaian manual dari Admin.". */
function hasPendingGrading(a: NormAttempt): boolean {
  const answers = a.answers || {};
  for (const key of Object.keys(answers)) {
    const ans = answers[key];
    if (ans && ans.aiFeedback === PENDING_GRADING_FEEDBACK) return true;
  }
  return false;
}

function identityOf(
  ds: ExamDataset,
  a: NormAttempt
): { name: string; company: string | null; department: string | null } {
  const user = ds.users.get(a.userId);
  return {
    name: a.userName || user?.name || a.userId,
    company: user?.company ?? null,
    department: a.userDepartment ?? user?.department ?? null,
  };
}

function buildParticipantRow(
  ds: ExamDataset,
  metas: QuestionMeta[],
  a: NormAttempt,
  attemptCountByUser: Map<string, number>
): ParticipantRow {
  let correct = 0;
  let wrong = 0;
  let empty = 0;
  let pendingEssay = 0;
  for (const m of metas) {
    const ans = getAnswer(a, m.q.id);
    if (!ans) continue;
    const outcome = outcomeOf(m.objective, ans);
    if (outcome === 'correct') correct += 1;
    else if (outcome === 'wrong') wrong += 1;
    else if (outcome === 'empty') empty += 1;
    else if (outcome === 'pending') pendingEssay += 1;
  }
  const who = identityOf(ds, a);
  return {
    userId: a.userId,
    attemptId: a.id,
    name: who.name,
    company: who.company,
    department: who.department,
    score: a.score,
    passed: a.passed,
    status: hasPendingGrading(a) ? STATUS_LABELS.pending : a.passed ? STATUS_LABELS.passed : STATUS_LABELS.failed,
    correct,
    wrong,
    empty,
    pendingEssay,
    attemptCount: attemptCountByUser.get(a.userId) || 1,
    completedAt: a.completedAt,
    durationSeconds: a.durationSecondsUsed,
  };
}

const compareByName = (a: { name: string; userId: string }, b: { name: string; userId: string }): number =>
  COLLATOR_ID_BASE.compare(a.name, b.name) || cmpCode(a.userId, b.userId);

// ═══════════════════════════════════════════════════════════════
// ENDPOINT: RINGKASAN
// ═══════════════════════════════════════════════════════════════

function examInfo(e: NormExam): ExamInfo {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    category: e.category,
    scope: e.scope,
    status: e.status,
    passingScore: e.passingScore,
    durationMinutes: e.durationMinutes,
    authorName: e.authorName,
    createdAt: e.createdAt,
    startTime: e.startTime,
    endTime: e.endTime,
  };
}

/** Opsi filter dari attempt pertama TANPA filter. Company hanya kode yang lolos parseFilters. */
function buildFilterOptions(ds: ExamDataset, firstAttempts: NormAttempt[]): FilterOptions {
  const companies = new Set<string>();
  const departments = new Set<string>();
  for (const a of firstAttempts) {
    const company = ds.users.get(a.userId)?.company ?? null;
    if (company !== null && (COMPANY_CODES as readonly string[]).includes(company)) companies.add(company);
    if (a.userDepartment !== null) departments.add(a.userDepartment);
  }
  return {
    companies: [...companies].sort(COLLATOR_ID.compare),
    departments: [...departments].sort(COLLATOR_ID.compare),
  };
}

export function computeSummary(
  ds: ExamDataset,
  filters: AppliedFilters,
  capabilities: AnalyticsCapabilities
): ExamAnalyticsSummaryResponse {
  const firstAttempts = selectFirstAttempts(ds.attempts);
  const view = filterView(ds, filters, firstAttempts);
  const valid = view.valid;
  const metas = ds.questions.map(buildMeta);
  const accs = aggregateQuestions(metas, valid);

  const questions = metas.map((m, i) => toQuestionStat(m, accs[i]));
  const distributions: Record<string, OptionDistributionRow[]> = {};
  metas.forEach((m, i) => {
    if (m.objective) setOwn(distributions, m.q.id, toDistribution(m, accs[i]));
  });

  const scoreDistribution: ScoreBin[] = SCORE_BINS.map((b) => ({ label: b.label, min: b.min, max: b.max, count: 0 }));
  let scoreSum = 0;
  let maxScore: number | null = null;
  let minScore: number | null = null;
  let passedCount = 0;
  let pendingGradingParticipants = 0;
  let firstMs = Infinity;
  let lastMs = -Infinity;
  let firstCompletedAt: string | null = null;
  let lastCompletedAt: string | null = null;
  for (const a of valid) {
    scoreSum += a.score;
    if (maxScore === null || a.score > maxScore) maxScore = a.score;
    if (minScore === null || a.score < minScore) minScore = a.score;
    if (a.passed) passedCount += 1;
    if (hasPendingGrading(a)) pendingGradingParticipants += 1;
    scoreDistribution[scoreBinIndex(a.score)].count += 1;
    if (Number.isFinite(a.completedAtMs)) {
      if (a.completedAtMs < firstMs) {
        firstMs = a.completedAtMs;
        firstCompletedAt = a.completedAt;
      }
      if (a.completedAtMs > lastMs) {
        lastMs = a.completedAtMs;
        lastCompletedAt = a.completedAt;
      }
    }
  }

  const totalParticipants = valid.length;
  const materialAvailable = ds.questions.some((q) => !!q.materi);
  let objectiveQuestionCount = 0;
  let objectiveCorrect = 0;
  let totalUnanswered = 0;
  metas.forEach((m, i) => {
    totalUnanswered += accs[i].empty;
    if (m.objective) {
      objectiveQuestionCount += 1;
      objectiveCorrect += accs[i].correct;
    }
  });

  return {
    exam: examInfo(ds.exam),
    filters: normalizeApplied(filters),
    filterOptions: buildFilterOptions(ds, firstAttempts),
    basisNote: ATTEMPT_BASIS_NOTE,
    summary: {
      totalParticipants,
      totalAttempts: view.rawMatching.length,
      avgScore: totalParticipants ? round2(scoreSum / totalParticipants) : null,
      maxScore,
      minScore,
      passedCount,
      failedCount: totalParticipants - passedCount,
      passRatePct: pct(passedCount, totalParticipants),
      avgCorrectObjective:
        totalParticipants && objectiveQuestionCount ? round2(objectiveCorrect / totalParticipants) : null,
      objectiveQuestionCount,
      totalUnanswered,
      pendingGradingParticipants,
      questionCount: ds.questions.length,
      firstCompletedAt,
      lastCompletedAt,
    },
    scoreDistribution,
    questions,
    distributions,
    materialAvailable,
    materials: materialAvailable ? buildMaterials(metas, accs) : [],
    capabilities: {
      canExport: !!capabilities?.canExport,
      canDownloadQuestions: !!capabilities?.canDownloadQuestions,
    },
    generatedAt: ds.loadedAt,
    truncated: ds.truncated,
  };
}

// ═══════════════════════════════════════════════════════════════
// ENDPOINT: DETAIL SOAL
// ═══════════════════════════════════════════════════════════════

export function computeQuestionDetail(
  ds: ExamDataset,
  filters: AppliedFilters,
  questionId: string
): QuestionDetailResponse | null {
  const q = ds.questions.find((x) => x.id === questionId);
  if (!q) return null;
  const meta = buildMeta(q);
  const view = applyFilters(ds, filters);
  const acc = newAcc(meta);
  const nonCorrect: ParticipantAnswerRow[] = [];

  for (const a of view.valid) {
    const ans = getAnswer(a, q.id);
    if (!ans) continue;
    addAnswer(meta, acc, ans);
    if (!meta.objective || ans.isCorrect) continue;
    const selected = ans.selectedAnswerId ?? '';
    const given = describeAnswer(q, selected);
    const who = identityOf(ds, a);
    nonCorrect.push({
      userId: a.userId,
      attemptId: a.id,
      name: who.name,
      company: who.company,
      department: who.department,
      status: selected === '' ? 'empty' : 'wrong',
      answerOptionId: selected || null,
      answerLabel: given.label,
      answerText: given.text,
      correctLabel: meta.key.label,
      correctText: meta.key.text,
      pointsEarned: ans.pointsEarned,
      maxPoints: q.points,
      completedAt: a.completedAt,
    });
  }

  // salah dulu, lalu tidak menjawab; masing-masing urut nama
  nonCorrect.sort((x, y) => {
    if (x.status !== y.status) return x.status === 'wrong' ? -1 : 1;
    return compareByName(x, y);
  });
  const truncated = nonCorrect.length > QUESTION_NON_CORRECT_ROWS_MAX;

  const question: QuestionDetailInfo = {
    no: q.no,
    questionId: q.id,
    type: q.type,
    typeLabel: meta.typeLabel,
    questionText: q.questionText,
    caseStudyStory: q.caseStudyStory,
    materi: q.materi,
    points: q.points,
    options: meta.objective
      ? q.options.map((o, idx) => ({
          optionId: o.id,
          label: optionLabel(q, idx),
          text: o.text,
          isCorrect: isKeyOption(q, o.id),
        }))
      : [],
    correctAnswer: meta.objective
      ? { optionId: q.correctAnswerId || null, label: meta.key.label, text: meta.key.text }
      : null,
    sampleAnswer: q.sampleAnswer,
    explanation: q.explanation,
  };

  return {
    exam: { id: ds.exam.id, title: ds.exam.title, scope: ds.exam.scope },
    filters: normalizeApplied(filters),
    question,
    stat: toQuestionStat(meta, acc),
    distribution: meta.objective ? toDistribution(meta, acc) : [],
    nonCorrectParticipants: truncated ? nonCorrect.slice(0, QUESTION_NON_CORRECT_ROWS_MAX) : nonCorrect,
    truncated,
    materialAvailable: ds.questions.some((x) => !!x.materi),
    generatedAt: ds.loadedAt,
  };
}

// ═══════════════════════════════════════════════════════════════
// ENDPOINT: PESERTA
// ═══════════════════════════════════════════════════════════════

/** Semua baris peserta (attempt pertama yang lolos filter), urut nama. */
export function computeParticipantRows(ds: ExamDataset, filters: AppliedFilters): ParticipantRow[] {
  const view = applyFilters(ds, filters);
  const metas = ds.questions.map(buildMeta);
  const rows = view.valid.map((a) => buildParticipantRow(ds, metas, a, view.attemptCountByUser));
  rows.sort(compareByName);
  return rows;
}

function participantSortValue(row: ParticipantRow, key: ParticipantSortKey): string | number | null {
  switch (key) {
    case 'company':
      return row.company;
    case 'department':
      return row.department;
    case 'score':
      return row.score;
    case 'correct':
      return row.correct;
    case 'wrong':
      return row.wrong;
    case 'empty':
      return row.empty;
    case 'completedAt': {
      const ms = row.completedAt ? Date.parse(row.completedAt) : NaN;
      return Number.isFinite(ms) ? ms : null;
    }
    default:
      return row.name;
  }
}

export function listParticipants(
  ds: ExamDataset,
  filters: AppliedFilters,
  query: { search?: string; sort?: string; dir?: string; page?: number | string; pageSize?: number | string }
): ParticipantListResponse {
  const qy = query || {};
  let rows = computeParticipantRows(ds, filters);

  const term = typeof qy.search === 'string' ? qy.search.trim().toLowerCase() : '';
  if (term) {
    rows = rows.filter((r) =>
      [r.name, r.department, r.company].some((v) => typeof v === 'string' && v.toLowerCase().includes(term))
    );
  }

  const sortKey: ParticipantSortKey = PARTICIPANT_SORT_KEYS.includes(qy.sort as ParticipantSortKey)
    ? (qy.sort as ParticipantSortKey)
    : 'name';
  const dir = qy.dir === 'asc' || qy.dir === 'desc' ? qy.dir : DESC_BY_DEFAULT.has(sortKey) ? 'desc' : 'asc';
  const sign = dir === 'desc' ? -1 : 1;
  const decorated = rows.map((r) => ({ r, v: participantSortValue(r, sortKey) }));
  decorated.sort((x, y) => {
    if (x.v !== y.v) {
      // null selalu paling akhir (asc maupun desc)
      if (x.v === null) return 1;
      if (y.v === null) return -1;
      const base =
        typeof x.v === 'number' && typeof y.v === 'number'
          ? x.v - y.v
          : COLLATOR_ID_BASE.compare(String(x.v), String(y.v));
      if (base !== 0) return sign * base;
    }
    return compareByName(x.r, y.r);
  });

  const parsedSize = toInt(qy.pageSize);
  const pageSize =
    parsedSize === null || parsedSize < 1 ? PARTICIPANT_PAGE_SIZE_DEFAULT : Math.min(parsedSize, PARTICIPANT_PAGE_SIZE_MAX);
  const total = decorated.length;
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const parsedPage = toInt(qy.page);
  const page = Math.min(parsedPage === null || parsedPage < 1 ? 1 : parsedPage, lastPage);
  const start = (page - 1) * pageSize;

  return {
    total,
    page,
    pageSize,
    rows: decorated.slice(start, start + pageSize).map((d) => d.r),
  };
}

export function computeParticipantDetail(
  ds: ExamDataset,
  filters: AppliedFilters,
  userId: string
): ParticipantDetailResponse | null {
  const view = applyFilters(ds, filters);
  // valid berisi paling banyak satu attempt per peserta
  const a = view.valid.find((x) => x.userId === userId);
  if (!a) return null;
  const metas = ds.questions.map(buildMeta);
  const participant = buildParticipantRow(ds, metas, a, view.attemptCountByUser);

  const wrongQuestions: ParticipantWrongQuestion[] = [];
  const essayQuestions: ParticipantEssayQuestion[] = [];
  for (const m of metas) {
    const ans = getAnswer(a, m.q.id);
    if (!ans) continue;
    const outcome = outcomeOf(m.objective, ans);
    if (m.objective) {
      if (outcome === 'correct') continue;
      const given = describeAnswer(m.q, ans.selectedAnswerId ?? '');
      wrongQuestions.push({
        no: m.q.no,
        questionId: m.q.id,
        type: m.q.type,
        typeLabel: m.typeLabel,
        materi: m.q.materi,
        textPreview: m.textPreview,
        status: outcome === 'empty' ? 'empty' : 'wrong',
        answerLabel: given.label,
        answerText: given.text,
        correctLabel: m.key.label,
        correctText: m.key.text,
        pointsEarned: ans.pointsEarned,
        maxPoints: m.q.points,
      });
    } else {
      essayQuestions.push({
        no: m.q.no,
        questionId: m.q.id,
        typeLabel: m.typeLabel,
        materi: m.q.materi,
        textPreview: m.textPreview,
        state: outcome as EssayState,
        pointsEarned: ans.pointsEarned,
        maxPoints: m.q.points,
      });
    }
  }

  return {
    exam: { id: ds.exam.id, title: ds.exam.title, scope: ds.exam.scope, passingScore: ds.exam.passingScore },
    participant,
    wrongQuestions,
    essayQuestions,
    materialAvailable: ds.questions.some((q) => !!q.materi),
    generatedAt: ds.loadedAt,
  };
}

// ═══════════════════════════════════════════════════════════════
// ENDPOINT: DETAIL KESALAHAN
// ═══════════════════════════════════════════════════════════════

/** Satu baris = satu jawaban objektif yang tidak benar (salah / tidak menjawab), urut nama lalu no soal. */
export function computeErrorRows(ds: ExamDataset, filters: AppliedFilters, limit?: number): ErrorRowsResponse {
  const parsedLimit = toInt(limit);
  const max =
    parsedLimit === null ? ERROR_ROWS_LIMIT_DEFAULT : Math.min(ERROR_ROWS_LIMIT_MAX, Math.max(1, parsedLimit));
  const view = applyFilters(ds, filters);
  const metas = ds.questions.map(buildMeta).filter((m) => m.objective);
  const people = view.valid
    .map((a) => ({ a, who: identityOf(ds, a) }))
    .sort((x, y) => compareByName({ name: x.who.name, userId: x.a.userId }, { name: y.who.name, userId: y.a.userId }));

  const rows: ErrorRow[] = [];
  let total = 0;
  for (const { a, who } of people) {
    for (const m of metas) {
      const ans = getAnswer(a, m.q.id);
      if (!ans || ans.isCorrect) continue;
      total += 1;
      // tetap dihitung untuk total, baris berhenti dibuat setelah batas
      if (rows.length >= max) continue;
      const selected = ans.selectedAnswerId ?? '';
      const given = describeAnswer(m.q, selected);
      rows.push({
        userId: a.userId,
        attemptId: a.id,
        name: who.name,
        company: who.company,
        department: who.department,
        no: m.q.no,
        questionId: m.q.id,
        materi: m.q.materi,
        textPreview: m.textPreview,
        status: selected === '' ? 'empty' : 'wrong',
        answerLabel: given.label,
        answerText: given.text,
        correctLabel: m.key.label,
        correctText: m.key.text,
        pointsEarned: ans.pointsEarned,
        maxPoints: m.q.points,
        completedAt: a.completedAt,
      });
    }
  }
  return { total, rows, truncated: total > max };
}
