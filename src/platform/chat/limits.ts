// How often visitors can message an agent: enough for any real conversation, too little to run up a business's
// bill. Counted per visitor (their address behind a trusted proxy, otherwise their browser's id) and for the agent
// as a whole, in memory (one server). A visitor over the limit is told when to try again.

const WINDOW_MS = 5 * 60_000;
const MAX_MESSAGES = 20;
/** All visitors of one agent together, so a flood from many browsers is capped too. */
const MAX_AGENT_MESSAGES = 300;

const hits: Map<string, number[]> = ((globalThis as unknown as { __keelHits?: Map<string, number[]> }).__keelHits ??= new Map<string, number[]>());

/** Records a message, or says how many seconds to wait when the visitor is over the limit. */
export function allowMessage(
  agentId: string,
  visitor: string,
  limit: { messages: number; seconds: number } = { messages: MAX_MESSAGES, seconds: WINDOW_MS / 1000 },
  now = Date.now(),
): { ok: true } | { ok: false; retryAfter: number } {
  const window = limit.seconds * 1000;
  const keys: [string, number, number][] = [
    [`${agentId}|${visitor}`, limit.messages, window],
    [agentId, MAX_AGENT_MESSAGES, WINDOW_MS],
  ];
  const windows = keys.map(([key, max, span]) => ({ key, max, span, recent: (hits.get(key) ?? []).filter((t) => now - t < span) }));
  const full = windows.find((w) => w.recent.length >= w.max);
  if (full) return { ok: false, retryAfter: Math.ceil((full.recent[0] + full.span - now) / 1000) };
  for (const w of windows) hits.set(w.key, [...w.recent, now]);
  if (hits.size > 50_000) for (const [k, times] of hits) if (!times.some((t) => now - t < 86_400_000)) hits.delete(k);
  return { ok: true };
}

/** Whether a page on `host` may show the agent's chat: any, when no domains are listed; else a listed domain or its subdomains ("*.example.com"). */
export function domainAllowed(allowed: string[], host: string | undefined): boolean {
  if (!allowed.length) return true;
  if (!host) return false;
  const h = host.toLowerCase().replace(/^www\./, "");
  return allowed.some((d) => {
    const domain = d.toLowerCase().replace(/^www\./, "");
    return domain.startsWith("*.") ? h === domain.slice(2) || h.endsWith(domain.slice(1)) : h === domain;
  });
}
