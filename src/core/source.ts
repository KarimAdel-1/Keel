// Splitting a source's text into chunks without a model: at the most natural places, each chunk keeping the document
// and section it came from.

export interface SourceChunk {
  start: number;
  end: number;
  text: string;
  /** The uploaded file or web page it came from ("# Source: …"). */
  document?: string;
  /** The nearest heading above it. */
  section?: string;
}

const SOURCE_LINE = /^# Source: *(.+?) *$/;
const HEADING_LINE = /^#{1,6} +(.+?) *$/;
/** A new document starts a new chunk (a "---" between documents stays with the text before it). */
const DOCUMENT_BREAK = /^# Source:/;

/** Pieces that each end a paragraph (their separators kept), so joining them gives back the exact text. */
function paragraphs(text: string): string[] {
  const out: string[] = [];
  const re = /\n{2,}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    out.push(text.slice(last, m.index + m[0].length));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A piece too big for a chunk, cut at lines, then sentences, then characters: never losing a character. */
function cut(piece: string, size: number): string[] {
  if (piece.length <= size) return [piece];
  const byLine = piece.split(/(?<=\n)/);
  if (byLine.length > 1) return byLine.flatMap((l) => cut(l, size));
  const bySentence = piece.split(/(?<=[.!?])\s+(?=\S)/).length > 1 ? piece.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) ?? [piece] : [piece];
  if (bySentence.length > 1) return bySentence.flatMap((s) => cut(s, size));
  const out: string[] = [];
  for (let i = 0; i < piece.length; i += size) out.push(piece.slice(i, i + size));
  return out;
}

interface Marker {
  at: number;
  kind: "document" | "heading";
  name: string;
}

const markerCache = new Map<string, Marker[]>();

/** Where each document and heading starts, in order. */
function markers(policy: string): Marker[] {
  const cached = markerCache.get(policy);
  if (cached) return cached;
  const list: Marker[] = [];
  let at = 0;
  for (const line of policy.split("\n")) {
    const source = line.match(SOURCE_LINE);
    const heading = !source && line.match(HEADING_LINE);
    if (source) list.push({ at, kind: "document", name: source[1] });
    else if (heading) list.push({ at, kind: "heading", name: heading[1] });
    at += line.length + 1;
  }
  if (markerCache.size > 20) markerCache.clear();
  markerCache.set(policy, list);
  return list;
}

/** The document and nearest heading at an offset of the source. */
function sourceAt(policy: string, offset: number): { document?: string; section?: string } {
  let document: string | undefined;
  let section: string | undefined;
  for (const m of markers(policy)) {
    if (m.at > offset) break;
    if (m.kind === "document") {
      document = m.name;
      section = undefined;
    } else section = m.name;
  }
  return { ...(document ? { document } : {}), ...(section ? { section } : {}) };
}

/**
 * Splits the source into chunks of about `size` characters at the most natural places: a new document first, then
 * paragraphs, then lines and sentences. Each chunk knows its offsets, document and section; the chunks join back to
 * the exact text.
 */
export function splitSource(policy: string, size = 6000): SourceChunk[] {
  const pieces = paragraphs(policy).flatMap((p) => cut(p, size));
  const chunks: SourceChunk[] = [];
  let start = 0;
  let text = "";
  const flush = () => {
    if (!text) return;
    chunks.push({ start, end: start + text.length, text, ...sourceAt(policy, start) });
    start += text.length;
    text = "";
  };
  for (const piece of pieces) {
    // A new document always starts a new chunk; otherwise fill up to the size.
    if (text && (DOCUMENT_BREAK.test(piece) || text.length + piece.length > size)) flush();
    text += piece;
  }
  flush();
  return chunks;
}
