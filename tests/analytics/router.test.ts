import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import type { AddressInfo } from 'net';
import express from 'express';
import { ANALYTICS_API_PREFIX } from '../../src/lib/analytics/contract';
import { createAnalyticsRouter } from '../../server/analytics';
import { XLSX_MIME } from '../../server/analytics/xlsx';
import { FakeSupabase } from './fakeSupabase';
import {
  EXAM_IDS,
  FIXTURE_PASSWORDS,
  MAIN_EXAM_EXPECTED_SUMMARY,
  QUESTION_IDS,
  USER_IDS,
  fixtureTables,
} from './fixtures';

/**
 * Test integrasi router analitik: Express sungguhan + fake database in-memory.
 * envLookup selalu menunjuk ke direktori kosong → test tidak pernah membaca .env asli
 * (yang menunjuk ke database produksi).
 */

const EMPTY_ENV_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ara-analytics-env-'));
const ENV_LOOKUP = { cwd: EMPTY_ENV_DIR, env: {} as Record<string, string | undefined> };

let fake: FakeSupabase;
let clock = Date.parse('2026-10-05T03:00:00.000Z');
let server: ReturnType<express.Express['listen']>;
let base = '';

function startApp(getSupabase: () => any): Promise<{ server: ReturnType<express.Express['listen']>; base: string }> {
  const app = express();
  app.use(express.json());
  app.use(
    ANALYTICS_API_PREFIX,
    createAnalyticsRouter({ getSupabase, tokenSecret: 'test-secret', datasetCacheTtlMs: 0, now: () => clock, envLookup: ENV_LOOKUP })
  );
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => {
      const { port } = s.address() as AddressInfo;
      resolve({ server: s, base: `http://127.0.0.1:${port}${ANALYTICS_API_PREFIX}` });
    });
  });
}

before(async () => {
  fake = new FakeSupabase(structuredClone(fixtureTables) as any);
  const started = await startApp(() => fake);
  server = started.server;
  base = started.base;
});

after(() => {
  server?.close();
  fs.rmSync(EMPTY_ENV_DIR, { recursive: true, force: true });
});

beforeEach(() => {
  fake.failingTables.clear();
  fake.maxRows = null;
});

async function issueToken(userId: string, password = FIXTURE_PASSWORDS[userId] ?? '123456') {
  return fetch(`${base}/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, password }),
  });
}

const tokens = new Map<string, string>();
async function tokenFor(userId: string): Promise<string> {
  if (!tokens.has(userId)) {
    const res = await issueToken(userId);
    assert.equal(res.status, 200, `token ${userId} harus berhasil`);
    tokens.set(userId, ((await res.json()) as any).token);
  }
  return tokens.get(userId)!;
}

async function get(pathname: string, userId?: string, token?: string) {
  const headers: Record<string, string> = {};
  const t = token ?? (userId ? await tokenFor(userId) : undefined);
  if (t) headers.Authorization = `Bearer ${t}`;
  return fetch(`${base}${pathname}`, { headers });
}

async function getJson(pathname: string, userId?: string) {
  const res = await get(pathname, userId);
  return { status: res.status, body: (await res.json()) as any, res };
}

/** Unzip minimal (central directory + inflateRaw) untuk memeriksa isi xlsx. */
function unzip(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>();
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  assert.ok(eocd >= 0, 'EOCD harus ada');
  const entries = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < entries; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    out.set(name, (method === 8 ? zlib.inflateRawSync(raw) : raw).toString('utf8'));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function sheetXml(files: Map<string, string>): string {
  return [...files.entries()]
    .filter(([n]) => n.startsWith('xl/worksheets/'))
    .map(([, v]) => v)
    .join('\n');
}

// ═══════════════════════════════════════════════════════════════

describe('penerbitan token', () => {
  test('admin & egi berhasil; role super_admin dinormalisasi', async () => {
    for (const id of [USER_IDS.adminAuthor, USER_IDS.egiSec, USER_IDS.egiBank]) {
      const res = await issueToken(id);
      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.ok(body.token && body.expiresAt);
      assert.equal(body.user.id, id);
      assert.equal('password' in body.user, false);
    }
    const res = await issueToken(USER_IDS.superAdminRole);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.user.role, 'admin', 'role mentah super_admin tidak boleh bocor');
    assert.equal(body.user.isSuperAdmin, true);
  });

  test('password salah & user tidak dikenal → 401 dengan pesan yang sama', async () => {
    const wrong = await issueToken(USER_IDS.adminOther, 'salah');
    const unknown = await issueToken('u-tidak-ada', 'apa-saja');
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    const a = (await wrong.json()) as any;
    const b = (await unknown.json()) as any;
    assert.equal(a.code, 'invalid_credentials');
    assert.equal(a.error, b.error);
  });

  test('password null di DB → "123456" (sama dengan AuthModal)', async () => {
    assert.equal((await issueToken(USER_IDS.egiBank, '123456')).status, 200);
  });

  test('karyawan dengan password benar → 403', async () => {
    const res = await issueToken(USER_IDS.karyawan);
    assert.equal(res.status, 403);
    assert.equal(((await res.json()) as any).code, 'forbidden');
  });

  test('body tidak lengkap → 400', async () => {
    const res = await fetch(`${base}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: USER_IDS.adminAuthor }),
    });
    assert.equal(res.status, 400);
  });

  test('rate limit: 10 kegagalan → 429 walau password benar', async () => {
    const victim = USER_IDS.citra;
    for (let i = 0; i < 10; i++) assert.equal((await issueToken(victim, `salah-${i}`)).status, 401);
    const res = await issueToken(victim);
    assert.equal(res.status, 429);
    assert.equal(((await res.json()) as any).code, 'rate_limited');
  });
});

