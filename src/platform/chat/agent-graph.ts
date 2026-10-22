// An agent's turn with actions, as a LangGraph graph: "think" (the model answers, or chooses actions) and "act" (the
// actions run and their results go back to the model), looping until it answers. The limits are in the graph's
// edges: at most CALLS_PER_STEP actions a step, CALLS_PER_REPLY in a reply (after that the model must answer) and
// STEPS rounds; a call that already failed the same way isn't run again; a handover to a person ends the turn.
// Errors go back to the model compact, as the action's result; after FAILURES_IN_A_ROW failed calls it may only
// bring in the team (the actions that hand over or open a ticket), or answer.

import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { Action } from "@/core/actions";
import type { ChatWidget } from "@/core/widgets";
import { chatWithTools, type AgentMessage } from "@/lib/llm";
import type { ModelKey } from "@/lib/models";
import { compactResult } from "@/core/compact";
import type { ToolSpec } from "@/core/tools";
import { runAction, type ActionContext } from "../actions";

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
    if (!turn.toolCalls.length) return { text: turn.text, pending: [], costUsd: turn.costUsd };
    const batch = turn.toolCalls.slice(0, CALLS_PER_STEP);
    return {
      messages: [{ role: "assistant", content: turn.text || null, tool_calls: batch.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: c.arguments } })) } as AgentMessage],
      pending: batch,
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
    .addConditionalEdges("think", (state) => (state.pending.length ? "act" : END), ["act", END])
    .addConditionalEdges("act", (state) => (state.handedOver || state.steps >= STEPS ? END : "think"), ["think", END])
    .compile();

  return graph.invoke({ messages: input.messages }, { recursionLimit: STEPS * 2 + 4, signal: input.signal });
}
