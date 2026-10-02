import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crc32 as zlibCrc32, inflateRawSync } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import {
  XLSX_MIME,
  buildXlsx,
  cleanXmlText,
  columnLetter,
  crc32,
  sanitizeSheetName,
} from '../../server/analytics/xlsx';
import type { XlsxSheet } from '../../server/analytics/types';

// ─── Helper: baca ZIP lewat central directory (tanpa dependency) ───

interface ZipPart {
  name: string;
  flags: number;
  method: number;
  dosTime: number;
  dosDate: number;
  data: Buffer;
}

function readZip(buf: Buffer): ZipPart[] {
  const eocd = buf.length - 22;
  assert.equal(buf.readUInt32LE(eocd), 0x06054b50, 'EOCD di akhir file (tanpa komentar)');
  const count = buf.readUInt16LE(eocd + 10);
  assert.equal(buf.readUInt16LE(eocd + 8), count, 'jumlah entry disk = total');
  assert.equal(buf.readUInt16LE(eocd + 20), 0, 'tanpa komentar ZIP');
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  assert.equal(cdOffset + cdSize, eocd, 'central directory tepat sebelum EOCD');

  const parts: ZipPart[] = [];
  let p = cdOffset;
  let expectedLocal = 0;
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, 'signature central header');
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const dosTime = buf.readUInt16LE(p + 12);
    const dosDate = buf.readUInt16LE(p + 14);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    assert.equal(localOffset, expectedLocal, `${name}: local header berurutan tanpa celah`);
    assert.equal(buf.readUInt32LE(localOffset), 0x04034b50, `${name}: signature local header`);
    assert.equal(buf.readUInt16LE(localOffset + 6), flags, `${name}: flag local = central`);
    assert.equal(buf.readUInt16LE(localOffset + 8), method, `${name}: method local = central`);
    assert.equal(buf.readUInt16LE(localOffset + 10), dosTime, `${name}: jam local = central`);
    assert.equal(buf.readUInt16LE(localOffset + 12), dosDate, `${name}: tanggal local = central`);
    assert.equal(buf.readUInt32LE(localOffset + 14), crc, `${name}: CRC local = central`);
    assert.equal(buf.readUInt32LE(localOffset + 18), compSize, `${name}: ukuran terkompresi`);
    assert.equal(buf.readUInt32LE(localOffset + 22), size, `${name}: ukuran asli`);
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    assert.equal(buf.toString('utf8', localOffset + 30, localOffset + 30 + localNameLen), name);

    const start = localOffset + 30 + localNameLen + localExtraLen;
    const data = method === 8 ? inflateRawSync(buf.subarray(start, start + compSize)) : buf.subarray(start, start + compSize);
    assert.equal(data.length, size, `${name}: panjang hasil inflate`);
    assert.equal(crc32(data), crc, `${name}: CRC32 cocok`);
    assert.equal(zlibCrc32(data), crc, `${name}: CRC32 cocok dengan zlib`);

    parts.push({ name, flags, method, dosTime, dosDate, data });
    expectedLocal = start + compSize;
    p += 46 + nameLen + extraLen + commentLen;
  }
  assert.equal(expectedLocal, cdOffset, 'data lokal berakhir tepat di central directory');
  assert.equal(p, cdOffset + cdSize, 'ukuran central directory sesuai');
  return parts;
}

function partsMap(buf: Buffer): Map<string, string> {
  return new Map(readZip(buf).map((part) => [part.name, part.data.toString('utf8')]));
}

// ─── Helper: cek well-formed XML (cukup untuk keluaran writer kita) ───

const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const ENTITY_OK = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;

