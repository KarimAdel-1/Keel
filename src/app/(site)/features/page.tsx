import type { Metadata } from "next";
import { FEATURES, STAGES } from "@/components/site/features";
import { Band, CtaBand, LinkCards, PageHero, Pill } from "@/components/site/parts";
import { currentUser } from "@/platform/session";

export const metadata: Metadata = { title: "Features", description: "Every part of Keel, in the order you'll use it: build, test, launch and improve." };

export default async function FeaturesPage() {
  const user = await currentUser();
  const start = user ? "/app" : "/signup";
  return (
    <>
      <PageHero
        eyebrow="Features"
        title="Every part of Keel, in the order you'll use it"
        intro="Build an agent from what you already have, test every answer, put it on your website, and make it better with proof. Each part works on its own and with the others."
        actions={<Pill href={start}>{user ? "Open your dashboard" : "Try it for free"}</Pill>}
      />
      {STAGES.map(({ stage, text }, i) => (
        <Band key={stage} grey={i % 2 === 0} className="py-20">
          <div className="mb-10 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[30px] font-normal tracking-[-0.02em] sm:text-[36px]">
              <span className="mr-3 text-[#2348d8]">{i + 1}</span>
              {stage}
            </h2>
            <p className="text-[15px] text-[#5b5f66]">{text}</p>
          </div>
          <LinkCards items={FEATURES.filter((f) => f.stage === stage).map(({ icon: Icon, ...f }) => ({ href: `/features/${f.slug}`, title: f.name, text: f.summary, icon: <Icon className="size-5" /> }))} />
        </Band>
      ))}
      <CtaBand start={start} signedIn={Boolean(user)} />
    </>
  );
}
