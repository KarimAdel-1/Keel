// What an agent's reply is given, without losing anything it needs: the search query (a short follow-up carries the
// question before it), the knowledge passages (whole while they fit; a sentence an earlier passage already says, word
// for word, left out; only past the budget, the least relevant cut down) and the conversation so far (word for word
// while it fits). Nothing here trims what fits: tokens are saved elsewhere, by not doing work that isn't needed.
// Pure, model-free and language-aware.

import type { Passage } from "./agents";

const STOP = new Set(
  "a an and are as at be been but by can could do does for from had has have how if in into is it its may might must no not of on or our shall should so than that the their them then there these they this to was we were what when where which who will with would you your any all each other also only i me my just about please hi hello thanks thank yes ok okay".split(" "),
);

const stem = (w: string) => (w.length > 4 && w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);

/** The words that carry meaning, in any language: lowercased, plural "s" off, without common English filler. */
export function meaningWords(text: string): Set<string> {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return new Set(words.filter((w) => (w.length > 2 || /\d/.test(w)) && !STOP.has(w)).map(stem));
}

const overlap = (words: Set<string>, text: string) => {
  let n = 0;
  for (const w of meaningWords(text)) if (words.has(w)) n++;
  return n;
};

// ── The search query ────────────────────────────────────────────────────────────────────────────────────────────

/** A follow-up that leans on what came before: short, or pointing back ("it", "that", "and…"). */
const leansBack = (question: string) => question.split(/\s+/).length <= 8 || /^(and|but|so|also|what about|how about)\b|\b(it|that|this|those|them|they|there)\b/i.test(question.trim());

/**
 * What to search the knowledge for: the question, plus the customer's previous message when the question is a short
 * follow-up ("And how long does that take?"), so the search knows what "that" is.
 */
export function searchQuery(question: string, history: { role: string; content: string }[]): string {
  if (!leansBack(question)) return question;
  const previous = [...history].reverse().find((t) => t.role === "user")?.content;
  return previous ? `${question}\n${previous.slice(0, 300)}` : question;
}

// ── Passages ────────────────────────────────────────────────────────────────────────────────────────────────────

/** A passage's units: headings, list items, table rows and sentences, so a cut never splits one. */
function units(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => (/^\s*(#|[-*•|]|\d+[.)])/.test(line) ? [line] : line.split(/(?<=[.!?])\s+(?=[\p{Lu}\d"“(])/u)))
    .map((u) => u.trim())
    .filter(Boolean);
}

/** A sentence as compared for repeats: lower case, words only. */
const sameness = (unit: string) => (unit.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join(" ");

const isHeading = (unit: string) => /^\s*#/.test(unit);

/**
 * The passages an answer is given. Every passage stays whole while they fit `budget` characters (the search already
 * chose them; trimming by shared words would drop answers worded differently from the question, which a blind,
 * graded check on the real models caught). Two things are always left out: a sentence an earlier, better-ranked
 * passage already says, and a passage with nothing new. Only past the budget, the least relevant passages are cut to
 * the sentences sharing words with the query (with the sentence after each and their heading), then dropped from the
 * bottom. Passages keep their order, so citations still point at the right source.
 */
export function compressPassages(query: string, passages: Passage[], options: { budget?: number } = {}): Passage[] {
  const budget = options.budget ?? 7000;
  const words = meaningWords(query);

  // Repeats out: a sentence an earlier passage already says, word for word (pages often repeat boilerplate or a
  // shared FAQ). Only the same sentence counts: a short new fact can share every word with other facts.
  const said = new Set<string>();
  const distinct: Passage[] = [];
  passages.forEach((p) => {
    const parts = units(p.text);
    const fresh = parts.map((u) => isHeading(u) || !said.has(sameness(u)));
    if (!parts.some((u, j) => fresh[j] && !isHeading(u))) return;
    for (const u of parts) if (!isHeading(u)) said.add(sameness(u));
    const text = fresh.every(Boolean) ? p.text : parts.filter((_, j) => fresh[j]).join("\n");
    distinct.push(text === p.text ? p : { ...p, text });
  });

  // Over the budget only: cut the least relevant first, then drop from the bottom.
  const total = () => distinct.reduce((n, p) => n + p.text.length, 0);
  for (let i = distinct.length - 1; i >= 1 && total() > budget; i--) {
    const parts = units(distinct[i].text);
    const keep = new Set<number>();
    parts.forEach((u, j) => {
      if (isHeading(u) || overlap(words, u) === 0) return;
      keep.add(j);
      if (j + 1 < parts.length && !isHeading(parts[j + 1])) keep.add(j + 1);
      for (let h = j - 1; h >= 0; h--)
        if (isHeading(parts[h])) {
          keep.add(h);
          break;
        }
    });
    distinct[i] = { ...distinct[i], text: parts.filter((_, j) => keep.has(j)).join("\n") };
  }
  const kept = distinct.filter((p) => p.text.trim());
  while (kept.length > 1 && kept.reduce((n, p) => n + p.text.length, 0) > budget) kept.pop();
  return kept;
}

// ── History ─────────────────────────────────────────────────────────────────────────────────────────────────────

const clip = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max).replace(/\s+\S*$/, "")}…`);

/**
 * The conversation so far as the model gets it: word for word while it fits `maxChars` (12,000 characters, about
 * twenty exchanges), so nothing said earlier (an order number, a name) is lost. Only past that are the oldest messages
 * shortened (the customer's to 300 characters, the agent's to its first two sentences), and only if that isn't enough
 * are the oldest left out. The last `verbatim` messages always stay word for word.
 */
export function compactHistory<T extends { role: string; content: string }>(history: T[], options: { verbatim?: number; maxChars?: number } = {}): T[] {
  const verbatim = options.verbatim ?? 6;
  const maxChars = options.maxChars ?? 12_000;
  const total = (list: T[]) => list.reduce((n, t) => n + t.content.length, 0);
  const out = [...history];
  if (total(out) <= maxChars) return out;
  for (let i = 0; i < out.length - verbatim && total(out) > maxChars; i++) {
    const t = out[i];
    out[i] = { ...t, content: t.role === "user" ? clip(t.content, 300) : clip((t.content.match(/[^.!?]+[.!?]+/g) ?? [t.content]).slice(0, 2).join("").trim(), 320) };
  }
  while (total(out) > maxChars && out.length > verbatim) out.shift();
  return out;
}
