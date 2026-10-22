// Every model call Keel makes, to NVIDIA Nemotron models on Nebius Token Factory (OpenAI-compatible API). What the
// real models taught us (1 Oct 2026) is built in:
// - Lightning and Nano get reasoning_effort "none", or they write their thinking into the reply.
// - Thinking counts against max_tokens, so a thinking model gets room for it on top of the answer's own limit, and a
//   reply cut off at the limit is tried once more with more room.
// - A structured answer's format goes in the system message, before the data, labelled as the answer's format: placed
//   after the data, Ultra took the schema for the data.
// - Invalid JSON gets one repair against the full schema, naming what the model wrote.
// Every call goes through LangChain (src/lib/langchain.ts) to Token Factory, through Keel's gateway (src/lib/gateway.ts).

import type OpenAI from "openai";
import { z } from "zod";
import type { ToolSpec } from "@/core/tools";
import { cacheEnabled, cacheKeyOf, throughGateway } from "./gateway";
import { asText, toLangChain, tokenFactoryModel, type PlainMessage } from "./langchain";
import { VISION_MODEL, costOf, modelFor, type ModelKey, type ModelSpec } from "./models";
import { setting } from "./settings";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface ChatOptions {
  /** What the call is for, in the usage meter (a structured call uses its schema's name). */
  task?: string;
  temperature?: number;
  /** How long the answer may be. A thinking model gets room for its thinking on top (THINKING_ROOM). */
  maxTokens?: number;
  /** Overrides the model's thinking, e.g. "none" for a one-word classification. */
  reasoning?: ModelSpec["reasoning"];
  signal?: AbortSignal;
}

