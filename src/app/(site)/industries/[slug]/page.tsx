import { CircleCheck, Hand, MessageCircleQuestion, UserRound, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { INDUSTRY_PAGES, SITE_INDUSTRIES, isSiteIndustry, type SiteIndustry } from "@/components/site/industries";
import { Band, CtaBand, IconTile, LinkCards, PageHero, Pill, SectionTitle } from "@/components/site/parts";
import { USE_CASES } from "@/components/site/use-cases";
import { IndustryPicture, WithName } from "@/components/site/visuals";
import { GOALS, INDUSTRY_GOALS } from "@/core/goals";
import { INDUSTRY_PRESETS } from "@/core/industries";
import { currentUser } from "@/platform/session";

export const dynamicParams = false;
export const generateStaticParams = () => SITE_INDUSTRIES.map((slug) => ({ slug }));

const titleOf = (slug: SiteIndustry) => (slug === "internal" ? "An AI agent for your own team" : `An AI agent for ${INDUSTRY_PRESETS[slug].label.toLowerCase()}`);

/** "Online shops and stores" as part of a sentence; names like "SaaS" and "B2B" stay as written. */
const inSentence = (text: string) => (/^[A-Z][a-z]*\b/.test(text) ? text[0].toLowerCase() + text.slice(1) : text);

export async function generateMetadata({ params }: PageProps<"/industries/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return isSiteIndustry(slug) ? { title: INDUSTRY_PRESETS[slug].label, description: `${titleOf(slug)}: ${inSentence(INDUSTRY_PRESETS[slug].examples)}.` } : {};
}

/** A card of what the agent starts with, headed by its icon. */
function StartCard({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="rounded-[18px] border border-[#eceef2] bg-white p-6">
      <p className="flex items-center gap-2 text-[12px] font-medium text-[#8a8f98]">
        <Icon className="size-4 text-[var(--accent)]" /> {label}
      </p>
      <div className="mt-2 text-[15px] leading-relaxed">{children}</div>
    </div>
  );
}

export default async function IndustryPage({ params }: PageProps<"/industries/[slug]">) {
  const { slug } = await params;
  if (!isSiteIndustry(slug)) notFound();
  const user = await currentUser();
  const start = user ? "/app" : "/signup";
  const preset = INDUSTRY_PRESETS[slug];
  const { icon: Icon, photo, ideas, scene } = INDUSTRY_PAGES[slug];
  const who = slug === "internal" ? "your team" : "your customers";
  const useCases = USE_CASES.filter((u) => u.industries.includes(slug));

  return (
    <>
      <PageHero
        eyebrow={
          <>
            <Icon className="size-4" /> Industries · {preset.label}
          </>
        }
        title={titleOf(slug)}
        intro={`For ${inSentence(preset.examples)}. Keel starts your agent with a role written for this kind of business, the questions ${who} ask most, a greeting, and what this kind of business usually needs it to do. Then it reads your website and documents, so every answer is your own.`}
        actions={
          <>
            <Pill href={start}>{user ? "Open your dashboard" : "Build yours for free"}</Pill>
            <Pill href="/industries" variant="outline">
              All industries
            </Pill>
          </>
        }
        visual={<IndustryPicture slug={slug} photo={photo} scene={scene} />}
      />

      <Band grey>
        <SectionTitle title="What your agent starts with" text="When you choose this industry. Everything stays yours to change, and Keel's draft from your website fills in the rest." />
        <div className="mx-auto mt-12 grid max-w-[1100px] gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="grid gap-4">
            <StartCard icon={UserRound} label="Its role">
              <p>
                <WithName text={preset.instructions} />
              </p>
            </StartCard>
            <StartCard icon={CircleCheck} label="What it does from the start">
              <ul className="space-y-1.5">
                {INDUSTRY_GOALS[slug].map((g) => (
                  <li key={g} className="flex gap-2">
                    <CircleCheck className="mt-1 size-4 shrink-0 text-[var(--accent)]" /> {GOALS[g].title}
                  </li>
                ))}
              </ul>
            </StartCard>
          </div>
          <div className="grid gap-4">
            <StartCard icon={Hand} label="Its greeting">
              <p>
                <WithName text={preset.welcome} />
              </p>
            </StartCard>
            <StartCard icon={MessageCircleQuestion} label={`Questions ${who} ask most`}>
              <ul className="space-y-1.5">
                {preset.suggestions.map((q) => (
                  <li key={q}>&ldquo;{q}&rdquo;</li>
                ))}
              </ul>
            </StartCard>
          </div>
        </div>
      </Band>

      <Band>
        <SectionTitle title="Ideas to go further" text="Ways to use Keel's actions, step-by-step guides and safety rules in this kind of business." />
        <div className="mx-auto mt-12 grid max-w-[1100px] gap-4 md:grid-cols-3">
          {ideas.map(({ icon: IdeaIcon, text }) => (
            <div key={text} className="rounded-[18px] border border-[#eceef2] bg-white p-6">
              <IconTile>
                <IdeaIcon className="size-5" />
              </IconTile>
              <p className="mt-4 text-[15px] leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link href="/product" className="text-[14px] font-medium text-[var(--accent)] hover:underline">
            See the whole product
          </Link>
        </div>
      </Band>

      {useCases.length > 0 && (
        <Band grey>
          <SectionTitle title="Use cases" />
          <div className={`mx-auto mt-12 ${useCases.length === 1 ? "max-w-[380px]" : useCases.length === 2 ? "max-w-[760px]" : "max-w-[1100px]"}`}>
            <LinkCards columns={useCases.length === 1 ? 1 : useCases.length === 2 ? 2 : 3} items={useCases.map(({ icon: UIcon, ...u }) => ({ href: `/use-cases/${u.slug}`, title: u.name, text: u.summary, icon: <UIcon className="size-5" /> }))} />
          </div>
        </Band>
      )}

      <Band grey={useCases.length === 0}>
        <SectionTitle title="Other industries" />
        <div className="mx-auto mt-10 flex max-w-[960px] flex-wrap justify-center gap-3">
          {SITE_INDUSTRIES.filter((s) => s !== slug).map((s) => {
            const OIcon = INDUSTRY_PAGES[s].icon;
            return (
              <Link key={s} href={`/industries/${s}`} className="inline-flex items-center gap-2 rounded-full border border-[#e4e6ea] bg-white px-4 py-2 text-[14px] hover:border-[var(--accent)] hover:text-[var(--accent)]">
                <OIcon className="size-4 text-[var(--accent)]" /> {INDUSTRY_PRESETS[s].label}
              </Link>
            );
          })}
        </div>
      </Band>

      <CtaBand start={start} signedIn={Boolean(user)} />
    </>
  );
}
