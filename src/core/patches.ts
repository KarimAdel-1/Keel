// The edits the improvement agent makes, and applying them to a copy of an agent. Each edit is small and exact: it
// adds or replaces one passage, sharpens when one action is used, edits one procedure, adds one Q&A, or changes the
// model. Everything an edit doesn't touch stays word for word, so a fix can't quietly rewrite what already worked.
// Pure: the improvement loop is in src/platform/improve.ts.

import type { Action } from "./actions";
import type { AgentConfig } from "./agents";
import { actionsIn, type Procedure } from "./procedures";

const MODEL_KEYS = ["nano", "lightning", "super", "ultra"] as const;

/** An agent as the improvement agent sees and edits it. */
export interface AgentSnapshot {
  name: string;
  config: AgentConfig;
  actions: Action[];
  procedures: Procedure[];
}

export type Patch = { why: string } & (
  | { kind: "instructions_add"; text: string }
  | { kind: "instructions_replace"; find: string; replace: string }
  | { kind: "rules_add"; text: string }
  | { kind: "rules_replace"; find: string; replace: string }
  | { kind: "fallback_set"; text: string }
  | { kind: "action_when"; action: string; description: string }
  | { kind: "procedure_steps"; procedure: string; steps: string }
  | { kind: "procedure_add"; name: string; trigger: string; steps: string }
  | { kind: "qa_add"; question: string; answer: string; evidence: string }
  | { kind: "model_set"; model: (typeof MODEL_KEYS)[number] }
);

export type PatchKind = Patch["kind"];

export const PATCH_AREA: Record<PatchKind, string> = {
  instructions_add: "Instructions",
  instructions_replace: "Instructions",
  rules_add: "Rules",
  rules_replace: "Rules",
  fallback_set: "When it doesn't know",
  action_when: "Action",
  procedure_steps: "Procedure",
  procedure_add: "New procedure",
  qa_add: "New Q&A",
  model_set: "Model",
};

export const LIMITS = { instructions: 8000, rules: 4000, fallback: 500, description: 1000, steps: 6000, qa: 4000 };

export interface QaAddition {
  question: string;
  answer: string;
}