export interface ChatResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** One model call, as the usage meter sees it. */
export interface ModelCall {
  task: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

const observers = ((globalThis as unknown as { __keelModelObservers?: Set<(call: ModelCall) => void | Promise<void>> }).__keelModelObservers ??= new Set());

/** Watches every model call (the token report, tests). Returns a function that stops watching. */
export function observeModelCalls(observer: (call: ModelCall) => void | Promise<void>): () => void {
  observers.add(observer);
  return () => observers.delete(observer);
}

/** Tells every watcher about a model call; one that fails (the usage record) never stops the reply. */
export function reportModelCall(call: ModelCall): void {
  for (const observer of observers) {
    void Promise.resolve()
      .then(() => observer(call))
      .catch((error: Error) => console.error(`Keel couldn't record a model call (${call.task}): ${error.message}`));
  }
}

/** Room for a model's thinking on top of the answer's own limit; only what's used is paid for. */
const THINKING_ROOM = 6000;

type ResponseFormat = { type: "json_object" } | { type: "json_schema"; json_schema: { name: string; schema: Record<string, unknown>; strict: boolean } };

const laneOf = (model: string) => `${setting("NEBIUS_BASE_URL")}|${model}`;

/** A call through the gateway: rate limits, retries and, for some calls, the cache. */
function guarded<T>(spec: ModelSpec, call: () => Promise<{ value: T; headers?: Headers }>, cacheKey?: string): Promise<T> {
  return throughGateway(laneOf(spec.id), call, cacheKey ? { cacheKey } : {});
}

const refusedReasoning = new Set<string>();

/**
 * Runs a call with the thinking it asks for; if the server refuses that level (HTTP 400 naming reasoning), the call
 * runs again with the model's usual thinking, and that level isn't asked of that model again.
 */
async function withReasoning<T>(spec: ModelSpec, options: ChatOptions, run: (options: ChatOptions) => Promise<T>): Promise<T> {
  const asked = options.reasoning;
  if (!asked || asked === spec.reasoning) return run(options);
  const key = `${spec.id}|${asked}`;
  if (refusedReasoning.has(key)) return run({ ...options, reasoning: spec.reasoning });
  try {
    return await run(options);
  } catch (error) {
    if ((error as { status?: number }).status !== 400 || !/reasoning/i.test(String((error as Error).message))) throw error;
    refusedReasoning.add(key);
    return run({ ...options, reasoning: spec.reasoning });
  }
}

/** The LangChain model for one call, with room for thinking and the call's response headers captured. */
function modelForCall(spec: ModelSpec, options: ChatOptions, answerRoom: number | undefined, onHeaders?: (h: Headers) => void) {
  const reasoning = options.reasoning ?? spec.reasoning;
  const thinks = reasoning !== "none";
  // Greedy decoding makes a model that thinks prone to loops (seen on the real models: Nemotron 3 Ultra grading at
  // temperature 0 thought on to its ceiling, again and again). NVIDIA's guidance for Nemotron with reasoning on is
  // temperature 0.6 and top-p 0.95, so a call asking a thinking model for temperature 0 gets those.
  const greedy = thinks && options.temperature === 0;
  return tokenFactoryModel(spec, {
    temperature: greedy ? 0.6 : options.temperature,
    ...(greedy ? { topP: 0.95 } : {}),
    maxTokens: answerRoom === undefined ? undefined : answerRoom + (thinks ? THINKING_ROOM : 0),
    reasoning,
    onHeaders,
  });
}

function complete(key: ModelKey, messages: ChatMessage[], options: ChatOptions, responseFormat?: ResponseFormat): Promise<ChatResult> {
  return withReasoning(modelFor(key), options, (o) => completeOnce(key, messages, o, responseFormat));
}

async function completeOnce(key: ModelKey, messages: ChatMessage[], options: ChatOptions, responseFormat?: ResponseFormat): Promise<ChatResult> {
  const spec = modelFor(key);
  const cacheable = cacheEnabled() && (options.temperature ?? 1) <= 0.3;
  const attempt = (answerRoom: number | undefined) => {
    let headers: Headers | undefined;
    const model = modelForCall(spec, options, answerRoom, (h) => (headers = h));
    const call = async () => {
      const ai = await model.invoke(toLangChain(messages), { signal: options.signal, ...(responseFormat ? { response_format: responseFormat } : {}) } as never);
      const inputTokens = ai.usage_metadata?.input_tokens ?? 0;
      const outputTokens = ai.usage_metadata?.output_tokens ?? 0;
      return {
        value: {
          text: stripReasoning(asText(ai.content)),
          model: spec.id,
          inputTokens,
          outputTokens,
          costUsd: costOf(spec, inputTokens, outputTokens),
          cutOff: (ai.response_metadata as { finish_reason?: string } | undefined)?.finish_reason === "length",
        },
        headers,
      };
    };
    const cacheKey = cacheable ? cacheKeyOf({ model: spec.id, messages, temperature: options.temperature, max_tokens: answerRoom, response_format: responseFormat, reasoning: options.reasoning ?? spec.reasoning }) : undefined;
    return guarded(spec, call, cacheKey);
  };
  const task = options.task ?? (responseFormat?.type === "json_schema" ? responseFormat.json_schema.name : "chat");
  const first = await attempt(options.maxTokens).catch((error: unknown) => {
    // A structured answer cut off at its ceiling can't be parsed, so it fails rather than coming back cut off: it's
    // asked again with more room, like any other cut-off answer.
    if (options.maxTokens !== undefined && /length limit was reached/i.test((error as Error)?.message ?? "")) return undefined;
    throw error;
  });
  if (!first) {
    const longer = await attempt(options.maxTokens! * 2);
    reportModelCall({ task: `${task} (retried longer)`, model: spec.id, inputTokens: longer.inputTokens, outputTokens: longer.outputTokens, costUsd: longer.costUsd });
    return withoutFlag(longer);
  }
  reportModelCall({ task, model: spec.id, inputTokens: first.inputTokens, outputTokens: first.outputTokens, costUsd: first.costUsd });
  if (!first.cutOff || options.maxTokens === undefined) return withoutFlag(first);
  const second = await attempt(options.maxTokens * 2);
  reportModelCall({ task: `${task} (retried longer)`, model: spec.id, inputTokens: second.inputTokens, outputTokens: second.outputTokens, costUsd: second.costUsd });
  return { ...withoutFlag(second), inputTokens: first.inputTokens + second.inputTokens, outputTokens: first.outputTokens + second.outputTokens, costUsd: first.costUsd + second.costUsd };
}

const withoutFlag = (r: ChatResult & { cutOff: boolean }): ChatResult => ({ text: r.text, model: r.model, inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: r.costUsd });

export function chat(key: ModelKey, messages: ChatMessage[], options: ChatOptions = {}): Promise<ChatResult> {
  return complete(key, messages, options);
}

/** A picture, as it's sent to the vision model. */
export interface Picture {
  data: Buffer;
  /** image/jpeg, image/png, image/webp or image/gif. */
  mime: string;
}

/**
 * A picture read by NVIDIA's vision model (VISION_MODEL), with `prompt` saying what to look for. The model thinks
 * first (kept apart from the answer), so the answer's own room comes on top of its thinking.
 */
export async function readPicture(prompt: string, picture: Picture, options: Pick<ChatOptions, "maxTokens" | "signal" | "task"> = {}): Promise<ChatResult> {
  const spec = VISION_MODEL;
  const url = `data:${picture.mime};base64,${picture.data.toString("base64")}`;
  let headers: Headers | undefined;
  const model = tokenFactoryModel(spec, { maxTokens: (options.maxTokens ?? 1000) + THINKING_ROOM, onHeaders: (h) => (headers = h) });
  const result = await guarded(spec, async () => {
    const ai = await model.invoke([{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url } }] }], { signal: options.signal } as never);
    const inputTokens = ai.usage_metadata?.input_tokens ?? 0;
    const outputTokens = ai.usage_metadata?.output_tokens ?? 0;
    return { value: { text: stripReasoning(asText(ai.content)), model: spec.id, inputTokens, outputTokens, costUsd: costOf(spec, inputTokens, outputTokens) }, headers };
  });
  reportModelCall({ task: options.task ?? "picture", model: spec.id, inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: result.costUsd });
  return result;
}

