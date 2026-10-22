// Reading a website into knowledge, without an outside service: the start page (wherever it redirects to), the pages
// its sitemaps list and the pages it links to on the same site, the most useful first (FAQ, shipping, returns,
// pricing, contact…), a few at a time, up to a page limit. It respects robots.txt (its Allow and Disallow rules,
// wildcards included), skips carts, logins and search results, adds the facts pages keep in structured data (prices,
// opening hours, FAQs). A site built by JavaScript in the browser is opened in a headless browser and read once its
// scripts have run (src/lib/render.ts). When nothing can be read it says why: blocked, robots.txt, not found.

import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { htmlLinks, htmlToText, needsJavaScript, pageFacts } from "@/core/html";
import { renderPage } from "@/lib/render";
import { READER_TOKEN, fetchPage, type FetchProblem } from "@/lib/web";

export interface CrawledPage {
  url: string;
  title: string;
  text: string;
}

export type CrawlProblem = FetchProblem | "robots" | "needs_javascript" | "no_text";

export interface CrawlResult {
  pages: CrawledPage[];
  /** The address the site really lives at (after redirects). */
  finalUrl: string;
  /** Why nothing (or only the start page) could be read. */
  problem?: CrawlProblem;
}

const SKIP_EXTENSION = /\.(pdf|jpe?g|png|gif|svg|webp|avif|ico|css|js|mjs|json|xml|rss|atom|txt|zip|gz|tgz|rar|7z|mp3|wav|mp4|webm|mov|avi|woff2?|ttf|otf|eot|docx?|xlsx?|pptx?|csv|dmg|exe|apk)$/i;
/** Pages that never hold knowledge: carts, accounts, search results, feeds, admin. */
const SKIP_PATH =
  /\/(cart|basket|checkout|account|my-account|login|log-in|signin|sign-in|signup|sign-up|register|logout|password|wp-admin|wp-login|wp-json|cdn-cgi|feed|search|wishlist|compare|thank-?you[^/]*|thanks[^/]*)(\/|$)|[?&](add-to-cart|add_to_cart|s|q|search|replytocom|share|print|sort|order|filter_[a-z]+)=/i;
