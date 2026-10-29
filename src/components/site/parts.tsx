// The building blocks of Keel's website pages: buttons, section titles, the page hero, steps, questions and the closing
// call to action. One look across the site, the home page's: light large headings, Keel blue for the way in and for
// icons, and white and light grey bands.

import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function Pill({ href, children, variant = "primary", size = "md" }: { href: string; children: ReactNode; variant?: "primary" | "outline"; size?: "md" | "sm" }) {
  const look = {
    primary: "bg-[var(--accent)] text-white hover:brightness-110",
    outline: "border border-[var(--ink-navy)]/25 text-[var(--ink-navy)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
  }[variant];
  return (
    <Link href={href} className={`inline-flex items-center justify-center gap-2 rounded-full font-medium transition ${size === "sm" ? "px-5 py-2 text-[13px]" : "px-7 py-3 text-sm"} ${look}`}>
      {children}
    </Link>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-[14px] font-medium text-[var(--accent)] hover:underline">
      {children} <ArrowRight className="size-4" />
    </Link>
  );
}

export function SectionTitle({ title, text, eyebrow }: { title: ReactNode; text?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mx-auto max-w-[720px] text-center">
      {eyebrow && <p className="mb-4 text-[13px] font-medium text-[var(--accent)]">{eyebrow}</p>}
      <h2 className="text-[32px] font-normal leading-[1.18] tracking-[-0.02em] text-[var(--ink-navy)] sm:text-[42px]">{title}</h2>
      {text && <p className="mx-auto mt-4 max-w-[560px] text-[15px] leading-relaxed text-[#525b6e]">{text}</p>}
    </div>
  );
}

/** The top of a page, laid out like the home page's: what it is, in a sentence or two, the way in, and a picture of it. */
export function PageHero({ eyebrow, title, intro, actions, visual, footer }: { eyebrow?: ReactNode; title: ReactNode; intro: ReactNode; actions?: ReactNode; visual?: ReactNode; footer?: ReactNode }) {
  return (
    <section className={`mx-auto grid w-full max-w-[1200px] items-center gap-14 px-5 pb-20 pt-14 sm:px-8 lg:pb-24 lg:pt-20 ${visual ? "lg:grid-cols-[1.05fr_1fr]" : ""}`}>
      <div className={visual ? "" : "mx-auto max-w-[760px] text-center"}>
        {eyebrow && <div className={`mb-5 flex items-center gap-2 text-[13px] font-medium text-[var(--accent)] ${visual ? "" : "justify-center"}`}>{eyebrow}</div>}
        <h1 className="text-[40px] font-normal leading-[1.12] tracking-[-0.03em] sm:text-[54px]">{title}</h1>
        <p className={`mt-7 text-[17px] leading-[1.6] text-[#4a4e55] ${visual ? "max-w-[520px]" : "mx-auto max-w-[620px]"}`}>{intro}</p>
        {actions && <div className={`mt-10 flex flex-wrap gap-3 ${visual ? "" : "justify-center"}`}>{actions}</div>}
        {footer && <div className="mt-10">{footer}</div>}
      </div>
      {visual}
    </section>
  );
}

