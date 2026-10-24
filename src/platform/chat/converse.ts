// One turn of a conversation, wherever it happens (the builder's test chat, the website, the API, a test run): the
// question is stored, the agent replies from the conversation so far, and the reply is stored with where it came
// from, what it did and the tokens it used (every model call in a turn is metered for the agent, src/platform/
// usage.ts). A conversation a person has taken over gets no reply from the agent; a paused one (spam) gets none
// either. With the agent's NVIDIA NeMo Guardrails on, the customer's message is checked before the agent answers (a
// blocked one gets the agent's "can't help with that" message), and, if asked, the reply before the customer sees
// it (it then arrives whole).

import type { Agent, ChatLayout } from "@/core/agents";
import { searchQuery } from "@/core/context";
import { SELF_HARM_REPLY, speaksOfSelfHarm } from "@/core/safety";
import { db } from "@/lib/db";
import type { Picture } from "@/lib/llm";
import { json } from "@/lib/rows";
import { modelFor } from "@/lib/models";
import { checkRails, type RailType } from "@/lib/rails";
import { setting } from "@/lib/settings";
import { customerReplied } from "../helpdesk";
import { withPhoto } from "../pictures";
import { activeProcedure, setActiveProcedure } from "../procedures";
import { MESSAGING_CHANNELS, addMessage, conversationAgent, conversationMessages, startConversation, type Channel } from "../store";
import { metered, type Meter } from "../usage";
import { inPieces, reply, type Reply, type ReplyOptions, type Turn } from "./answer";
import { startQuestionEmbedding } from "./retrieve";
import { SPAM_CHECKS, checkSpam } from "./spam";

/** The longest message a person can send. */
export const MAX_MESSAGE_CHARS = 4000;

export const PAUSED_MESSAGE = "This conversation has been paused.";
export interface TurnResult {
  conversationId: string;
  reply: Reply;
  /** Why the agent didn't answer with the model, if it didn't. */
  status: "answered" | "with_team" | "paused" | "blocked";
  /** Tokens the turn used (0 for an answer kept from before). */
  tokens: number;
}

const quiet = (agent: Agent, text: string): Reply => ({
  text,
  citations: [],
  model: agent.config.model === "auto" ? "lightning" : agent.config.model,
  costUsd: 0,
  usedMeaning: false,
  confidence: 0,
  actions: [],
  widgets: [],
  followups: [],
  handedOver: false,
});

export async function conversationStatus(conversationId: string): Promise<string | undefined> {
  return ((await db().prepare("SELECT status FROM conversations WHERE id = ?").get(conversationId)) as { status?: string } | undefined)?.status;
}

async function setConversationMeta(conversationId: string, patch: Record<string, unknown>): Promise<void> {
  const row = (await db().prepare("SELECT meta FROM conversations WHERE id = ?").get(conversationId)) as { meta?: string } | undefined;
  await db().prepare("UPDATE conversations SET meta = ? WHERE id = ?").run(JSON.stringify({ ...json<Record<string, unknown>>(row?.meta, {}), ...patch }), conversationId);
}

type TurnInput = {
  agent: Agent;
  channel: Channel;
  /** The chat's layout, for its own instructions. */
  layout?: ChatLayout;
  /** Continue this conversation, if it belongs to the agent; otherwise a new one starts. */
  conversationId?: string;
  message: string;
  onText?: (piece: string) => void;
  /** Called as soon as the conversation is known, before the reply. */
  onStart?: (conversationId: string) => void;
  signal?: AbortSignal;
  /** A test run: actions don't run for real and nothing is shown to anyone. */
  test?: ReplyOptions["test"];
  /** A version of the agent being tried before it's saved. */
  draft?: ReplyOptions["draft"];
  /** What the reply is for, in the usage record (a security scan's attacks). */
  purpose?: "security";
  /** Where the visitor is (their country code), when the host reports it. */
  country?: string;
  /** The random id the visitor's browser keeps: only that browser can open the conversation again (on another page). */
  visitor?: string;
  /** A photo the customer sent with the message: what it shows is written into the message (src/platform/pictures.ts). */
  picture?: Picture;
};

export function converse(input: TurnInput): Promise<TurnResult> {
  const kind = input.purpose ?? (input.draft ? "improve" : input.test ? "test" : "reply");
  return metered({ workspaceId: input.agent.workspaceId, agentId: input.agent.id, kind }, (meter) => turn(input, meter));
}