/**
 * A reply streamed as it's written: `onText` gets each new piece. Returns the whole reply with its cost. A reply cut
 * off at its length ceiling isn't left unfinished: the model is asked once to carry on from where it stopped, and the
 * rest streams after it.
 */
export async function chatStream(key: ModelKey, messages: AgentMessage[], options: ChatOptions & { onText: (piece: string) => void }): Promise<ChatResult> {
  // What streams is what's returned: one cleaner for the reply and its continuation.
  const visible = visibleStream(options.onText);
  const first = await withReasoning(modelFor(key), options, (o) => streamOnce(key, messages, { ...o, onText: visible.push }));
  if (!first.cutOff) return { ...withoutFlag(first), text: visible.end() };
  const carryOn: AgentMessage[] = [...messages, { role: "assistant", content: first.text }, { role: "user", content: "Your reply was cut off. Carry on exactly where you stopped, without repeating anything." }];
  const rest = await withReasoning(modelFor(key), options, (o) => streamOnce(key, carryOn, { ...o, task: `${options.task ?? "reply"} (continued)`, onText: visible.push }));
  return { text: visible.end(), model: first.model, inputTokens: first.inputTokens + rest.inputTokens, outputTokens: first.outputTokens + rest.outputTokens, costUsd: first.costUsd + rest.costUsd };
}

const THINK = "<think>";
const UNTHINK = "</think>";

/**
 * A streamed reply as the reader should see it, while it's written: reasoning traces in the content are held back and
 * dropped, and so is blank space at the start and the end. `end()` returns the whole visible reply.
 */
export function visibleStream(onText: (piece: string) => void): { push: (piece: string) => void; end: () => string } {
  let pending = "";
  let thinking = false;
  let shown = "";
  const show = (text: string) => {
    const piece = shown ? text : text.trimStart();
    if (!piece) return;
    shown += piece;
    onText(piece);
  };
  // How much of the end of `text` could still become `tag`.
  const partOf = (text: string, tag: string) => {
    for (let n = Math.min(tag.length - 1, text.length); n > 0; n--) if (tag.startsWith(text.slice(-n))) return n;
    return 0;
  };
  const release = (final: boolean) => {
    for (;;) {
      if (thinking) {
        const close = pending.indexOf(UNTHINK);
        if (close < 0) {
          const keep = final ? 0 : partOf(pending, UNTHINK);
          pending = keep ? pending.slice(-keep) : "";
          return;
        }
        pending = pending.slice(close + UNTHINK.length);
        thinking = false;
        continue;
      }
      const open = pending.indexOf(THINK);
      if (open >= 0) {
        show(pending.slice(0, open));
        pending = pending.slice(open + THINK.length);
        thinking = true;
        continue;
      }
      if (final) {
        show(pending.trimEnd());
        pending = "";
        return;
      }
      // Kept back: what could still become a tag, and blank space that may turn out to end the reply.
      const tag = partOf(pending, THINK);
      const ready = pending.slice(0, pending.length - tag).trimEnd();
      show(ready);
      pending = pending.slice(ready.length);
      return;
    }
  };
  return {
    push: (piece) => {
      pending += piece;
      release(false);
    },
    end: () => {
      release(true);
      // A trace without its opening tag shows only when it closes; the reply is what follows it.
      return stripReasoning(shown);
    },
  };
}

