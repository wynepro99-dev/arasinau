/**
 * Writer XLSX zero-dependency (hanya Node built-in: zlib + Buffer).
 *
 * - Teks selalu inline string (tanpa shared strings) dan TIDAK PERNAH formula,
 *   sehingga teks yang diawali '=', '+', '-', '@' tidak dieksekusi (aman dari formula injection).
 * - Paket ZIP ditulis manual: local header + central directory + EOCD,
 *   deflate (method 8), CRC32, flag UTF-8 (bit 11), tanpa zip64.
 */
import * as zlib from 'zlib';
import type { XlsxCell, XlsxMeta, XlsxSheet } from './types';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const MAX_ROWS = 1_048_576;
const MAX_COLS = 16_384;
const MAX_CELL_CHARS = 32_767;
const SHEET_NAME_MAX = 31;
const DEFAULT_COL_WIDTH = 14;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Index cellXfs di styles.xml. */
const STYLE = { header: 1, wrap: 2, number: 3, text: 4 } as const;

const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// ═══════════════════════════════════════════════════════════════
// Helper teks
// ═══════════════════════════════════════════════════════════════

/** Karakter di luar XML 1.0 + surrogate tanpa pasangan (lone surrogate). */
const INVALID_XML_CHARS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function stripInvalidXmlChars(value: string): string {
  return value.replace(INVALID_XML_CHARS, '');
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch]);
}

/** Buang karakter XML 1.0 yang tidak valid + lone surrogate, lalu escape & < > " '. */
export function cleanXmlText(value: string): string {
  return escapeXml(stripInvalidXmlChars(String(value ?? '')));
}

/** Potong ke maksimal `max` code unit UTF-16 tanpa membelah pasangan surrogate. */
function truncateUnits(value: string, max: number): string {
  if (value.length <= max) return value;
  let cut = max;
  const code = value.charCodeAt(cut - 1);
  if (code >= 0xd800 && code <= 0xdbff) cut -= 1;
  return value.slice(0, cut);
}

/**
 * Excel membaca pola `_xHHHH_` di teks sel sebagai escape karakter (ST_Xstring).
 * Agar teks asli tampil apa adanya, underscore pembukanya di-escape menjadi `_x005F_`.
 */
function escapeOoxmlUnderscore(value: string): string {
  return value.replace(/_(?=x[0-9A-Fa-f]{4}_)/g, '_x005F_');
}

