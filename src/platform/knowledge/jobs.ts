// Training and website reading run in the background, so adding knowledge never blocks the page: each source shows
// its own status (waiting, learning, ready) and the page refreshes it. A few trainings run at once; reading a website
// adds each page as a source the moment it's read, so the first pages are searchable while the rest are still coming.
// Reading a website also reads its brand (name, colours, logo) and gives the chat that look, unless the builder has
// already chosen one.

import { randomBytes } from "node:crypto";
import { AGENT_COLORS, type AgentAppearance, type Brand } from "@/core/agents";
import { currentTenant, withTenant } from "@/lib/tenant";
import { addSource, findSourceByUrl, getAgent, getSource, setSourceStatus, updateAgent, updateSourceContent } from "../store";
import { meteredForAgent } from "../usage";
import { readBrand } from "./brand";
import { CRAWL_PROBLEM_TEXT, crawlSite } from "./crawl";
import { trainSource } from "./train";

/** Trainings running at the same time, across all agents. */
const TRAINING_AT_ONCE = 2;
/** Pages read from one website, unless the builder asks for another number. */
export const MAX_SITE_PAGES = 50;
/** How long a finished website read stays listed. */
const KEEP_FINISHED_MS = 10 * 60_000;
/** How long pages found for the builder to choose from wait for them. */
const KEEP_FOUND_MS = 60 * 60_000;
/** Pages found when the builder chooses which to learn: more than are learned at once, so there's a real choice. */
export const FIND_PAGES = 150;

/** A page found on a website, for the builder to keep or leave out. */
export interface FoundPage {
  url: string;
  title: string;
  /** The part of the site it's in, as the builder would call it ("Help", "Products"). */
  section: string;
  chars: number;
  /** Ticked when it's found: Keel's own choice, the pages customers ask about first. */
  picked: boolean;
}