function assertWellFormed(xml: string, label: string): void {
  assert.ok(xml.startsWith(XML_DECL), `${label}: deklarasi XML`);
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/.test(xml), `${label}: karakter XML tidak valid`);
  const body = xml.slice(XML_DECL.length);
  const stack: string[] = [];
  let roots = 0;
  let consumed = 0;
  const re = /<([^<>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    assert.equal(m.index, consumed, `${label}: token tidak bersambung di posisi ${m.index}`);
    consumed = re.lastIndex;
    if (m[2] !== undefined) {
      if (stack.length === 0) assert.match(m[2], /^\s*$/, `${label}: teks di luar elemen root`);
      assert.ok(!m[2].includes('>'), `${label}: '>' tidak di-escape`);
      assert.ok(!ENTITY_OK.test(m[2]), `${label}: '&' tanpa entity`);
      continue;
    }
    const tag = /^(\/)?([A-Za-z_][\w:.-]*)((?:\s+[A-Za-z_][\w:.-]*="[^"<]*")*)\s*(\/)?$/.exec(m[1]);
    assert.ok(tag, `${label}: tag tidak valid <${m[1]}>`);
    const [, closing, name, attrs, selfClosing] = tag;
    const seen = new Set<string>();
    for (const a of attrs.matchAll(/([\w:.-]+)="([^"]*)"/g)) {
      assert.ok(!seen.has(a[1]), `${label}: atribut ganda ${a[1]} pada <${name}>`);
      seen.add(a[1]);
      assert.ok(!ENTITY_OK.test(a[2]), `${label}: '&' tanpa entity di atribut ${a[1]}`);
    }
    if (closing) {
      assert.equal(stack.pop(), name, `${label}: penutup </${name}> tidak cocok`);
    } else {
      if (stack.length === 0) roots++;
      if (!selfClosing) stack.push(name);
    }
  }
  assert.equal(consumed, body.length, `${label}: sisa input tidak terbaca`);
  assert.equal(stack.length, 0, `${label}: elemen belum ditutup (${stack.join(',')})`);
  assert.equal(roots, 1, `${label}: harus tepat satu root`);
}

// ─── Helper: baca sel dari sheet XML ───

interface CellInfo {
  s: string | null;
  t: string | null;
  value: string | number;
}

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function readCells(sheetXml: string): Map<string, CellInfo> {
  const cells = new Map<string, CellInfo>();
  const re = /<c r="([A-Z]+\d+)"(?: s="(\d+)")?(?: t="(\w+)")?(?:\/>|>([\s\S]*?)<\/c>)/g;
  for (const m of sheetXml.matchAll(re)) {
    const inner = m[4] ?? '';
    let value: string | number = '';
    if (m[3] === 'inlineStr') {
      const t = /^<is><t xml:space="preserve">([\s\S]*)<\/t><\/is>$/.exec(inner);
      assert.ok(t, `inline string ${m[1]} berformat <is><t xml:space="preserve">`);
      value = unescapeXml(t[1]);
    } else if (inner) {
      const v = /^<v>([^<]*)<\/v>$/.exec(inner);
      assert.ok(v, `nilai angka ${m[1]} berformat <v>`);
      value = Number(v[1]);
    }
    cells.set(m[1], { s: m[2] ?? null, t: m[3] ?? null, value });
  }
  return cells;
}

const CREATED_AT = '2026-10-02T03:04:06.789Z';

function sampleSheets(): XlsxSheet[] {
  return [
    {
      name: 'Ringkasan',
      columns: [{ header: 'Keterangan', width: 30 }, { header: 'Nilai', wrap: true }],
      rows: [
        ['Nama Paket', 'Paket <K3> & "Dasar"'],
        ['Total Peserta', 12],
      ],
      autoFilter: false,
    },
    {
      name: "Soal Bu'di",
      columns: [{ header: 'No', width: 6 }, { header: 'Pertanyaan', width: 60, wrap: true }, { header: 'Poin' }],
      rows: [
        [1, 'Apa itu K3?\r\nJelaskan.', 10],
        [2, '=SUM(A1:A2)', 12.5],
      ],
    },
    { name: 'Pesan', rows: [['Tidak ada data.']] },
  ];
}

// ═══════════════════════════════════════════════════════════════

