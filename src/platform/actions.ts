// An agent's actions: kept, offered to the model as tools, and run when it calls one. Calling the business's API goes
// through the public-address guard with a time limit; tickets and handovers go to the Helpdesk; forms and buttons are
// drawn in the chat. In a test run nothing real happens: each action returns the response the test defines (or a
// plain success), so a test can never book, refund or email anything.

import { ACTION_INFO, DEFAULT_ACTION_CONFIG, LEAD_FIELDS, fieldList, toolName, type Action, type ActionConfigs, type ActionKind } from "@/core/actions";
import type { Agent } from "@/core/agents";
import type { ToolSpec } from "@/core/tools";
import { renderWidget, type ChatWidget, type FieldSpec } from "@/core/widgets";
import { db } from "@/lib/db";
import { publicFetch } from "@/lib/net";
import { json, newId, now } from "@/lib/rows";
import { openSecret, sealSecret } from "@/lib/secrets";
import { ownDemoOrder } from "./demo-orders";
import { openTicket } from "./helpdesk";
import { getWidget } from "./widgets";

type Row = { id: string; agent_id: string; kind: ActionKind; name: string; title: string; description: string; config: string; enabled: number; procedures_only: number; created_at: string; updated_at: string };

/** Shown instead of a saved header value: the value itself never goes back to the browser. */
export const SECRET_MASK = "••••••••";

const headerPlace = (agentId: string, actionId: string) => `${agentId}/action.${actionId}.headers`;

/** An action's settings as stored: header values (API keys, tokens) sealed. */
function sealConfig(agentId: string, actionId: string, config: object): string {
  const c = config as { headers?: { name: string; value: string }[] };
  if (!Array.isArray(c.headers)) return JSON.stringify(config);
  return JSON.stringify({ ...config, headers: c.headers.map((h) => ({ name: h.name, value: sealSecret(h.value, headerPlace(agentId, actionId)) })) });
}

function openConfig(agentId: string, actionId: string, config: object): object {
  const c = config as { headers?: { name: string; value: string }[] };
  if (!Array.isArray(c.headers)) return config;
  return {
    ...config,
    headers: c.headers.map((h) => {
      try {
        return { name: h.name, value: openSecret(h.value, headerPlace(agentId, actionId)) };
      } catch {
        return { name: h.name, value: "" };
      }
    }),
  };
}

/** An action as the browser sees it: saved header values masked. */
export function maskedAction<A extends Action>(action: A): A {
  const c = action.config as { headers?: { name: string; value: string }[] };
  if (!Array.isArray(c.headers)) return action;
  return { ...action, config: { ...action.config, headers: c.headers.map((h) => ({ name: h.name, value: h.value ? SECRET_MASK : "" })) } };
}

