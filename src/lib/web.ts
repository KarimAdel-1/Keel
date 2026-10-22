// Fetching public web pages the way a browser reaches them, safely. Real websites redirect (example.com to
// https://www.example.com/, /about to /about/), send compressed or non-UTF-8 pages, and sometimes refuse automated
// readers; this follows up to five redirects (each hop goes through the public-address guard again, so a redirect
// can't lead into a private network), caps how much it downloads, decodes the text in the page's own character set,
// and says plainly why a page couldn't be read.

import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { publicFetch } from "./net";

/** Identifies Keel's reader honestly, in the form servers expect from crawlers. */
export const READER_AGENT = "Mozilla/5.0 (compatible; KeelBot/1.0; reads a business's public pages to answer its customers)";
/** The token robots.txt rules can name to address Keel's reader. */
export const READER_TOKEN = "keelbot";

const MAX_REDIRECTS = 5;
const REDIRECT = new Set([301, 302, 303, 307, 308]);

export type FetchProblem = "unreachable" | "blocked" | "busy" | "not_found" | "server_error" | "too_many_redirects" | "not_allowed";

export interface FetchedPage {
  /** Where the page really is, after redirects. */
  url: string;
  status: number;
  type: string;
  text: string;
  bytes: Uint8Array;
}

export type FetchResult = { ok: true; page: FetchedPage } | { ok: false; problem: FetchProblem; status?: number; url: string; detail?: string };

/** Reads at most `max` bytes of a response body, then stops the download. */
async function readLimited(res: Response, max: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
      if (total >= max) {
        await reader.cancel().catch(() => {});
        break;
      }
    }
  } catch {
    // A connection cut mid-page still leaves what arrived.
  }
  const out = new Uint8Array(Math.min(total, max));
  let at = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.length, out.length - at);
    out.set(chunk.subarray(0, take), at);
    at += take;
    if (at >= out.length) break;
  }
  return out;
}

/** Undoes the compression a server applied even when asked not to, within a size limit. */
function decompress(bytes: Uint8Array, encoding: string, max: number): Uint8Array {
  const options = { maxOutputLength: max };
  try {
    if (/gzip/i.test(encoding)) return gunzipSync(bytes, options);
    if (/deflate/i.test(encoding)) return inflateSync(bytes, options);
    if (/br/i.test(encoding)) return brotliDecompressSync(bytes, options);
  } catch {
    // Not really compressed (or cut off): use it as it came.
  }
  return bytes;
}

/** The character set a page declares in its header, a byte-order mark, or a <meta> tag. */
export function charsetOf(bytes: Uint8Array, contentType: string): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf-16le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "utf-16be";
  const fromHeader = contentType.match(/charset\s*=\s*["']?([\w-]+)/i)?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  const fromMeta = head.match(/<meta[^>]+charset\s*=\s*["']?([\w-]+)/i)?.[1];
  return (fromMeta ?? "utf-8").toLowerCase();
}

export function decodeText(bytes: Uint8Array, contentType: string): string {
  const charset = charsetOf(bytes, contentType);
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** A page that answers 200 but is really a bot check ("Just a moment…", a captcha). */
export function looksLikeBotCheck(text: string): boolean {
  const head = text.slice(0, 20_000);
  return (
    /<title>\s*(just a moment|attention required|access denied|access to this page has been denied|are you a robot|security check|please wait|hang tight|pardon our interruption|request unsuccessful|one more step|checking your browser|you have been blocked|bot verification)/i.test(head) ||
    /\b(cf-chl|challenge-platform|captcha-delivery|px-captcha|_incapsula_resource|queue-it|sec-if-cpt|akamai-bm-telemetry|perimeterx|datadome)\b/i.test(head)
  );
}

/**
 * Fetches a public page, following redirects. Each hop is fetched through the public-address guard, so every address
 * along the way is checked.
 */
export async function fetchPage(
  url: string,
  options: { accept?: string; timeoutMs?: number; maxBytes?: number } = {},
): Promise<FetchResult> {
  const maxBytes = options.maxBytes ?? 3_000_000;
  let current = url;
  let waited = false;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let res: Response;
    try {
      res = await publicFetch(current, {
        headers: { "User-Agent": READER_AGENT, Accept: options.accept ?? "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "Accept-Language": "en;q=1, *;q=0.5" },
        redirect: "manual",
        signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
      });
    } catch (error) {
      const message = (error as Error).message ?? "";
      return { ok: false, problem: /private network/.test(message) ? "not_allowed" : "unreachable", url: current, detail: message.slice(0, 200) };
    }
    if (REDIRECT.has(res.status)) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!location) return { ok: false, problem: "server_error", status: res.status, url: current };
      const next = new URL(location, current);
      if (next.protocol !== "http:" && next.protocol !== "https:") return { ok: false, problem: "not_allowed", url: next.toString() };
      next.hash = "";
      current = next.toString();
      continue;
    }
    const type = res.headers.get("content-type") ?? "";
    if (res.status === 429) {
      // Too many visitors at once: the site is asked again once, after the pause it asks for (at most 8 seconds).
      await res.body?.cancel().catch(() => {});
      if (waited) return { ok: false, problem: "busy", status: 429, url: current };
      waited = true;
      const pause = Math.min(8, Math.max(1, Number(res.headers.get("retry-after")) || 3));
      await new Promise((r) => setTimeout(r, pause * 1000));
      hop--;
      continue;
    }
    if (!res.ok) {
      const body = await readLimited(res, 50_000);
      const text = decodeText(body, type);
      const problem: FetchProblem = res.status === 404 || res.status === 410 ? "not_found" : [401, 403].includes(res.status) || looksLikeBotCheck(text) ? "blocked" : res.status >= 500 ? (looksLikeBotCheck(text) ? "blocked" : "server_error") : "not_found";
      return { ok: false, problem, status: res.status, url: current };
    }
    const raw = await readLimited(res, maxBytes);
    const bytes = decompress(raw, res.headers.get("content-encoding") ?? "", maxBytes * 4);
    const text = /^(image|audio|video)\//.test(type) ? "" : decodeText(bytes, type);
    if (/html/.test(type) && text.length < 200_000 && looksLikeBotCheck(text)) return { ok: false, problem: "blocked", status: res.status, url: current };
    return { ok: true, page: { url: current, status: res.status, type, text, bytes } };
  }
  return { ok: false, problem: "too_many_redirects", url: current };
}

