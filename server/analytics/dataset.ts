import { isSuperAdminName, normalizeUserRole } from '../../src/lib/analytics/contract';
import { buildDataset } from './compute';
import type { AnalyticsUser, ExamDataset, SupabaseLike } from './types';

/**
 * Pemuatan data analitik — HANYA membaca (select). Tidak ada insert/update/delete.
 * Query yang dipakai didukung PostgREST mandiri maupun Supabase:
 * select, eq, in, order, range, maybeSingle.
 */

export const PAGE_SIZE = 1000;
export const MAX_ATTEMPT_ROWS = 50_000;
export const MAX_QUESTION_ROWS = 10_000;
const USER_ID_CHUNK = 100;

const ATTEMPT_COLUMNS =
  'id,exam_id,user_id,user_name,user_department,exam_title,score,total_points_earned,total_max_points,passed,started_at,completed_at,duration_seconds_used,answers';

export class DataLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataLoadError';
  }
}

interface QueryResult {
  data: any[] | null;
  error: { message?: string } | null;
  count?: number | null;
}

/**
 * Ambil semua baris dengan pagination yang tidak bergantung pada `db-max-rows` PostgREST:
 * minta count=exact, lalu maju sebanyak baris yang BENAR-BENAR diterima sampai mencapai count.
 */
export async function fetchAllRows(
  makeQuery: (from: number, to: number) => PromiseLike<QueryResult>,
  opts: { pageSize?: number; cap: number; label: string }
): Promise<{ rows: any[]; truncated: boolean }> {
  const pageSize = opts.pageSize ?? PAGE_SIZE;
  const rows: any[] = [];
  let total: number | null = null;

  for (;;) {
    const from = rows.length;
    if (from >= opts.cap) return { rows, truncated: total === null || total > rows.length };
    const to = Math.min(from + pageSize, opts.cap) - 1;
    const { data, error, count } = await makeQuery(from, to);
    if (error) throw new DataLoadError(`Gagal memuat ${opts.label}: ${error.message || 'unknown error'}`);
    const page = Array.isArray(data) ? data : [];
    if (typeof count === 'number' && Number.isFinite(count)) total = count;
    rows.push(...page);

    if (page.length === 0) break;
    if (total !== null) {
      if (rows.length >= total) break;
    } else if (page.length < to - from + 1) {
      break;
    }
  }
  return { rows, truncated: false };
}

function toAnalyticsUser(row: any): AnalyticsUser {
  const normalized = normalizeUserRole(row.role);
  const name = typeof row.name === 'string' ? row.name : '';
  return {
    id: String(row.id),
    name,
    role: typeof normalized.role === 'string' ? normalized.role : '',
    company: typeof row.company === 'string' && row.company ? row.company : null,
    isSuperAdmin: normalized.isSuperAdmin || isSuperAdminName(name),
  };
}

export interface DatasetLoaderOptions {
  /** TTL cache dataset per paket (ms). 0 = tanpa cache. */
  datasetTtlMs: number;
  /** TTL cache user terautentikasi (ms). */
  userTtlMs?: number;
  maxEntries?: number;
  now: () => number;
}

