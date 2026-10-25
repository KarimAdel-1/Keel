import { AppWindow, CircleAlert, Code2, ExternalLink, Maximize2, MessageCircle, PanelRight, Radio, ScanSearch, Settings2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CopyCode } from "@/components/channel/CopyCode";
import { PageBar, PageBody } from "@/components/shell/PageBar";
import { Pill } from "@/components/ui";
import { CHAT_LAYOUTS, LAYOUT_INFO, type ChatLayout } from "@/core/agents";
import { publicUrl } from "@/lib/public-url";
import { requireAgent } from "@/platform/session";

export const metadata: Metadata = { title: "On your website" };

const ICON: Record<ChatLayout, typeof MessageCircle> = { bubble: MessageCircle, panel: PanelRight, focus: ScanSearch, inline: AppWindow, page: Maximize2 };

const WHERE: Record<ChatLayout, string> = {
  bubble: "Paste it just before </body> on every page where the bubble should appear.",
  panel: "Paste it just before </body> on every page where the side panel should appear.",
  focus: "Paste it just before </body>. Change data-label to the words on the button.",
  inline: "Put the empty box where the chat should sit, and the script anywhere after it. Change the height to fit your page.",
  page: "Share this link anywhere: in emails, on social media, in a QR code. It opens the chat on a page of its own.",
};

/**
 * Deploy › Channels: every way to put the agent in front of customers. The five chat layouts, each with what to paste
 * or the link to share and a way to change its look, and the REST API for your own systems.
 */
export default async function ChannelsPage({ params }: PageProps<"/app/agents/[id]/channels">) {
  const { agent, workspace } = await requireAgent((await params).id);
  const origin = await publicUrl();
  const script = (layout: ChatLayout, extra = "") => `<script src="${origin}/embed.js" data-agent="${agent.id}" data-layout="${layout}"${extra} defer></script>`;
  const code: Record<ChatLayout, string> = {
    bubble: script("bubble"),
    panel: script("panel"),
    focus: script("focus", ' data-label="Ask a question"'),
    inline: `<div data-keel-chat style="height: 600px"></div>\n${script("inline")}`,
    page: `${origin}/chat/${agent.id}`,
  };
  const curl = `curl ${origin}/api/v1/agents/${agent.id}/chat \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Do you ship abroad?"}'`;

  return (
    <>
      <PageBar icon={<Radio className="size-[18px]" />} title="On your website" />
      <PageBody>
        <p className="max-w-2xl text-sm text-muted">
          Put {agent.config.appearance.displayName} in front of customers in any of these ways, or several at once. Each can have its own look and instructions; every conversation shows up in Conversations.
        </p>
        {!agent.enabled && (
          <div className="flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-tint px-4 py-3 text-sm text-warn">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              {agent.name} is off, so visitors see &ldquo;This chat isn&apos;t available right now.&rdquo;{" "}
              <Link href={`/app/agents/${agent.id}/settings`} className="font-medium underline">
                Turn it on in Settings
              </Link>
              .
            </p>
          </div>
        )}
        <div className="grid gap-5 xl:grid-cols-2">
          {CHAT_LAYOUTS.map((layout) => {
            const Icon = ICON[layout];
            const main = agent.config.appearance.layout === layout;
            const own = agent.config.channels?.[layout]?.syncInstructions === false;
            return (
              <section key={layout} className="card flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-panel-2">
                    <Icon className="size-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                      {LAYOUT_INFO[layout].name} {main && <Pill tone="neutral">Main</Pill>} {own && <Pill>Own instructions</Pill>}
                    </h2>
                    <p className="mt-0.5 text-sm text-muted">{LAYOUT_INFO[layout].text}</p>
                  </div>
                </div>
                <div className="mt-4 flex-1">
                  <CopyCode code={code[layout]} label={layout === "page" ? "Copy link" : "Copy code"} />
                </div>
                <p className="mt-3 text-xs text-muted">{WHERE[layout]}</p>
                <div className="mt-4 flex gap-2">
                  <Link href={`/app/agents/${agent.id}?channel=${layout}`} className="btn btn-secondary px-3 py-1.5 text-xs">
                    <Settings2 className="size-3.5" /> Manage
                  </Link>
                  {layout === "page" && (
                    <a href={code.page} target="_blank" rel="noopener noreferrer" className="btn btn-secondary px-3 py-1.5 text-xs">
                      <ExternalLink className="size-3.5" /> Open
                    </a>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <section className="card p-5">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-panel-2">
              <Code2 className="size-[18px]" />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold">REST API</h2>
              <p className="mt-0.5 text-sm text-muted">
                Talk to the agent from your own app, backend or tools. Send back the <code className="font-mono text-xs">conversationId</code> it returns to continue a conversation; add{" "}
                <code className="font-mono text-xs">&quot;stream&quot;: true</code> to get the reply as it&apos;s written.
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-4">
            <CopyCode code={curl} />
            <div>
              <p className="label">Keys for {workspace.name}</p>
              <Link href="/app/workspace#api-keys" className="btn btn-secondary">Manage API keys in Workspace settings</Link>
            </div>
          </div>
        </section>
      </PageBody>
    </>
  );
}