test('XLSX_MIME sesuai standar OOXML', () => {
  assert.equal(XLSX_MIME, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
});

test('crc32: vektor standar & sama dengan zlib.crc32', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(crc32(Buffer.alloc(0)), 0);
  assert.equal(crc32(Buffer.from('The quick brown fox jumps over the lazy dog')), 0x414fa339);
  assert.equal(crc32(new Uint8Array([0])), 0xd202ef8d);
  for (const size of [1, 7, 256, 65_537]) {
    const data = randomBytes(size);
    assert.equal(crc32(data), zlibCrc32(data), `ukuran ${size}`);
  }
  // selalu unsigned 32-bit
  assert.ok(crc32(Buffer.from('ara sinau')) >= 0);
});

test('columnLetter: batas A/Z/AA/ZZ/AAA/XFD', () => {
  const cases: Array<[number, string]> = [
    [0, 'A'],
    [1, 'B'],
    [25, 'Z'],
    [26, 'AA'],
    [27, 'AB'],
    [51, 'AZ'],
    [52, 'BA'],
    [701, 'ZZ'],
    [702, 'AAA'],
    [703, 'AAB'],
    [16_383, 'XFD'],
  ];
  for (const [index, letter] of cases) assert.equal(columnLetter(index), letter, `index ${index}`);
  assert.throws(() => columnLetter(-1), RangeError);
  assert.throws(() => columnLetter(1.5), RangeError);
  assert.throws(() => columnLetter(Number.NaN), RangeError);
});

test('sanitizeSheetName: karakter terlarang, apostrof, panjang, fallback', () => {
  const fresh = (name: string) => sanitizeSheetName(name, new Set());
  assert.equal(fresh('Benar/Salah'), 'BenarSalah');
  assert.equal(fresh('a[b]c:d*e?f/g\\h'), 'abcdefgh');
  assert.equal(fresh("'Kutip'"), 'Kutip');
  assert.equal(fresh(" ' Kutip ' "), 'Kutip');
  assert.equal(fresh("Bu'di"), "Bu'di", 'apostrof di tengah boleh');
  assert.equal(fresh(''), 'Sheet');
  assert.equal(fresh('   '), 'Sheet');
  assert.equal(fresh("''"), 'Sheet');
  assert.equal(fresh('[]:*?/\\'), 'Sheet');
  assert.equal(fresh('A\tB\nC\r\nD'), 'A B C D');
  assert.equal(fresh('A\u0000B\u0007C'), 'ABC');
  assert.equal(fresh('X\uD800Y'), 'XY', 'lone surrogate dibuang');
  assert.equal(fresh('Data_x0041_'), 'Datax0041_', 'pola _xHHHH_ dinetralkan');

  const long = 'Analisis Jawaban Peserta Per Soal Lengkap';
  assert.equal(fresh(long), long.slice(0, 31));
  assert.equal(fresh(long).length, 31);
  // tidak membelah pasangan surrogate di batas 31
  const emoji = `${'a'.repeat(30)}😀`;
  assert.equal(fresh(emoji), 'a'.repeat(30));
  // apostrof yang muncul di akhir setelah dipotong ikut dibuang
  assert.equal(fresh(`${'a'.repeat(30)}'b`), 'a'.repeat(30));
});

test('sanitizeSheetName: unik tanpa membedakan huruf besar/kecil, tetap ≤ 31 karakter', () => {
  const used = new Set<string>();
  assert.equal(sanitizeSheetName('Data', used), 'Data');
  assert.equal(sanitizeSheetName('data', used), 'data (2)');
  assert.equal(sanitizeSheetName('DATA', used), 'DATA (3)');
  assert.deepEqual([...used], ['Data', 'data (2)', 'DATA (3)']);

  const long = 'x'.repeat(40);
  const first = sanitizeSheetName(long, used);
  const second = sanitizeSheetName(long, used);
  assert.equal(first, 'x'.repeat(31));
  assert.equal(second, `${'x'.repeat(27)} (2)`);
  assert.equal(second.length, 31);

  // nama yang sudah ada di set (beda kapital) dianggap terpakai
  assert.equal(sanitizeSheetName('peserta', new Set(['PESERTA'])), 'peserta (2)');
  // "History" adalah nama cadangan Excel
  assert.equal(sanitizeSheetName('History', new Set()), 'History (2)');
});