async function turn(input: TurnInput, meter: Meter): Promise<TurnResult> {
  const { agent } = input;
  const typed = input.message.trim().slice(0, MAX_MESSAGE_CHARS);
  const message = input.picture ? await withPhoto(agent, typed, input.picture, input.signal) : typed;
  const continuing = input.conversationId && (await conversationAgent(input.conversationId)) === agent.id ? input.conversationId : undefined;
  const conversationId = continuing ?? (await startConversation(agent.id, input.channel, { ...(input.country ? { country: input.country } : {}), ...(input.visitor ? { visitor: input.visitor } : {}) }));
  input.onStart?.(conversationId);

  const earlier = continuing ? await conversationMessages(conversationId) : [];
  const history: Turn[] = earlier.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
  await addMessage(conversationId, { role: "user", content: message });

  const status = await conversationStatus(conversationId);
  if (status === "paused") return { conversationId, reply: quiet(agent, PAUSED_MESSAGE), status: "paused", tokens: meter.inputTokens + meter.outputTokens };
  if (status === "handed_off") {
    await customerReplied(conversationId);
    return { conversationId, reply: quiet(agent, ""), status: "with_team", tokens: meter.inputTokens + meter.outputTokens };
  }
  // The meaning of what the agent will search for is worked out now, while the spam and guardrail checks run: Token
  // Factory's embeddings take from a fraction of a second to several, and this way the search rarely waits for one.
  startQuestionEmbedding(searchQuery(message, history));

  const spam = agent.config.protection.spam;
  const visitorMessages = [...earlier.filter((m) => m.role === "user").map((m) => m.content), message];
  if (spam.enabled && !input.test && SPAM_CHECKS.has(visitorMessages.length)) {
    const verdict = await checkSpam(spam.definition, visitorMessages);
    if (verdict.spam) {
      await db().prepare("UPDATE conversations SET status = 'paused' WHERE id = ?").run(conversationId);
      await setConversationMeta(conversationId, { pausedFor: verdict.reason });
      return { conversationId, reply: quiet(agent, PAUSED_MESSAGE), status: "paused", tokens: meter.inputTokens + meter.outputTokens };
    }
  }

  const rails = agent.config.protection.nemo;
  const railsOn = rails.enabled && setting("KEEL_RAILS");
  if (railsOn && rails.input) {
    const check = await guard(agent, "input", message);
    if (check.blocked) {
      // Someone who speaks of harming themselves is answered with care and pointed to help, not told "I can't help".
      const said = speaksOfSelfHarm(message) ? SELF_HARM_REPLY : rails.blockedMessage;
      await addMessage(conversationId, { role: "assistant", content: said, meta: { blockedBy: check.rail ?? "self check input" } });
      input.onText?.(said);
      return { conversationId, reply: quiet(agent, said), status: "blocked", tokens: meter.inputTokens + meter.outputTokens };
    }
  }
  // With the output rail on, the reply is checked whole before the customer sees any of it.
  const checkOutput = railsOn && rails.output;

  const answer = await reply(agent, history, message, {
    onText: checkOutput ? undefined : input.onText,
    signal: input.signal,
    conversationId,
    channel: input.layout,
    messaging: (MESSAGING_CHANNELS as string[]).includes(input.channel),
    activeProcedureId: await activeProcedure(conversationId),
    test: input.test,
    draft: input.draft,
  });
  let blockedReply: string | undefined;
  if (checkOutput) {
    const check = await guard(agent, "output", message, answer.text);
    answer.costUsd += check.costUsd;
    if (check.blocked && !answer.handedOver) {
      blockedReply = check.rail ?? "self check output";
      answer.text = rails.blockedMessage;
      answer.citations = [];
      answer.widgets = [];
      answer.followups = [];
    }
    for (const piece of inPieces(answer.text)) input.onText?.(piece);
  }
  await setActiveProcedure(conversationId, answer.procedure?.id);
  await addMessage(conversationId, {
    role: "assistant",
    content: answer.text,
    costUsd: answer.costUsd,
    meta: {
      citations: answer.citations,
      model: modelFor(answer.model).id,
      ...(answer.kept ? { kept: true } : { tokens: meter.inputTokens + meter.outputTokens }),
      usedMeaning: answer.usedMeaning,
      confidence: answer.confidence,
      ...(answer.actions.length ? { actions: answer.actions } : {}),
      ...(answer.widgets.length ? { widgets: answer.widgets } : {}),
      ...(answer.procedure ? { procedure: answer.procedure } : {}),
      ...(answer.followups.length ? { followups: answer.followups } : {}),
      ...(blockedReply ? { blockedBy: blockedReply } : {}),
    },
  });
  return { conversationId, reply: answer, status: blockedReply ? "blocked" : "answered", tokens: meter.inputTokens + meter.outputTokens };
}

/**
 * The agent's NeMo Guardrails on a message or a reply. When NeMo Guardrails can't run, the chat goes on (the
 * Guardrails page shows why): a guardrail outage shouldn't take the agent down with it.
 */
async function guard(agent: Agent, type: RailType, message: string, replyText?: string): Promise<{ blocked: boolean; rail?: string; costUsd: number }> {
  try {
    const check = await checkRails(agent, type, message, replyText);
    return { blocked: check.status === "blocked", ...(check.rail ? { rail: check.rail } : {}), costUsd: check.costUsd };
  } catch {
    return { blocked: false, costUsd: 0 };
  }
}
