import type { Metadata } from "next";
import { ChannelStudio } from "@/components/channel/ChannelStudio";
import { CHAT_LAYOUTS, type ChatLayout } from "@/core/agents";
import { publicUrl } from "@/lib/public-url";
import { listActions } from "@/platform/actions";
import { requireAgent } from "@/platform/session";
import { sourceSummary } from "@/platform/store";

export const metadata: Metadata = { title: "Try it" };

export default async function PlaygroundPage({ params, searchParams }: PageProps<"/app/agents/[id]">) {
  const { agent } = await requireAgent((await params).id);
  const asked = (await searchParams).channel;
  const channel = (CHAT_LAYOUTS as readonly string[]).includes(String(asked)) ? (asked as ChatLayout) : agent.config.appearance.layout;
  const actions = (await listActions(agent.id))
    .filter((a) => a.kind !== "followups")
    .map((a) => ({ id: a.id, title: a.title, name: a.name, kind: a.kind, enabled: a.enabled }));
  return <ChannelStudio agent={agent} sources={await sourceSummary(agent.id)} pageUrl={`${await publicUrl()}/chat/${agent.id}`} actions={actions} initialChannel={channel} />;
}
