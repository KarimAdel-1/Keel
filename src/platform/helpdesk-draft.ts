// A reply for the team to send, drafted from the conversation and the agent's knowledge. The person reads it, changes
// what they like and sends it; nothing is sent for them.

import { z } from "zod";
import type { Agent } from "@/core/agents";
import { chatJson } from "@/lib/llm";
import { ROLE_MODEL } from "@/lib/models";
import { REFERENCE_RULE, reference } from "@/lib/untrusted";
import { findPassages } from "./chat/retrieve";
import { getTicket, type Ticket } from "./helpdesk";
import { conversationMessages, getAgent } from "./store";
import { metered } from "./usage";

const Draft = z.object({ reply: z.string().max(4000) });
const SCHEMA = "team_reply_draft";

export async function draftTeamReply(ticketId: string, authorName: string): Promise<string> {
  const ticket = await getTicket(ticketId);
  const agent = ticket ? await getAgent(ticket.agentId) : undefined;
  if (!ticket || !agent) return "";
  return metered({ workspaceId: agent.workspaceId, agentId: agent.id, kind: "draft" }, () => draft(ticket, agent, authorName));
}

async function draft(ticket: Ticket, agent: Agent, authorName: string): Promise<string> {
  const messages = ticket.conversationId ? (await conversationMessages(ticket.conversationId)).filter((m) => m.role !== "system") : [];
  const transcript = messages.map((m) => `${m.role === "user" ? "Customer" : m.role === "human" ? "Team" : "Assistant"}: ${m.content}`).join("\n").slice(-6000);
  const lastQuestion = [...messages].reverse().find((m) => m.role === "user")?.content ?? ticket.summary;
  const found = await findPassages(agent.id, lastQuestion);
  const result = await chatJson(
    ROLE_MODEL.writer,
    [
      {
        role: "system",
        content: [
          `Draft the next reply from ${authorName} on ${agent.name}'s team to this customer. Warm, brief, specific; use only facts from the knowledge or the conversation; never promise what they don't support. Sign off with the first name ${authorName.split(" ")[0]}.`,
          REFERENCE_RULE,
          reference("ticket", `${ticket.subject}\n${ticket.summary}`),
          reference("conversation", transcript || "(no messages)"),
          reference("knowledge", found.passages.map((p) => `${p.title}: ${p.text}`).join("\n\n").slice(0, 6000) || "(nothing relevant)"),
        ].join("\n"),
      },
      { role: "user", content: "The draft." },
    ],
    Draft,
    SCHEMA,
    { temperature: 0.4, maxTokens: 800 },
  );
  return result.data.reply;
}
