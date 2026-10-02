import express, { NextFunction, Request, Response, Router } from 'express';
import {
  AnalyticsCapabilities,
  ApiErrorBody,
  ApiErrorCode,
  ERROR_ROWS_LIMIT_DEFAULT,
  ERROR_ROWS_LIMIT_MAX,
  PermissionExam,
  PermissionUser,
  QUERY_KEYS,
  TokenResponse,
  canDownloadExamQuestions,
  canExportExamAnalytics,
  canViewExamAnalytics,
  isAnalyticsRole,
} from '../../src/lib/analytics/contract';
import { FailureRateLimiter, TOKEN_TTL_MS, passwordMatches, resolveTokenSecret, signToken, verifyToken } from './auth';
import {
  computeErrorRows,
  computeParticipantDetail,
  computeParticipantRows,
  computeQuestionDetail,
  computeSummary,
  listParticipants,
  normalizeExam,
  normalizeQuestions,
  parseFilters,
} from './compute';
import { readEnvValue, resolveAnalyticsClient } from './dbConfig';
import { DataLoadError, createDatasetLoader } from './dataset';
import { buildAnalyticsWorkbook, buildQuestionDetailWorkbook, buildQuestionSheetWorkbook, contentDisposition } from './exports';
import type { AnalyticsRouterDeps, AnalyticsUser, NormExam, SupabaseLike, XlsxSheet } from './types';
import { XLSX_MIME, buildXlsx } from './xlsx';

/**
 * Router Exam Analytics + Download Soal (dipasang di ANALYTICS_API_PREFIX oleh server.ts).
 * Semua endpoint read-only. Autentikasi: token Bearer dari /auth/token. Otorisasi
 * (role, company scope, pembuat paket) dicek di sini untuk SETIAP request.
 */

class HttpError extends Error {
  status: number;
  code: ApiErrorCode;
  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_ALLOWED_ORIGINS = ['capacitor://localhost', 'https://localhost', 'http://localhost'];
const MAX_ID_LENGTH = 200;

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

function wrap(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

function sendError(res: Response, status: number, code: ApiErrorCode, message: string) {
  const body: ApiErrorBody = { error: message, code };
  res.status(status).json(body);
}

/** Nilai query pertama yang berupa string (parameter berulang diabaikan). */
function queryString(v: unknown): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' ? s : undefined;
}

function flatQuery(q: Request['query']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(q || {})) {
    const s = queryString(v);
    if (s !== undefined) out[k] = s;
  }
  return out;
}

function isTruthyFlag(v: unknown): boolean {
  const s = queryString(v);
  return s === '1' || s === 'true';
}

function requireId(value: unknown, label: string): string {
  const id = typeof value === 'string' ? value : '';
  if (!id || id.length > MAX_ID_LENGTH) throw new HttpError(400, 'bad_request', `${label} tidak valid.`);
  return id;
}

