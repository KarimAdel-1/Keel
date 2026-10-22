// Reading pages that are built by JavaScript in the browser, for the website reader: a headless Chromium opens the
// page and its scripts run, then the finished page is read like any other. The browser never touches the network
// itself. Every request the page makes is fetched by Keel through the public-address guard and handed to the
// browser, so a page can't reach a private network. Only GET requests go out; uploads, beacons and websockets are
// refused (the browser's own connections go to a proxy that doesn't exist). Pictures, video and fonts aren't fetched.
// One browser is shared and closed after a quiet minute.

import type { Browser, Route } from "playwright-core";
import { publicFetch } from "./net";
import { READER_AGENT } from "./web";

const IDLE_MS = 60_000;
const PAGE_TIMEOUT_MS = 25_000;
const MAX_REQUESTS = 120;
const MAX_RESPONSE_BYTES = 5_000_000;
const SKIPPED_TYPES = new Set(["image", "media", "font", "websocket", "eventsource", "manifest", "texttrack", "ping"]);

const state = ((globalThis as unknown as { __keelRender?: { browser?: Promise<Browser>; idle?: NodeJS.Timeout; open: number } }).__keelRender ??= { open: 0 });

async function browser(): Promise<Browser> {
  if (!state.browser) {
    state.browser = import("playwright-core").then(({ chromium }) =>
      chromium.launch({
        headless: true,
        // Anything the page tries outside Keel's own fetching goes nowhere.
        args: ["--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=<-loopback>", "--disable-background-networking", "--disable-sync", "--no-first-run"],
      }),
    );
    state.browser.catch(() => (state.browser = undefined));
  }
  return state.browser;
}

function scheduleClose(): void {
  clearTimeout(state.idle);
  state.idle = setTimeout(() => {
    if (state.open > 0 || !state.browser) return;
    const closing = state.browser;
    state.browser = undefined;
    void closing.then((b) => b.close()).catch(() => {});
  }, IDLE_MS);
  state.idle.unref?.();
}

/** Closes the shared browser now (when the server stops, and after tests). */
export async function closeBrowser(): Promise<void> {
  clearTimeout(state.idle);
  const closing = state.browser;
  state.browser = undefined;
  await closing?.then((b) => b.close()).catch(() => {});
}

async function readBody(res: Response): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return Buffer.concat(chunks);
}

/** The page at `url` after its scripts have run, as HTML; undefined when it couldn't be rendered. */
export async function renderPage(url: string): Promise<{ url: string; html: string } | undefined> {
  let context: Awaited<ReturnType<Browser["newContext"]>> | undefined;
  state.open++;
  try {
    const b = await browser();
    context = await b.newContext({ userAgent: READER_AGENT, javaScriptEnabled: true, serviceWorkers: "block", acceptDownloads: false, locale: "en-GB" });
    let requests = 0;
    await context.route("**/*", async (route: Route) => {
      const request = route.request();
      if (request.method() !== "GET" || SKIPPED_TYPES.has(request.resourceType()) || ++requests > MAX_REQUESTS) return route.abort();
      if (!/^https?:/.test(request.url())) return route.abort();
      try {
        const res = await publicFetch(request.url(), { headers: { "User-Agent": READER_AGENT, Accept: request.headers().accept ?? "*/*" }, signal: AbortSignal.timeout(15_000) });
        const headers: Record<string, string> = {};
        res.headers.forEach((value, key) => {
          if (!/^(content-encoding|content-length|transfer-encoding|connection|set-cookie)$/i.test(key)) headers[key] = value;
        });
        await route.fulfill({ status: res.status, headers, body: await readBody(res) });
      } catch {
        await route.abort().catch(() => {});
      }
    });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    return { url: page.url(), html: await page.content() };
  } catch {
    return undefined;
  } finally {
    state.open--;
    await context?.close().catch(() => {});
    scheduleClose();
  }
}