export interface SiteRead {
  id: string;
  agentId: string;
  url: string;
  /** "found": the pages are found and wait for the builder to choose (a read started with `choose`). */
  status: "reading" | "found" | "done" | "failed";
  pages: number;
  /** Finding pages for the builder to choose from, rather than learning them as they're read. */
  choosing?: boolean;
  /** The pages found, when the builder chooses which to learn. */
  found?: FoundPage[];
  /** What was found of the site's brand, once read (the logo itself is kept with the agent). */
  brand?: { siteName?: string; colors: string[]; logo: boolean };
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

interface JobState {
  /** Sources waiting to be learned, each with its business: the queue is shared, and a job runs for its own. */
  queue: { sourceId: string; workspaceId?: string }[];
  running: number;
  reads: Map<string, SiteRead>;
  /** The text of pages found for the builder to choose from, by read: kept here, never sent to the page. */
  foundText: Map<string, Map<string, { title: string; text: string }>>;
  work: Set<Promise<unknown>>;
}

const fresh: JobState = { queue: [], running: 0, reads: new Map(), foundText: new Map(), work: new Set() };
const state = ((globalThis as unknown as { __keelJobs?: JobState }).__keelJobs ??= fresh);

function track<T>(promise: Promise<T>): Promise<T> {
  state.work.add(promise);
  void promise.finally(() => state.work.delete(promise)).catch(() => {});
  return promise;
}

/** Runs work in the background (test runs, analysis), counted by `settled()`. */
export const inBackground = <T>(work: Promise<T>): Promise<T> => track(work);

const plain = (error: unknown) => {
  const message = (error as Error)?.message ?? String(error);
  return /api key|NEBIUS/i.test(message) ? "Keel couldn't reach its models. Ask the person who runs Keel to check its setup." : `Couldn't learn this source: ${message.slice(0, 160)}`;
};

function pump(): void {
  while (state.running < TRAINING_AT_ONCE && state.queue.length) {
    const { sourceId, workspaceId } = state.queue.shift()!;
    state.running++;
    void track(
      withTenant(workspaceId, async () => {
        // Its embeddings are metered for the source's agent, whoever queued it.
        const agentId = (await getSource(sourceId))?.agentId ?? "";
        await meteredForAgent(agentId, "knowledge", () => trainSource(sourceId)).catch((error) => setSourceStatus(sourceId, "failed", plain(error)));
      }).finally(() => {
        state.running--;
        pump();
      }),
    );
  }
}

/** Trains a source in the background, for the current business (or the one given); its status shows how it's going. */
export async function queueTraining(sourceId: string, workspaceId?: string): Promise<void> {
  if (state.queue.some((j) => j.sourceId === sourceId)) return;
  state.queue.push({ sourceId, workspaceId: workspaceId ?? (await currentTenant()) });
  pump();
}

/**
 * The part of a site a page is in, in words: its folder ("/help/returns" → "Help"), its help centre, or "Main pages"
 * for the pages at the top (the home page, /about, /contact).
 */
export function sectionOf(pageUrl: string, home: string): string {
  const u = new URL(pageUrl);
  if (u.hostname !== new URL(home).hostname && /^(help|support|faq|docs|kb)\./.test(u.hostname)) return "Help centre";
  const parts = u.pathname.split("/").filter(Boolean);
  return parts.length > 1 ? title(parts[0]) : "Main pages";
}
const title = (slug: string) => {
  const words = decodeURIComponent(slug).replace(/\.[a-z]+$/i, "").replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Main pages";
};

/** Saves a page read from the website as a source (or updates the one it has), and learns it. */
async function keepPage(agentId: string, page: { url: string; title: string; text: string }): Promise<void> {
  const existing = await findSourceByUrl(agentId, page.url);
  if (existing) {
    if (await updateSourceContent(existing.id, { title: page.title, content: page.text })) await queueTraining(existing.id);
  } else {
    await queueTraining((await addSource(agentId, { kind: "website", title: page.title || page.url, url: page.url, content: page.text })).id);
  }
}

/**
 * Reads a website into an agent's knowledge, page by page, in the background. With `choose`, it only finds the pages
 * (up to FIND_PAGES, most useful first), and the builder picks which to learn (learnChosenPages).
 */
export async function startSiteRead(agentId: string, url: string, options: { maxPages?: number; choose?: boolean } = {}): Promise<SiteRead> {
  const read: SiteRead = { id: `read_${randomBytes(6).toString("hex")}`, agentId, url, status: "reading", pages: 0, startedAt: Date.now(), ...(options.choose ? { choosing: true } : {}) };
  state.reads.set(read.id, read);
  // Pages arrive long after the request that started the read: each is saved for the same business.
  const workspaceId = await currentTenant();
  const texts = new Map<string, { title: string; text: string }>();
  if (options.choose) state.foundText.set(read.id, texts);
  const pages = withTenant(workspaceId, () =>
    crawlSite(url, {
      maxPages: options.choose ? FIND_PAGES : (options.maxPages ?? MAX_SITE_PAGES),
      onPage: async (page) => {
        if (options.choose) texts.set(page.url, { title: page.title, text: page.text });
        else await keepPage(agentId, page);
        read.pages++;
      },
    }),
  );
  const brand = withTenant(workspaceId, () => readBrand(url))
    .then((found) => {
      read.brand = { ...(found.siteName ? { siteName: found.siteName } : {}), colors: found.colors, logo: Boolean(found.logo) };
      return withTenant(workspaceId, () => applyBrand(agentId, found));
    })
    .catch(() => {});
  void track(
    Promise.all([pages, brand])
      .then(([found]) => {
        if (found.finalUrl && found.finalUrl !== read.url) read.url = found.finalUrl;
        if (!found.pages.length) {
          read.status = "failed";
          read.error = CRAWL_PROBLEM_TEXT[found.problem ?? "no_text"];
          state.foundText.delete(read.id);
        } else if (options.choose) {
          // In the order they were read, which is Keel's order of usefulness: the first ones are ticked.
          read.found = found.pages.map((p, i) => ({ url: p.url, title: p.title || p.url, section: sectionOf(p.url, read.url), chars: p.text.length, picked: i < (options.maxPages ?? MAX_SITE_PAGES) }));
          read.status = "found";
        } else read.status = "done";
      })
      .catch(() => {
        read.status = "failed";
        read.error = "That website couldn't be reached. Check the address, or upload the text as a file instead.";
      })
      .finally(() => (read.finishedAt = Date.now())),
  );
  return read;
}

/** Keeps the brand with the agent, and gives its chat the brand's colour and logo where it still has the defaults. */
async function applyBrand(agentId: string, brand: Brand): Promise<void> {
  const agent = await getAgent(agentId);
  if (!agent || (!brand.colors.length && !brand.logo && !brand.siteName)) return;
  const a = agent.config.appearance;
  const appearance: Partial<AgentAppearance> = {};
  if (brand.colors[0] && a.color === AGENT_COLORS[0]) appearance.color = brand.colors[0];
  if (brand.logo && !a.avatar) appearance.avatar = brand.logo;
  await updateAgent(agentId, { config: { brand, appearance } });
}

/**
 * Learns the pages the builder kept from a read that found them, from the text already read (nothing is read twice).
 * Returns how many, or undefined when the read isn't this agent's or is no longer waiting.
 */
export async function learnChosenPages(agentId: string, readId: string, urls: string[]): Promise<number | undefined> {
  const read = state.reads.get(readId);
  const texts = state.foundText.get(readId);
  if (!read || read.agentId !== agentId || read.status !== "found" || !texts) return undefined;
  const chosen = [...new Set(urls)].filter((u) => texts.has(u));
  for (const u of chosen) await keepPage(agentId, { url: u, ...texts.get(u)! });
  state.foundText.delete(readId);
  read.status = "done";
  read.pages = chosen.length;
  read.found = undefined;
  read.finishedAt = Date.now();
  return chosen.length;
}

/** An agent's website reads that are running or finished in the last few minutes. */
export function siteReads(agentId: string): SiteRead[] {
  const now = Date.now();
  for (const [id, read] of state.reads) {
    const keep = read.status === "found" ? KEEP_FOUND_MS : KEEP_FINISHED_MS;
    if (read.finishedAt && now - read.finishedAt > keep) {
      state.reads.delete(id);
      state.foundText.delete(id);
    }
  }
  return [...state.reads.values()].filter((r) => r.agentId === agentId).sort((a, b) => b.startedAt - a.startedAt);
}

/** Resolves once every background training and website read has finished (for tests and scripts). */
export async function settled(): Promise<void> {
  while (state.work.size) await Promise.allSettled([...state.work]);
}