async function streamOnce(key: ModelKey, messages: AgentMessage[], options: ChatOptions & { onText: (piece: string) => void }): Promise<ChatResult & { cutOff: boolean }> {
  const spec = modelFor(key);
  let headers: Headers | undefined;
  const model = modelForCall(spec, options, options.maxTokens, (h) => (headers = h));
  const result = await guarded(spec, async () => {
    const stream = await model.stream(toLangChain(messages as PlainMessage[]), { signal: options.signal });
    let text = "";
    let usage = { input_tokens: 0, output_tokens: 0 };
    let finish: string | undefined;
    for await (const chunk of stream) {
      const piece = asText(chunk.content);
      if (piece) {
        text += piece;
        options.onText(piece);
      }
      if (chunk.usage_metadata) usage = { input_tokens: chunk.usage_metadata.input_tokens, output_tokens: chunk.usage_metadata.output_tokens };
      finish = (chunk.response_metadata as { finish_reason?: string } | undefined)?.finish_reason ?? finish;
    }
    return {
      value: { text: stripReasoning(text), model: spec.id, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, costUsd: costOf(spec, usage.input_tokens, usage.output_tokens), cutOff: finish === "length" },
      headers,
    };
  });
  reportModelCall({ task: options.task ?? "reply", model: spec.id, inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd: result.costUsd });
  return result;
}

export type AgentMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface ToolTurnResult {
  text: string;
  toolCalls: { id: string; name: string; arguments: string }[];
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export const toOpenAITools = (tools: ToolSpec[]) => tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } }));

/**
 * One step of an agent with tools (its actions), through LangChain's tool calling. Calls Nemotron writes as markup in
 * its reply instead become real calls.
 */
export async function chatWithTools(key: ModelKey, messages: AgentMessage[], tools: ToolSpec[], options: ChatOptions & { allowTools?: boolean } = {}): Promise<ToolTurnResult> {
  const step = (o: ChatOptions) => withReasoning(modelFor(key), o, (r) => toolStepOnce(key, messages, tools, { ...r, allowTools: options.allowTools }));
  const first = await step(options);
  // A step cut off at its ceiling (its answer unfinished, or its call's arguments) is asked again with twice the room.
  if (!first.cutOff || options.maxTokens === undefined) return first;
  const second = await step({ ...options, maxTokens: options.maxTokens * 2, task: `${options.task ?? "agent step"} (retried longer)` });
  return { ...second, inputTokens: first.inputTokens + second.inputTokens, outputTokens: first.outputTokens + second.outputTokens, costUsd: first.costUsd + second.costUsd };
}

async function toolStepOnce(key: ModelKey, messages: AgentMessage[], tools: ToolSpec[], options: ChatOptions & { allowTools?: boolean }): Promise<ToolTurnResult & { cutOff: boolean }> {
  const spec = modelFor(key);
  let headers: Headers | undefined;
  const model = modelForCall(spec, options, options.maxTokens, (h) => (headers = h));
  const runnable = tools.length && model.bindTools ? model.bindTools(toOpenAITools(tools), { tool_choice: options.allowTools === false ? "none" : "auto" } as never) : model;
  const result = await guarded(spec, async () => {
    const ai = (await runnable.invoke(toLangChain(messages as PlainMessage[]), { signal: options.signal })) as import("@langchain/core/messages").AIMessage;
    const calls = [
      ...(ai.tool_calls ?? []).map((c, i) => ({ id: c.id || `call_${Date.now().toString(36)}_${i}`, name: c.name, arguments: JSON.stringify(c.args ?? {}) })),
      // Arguments that weren't valid JSON still reach the action, which reports what's wrong.
      ...(ai.invalid_tool_calls ?? []).map((c, i) => ({ id: c.id || `bad_call_${Date.now().toString(36)}_${i}`, name: c.name ?? "", arguments: c.args ?? "{}" })),
    ];
    return {
      value: { text: stripReasoning(asText(ai.content)), toolCalls: calls, inputTokens: ai.usage_metadata?.input_tokens ?? 0, outputTokens: ai.usage_metadata?.output_tokens ?? 0, cutOff: (ai.response_metadata as { finish_reason?: string } | undefined)?.finish_reason === "length" },
      headers,
    };
  });
  const recovered = toolCallsInText(result.text);
  const toolCalls =
    !result.toolCalls.length && recovered.calls.length && options.allowTools !== false
      ? recovered.calls.map((c, i) => ({ id: `text_call_${Date.now().toString(36)}_${i}`, ...c }))
      : result.toolCalls;
  const costUsd = costOf(spec, result.inputTokens, result.outputTokens);
  reportModelCall({ task: options.task ?? "agent step", model: spec.id, inputTokens: result.inputTokens, outputTokens: result.outputTokens, costUsd });
  return { ...result, text: recovered.text, toolCalls, costUsd };
}