export interface PatchResult {
  snapshot: AgentSnapshot;
  /** Q&As the edits add to the knowledge. */
  qas: QaAddition[];
  applied: Patch[];
  rejected: { patch: Patch; reason: string }[];
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** `text` with one exact passage replaced; undefined when the passage isn't there exactly once. */
function replaceOnce(text: string, find: string, replace: string): string | undefined {
  if (!find.trim()) return undefined;
  const at = text.indexOf(find);
  if (at < 0 || text.indexOf(find, at + find.length) >= 0) return undefined;
  return text.slice(0, at) + replace + text.slice(at + find.length);
}

const appended = (text: string, addition: string) => (text.trim() ? `${text.trimEnd()}\n\n${addition.trim()}` : addition.trim());

/** Applies edits to a copy of the agent, in order. An edit that doesn't fit is rejected with the reason. */
export function applyPatches(base: AgentSnapshot, patches: Patch[]): PatchResult {
  const snapshot: AgentSnapshot = structuredClone(base);
  const qas: QaAddition[] = [];
  const applied: Patch[] = [];
  const rejected: PatchResult["rejected"] = [];
  const reject = (patch: Patch, reason: string) => rejected.push({ patch, reason });
  const c = snapshot.config;

  for (const patch of patches) {
    switch (patch.kind) {
      case "instructions_add": {
        const next = appended(c.instructions, patch.text);
        if (!patch.text.trim()) reject(patch, "empty");
        else if (norm(c.instructions).includes(norm(patch.text))) reject(patch, "already in the instructions");
        else if (next.length > LIMITS.instructions) reject(patch, "the instructions would be too long");
        else {
          c.instructions = next;
          applied.push(patch);
        }
        break;
      }
      case "instructions_replace": {
        const next = replaceOnce(c.instructions, patch.find, patch.replace);
        if (next === undefined) reject(patch, "the passage to replace isn't in the instructions exactly once");
        else if (next.length > LIMITS.instructions) reject(patch, "the instructions would be too long");
        else {
          c.instructions = next;
          applied.push(patch);
        }
        break;
      }
      case "rules_add": {
        const next = appended(c.guardrails, patch.text);
        if (!patch.text.trim()) reject(patch, "empty");
        else if (norm(c.guardrails).includes(norm(patch.text))) reject(patch, "already in the rules");
        else if (next.length > LIMITS.rules) reject(patch, "the rules would be too long");
        else {
          c.guardrails = next;
          applied.push(patch);
        }
        break;
      }
      case "rules_replace": {
        const next = replaceOnce(c.guardrails, patch.find, patch.replace);
        if (next === undefined) reject(patch, "the passage to replace isn't in the rules exactly once");
        else if (next.length > LIMITS.rules) reject(patch, "the rules would be too long");
        else {
          c.guardrails = next;
          applied.push(patch);
        }
        break;
      }
      case "fallback_set": {
        if (!patch.text.trim() || patch.text.length > LIMITS.fallback) reject(patch, "the message must be between 1 and 500 characters");
        else {
          c.fallback = patch.text.trim();
          applied.push(patch);
        }
        break;
      }
      case "action_when": {
        const action = snapshot.actions.find((a) => a.name === patch.action.replace(/^@/, ""));
        if (!action) reject(patch, `there's no action called ${patch.action}`);
        else if (!patch.description.trim() || patch.description.length > LIMITS.description) reject(patch, "the description must be between 1 and 1000 characters");
        else {
          action.description = patch.description.trim();
          applied.push(patch);
        }
        break;
      }
      case "procedure_steps": {
        const procedure = snapshot.procedures.find((p) => norm(p.name) === norm(patch.procedure));
        const missing = actionsIn(patch.steps).filter((n) => !snapshot.actions.some((a) => a.name === n));
        if (!procedure) reject(patch, `there's no procedure called "${patch.procedure}"`);
        else if (missing.length) reject(patch, `the steps call actions that don't exist: ${missing.map((m) => `@${m}`).join(", ")}`);
        else if (!patch.steps.trim() || patch.steps.length > LIMITS.steps) reject(patch, "the steps must be between 1 and 6000 characters");
        else {
          procedure.steps = patch.steps.trim();
          applied.push(patch);
        }
        break;
      }
      case "procedure_add": {
        const missing = actionsIn(patch.steps).filter((n) => !snapshot.actions.some((a) => a.name === n));
        if (snapshot.procedures.some((p) => norm(p.name) === norm(patch.name))) reject(patch, `a procedure called "${patch.name}" already exists`);
        else if (missing.length) reject(patch, `the steps call actions that don't exist: ${missing.map((m) => `@${m}`).join(", ")}`);
        else if (patch.trigger.trim().length < 10 || !patch.steps.trim() || patch.steps.length > LIMITS.steps) reject(patch, "a procedure needs a trigger sentence and steps");
        else {
          const at = new Date().toISOString();
          snapshot.procedures.push({ id: `draft_${snapshot.procedures.length + 1}`, agentId: "", name: patch.name.trim(), trigger: patch.trigger.trim(), steps: patch.steps.trim(), enabled: true, createdAt: at, updatedAt: at });
          applied.push(patch);
        }
        break;
      }
      case "qa_add": {
        if (patch.question.trim().length < 5 || !patch.answer.trim() || patch.answer.length > LIMITS.qa) reject(patch, "a Q&A needs a question and an answer");
        else if (qas.some((q) => norm(q.question) === norm(patch.question))) reject(patch, "the same question twice");
        else {
          qas.push({ question: patch.question.trim(), answer: patch.answer.trim() });
          applied.push(patch);
        }
        break;
      }
      case "model_set": {
        if (!(MODEL_KEYS as readonly string[]).includes(patch.model)) reject(patch, `unknown model ${patch.model}`);
        else if (c.model === patch.model) reject(patch, "already that model");
        else {
          c.model = patch.model;
          applied.push(patch);
        }
        break;
      }
    }
  }
  return { snapshot, qas, applied, rejected };
}

/** A sentence of the answer that the knowledge doesn't contain: what a Q&A may not invent. Undefined when grounded. */
export function ungroundedClaim(evidence: string, knowledge: string): string | undefined {
  const hay = norm(knowledge);
  const quote = norm(evidence).replace(/^["“']|["”']$/g, "");
  if (quote.length < 12) return evidence || "(no evidence quoted)";
  return hay.includes(quote) ? undefined : evidence;
}

/** The numbers an answer states that its evidence doesn't: a Q&A must not change prices, days or limits. */
export function numbersNotIn(answer: string, evidence: string): string[] {
  const have = new Set((evidence.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", ".")));
  return [...new Set((answer.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", ".")))].filter((n) => !have.has(n));
}
