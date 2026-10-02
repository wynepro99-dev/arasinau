import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadFileEnv, parseEnvFile, readEnvValue, resolveAnalyticsClient } from '../../server/analytics/dbConfig';
import { fetchAllRows } from '../../server/analytics/dataset';

const tmpDirs: string[] = [];
function tempDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ara-analytics-dbconfig-'));
  tmpDirs.push(dir);
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

after(() => {
  for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
});

describe('parseEnvFile', () => {
  test('format umum .env', () => {
    const parsed = parseEnvFile(
      [
        '﻿# komentar',
        '',
        'PLAIN=nilai',
        'export EXPORTED=ya',
        'DOUBLE="dengan # pagar"',
        "SINGLE='kutip tunggal'",
        'INLINE=abc # komentar inline',
        'EMPTY=',
        'SPACED = rapi ',
        'baris tidak valid',
        'WIN=crlf\r',
      ].join('\n')
    );
    assert.equal(parsed.PLAIN, 'nilai');
    assert.equal(parsed.EXPORTED, 'ya');
    assert.equal(parsed.DOUBLE, 'dengan # pagar');
    assert.equal(parsed.SINGLE, 'kutip tunggal');
    assert.equal(parsed.INLINE, 'abc');
    assert.equal(parsed.EMPTY, '');
    assert.equal(parsed.SPACED, 'rapi');
    assert.equal(parsed.WIN, 'crlf');
    assert.equal(Object.keys(parsed).includes('baris'), false);
  });
});

describe('prioritas file env (sama dengan Vite mode production)', () => {
  test('.env.production.local > .env.production > .env.local > .env', () => {
    const dir = tempDir({
      '.env': 'VITE_SUPABASE_URL=https://dari-env\nVITE_SUPABASE_ANON_KEY=key-env\nHANYA_DI_ENV=1\n',
      '.env.local': 'VITE_SUPABASE_URL=https://dari-env-local\n',
      '.env.production': 'VITE_SUPABASE_ANON_KEY=key-production\n',
    });
    const loaded = loadFileEnv({ cwd: dir });
    assert.ok(loaded);
    assert.equal(loaded!.values.VITE_SUPABASE_URL, 'https://dari-env-local');
    assert.equal(loaded!.values.VITE_SUPABASE_ANON_KEY, 'key-production');
    assert.equal(loaded!.values.HANYA_DI_ENV, '1');
  });

  test('process.env menang atas file; file dipakai bila env kosong', () => {
    const dir = tempDir({ '.env': 'VITE_SUPABASE_URL=https://file\nANALYTICS_TOKEN_SECRET=dari-file\n' });
    assert.equal(readEnvValue('ANALYTICS_TOKEN_SECRET', { cwd: dir, env: {} }), 'dari-file');
    assert.equal(
      readEnvValue('ANALYTICS_TOKEN_SECRET', { cwd: dir, env: { ANALYTICS_TOKEN_SECRET: 'dari-proses' } }),
      'dari-proses'
    );
  });

  test('direktori tanpa URL database diabaikan', () => {
    const dir = tempDir({ '.env': 'LAIN=1\n' });
    assert.equal(loadFileEnv({ cwd: dir }), null);
  });
});

describe('resolveAnalyticsClient', () => {
  test('klien dari server.ts (getAdminSupabase) dipakai lebih dulu', () => {
    const injected = { from: () => null };
    assert.equal(resolveAnalyticsClient({ getSupabase: () => injected }, { cwd: tempDir({}), env: {} }), injected);
  });

  test('fallback ke file .env bila env proses kosong (kondisi pm2 di VPS)', () => {
    const dir = tempDir({
      '.env': 'VITE_SUPABASE_URL=http://127.0.0.1:9\nVITE_SUPABASE_ANON_KEY=anon-test\n',
    });
    const client = resolveAnalyticsClient({ getSupabase: () => null }, { cwd: dir, env: {} });
    assert.ok(client && typeof client.from === 'function');
  });

  test('tanpa konfigurasi sama sekali → null (router menjawab 503)', () => {
    assert.equal(resolveAnalyticsClient({ getSupabase: () => null }, { cwd: tempDir({}), env: {} }), null);
  });
});

describe('fetchAllRows (pagination aman untuk db-max-rows)', () => {
  const all = Array.from({ length: 23 }, (_, i) => ({ id: i }));

  test('halaman dipotong server (7 baris) tetap terkumpul lengkap memakai count', async () => {
    const { rows, truncated } = await fetchAllRows(
      async (from, to) => ({ data: all.slice(from, Math.min(to + 1, from + 7)), error: null, count: all.length }),
      { pageSize: 10, cap: 1000, label: 'uji' }
    );
    assert.equal(rows.length, 23);
    assert.deepEqual(rows.map((r) => r.id), all.map((r) => r.id));
    assert.equal(truncated, false);
  });

  test('tanpa count: berhenti pada halaman pendek', async () => {
    const { rows } = await fetchAllRows(
      async (from, to) => ({ data: all.slice(from, to + 1), error: null, count: null }),
      { pageSize: 10, cap: 1000, label: 'uji' }
    );
    assert.equal(rows.length, 23);
  });

  test('batas aman → truncated', async () => {
    const { rows, truncated } = await fetchAllRows(
      async (from, to) => ({ data: all.slice(from, to + 1), error: null, count: all.length }),
      { pageSize: 10, cap: 15, label: 'uji' }
    );
    assert.equal(rows.length, 15);
    assert.equal(truncated, true);
  });

  test('error database dilempar', async () => {
    await assert.rejects(
      fetchAllRows(async () => ({ data: null, error: { message: 'boom' }, count: null }), { cap: 10, label: 'uji' }),
      /Gagal memuat uji: boom/
    );
  });
});