const TOOL_CALL_MARKUP = /<tool_call>\s*<function=([\w.-]+)>([\s\S]*?)<\/function>\s*<\/tool_call>/g;
const PARAMETER_MARKUP = /<parameter=([\w.-]+)>\n?([\s\S]*?)\n?<\/parameter>/g;

/** Tool calls a model wrote into its reply as Nemotron markup: the reply without them, and the calls. */
export function toolCallsInText(text: string): { text: string; calls: { name: string; arguments: string }[] } {
  if (!text.includes("<tool_call>")) return { text, calls: [] };
  const calls: { name: string; arguments: string }[] = [];
  let rest = text.replace(TOOL_CALL_MARKUP, (_, name: string, body: string) => {
    const args: Record<string, unknown> = {};
    for (const [, key, raw] of body.matchAll(PARAMETER_MARKUP)) {
      const value = raw.trim();
      try {
        args[key] = JSON.parse(value);
      } catch {
        args[key] = value;
      }
    }
    calls.push({ name, arguments: JSON.stringify(args) });
    return "";
  });
  const unfinished = rest.indexOf("<tool_call>");
  if (unfinished >= 0) rest = rest.slice(0, unfinished);
  return { text: rest.replace(/\n{3,}/g, "\n\n").trim(), calls };
}

/** The messages with the answer's JSON format in the system message, before the data, labelled as the format. */
export function withAnswerFormat(messages: ChatMessage[], jsonSchema: Record<string, unknown>): ChatMessage[] {
  const instruction = `## Your answer\nOne JSON object matching this JSON Schema, and nothing else. The schema describes your answer's format; it is not data to evaluate.\n${JSON.stringify(jsonSchema)}`;
  return messages[0]?.role === "system"
    ? [{ role: "system", content: `${messages[0].content}\n\n${instruction}` }, ...messages.slice(1)]
    : [{ role: "system", content: instruction }, ...messages];
}

/** A structured answer matching `schema`: strict JSON schema output, one repair if it doesn't fit. */
export async function chatJson<T>(key: ModelKey, messages: ChatMessage[], schema: z.ZodType<T>, schemaName: string, options: ChatOptions = {}): Promise<ChatResult & { data: T }> {
  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete jsonSchema.$schema;
  const withSchema = withAnswerFormat(messages, jsonSchema);
  const format = { type: "json_schema" as const, json_schema: { name: schemaName, schema: jsonSchema, strict: true } };
  const ask = async (msgs: ChatMessage[]) => {
    try {
      return await complete(key, msgs, options, format);
    } catch (error) {
      // A server that can't do strict JSON schema output, or a strict answer that ran past its ceiling even with more
      // room, still gets JSON once more, checked against the schema here.
      const cutOff = /length limit was reached/i.test((error as Error)?.message ?? "");
      if ((error as { status?: number }).status !== 400 && !cutOff) throw error;
      return complete(key, msgs, options, { type: "json_object" });
    }
  };
  const result = await ask(withSchema);
  const first = parseJson(result.text, schema);
  if (first.ok) return { ...result, data: first.data };
  const repair = await ask([
    ...withSchema,
    { role: "assistant", content: result.text },
    { role: "user", content: `That JSON doesn't fit the schema: ${first.error}. Return the whole corrected JSON object, every field, and nothing else.` },
  ]);
  const second = parseJson(repair.text, schema);
  if (!second.ok) throw new Error(`Model returned invalid ${schemaName} JSON: ${second.error}`);
  return { ...repair, inputTokens: result.inputTokens + repair.inputTokens, outputTokens: result.outputTokens + repair.outputTokens, costUsd: result.costUsd + repair.costUsd, data: second.data };
}

/** Removes reasoning traces some models put in the content field. */
export function stripReasoning(text: string): string {
  const withoutBlocks = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const danglingEnd = withoutBlocks.lastIndexOf("</think>");
  return (danglingEnd >= 0 ? withoutBlocks.slice(danglingEnd + "</think>".length) : withoutBlocks).trim();
}

function parseJson<T>(text: string, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; error: string } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, error: "no JSON object found" };
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
  const parsed = schema.safeParse(raw, { reportInput: true });
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: schemaProblems(parsed.error) };
}

/** What doesn't fit the schema, field by field, with the value the model wrote. */
export function schemaProblems(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => {
      const where = issue.path.length ? issue.path.join(".") : "the object";
      const input = (issue as { input?: unknown }).input;
      const got = input === undefined ? "nothing" : typeof input === "object" && input !== null ? (Array.isArray(input) ? "a list" : "an object") : JSON.stringify(input).slice(0, 80);
      return `${where}: ${issue.message} (got ${got})`;
    })
    .join("; ");
}
