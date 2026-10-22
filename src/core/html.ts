// A web page as readable text, without a browser or a library: what a knowledge source needs from a website. The
// page's main content (its <main> or <article>, else the body without navigation, header, footer and forms) keeps
// its headings as Markdown "#" lines, its lists as "- " lines and its tables as rows, so the source splitter can keep
// sections together. Also the links on a page, for crawling.

const DROP_WITH_CONTENT = /<(script|style|noscript|svg|template|iframe|canvas|select|button)\b[\s\S]*?<\/\1\s*>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;
/** A script or style that never closes (once the closed ones are gone), and everything after it. */
const UNCLOSED = /<(script|style|noscript|template|svg)\b[\s\S]*$/i;
const CHROME = /<(nav|header|footer|aside|form)\b[\s\S]*?<\/\1\s*>/gi;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™", euro: "€", pound: "£" };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Elements with no content of their own. */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
/** A display condition that can never be true: v-if='false', x-show="false == true". */
const NEVER = /^\s*(false|0|null|undefined|!true|false\s*===?\s*true|true\s*===?\s*false)\s*$/i;

/** Whether a tag's attributes keep it from ever being shown: hidden, display:none, aria-hidden, a condition that's always false. */
function neverShown(attributes: string): boolean {
  for (const [, name, raw] of attributes.matchAll(/([^\s"'=<>\/]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>]+))?/g)) {
    const key = name.toLowerCase();
    const value = (raw ?? "").replace(/^["']|["']$/g, "");
    if (key === "hidden") return true;
    if (key === "aria-hidden" && value.trim().toLowerCase() === "true") return true;
    if (key === "style" && /display\s*:\s*none|visibility\s*:\s*hidden/i.test(value)) return true;
    if (/^(v-if|v-show|x-if|x-show|\*ngif)$/.test(key) && NEVER.test(value)) return true;
  }
  return false;
}

/** Where the element opened just before `from` ends: after its matching closing tag; nowhere, -1. */
function closingOf(html: string, name: string, from: number): number {
  const tags = new RegExp(`<(\\/?)${name}(?=[\\s/>])[^>]*>`, "gi");
  tags.lastIndex = from;
  let depth = 1;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

/**
 * The page with each tag's attributes taken out (<div class='a > b'> becomes <div>), so simple patterns can read it,
 * and without what a visitor never sees (hidden elements, conditions that are always false): text a page keeps hidden
 * would otherwise read as fact. Attributes are read whole, quoted values included, however long: modern sites put ">"
 * and whole JSON documents inside them. A quote counts only where a value starts (after "="), and one that never
 * closes falls back to the first ">", so a broken attribute can't swallow the page. One pass over the page.
 */
export function bareTags(html: string): string {
  let out = "";
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    const name = /^<(\/?)([a-zA-Z][\w:-]*)/.exec(html.slice(lt, lt + 80));
    if (!name) {
      // A declaration (<!doctype …>, <?xml …?>) goes; any other "<" is text.
      if (html[lt + 1] === "!" || html[lt + 1] === "?") {
        const close = html.indexOf(">", lt);
        i = close < 0 ? html.length : close + 1;
      } else {
        out += "<";
        i = lt + 1;
      }
      continue;
    }
    let j = lt + name[0].length;
    let quote = "";
    let last = "";
    for (; j < html.length; j++) {
      const c = html[j];
      if (quote) {
        if (c === quote) quote = "";
      } else if ((c === '"' || c === "'") && last === "=") quote = c;
      else if (c === ">") break;
      if (!quote && !/\s/.test(c)) last = c;
    }
    if (j >= html.length) {
      const close = html.indexOf(">", lt);
      j = close < 0 ? html.length : close;
    }
    const tag = name[2].toLowerCase();
    if (!name[1] && neverShown(html.slice(lt + name[0].length, j))) {
      // Never shown: the element goes with everything in it.
      const end = VOID.has(tag) ? -1 : closingOf(html, tag, j + 1);
      i = end < 0 ? j + 1 : end;
      continue;
    }
    out += `<${name[1]}${tag}>`;
    i = j + 1;
  }
  return out;
}

// ── Labels and their values ───────────────────────────────────────────────────────────────────────────────────

type El = { tag: string; kids: (El | string)[] };

/** The page (with bare tags) as a tree of elements; tags left open are closed where their parent closes. */
function treeOf(bare: string): El {
  const root: El = { tag: "", kids: [] };
  const stack: El[] = [root];
  for (const [, slash, name, text] of bare.matchAll(/<(\/?)([a-z][\w:-]*)>|([^<]+|<)/g)) {
    const top = stack[stack.length - 1];
    if (text !== undefined) top.kids.push(text);
    else if (!slash) {
      const el: El = { tag: name, kids: [] };
      top.kids.push(el);
      if (!VOID.has(name)) stack.push(el);
    } else {
      // A closing tag closes its element and any left open inside it; one with no element open is ignored.
      const at = stack.map((e) => e.tag).lastIndexOf(name);
      if (at > 0) stack.length = at;
    }
  }
  return root;
}

const textOf = (el: El | string): string => (typeof el === "string" ? el : el.kids.map(textOf).join(""));
const hasText = (el: El | string) => textOf(el).trim().length > 0;
/** How many separate pieces of text an element holds: elements with text of their own. */
const pieces = (el: El): number => (el.kids.some((k) => typeof k === "string" && k.trim()) ? 1 : 0) + el.kids.reduce((n, k) => n + (typeof k === "string" ? 0 : pieces(k)), 0);
const HEADING = /^h[1-6]$/;
const LISTS = new Set(["ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "select", "option"]);
/** A heading marks a section, even inside wrapper boxes: it's never joined to what follows. */
const holdsHeading = (el: El): boolean => HEADING.test(el.tag) || el.kids.some((k) => typeof k !== "string" && holdsHeading(k));
/** Text that reads as a field's label: short, no sentence. */
const labelLike = (text: string) => text.length <= 40 && text.split(/\s+/).length <= 6 && !/[.!?:;,]$/.test(text) && /^[A-Za-z]/.test(text);

const serialize = (el: El | string): string =>
  typeof el === "string" ? el : el.tag ? (VOID.has(el.tag) ? `<${el.tag}>` : `<${el.tag}>${el.kids.map(serialize).join("")}</${el.tag}>`) : el.kids.map(serialize).join("");

/** A box holding just a label and its value, each in its own element, becomes one line: "Loading Clearance: 4.3m". */
function pairUp(el: El): void {
  for (const k of el.kids) if (typeof k !== "string") pairUp(k);
  if (el.tag === "dl") {
    // A definition list: each term with the descriptions that follow it.
    const lines: El[] = [];
    for (const k of el.kids) {
      if (typeof k === "string" || !hasText(k)) continue;
      const said = textOf(k).replace(/\s+/g, " ").trim();
      const last = lines[lines.length - 1];
      if (k.tag === "dd" && last && !String(last.kids[0]).includes(": ")) last.kids = [`${last.kids[0]}: ${said}`];
      else if (k.tag === "dd" && last) last.kids = [`${last.kids[0]}; ${said}`];
      else lines.push({ tag: "p", kids: [said] });
    }
    el.kids = lines;
    return;
  }
  // Lists and table rows keep their own shape ("- item", "cell | cell").
  if (LISTS.has(el.tag)) return;
  const parts = el.kids.filter(hasText);
  if (parts.length !== 2 || parts.some((p) => typeof p === "string" || LISTS.has(p.tag))) return;
  const [label, value] = parts as El[];
  if (holdsHeading(label) || holdsHeading(value) || pieces(label) !== 1 || pieces(value) !== 1) return;
  const name = textOf(label).replace(/\s+/g, " ").trim();
  const said = textOf(value).replace(/\s+/g, " ").trim();
  if (!labelLike(name) || said.length > 300) return;
  el.kids = [{ tag: "p", kids: [`${name}: ${said}`] }];
}

/**
 * Pages built from blocks often show a field as two boxes side by side, a label and its value, with nothing in the
 * markup tying them together: read as separate lines, values slip to the wrong label. Each such pair is kept as one
 * line. Only a box with exactly two pieces of text, the first short like a label, is joined.
 */
export function pairLabelValues(bare: string): string {
  const root = treeOf(bare);
  pairUp(root);
  return serialize(root);
}

/** An email address the page encodes against harvesters (data-cfemail): a key byte, then each byte xor the key. */
function decodeEmail(hex: string): string {
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i + 1 < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out) ? out : "";
}

/**
 * Email addresses a page hides from harvesters behind a script that shows them to every visitor: written out, as a
 * visitor sees them, so the agent can give a customer the address instead of "[email protected]".
 */
export function revealEmails(html: string): string {
  return html
    .replace(/<([a-z]+)\b[^>]*\bdata-cfemail\s*=\s*["']([0-9a-fA-F]+)["'][^>]*>[\s\S]*?<\/\1\s*>/gi, (whole, _tag: string, hex: string) => decodeEmail(hex) || whole)
    .replace(/(<a\b[^>]*\bhref\s*=\s*["'][^"']*\/cdn-cgi\/l\/email-protection#([0-9a-fA-F]+)["'][^>]*>)([\s\S]*?)(<\/a\s*>)/gi, (whole, open: string, hex: string, inner: string, close: string) => {
      const email = decodeEmail(hex);
      return email && /email.{0,3}protected/i.test(inner) ? `${open}${email}${close}` : whole;
    });
}

/** The part of the page that holds its content. */
function mainPart(html: string): string {
  // A page cut off at its size limit can end inside a script: what's left of it is code, not words.
  const cleaned = pairLabelValues(bareTags(revealEmails(html.replace(COMMENTS, "")).replace(DROP_WITH_CONTENT, " ").replace(UNCLOSED, " ")));
  const main = cleaned.match(/<main>([\s\S]*?)<\/main>/)?.[1] ?? cleaned.match(/<article>([\s\S]*?)<\/article>/)?.[1];
  const body = main ?? cleaned.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? cleaned;
  return main ? body : body.replace(CHROME, " ");
}

/** The page's title and its main content as text with Markdown headings and lists. */
export function htmlToText(html: string): { title: string; text: string } {
  const title = decodeEntities((html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? "").replace(/\s+/g, " ").trim());
  const text = mainPart(html)
    .replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_, level: string, inner: string) => `\n\n${"#".repeat(Number(level))} ${inner.replace(/<[^>]*>/g, " ")}\n\n`)
    .replace(/<li>/g, "\n- ")
    .replace(/<\/(td|th)>/g, " | ")
    .replace(/<(br|hr)>/g, "\n")
    .replace(/<\/?(p|div|section|ul|ol|table|tr|thead|tbody|blockquote|pre|dl|dt|dd|figure|figcaption)>/g, "\n\n")
    .replace(/<\/?[a-z][\w:-]*>/g, " ");
  const lines = decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").replace(/\s*\|\s*$/, "").trim())
    .filter((line, i, all) => line !== "-" && !(line === "" && all[i - 1] === ""));
  return { title, text: lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() };
}

/** Every link on the page as an absolute http(s) URL, without its #fragment, in order and without repeats. */
export function htmlLinks(html: string, pageUrl: string): string[] {
  const out = new Set<string>();
  for (const [, href] of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#][^"']*|#[^"']+)["']/gi)) {
    try {
      const url = new URL(decodeEntities(href), pageUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") continue;
      url.hash = "";
      out.add(url.toString());
    } catch {
      // not a URL
    }
  }
  return [...out];
}

const SCRIPT_JSON = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi;
const plain = (v: unknown): string => (typeof v === "string" ? decodeEntities(v.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() : typeof v === "number" ? String(v) : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const typesOf = (item: Record<string, unknown>) => list(item["@type"]).map((t) => String(t).toLowerCase());

function address(v: unknown): string {
  if (typeof v === "string") return plain(v);
  const a = (v ?? {}) as Record<string, unknown>;
  return [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode, plain(a.addressCountry) || plain((a.addressCountry as Record<string, unknown>)?.name)].map(plain).filter(Boolean).join(", ");
}

function hours(item: Record<string, unknown>): string {
  const simple = list(item.openingHours).map(plain).filter(Boolean);
  const specs = list(item.openingHoursSpecification).map((s) => {
    const spec = s as Record<string, unknown>;
    const days = list(spec.dayOfWeek).map((d) => plain(d).replace(/^https?:\/\/schema\.org\//, "")).join(", ");
    return days && spec.opens ? `${days}: ${plain(spec.opens)}–${plain(spec.closes)}` : "";
  });
  return [...simple, ...specs].filter(Boolean).join("; ");
}

function offerText(v: unknown): string {
  return list(v)
    .map((o) => {
      const offer = o as Record<string, unknown>;
      const price = plain(offer.price) || plain(offer.lowPrice);
      const currency = plain(offer.priceCurrency);
      const stock = plain(offer.availability).replace(/^https?:\/\/schema\.org\//, "");
      return [price && `${price}${currency ? ` ${currency}` : ""}`, stock && stock.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()].filter(Boolean).join(", ");
    })
    .filter(Boolean)
    .slice(0, 3)
    .join("; ");
}

/** One structured-data item as lines of plain text, for the types a support assistant can use. */
function itemLines(item: Record<string, unknown>): string[] {
  const types = typesOf(item);
  const name = plain(item.name);
  if (types.includes("faqpage")) {
    return list(item.mainEntity).flatMap((q) => {
      const question = q as Record<string, unknown>;
      const answer = plain((list(question.acceptedAnswer)[0] as Record<string, unknown> | undefined)?.text);
      return plain(question.name) && answer ? [`Q: ${plain(question.name)}`, `A: ${answer}`, ""] : [];
    });
  }
  if (types.some((t) => t === "product" || t === "productgroup")) {
    const offers = offerText(item.offers);
    return [name && `Product: ${name}`, plain(item.description), offers && `Price: ${offers}`, plain(item.sku) && `SKU: ${plain(item.sku)}`].filter(Boolean) as string[];
  }
  if (types.some((t) => /organization|business|store|restaurant|hotel|clinic|dentist|physician|gym|salon|shop|agency|service/.test(t))) {
    return [
      name && `${name}`,
      plain(item.description),
      address(item.address) && `Address: ${address(item.address)}`,
      plain(item.telephone) && `Phone: ${plain(item.telephone)}`,
      plain(item.email) && `Email: ${plain(item.email).replace(/^mailto:/, "")}`,
      hours(item) && `Opening hours: ${hours(item)}`,
      plain(item.priceRange) && `Price range: ${plain(item.priceRange)}`,
    ].filter(Boolean) as string[];
  }
  if (types.includes("event")) return [name && `Event: ${name}`, plain(item.startDate) && `Starts: ${plain(item.startDate)}`, plain(item.description)].filter(Boolean) as string[];
  return [];
}

/**
 * Facts a page keeps outside its visible text: its meta description and its structured data (products with prices,
 * the business's address, phone and opening hours, FAQs). Many shops and builder-made sites keep their prices and
 * hours only there.
 */
export function pageFacts(html: string): string {
  const head = html.slice(0, 600_000);
  const description = plain(head.match(/<meta\b[^>]*(?:name|property)\s*=\s*["'](?:description|og:description)["'][^>]*>/i)?.[0].match(/content\s*=\s*["']([^"']*)["']/i)?.[1]);
  const lines: string[] = [];
  for (const [, raw] of head.matchAll(SCRIPT_JSON)) {
    let data: unknown;
    try {
      data = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    const items = list(data).flatMap((d) => [d, ...list((d as Record<string, unknown>)?.["@graph"])]);
    for (const item of items) if (item && typeof item === "object") lines.push(...itemLines(item as Record<string, unknown>));
  }
  const unique = [...new Set(lines.map((l) => l.trim()))].filter((l, i, all) => l || all[i - 1]);
  return [description, unique.join("\n").trim()].filter(Boolean).join("\n\n").slice(0, 20_000);
}

/** A page whose content is drawn by JavaScript in the browser: an empty app shell with script bundles. */
export function needsJavaScript(html: string, text: string): boolean {
  if (text.length >= 200) return false;
  const shell = /<div[^>]+id\s*=\s*["'](root|app|__next|__nuxt|svelte|main-app)["'][^>]*>\s*<\/div>/i.test(html) || /\bng-version=|data-reactroot|window\.__NUXT__|<noscript>[^<]*(enable|turn on) javascript/i.test(html);
  const scripts = (html.match(/<script\b[^>]*\bsrc=/gi) ?? []).length;
  return shell || scripts >= 3;
}
