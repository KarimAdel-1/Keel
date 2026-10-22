// Reading a business's brand from its website: its home page and stylesheets for its name and colours, and its logo,
// downloaded and kept as an inline image so the chat never loads anything from the business's server. Fetches go
// through the public-address guard, like the crawl.

import { nameFromHost, type Brand } from "@/core/agents";
import { brandFromHtml, paletteFromCss } from "@/core/brand-extract";
import { fetchPage } from "@/lib/web";

/** The largest logo kept. */
const MAX_LOGO_BYTES = 300 * 1024;
const MAX_CSS_BYTES = 800 * 1024;
const IMAGE_TYPES = /^image\/(png|jpeg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon)/;

/** Slow sites (and busy ones: the brand is read while the pages are) get the time a page read gets. */
async function get(url: string, accept: string, maxBytes: number, timeoutMs = 15_000) {
  const result = await fetchPage(url, { accept, timeoutMs, maxBytes });
  return result.ok ? result.page : undefined;
}

/** The first logo candidate that is really an image of a sensible size, as a data: URL. */
async function downloadLogo(candidates: string[]): Promise<string | undefined> {
  for (const url of candidates.slice(0, 6)) {
    const res = await get(url, "image/*", MAX_LOGO_BYTES + 1);
    const type = (res?.type ?? "").split(";")[0].trim().toLowerCase() || (url.endsWith(".svg") ? "image/svg+xml" : url.endsWith(".ico") ? "image/x-icon" : "");
    if (!res || !IMAGE_TYPES.test(type)) continue;
    const bytes = res.bytes;
    if (bytes.length < 100 || bytes.length > MAX_LOGO_BYTES) continue;
    return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
  }
  return undefined;
}

/** The business's name in a page title like "Shipping | Harbor Goods": the part that matches the domain, else the last. */
export function nameFromTitle(title: string, url: string): string | undefined {
  const parts = title.split(/\s[|–—·:-]\s/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return undefined;
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  let domain = "";
  try {
    domain = squash(new URL(url).hostname.replace(/^www\./, "").split(".")[0]);
  } catch {}
  // A title that doesn't name the business ("The Ultimate AI Cloud") isn't its name: the domain is.
  return parts.find((p) => domain && (domain.includes(squash(p)) || squash(p).includes(domain))) ?? (domain ? nameFromHost(url) : parts.at(-1));
}

/** The brand of the site at `url`: whatever of it can be found. Never throws. */
export async function readBrand(url: string): Promise<Brand> {
  // Read alongside the site's pages, the home page can be refused for a moment by a busy site: it's asked once more.
  const page = (await get(url, "text/html", 2_000_000, 20_000)) ?? (await new Promise((r) => setTimeout(r, 2000)).then(() => get(url, "text/html", 2_000_000, 20_000)));
  if (!page) return { colors: [], website: url };
  const html = page.text.slice(0, 1_000_000);
  const signals = brandFromHtml(html, page.url);
  const sheets = await Promise.all(
    signals.stylesheets.map(async (sheet) => {
      const res = await get(sheet, "text/css,*/*;q=0.1", MAX_CSS_BYTES);
      return res ? res.text.slice(0, MAX_CSS_BYTES) : "";
    }),
  );
  const colors = paletteFromCss(`${signals.inlineCss}\n${sheets.join("\n")}`, signals.themeColor);
  const logo = await downloadLogo(signals.logos);
  const siteName = signals.siteName ?? nameFromTitle(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "", page.url);
  return { ...(siteName ? { siteName } : {}), colors, ...(logo ? { logo } : {}), website: page.url };
}
