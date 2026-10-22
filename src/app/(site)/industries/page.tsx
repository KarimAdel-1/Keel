import type { Metadata } from "next";
import { INDUSTRY_PAGES, SITE_INDUSTRIES } from "@/components/site/industries";
import { Band, CtaBand, LinkCards, PageHero, Pill } from "@/components/site/parts";
import { INDUSTRY_PRESETS } from "@/core/industries";
import { currentUser } from "@/platform/session";

export const metadata: Metadata = { title: "Industries", description: "Keel starts your agent with a role, a greeting and the questions customers ask most, written for your kind of business." };

export default async function IndustriesPage() {
  const user = await currentUser();
  const start = user ? "/app" : "/signup";
  return (
    <>
      <PageHero
        eyebrow="Industries"
        title="A head start for your kind of business"
        intro={`Pick one of ${SITE_INDUSTRIES.length} industries and your agent starts with a role, a greeting and the questions people ask most, written for that kind of business. Or pick "Something else" and start from your website alone.`}
        actions={<Pill href={start}>{user ? "Open your dashboard" : "Try it for free"}</Pill>}
      />
      <Band grey>
        <LinkCards
          items={SITE_INDUSTRIES.map((slug) => {
            const Icon = INDUSTRY_PAGES[slug].icon;
            const preset = INDUSTRY_PRESETS[slug];
            return { href: `/industries/${slug}`, title: preset.label, text: `${preset.examples}. People ask: “${preset.suggestions[0]}”`, icon: <Icon className="size-5" /> };
          })}
        />
      </Band>
      <CtaBand start={start} signedIn={Boolean(user)} />
    </>
  );
}