/** Karakter yang butuh pembersihan/escape; teks tanpa karakter ini ditulis apa adanya (jalur cepat). */
const NEEDS_CLEANING = /[\u0000-\u0008\u000B-\u001F&<>"'\uD800-\uDFFF￾￿]|_x/;

/** Teks sel siap tulis: valid XML, baris baru '\n', ≤ 32.767 karakter, ter-escape. */
function cellText(raw: string): string {
  if (raw.length <= MAX_CELL_CHARS && !NEEDS_CLEANING.test(raw)) return raw;
  const normalized = stripInvalidXmlChars(raw).replace(/\r\n?/g, '\n');
  return escapeXml(escapeOoxmlUnderscore(truncateUnits(normalized, MAX_CELL_CHARS)));
}

// ═══════════════════════════════════════════════════════════════
// CRC32, kolom, nama sheet
// ═══════════════════════════════════════════════════════════════

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (IEEE 802.3, polinom 0xEDB88320) — sama dengan yang dipakai format ZIP. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** zlib.crc32 bawaan Node ≥ 22.2 (hasil identik, jauh lebih cepat); fallback ke tabel di atas. */
const zipCrc32: (data: Uint8Array) => number =
  typeof zlib.crc32 === 'function' ? (data) => zlib.crc32(data) >>> 0 : crc32;

/** Huruf kolom Excel dari index 0-based: 0→A, 25→Z, 26→AA, 701→ZZ, 702→AAA. */
export function columnLetter(index0: number): string {
  if (!Number.isInteger(index0) || index0 < 0) {
    throw new RangeError(`Index kolom tidak valid: ${index0}`);
  }
  let n = index0 + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function trimSheetNameEdges(value: string): string {
  return value.replace(/^[\s']+|[\s']+$/g, '');
}

/**
 * Nama sheet valid Excel: maks 31 karakter, tanpa []:*?/\, tidak diawali/diakhiri
 * apostrof, tidak kosong (fallback "Sheet"), unik tanpa membedakan huruf besar/kecil
 * (ditambah " (2)", " (3)", … tetap ≤ 31 karakter). Nama hasil dimasukkan ke `used`.
 */
export function sanitizeSheetName(name: string, used: Set<string>): string {
  let base = stripInvalidXmlChars(String(name ?? ''))
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[[\]:*?\/\\]/g, '')
    .replace(/\s+/g, ' ');
  // Pola `_xHHHH_` akan di-decode Excel → netralkan agar nama tetap apa adanya.
  while (/_x[0-9A-Fa-f]{4}_/.test(base)) base = base.replace(/_(x[0-9A-Fa-f]{4}_)/g, '$1');
  base = trimSheetNameEdges(truncateUnits(trimSheetNameEdges(base), SHEET_NAME_MAX)) || 'Sheet';

  const isTaken = (candidate: string): boolean => {
    const lower = candidate.toLowerCase();
    // "History" adalah nama cadangan Excel.
    if (lower === 'history') return true;
    for (const u of used) if (u.toLowerCase() === lower) return true;
    return false;
  };

  let result = base;
  for (let i = 2; isTaken(result); i++) {
    const suffix = ` (${i})`;
    result = trimSheetNameEdges(truncateUnits(base, SHEET_NAME_MAX - suffix.length)) + suffix;
  }
  used.add(result);
  return result;
}

// ═══════════════════════════════════════════════════════════════
// Worksheet
// ═══════════════════════════════════════════════════════════════

interface PreparedSheet {
  name: string;
  xml: string;
  /** Range autofilter (mis. "A1:H20") atau null. */
  filterRef: string | null;
}

function colWidth(width: number | undefined): string {
  const w = typeof width === 'number' && Number.isFinite(width) ? width : DEFAULT_COL_WIDTH;
  return String(Math.round(Math.min(255, Math.max(1, w)) * 100) / 100);
}

function absoluteRef(ref: string): string {
  return ref.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2');
}

function buildSheetXml(sheet: XlsxSheet, index: number): Omit<PreparedSheet, 'name'> {
  const columns = Array.isArray(sheet.columns) && sheet.columns.length > 0 ? sheet.columns : null;
  const rows: XlsxCell[][] = Array.isArray(sheet.rows) ? sheet.rows : [];
  const headerRows = columns ? 1 : 0;

  if (headerRows + rows.length > MAX_ROWS) {
    throw new RangeError(`Sheet "${sheet.name}" melebihi batas ${MAX_ROWS} baris Excel.`);
  }
  let widest = columns ? columns.length : 0;
  for (const row of rows) if (Array.isArray(row) && row.length > widest) widest = row.length;
  if (widest > MAX_COLS) {
    throw new RangeError(`Sheet "${sheet.name}" melebihi batas ${MAX_COLS} kolom Excel.`);
  }

  const letters: string[] = [];
  for (let i = 0; i < widest; i++) letters.push(columnLetter(i));
  const wrapCol = columns ? columns.map((c) => Boolean(c.wrap)) : [];

  const rowXml: string[] = [];
  let maxCol = 0;
  let lastRow = 0;

  if (columns) {
    const cells = columns.map((c, ci) => {
      const text = cellText(String(c.header ?? ''));
      return text
        ? `<c r="${letters[ci]}1" s="${STYLE.header}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`
        : `<c r="${letters[ci]}1" s="${STYLE.header}"/>`;
    });
    rowXml.push(`<row r="1">${cells.join('')}</row>`);
    maxCol = columns.length;
    lastRow = 1;
  }

  // Baris kosong pertama menutup blok data autofilter (seperti "current region" Excel),
  // sehingga catatan di bawah tabel tidak ikut tersaring.
  let firstEmptyRow = -1;
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const r = headerRows + ri + 1;
    let cells = '';
    if (Array.isArray(row)) {
      for (let ci = 0; ci < row.length; ci++) {
        const value = row[ci];
        if (value === null || value === undefined) continue;
        let xml = '';
        if (typeof value === 'number') {
          if (Number.isFinite(value)) xml = `<c r="${letters[ci]}${r}" s="${STYLE.number}"><v>${value}</v></c>`;
        } else {
          const text = cellText(typeof value === 'boolean' ? (value ? 'Ya' : 'Tidak') : String(value));
          if (text) {
            const style = wrapCol[ci] ? STYLE.wrap : STYLE.text;
            xml = `<c r="${letters[ci]}${r}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
          }
        }
        if (xml) {
          cells += xml;
          if (ci + 1 > maxCol) maxCol = ci + 1;
        }
      }
    }
    if (cells) {
      rowXml.push(`<row r="${r}">${cells}</row>`);
      lastRow = r;
    } else if (firstEmptyRow < 0) {
      firstEmptyRow = ri;
    }
  }

  const freeze = sheet.freezeHeader ?? Boolean(columns);
  const wantFilter = sheet.autoFilter ?? Boolean(columns && rows.length > 0);
  const dataRows = firstEmptyRow < 0 ? rows.length : firstEmptyRow;
  const filterRef =
    wantFilter && columns && dataRows > 0 ? `A1:${letters[columns.length - 1]}${1 + dataRows}` : null;

  const dimension =
    maxCol > 0 && lastRow > 0
      ? maxCol === 1 && lastRow === 1
        ? 'A1'
        : `A1:${letters[maxCol - 1]}${lastRow}`
      : 'A1';

  const tabSelected = index === 0 ? ' tabSelected="1"' : '';
  const sheetView = freeze
    ? `<sheetView${tabSelected} workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>`
    : `<sheetView${tabSelected} workbookViewId="0"/>`;

  const cols = columns
    ? `<cols>${columns
        .map((c, i) => {
          const style = c.wrap ? ` style="${STYLE.wrap}"` : '';
          return `<col min="${i + 1}" max="${i + 1}" width="${colWidth(c.width)}"${style} customWidth="1"/>`;
        })
        .join('')}</cols>`
    : '';

  const xml =
    XML_DECL +
    `<worksheet xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    `<dimension ref="${dimension}"/>` +
    `<sheetViews>${sheetView}</sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    `<sheetData>${rowXml.join('')}</sheetData>` +
    (filterRef ? `<autoFilter ref="${filterRef}"/>` : '') +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    '</worksheet>';

  return { xml, filterRef };
}

// ═══════════════════════════════════════════════════════════════
// Part paket (workbook, styles, docProps, content types)
// ═══════════════════════════════════════════════════════════════

const STYLES_XML =
  XML_DECL +
  `<styleSheet xmlns="${NS_MAIN}">` +
  '<fonts count="2">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="3">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE0E7FF"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="2">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right>' +
  '<top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="5">' +
  // 0 default
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  // 1 header: bold + latar + border + wrap
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
  '<alignment vertical="center" wrapText="1"/></xf>' +
  // 2 teks panjang: wrap, rata atas
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' +
  // 3 angka (General), rata atas
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment vertical="top"/></xf>' +
  // 4 teks biasa, rata atas (sejajar dengan sel wrap di baris yang sama)
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top"/></xf>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '<dxfs count="0"/>' +
  '<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>' +
  '</styleSheet>';

function contentTypesXml(sheetCount: number): string {
  const sheets: string[] = [];
  for (let i = 1; i <= sheetCount; i++) {
    sheets.push(
      `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    );
  }
  return (
    XML_DECL +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets.join('') +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>'
  );
}

const ROOT_RELS_XML =
  XML_DECL +
  `<Relationships xmlns="${NS_PKG_REL}">` +
  `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  `<Relationship Id="rId3" Type="${NS_REL}/extended-properties" Target="docProps/app.xml"/>` +
  '</Relationships>';

function workbookRelsXml(sheetCount: number): string {
  const rels: string[] = [];
  for (let i = 1; i <= sheetCount; i++) {
    rels.push(`<Relationship Id="rId${i}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i}.xml"/>`);
  }
  rels.push(`<Relationship Id="rId${sheetCount + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>`);
  return XML_DECL + `<Relationships xmlns="${NS_PKG_REL}">${rels.join('')}</Relationships>`;
}

function workbookXml(sheets: PreparedSheet[]): string {
  const sheetTags = sheets
    .map((s, i) => `<sheet name="${cleanXmlText(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('');
  const names = sheets
    .map((s, i) =>
      s.filterRef
        ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">` +
          cleanXmlText(`'${s.name.replace(/'/g, "''")}'!${absoluteRef(s.filterRef)}`) +
          '</definedName>'
        : ''
    )
    .join('');
  return (
    XML_DECL +
    `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}">` +
    '<bookViews><workbookView activeTab="0"/></bookViews>' +
    `<sheets>${sheetTags}</sheets>` +
    (names ? `<definedNames>${names}</definedNames>` : '') +
    '</workbook>'
  );
}

function w3cdtf(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function coreXml(meta: XlsxMeta, createdMs: number): string {
  const creator = cleanXmlText(meta.creator || 'Ara Sinau');
  const title = meta.title ? cleanXmlText(meta.title) : '';
  const stamp = w3cdtf(createdMs);
  return (
    XML_DECL +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    (title ? `<dc:title>${title}</dc:title>` : '') +
    `<dc:creator>${creator}</dc:creator>` +
    `<cp:lastModifiedBy>${creator}</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>` +
    '</cp:coreProperties>'
  );
}

function appXml(sheets: PreparedSheet[]): string {
  const titles = sheets.map((s) => `<vt:lpstr>${cleanXmlText(s.name)}</vt:lpstr>`).join('');
  return (
    XML_DECL +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>Ara Sinau</Application>' +
    '<DocSecurity>0</DocSecurity>' +
    '<ScaleCrop>false</ScaleCrop>' +
    '<HeadingPairs><vt:vector size="2" baseType="variant">' +
    '<vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>' +
    `<vt:variant><vt:i4>${sheets.length}</vt:i4></vt:variant>` +
    '</vt:vector></HeadingPairs>' +
    `<TitlesOfParts><vt:vector size="${sheets.length}" baseType="lpstr">${titles}</vt:vector></TitlesOfParts>` +
    '<LinksUpToDate>false</LinksUpToDate>' +
    '<SharedDoc>false</SharedDoc>' +
    '<HyperlinksChanged>false</HyperlinksChanged>' +
    '</Properties>'
  );
}

// ═══════════════════════════════════════════════════════════════
// ZIP
// ═══════════════════════════════════════════════════════════════

interface ZipEntry {
  name: string;
  data: Buffer;
}

/** Tanggal & jam format DOS (jam dinding WIB), dibatasi rentang 1980–2107. */
function dosDateTime(ms: number): { time: number; date: number } {
  const d = new Date(ms + WIB_OFFSET_MS);
  const year = d.getUTCFullYear();
  if (!Number.isFinite(year) || year < 1980) return { time: 0, date: (1 << 5) | 1 };
  if (year > 2107) return { time: (23 << 11) | (59 << 5) | 29, date: (127 << 9) | (12 << 5) | 31 };
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

function buildZip(entries: ZipEntry[], modifiedMs: number): Buffer {
  if (entries.length >= 0xffff) throw new RangeError('Jumlah file ZIP melebihi batas (tanpa zip64).');
  const { time, date } = dosDateTime(modifiedMs);
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    // Level tercepat: file dibuat on-the-fly; ukuran hanya ±20% lebih besar dari level default.
    const compressed = zlib.deflateRawSync(entry.data, { level: zlib.constants.Z_BEST_SPEED });
    const crc = zipCrc32(entry.data);
    if (entry.data.length > 0xffffffff || compressed.length > 0xffffffff) {
      throw new RangeError('Ukuran file XLSX melebihi 4GB (zip64 tidak didukung).');
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // versi minimum untuk ekstrak (2.0, deflate)
    local.writeUInt16LE(0x0800, 6); // bit 11: nama file UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4); // dibuat oleh: MS-DOS, versi 2.0
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(time, 12);
    header.writeUInt16LE(date, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(compressed.length, 20);
    header.writeUInt32LE(entry.data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt16LE(0, 30); // extra
    header.writeUInt16LE(0, 32); // komentar
    header.writeUInt16LE(0, 34); // disk
    header.writeUInt16LE(0, 36); // atribut internal
    header.writeUInt32LE(0, 38); // atribut eksternal
    header.writeUInt32LE(offset, 42);

    chunks.push(local, name, compressed);
    central.push(header, name);
    offset += local.length + name.length + compressed.length;
    if (offset > 0xffffffff) throw new RangeError('Ukuran file XLSX melebihi 4GB (zip64 tidak didukung).');
  }

  const centralSize = central.reduce((sum, b) => sum + b.length, 0);
  if (offset + centralSize + 22 > 0xffffffff) {
    throw new RangeError('Ukuran file XLSX melebihi 4GB (zip64 tidak didukung).');
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, ...central, eocd]);
}

// ═══════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════

/** Bangun file .xlsx (Buffer) dari daftar sheet. Minimal satu sheet. */
export function buildXlsx(sheets: XlsxSheet[], meta?: XlsxMeta): Buffer {
  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new Error('Workbook XLSX harus berisi minimal satu sheet.');
  }
  const info = meta ?? {};
  const parsed = info.createdAt ? Date.parse(info.createdAt) : NaN;
  const createdMs = Number.isFinite(parsed) ? parsed : Date.now();

  const used = new Set<string>();
  const prepared: PreparedSheet[] = sheets.map((sheet, i) => ({
    name: sanitizeSheetName(sheet.name, used),
    ...buildSheetXml(sheet, i),
  }));

  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: Buffer.from(contentTypesXml(prepared.length), 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(ROOT_RELS_XML, 'utf8') },
    { name: 'docProps/core.xml', data: Buffer.from(coreXml(info, createdMs), 'utf8') },
    { name: 'docProps/app.xml', data: Buffer.from(appXml(prepared), 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbookXml(prepared), 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRelsXml(prepared.length), 'utf8') },
    { name: 'xl/styles.xml', data: Buffer.from(STYLES_XML, 'utf8') },
    ...prepared.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(s.xml, 'utf8') })),
  ];
  return buildZip(entries, createdMs);
}
