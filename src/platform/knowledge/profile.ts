// Learning about a business from what it gave Keel (its website, its documents): a first draft of its profile and
// of its agent, for the builder to read, correct and keep. The model reads the start of each source, home page
// first; the builder always has the last word, so nothing is saved until they confirm.

import { z } from "zod";
import { INDUSTRIES, type Source } from "@/core/agents";
import { INDUSTRY_PRESETS } from "@/core/industries";
import { chatJson } from "@/lib/llm";
import { ROLE_MODEL } from "@/lib/models";
import { REFERENCE_RULE, reference } from "@/lib/untrusted";
import { lenientEnum } from "@/lib/lenient-enum";
import { meteredForAgent } from "../usage";
import { listSources, sourceContent } from "../store";

/** How much of the business's text the model reads to draft its profile. */
const READ_CHARS = 24_000;
const PER_SOURCE_CHARS = 4_000;

export const ProfileDraft = z.object({
  name: z.string().min(1).max(80),
  industry: lenientEnum(INDUSTRIES, {
    ecommerce: "retail",
    e_commerce: "retail",
    retail_and_e_commerce: "retail",
    shop: "retail",
    saas: "technology",
    software: "technology",
    tech: "technology",
    technology_and_software: "technology",
    airline: "travel",
    hotel: "hospitality",
    restaurant: "hospitality",
    finance: "financial",
    financial_services: "financial",
    banking: "financial",
    industrial: "manufacturing",
    manufacturer: "manufacturing",
    b2b: "manufacturing",
    manufacturing_and_industrial: "manufacturing",
    chemicals: "manufacturing",
    agriculture: "manufacturing",
    energy: "manufacturing",
    agency: "professional",
    consulting: "professional",
    consultancy: "professional",
    legal: "professional",
    law: "professional",
    accounting: "professional",
    professional_services: "professional",
    health: "healthcare",
    medical: "healthcare",
    clinic: "healthcare",
    dental: "healthcare",
    insurance: "financial",
    school: "education",
    university: "education",
    gym: "fitness",
    wellness: "fitness",
    fitness_and_wellness: "fitness",
    hr: "internal",
    something_else: "other",
  }),
  summary: z.string().max(1500),
  offerings: z.array(z.string().max(200)).max(8),
  audience: z.string().max(500),
  tone: z.string().max(300),
  instructions: z.string().max(3000),
  welcome: z.string().max(400),
  suggestions: z.array(z.string().max(120)).max(4),
});
export type ProfileDraft = z.infer<typeof ProfileDraft>;

const SCHEMA = "business_profile";

/** The text the draft is written from: the home page first, then the other sources, each cut to its start. */
async function readingFor(sources: Source[]): Promise<string> {
  const ordered = [...sources].sort((a, b) => rank(a) - rank(b));
  const parts: string[] = [];
  let used = 0;
  for (const s of ordered) {
    if (used >= READ_CHARS) break;
    const text = (await sourceContent(s.id)).slice(0, Math.min(PER_SOURCE_CHARS, READ_CHARS - used));
    parts.push(`### ${s.title}${s.url ? ` (${s.url})` : ""}\n${text}`);
    used += text.length;
  }
  return parts.join("\n\n");
}

const rank = (s: Source) => (s.url && new URL(s.url).pathname === "/" ? 0 : s.kind === "website" ? 1 : s.kind === "file" ? 2 : 3);

/** A first draft of the business's profile and its agent, from what the agent knows so far. */
export function draftProfile(agentId: string, hint: { name?: string; website?: string } = {}): Promise<{ draft: ProfileDraft; costUsd: number }> {
  return meteredForAgent(agentId, "knowledge", () => draftNow(agentId, hint));
}

async function draftNow(agentId: string, hint: { name?: string; website?: string }): Promise<{ draft: ProfileDraft; costUsd: number }> {
  const sources = (await listSources(agentId)).filter((s) => s.status === "ready" || s.status === "training" || s.status === "pending");
  const text = await readingFor(sources);
  const messages = [
    {
      role: "system" as const,
      content: [
        "You help a business set up the AI assistant that will answer its customers. From the business's own website pages and documents below, write a short, accurate profile of the business and a first version of its assistant.",
        "- name: the business's name as it presents itself (not the domain).",
        `- industry: one of ${INDUSTRIES.join(", ")} (${INDUSTRIES.map((i) => `${i} = ${INDUSTRY_PRESETS[i].label}`).join("; ")}).`,
        "- summary: what the business does, in two or three plain sentences.",
        "- offerings: its main products, services or plans, a few words each (up to 8).",
        "- audience: who its customers are, in one sentence.",
        "- tone: how it talks to them, in a few words, from how its website is written.",
        "- instructions: the assistant's role, in the second person (\"You are…\"), 3 to 5 sentences: what it helps with and how it should sound.",
        "- welcome: the assistant's first message to a visitor, one or two short sentences.",
        "- suggestions: up to 4 questions customers would most likely ask, each answerable from this text.",
        "Use only what the text says. Never invent prices, policies or facts. If something isn't stated, leave it short and general.",
        REFERENCE_RULE,
        reference("business", text || "(No text yet.)"),
      ].join("\n"),
    },
    { role: "user" as const, content: `Draft the profile${hint.name ? ` for ${hint.name}` : ""}${hint.website ? ` (website: ${hint.website})` : ""}.` },
  ];
  const result = await chatJson(ROLE_MODEL.writer, messages, ProfileDraft, SCHEMA, { temperature: 0.2, maxTokens: 1500 });
  const draft = result.data;
  return {
    draft: { ...draft, name: draft.name.trim() || hint.name || "My business", suggestions: draft.suggestions.filter((s) => s.trim()).slice(0, 4), offerings: draft.offerings.filter((o) => o.trim()) },
    costUsd: result.costUsd,
  };
}
