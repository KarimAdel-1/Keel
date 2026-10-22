import type { Metadata } from "next";
import { HostedChat } from "@/components/channel/HostedChat";
import { lookOf } from "@/components/chat/look";
import { CHAT_LAYOUTS, type ChatLayout } from "@/core/agents";
import { visitorAgent } from "@/platform/session";

export async function generateMetadata({ params }: PageProps<"/chat/[id]">): Promise<Metadata> {
  const agent = await visitorAgent((await params).id);
  return { title: agent?.enabled ? `Chat with ${agent.config.appearance.displayName}` : "Chat", robots: { index: false } };
}

/** The public chat page, and what the bubble, side panel and embedded window show inside a business's site. */
export default async function PublicChatPage({ params, searchParams }: PageProps<"/chat/[id]">) {
  const agent = await visitorAgent((await params).id);
  const embed = (await searchParams).embed;
  const layout = CHAT_LAYOUTS.find((l) => l === embed && l !== "page") as Exclude<ChatLayout, "page"> | undefined;
  if (!agent || !agent.enabled) {
    return (
      <main className="flex h-dvh items-center justify-center bg-panel p-6 text-center">
        <div>
          <p className="font-semibold">This chat isn&apos;t available right now.</p>
          <p className="mt-1 text-sm text-muted">Please try again later, or contact the business another way.</p>
        </div>
      </main>
    );
  }
  return <HostedChat agentId={agent.id} look={lookOf(agent.config.appearance)} embed={layout} />;
}