const toAction = (r: Row): Action => ({
  id: r.id,
  agentId: r.agent_id,
  kind: r.kind,
  name: r.name,
  title: r.title,
  description: r.description,
  config: { ...DEFAULT_ACTION_CONFIG[r.kind], ...openConfig(r.agent_id, r.id, json<object>(r.config, {})) } as Action["config"],
  enabled: Boolean(r.enabled),
  proceduresOnly: Boolean(r.procedures_only),
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function listActions(agentId: string): Promise<Action[]> {
  return ((await db().prepare("SELECT * FROM actions WHERE agent_id = ? ORDER BY created_at").all(agentId)) as Row[]).map(toAction);
}

export async function getAction(id: string): Promise<Action | undefined> {
  const row = (await db().prepare("SELECT * FROM actions WHERE id = ?").get(id)) as Row | undefined;
  return row ? toAction(row) : undefined;
}

/** A name no other action of the agent has: "create_ticket", then "create_ticket_2". */
async function freeName(agentId: string, wanted: string, except?: string): Promise<string> {
  const taken = new Set((await listActions(agentId)).filter((a) => a.id !== except).map((a) => a.name));
  const base = toolName(wanted);
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}_${i}`)) return `${base}_${i}`;
}

export async function createAction<K extends ActionKind>(agentId: string, kind: K, input: { title?: string; name?: string; description?: string; config?: Partial<ActionConfigs[K]> } = {}): Promise<Action<K>> {
  const info = ACTION_INFO[kind];
  const id = newId("act");
  const at = now();
  await db()
    .prepare("INSERT INTO actions (id, agent_id, kind, name, title, description, config, enabled, procedures_only, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)")
    .run(id, agentId, kind, await freeName(agentId, input.name ?? info.name), input.title ?? info.title, input.description ?? info.description, sealConfig(agentId, id, { ...DEFAULT_ACTION_CONFIG[kind], ...input.config }), at, at);
  return (await getAction(id)) as Action<K>;
}

export async function updateAction(id: string, change: { title?: string; name?: string; description?: string; config?: object; enabled?: boolean; proceduresOnly?: boolean }): Promise<Action | undefined> {
  const action = await getAction(id);
  if (!action) return undefined;
  const config = { ...action.config, ...change.config } as { headers?: { name: string; value: string }[] };
  // A masked header value means "keep what's saved".
  if (Array.isArray(config.headers)) {
    const saved = (action.config as { headers?: { name: string; value: string }[] }).headers ?? [];
    config.headers = config.headers.map((h) => (h.value === SECRET_MASK ? { name: h.name, value: saved.find((s) => s.name === h.name)?.value ?? "" } : h));
  }
  await db()
    .prepare("UPDATE actions SET title = ?, name = ?, description = ?, config = ?, enabled = ?, procedures_only = ?, updated_at = ? WHERE id = ?")
    .run(
      change.title ?? action.title,
      change.name ? await freeName(action.agentId, change.name, id) : action.name,
      change.description ?? action.description,
      sealConfig(action.agentId, id, config),
      (change.enabled ?? action.enabled) ? 1 : 0,
      (change.proceduresOnly ?? action.proceduresOnly) ? 1 : 0,
      now(),
      id,
    );
  return getAction(id);
}

/** Puts an action back exactly as it was (restoring a version), with its own id. */
export async function restoreAction(action: Action): Promise<void> {
  await db()
    .prepare(
      `INSERT INTO actions (id, agent_id, kind, name, title, description, config, enabled, procedures_only, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, title = excluded.title, description = excluded.description, config = excluded.config, enabled = excluded.enabled, procedures_only = excluded.procedures_only, updated_at = excluded.updated_at`,
    )
    .run(action.id, action.agentId, action.kind, action.name, action.title, action.description, sealConfig(action.agentId, action.id, action.config), action.enabled ? 1 : 0, action.proceduresOnly ? 1 : 0, action.createdAt, now());
}

export async function deleteAction(id: string): Promise<void> {
  await db().prepare("DELETE FROM actions WHERE id = ?").run(id);
}

// ── As tools ─────────────────────────────────────────────────────────────────────────────────────────────────────

const OBJECT = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required, additionalProperties: false });

/** How the model sees an action. */
/** The fields a form action asks for (a lead's contact details, or the builder's own fields). */
export function formFields(action: Action): FieldSpec[] {
  if (action.kind === "lead") return (action.config as ActionConfigs["lead"]).fields.map((f) => LEAD_FIELDS[f]);
  if (action.kind === "data" || action.kind === "form") return (action.config as ActionConfigs["data"]).fields;
  return [];
}

/**
 * An action as a tool the agent can call. `conversational`: the customer is in a messaging app, which can't show a
 * form, so a form's fields become the tool's arguments: the agent asks for them in the conversation and passes the
 * customer's answers.
 */
export function toolSpec(action: Action, options: { conversational?: boolean } = {}): ToolSpec {
  const kind = action.kind;
  let parameters: Record<string, unknown> = OBJECT({});
  let suffix = "";
  if (kind === "escalate") {
    parameters = OBJECT({ summary: { type: "string", description: "What the customer needs and what you already know, in one or two sentences" }, urgency: { type: "string", enum: ["low", "normal", "high"] } }, ["summary"]);
    suffix = " Opens a ticket for the team.";
  } else if (kind === "handoff") {
    parameters = OBJECT({ reason: { type: "string", description: "Why a person should take over" } }, ["reason"]);
    suffix = " A person from the team takes over the conversation.";
  } else if (kind === "api") {
    const params = (action.config as ActionConfigs["api"]).params;
    parameters = OBJECT(
      Object.fromEntries(params.map((p) => [p.name, { type: p.type, description: p.description }])),
      params.filter((p) => p.required).map((p) => p.name),
    );
  } else if ((kind === "lead" || kind === "data" || kind === "form") && options.conversational) {
    const fields = formFields(action);
    parameters = OBJECT(
      Object.fromEntries(fields.map((f) => [f.key, { type: "string", description: `${f.label}${f.type === "choice" && f.options?.length ? ` (one of: ${f.options.join(", ")})` : ""}` }])),
      fields.filter((f) => f.required).map((f) => f.key),
    );
    suffix = " The customer is in a messaging app and can't see forms: ask them for these details in the conversation, then call it with their own answers (never invent one). It saves them for the team.";
  } else if (kind === "lead" || kind === "data" || kind === "form") {
    // The agent is told what the form asks for, so it never describes fields the form doesn't have.
    suffix = ` Shows a form in the chat for the visitor to fill in, asking for: ${fieldList(formFields(action))}. Call it in the same reply that mentions the form (never say a form is there without calling this); after calling it, tell them briefly what it asks for and wait.`;
  } else if (kind === "button") {
    suffix = " Shows a button in the chat that opens a page.";
  }
  return { name: action.name, description: `${action.description}${suffix}`.slice(0, 1000), parameters };
}

/**
 * The tools the agent may use for this message: its enabled actions (not the suggested-questions setting), plus those
 * kept for procedures when the running procedure mentions them.
 */
export async function toolsFor(agentId: string, procedureSteps?: string, draftActions?: Action[]): Promise<{ tools: ToolSpec[]; actions: Action[] }> {
  const actions = (draftActions ?? (await listActions(agentId))).filter((a) => a.enabled && a.kind !== "followups" && (!a.proceduresOnly || procedureSteps?.includes(`@${a.name}`)));
  return { tools: actions.map((a) => toolSpec(a)), actions };
}

// ── Running them ─────────────────────────────────────────────────────────────────────────────────────────────────

export interface ActionContext {
  agent: Agent;
  conversationId?: string;
  /** A test run: no action runs for real; each returns the test's response for it (`responses[name]`), or a plain success. */
  test?: { responses: Record<string, unknown> };
  /** The customer is in a messaging app: forms are filled in the conversation, through the tool's arguments. */
  messaging?: boolean;
}

export interface ActionOutcome {
  /** What the model is told came back. */
  result: unknown;
  widget?: ChatWidget;
  /** The conversation now belongs to a person; the agent says `message` and stops. */
  handedOver?: { message: string };
  error?: string;
}

function parseArgs(text: string): Record<string, unknown> {
  try {
    const value = JSON.parse(text || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function formWidget(action: Action): ChatWidget | undefined {
  if (action.kind === "lead") {
    const c = action.config as ActionConfigs["lead"];
    return { type: "form", actionId: action.id, kind: "lead", title: c.title, fields: c.fields.map((f) => LEAD_FIELDS[f]), submitLabel: c.submitLabel };
  }
  if (action.kind === "data" || action.kind === "form") {
    const c = action.config as ActionConfigs["data"];
    return { type: "form", actionId: action.id, kind: action.kind, title: c.title, fields: c.fields, submitLabel: c.submitLabel };
  }
  if (action.kind === "button") {
    const c = action.config as ActionConfigs["button"];
    return /^https?:\/\//.test(c.url) ? { type: "button", label: c.label, url: c.url } : undefined;
  }
  return undefined;
}

/** The URL and request for an API action with these arguments: `{name}` in the URL filled, the rest as query or body. */
export function apiRequest(config: ActionConfigs["api"], args: Record<string, unknown>): { url: string; init: RequestInit } {
  const used = new Set<string>();
  let url = config.url.replace(/\{(\w+)\}/g, (_, name: string) => {
    used.add(name);
    return encodeURIComponent(String(args[name] ?? ""));
  });
  const rest = Object.fromEntries(Object.entries(args).filter(([k, v]) => !used.has(k) && v !== undefined && v !== null && v !== ""));
  const withBody = config.method !== "GET" && config.method !== "DELETE";
  if (!withBody && Object.keys(rest).length) {
    const u = new URL(url);
    for (const [k, v] of Object.entries(rest)) u.searchParams.set(k, String(v));
    url = u.toString();
  }
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "Keel-Actions/1.0" };
  for (const h of config.headers) if (h.name.trim()) headers[h.name.trim()] = h.value;
  if (withBody) headers["Content-Type"] = "application/json";
  return { url, init: { method: config.method, headers, ...(withBody ? { body: JSON.stringify(rest) } : {}), signal: AbortSignal.timeout(10_000) } };
}

/** Calls the business's API; returns its status and (shortened) response. */
export async function callApi(config: ActionConfigs["api"], args: Record<string, unknown>): Promise<{ status: number; body: unknown }> {
  const { url, init } = apiRequest(config, args);
  // The demo business's order system lives on this server: answered here, not over the network.
  const demo = ownDemoOrder(url);
  if (demo) return demo;
  const res = await publicFetch(url, init);
  const text = (await res.text()).slice(0, 100_000);
  let body: unknown = text.slice(0, 4000);
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body };
}

const shorten = (value: unknown) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 6000 ? `${text.slice(0, 6000)}… (shortened)` : value;
};

export async function runAction(action: Action, argsText: string, ctx: ActionContext): Promise<ActionOutcome> {
  const args = parseArgs(argsText);
  const shown = formWidget(action);

  if (ctx.test) {
    // A form the test says nothing about is shown, as it would be: never "ok", which reads as if it was filled in.
    const shownForm = (action.kind === "lead" || action.kind === "data" || action.kind === "form") && !ctx.messaging ? { shown: "form", note: "It's on the visitor's screen now." } : undefined;
    const result = ctx.test.responses[action.name] ?? shownForm ?? { ok: true };
    let widget = shown;
    if (action.kind === "api") {
      const widgetId = (action.config as ActionConfigs["api"]).widgetId;
      const def = widgetId ? await getWidget(widgetId) : undefined;
      widget = def ? renderWidget(def, result) : undefined;
    }
    if (action.kind === "handoff") return { result, handedOver: { message: (action.config as ActionConfigs["handoff"]).message } };
    return { result, ...(widget ? { widget } : {}) };
  }

  switch (action.kind) {
    case "escalate": {
      const summary = String(args.summary ?? "The customer needs help from the team.");
      const urgency = args.urgency === "high" || args.urgency === "low" ? args.urgency : "normal";
      const ticket = await openTicket({ agentId: ctx.agent.id, conversationId: ctx.conversationId, subject: summary.slice(0, 90), summary, priority: urgency });
      return { result: { ticket: ticket.id, status: "opened", tell_the_customer: (action.config as ActionConfigs["escalate"]).confirmation } };
    }
    case "handoff": {
      const reason = String(args.reason ?? "The customer asked for a person.");
      await openTicket({ agentId: ctx.agent.id, conversationId: ctx.conversationId, subject: reason.slice(0, 90), summary: reason, priority: "normal", handover: true });
      return { result: { handed_over: true }, handedOver: { message: (action.config as ActionConfigs["handoff"]).message } };
    }
    case "api": {
      const config = action.config as ActionConfigs["api"];
      try {
        const { status, body } = await callApi(config, args);
        if (status >= 400) return { result: { error: `The system answered with an error (${status}).`, response: shorten(body) }, error: `HTTP ${status}` };
        const def = config.widgetId ? await getWidget(config.widgetId) : undefined;
        const widget = def ? renderWidget(def, body) : undefined;
        return { result: shorten(body), ...(widget ? { widget } : {}) };
      } catch (error) {
        const message = (error as Error).name === "TimeoutError" ? "The system took too long to answer." : "The system couldn't be reached.";
        return { result: { error: message }, error: message };
      }
    }
    case "lead":
    case "data":
    case "form": {
      if (!ctx.messaging) return { result: { shown: shown?.type ?? "nothing", note: `It's on the visitor's screen now, asking for: ${fieldList(formFields(action))}.` }, ...(shown ? { widget: shown } : {}) };
      // In a messaging app, the customer's answers came in the conversation: saved as if the form was filled in.
      const { addSubmission, checkAnswers } = await import("./submissions");
      const checked = checkAnswers(formFields(action), args);
      if (!checked.ok) return { result: { saved: false, problem: checked.error, next: "Ask the customer for it, then call this again with all their answers." } };
      await addSubmission({ agentId: ctx.agent.id, actionId: action.id, conversationId: ctx.conversationId, kind: action.kind, data: checked.data });
      return { result: { saved: true, tell_the_customer: "Thank them: the team has their details." } };
    }
    default:
      return { result: { shown: shown?.type ?? "nothing", note: "It's on the visitor's screen now." }, ...(shown ? { widget: shown } : {}) };
  }
}
