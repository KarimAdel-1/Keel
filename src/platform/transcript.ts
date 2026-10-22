// A stored conversation as the transcript component draws it, with what each answer kept in its meta.

import type { TranscriptMessage } from "@/components/dashboard/Transcript";
import type { ChatWidget } from "@/core/widgets";
import type { ActionCall, Citation } from "./chat/answer";
import type { Message } from "./store";

export function toTranscript(messages: Message[]): TranscriptMessage[] {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
    citations: (m.meta.citations as Citation[] | undefined) ?? [],
    ...(typeof m.meta.model === "string" ? { model: m.meta.model } : {}),
    ...(typeof m.meta.tokens === "number" ? { tokens: m.meta.tokens } : {}),
    ...(m.meta.kept === true ? { kept: true } : {}),
    ...(typeof m.meta.confidence === "number" ? { confidence: m.meta.confidence } : {}),
    ...(Array.isArray(m.meta.actions) && m.meta.actions.length ? { actions: m.meta.actions as ActionCall[] } : {}),
    ...(Array.isArray(m.meta.widgets) && m.meta.widgets.length ? { widgets: m.meta.widgets as ChatWidget[] } : {}),
    ...((m.meta.procedure as { name?: string } | undefined)?.name ? { procedure: (m.meta.procedure as { name: string }).name } : {}),
    ...(typeof m.meta.author === "string" ? { author: m.meta.author } : {}),
    ...(typeof m.meta.blockedBy === "string" ? { blockedBy: m.meta.blockedBy } : {}),
  }));
}
