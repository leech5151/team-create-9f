/**
 * Just enough of an .xlsx reader to pull cell text out of the first sheet.
 *
 * An .xlsx is a zip of XML files. The browser already ships both halves —
 * `DecompressionStream` for the deflate entries and `DOMParser` for small XML —
 * so this avoids a spreadsheet library for what is a one-sheet import.
 * The sheet itself can run to megabytes of mostly empty styled cells, so it is
 * scanned with a regex rather than built into a DOM.
 */

/** Cell text by row number, then by 1-based column number. */
export type SheetRows = Map<number, Map<number, string>>;

interface ZipEntry {
  method: number;
  compressedSize: number;
  localOffset: number;
}

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

function readEntries(buf: ArrayBuffer): Map<string, ZipEntry> {
  const view = new DataView(buf);
  // The end-of-central-directory record sits in the last 64KB (its comment is at most that long).
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65_557); i--) {
    if (view.getUint32(i, true) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('엑셀(.xlsx) 파일이 아니에요.');

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const names = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== CENTRAL) throw new Error('엑셀 파일이 손상됐어요.');
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const name = names.decode(new Uint8Array(buf, p + 46, nameLen));
    entries.set(name, {
      method: view.getUint16(p + 10, true),
      compressedSize: view.getUint32(p + 20, true),
      localOffset: view.getUint32(p + 42, true),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readText(buf: ArrayBuffer, entry: ZipEntry): Promise<string> {
  const view = new DataView(buf);
  const at = entry.localOffset;
  if (view.getUint32(at, true) !== LOCAL) throw new Error('엑셀 파일이 손상됐어요.');
  // The local header's own name/extra lengths can differ from the central copy.
  const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  const data = new Uint8Array(buf, start, entry.compressedSize);

  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error('지원하지 않는 압축 방식이에요.');
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      '이 브라우저는 엑셀 가져오기를 지원하지 않아요. 최신 브라우저에서 열어 주세요.',
    );
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code =
        ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : Number(ref.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[ref] ?? whole;
  });
}

/** Concatenated `<t>` runs — covers both plain and rich-text strings. */
const textRuns = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1]!)).join('');

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1]!));
}

function columnNumber(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

/** Path of the workbook's first sheet, via the workbook's relationships. */
function firstSheetPath(workbook: string, rels: string): string {
  const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  const target = rid
    ? (new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*\\bTarget="([^"]+)"`).exec(rels)?.[1] ??
      new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="${rid}"`).exec(rels)?.[1])
    : undefined;
  if (!target) return 'xl/worksheets/sheet1.xml';
  return target.startsWith('/') ? target.slice(1) : `xl/${target}`;
}

/** Reads the first sheet of an .xlsx file into cell text. Empty cells are left out. */
export async function readFirstSheet(file: Blob): Promise<SheetRows> {
  const buf = await file.arrayBuffer();
  const entries = readEntries(buf);
  const text = async (name: string) => {
    const entry = entries.get(name);
    return entry ? readText(buf, entry) : '';
  };

  const [workbook, rels, shared] = await Promise.all([
    text('xl/workbook.xml'),
    text('xl/_rels/workbook.xml.rels'),
    text('xl/sharedStrings.xml'),
  ]);
  const strings = parseSharedStrings(shared);
  const sheet = await text(firstSheetPath(workbook, rels));
  if (!sheet) throw new Error('엑셀에서 시트를 찾지 못했어요.');

  const rows: SheetRows = new Map();
  const cell = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  for (const m of sheet.matchAll(cell)) {
    const body = m[2];
    if (!body) continue;
    const ref = /\br="([A-Z]+)(\d+)"/.exec(m[1]!);
    if (!ref) continue;
    const type = /\bt="(\w+)"/.exec(m[1]!)?.[1];
    let value: string;
    if (type === 'inlineStr') {
      value = textRuns(body);
    } else {
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      if (raw === undefined) continue;
      value = type === 's' ? (strings[Number(raw)] ?? '') : unescapeXml(raw);
    }
    value = value.trim();
    if (value === '') continue;

    const row = Number(ref[2]);
    let cells = rows.get(row);
    if (!cells) rows.set(row, (cells = new Map()));
    cells.set(columnNumber(ref[1]!), value);
  }
  return rows;
}