describe('autentikasi request', () => {
  const summaryPath = `/exams/${EXAM_IDS.main}/summary`;

  test('tanpa token → 401 unauthenticated', async () => {
    const { status, body } = await getJson(summaryPath);
    assert.equal(status, 401);
    assert.equal(body.code, 'unauthenticated');
  });

  test('token rusak / dimodifikasi → 401', async () => {
    const garbage = await get(summaryPath, undefined, 'bukan-token');
    assert.equal(garbage.status, 401);
    const good = await tokenFor(USER_IDS.adminAuthor);
    const [payload, sig] = good.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), uid: USER_IDS.superAdmin })
    ).toString('base64url');
    const res = await get(summaryPath, undefined, `${forged}.${sig}`);
    assert.equal(res.status, 401);
    assert.equal(((await res.json()) as any).code, 'token_invalid');
  });

  test('token kedaluwarsa → 401 token_invalid', async () => {
    const res0 = await issueToken(USER_IDS.adminAuthor);
    const token = ((await res0.json()) as any).token;
    const saved = clock;
    clock += 8 * 60 * 60 * 1000 + 1;
    try {
      const res = await get(summaryPath, undefined, token);
      assert.equal(res.status, 401);
      assert.equal(((await res.json()) as any).code, 'token_invalid');
    } finally {
      clock = saved;
    }
  });
});

describe('otorisasi paket (company scope & role)', () => {
  test('EGI SEC ditolak di paket BANK, diizinkan di paket SEC', async () => {
    assert.equal((await getJson(`/exams/${EXAM_IDS.main}/summary`, USER_IDS.egiSec)).status, 403);
    assert.equal((await getJson(`/exams/${EXAM_IDS.other}/summary`, USER_IDS.egiSec)).status, 200);
  });

  test('admin BANK non-pembuat boleh melihat paket BANK, ditolak paket SEC', async () => {
    assert.equal((await getJson(`/exams/${EXAM_IDS.main}/summary`, USER_IDS.adminOther)).status, 200);
    assert.equal((await getJson(`/exams/${EXAM_IDS.other}/summary`, USER_IDS.adminOther)).status, 403);
  });

  test('super admin (nama Taka) & role super_admin melihat semua company', async () => {
    for (const id of [USER_IDS.superAdmin, USER_IDS.superAdminRole]) {
      assert.equal((await getJson(`/exams/${EXAM_IDS.other}/summary`, id)).status, 200, id);
      assert.equal((await getJson(`/exams/${EXAM_IDS.main}/summary`, id)).status, 200, id);
    }
  });

  test('paket tidak ada → 404', async () => {
    const { status, body } = await getJson(`/exams/exam-tidak-ada/summary`, USER_IDS.superAdmin);
    assert.equal(status, 404);
    assert.equal(body.code, 'not_found');
  });

  test('capabilities sesuai aturan Exam Management', async () => {
    const author = await getJson(`/exams/${EXAM_IDS.main}/summary`, USER_IDS.adminAuthor);
    assert.deepEqual(author.body.capabilities, { canExport: true, canDownloadQuestions: true });
    const other = await getJson(`/exams/${EXAM_IDS.main}/summary`, USER_IDS.adminOther);
    assert.deepEqual(other.body.capabilities, { canExport: true, canDownloadQuestions: false });
    const egi = await getJson(`/exams/${EXAM_IDS.main}/summary`, USER_IDS.egiBank);
    assert.deepEqual(egi.body.capabilities, { canExport: true, canDownloadQuestions: false });
    const sup = await getJson(`/exams/${EXAM_IDS.main}/summary`, USER_IDS.superAdminRole);
    assert.deepEqual(sup.body.capabilities, { canExport: true, canDownloadQuestions: true });
  });
});

