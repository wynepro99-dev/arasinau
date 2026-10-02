import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import type { AnalyticsRouterDeps, SupabaseLike } from './types';

/**
 * Resolusi koneksi database untuk endpoint analitik.
 *
 * Di VPS, proses pm2 hanya membawa NODE_ENV (tanpa SUPABASE_* / VITE_*), dan server.ts
 * tidak memuat file .env. Karena itu, bila deps.getSupabase() (getAdminSupabase dari
 * server.ts) mengembalikan null, URL & key dibaca dari file .env* aplikasi — file yang
 * sama yang dipakai Vite saat build frontend — tanpa mengubah process.env.
 * Klien supabase-js berbicara ke PostgREST (Supabase atau PostgREST mandiri).
 */

/** Urutan prioritas file env mode production ala Vite (file pertama yang mendefinisikan key menang). */
export const ENV_FILE_PRIORITY = ['.env.production.local', '.env.production', '.env.local', '.env'] as const;

const URL_KEYS = ['SUPABASE_URL', 'VITE_SUPABASE_URL'] as const;
const KEY_KEYS = ['SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_ANON_KEY'] as const;

export interface EnvLookupOptions {
  /** Override direktori pencarian (test). */
  cwd?: string;
  /** Override process.env (test). */
  env?: Record<string, string | undefined>;
}

/** Parser .env sederhana: KEY=VALUE, prefix `export `, kutip tunggal/ganda, komentar `#`, CRLF. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let value = m[2];
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      const end = value.indexOf(quote, 1);
      value = end > 0 ? value.slice(1, end) : value.slice(1);
      if (quote === '"') value = value.replace(/\\n/g, '\n');
    } else {
      const hash = value.search(/\s#/);
      if (hash >= 0) value = value.slice(0, hash);
      value = value.trim();
    }
    out[key] = value;
  }
  return out;
}

function candidateDirs(opts?: EnvLookupOptions): string[] {
  if (opts?.cwd) return [opts.cwd];
  const dirs: string[] = [process.cwd()];
  const script = process.argv[1];
  if (script) {
    const scriptDir = path.dirname(path.resolve(script));
    dirs.push(scriptDir, path.dirname(scriptDir));
  }
  return Array.from(new Set(dirs));
}

/** Gabungan isi file env satu direktori sesuai prioritas (file berprioritas lebih tinggi menang). */
function readEnvFilesInDir(dir: string): Record<string, string> | null {
  let found = false;
  const merged: Record<string, string> = {};
  for (const name of ENV_FILE_PRIORITY) {
    const file = path.join(dir, name);
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    found = true;
    const parsed = parseEnvFile(text);
    for (const [k, v] of Object.entries(parsed)) {
      if (!(k in merged)) merged[k] = v;
    }
  }
  return found ? merged : null;
}

const FILE_ENV_TTL_MS = 60_000;
let fileEnvCache: { key: string; at: number; value: { dir: string; values: Record<string, string> } | null } | null = null;

/** Env dari file pada direktori pertama yang mendefinisikan URL database (di-cache 60 detik). */
export function loadFileEnv(opts?: EnvLookupOptions): { dir: string; values: Record<string, string> } | null {
  const dirs = candidateDirs(opts);
  const cacheKey = dirs.join('\u0000');
  const now = Date.now();
  if (!opts?.cwd && fileEnvCache && fileEnvCache.key === cacheKey && now - fileEnvCache.at < FILE_ENV_TTL_MS) {
    return fileEnvCache.value;
  }
  let result: { dir: string; values: Record<string, string> } | null = null;
  for (const dir of dirs) {
    const values = readEnvFilesInDir(dir);
    if (values && URL_KEYS.some((k) => values[k])) {
      result = { dir, values };
      break;
    }
  }
  if (!opts?.cwd) fileEnvCache = { key: cacheKey, at: now, value: result };
  return result;
}

/** process.env lebih dulu, lalu file env. Nilai tidak pernah ditulis ke log. */
export function readEnvValue(name: string, opts?: EnvLookupOptions): string | undefined {
  const env = opts?.env ?? process.env;
  const fromProcess = env[name];
  if (fromProcess) return fromProcess;
  const fileEnv = loadFileEnv(opts);
  const fromFile = fileEnv?.values[name];
  return fromFile || undefined;
}

function firstDefined(keys: readonly string[], opts?: EnvLookupOptions): { key: string; value: string } | null {
  for (const key of keys) {
    const value = readEnvValue(key, opts);
    if (value) return { key, value };
  }
  return null;
}

const clientCache = new Map<string, SupabaseLike>();
let loggedSource = '';

function logSourceOnce(source: string) {
  if (loggedSource === source) return;
  loggedSource = source;
  console.log(`[analytics] koneksi database: ${source}`);
}

/**
 * Klien database untuk analitik: deps.getSupabase() bila tersedia, selain itu dari env/file env.
 * null bila konfigurasi tidak ditemukan sama sekali (router menjawab 503).
 */
export function resolveAnalyticsClient(deps: AnalyticsRouterDeps, opts?: EnvLookupOptions): SupabaseLike | null {
  const injected = deps.getSupabase ? deps.getSupabase() : null;
  if (injected) {
    logSourceOnce('klien dari server.ts');
    return injected;
  }

  const url = firstDefined(URL_KEYS, opts);
  const key = firstDefined(KEY_KEYS, opts);
  if (!url || !key) return null;

  const cacheKey = `${url.value}\u0000${key.value}`;
  let client = clientCache.get(cacheKey);
  if (!client) {
    client = createClient(url.value, key.value, {
      auth: { persistSession: false, autoRefreshToken: false },
    }) as unknown as SupabaseLike;
    clientCache.set(cacheKey, client);
  }
  logSourceOnce(`${url.key} & ${key.key} (env proses / file .env aplikasi)`);
  return client;
}
