import type { Metadata } from "next";
import { Band, CtaBand, LinkCards, PageHero, Pill } from "@/components/site/parts";
import { USE_CASES } from "@/components/site/use-cases";
import { currentUser } from "@/platform/session";

export const metadata: Metadata = { title: "Use cases", description: "The jobs businesses give their Keel agent, and how to set each one up." };

export default async function UseCasesPage() {
  const user = await currentUser();
  const start = user ? "/app" : "/signup";
  return (
    <>
      <PageHero
        eyebrow="Use cases"
        title="One agent, many jobs"
        intro="Answer customers, win new ones, look up orders, help people get started, or answer your own team's questions. Each use case shows what the agent takes care of, how to set it up in Keel, and a test to check it."
        actions={<Pill href={start}>{user ? "Open your dashboard" : "Try it for free"}</Pill>}
      />
      <Band grey>
        <LinkCards items={USE_CASES.map(({ icon: Icon, ...u }) => ({ href: `/use-cases/${u.slug}`, title: u.name, text: u.summary, icon: <Icon className="size-5" /> }))} />
      </Band>
      <CtaBand start={start} signedIn={Boolean(user)} />
    </>
  );
}