test('cleanXmlText: escape 5 karakter XML', () => {
  assert.equal(cleanXmlText(`a & b < c > d " e ' f`), 'a &amp; b &lt; c &gt; d &quot; e &apos; f');
  assert.equal(cleanXmlText('&amp;'), '&amp;amp;', 'teks literal tetap literal');
  assert.equal(cleanXmlText(''), '');
});

test('cleanXmlText: buang karakter kontrol & lone surrogate, pertahankan tab/baris baru/emoji', () => {
  assert.equal(cleanXmlText('a\u0000b\u0001c\u0008d\u000Be\u000Cf\u000Eg\u001Fh'), 'abcdefgh');
  assert.equal(cleanXmlText('t\tn\nr\r'), 't\tn\nr\r');
  assert.equal(cleanXmlText('x￾y￿z'), 'xyz');
  assert.equal(cleanXmlText('\uD800x'), 'x', 'high surrogate tanpa pasangan');
  assert.equal(cleanXmlText('x\uDC00'), 'x', 'low surrogate tanpa pasangan');
  assert.equal(cleanXmlText('\uDC00\uD800'), '', 'pasangan terbalik');
  assert.equal(cleanXmlText('😀'), '😀');
  assert.equal(cleanXmlText('a\uD83D😀b'), 'a😀b', 'high ganda: hanya yang yatim dibuang');
  assert.equal(cleanXmlText('\u0000<\u0001'), '&lt;', 'buang dulu, lalu escape');
  assert.equal(cleanXmlText('Ąčć ñ — “kutip”'), 'Ąčć ñ — “kutip”');
});