// Which pages to read first, by the words in their address (whole words: "care" isn't "careers").
/** What a support assistant needs most. */
const FIRST_WORDS = new Set(
  "faq faqs help support questions shipping delivery deliveries return returns refund refunds exchange exchanges warranty warranties guarantee contact pricing price prices plan plans payment payments sizing size sizes order orders tracking policy policies care customer service".split(" "),
);
/** Often useful. */
const USEFUL_WORDS = new Set(
  "about terms privacy hours location locations store stores visit booking book appointment appointments reservation reservations menu services treatments classes courses admission admissions fees membership memberships".split(" "),
);
/** Rarely what a customer asks about: read last. */
const LAST_WORDS = new Set(
  "careers career jobs job press news newsroom media blog blogs investor investors shareholder shareholders dividend dividends assembly agm announces announcement announcements results earnings quarterly changelog changelogs release releases wholesale affiliate affiliates partner partners sitemap stories article articles events lookbook ambassador ambassadors cookie cookies".split(" "),
);
const pathWords = (u: URL) => u.pathname.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/** The most pages read whose address says they're rarely what a customer asks about (news, investors…). */
const LAST_PAGES = 8;
/** Pages read from one folder (/pages/stores/…, /blog/…) before the rest of the site gets a turn; help pages excepted. */
const PER_FOLDER = 3;
const folderOf = (u: URL) => u.pathname.replace(/\/[^/]*\/?$/, "") || "/";
/** A page that only says it isn't there, though the server answered 200. */
const NOT_FOUND = /\b(404|page not found|not found)\b/i;
/** Subdomains that hold a business's help pages. */
const HELP_SUBDOMAIN = /^(help|support|faq|faqs|care|customercare|customer-care|customerservice|customer-service|service|helpcenter|help-center|kb|knowledge|docs|info)$/i;
/** A first path segment that names a language or region: en, fr, en-gb, pt_BR. */
const LOCALE = /^[a-z]{2}(?:[-_][a-z]{2,3})?$/i;
/** Language codes a site's translated sections use (/ar/, /fr/): country-only codes (us, gb, au) aren't among them. */
const LANGUAGES = new Set("ar bg cs da de el en es et fa fi fr he hi hr hu id it ja ko lt lv ms nb nl no pl pt ro ru sk sl sr sv th tr uk vi zh".split(" "));
/** The language a page declares: <html lang="en-US"> is "en". */
const pageLanguage = (html: string) => html.slice(0, 5000).match(/<html\b[^>]*\blang\s*=\s*["']?([a-z]{2,3})/i)?.[1]?.toLowerCase();
const TRACKING = /^(utm_[a-z]+|gclid|fbclid|msclkid|mc_cid|mc_eid|_ga|_gl|ref|srsltid|igshid|yclid)$/i;
/** Pages shorter than this are menus or redirects, not knowledge. */
const MIN_PAGE_CHARS = 200;
const PARALLEL = 4;
/** Pages rendered in a browser at once, and at most per read: rendering is slower. */
const RENDER_PARALLEL = 2;
const RENDER_MAX_PAGES = 30;
const MAX_SITEMAPS = 8;
const MAX_QUEUE = 2000;
/** The most of one page that's read: shop pages carry megabytes of data before their words. */
const PAGE_BYTES = 10_000_000;

// ── robots.txt ──────────────────────────────────────────────────────────────────────────────────────────────────

export interface Robots {
  rules: { allow: boolean; pattern: string }[];
  sitemaps: string[];
}

/** The rules for Keel's reader (its own group if the file has one, else the one for every reader) and the sitemaps. */
export function parseRobots(text: string): Robots {
  const groups: { agents: string[]; rules: Robots["rules"] }[] = [];
  const sitemaps: string[] = [];
  let current: (typeof groups)[number] | undefined;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      if (!lastWasAgent || !current) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (current && (key === "allow" || key === "disallow")) {
      if (value) current.rules.push({ allow: key === "allow", pattern: value });
    }
  }
  const own = groups.filter((g) => g.agents.some((a) => a !== "*" && READER_TOKEN.includes(a.replace(/\/.*$/, ""))));
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes("*"));
  return { rules: chosen.flatMap((g) => g.rules), sitemaps };
}

/** A robots.txt path pattern as a regular expression: `*` matches anything, a final `$` ends the path. */
function patternRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** Whether robots.txt lets the reader fetch the URL: the longest matching rule decides, Allow winning a tie. */
export function robotsAllow(url: URL, robots: Robots): boolean {
  const path = url.pathname + url.search;
  let best: { allow: boolean; length: number } | undefined;
  for (const rule of robots.rules) {
    let matches = false;
    try {
      matches = patternRegex(rule.pattern).test(path);
    } catch {
      matches = path.startsWith(rule.pattern);
    }
    if (!matches) continue;
    const length = rule.pattern.length;
    if (!best || length > best.length || (length === best.length && rule.allow)) best = { allow: rule.allow, length };
  }
  return best?.allow ?? true;
}

/** The Disallow rules that apply to Keel's reader (kept for callers that only need those). */
export const robotsDisallows = (robots: string) => parseRobots(robots).rules.filter((r) => !r.allow).map((r) => r.pattern);

// ── Addresses ───────────────────────────────────────────────────────────────────────────────────────────────────

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, "");

/** The URL without its fragment and tracking parameters. */
export function cleanUrl(url: URL): URL {
  const clean = new URL(url);
  clean.hash = "";
  for (const key of [...clean.searchParams.keys()]) if (TRACKING.test(key)) clean.searchParams.delete(key);
  return clean;
}

/** One key for addresses that are the same page: with or without www, a trailing slash or index.html. */
const pageKey = (url: URL) => `${bareHost(url.hostname)}${url.pathname.replace(/\/index\.(html?|php)$/i, "/").replace(/\/+$/, "") || "/"}${url.search}`;

// ── Sitemaps ────────────────────────────────────────────────────────────────────────────────────────────────────

