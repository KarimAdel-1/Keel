import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FEATURES, featureBySlug, type FeaturePage } from "@/components/site/features";
import { Band, BuiltOn, CtaBand, Faq, LinkCards, PageHero, Pill, Points, SectionTitle, Steps } from "@/components/site/parts";
import { FeatureVisual } from "@/components/site/visuals";
import { ACTION_INFO, ACTION_KINDS } from "@/core/actions";
import { LAYOUT_INFO, STYLE_INFO } from "@/core/agents";
import { GARAK_SUITE } from "@/core/garak-suite";
import { WIDGET_INFO } from "@/core/widgets";
import { currentUser } from "@/platform/session";

export const dynamicParams = false;
export const generateStaticParams = () => FEATURES.map((f) => ({ slug: f.slug }));

export async function generateMetadata({ params }: PageProps<"/features/[slug]">): Promise<Metadata> {
  const feature = featureBySlug((await params).slug);
  return feature ? { title: feature.name, description: feature.summary } : {};
}

/** A list from the product's own definitions, so the page always matches what Keel offers. */
function ProductList({ list }: { list: NonNullable<FeaturePage["lists"]>[number] }) {
  if (list === "actions") {
    const groups = [...new Set(ACTION_KINDS.map((k) => ACTION_INFO[k].group))];
    return (
      <div>
        <SectionTitle title={`${ACTION_KINDS.length} kinds of action`} text="Add as many as you need. The agent uses each one when the sentence you wrote for it fits." />
        <div className="mx-auto mt-12 grid max-w-[1040px] gap-8 md:grid-cols-2">
          {groups.map((g) => (
            <div key={g}>
              <p className="mb-3 text-[13px] font-medium text-[#8a8f98]">{g}</p>
              <div className="space-y-3">
                {ACTION_KINDS.filter((k) => ACTION_INFO[k].group === g).map((k) => (
                  <div key={k} className="rounded-[14px] border border-[#eceef2] bg-white p-4">
                    <p className="text-[15px] font-medium">{ACTION_INFO[k].title}</p>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-[#5b5f66]">{ACTION_INFO[k].text}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  const simple = {
    widgets: { title: "Show your data, not just text", text: "A Call your API action can show what your system returns as one of these.", items: Object.values(WIDGET_INFO).map((w) => ({ title: w.name, text: w.text })) },
    layouts: { title: `${Object.keys(LAYOUT_INFO).length} ways to show the chat`, text: "Change it any time; your website picks up the change.", items: Object.values(LAYOUT_INFO).map((l) => ({ title: l.name, text: l.text })) },
    styles: { title: `${Object.keys(STYLE_INFO).length} styles`, text: "Each one in your colour, with your logo.", items: Object.values(STYLE_INFO).map((s) => ({ title: s.name, text: s.text })) },
  } as const;
  if (list === "attacks") {
    const categories = [...new Set(GARAK_SUITE.map((p) => p.category))];
    return (
      <div>
        <SectionTitle title={`${GARAK_SUITE.length} kinds of attack`} text="What a security scan sends to your agent, through the same path a customer's message takes." />
        <div className="mx-auto mt-12 grid max-w-[1040px] gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <div key={c} className="rounded-[14px] border border-[#eceef2] bg-white p-5">
              <p className="text-[15px] font-medium">{c}</p>
              <ul className="mt-2 space-y-1.5 text-[13.5px] text-[#5b5f66]">
                {GARAK_SUITE.filter((p) => p.category === c).map((p) => (
                  <li key={p.probe}>{p.label}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }
  const l = simple[list];
  return (
    <div>
      <SectionTitle title={l.title} text={l.text} />
      <div className="mx-auto mt-12 max-w-[1040px]">
        <Points items={[...l.items]} columns={l.items.length === 4 ? 4 : 3} />
      </div>
    </div>
  );
}

export default async function FeaturePageView({ params }: PageProps<"/features/[slug]">) {
  const feature = featureBySlug((await params).slug);
  if (!feature) notFound();
  const user = await currentUser();
  const start = user ? "/app" : "/signup";
  const Icon = feature.icon;
  const related = feature.related.map(featureBySlug).filter((f): f is FeaturePage => Boolean(f));
  // Sections alternate white and grey, starting grey after the hero; the questions are always grey.
  const lists = feature.lists ?? [];
  const stepsGrey = lists.length % 2 === 1;
  const lastGrey = feature.faq ? true : feature.steps ? stepsGrey : lists.length % 2 === 0;

  return (
    <>
      <PageHero
        eyebrow={
          <>
            <Icon className="size-4" /> {feature.stage === feature.name ? feature.name : `${feature.stage} · ${feature.name}`}
          </>
        }
        title={feature.title}
        intro={feature.intro}
        actions={
          <>
            <Pill href={start}>{user ? "Open your dashboard" : "Try it for free"}</Pill>
            <Pill href="/product" variant="outline">
              Product overview
            </Pill>
          </>
        }
        visual={<FeatureVisual kind={feature.visual} />}
        footer={/NVIDIA|Nemotron|Nebius/.test(`${feature.title} ${feature.intro} ${feature.points.map((p) => p.text).join(" ")}`) ? <BuiltOn size="sm" /> : undefined}
      />

      <Band grey>
        <SectionTitle title="What it does" />
        <div className="mx-auto mt-12 max-w-[1100px]">
          <Points items={feature.points} columns={feature.points.length === 4 ? 2 : 3} />
        </div>
      </Band>

      {lists.map((list, i) => (
        <Band key={list} grey={i % 2 === 1}>
          <ProductList list={list} />
        </Band>
      ))}

      {feature.steps && (
        <Band grey={stepsGrey}>
          <SectionTitle title="How it works" />
          <div className="mx-auto mt-12 max-w-[1100px]">
            <Steps items={feature.steps} />
          </div>
        </Band>
      )}

      {feature.faq && <Faq items={feature.faq} />}

      <Band grey={!lastGrey}>
        <SectionTitle title="Works well with" />
        <div className="mx-auto mt-12 max-w-[1100px]">
          <LinkCards items={related.map(({ icon: RIcon, ...f }) => ({ href: `/features/${f.slug}`, title: f.name, text: f.summary, icon: <RIcon className="size-5" />, tag: f.stage }))} />
        </div>
      </Band>

      <CtaBand start={start} signedIn={Boolean(user)} />
    </>
  );
}
