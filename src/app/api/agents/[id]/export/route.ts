import { csvCell } from "@/platform/contacts";
import { apiAgent } from "@/platform/session";
import { conversationMessages, listConversations } from "@/platform/store";
import { listSubmissions } from "@/platform/submissions";

/** A CSV download: leads, collected data, or conversations with their messages. */
export async function GET(request: Request, { params }: RouteContext<"/api/agents/[id]/export">) {
  const access = await apiAgent((await params).id);
  if (access instanceof Response) return access;
  const kind = new URL(request.url).searchParams.get("kind");
  let rows: unknown[][] = [];
  let name = "export";
  if (kind === "leads" || kind === "data") {
    const subs = (await listSubmissions(access.agent.id, kind === "leads" ? ["lead"] : ["data", "form"], { limit: 10_000 }));
    const keys = [...new Set(subs.flatMap((s) => Object.keys(s.data)))];
    rows = [["date", "kind", ...keys, "conversation"], ...subs.map((s) => [s.createdAt, s.kind, ...keys.map((k) => s.data[k] ?? ""), s.conversationId ?? ""])];
    name = kind;
  } else {
    rows = [["conversation", "channel", "started", "role", "message", "time"]];
    for (const c of (await listConversations(access.agent.id, 1000))) for (const m of (await conversationMessages(c.id))) rows.push([c.id, c.channel, c.startedAt, m.role, m.content, m.createdAt]);
    name = "conversations";
  }
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${access.agent.name.replace(/[^\w-]+/g, "-")}-${name}.csv"` } });
}
