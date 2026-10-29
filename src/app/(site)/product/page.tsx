import { BadgeCheck, History, Lock, ShieldCheck, TestTubes, Wand2 } from "lucide-react";
import type { Metadata } from "next";
import { HeroVisual } from "@/components/landing/visuals";
import { Band, BuiltOn, CtaBand, LinkCards, PageHero, Pill, Points, SectionTitle, StepNumber } from "@/components/site/parts";
import { StageGrid } from "@/components/site/StageGrid";
import { USE_CASES } from "@/components/site/use-cases";
import { currentUser } from "@/platform/session";

export const metadata: Metadata = { title: "Product overview", description: "Build, test, launch and improve an AI agent for your business, in one place." };

/** What happens to every customer message, in the order the customer agent's graph runs it. */
const EVERY_MESSAGE = [
  { title: "Check", text: "NVIDIA NeMo Guardrails checks the message against your rules. A message limit and a spam check keep floods and spam out." },
  { title: "Recall", text: "The agent reads the conversation so far, and where it is in a step-by-step guide." },
  { title: "Search", text: "Your knowledge is searched by meaning and by keywords for the passages that answer it." },
  { title: "Choose a guide", text: "When one of your step-by-step guides could apply, a fast model decides whether it does." },
  { title: "Answer", text: "Your chosen Nemotron model answers from those passages, citing them, and calls your actions when they fit." },
  { title: "Suggest", text: "A few questions the customer may ask next, as one-tap buttons, if you've turned them on." },
];

export default async function ProductPage() {
  const user = await currentUser();
  const start = user ? "/app" : "/signup";
  return (
    <>
      <PageHero
        eyebrow="Product overview"
        title="Build, test, launch and improve an AI agent, in one place"
        intro="Keel turns your website and documents into an agent that answers your customers on your website and in their messaging apps, does things for them, and hands over to your team when it should. You test every answer before launch, and every change after."
        actions={
          <>
            <Pill href={start}>{user ? "Open your dashboard" : "Try it for free"}</Pill>
            <Pill href="/technology" variant="outline">
              How it&apos;s built
            </Pill>
          </>
        }
        visual={<HeroVisual />}
        footer={<BuiltOn />}
      />

      <Band grey>
        <SectionTitle title="Four stages, one product" text="Each part of Keel, in the order you'll use it. Open any of them to see what it does." />
        <div className="mt-14">
          <StageGrid />
        </div>
      </Band>

      <Band>
        <SectionTitle title="What happens on every message" text="Each customer message runs the same steps, in this order, before the reply appears." />
        <ol className="mx-auto mt-14 grid max-w-[1040px] gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {EVERY_MESSAGE.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <StepNumber n={i + 1} />
              <div>
                <h3 className="text-[16px] font-medium tracking-[-0.01em]">{s.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-[#5b5f66]">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Band>

      <Band grey>
        <SectionTitle title="Proof at every step" text="Keel doesn't ask you to trust the agent. It shows you, with your own information as the measure." />
        <div className="mx-auto mt-12 max-w-[1100px]">
          <LinkCards
            items={[
              { href: "/features/testing", title: "Tests with AI customers", text: "Judges check every fact the agent gives against your information. Any wrong fact fails the test.", icon: <TestTubes className="size-5" /> },
              { href: "/features/quality", title: "A blind quality grade", text: "Answers graded out of 10 next to the best answer Keel can give. The tests and the judges are checked too.", icon: <BadgeCheck className="size-5" /> },
              { href: "/features/improve", title: "Fixes with proof", text: "A fix is kept only when fresh runs show it fixes failures without breaking what passes.", icon: <Wand2 className="size-5" /> },
            ]}
          />
        </div>
      </Band>

      <Band>
        <SectionTitle title="You stay in control" />
        <div className="mx-auto mt-12 max-w-[1100px]">
          <Points
            items={[
              { title: "Only what you give it", text: "The agent answers from your knowledge, and says so when it doesn't know.", icon: <Lock className="size-5" /> },
              { title: "Nothing changes behind your back", text: "Improvements and the Copilot's proposals wait for you to apply them.", icon: <Wand2 className="size-5" /> },
              { title: "Every change is a version", text: "See what changed and when, and restore any earlier version.", icon: <History className="size-5" /> },
              { title: "Guarded and tested", text: "NeMo Guardrails on every message, and garak attacks before launch.", icon: <ShieldCheck className="size-5" /> },
            ]}
            columns={4}
          />
        </div>
      </Band>

      <Band grey>
        <SectionTitle title="What businesses use it for" />
        <div className="mx-auto mt-12 max-w-[1100px]">
          <LinkCards items={USE_CASES.map(({ icon: Icon, ...u }) => ({ href: `/use-cases/${u.slug}`, title: u.name, text: u.summary, icon: <Icon className="size-5" /> }))} />
        </div>
      </Band>

      <CtaBand start={start} signedIn={Boolean(user)} />
    </>
  );
}
