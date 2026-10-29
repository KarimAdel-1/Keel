import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { featureBySlug } from "@/components/site/features";
import { INDUSTRY_PAGES, isSiteIndustry } from "@/components/site/industries";
import { Band, CtaBand, LinkCards, PageHero, Pill, Points, SectionTitle, StepNumber } from "@/components/site/parts";
import { USE_CASES, caseBySlug } from "@/components/site/use-cases";
import { ExampleChat } from "@/components/site/visuals";
import { INDUSTRY_PRESETS } from "@/core/industries";
import { currentUser } from "@/platform/session";

export const dynamicParams = false;
export const generateStaticParams = () => USE_CASES.map((u) => ({ slug: u.slug }));

export async function generateMetadata({ params }: PageProps<"/use-cases/[slug]">): Promise<Metadata> {
  const useCase = caseBySlug((await params).slug);
  return useCase ? { title: useCase.name, description: useCase.summary } : {};
}

export default async function UseCasePage({ params }: PageProps<"/use-cases/[slug]">) {
  const useCase = caseBySlug((await params).slug);
  if (!useCase) notFound();
  const user = await currentUser();
  const start = user ? "/app" : "/signup";
  const Icon = useCase.icon;
  const industries = useCase.industries.filter(isSiteIndustry);

  return (
    <>
      <PageHero
        eyebrow={
          <>
            <Icon className="size-4" /> Use case · {useCase.name}
          </>
        }
        title={useCase.title}
        intro={useCase.intro}
        actions={
          <>
            <Pill href={start}>{user ? "Open your dashboard" : "Build yours for free"}</Pill>
            <Pill href="/use-cases" variant="outline">
              All use cases
            </Pill>
          </>
        }
        visual={<ExampleChat business={useCase.business} turns={useCase.conversation} />}
      />

      <Band grey>
        <SectionTitle title="What your agent takes care of" />
        <div className="mx-auto mt-12 max-w-[1100px]">
          <Points items={useCase.handles} columns={2} />
        </div>
      </Band>

      <Band>
        <SectionTitle title="How to set it up in Keel" text="Four steps, each one a part of Keel you can open to see more." />
        <ol className="mx-auto mt-14 grid max-w-[1100px] gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {useCase.setup.map((s, i) => {
            const feature = featureBySlug(s.feature);
            return (
              <li key={s.title} className="flex flex-col rounded-[18px] border border-[#eceef2] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <StepNumber n={i + 1} />
                <h3 className="mt-4 text-[16px] font-medium tracking-[-0.01em]">{s.title}</h3>
                <p className="mt-1.5 flex-1 text-[14px] leading-relaxed text-[#5b5f66]">{s.text}</p>
                {feature && (
                  <Link href={`/features/${feature.slug}`} className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--accent)] hover:underline">
                    {feature.name} <ArrowRight className="size-3.5" />
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </Band>

      <Band grey>
        <div className="mx-auto grid max-w-[1040px] items-center gap-12 lg:grid-cols-2">
          <div>
            <h2 className="text-[32px] font-normal leading-[1.18] tracking-[-0.02em] sm:text-[40px]">Test it before your customers see it</h2>
            <p className="mt-5 text-[15px] leading-relaxed text-[#5b5f66]">
              A test like this one sends an AI customer to your agent, and a judge checks the conversation against your own information. Keel can write a crowd of them for you from what your agent knows.
            </p>
            <div className="mt-7">
              <Link href="/features/testing" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--accent)] hover:underline">
                How tests work <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
          <div className="rounded-[18px] border border-[#eceef2] bg-white p-6 shadow-[0_24px_60px_-28px_rgba(16,24,40,0.3)]">
            <p className="text-[12px] font-medium text-[#8a8f98]">The AI customer</p>
            <p className="mt-1.5 rounded-lg border border-[#e4e6ea] px-3 py-2.5 text-[14px] leading-relaxed">{useCase.test.customer}</p>
            <p className="mt-5 text-[12px] font-medium text-[#8a8f98]">It passes when</p>
            <p className="mt-1.5 rounded-lg border border-[#e4e6ea] px-3 py-2.5 text-[14px] leading-relaxed">{useCase.test.passes}</p>
            {useCase.test.actions && (
              <>
                <p className="mt-5 text-[12px] font-medium text-[#8a8f98]">Actions it must use</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {useCase.test.actions.map((a) => (
                    <span key={a} className="rounded-md border border-[#111214] bg-[#f3f4f6] px-2 py-1 font-mono text-[12px]">
                      @{a}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </Band>

      {industries.length > 0 && (
        <Band>
          <SectionTitle title="Where it's used" text="Industries Keel has a starting point for, where this job comes up often." />
          <div className="mx-auto mt-10 flex max-w-[900px] flex-wrap justify-center gap-3">
            {industries.map((slug) => {
              const IIcon = INDUSTRY_PAGES[slug].icon;
              return (
                <Link key={slug} href={`/industries/${slug}`} className="inline-flex items-center gap-2 rounded-full border border-[#e4e6ea] px-4 py-2 text-[14px] hover:border-[var(--accent)] hover:text-[var(--accent)]">
                  <IIcon className="size-4 text-[var(--accent)]" /> {INDUSTRY_PRESETS[slug].label}
                </Link>
              );
            })}
          </div>
        </Band>
      )}

      <Band grey={industries.length > 0}>
        <SectionTitle title="Other use cases" />
        <div className="mx-auto mt-12 max-w-[1100px]">
          <LinkCards
            columns={2}
            items={USE_CASES.filter((u) => u.slug !== useCase.slug)
              .slice(0, 4)
              .map(({ icon: UIcon, ...u }) => ({ href: `/use-cases/${u.slug}`, title: u.name, text: u.summary, icon: <UIcon className="size-5" /> }))}
          />
        </div>
      </Band>

      <CtaBand start={start} signedIn={Boolean(user)} />
    </>
  );
}