describe('endpoint analitik', () => {
  test('summary: angka sama dengan perhitungan manual fixture', async () => {
    const { status, body, res } = await getJson(`/exams/${EXAM_IDS.main}/summary`, USER_IDS.adminAuthor);
    assert.equal(status, 200);
    assert.deepEqual(body.summary, MAIN_EXAM_EXPECTED_SUMMARY);
    assert.equal(body.exam.id, EXAM_IDS.main);
    assert.equal(body.questions.length, MAIN_EXAM_EXPECTED_SUMMARY.questionCount);
    assert.equal(body.materialAvailable, false);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  test('db-max-rows PostgREST lebih kecil dari halaman → data tetap lengkap', async () => {
    fake.maxRows = 3;
    const { status, body } = await getJson(`/exams/${EXAM_IDS.main}/summary`, USER_IDS.adminAuthor);
    assert.equal(status, 200);
    assert.deepEqual(body.summary, MAIN_EXAM_EXPECTED_SUMMARY);
  });

  test('filter tidak valid → 400', async () => {
    assert.equal((await getJson(`/exams/${EXAM_IDS.main}/summary?company=XYZ`, USER_IDS.adminAuthor)).status, 400);
    assert.equal((await getJson(`/exams/${EXAM_IDS.main}/summary?from=bukan-tanggal`, USER_IDS.adminAuthor)).status, 400);
  });

  test('filter company diterapkan', async () => {
    const { status, body } = await getJson(`/exams/${EXAM_IDS.main}/summary?company=SEC`, USER_IDS.adminAuthor);
    assert.equal(status, 200);
    assert.equal(body.filters.company, 'SEC');
    assert.ok(body.summary.totalParticipants < MAIN_EXAM_EXPECTED_SUMMARY.totalParticipants);
  });

  test('detail soal & IDOR: soal paket lain → 404', async () => {
    const ok = await getJson(`/exams/${EXAM_IDS.main}/questions/${QUESTION_IDS.main.mc5}`, USER_IDS.adminAuthor);
    assert.equal(ok.status, 200);
    assert.equal(ok.body.question.questionId, QUESTION_IDS.main.mc5);
    const idor = await getJson(`/exams/${EXAM_IDS.main}/questions/${QUESTION_IDS.other.mc5}`, USER_IDS.adminAuthor);
    assert.equal(idor.status, 404);
    // EGI SEC tidak bisa membaca soal paket BANK walau tahu id-nya
    const scoped = await getJson(`/exams/${EXAM_IDS.main}/questions/${QUESTION_IDS.main.mc5}`, USER_IDS.egiSec);
    assert.equal(scoped.status, 403);
  });

  test('peserta: pagination, detail, IDOR peserta paket lain → 404', async () => {
    const list = await getJson(`/exams/${EXAM_IDS.main}/participants?pageSize=2&page=1`, USER_IDS.adminAuthor);
    assert.equal(list.status, 200);
    assert.equal(list.body.rows.length, 2);
    assert.equal(list.body.total, MAIN_EXAM_EXPECTED_SUMMARY.totalParticipants);
    const detail = await getJson(`/exams/${EXAM_IDS.main}/participants/${USER_IDS.budi}`, USER_IDS.adminAuthor);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.participant.userId, USER_IDS.budi);
    const idor = await getJson(`/exams/${EXAM_IDS.main}/participants/${USER_IDS.joko}`, USER_IDS.adminAuthor);
    assert.equal(idor.status, 404);
  });

  test('errors: limit & truncated', async () => {
    const all = await getJson(`/exams/${EXAM_IDS.main}/errors`, USER_IDS.adminAuthor);
    assert.equal(all.status, 200);
    assert.ok(all.body.total > 1);
    const one = await getJson(`/exams/${EXAM_IDS.main}/errors?limit=1`, USER_IDS.adminAuthor);
    assert.equal(one.body.rows.length, 1);
    assert.equal(one.body.truncated, true);
    assert.equal(one.body.total, all.body.total);
  });

  test('database error → 500 JSON generik', async () => {
    fake.failingTables.add('exam_attempts');
    const { status, body } = await getJson(`/exams/${EXAM_IDS.main}/summary`, USER_IDS.adminAuthor);
    assert.equal(status, 500);
    assert.equal(body.code, 'internal');
  });
});

describe('export & download soal', () => {
  test('export analisis xlsx (admin & EGI)', async () => {
    for (const id of [USER_IDS.adminAuthor, USER_IDS.egiBank]) {
      const res = await get(`/exams/${EXAM_IDS.main}/export.xlsx`, id);
      assert.equal(res.status, 200, id);
      assert.equal(res.headers.get('content-type'), XLSX_MIME);
      assert.match(res.headers.get('content-disposition') || '', /Analisis_/);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const buf = Buffer.from(await res.arrayBuffer());
      assert.equal(buf.subarray(0, 2).toString(), 'PK');
      const files = unzip(buf);
      assert.ok(files.has('xl/workbook.xml'));
      assert.match(files.get('xl/workbook.xml')!, /Detail Kesalahan/);
    }
  });

  test('export detail soal xlsx', async () => {
    const res = await get(`/exams/${EXAM_IDS.main}/questions/${QUESTION_IDS.main.mc5}/export.xlsx`, USER_IDS.adminOther);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-disposition') || '', /Detail_Soal_/);
  });

  test('download soal: hanya admin pembuat & super admin', async () => {
    const path0 = `/exams/${EXAM_IDS.main}/download-soal.xlsx`;
    assert.equal((await get(path0, USER_IDS.adminAuthor)).status, 200);
    assert.equal((await get(path0, USER_IDS.superAdmin)).status, 200);
    assert.equal((await get(path0, USER_IDS.superAdminRole)).status, 200);
    assert.equal((await get(path0, USER_IDS.adminOther)).status, 403);
    assert.equal((await get(path0, USER_IDS.egiBank)).status, 403);
  });

  test('kunci jawaban hanya ada di versi withKey', async () => {
    const plain = await get(`/exams/${EXAM_IDS.main}/download-soal.xlsx`, USER_IDS.adminAuthor);
    const keyed = await get(`/exams/${EXAM_IDS.main}/download-soal.xlsx?withKey=1`, USER_IDS.adminAuthor);
    assert.match(plain.headers.get('content-disposition') || '', /Soal_.*\.xlsx/);
    assert.doesNotMatch(plain.headers.get('content-disposition') || '', /DenganKunci/);
    assert.match(keyed.headers.get('content-disposition') || '', /DenganKunci/);
    const plainXml = sheetXml(unzip(Buffer.from(await plain.arrayBuffer())));
    const keyedXml = sheetXml(unzip(Buffer.from(await keyed.arrayBuffer())));
    assert.doesNotMatch(plainXml, /Jawaban Benar|Kunci\/Rubric/);
    assert.match(keyedXml, /Jawaban Benar/);
  });
});

describe('perilaku HTTP lain', () => {
  test('path analitik tidak dikenal → 404 JSON', async () => {
    for (const p of ['/tidak-ada', `/exams/${EXAM_IDS.main}`]) {
      const res = await fetch(`${base}${p}`);
      assert.equal(res.status, 404, p);
      assert.match(res.headers.get('content-type') || '', /application\/json/);
      assert.equal(((await res.json()) as any).code, 'not_found');
    }
  });

  test('CORS preflight hanya untuk origin yang diizinkan', async () => {
    const ok = await fetch(`${base}/auth/token`, { method: 'OPTIONS', headers: { Origin: 'capacitor://localhost' } });
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'capacitor://localhost');
    const other = await fetch(`${base}/auth/token`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
  });

  test('database belum dikonfigurasi → 503', async () => {
    const started = await startApp(() => null);
    try {
      const res = await fetch(`${started.base}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: USER_IDS.adminAuthor, password: 'x' }),
      });
      assert.equal(res.status, 503);
      assert.equal(((await res.json()) as any).code, 'unavailable');
    } finally {
      started.server.close();
    }
  });
});

describe('keamanan data (produksi)', () => {
  test('tidak ada satu pun operasi tulis ke database', () => {
    assert.equal(fake.writes.length, 0);
    assert.ok(fake.calls.every((c) => c.op === 'select'));
  });

  test('kolom password hanya dibaca oleh penerbitan token', async () => {
    await tokenFor(USER_IDS.adminAuthor);
    fake.resetCalls();
    await getJson(`/exams/${EXAM_IDS.main}/summary`, USER_IDS.adminAuthor);
    await getJson(`/exams/${EXAM_IDS.main}/participants`, USER_IDS.adminAuthor);
    await get(`/exams/${EXAM_IDS.main}/export.xlsx`, USER_IDS.adminAuthor);
    const userSelects = fake.calls.filter((c) => c.table === 'users');
    assert.ok(userSelects.length > 0);
    for (const c of userSelects) {
      assert.notEqual(c.columns.trim(), '*');
      assert.doesNotMatch(c.columns, /password/);
    }
  });
});