/** Loader per instance router (cache tidak bocor antar instance/test). */
export function createDatasetLoader(opts: DatasetLoaderOptions) {
  const userTtlMs = opts.userTtlMs ?? 30_000;
  const maxEntries = opts.maxEntries ?? 20;
  const datasetCache = new Map<string, { value: ExamDataset; expiresAt: number }>();
  const userCache = new Map<string, { value: AnalyticsUser | null; expiresAt: number }>();

  function remember<V>(
    cache: Map<string, { value: V; expiresAt: number }>,
    key: string,
    value: V,
    ttl: number,
    maxSize: number
  ) {
    if (ttl <= 0) return;
    cache.delete(key);
    cache.set(key, { value, expiresAt: opts.now() + ttl });
    while (cache.size > maxSize) {
      const oldest = cache.keys().next();
      if (oldest.done) break;
      cache.delete(oldest.value);
    }
  }

  async function loadExamRow(sb: SupabaseLike, examId: string): Promise<any | null> {
    const { data, error } = await sb.from('exam_packages').select('*').eq('id', examId).maybeSingle();
    if (error) throw new DataLoadError(`Gagal memuat paket ujian: ${error.message || 'unknown error'}`);
    return data || null;
  }

  /** User untuk otorisasi request (TANPA password), di-cache singkat. */
  async function loadAuthUser(sb: SupabaseLike, userId: string): Promise<AnalyticsUser | null> {
    const cached = userCache.get(userId);
    if (cached && cached.expiresAt > opts.now()) return cached.value;
    const { data, error } = await sb.from('users').select('id,name,role,company').eq('id', userId).maybeSingle();
    if (error) throw new DataLoadError(`Gagal memuat data user: ${error.message || 'unknown error'}`);
    const value = data ? toAnalyticsUser(data) : null;
    remember(userCache, userId, value, userTtlMs, 500);
    return value;
  }

  /** Khusus penerbitan token: satu-satunya tempat kolom password dibaca. Tidak di-cache. */
  async function loadUserForLogin(
    sb: SupabaseLike,
    userId: string
  ): Promise<{ user: AnalyticsUser; password: unknown } | null> {
    const { data, error } = await sb
      .from('users')
      .select('id,name,role,company,password')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw new DataLoadError(`Gagal memuat data user: ${error.message || 'unknown error'}`);
    if (!data) return null;
    return { user: toAnalyticsUser(data), password: data.password };
  }

  /** Semua baris soal satu paket (select * agar kolom materi di masa depan ikut terbaca). */
  function loadQuestionRows(sb: SupabaseLike, examId: string) {
    return fetchAllRows(
      (from, to) =>
        sb
          .from('questions')
          .select('*', { count: 'exact' })
          .eq('exam_id', examId)
          .order('id', { ascending: true })
          .range(from, to),
      { cap: MAX_QUESTION_ROWS, label: 'soal' }
    );
  }

  async function loadDataset(
    sb: SupabaseLike,
    examRow: any,
    load: { fresh?: boolean } = {}
  ): Promise<ExamDataset> {
    const examId = String(examRow.id);
    const cached = datasetCache.get(examId);
    if (!load.fresh && cached && cached.expiresAt > opts.now()) return cached.value;

    const questions = await loadQuestionRows(sb, examId);

    const attempts = await fetchAllRows(
      (from, to) =>
        sb
          .from('exam_attempts')
          .select(ATTEMPT_COLUMNS, { count: 'exact' })
          .eq('exam_id', examId)
          .order('id', { ascending: true })
          .range(from, to),
      { cap: MAX_ATTEMPT_ROWS, label: 'hasil ujian' }
    );

    const userIds = Array.from(
      new Set(attempts.rows.map((a) => (a?.user_id == null ? '' : String(a.user_id))).filter(Boolean))
    );
    const userRows: any[] = [];
    for (let i = 0; i < userIds.length; i += USER_ID_CHUNK) {
      const chunk = userIds.slice(i, i + USER_ID_CHUNK);
      const { data, error } = await sb.from('users').select('id,name,company,department').in('id', chunk);
      if (error) throw new DataLoadError(`Gagal memuat data peserta: ${error.message || 'unknown error'}`);
      if (Array.isArray(data)) userRows.push(...data);
    }

    const dataset = buildDataset({
      examRow,
      questionRows: questions.rows,
      attemptRows: attempts.rows,
      userRows,
      loadedAt: new Date(opts.now()).toISOString(),
      truncated: attempts.truncated || questions.truncated,
    });
    if (attempts.truncated) {
      console.warn(`[analytics] attempt paket ${examId} dipotong di ${MAX_ATTEMPT_ROWS} baris.`);
    }
    remember(datasetCache, examId, dataset, opts.datasetTtlMs, maxEntries);
    return dataset;
  }

  return { loadExamRow, loadAuthUser, loadUserForLogin, loadQuestionRows, loadDataset };
}

export type DatasetLoader = ReturnType<typeof createDatasetLoader>;