/** An icon on a soft square of Keel blue. */
export function IconTile({ children, size = "md" }: { children: ReactNode; size?: "md" | "lg" }) {
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-[var(--accent-tint)] text-[var(--accent)] ring-1 ring-[var(--accent-soft)]/60 ring-inset ${size === "lg" ? "size-12" : "size-10"}`}>{children}</span>;
}

/** A grid of short points, each a title and a sentence or two. */
export function Points({ items, columns = 3 }: { items: { title: string; text: ReactNode; icon?: ReactNode }[]; columns?: 2 | 3 | 4 }) {
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[columns];
  return (
    <div className={`grid gap-4 ${grid}`}>
      {items.map((p) => (
        <div key={p.title} className="rounded-[18px] border border-[#eceef2] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          {p.icon && (
            <div className="mb-4">
              <IconTile>{p.icon}</IconTile>
            </div>
          )}
          <h3 className="text-[16px] font-medium tracking-[-0.01em]">{p.title}</h3>
          <p className="mt-2 text-[14px] leading-relaxed text-[#5b5f66]">{p.text}</p>
        </div>
      ))}
    </div>
  );
}

/** A step's number, in Keel blue. */
export function StepNumber({ n }: { n: number }) {
  return <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[14px] font-medium text-white">{n}</span>;
}

/** Numbered steps across the page. */
export function Steps({ items }: { items: { title: string; text: ReactNode }[] }) {
  return (
    <ol className={`grid gap-6 sm:grid-cols-2 ${items.length >= 5 ? "lg:grid-cols-5" : items.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
      {items.map((s, i) => (
        <li key={s.title} className="relative">
          <StepNumber n={i + 1} />
          <h3 className="mt-4 text-[16px] font-medium tracking-[-0.01em]">{s.title}</h3>
          <p className="mt-1.5 text-[14px] leading-relaxed text-[#5b5f66]">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

export function Faq({ items, title = "Questions" }: { items: { q: string; a: ReactNode }[]; title?: string }) {
  return (
    <section className="bg-[#f7f7f8]">
      <div className="mx-auto w-full max-w-[1200px] px-5 py-24 sm:px-8">
        <SectionTitle title={title} />
        <div className="mx-auto mt-10 max-w-[760px] divide-y divide-[#e7e8eb]">
          {items.map(({ q, a }, i) => (
            <details key={q} open={i === 0} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-[16px] text-[var(--ink-navy)] transition hover:text-[var(--accent)] [&::-webkit-details-marker]:hidden">
                {q}
                <ChevronDown className="size-4 shrink-0 text-[var(--accent)] transition group-open:rotate-180" />
              </summary>
              <p className="mt-3 pr-10 text-[14px] leading-relaxed text-[#5b5f66]">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Cards that each lead to another page. */
export function LinkCards({ items, columns = 3 }: { items: { href: string; title: string; text: string; icon?: ReactNode; tag?: string }[]; columns?: 1 | 2 | 3 | 4 }) {
  const grid = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[columns];
  return (
    <div className={`grid gap-4 ${grid}`}>
      {items.map((c) => (
        <Link key={c.href} href={c.href} className="group flex flex-col rounded-[18px] border border-[#eceef2] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:border-[var(--accent-soft)] hover:shadow-[0_12px_32px_-18px_var(--accent)]">
          <div className="flex items-center justify-between gap-3">
            {c.icon && <IconTile>{c.icon}</IconTile>}
            {c.tag && <span className="text-[12px] text-[#8a8f98]">{c.tag}</span>}
          </div>
          <h3 className="mt-5 text-[17px] font-medium tracking-[-0.01em]">{c.title}</h3>
          <p className="mt-2 flex-1 text-[14px] leading-relaxed text-[#5b5f66]">{c.text}</p>
          <span className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--accent)]">
            Learn more <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
          </span>
        </Link>
      ))}
    </div>
  );
}

/** The way in, once more, at the end of a page. */
export function CtaBand({ start, signedIn, title = "Build your business its own AI agent, for free" }: { start: string; signedIn: boolean; title?: string }) {
  return (
    <section>
      <div className="mx-auto w-full max-w-[1200px] px-5 py-24 text-center sm:px-8">
        <h2 className="mx-auto max-w-[680px] text-[34px] font-normal leading-[1.2] tracking-[-0.025em] text-[var(--ink-navy)] sm:text-[44px]">{title}</h2>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Pill href={start} size="sm">
            {signedIn ? "Open your dashboard" : "Get started"}
          </Pill>
          <Pill href="/product" variant="outline" size="sm">
            See the whole product
          </Pill>
        </div>
      </div>
    </section>
  );
}

/** A band of the page: white or the light grey that sets sections apart. */
export function Band({ children, grey = false, id, className = "" }: { children: ReactNode; grey?: boolean; id?: string; className?: string }) {
  return (
    <section id={id} className={grey ? "bg-[#f7f7f8]" : ""}>
      <div className={`mx-auto w-full max-w-[1200px] px-5 py-24 sm:px-8 ${className}`}>{children}</div>
    </section>
  );
}

/** "Built on" and the technology's names, as text: wherever a page says what Keel runs on. */
export function BuiltOn({ centered = false, size = "md" }: { centered?: boolean; size?: "sm" | "md" | "lg" }) {
  const text = { sm: "text-[13px]", md: "text-[14px]", lg: "text-[15px]" }[size];
  return (
    <div className={centered ? "text-center" : ""}>
      <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.14em] text-[#8a8f98]">Built on</p>
      <div className={`flex flex-wrap gap-2 ${centered ? "justify-center" : ""}`}>
        {["NVIDIA Nemotron", "NVIDIA NeMo Guardrails", "NVIDIA garak", "Nebius Token Factory"].map((name) => (
          <span key={name} className={`rounded-full border border-[#e4e6ea] bg-white px-3 py-1 font-medium text-[#2b2e33] ${text}`}>
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
