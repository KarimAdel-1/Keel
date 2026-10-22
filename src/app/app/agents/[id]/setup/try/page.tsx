import { ArrowRight, BookOpen, Check, MessagesSquare, Palette, SlidersHorizontal } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { lookOf } from "@/components/chat/look";
import { PageBar } from "@/components/shell/PageBar";
import { GoalsPicker } from "@/components/build/GoalsPicker";
import { SetupSteps } from "@/components/setup/SetupSteps";
import { goalStatus } from "@/platform/goals";
import { requireAgent } from "@/platform/session";
import { listSources } from "@/platform/store";

export const metadata: Metadata = { title: "Try your agent" };

export default async function SetupTryPage({ params }: PageProps<"/app/agents/[id]/setup/try">) {
  const { agent } = await requireAgent((await params).id);
  const base = `/app/agents/${agent.id}`;
  const name = agent.config.appearance.displayName;
  const ready = (await listSources(agent.id)).filter((s) => s.status === "ready").length;

  const done = [
    `Created ${name}`,
    ready ? `It knows ${ready} source${ready === 1 ? "" : "s"}` : "No knowledge yet: it will say it doesn't know",
  ];
  const next = [
    { href: `${base}/sources`, icon: BookOpen, text: "Add more of what it knows" },
    { href: `${base}/instructions`, icon: SlidersHorizontal, text: "Change how it behaves" },
    { href: base, icon: Palette, text: "Change how it looks and where it sits on your site" },
  ];

  return (
    <>
    <PageBar icon={<MessagesSquare className="size-[18px]" />} title="New agent" actions={<div className="hidden md:block"><SetupSteps current={4} /></div>} />
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_520px]">
        <div className="min-w-0 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">Try {name}</h1>
            <p className="mt-1.5 max-w-xl text-sm text-muted">
              Ask it what your customers ask. Under each answer you&apos;ll see the sources it used: click one to read the passage. Only you can see this chat.
            </p>
          </div>
          <ul className="space-y-2">
            {done.map((d, i) => (
              <li key={d} className="flex items-center gap-2.5 text-sm">
                <span className={`inline-flex size-5 items-center justify-center rounded-full ${i === 1 && !ready ? "bg-warn-tint text-warn" : "bg-good-tint text-good"}`}>
                  <Check className="size-3.5" />
                </span>
                {d}
              </li>
            ))}
          </ul>
          <div className="space-y-2">
            <p className="text-sm font-medium">What should it do? Switch on what your business needs.</p>
            <GoalsPicker agentId={agent.id} initial={await goalStatus(agent.id)} compact />
          </div>
          <div className="card divide-y divide-line">
            <p className="px-5 py-3 text-sm font-medium">Not quite right? You can change it any time.</p>
            {next.map(({ href, icon: Icon, text }) => (
              <Link key={href} href={href} className="flex items-center gap-3 px-5 py-3 text-sm text-muted transition hover:bg-panel-2 hover:text-text">
                <Icon className="size-4" /> <span className="flex-1">{text}</span> <ArrowRight className="size-4" />
              </Link>
            ))}
          </div>
          <Link href={base} className="btn btn-primary px-5 py-2.5">
            Done, open the playground <ArrowRight className="size-4" />
          </Link>
        </div>
        <ChatWindow agentId={agent.id} look={lookOf(agent.config.appearance)} endpoint={`/api/agents/${agent.id}/chat`} details subtitle="Test chat · only you can see it" className="h-[640px] max-h-[calc(100dvh-3rem)] rounded-2xl lg:sticky lg:top-6" />
      </div>
    </div>
    </>
  );
}
