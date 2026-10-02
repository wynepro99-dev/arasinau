import { Capacitor } from '@capacitor/core';
import { getCurrentUser } from './storage';
import {
  ANALYTICS_ENDPOINTS,
  ApiErrorBody,
  ApiErrorCode,
  TokenResponse,
} from './analytics/contract';

/**
 * Klien HTTP untuk endpoint analitik di server Express (VPS).
 *
 * Autentikasi: aplikasi existing login di browser (tanpa sesi server), jadi klien
 * menukar kredensial user yang sedang login (sudah ada di memori storage) dengan
 * token bertanda tangan HMAC dari server. Token hanya disimpan di memori.
 * Seluruh otorisasi (role, company scope, kepemilikan paket) dicek ulang di server.
 */

export class AnalyticsApiError extends Error {
  status: number;
  code: ApiErrorCode;
  constructor(message: string, code: ApiErrorCode, status = 0) {
    super(message);
    this.name = 'AnalyticsApiError';
    this.code = code;
    this.status = status;
  }
}

type Params = Record<string, string | number | boolean | null | undefined>;

interface CachedToken {
  token: string;
  userId: string;
  expiresAtMs: number;
}

let cachedToken: CachedToken | null = null;
let inflightToken: Promise<CachedToken> | null = null;

const UNAVAILABLE_MESSAGE =
  'Server analitik tidak tersedia pada deployment ini. Fitur Analytics membutuhkan server aplikasi (VPS) yang menjalankan server.ts versi terbaru.';
const NATIVE_UNCONFIGURED_MESSAGE =
  'Di aplikasi Android, fitur Analytics membutuhkan alamat server (VITE_API_BASE_URL) saat build APK. Silakan gunakan versi web.';

function getApiBase(): string {
  const env = ((import.meta as any).env || {}) as Record<string, string | undefined>;
  return (env.VITE_API_BASE_URL || '').trim().replace(/\/+$/, '');
}

function buildUrl(path: string, params?: Params): string {
  const base = getApiBase();
  const search = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === undefined || v === '') continue;
      search.set(k, String(v));
    }
  }
  const qs = search.toString();
  return `${base}${path}${qs ? `?${qs}` : ''}`;
}

function ensureReachable() {
  if (Capacitor.isNativePlatform() && !getApiBase()) {
    throw new AnalyticsApiError(NATIVE_UNCONFIGURED_MESSAGE, 'unavailable');
  }
}

function isJson(res: Response): boolean {
  return (res.headers.get('content-type') || '').toLowerCase().includes('application/json');
}

async function toApiError(res: Response): Promise<AnalyticsApiError> {
  if (isJson(res)) {
    try {
      const body = (await res.json()) as Partial<ApiErrorBody>;
      if (body && typeof body.error === 'string' && body.code) {
        return new AnalyticsApiError(body.error, body.code as ApiErrorCode, res.status);
      }
    } catch {
      // fallthrough
    }
  }
  if (res.status === 404 || !isJson(res)) {
    return new AnalyticsApiError(UNAVAILABLE_MESSAGE, 'unavailable', res.status);
  }
  return new AnalyticsApiError(`Permintaan gagal (HTTP ${res.status}).`, 'internal', res.status);
}

async function requestToken(): Promise<CachedToken> {
  const user = getCurrentUser();
  if (!user) {
    throw new AnalyticsApiError('Sesi login tidak ditemukan. Silakan login ulang.', 'unauthenticated', 401);
  }
  if (user.role !== 'admin' && user.role !== 'egi') {
    throw new AnalyticsApiError('Akun Anda tidak memiliki akses ke fitur analitik.', 'forbidden', 403);
  }
  ensureReachable();

  let res: Response;
  try {
    res = await fetch(buildUrl(ANALYTICS_ENDPOINTS.token), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ userId: user.id, password: user.password || '' }),
    });
  } catch {
    throw new AnalyticsApiError('Tidak dapat terhubung ke server analitik. Periksa koneksi Anda.', 'unavailable');
  }
  if (!res.ok) throw await toApiError(res);
  if (!isJson(res)) throw new AnalyticsApiError(UNAVAILABLE_MESSAGE, 'unavailable', res.status);

  const body = (await res.json()) as TokenResponse;
  const expiresAtMs = Date.parse(body.expiresAt);
  return {
    token: body.token,
    userId: user.id,
    expiresAtMs: Number.isFinite(expiresAtMs) ? expiresAtMs : Date.now() + 10 * 60 * 1000,
  };
}

async function getToken(forceRefresh = false): Promise<string> {
  const user = getCurrentUser();
  const stillValid =
    cachedToken &&
    user &&
    cachedToken.userId === user.id &&
    cachedToken.expiresAtMs - Date.now() > 60 * 1000;
  if (!forceRefresh && stillValid) return cachedToken!.token;

  if (!inflightToken) {
    inflightToken = requestToken()
      .then((t) => {
        cachedToken = t;
        return t;
      })
      .finally(() => {
        inflightToken = null;
      });
  }
  const t = await inflightToken;
  return t.token;
}

/** Hapus token di memori (mis. setelah logout / ganti akun). */
export function clearAnalyticsToken() {
  cachedToken = null;
}

async function authorizedFetch(path: string, params: Params | undefined, accept: string): Promise<Response> {
  ensureReachable();
  const doFetch = async (force: boolean) => {
    const token = await getToken(force);
    try {
      return await fetch(buildUrl(path, params), {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: accept },
        cache: 'no-store',
      });
    } catch {
      throw new AnalyticsApiError('Tidak dapat terhubung ke server analitik. Periksa koneksi Anda.', 'unavailable');
    }
  };

  let res = await doFetch(false);
  if (res.status === 401) {
    // Token kadaluarsa / server restart → minta token baru sekali lalu ulangi.
    cachedToken = null;
    res = await doFetch(true);
  }
  return res;
}

/** GET JSON dari endpoint analitik (otomatis menyertakan token). */
export async function analyticsGetJson<T>(path: string, params?: Params): Promise<T> {
  const res = await authorizedFetch(path, params, 'application/json');
  if (!res.ok) throw await toApiError(res);
  if (!isJson(res)) throw new AnalyticsApiError(UNAVAILABLE_MESSAGE, 'unavailable', res.status);
  return (await res.json()) as T;
}

function fileNameFromDisposition(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''));
    } catch {
      // fallthrough
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}

/**
 * Download file (xlsx) dari endpoint analitik lalu picu unduhan browser
 * (pola yang sama dengan Export Excel existing: Blob + <a download>).
 * Mengembalikan nama file yang diunduh.
 */
export async function analyticsDownload(path: string, params: Params | undefined, fallbackFileName: string): Promise<string> {
  const res = await authorizedFetch(
    path,
    params,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/json'
  );
  if (!res.ok) throw await toApiError(res);
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) {
    throw new AnalyticsApiError(UNAVAILABLE_MESSAGE, 'unavailable', res.status);
  }

  const blob = await res.blob();
  const fileName = fileNameFromDisposition(res.headers.get('content-disposition')) || fallbackFileName;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  return fileName;
}

/** Pesan ramah (Bahasa Indonesia) untuk ditampilkan di toast / state error. */
export function describeAnalyticsError(err: unknown): string {
  if (err instanceof AnalyticsApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Terjadi kesalahan saat memuat data analitik.';
}
