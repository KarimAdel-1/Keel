// An agent's turn with actions, as a LangGraph graph: "think" (the model answers, or chooses actions) and "act" (the
// actions run and their results go back to the model), looping until it answers. The limits are in the graph's
// edges: at most CALLS_PER_STEP actions a step, CALLS_PER_REPLY in a reply (after that the model must answer) and
// STEPS rounds; a call that already failed the same way isn't run again; a handover to a person ends the turn.
// Errors go back to the model compact, as the action's result; after FAILURES_IN_A_ROW failed calls it may only
// bring in the team (the actions that hand over or open a ticket), or answer. A reply that says something happened
// that no action did (a form on screen, a person joining, the case passed to the team) goes back to the model once,
// to do it or say it as an offer; a form the reply clearly means is shown without asking.

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { claimsIn, promisesForm, type Action } from "@/core/actions";
import type { ChatWidget } from "@/core/widgets";
import { chatWithTools, type AgentMessage } from "@/lib/llm";
import type { ModelKey } from "@/lib/models";
import { compactResult } from "@/core/compact";
import type { ToolSpec } from "@/core/tools";
import { formFields, runAction, type ActionContext } from "../actions";

export const CALLS_PER_STEP = 4;
export const CALLS_PER_REPLY = 12;
export const STEPS = 5;
export const FAILURES_IN_A_ROW = 3;

/**
 * How long a reply (or a step of one) may be, in tokens. A ceiling, not a target: the instructions keep replies short,
 * only what's written is paid for, and a reply that reaches it is carried on or retried rather than cut (src/lib/llm.ts).
 */
export const REPLY_CEILING = 1500;

export interface ActionCallRecord {
  name: string;
  arguments: string;
  result: string;
  error?: string;
}

const replace = <T>(fallback: () => T) => Annotation<T>({ reducer: (_old: T, next: T) => next, default: fallback });
const append = <T>() => Annotation<T[]>({ reducer: (old: T[], next: T[]) => [...old, ...next], default: () => [] });

const TurnState = Annotation.Root({
  messages: append<AgentMessage>(),
  calls: append<ActionCallRecord>(),
  widgets: append<ChatWidget>(),
  pending: replace<{ id: string; name: string; arguments: string }[]>(() => []),
  text: replace<string>(() => ""),
  handedOver: replace<boolean>(() => false),
  steps: replace<number>(() => 0),
  /** Failed action calls in a row (a success resets it). */
  failures: replace<number>(() => 0),
  /** The model is asked once more: its reply said something happened that no action did (unkeptPromise). */
  again: replace<boolean>(() => false),
  /** It has been asked once already, so its next reply stands. */
  rechecked: replace<boolean>(() => false),
  costUsd: Annotation<number>({ reducer: (a: number, b: number) => a + b, default: () => 0 }),
});

export type TurnResult = typeof TurnState.State;

/** Runs one turn of the agent with its actions through the graph. */
export async function runAgentTurn(input: {
  model: ModelKey;
  messages: AgentMessage[];
  tools: ToolSpec[];
  actions: Action[];
  context: ActionContext;
  temperature: number;
  reasoning?: "none" | "minimal" | "low" | "medium" | "high";
  signal?: AbortSignal;
}): Promise<TurnResult> {
  // Past the failure limit, only the ways to a person stay on offer.
  const toPeople = new Set(input.actions.filter((a) => a.kind === "escalate" || a.kind === "handoff").map((a) => a.name));
  const think = async (state: TurnResult) => {
    const stuck = state.failures >= FAILURES_IN_A_ROW;
    const tools = stuck ? input.tools.filter((t) => toPeople.has(t.name)) : input.tools;
    const turn = await chatWithTools(input.model, state.messages, tools, {
      temperature: input.temperature,
      maxTokens: REPLY_CEILING,
      reasoning: input.reasoning,
      signal: input.signal,
      allowTools: state.calls.length < CALLS_PER_REPLY && tools.length > 0,
    });
    if (!turn.toolCalls.length) {
      // A reply that says a person is joining, a ticket is open or a form is there, when no action did it: once, the
      // model is told so, and either does it now or says it as an offer.
      const note = state.rechecked ? undefined : unkeptPromise(turn.text, state.calls, input.actions, input.context);
      if (note) return { messages: [{ role: "assistant", content: turn.text } as AgentMessage, { role: "user", content: note } as AgentMessage], pending: [], again: true, rechecked: true, costUsd: turn.costUsd };
      return { text: turn.text, pending: [], again: false, costUsd: turn.costUsd };
    }
    const batch = turn.toolCalls.slice(0, CALLS_PER_STEP);
    return {
      messages: [{ role: "assistant", content: turn.text || null, tool_calls: batch.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: c.arguments } })) } as AgentMessage],
      pending: batch,
      again: false,
      costUsd: turn.costUsd,
    };
  };

  const act = async (state: TurnResult) => {
    const messages: AgentMessage[] = [];
    const calls: ActionCallRecord[] = [];
    const widgets: ChatWidget[] = [];
    let handedOver = false;
    let text = "";
    let failures = state.failures;
    for (const call of state.pending) {
      const action = input.actions.find((a) => a.name === call.name);
      // A call that failed the same way already isn't repeated.
      const repeated = [...state.calls, ...calls].find((c) => c.name === call.name && c.arguments === call.arguments && c.error);
      const outcome = !action
        ? { result: { error: `There is no action called ${call.name}.` }, error: "unknown action" }
        : repeated
          ? { result: { error: "This already failed with the same details; don't try it again." }, error: "repeated" }
          : await runAction(action, call.arguments, input.context);
      const result = typeof outcome.result === "string" ? outcome.result : JSON.stringify(outcome.result);
      calls.push({ name: call.name, arguments: call.arguments, result: result.slice(0, 2000), ...(outcome.error ? { error: outcome.error } : {}) });
      if ("widget" in outcome && outcome.widget) widgets.push(outcome.widget);
      failures = outcome.error ? failures + 1 : 0;
      // The model reads the result compact (core/compact.ts); the record keeps it as it came. At the failure limit, it's
      // told plainly to stop.
      const stop = failures === FAILURES_IN_A_ROW ? `\n(${FAILURES_IN_A_ROW} actions failed in a row. Don't try them again: tell the customer plainly${toPeople.size ? ", and offer to bring in the team" : ""}.)` : "";
      messages.push({ role: "tool", tool_call_id: call.id, content: compactResult(outcome.result) + stop });
      if ("handedOver" in outcome && outcome.handedOver) {
        handedOver = true;
        text = outcome.handedOver.message;
      }
    }
    return { messages, calls, widgets, pending: [], steps: state.steps + 1, failures, ...(handedOver ? { handedOver, text } : {}) };
  };

  const graph = new StateGraph(TurnState)
    .addNode("think", think)
    .addNode("act", act)
    .addEdge(START, "think")
    .addConditionalEdges("think", (state) => (state.pending.length ? "act" : state.again ? "think" : END), ["act", "think", END])
    .addConditionalEdges("act", (state) => (state.handedOver || state.steps >= STEPS ? END : "think"), ["think", END])
    .compile();

  const result = await graph.invoke({ messages: input.messages }, { recursionLimit: STEPS * 2 + 4, signal: input.signal });
  return showPromisedForm(result, input.actions, input.context);
}