async function sitemapUrls(candidates: string[], sameSite: (u: URL) => boolean): Promise<string[]> {
  const pages: string[] = [];
  const queue = [...new Set(candidates)];
  const seen = new Set<string>();
  while (queue.length && seen.size < MAX_SITEMAPS && pages.length < MAX_QUEUE) {
    const url = queue.shift()!;
    if (seen.has(url)) continue;
    seen.add(url);
    const result = await fetchPage(url, { accept: "application/xml,text/xml;q=0.9,*/*;q=0.5", timeoutMs: 15_000, maxBytes: 8_000_000 });
    if (!result.ok) continue;
    let xml = result.page.text;
    if (/\.gz$/i.test(url) || /gzip/.test(result.page.type)) {
      try {
        xml = new TextDecoder().decode(gunzipSync(result.page.bytes, { maxOutputLength: 30_000_000 }));
      } catch {
        continue;
      }
    }
    const isIndex = /<sitemapindex\b/i.test(xml);
    for (const [, loc] of xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)) {
      const value = loc.replace(/&amp;/g, "&");
      if (isIndex) queue.push(value);
      else {
        try {
          if (sameSite(new URL(value))) pages.push(value);
        } catch {
          // not a URL
        }
      }
      if (pages.length >= MAX_QUEUE) break;
    }
  }
  return pages;
}

// ── The crawl ───────────────────────────────────────────────────────────────────────────────────────────────────

/** A page's knowledge: its main text, plus the facts it keeps in structured data when they add something. */
function pageContent(html: string): { title: string; text: string } {
  const { title, text } = htmlToText(html);
  const facts = pageFacts(html);
  const extra = facts
    .split("\n")
    .filter((line) => line.trim() && !text.includes(line.trim().slice(0, 60)))
    .join("\n")
    .trim();
  return { title, text: extra ? `${text}${text ? "\n\n" : ""}## Details\n\n${extra}` : text };
}

