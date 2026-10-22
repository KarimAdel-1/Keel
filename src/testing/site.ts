// Websites for tests, served for real on this machine: Keel reads them through its own network code (the guarded
// fetch, redirects, robots.txt, the headless browser), exactly as it reads a business's site. The server answers on
// 127.0.0.1; asked as "localhost" it can redirect to 127.0.0.1, a second host name for cross-site redirects.

import http from "node:http";
import type { AddressInfo } from "node:net";

export interface Page {
  status?: number;
  body?: string | Uint8Array;
  type?: string;
  /** Redirect to this path or address. */
  location?: string;
}

export interface Site {
  /** The site's address, http://127.0.0.1:<port>. */
  url: string;
  /** The same server as http://localhost:<port>. */
  other: string;
  /** Paths asked for, in order. */
  asked: string[];
  close: () => Promise<void>;
}

/** Serves `pages` by path (with the query); unknown paths are 404. With `fromLocalhost`, every request made to "localhost" is redirected to 127.0.0.1. */
export async function serveSite(pages: Record<string, Page>, options: { fromLocalhost?: boolean } = {}): Promise<Site> {
  // Keel only fetches public addresses unless this development setting is on.
  process.env.ALLOW_PRIVATE_NETWORK = "1";
  const asked: string[] = [];
  let port = 0;
  const handler: http.RequestListener = (req, res) => {
    const path = req.url ?? "/";
    asked.push(path);
    if (options.fromLocalhost && req.headers.host?.startsWith("localhost")) {
      res.writeHead(301, { location: `http://127.0.0.1:${port}${path}` }).end();
      return;
    }
    const page = pages[path];
    if (!page) {
      res.writeHead(404, { "content-type": "text/plain" }).end("not found");
      return;
    }
    if (page.location) {
      res.writeHead(page.status ?? 301, { location: page.location }).end();
      return;
    }
    res.writeHead(page.status ?? 200, { "content-type": page.type ?? "text/html; charset=utf-8" }).end(page.body ?? "");
  };
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
  // "localhost" may resolve to ::1 first: the same handler answers there too, when this machine has IPv6.
  const v6 = http.createServer(handler);
  await new Promise<void>((resolve) => {
    v6.once("error", () => resolve());
    v6.listen(port, "::1", resolve);
  });
  return {
    url: `http://127.0.0.1:${port}`,
    other: `http://localhost:${port}`,
    asked,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      if (v6.listening) await new Promise<void>((resolve) => v6.close(() => resolve()));
    },
  };
}