/** IP klien. Di belakang nginx lokal, ambil X-Forwarded-For pertama; selain itu alamat socket. */
function clientIp(req: Request): string {
  const socketIp = req.socket?.remoteAddress || '';
  const isLoopback = socketIp === '127.0.0.1' || socketIp === '::1' || socketIp === '::ffff:127.0.0.1';
  const forwarded = req.headers['x-forwarded-for'];
  if (isLoopback && typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return socketIp || 'unknown';
}

function toPermissionUser(user: AnalyticsUser): PermissionUser {
  return { id: user.id, name: user.name, role: user.role, company: user.company, isSuperAdmin: user.isSuperAdmin };
}

function toPermissionExam(exam: NormExam): PermissionExam {
  return { id: exam.id, scope: exam.scope, authorName: exam.authorName };
}

export function createAnalyticsRouter(deps: AnalyticsRouterDeps): Router {
  const router = express.Router();
  const now = deps.now ?? (() => Date.now());
  const loader = createDatasetLoader({ datasetTtlMs: deps.datasetCacheTtlMs ?? 30_000, now });
  const failuresByUser = new FailureRateLimiter(10);
  const failuresByIp = new FailureRateLimiter(50);

  const { secret, source } = resolveTokenSecret(deps.tokenSecret, deps.envLookup);
  if (source === 'random') {
    console.warn(
      '[analytics] ANALYTICS_TOKEN_SECRET belum diset — memakai secret acak per proses (token berlaku sampai server restart, klien otomatis meminta token baru).'
    );
  }

  const allowedOrigins = new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...(readEnvValue('ANALYTICS_ALLOWED_ORIGINS', deps.envLookup) || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ]);

  function getClient(): SupabaseLike {
    const sb = resolveAnalyticsClient(deps, deps.envLookup);
    if (!sb) throw new HttpError(503, 'unavailable', 'Database belum dikonfigurasi di server.');
    return sb;
  }

  // ── Header keamanan + CORS (khusus router ini) ──
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const origin = req.headers.origin;
    if (typeof origin === 'string' && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.vary('Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // ── Penerbitan token ──
  router.post(
    '/auth/token',
    express.json({ limit: '10kb' }),
    wrap(async (req, res) => {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!userId || userId.length > MAX_ID_LENGTH || !password) {
        throw new HttpError(400, 'bad_request', 'userId dan password wajib diisi.');
      }

      const t = now();
      const ip = clientIp(req);
      if (failuresByUser.isLimited(userId, t) || failuresByIp.isLimited(ip, t)) {
        throw new HttpError(429, 'rate_limited', 'Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit.');
      }

      const sb = getClient();
      const found = await loader.loadUserForLogin(sb, userId);
      if (!found || !passwordMatches(password, found.password)) {
        failuresByUser.recordFailure(userId, t);
        failuresByIp.recordFailure(ip, t);
        throw new HttpError(401, 'invalid_credentials', 'Verifikasi akun gagal. Silakan logout lalu login ulang.');
      }
      if (!isAnalyticsRole(found.user.role)) {
        throw new HttpError(403, 'forbidden', 'Akun Anda tidak memiliki akses ke fitur analitik.');
      }

      const exp = t + TOKEN_TTL_MS;
      const response: TokenResponse = {
        token: signToken({ v: 1, uid: found.user.id, iat: t, exp }, secret),
        expiresAt: new Date(exp).toISOString(),
        user: {
          id: found.user.id,
          name: found.user.name,
          role: found.user.role,
          company: found.user.company,
          isSuperAdmin: found.user.isSuperAdmin,
        },
      };
      res.json(response);
    })
  );

  // ── Autentikasi & otorisasi per request ──
  async function authenticate(req: Request): Promise<{ user: AnalyticsUser; sb: SupabaseLike }> {
    const header = req.headers.authorization;
    const m = typeof header === 'string' ? /^Bearer\s+(\S+)\s*$/i.exec(header) : null;
    if (!m) throw new HttpError(401, 'unauthenticated', 'Autentikasi diperlukan.');
    const verified = verifyToken(m[1], secret, now());
    if ('reason' in verified) {
      throw new HttpError(
        401,
        verified.reason === 'malformed' ? 'unauthenticated' : 'token_invalid',
        'Sesi analitik tidak valid atau kedaluwarsa.'
      );
    }
    const sb = getClient();
    const user = await loader.loadAuthUser(sb, verified.payload.uid);
    if (!user) throw new HttpError(401, 'token_invalid', 'Akun tidak ditemukan.');
    if (!isAnalyticsRole(user.role)) {
      throw new HttpError(403, 'forbidden', 'Akun Anda tidak memiliki akses ke fitur analitik.');
    }
    return { user, sb };
  }

  type Permission = 'view' | 'export' | 'download';

  async function examContext(req: Request, permission: Permission) {
    const { user, sb } = await authenticate(req);
    const examId = requireId(req.params.examId, 'ID paket');
    const examRow = await loader.loadExamRow(sb, examId);
    if (!examRow) throw new HttpError(404, 'not_found', 'Paket ujian tidak ditemukan.');

    const exam = normalizeExam(examRow);
    const permUser = toPermissionUser(user);
    const permExam = toPermissionExam(exam);
    const allowed =
      permission === 'download'
        ? canDownloadExamQuestions(permUser, permExam)
        : permission === 'export'
          ? canExportExamAnalytics(permUser, permExam)
          : canViewExamAnalytics(permUser, permExam);
    if (!allowed) {
      throw new HttpError(
        403,
        'forbidden',
        permission === 'download'
          ? 'Download soal hanya untuk admin pembuat paket atau super admin.'
          : 'Paket ujian di luar akses Anda.'
      );
    }

    const capabilities: AnalyticsCapabilities = {
      canExport: canExportExamAnalytics(permUser, permExam),
      canDownloadQuestions: canDownloadExamQuestions(permUser, permExam),
    };
    return { user, sb, examRow, exam, capabilities };
  }

  function filtersFrom(req: Request) {
    const parsed = parseFilters(flatQuery(req.query));
    if ('error' in parsed) throw new HttpError(400, 'bad_request', parsed.error);
    return parsed.filters;
  }

  async function datasetFor(req: Request, ctx: { sb: SupabaseLike; examRow: any }) {
    return loader.loadDataset(ctx.sb, ctx.examRow, { fresh: isTruthyFlag(req.query[QUERY_KEYS.fresh]) });
  }

  function sendWorkbook(res: Response, wb: { sheets: XlsxSheet[]; fileName: string }) {
    const buf = buildXlsx(wb.sheets, {
      title: wb.fileName.replace(/\.xlsx$/i, ''),
      creator: 'Ara Sinau',
      createdAt: new Date(now()).toISOString(),
    });
    res.status(200);
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', contentDisposition(wb.fileName));
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  }

  // ── Endpoint analitik ──
  router.get(
    '/exams/:examId/summary',
    wrap(async (req, res) => {
      const ctx = await examContext(req, 'view');
      const filters = filtersFrom(req);
      const ds = await datasetFor(req, ctx);
      res.json(computeSummary(ds, filters, ctx.capabilities));
    })
  );

  router.get(
    '/exams/:examId/questions/:questionId/export.xlsx',
    wrap(async (req, res) => {
      const ctx = await examContext(req, 'export');
      const questionId = requireId(req.params.questionId, 'ID soal');
      const filters = filtersFrom(req);
      const ds = await datasetFor(req, ctx);
      const detail = computeQuestionDetail(ds, filters, questionId);
      if (!detail) throw new HttpError(404, 'not_found', 'Soal tidak ditemukan pada paket ini.');
      sendWorkbook(res, buildQuestionDetailWorkbook(detail, { nowMs: now() }));
    })
  );

  router.get(
    '/exams/:examId/questions/:questionId',
    wrap(async (req, res) => {
      const ctx = await examContext(req, 'view');
      const questionId = requireId(req.params.questionId, 'ID soal');
      const filters = filtersFrom(req);
      const ds = await datasetFor(req, ctx);
      const detail = computeQuestionDetail(ds, filters, questionId);
      if (!detail) throw new HttpError(404, 'not_found', 'Soal tidak ditemukan pada paket ini.');
      res.json(detail);
    })
  );

  router.get(
    '/exams/:examId/participants',
    wrap(async (req, res) => {
      const ctx = await examContext(req, 'view');
      const filters = filtersFrom(req);
      const ds = await datasetFor(req, ctx);
      res.json(
        listParticipants(ds, filters, {
          search: queryString(req.query[QUERY_KEYS.search]),
          sort: queryString(req.query[QUERY_KEYS.sort]),
          dir: queryString(req.query[QUERY_KEYS.dir]),
          page: queryString(req.query[QUERY_KEYS.page]),
          pageSize: queryString(req.query[QUERY_KEYS.pageSize]),
        })
      );
    })
  );

  router.get(
    '/exams/:examId/participants/:userId',
    wrap(async (req, res) => {
      const ctx = await examContext(req, 'view');
      const userId = requireId(req.params.userId, 'ID peserta');
      const filters = filtersFrom(req);
      const ds = await datasetFor(req, ctx);
      const detail = computeParticipantDetail(ds, filters, userId);
      if (!detail) throw new HttpError(404, 'not_found', 'Peserta tidak ditemukan pada paket / filter ini.');
      res.json(detail);
    })
  );

  router.get(
    '/exams/:examId/errors',
    wrap(async (req, res) => {
      const ctx = await examContext(req, 'view');
      const filters = filtersFrom(req);
      const rawLimit = Number(queryString(req.query[QUERY_KEYS.limit]));
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), ERROR_ROWS_LIMIT_MAX) : ERROR_ROWS_LIMIT_DEFAULT;
      const ds = await datasetFor(req, ctx);
      res.json(computeErrorRows(ds, filters, limit));
    })
  );

  router.get(
    '/exams/:examId/export.xlsx',
    wrap(async (req, res) => {
      const ctx = await examContext(req, 'export');
      const filters = filtersFrom(req);
      const ds = await datasetFor(req, ctx);
      const summary = computeSummary(ds, filters, ctx.capabilities);
      const errors = computeErrorRows(ds, filters, ERROR_ROWS_LIMIT_MAX);
      const questionTexts: Record<string, string> = {};
      for (const q of ds.questions) questionTexts[q.id] = q.questionText;
      sendWorkbook(
        res,
        buildAnalyticsWorkbook({
          summary,
          participants: computeParticipantRows(ds, filters),
          errors: errors.rows,
          errorsTruncated: errors.truncated,
          questionTexts,
          nowMs: now(),
        })
      );
    })
  );

  router.get(
    '/exams/:examId/download-soal.xlsx',
    wrap(async (req, res) => {
      const ctx = await examContext(req, 'download');
      const withKey = isTruthyFlag(req.query[QUERY_KEYS.withKey]);
      const { rows, truncated } = await loader.loadQuestionRows(ctx.sb, ctx.exam.id);
      if (truncated) console.warn(`[analytics] soal paket ${ctx.exam.id} dipotong saat download.`);
      sendWorkbook(res, buildQuestionSheetWorkbook(ctx.exam, normalizeQuestions(rows), { withKey, nowMs: now() }));
    })
  );

  // ── Path analitik lain → 404 JSON (tidak jatuh ke index.html SPA) ──
  router.use((_req, res) => {
    sendError(res, 404, 'not_found', 'Endpoint analitik tidak ditemukan.');
  });

  // ── Error handler JSON ──
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      sendError(res, err.status, err.code, err.message);
      return;
    }
    if (err?.type === 'entity.too.large') {
      sendError(res, 413, 'bad_request', 'Permintaan terlalu besar.');
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      sendError(res, 400, 'bad_request', 'Body JSON tidak valid.');
      return;
    }
    console.error('[analytics] error:', err instanceof DataLoadError ? err.message : err);
    if (res.headersSent) {
      res.end();
      return;
    }
    sendError(res, 500, 'internal', 'Terjadi kesalahan saat memproses analitik.');
  });

  return router;
}