export async function crawlSite(
  start: string,
  options: {
    maxPages?: number;
    maxDepth?: number;
    /** false: never render a page built by JavaScript in the headless browser (and say the site needs it instead). */
    render?: false;
    onPage?: (page: CrawledPage, found: number) => void | Promise<void>;
  } = {},
): Promise<CrawlResult> {
  let maxPages = options.maxPages ?? 50;
  const render = options.render === false ? undefined : renderPage;
  /** Set when the site turns out to be built by JavaScript: every page is then rendered. */
  let rendering = false;
  const maxDepth = options.maxDepth ?? 4;

  // The start page first: it tells us where the site really lives.
  const first = await fetchPage(cleanUrl(new URL(start)).toString(), { maxBytes: PAGE_BYTES });
  if (!first.ok) return { pages: [], finalUrl: first.url, problem: first.problem };
  const home = new URL(first.page.url);
  const site = bareHost(home.hostname);
  // A site split by language (/en-gb/…, /fr/…) is read in the language section it opened in; a site whose own
  // pages are in one language (<html lang="en">) with translations in sections (/ar/…) is read in that language only:
  // the agent answers in each customer's language anyway, and a translation would take the place of a new page.
  const locale = home.pathname.split("/")[1]?.match(LOCALE)?.[0]?.toLowerCase();
  const language = locale ? undefined : /html/.test(first.page.type) ? pageLanguage(first.page.text) : undefined;
  const inLocale = (u: URL) => {
    const first = (u.pathname.split("/")[1] ?? "").toLowerCase();
    if (!LOCALE.test(first)) return true;
    if (locale) return first === locale;
    const code = first.split(/[-_]/)[0];
    return !language || !LANGUAGES.has(code) || code === language;
  };
  // The business's help centre often lives on its own address (help.…, support.…): it's part of the same site.
  const ownHost = (host: string) => {
    const bare = bareHost(host);
    return bare === site || (bare.endsWith(`.${site}`) && HELP_SUBDOMAIN.test(bare.slice(0, -site.length - 1)));
  };
  const sameSite = (u: URL) => (u.protocol === "https:" || u.protocol === "http:") && ownHost(u.hostname) && inLocale(u) && !SKIP_EXTENSION.test(u.pathname) && !SKIP_PATH.test(u.pathname + u.search);

  // Each address (the site, its help centre) has its own robots.txt, read once.
  const robotsByOrigin = new Map<string, Promise<Robots>>();
  const robotsFor = (origin: string) => {
    if (!robotsByOrigin.has(origin)) {
      robotsByOrigin.set(
        origin,
        fetchPage(`${origin}/robots.txt`, { accept: "text/plain", timeoutMs: 10_000, maxBytes: 500_000 }).then((r) =>
          r.ok && !/html/.test(r.page.type) ? parseRobots(r.page.text) : { rules: [], sitemaps: [] },
        ),
      );
    }
    return robotsByOrigin.get(origin)!;
  };
  const robots = await robotsFor(home.origin);
  if (!robotsAllow(home, robots)) return { pages: [], finalUrl: home.toString(), problem: "robots" };
  const isHelpHost = (u: URL) => bareHost(u.hostname) !== site;

  const queued = new Map<string, { url: string; depth: number }>();
  const done = new Set<string>();
  const contents = new Set<string>();
  const pages: CrawledPage[] = [];
  let startProblem: CrawlProblem | undefined;

  const enqueue = (raw: string, depth: number) => {
    if (queued.size >= MAX_QUEUE) return;
    let url: URL;
    try {
      url = cleanUrl(new URL(raw));
    } catch {
      return;
    }
    const key = pageKey(url);
    if (done.has(key) || queued.has(key) || !sameSite(url)) return;
    queued.set(key, { url: url.toString(), depth });
  };

  /** Pages taken from each folder so far, and pages chosen that are rarely what a customer asks about. */
  const takenIn = new Map<string, number>();
  let lastTaken = 0;
  // An address that reads like a headline (eight words or more in its last part) is an article: news, a post.
  // So is a dated one (/2025-04-30-…, /2024/03/…): news, release notes, posts.
  const headline = (url: URL) => {
    const last = url.pathname.split("/").filter(Boolean).pop() ?? "";
    return last.split(/[^a-z0-9]+/i).filter(Boolean).length >= 8 || /(^|\/)(19|20)\d\d[-/](0[1-9]|1[0-2])([-/]|$)/.test(url.pathname);
  };
  const isLast = (url: URL) => headline(url) || pathWords(url).some((w) => LAST_WORDS.has(w));
  /** How soon a page should be read: lower first. */
  const priority = (url: URL, depth: number) => {
    const words = pathWords(url);
    const crowded = (takenIn.get(folderOf(url)) ?? 0) >= PER_FOLDER ? 4 : 0;
    // A word for the last pages wins: an investors' dividend policy or a press release isn't customer help.
    if (isLast(url)) return depth + 3 + crowded;
    if (isHelpHost(url) || words.some((w) => FIRST_WORDS.has(w))) return depth - 2;
    return depth - (words.some((w) => USEFUL_WORDS.has(w)) ? 1 : 0) + crowded;
  };

  /** The next page to read: what a support assistant needs first, then the shallowest, a few per folder at a time. */
  const next = () => {
    let best: [string, { url: string; depth: number }] | undefined;
    let bestScore = Infinity;
    for (const entry of queued) {
      const url = new URL(entry[1].url);
      // Past their share, pages a customer rarely needs aren't read at all.
      if (lastTaken >= LAST_PAGES && isLast(url)) {
        queued.delete(entry[0]);
        continue;
      }
      const score = priority(url, entry[1].depth);
      if (score < bestScore) {
        best = entry;
        bestScore = score;
      }
    }
    if (best) {
      queued.delete(best[0]);
      // Counted when chosen, so pages read side by side can't overshoot the share.
      if (isLast(new URL(best[1].url))) lastTaken++;
    }
    return best?.[1];
  };

  const take = async (url: string, html: string, depth: number) => {
    const { title, text } = pageContent(html);
    if (depth < maxDepth) for (const link of htmlLinks(html, url)) enqueue(link, depth + 1);
    if (depth > 0 && NOT_FOUND.test(title) && text.length < 3000) return;
    if (text.length < MIN_PAGE_CHARS) {
      if (depth === 0) startProblem = needsJavaScript(html, text) ? "needs_javascript" : "no_text";
      return;
    }
    const fingerprint = createHash("sha1").update(text).digest("hex");
    if (contents.has(fingerprint) || pages.length >= maxPages) return;
    contents.add(fingerprint);
    const folder = folderOf(new URL(url));
    takenIn.set(folder, (takenIn.get(folder) ?? 0) + 1);
    const page = { url, title: title || new URL(url).pathname, text };
    pages.push(page);
    await options.onPage?.(page, pages.length);
  };

  done.add(pageKey(home));
  if (/html/.test(first.page.type)) {
    const plain = htmlToText(first.page.text).text;
    if (render && needsJavaScript(first.page.text, plain)) {
      // An app shell: open it in the browser and read the finished page instead.
      const rendered = await render(first.page.url);
      if (rendered && htmlToText(rendered.html).text.length >= MIN_PAGE_CHARS) {
        rendering = true;
        maxPages = Math.min(maxPages, RENDER_MAX_PAGES);
        await take(rendered.url, rendered.html, 0);
      } else await take(first.page.url, first.page.text, 0);
    } else await take(first.page.url, first.page.text, 0);
  } else startProblem = "no_text";

  const sitemapCandidates = [...robots.sitemaps, `${home.origin}/sitemap.xml`, `${home.origin}/sitemap_index.xml`];
  for (const url of await sitemapUrls(sitemapCandidates, sameSite)) enqueue(url, 1);

  while (pages.length < maxPages && queued.size) {
    const batch: { url: string; depth: number }[] = [];
    while (batch.length < (rendering ? RENDER_PARALLEL : PARALLEL) && queued.size) {
      const item = next();
      if (item) batch.push(item);
    }
    const results = await Promise.all(
      batch.map(async (item) => {
        const url = new URL(item.url);
        const allowed = robotsAllow(url, await robotsFor(url.origin));
        if (!allowed) return { item, result: undefined };
        if (rendering && render) {
          const rendered = await render(item.url);
          return { item, result: rendered ? ({ ok: true, page: { url: rendered.url, status: 200, type: "text/html", text: rendered.html, bytes: new Uint8Array() } } as const) : undefined };
        }
        return { item, result: await fetchPage(item.url, { maxBytes: PAGE_BYTES }) };
      }),
    );
    for (const { item, result } of results) {
      done.add(pageKey(new URL(item.url)));
      if (!result?.ok || !/html/.test(result.page.type)) continue;
      const landed = new URL(result.page.url);
      if (!sameSite(landed)) continue;
      done.add(pageKey(landed));
      await take(result.page.url, result.page.text, item.depth);
    }
  }

  return { pages, finalUrl: home.toString(), ...(pages.length ? {} : { problem: startProblem ?? "no_text" }) };
}

/** What a builder sees when a website gave nothing to read. */
export const CRAWL_PROBLEM_TEXT: Record<CrawlProblem, string> = {
  unreachable: "That website couldn't be reached. Check the address opens in your browser.",
  blocked: "That website refused Keel's reader: it turns away automated visitors. If it's your website, allow Keel's reader (KeelBot) in its firewall or bot settings and try again; or upload your pages as files or paste the text.",
  busy: "That website is turning visitors away for the moment (too many at once), so Keel couldn't read it. Try again in a few minutes.",
  not_found: "That page doesn't exist. Check the address.",
  server_error: "The website had an error while Keel was reading it. Try again in a few minutes.",
  too_many_redirects: "That website keeps redirecting, so it couldn't be read.",
  not_allowed: "Keel doesn't read private or local network addresses.",
  robots: "That website's robots.txt asks automated readers not to read it, so Keel didn't. Upload your pages as files or paste the text instead.",
  needs_javascript: "That website builds its pages with JavaScript, and even after opening it in a browser there was almost no text to read. Upload your pages as files or paste the text instead.",
  no_text: "No readable text was found at that address. Upload your pages as files or paste the text instead.",
};
