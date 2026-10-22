import {
  ArrowRight,
  BedDouble,
  BookOpenText,
  Clock3,
  Cpu,
  Dumbbell,
  FileText,
  FileType2,
  Globe,
  GraduationCap,
  Landmark,
  Laptop,
  ListChecks,
  MessageCircleQuestion,
  Network,
  NotebookPen,
  Plane,
  ScrollText,
  ShoppingBag,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DraftVisual, HeroVisual, LayoutMenuVisual, SourceVisual, TestRunVisual } from "@/components/landing/visuals";
import { BuiltOn, CtaBand, Faq, LinkCards, Pill, SectionTitle } from "@/components/site/parts";
import { StageGrid } from "@/components/site/StageGrid";
import { USE_CASES } from "@/components/site/use-cases";
import { BRAND } from "@/core/brand";
import { INDUSTRY_PRESETS } from "@/core/industries";
import { currentUser } from "@/platform/session";

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name}: build, test and launch an AI agent for your business` },
  description: BRAND.tagline,
};

const INDUSTRY_STRIP = [
  { icon: ShoppingBag, label: "Retail", slug: "retail" },
  { icon: Laptop, label: "Software", slug: "technology" },
  { icon: Plane, label: "Travel", slug: "travel" },
  { icon: BedDouble, label: "Hospitality", slug: "hospitality" },
  { icon: Landmark, label: "Finance", slug: "financial" },
  { icon: GraduationCap, label: "Education", slug: "education" },
  { icon: Dumbbell, label: "Fitness", slug: "fitness" },
];

const SOURCES = [
  { icon: Globe, label: "Your website", color: "#2348d8" },
  { icon: FileText, label: "PDF documents", color: "#d23b2e" },
  { icon: FileType2, label: "Word documents", color: "#1f5fbf" },
  { icon: NotebookPen, label: "Typed notes", color: "#d68a00" },
  { icon: MessageCircleQuestion, label: "Questions and answers", color: "#0f8a4f" },
  { icon: Network, label: "Sitemaps", color: "#6d3fd1" },
  { icon: BookOpenText, label: "Help centre articles", color: "#0b6aa2" },
  { icon: ScrollText, label: "Policies and price lists", color: "#b42357" },
  { icon: ListChecks, label: "Markdown and text files", color: "#3d4451" },
];

const FAQ = [
  {
    q: "Can I get started with Keel for free?",
    a: "Yes. Create an account and build your first agent without a card. Paste your website, and you can be chatting with your own agent a few minutes later.",
  },
  {
    q: "How quickly can I build my first agent?",
    a: "Keel reads your website while you watch, then drafts your agent: its role, its greeting and the questions your customers ask most. You check the draft, change what you like, and try it straight away.",
  },
  {
    q: "What does my agent know, and what if it doesn't know something?",
    a: "Only what you give it: your website, documents, typed notes and questions and answers. Every answer shows where it came from, and when your information doesn't cover a question, it says so instead of guessing.",
  },
  {
    q: "Which AI models does Keel use?",
    a: "NVIDIA Nemotron models, served by Nebius Token Factory: Nano, Lightning, Super and Ultra. Choose one for each agent, or let Keel pick for every message: a fast model for simple questions, a stronger one for harder ones. Nemotron 3.5 Super VL reads the photos customers send and pictures of your documents.",
  },
  {
    q: "How do I put the agent on my website?",
    a: "Choose a chat bubble, a side panel, an embedded window or a full page of its own, pick a style and colour, then copy one line of code into your site. The full page also has a link you can share anywhere.",
  },
  {
    q: "Do I need to know about AI to set it up?",
    a: "No. You choose what the agent should do in plain words, such as \"let customers reach a person\" or \"handle returns\", and Keel turns on what that needs. Its Home page lists anything left to do, most urgent first, often with a one-click fix.",
  },
  {
    q: "What happens when a customer wants a person?",
    a: "The agent brings in your team: it hands over the chat or opens a ticket with a summary. You're told in Keel, in your browser and by email, and your reply reaches the customer where they wrote. Handovers can also go to Zendesk or Freshdesk, and alerts to Slack.",
  },
  {
    q: "Can it answer on WhatsApp and other messaging apps?",
    a: "Yes: WhatsApp, Facebook Messenger, Instagram and Telegram. Customers there talk to the same agent, with the same knowledge, and your team replies to them from the same Helpdesk inbox.",
  },
  {
    q: "Can I see what my customers asked?",
    a: "Yes. Every conversation is kept with the agent's answers and the sources they used, so you can see what works and improve what doesn't.",
  },
];

export default async function Home() {
  const user = await currentUser();
  const start = user ? "/app" : "/signup";

  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid w-full max-w-[1200px] items-center gap-14 px-5 pb-20 pt-14 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:pb-24 lg:pt-20">
        <div>
          <h1 className="text-[44px] font-normal leading-[1.12] tracking-[-0.03em] sm:text-[58px]">
            Build, test and launch an AI agent for your business.
          </h1>
          <p className="mt-7 max-w-[500px] text-[17px] leading-[1.6] text-[#4a4e55]">
            Keel reads your website and documents, drafts your agent, and lets you test every answer before your customers see it. Then one line of code puts it on your site, and it can answer in the messaging apps your customers use too.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Pill href={start}>{user ? "Open your dashboard" : "Try for free"}</Pill>
            <Pill href="/product" variant="outline">See the whole product</Pill>
          </div>
          <div className="mt-10">
            <BuiltOn />
          </div>
        </div>
        <HeroVisual />
      </section>

      {/* Industries strip */}
      <section id="industries" className="bg-[#f7f7f8]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-center gap-x-12 gap-y-6 px-5 py-9 sm:justify-between sm:px-8">
          {INDUSTRY_STRIP.map(({ icon: Icon, label, slug }) => (
            <Link key={label} href={`/industries/${slug}`} className="inline-flex items-center gap-2 text-[17px] font-semibold tracking-[-0.01em] text-[#2b2e33] hover:text-[#2348d8]">
              <Icon className="size-5 text-[#2348d8]" /> {label}
            </Link>
          ))}
        </div>
      </section>

      {/* Why Keel */}
      <section className="mx-auto w-full max-w-[1200px] px-5 py-24 sm:px-8">
        <SectionTitle title="What you can count on" text="An agent that knows your business, shows its sources, and never guesses." />
        <div className="mx-auto mt-14 grid max-w-[900px] gap-12 sm:grid-cols-3">
          {[
            { icon: Clock3, value: "24/7", label: "Answers for your customers" },
            { icon: Cpu, value: "5", label: "NVIDIA Nemotron models" },
            { icon: Users, value: String(Object.keys(INDUSTRY_PRESETS).length - 1), label: "Industries ready to start" },
          ].map(({ icon: Icon, value, label }) => (
            <div key={label} className="text-center">
              <Icon className="mx-auto size-8 stroke-[1.5]" />
              <p className="mt-6 text-[46px] font-normal leading-none tracking-[-0.03em]">{value}</p>
              <p className="mt-4 text-[14px] text-[#5b5f66]">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* From your website to an agent */}
      <section id="how" className="mx-auto grid w-full max-w-[1200px] items-center gap-14 px-5 pb-24 sm:px-8 lg:grid-cols-2">
        <div>
          <h2 className="max-w-[460px] text-[36px] font-normal leading-[1.18] tracking-[-0.025em] sm:text-[44px]">From your website to a working agent, in minutes</h2>
          <p className="mt-6 max-w-[470px] text-[15px] leading-[1.7] text-[#4a4e55]">
            Paste your website. Keel reads it (or just the pages you choose), learns what you sell and how you talk, and writes your agent&apos;s first draft: its role, its greeting and the questions your customers ask most. Say what it should do for your customers, such as handle returns or bring in your team, and Keel sets that up. A to-do list shows what&apos;s left.
          </p>
          <div className="mt-8">
            <Pill href={start}>Start with your website</Pill>
          </div>
        </div>
        <DraftVisual />
      </section>

      {/* Test before launch */}
      <section id="features" className="bg-[#f7f7f8]">
        <div className="mx-auto w-full max-w-[1200px] px-5 py-24 sm:px-8">
          <SectionTitle
            title={<>Know it works before your customers do</>}
            text="Test your agent the way your customers will talk to it, and check every answer against your own information."
          />
          <div className="mx-auto mt-14 grid max-w-[1040px] gap-6 md:grid-cols-2">
            {[
              {
                title: "Test with AI customers",
                href: "/features/testing",
                figure: "20",
                note: "Customers in one test run, each with their own question and mood",
                visual: <TestRunVisual />,
              },
              {
                title: "See where every answer comes from",
                href: "/features/knowledge",
                figure: "1 click",
                note: "From any answer to the exact passage it used",
                visual: <SourceVisual />,
              },
            ].map((card) => (
              <div key={card.title} className="overflow-hidden rounded-[22px] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
                <div className="px-8 pb-8 pt-9">
                  <h3 className="text-[19px] font-normal tracking-[-0.01em]">{card.title}</h3>
                  <p className="mt-5 text-[40px] font-normal leading-none tracking-[-0.03em] text-[#2348d8]">{card.figure}</p>
                  <p className="mt-4 text-[14px] text-[#5b5f66]">{card.note}</p>
                  <Link href={card.href} className="mt-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#2348d8] hover:underline">
                    Learn more <ArrowRight className="size-3.5" />
                  </Link>
                </div>
                {card.visual}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Look and layout */}
      <section className="mx-auto grid w-full max-w-[1200px] items-center gap-14 px-5 py-24 sm:px-8 lg:grid-cols-2">
        <div>
          <h2 className="max-w-[500px] text-[36px] font-normal leading-[1.18] tracking-[-0.025em] sm:text-[44px]">Your colours, your greeting, your rules</h2>
          <p className="mt-6 max-w-[480px] text-[15px] leading-[1.7] text-[#4a4e55]">
            Choose how it sits on your site: a chat bubble, a side panel, a window inside a page, or a full page of its own. Pick a style, your colour and its greeting, and set the rules it always follows. Every change shows in a live preview before you save.
          </p>
          <div className="mt-8">
            <Pill href="/features/channels">Learn more</Pill>
          </div>
        </div>
        <LayoutMenuVisual />
      </section>

      {/* Everything, by stage */}
      <section className="bg-[#f7f7f8]">
        <div className="mx-auto w-full max-w-[1200px] px-5 py-24 sm:px-8">
          <SectionTitle title="Everything your agent needs, in one place" text="From the first draft to the last fix: each part of Keel, in the order you'll use it." />
          <div className="mt-14">
            <StageGrid />
          </div>
        </div>
      </section>

      {/* Knowledge sources */}
      <section className="mx-auto w-full max-w-[1200px] px-5 py-24 sm:px-8">
        <SectionTitle
          title={<>Teach it with what your team already has</>}
          text="Teach your agent with the material your team already keeps. It answers only from what you give it, and you can read, change or remove any of it at any time."
        />
        <div className="mt-5 text-center">
          <Link href={start} className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#2348d8] hover:underline">
            Start teaching your agent <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mx-auto mt-12 grid max-w-[1000px] gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SOURCES.map(({ icon: Icon, label, color }) => (
            <div key={label} className="flex items-center gap-4 rounded-xl border border-[#f0f1f3] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <Icon className="size-6" style={{ color }} />
              <span className="text-[15px] text-[#2b2e33]">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Use cases */}
      <section className="mx-auto w-full max-w-[1200px] px-5 pb-24 sm:px-8">
        <SectionTitle title="What businesses use it for" text="The jobs a business gives its agent, and how Keel's parts fit together for each." />
        <div className="mt-14">
          <LinkCards columns={3} items={USE_CASES.slice(0, 3).map(({ icon: Icon, ...u }) => ({ href: `/use-cases/${u.slug}`, title: u.name, text: u.summary, icon: <Icon className="size-5" /> }))} />
        </div>
        <div className="mt-8 text-center">
          <Link href="/use-cases" className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[#2348d8] hover:underline">
            All use cases <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <div id="faq">
        <Faq title="Frequently asked questions" items={FAQ} />
      </div>

      <CtaBand start={start} signedIn={Boolean(user)} />
    </>
  );
}