const FORM_KINDS = new Set<string>(["lead", "data", "form"]);

/**
 * A reply that tells the visitor a form is in the chat ("fill in the form below") when the agent didn't show one: the
 * visitor would look for a form that isn't there. With one form on offer, it's shown; with several, the one the reply
 * describes (formMeant), and none when that isn't clear. In a messaging app, forms are filled in the conversation, so
 * nothing changes there.
 */
export async function showPromisedForm(result: TurnResult, actions: Action[], context: ActionContext): Promise<TurnResult> {
  if (context.messaging || result.handedOver || !promisesForm(result.text)) return result;
  const kindOf = (name: string) => actions.find((a) => a.name === name)?.kind ?? "";
  if (result.calls.some((c) => FORM_KINDS.has(kindOf(c.name)))) return result;
  const forms = actions.filter((a) => FORM_KINDS.has(a.kind));
  const form = forms.length === 1 ? forms[0] : formMeant(result.text, forms);
  if (!form) return result;
  const outcome = await runAction(form, "{}", context);
  const record: ActionCallRecord = { name: form.name, arguments: "{}", result: JSON.stringify(outcome.result).slice(0, 2000) };
  return { ...result, calls: [...result.calls, record], widgets: outcome.widget ? [...result.widgets, outcome.widget] : result.widgets };
}

/**
 * What a reply told the customer that no action this turn made true, as a note back to the model; nothing when every
 * claim is kept. A form the reply clearly means is shown by showPromisedForm instead, with no extra call.
 */
export function unkeptPromise(text: string, calls: ActionCallRecord[], actions: Action[], context: ActionContext): string | undefined {
  const claims = claimsIn(text);
  if (!claims.length) return undefined;
  const done = new Set(calls.filter((c) => !c.error).map((c) => actions.find((a) => a.name === c.name)?.kind ?? ""));
  const formDone = [...done].some((k) => FORM_KINDS.has(k));
  const toTeam = done.has("handoff") || done.has("escalate") || (Boolean(context.messaging) && formDone);
  const forms = actions.filter((a) => FORM_KINDS.has(a.kind));
  const formShownAnyway = !context.messaging && (forms.length === 1 || Boolean(formMeant(text, forms)));
  const unkept = [
    claims.includes("form") && !formDone && !formShownAnyway ? "that a form is on their screen" : "",
    claims.includes("person") && !toTeam ? "that a person from the team is joining or taking over" : "",
    claims.includes("team") && !toTeam ? "that you've passed this on to the team" : "",
  ].filter(Boolean);
  if (!unkept.length) return undefined;
  return `(A note from Keel, not the customer, which they never see: your reply told the customer ${unkept.join(" and ")}, but none of your actions has done that. If the customer wants it and one of your actions does it, call that action now. Otherwise write your reply again without saying it happened: offer it, or give the contact details you know. Don't mention this note.)`;
}

/** Words every form shares, which tell forms apart from nothing. */
const FORM_WORDS = new Set(["form", "show", "with", "what's", "your", "the", "and", "for", "you", "this", "that", "request", "details"]);
const wordsIn = (text: string) => new Set((text.toLowerCase().match(/\p{L}[\p{L}']{2,}/gu) ?? []).filter((w) => !FORM_WORDS.has(w)));

/**
 * Of several forms, the one a reply describes: the reply names more of its own words (its title, its name, its fields'
 * labels, leaving out those another form has too) than of any other's. "The return form below, with your order number
 * and what's wrong" is the return form, not the contact form. None when no form stands out.
 */
export function formMeant(text: string, forms: Action[]): Action | undefined {
  const said = wordsIn(text);
  const own = forms.map((f) => wordsIn(`${f.title} ${f.name.replace(/_/g, " ")} ${formFields(f).map((x) => x.label).join(" ")}`));
  const scores = own.map((words, i) => [...words].filter((w) => said.has(w) && !own.some((other, j) => j !== i && other.has(w))).length);
  const best = Math.max(0, ...scores);
  return best > 0 && scores.filter((s) => s === best).length === 1 ? forms[scores.indexOf(best)] : undefined;
}
