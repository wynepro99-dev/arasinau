import crypto from 'crypto';
import { EnvLookupOptions, readEnvValue } from './dbConfig';

/**
 * Token akses analitik: base64url(payload) + '.' + base64url(HMAC-SHA256).
 * Payload hanya berisi id user & waktu; role/company selalu dibaca ulang dari database
 * di setiap request, sehingga perubahan role langsung berlaku.
 */

export const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

export interface TokenPayload {
  v: 1;
  uid: string;
  /** ms epoch */
  iat: number;
  /** ms epoch */
  exp: number;
}

export type TokenSecretSource = 'explicit' | 'env' | 'service_role' | 'random';

/**
 * Urutan: secret eksplisit (test) → ANALYTICS_TOKEN_SECRET → turunan SUPABASE_SERVICE_ROLE_KEY
 * → acak per proses (token hilang saat restart; klien otomatis minta token baru).
 * Anon key TIDAK pernah dipakai karena bersifat publik.
 */
export function resolveTokenSecret(
  explicit?: string,
  lookup?: EnvLookupOptions
): { secret: Buffer; source: TokenSecretSource } {
  if (explicit) return { secret: Buffer.from(explicit, 'utf8'), source: 'explicit' };
  const fromEnv = readEnvValue('ANALYTICS_TOKEN_SECRET', lookup);
  if (fromEnv) return { secret: Buffer.from(fromEnv, 'utf8'), source: 'env' };
  const serviceRole = readEnvValue('SUPABASE_SERVICE_ROLE_KEY', lookup);
  if (serviceRole) {
    return {
      secret: crypto.createHmac('sha256', serviceRole).update('ara-analytics-token-v1').digest(),
      source: 'service_role',
    };
  }
  return { secret: crypto.randomBytes(32), source: 'random' };
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(part: string, secret: Buffer): string {
  return b64url(crypto.createHmac('sha256', secret).update(part).digest());
}

export function signToken(payload: TokenPayload, secret: Buffer): string {
  const part = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `${part}.${sign(part, secret)}`;
}

export type VerifyResult =
  | { ok: true; payload: TokenPayload }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function verifyToken(token: string, secret: Buffer, nowMs: number): VerifyResult {
  if (typeof token !== 'string' || token.length > 4096) return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };

  const expected = Buffer.from(sign(parts[0], secret), 'utf8');
  const given = Buffer.from(parts[1], 'utf8');
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return { ok: false, reason: 'bad_signature' };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(fromB64url(parts[0]).toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (
    !payload ||
    payload.v !== 1 ||
    typeof payload.uid !== 'string' ||
    !payload.uid ||
    !Number.isFinite(payload.iat) ||
    !Number.isFinite(payload.exp)
  ) {
    return { ok: false, reason: 'malformed' };
  }
  if (nowMs >= payload.exp) return { ok: false, reason: 'expired' };
  return { ok: true, payload };
}

/** Sama dengan AuthModal: password tersimpan kosong/null → '123456'. Perbandingan timing-safe. */
export function passwordMatches(provided: unknown, stored: unknown): boolean {
  if (typeof provided !== 'string' || provided.length === 0 || provided.length > 1024) return false;
  const expectedPassword = typeof stored === 'string' && stored ? stored : '123456';
  const a = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const b = crypto.createHash('sha256').update(expectedPassword, 'utf8').digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Pembatas percobaan GAGAL per kunci (userId / IP): maks `maxFailures` dalam `windowMs`.
 * Berbasis memori dan dibatasi ukurannya.
 */
export class FailureRateLimiter {
  private readonly entries = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly maxFailures = 10,
    private readonly windowMs = 15 * 60 * 1000,
    private readonly maxKeys = 5000
  ) {}

  isLimited(key: string, nowMs: number): boolean {
    const e = this.entries.get(key);
    if (!e) return false;
    if (nowMs >= e.resetAt) {
      this.entries.delete(key);
      return false;
    }
    return e.count >= this.maxFailures;
  }

  recordFailure(key: string, nowMs: number): void {
    const e = this.entries.get(key);
    if (e && nowMs < e.resetAt) {
      e.count += 1;
      return;
    }
    if (this.entries.size >= this.maxKeys) this.evict(nowMs);
    this.entries.set(key, { count: 1, resetAt: nowMs + this.windowMs });
  }

  private evict(nowMs: number) {
    for (const [k, e] of this.entries) {
      if (nowMs >= e.resetAt) this.entries.delete(k);
    }
    // Masih penuh → buang yang paling lama (urutan sisip Map).
    while (this.entries.size >= this.maxKeys) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }
}
