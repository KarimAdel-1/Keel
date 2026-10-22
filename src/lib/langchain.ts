// Keel's models as LangChain chat models. Every model call goes through LangChain: Nemotron on Token Factory is
// LangChain's OpenAI chat model pointed at Token Factory's OpenAI-compatible API. Conversions between Keel's message
// shape (the OpenAI one) and LangChain's live here too.

import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { ModelSpec } from "./models";
import { setting } from "./settings";

/** A message as Keel writes it (the OpenAI chat shape). */
export type PlainMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null | unknown;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

const asText = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part) => (typeof part === "string" ? part : (part as { text?: string })?.text ?? "")).join("")
      : "";

/** Keel's messages as LangChain messages. */
export function toLangChain(messages: PlainMessage[]): BaseMessage[] {
  return messages.map((m) => {
    const content = asText(m.content);
    switch (m.role) {
      case "system":
        return new SystemMessage(content);
      case "user":
        return new HumanMessage(content);
      case "tool":
        return new ToolMessage({ content, tool_call_id: m.tool_call_id ?? "" });
      default:
        return new AIMessage({
          content,
          tool_calls: (m.tool_calls ?? []).map((c) => {
            let args: Record<string, unknown> = {};
            try {
              args = JSON.parse(c.function.arguments || "{}");
            } catch {
              args = {};
            }
            return { id: c.id, name: c.function.name, args, type: "tool_call" as const };
          }),
        });
    }
  });
}

export interface ModelOptions {
  temperature?: number;
  maxTokens?: number;
  reasoning?: ModelSpec["reasoning"];
  /** Receives the response headers of each call (Token Factory's rate-limit counters). */
  onHeaders?: (headers: Headers) => void;
  /** Nucleus sampling, for the calls that set it. */
  topP?: number;
}

/** Nemotron on Token Factory, as LangChain's OpenAI chat model. Retries are Keel's gateway's job, not LangChain's. */
export function tokenFactoryModel(spec: ModelSpec, options: ModelOptions = {}): ChatOpenAI {
  const apiKey = setting("NEBIUS_API_KEY");
  if (!apiKey) throw new Error("NEBIUS_API_KEY is not set (see .env.example)");
  const onHeaders = options.onHeaders;
  return new ChatOpenAI({
    model: spec.id,
    apiKey,
    temperature: options.temperature,
    ...(options.topP !== undefined ? { topP: options.topP } : {}),
    maxTokens: options.maxTokens,
    maxRetries: 0,
    timeout: 120_000,
    streamUsage: true,
    useResponsesApi: false,
    // Sent as is: Token Factory reads reasoning_effort for every Nemotron model.
    ...(options.reasoning ? { modelKwargs: { reasoning_effort: options.reasoning } } : {}),
    configuration: {
      baseURL: setting("NEBIUS_BASE_URL"),
      ...(onHeaders
        ? {
            fetch: async (url: RequestInfo | URL, init?: RequestInit) => {
              const res = await fetch(url, init);
              onHeaders(res.headers);
              return res;
            },
          }
        : {}),
    },
  });
}

export { asText };