test('buildXlsx: struktur paket ZIP/OOXML lengkap dan konsisten', () => {
  const buf = buildXlsx(sampleSheets(), { title: 'Analisis <Paket> & "Uji"', createdAt: CREATED_AT });
  const zipParts = readZip(buf);
  const names = zipParts.map((p) => p.name);
  assert.deepEqual(names, [
    '[Content_Types].xml',
    '_rels/.rels',
    'docProps/core.xml',
    'docProps/app.xml',
    'xl/workbook.xml',
    'xl/_rels/workbook.xml.rels',
    'xl/styles.xml',
    'xl/worksheets/sheet1.xml',
    'xl/worksheets/sheet2.xml',
    'xl/worksheets/sheet3.xml',
  ]);
  for (const part of zipParts) {
    assert.equal(part.flags, 0x0800, `${part.name}: flag UTF-8`);
    assert.equal(part.method, 8, `${part.name}: deflate`);
    assertWellFormed(part.data.toString('utf8'), part.name);
  }

  const parts = partsMap(buf);
  const ct = parts.get('[Content_Types].xml')!;
  assert.match(ct, /<Default Extension="rels" ContentType="application\/vnd\.openxmlformats-package\.relationships\+xml"\/>/);
  assert.match(ct, /<Default Extension="xml" ContentType="application\/xml"\/>/);
  for (const part of ['/xl/workbook.xml', '/xl/styles.xml', '/docProps/core.xml', '/docProps/app.xml']) {
    assert.ok(ct.includes(`PartName="${part}"`), `override ${part}`);
  }
  for (let i = 1; i <= 3; i++) {
    assert.ok(
      ct.includes(
        `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
      )
    );
  }
  assert.ok(ct.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'));

  const rootRels = parts.get('_rels/.rels')!;
  assert.ok(rootRels.includes('Target="xl/workbook.xml"'));
  assert.ok(rootRels.includes('relationships/metadata/core-properties" Target="docProps/core.xml"'));
  assert.ok(rootRels.includes('relationships/extended-properties" Target="docProps/app.xml"'));

  const wbRels = parts.get('xl/_rels/workbook.xml.rels')!;
  for (let i = 1; i <= 3; i++) {
    assert.ok(wbRels.includes(`<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`));
  }
  assert.ok(wbRels.includes('<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'));

  const wb = parts.get('xl/workbook.xml')!;
  assert.ok(wb.includes('<sheet name="Ringkasan" sheetId="1" r:id="rId1"/>'));
  assert.ok(wb.includes('<sheet name="Soal Bu&apos;di" sheetId="2" r:id="rId2"/>'));
  assert.ok(wb.includes('<sheet name="Pesan" sheetId="3" r:id="rId3"/>'));
  // hanya sheet 2 yang punya autofilter → satu definedName, nama sheet dikutip + apostrof digandakan
  const defined = [...wb.matchAll(/<definedName ([^>]*)>([^<]*)<\/definedName>/g)];
  assert.equal(defined.length, 1);
  assert.equal(defined[0][1], 'name="_xlnm._FilterDatabase" localSheetId="1" hidden="1"');
  assert.equal(unescapeXml(defined[0][2]), "'Soal Bu''di'!$A$1:$C$3");
  assert.ok(wb.indexOf('<bookViews>') < wb.indexOf('<sheets>') && wb.indexOf('</sheets>') < wb.indexOf('<definedNames>'));

  const core = parts.get('docProps/core.xml')!;
  assert.ok(core.includes('<dc:title>Analisis &lt;Paket&gt; &amp; &quot;Uji&quot;</dc:title>'));
  assert.ok(core.includes('<dcterms:created xsi:type="dcterms:W3CDTF">2026-10-02T03:04:06Z</dcterms:created>'));
  assert.ok(core.includes('<dcterms:modified xsi:type="dcterms:W3CDTF">2026-10-02T03:04:06Z</dcterms:modified>'));

  const app = parts.get('docProps/app.xml')!;
  assert.ok(app.includes('<vt:i4>3</vt:i4>'));
  assert.ok(app.includes('<vt:vector size="3" baseType="lpstr"><vt:lpstr>Ringkasan</vt:lpstr><vt:lpstr>Soal Bu&apos;di</vt:lpstr><vt:lpstr>Pesan</vt:lpstr></vt:vector>'));
});

test('buildXlsx: styles.xml — fill 0 none, fill 1 gray125, count = jumlah elemen', () => {
  const styles = partsMap(buildXlsx(sampleSheets(), { createdAt: CREATED_AT })).get('xl/styles.xml')!;
  const section = (tag: string) => {
    const m = new RegExp(`<${tag} count="(\\d+)"(?:[^>]*)>([\\s\\S]*?)</${tag}>`).exec(styles);
    assert.ok(m, `<${tag}> ada`);
    return { count: Number(m[1]), body: m[2] };
  };
  const fonts = section('fonts');
  assert.equal(fonts.count, (fonts.body.match(/<font>/g) || []).length);
  const fills = section('fills');
  const fillList = fills.body.match(/<fill>[\s\S]*?<\/fill>/g) || [];
  assert.equal(fills.count, fillList.length);
  assert.ok(fillList[0].includes('patternType="none"'));
  assert.ok(fillList[1].includes('patternType="gray125"'));
  const borders = section('borders');
  assert.equal(borders.count, (borders.body.match(/<border>/g) || []).length);
  const cellStyleXfs = section('cellStyleXfs');
  assert.equal(cellStyleXfs.count, (cellStyleXfs.body.match(/<xf /g) || []).length);
  const cellXfs = section('cellXfs');
  const xfs = cellXfs.body.match(/<xf [^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) || [];
  assert.equal(cellXfs.count, xfs.length);
  assert.ok(xfs.length >= 4);
  assert.ok(/fontId="1" fillId="2" borderId="1"/.test(xfs[1]) && xfs[1].includes('wrapText="1"'), 'xf 1 = header');
  assert.ok(xfs[2].includes('wrapText="1"') && xfs[2].includes('vertical="top"'), 'xf 2 = wrap rata atas');
  for (const xf of xfs) {
    const fontId = Number(/fontId="(\d+)"/.exec(xf)![1]);
    const fillId = Number(/fillId="(\d+)"/.exec(xf)![1]);
    const borderId = Number(/borderId="(\d+)"/.exec(xf)![1]);
    assert.ok(fontId < fonts.count && fillId < fills.count && borderId < borders.count, 'id style dalam rentang');
  }
  assert.match(styles, /<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"\/><\/cellStyles>/);
});

test('buildXlsx: sel string inline, angka <v>, boolean Ya/Tidak, kosong tidak ditulis, tanpa formula', () => {
  const sheets: XlsxSheet[] = [
    {
      name: 'Data',
      columns: [{ header: 'Teks' }, { header: 'Angka' }, { header: 'Lain', wrap: true }],
      rows: [
        ['=SUM(A1:A2)', 12.5, true],
        ['+62812', -0, false],
        ['@cmd', Number.NaN, null],
        ['-1+2', Number.POSITIVE_INFINITY, undefined],
        ['', 0, 'baris\r\nbaru\rlagi'],
        ['  spasi  ', 1e21, '_x0041_ literal'],
      ],
    },
  ];
  const sheet = partsMap(buildXlsx(sheets, { createdAt: CREATED_AT })).get('xl/worksheets/sheet1.xml')!;
  assert.ok(!/<f[\s>]/.test(sheet), 'tidak ada elemen formula');
  assert.ok(!sheet.includes('t="s"'), 'tidak memakai shared strings');
  assert.ok(!sheet.includes('t="str"'), 'tidak memakai string hasil formula');
  const cells = readCells(sheet);

  assert.deepEqual(cells.get('A1'), { s: '1', t: 'inlineStr', value: 'Teks' });
  assert.deepEqual(cells.get('A2'), { s: '4', t: 'inlineStr', value: '=SUM(A1:A2)' });
  assert.deepEqual(cells.get('B2'), { s: '3', t: null, value: 12.5 });
  assert.deepEqual(cells.get('C2'), { s: '2', t: 'inlineStr', value: 'Ya' });
  assert.deepEqual(cells.get('A3'), { s: '4', t: 'inlineStr', value: '+62812' });
  assert.deepEqual(cells.get('B3'), { s: '3', t: null, value: 0 });
  assert.ok(sheet.includes('<c r="B3" s="3"><v>0</v></c>'), '-0 ditulis 0');
  assert.deepEqual(cells.get('C3'), { s: '2', t: 'inlineStr', value: 'Tidak' });
  assert.equal(cells.get('A4')?.value, '@cmd');
  assert.equal(cells.has('B4'), false, 'NaN → tidak ada sel');
  assert.equal(cells.has('C4'), false, 'null → tidak ada sel');
  assert.equal(cells.has('B5'), false, 'Infinity → tidak ada sel');
  assert.equal(cells.has('C5'), false, 'undefined → tidak ada sel');
  assert.equal(cells.has('A6'), false, "'' → tidak ada sel");
  assert.equal(cells.get('B6')?.value, 0);
  assert.equal(cells.get('C6')?.value, 'baris\nbaru\nlagi', 'CRLF/CR → LF');
  assert.ok(!sheet.includes('\r'), 'tidak ada CR mentah');
  assert.equal(cells.get('A7')?.value, '  spasi  ');
  assert.equal(cells.get('B7')?.value, 1e21);
  assert.equal(cells.get('C7')?.value, '_x005F_x0041_ literal', 'underscore pola _xHHHH_ di-escape');
  assert.ok(sheet.includes('<dimension ref="A1:C7"/>'));
});

test('buildXlsx: teks dipotong 32.767 karakter tanpa membelah surrogate', () => {
  const long = 'a'.repeat(40_000);
  const edge = `${'b'.repeat(32_766)}😀tail`;
  const sheet = partsMap(
    buildXlsx([{ name: 'Panjang', rows: [[long], [edge], ['&'.repeat(33_000)]] }], { createdAt: CREATED_AT })
  ).get('xl/worksheets/sheet1.xml')!;
  const cells = readCells(sheet);
  assert.equal((cells.get('A1')!.value as string).length, 32_767);
  assert.equal(cells.get('A2')!.value, 'b'.repeat(32_766), 'emoji di batas tidak dibelah');
  assert.equal(cells.get('A3')!.value, '&'.repeat(32_767), 'batas dihitung sebelum escape');
});

test('buildXlsx: header, lebar kolom, freeze pane, autofilter & definedName', () => {
  const sheets: XlsxSheet[] = [
    {
      name: 'Peserta',
      columns: [
        { header: 'Nama', width: 28 },
        { header: 'Catatan', width: 300, wrap: true },
        { header: 'Nilai' },
        { header: '' },
      ],
      rows: [
        ['Ani', 'Baik', 90],
        ['Budi', 'Cukup', 70],
        [],
        ['Catatan: data dipotong.'],
      ],
    },
    {
      name: 'Tanpa Filter',
      columns: [{ header: 'A' }],
      rows: [['x']],
      autoFilter: false,
      freezeHeader: false,
    },
    { name: 'Kosong', columns: [{ header: 'Hanya Header' }], rows: [] },
    { name: 'Pesan', rows: [['Tidak ada data.']] },
  ];
  const parts = partsMap(buildXlsx(sheets, { createdAt: CREATED_AT }));
  const s1 = parts.get('xl/worksheets/sheet1.xml')!;
  const s2 = parts.get('xl/worksheets/sheet2.xml')!;
  const s3 = parts.get('xl/worksheets/sheet3.xml')!;
  const s4 = parts.get('xl/worksheets/sheet4.xml')!;

  // urutan elemen worksheet sesuai skema
  const order = ['<dimension', '<sheetViews>', '<sheetFormatPr', '<cols>', '<sheetData>', '<autoFilter', '<pageMargins'];
  const positions = order.map((tag) => s1.indexOf(tag));
  assert.ok(positions.every((pos) => pos > 0), 'semua elemen ada');
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'urutan elemen benar');

  assert.ok(s1.includes('<sheetView tabSelected="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>'));
  assert.ok(
    s1.includes(
      '<cols><col min="1" max="1" width="28" customWidth="1"/><col min="2" max="2" width="255" style="2" customWidth="1"/>' +
        '<col min="3" max="3" width="14" customWidth="1"/><col min="4" max="4" width="14" customWidth="1"/></cols>'
    ),
    'lebar eksplisit, maks 255, default 14, kolom wrap style 2'
  );
  assert.ok(s1.includes('<c r="D1" s="1"/>'), 'header kosong tetap bergaya');
  // baris kosong menutup blok autofilter → catatan di bawah tidak ikut tersaring
  assert.ok(s1.includes('<autoFilter ref="A1:D3"/>'));
  assert.ok(!s1.includes('<row r="4"'), 'baris kosong tidak ditulis');
  assert.ok(s1.includes('<row r="5"><c r="A5" s="4" t="inlineStr"><is><t xml:space="preserve">Catatan: data dipotong.</t></is></c></row>'));
  assert.ok(s1.includes('<dimension ref="A1:D5"/>'));

  assert.ok(s2.includes('<sheetView workbookViewId="0"/>'), 'tanpa freeze & bukan tab terpilih');
  assert.ok(!s2.includes('<autoFilter'));
  assert.ok(!s2.includes('tabSelected'));
  assert.ok(s3.includes('state="frozen"') && !s3.includes('<autoFilter'), 'header saja: freeze tanpa autofilter');
  assert.ok(s3.includes('<dimension ref="A1"/>'));
  assert.ok(!s4.includes('<cols>') && !s4.includes('<pane') && !s4.includes('<autoFilter'), 'tanpa columns: tanpa cols/freeze/filter');
  assert.ok(s4.includes('<sheetView workbookViewId="0"/>'));

  const wb = parts.get('xl/workbook.xml')!;
  const defined = [...wb.matchAll(/<definedName name="_xlnm\._FilterDatabase" localSheetId="(\d+)" hidden="1">([^<]*)<\/definedName>/g)];
  assert.deepEqual(
    defined.map((d) => [d[1], unescapeXml(d[2])]),
    [['0', "'Peserta'!$A$1:$D$3"]]
  );
});

test('buildXlsx: nama sheet disanitasi & unik di workbook', () => {
  const parts = partsMap(
    buildXlsx(
      [
        { name: 'Benar/Salah', rows: [['a']] },
        { name: 'benarsalah', rows: [['b']] },
        { name: '', rows: [['c']] },
        { name: 'A <&> B', rows: [['d']] },
      ],
      { createdAt: CREATED_AT }
    )
  );
  const wb = parts.get('xl/workbook.xml')!;
  const names = [...wb.matchAll(/<sheet name="([^"]*)"/g)].map((m) => unescapeXml(m[1]));
  assert.deepEqual(names, ['BenarSalah', 'benarsalah (2)', 'Sheet', 'A <&> B']);
});

test('buildXlsx: deterministik & timestamp DOS = jam WIB dari createdAt', () => {
  const a = buildXlsx(sampleSheets(), { createdAt: CREATED_AT });
  const b = buildXlsx(sampleSheets(), { createdAt: CREATED_AT });
  assert.ok(a.equals(b), 'input sama → byte sama');
  const part = readZip(a)[0];
  // 2026-10-02T03:04:06Z = 10:04:06 WIB
  assert.equal(part.dosDate, ((2026 - 1980) << 9) | (10 << 5) | 2);
  assert.equal(part.dosTime, (10 << 11) | (4 << 5) | 3);

  // createdAt tidak valid → waktu sekarang (tetap W3CDTF valid)
  const core = partsMap(buildXlsx(sampleSheets(), { createdAt: 'bukan tanggal' })).get('docProps/core.xml')!;
  assert.match(core, /<dcterms:created xsi:type="dcterms:W3CDTF">\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/dcterms:created>/);
  // tanpa meta → creator default, tanpa dc:title
  const core2 = partsMap(buildXlsx(sampleSheets())).get('docProps/core.xml')!;
  assert.ok(core2.includes('<dc:creator>Ara Sinau</dc:creator>') && !core2.includes('<dc:title>'));
});

test('buildXlsx: batas Excel & input tidak valid', () => {
  assert.throws(() => buildXlsx([]), /minimal satu sheet/);
  const emptyRow: never[] = [];
  // header + 1.048.576 baris = melebihi batas (array berbagi satu baris kosong → murah)
  assert.throws(
    () => buildXlsx([{ name: 'Besar', columns: [{ header: 'A' }], rows: new Array(1_048_576).fill(emptyRow) }]),
    RangeError
  );
  // tepat 1.048.576 baris tanpa header masih boleh
  assert.doesNotThrow(() => buildXlsx([{ name: 'Pas', rows: new Array(1_048_576).fill(emptyRow) }]));
  assert.throws(() => buildXlsx([{ name: 'Lebar', rows: [new Array(16_385).fill(1)] }]), RangeError);
  assert.doesNotThrow(() => buildXlsx([{ name: 'Lebar', rows: [new Array(16_384).fill(1)] }]));
});

test('buildXlsx: teks dengan karakter tidak valid di sel, nama sheet & docProps tetap XML valid', () => {
  const dirty = 'A\u0000B\u0001\uD800C￿<D>&"E"\'';
  const buf = buildXlsx(
    [{ name: dirty, columns: [{ header: dirty }], rows: [[dirty]] }],
    { title: dirty, creator: dirty, createdAt: CREATED_AT }
  );
  const parts = readZip(buf);
  for (const part of parts) assertWellFormed(part.data.toString('utf8'), part.name);
  const map = new Map(parts.map((p) => [p.name, p.data.toString('utf8')]));
  const cells = readCells(map.get('xl/worksheets/sheet1.xml')!);
  assert.equal(cells.get('A1')!.value, 'ABC<D>&"E"\'');
  assert.equal(cells.get('A2')!.value, 'ABC<D>&"E"\'');
  assert.ok(map.get('xl/workbook.xml')!.includes('<sheet name="ABC&lt;D&gt;&amp;&quot;E&quot;" sheetId="1" r:id="rId1"/>'));
  assert.ok(map.get('docProps/core.xml')!.includes('<dc:title>ABC&lt;D&gt;&amp;&quot;E&quot;&apos;</dc:title>'));
});
