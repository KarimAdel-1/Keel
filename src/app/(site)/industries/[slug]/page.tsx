import { CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { INDUSTRY_PAGES, SITE_INDUSTRIES, isSiteIndustry, type SiteIndustry } from "@/components/site/industries";
import { Band, CtaBand, LinkCards, PageHero, Pill, SectionTitle } from "@/components/site/parts";
import { USE_CASES } from "@/components/site/use-cases";
import { StarterVisual, WithName } from "@/components/site/visuals";
import { GOALS, INDUSTRY_GOALS } from "@/core/goals";
import { INDUSTRY_PRESETS } from "@/core/industries";
import { currentUser } from "@/platform/session";

export const dynamicParams = false;
export const generateStaticParams = () => SITE_INDUSTRIES.map((slug) => ({ slug }));

const titleOf = (slug: SiteIndustry) => (slug === "internal" ? "An AI agent for your own team" : `An AI agent for ${INDUSTRY_PRESETS[slug].label.toLowerCase()}`);

export async function generateMetadata({ params }: PageProps<"/industries/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return isSiteIndustry(slug) ? { title: INDUSTRY_PRESETS[slug].label, description: `${titleOf(slug)}: ${INDUSTRY_PRESETS[slug].examples.toLowerCase()}.` } : {};
}

export default async function IndustryPage({ params }: PageProps<"/industries/[slug]">) {
  const { slug } = await params;
  if (!isSiteIndustry(slug)) notFound();
  const user = await currentUser();
  const start = user ? "/app" : "/signup";
  const preset = INDUSTRY_PRESETS[slug];
  const { icon: Icon, ideas } = INDUSTRY_PAGES[slug];
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
        intro={`For ${preset.examples.toLowerCase()}. Keel starts your agent with a role written for this kind of business, the questions ${who} ask most, a greeting, and what this kind of business usually needs it to do. Then it reads your website and documents, so every answer is your own.`}
        actions={
          <>
            <Pill href={start}>{user ? "Open your dashboard" : "Build yours for free"}</Pill>
            <Pill href="/industries" variant="outline">
              All industries
            </Pill>
          </>
        }
        visual={<StarterVisual welcome={preset.welcome} suggestions={preset.suggestions} />}
      />

      <Band grey>
        <SectionTitle title="What your agent starts with" text="When you choose this industry. Everything stays yours to change, and Keel's draft from your website fills in the rest." />
        <div className="mx-auto mt-12 grid max-w-[1100px] gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="grid gap-4">
            <div className="rounded-[18px] border border-[#eceef2] bg-white p-6">
              <p className="text-[12px] font-medium text-[#8a8f98]">Its role</p>
              <p className="mt-2 text-[15px] leading-relaxed">
                <WithName text={preset.instructions} />
              </p>
            </div>
            <div className="rounded-[18px] border border-[#eceef2] bg-white p-6">
              <p className="text-[12px] font-medium text-[#8a8f98]">What it does from the start</p>
              <ul className="mt-2 space-y-1.5 text-[15px]">
                {INDUSTRY_GOALS[slug].map((g) => (
                  <li key={g} className="flex gap-2">
                    <CircleCheck className="mt-1 size-4 shrink-0 text-[#2348d8]" /> {GOALS[g].title}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="grid gap-4">
            <div className="rounded-[18px] border border-[#eceef2] bg-white p-6">
              <p className="text-[12px] font-medium text-[#8a8f98]">Its greeting</p>
              <p className="mt-2 text-[15px] leading-relaxed">
                <WithName text={preset.welcome} />
              </p>
            </div>
            <div className="rounded-[18px] border border-[#eceef2] bg-white p-6">
              <p className="text-[12px] font-medium text-[#8a8f98]">Questions {who} ask most</p>
              <ul className="mt-2 space-y-1.5 text-[15px]">
                {preset.suggestions.map((q) => (
                  <li key={q}>&ldquo;{q}&rdquo;</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </Band>

      <Band>
        <SectionTitle title="Ideas to go further" text="Ways to use Keel's actions, step-by-step guides and safety rules in this kind of business." />
        <div className="mx-auto mt-12 grid max-w-[1100px] gap-4 md:grid-cols-3">
          {ideas.map((idea) => (
            <div key={idea} className="flex gap-3 rounded-[18px] border border-[#eceef2] bg-white p-6">
              <CircleCheck className="mt-0.5 size-5 shrink-0 text-[#2348d8]" />
              <p className="text-[15px] leading-relaxed">{idea}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link href="/features" className="text-[14px] font-medium text-[#2348d8] hover:underline">
            See every feature
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
              <Link key={s} href={`/industries/${s}`} className="inline-flex items-center gap-2 rounded-full border border-[#e4e6ea] bg-white px-4 py-2 text-[14px] hover:border-[#2348d8] hover:text-[#2348d8]">
                <OIcon className="size-4 text-[#2348d8]" /> {INDUSTRY_PRESETS[s].label}
              </Link>
            );
          })}
        </div>
      </Band>

      <CtaBand start={start} signedIn={Boolean(user)} />
    </>
  );
}
