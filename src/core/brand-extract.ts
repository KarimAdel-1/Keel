// A business's brand, read from its website's HTML and CSS: its name, the candidates for its logo (best first) and
// its colour palette. Pure: fetching is done by the caller (src/platform/knowledge/brand.ts).

import { decodeEntities } from "./html";

export interface BrandSignals {
  siteName?: string;
  /** The browser theme colour the site declares, if any. */
  themeColor?: string;
  /** Possible pictures for the agent, best first: square icons, then logos, then favicons; logos for dark backgrounds last. */
  logos: string[];
  /** Same-site stylesheets to read for colours. */
  stylesheets: string[];
  /** The CSS written in the page itself. */
  inlineCss: string;
}

const attr = (tag: string, name: string) => decodeEntities(tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))?.slice(2).find((v) => v !== undefined) ?? "").trim();

function absolute(href: string, base: string): string | undefined {
  if (!href || href.startsWith("data:") || href.startsWith("javascript:")) return undefined;
  try {
    const url = new URL(href, base);
    return /^https?:$/.test(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function brandFromHtml(html: string, base: string): BrandSignals {
  const head = html.slice(0, 400_000);
  const metas = head.match(/<meta\b[^>]*>/gi) ?? [];
  const links = head.match(/<link\b[^>]*>/gi) ?? [];
  const meta = (key: string) => metas.find((m) => new RegExp(`(property|name)\\s*=\\s*["']?${key}["']?`, "i").test(m));

  const siteName = attr(meta("og:site_name") ?? "", "content") || attr(meta("application-name") ?? "", "content") || undefined;
  const themeColor = parseColor(attr(meta("theme-color") ?? "", "content")) ?? parseColor(attr(meta("msapplication-TileColor") ?? "", "content"));

  const rel = (tag: string) => attr(tag, "rel").toLowerCase();
  const sized = (tag: string) => Number(attr(tag, "sizes").split(/[x\s]/i)[0]) || 0;
  const touch = links.filter((l) => rel(l).includes("apple-touch-icon")).sort((a, b) => sized(b) - sized(a));
  const icons = links.filter((l) => /(^|\s)icon(\s|$)/.test(rel(l)) || rel(l) === "shortcut icon").sort((a, b) => (attr(b, "type").includes("svg") ? 1 : 0) - (attr(a, "type").includes("svg") ? 1 : 0) || sized(b) - sized(a));
  const images = (head.match(/<img\b[^>]*>/gi) ?? []).filter((img) => /logo/i.test(`${attr(img, "class")} ${attr(img, "id")} ${attr(img, "alt")} ${attr(img, "src")}`));
  const declared = [attr(meta("og:logo") ?? "", "content")];

  // The agent's picture is a small circle: square icons made for exactly that (touch icons, large favicons) come
  // first, then logos. A logo drawn for dark backgrounds (white, inverted…) vanishes on the chat's light one: last.
  const forDarkBackgrounds = (src: string) => /(invert|white|light|negative|reverse|knockout|on-?dark|dark-?bg)/i.test(src.split("/").pop() ?? "");
  const large = (l: string) => sized(l) >= 96 || attr(l, "type").includes("svg");
  const named = images.map((i) => attr(i, "src"));
  const logos = [
    ...touch.map((l) => attr(l, "href")),
    ...icons.filter(large).map((l) => attr(l, "href")),
    ...declared,
    ...named.filter((src) => !forDarkBackgrounds(src)),
    ...icons.filter((l) => !large(l)).map((l) => attr(l, "href")),
    "/favicon.ico",
    ...named.filter(forDarkBackgrounds),
  ]
    .map((h) => absolute(h, base))
    .filter((u): u is string => Boolean(u));

  const origin = new URL(base).origin;
  const stylesheets = links
    .filter((l) => rel(l).includes("stylesheet"))
    .map((l) => absolute(attr(l, "href"), base))
    .filter((u): u is string => Boolean(u) && new URL(u!).origin === origin)
    .slice(0, 4);
  const inlineCss = [...head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n") + [...head.matchAll(/\bstyle\s*=\s*"([^"]*)"/gi)].map((m) => m[1]).join(";");

  return { ...(siteName ? { siteName } : {}), ...(themeColor ? { themeColor } : {}), logos: [...new Set(logos)], stylesheets, inlineCss };
}

// ── Colours ─────────────────────────────────────────────────────────────────────────────────────────────────────

const hex2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/** A CSS colour (#rgb, #rrggbb, rgb(), rgba()) as #rrggbb; undefined for anything else or anything see-through. */
export function parseColor(value: string): string | undefined {
  const v = value.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3})$/);
  if (m) return `#${[...m[1]].map((c) => c + c).join("")}`;
  m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/);
  if (m) return m[2] && parseInt(m[2], 16) < 200 ? undefined : `#${m[1]}`;
  m = v.match(/^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const alpha = m[4] ? (m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])) : 1;
    return alpha < 0.8 ? undefined : `#${hex2(Number(m[1]))}${hex2(Number(m[2]))}${hex2(Number(m[3]))}`;
  }
  return undefined;
}

function hsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/** Whether a colour could be a brand colour rather than a background, a text grey or near-white. */
const brandish = (hex: string) => {
  const { s, l } = hsl(hex);
  return s >= 0.25 && l >= 0.15 && l <= 0.8;
};

/** Two colours a viewer would call the same. */
const near = (a: string, b: string) => {
  const x = hsl(a);
  const y = hsl(b);
  const dh = Math.min(Math.abs(x.h - y.h), 360 - Math.abs(x.h - y.h));
  return dh < 14 && Math.abs(x.l - y.l) < 0.12 && Math.abs(x.s - y.s) < 0.25;
};

const COLOR_TOKEN = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgba?\([^)]{5,40}\)/g;

/**
 * The site's palette: the colours its CSS uses most that look like brand colours, the declared theme colour first
 * and colours named "primary", "brand" or "accent" weighted up. Up to `limit`, no two alike.
 */
export function paletteFromCss(css: string, themeColor?: string, limit = 5): string[] {
  const counts = new Map<string, number>();
  const add = (hex: string | undefined, weight: number) => hex && brandish(hex) && counts.set(hex, (counts.get(hex) ?? 0) + weight);
  for (const decl of css.slice(0, 2_000_000).split(/[;{}]/)) {
    const named = /(primary|brand|accent|theme|main)/i.test(decl.split(":")[0] ?? "");
    for (const token of decl.match(COLOR_TOKEN) ?? []) add(parseColor(token), named ? 6 : 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
  const palette: string[] = [];
  for (const hex of [...(themeColor && brandish(themeColor) ? [themeColor] : []), ...ranked]) {
    if (!palette.some((p) => near(p, hex))) palette.push(hex);
    if (palette.length >= limit) break;
  }
  return palette;
}
