"use client";

// The website's header: the wordmark, two wide menus (Product: every feature by stage; Solutions: industries and use
// cases), and the way in. A menu opens on hover or click as a full-width panel of titled boxes, and closes on Escape,
// a click elsewhere, leaving it, or a new page. On a phone everything folds into one panel.

import { ArrowRight, ChevronDown, ChevronRight, Cpu, Menu, Rocket, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { FEATURES, STAGES } from "./features";
import { INDUSTRY_PAGES, SITE_INDUSTRIES } from "./industries";
import { USE_CASES } from "./use-cases";

type MenuKey = "product" | "solutions";

/** An icon on a soft square of Keel blue. */
function Tile({ children, size = "md" }: { children: ReactNode; size?: "md" | "sm" }) {
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-[var(--accent-tint)] text-[var(--accent)] ring-1 ring-[var(--accent-soft)]/60 ring-inset ${size === "md" ? "size-11" : "size-9"}`}>{children}</span>;
}

function Entry({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  return (
    <Link href={href} className="group flex items-center gap-3.5 rounded-lg py-1.5 pr-2 transition">
      <Tile>{icon}</Tile>
      <span className="text-[15px] text-[var(--ink-navy)] group-hover:text-[var(--accent)]">{label}</span>
    </Link>
  );
}

function Box({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[#e3e9f4] bg-white p-6 ${className}`}>
      <p className="mb-4 text-[12px] font-medium uppercase tracking-[0.14em] text-[#6b7387]">{title}</p>
      {children}
    </div>
  );
}

/** The strip along the bottom of a menu: one true thing about Keel, and where to read more. */
function Footnote({ href, lead, text, link }: { href: string; lead: ReactNode; text: string; link: string }) {
  return (
    <Link href={href} className="group mt-3 flex items-center gap-4 rounded-2xl border border-[#e3e9f4] bg-white px-6 py-4">
      {lead}
      <span className="flex-1 text-[15px] text-[#2c3447]">{text}</span>
      <span className="inline-flex items-center gap-1 text-[14px] font-medium text-[var(--ink-navy)] group-hover:text-[var(--accent)]">
        {link} <ChevronRight className="size-4" />
      </span>
    </Link>
  );
}

function Panel({ menu }: { menu: MenuKey }) {
  if (menu === "product")
    return (
      <>
        <div className="grid grid-cols-4 gap-3">
          {STAGES.map(({ stage }) => (
            <Box key={stage} title={stage}>
              <div className="space-y-2">
                {FEATURES.filter((f) => f.stage === stage).map(({ icon: Icon, ...f }) => (
                  <Entry key={f.slug} href={`/features/${f.slug}`} label={f.name} icon={<Icon className="size-[18px]" />} />
                ))}
              </div>
            </Box>
          ))}
        </div>
        <Footnote href="/product" lead={<Tile><Rocket className="size-[18px]" /></Tile>} text="Build, test, launch and improve an AI agent for your business, in one place." link="Product overview" />
      </>
    );
  return (
    <>
      <div className="grid grid-cols-[1.6fr_1fr] gap-3">
        <Box title="Industries">
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {SITE_INDUSTRIES.map((slug) => {
              const { icon: Icon, short } = INDUSTRY_PAGES[slug];
              return <Entry key={slug} href={`/industries/${slug}`} label={short} icon={<Icon className="size-[18px]" />} />;
            })}
          </div>
        </Box>
        <Box title="Use cases">
          <div className="space-y-2">
            {USE_CASES.map(({ icon: Icon, ...u }) => (
              <Entry key={u.slug} href={`/use-cases/${u.slug}`} label={u.name} icon={<Icon className="size-[18px]" />} />
            ))}
          </div>
        </Box>
      </div>
      <Footnote
        href="/technology"
        lead={
          <Tile>
            <Cpu className="size-[18px]" />
          </Tile>
        }
        text="Every answer, test and fix runs on NVIDIA Nemotron models, served by Nebius Token Factory." link="How it's built" />
    </>
  );
}

const MENUS: { key: MenuKey; label: string }[] = [
  { key: "product", label: "Product" },
  { key: "solutions", label: "Solutions" },
];

const LINKS: { href: string; label: string }[] = [
  { href: "/technology", label: "Technology" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState<MenuKey | null>(null);
  const [mobile, setMobile] = useState(false);
  const pathname = usePathname();
  const header = useRef<HTMLElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When the pointer last opened a menu: a click right after it means "open", not "close". */
  const hoveredAt = useRef(0);

  // A new page closes every menu.
  const [shownFor, setShownFor] = useState(pathname);
  if (shownFor !== pathname) {
    setShownFor(pathname);
    setOpen(null);
    setMobile(false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (setOpen(null), setMobile(false));
    const onClick = (e: MouseEvent) => header.current && !header.current.contains(e.target as Node) && setOpen(null);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  const stay = () => closeTimer.current && clearTimeout(closeTimer.current);
  // Times are the events' own timestamps, on one clock per page.
  const enter = (key: MenuKey, at: number) => {
    stay();
    if (open !== key) hoveredAt.current = at;
    setOpen(key);
  };
  const toggle = (key: MenuKey, at: number) => setOpen(open === key && at - hoveredAt.current > 500 ? null : key);
  const leave = () => {
    closeTimer.current = setTimeout(() => setOpen(null), 150);
  };

  return (
    <header ref={header} className="sticky top-0 z-30 border-b border-[#e8edf6] bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-[72px] w-full max-w-[1200px] items-center justify-between gap-6 px-5 sm:px-8">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-[22px] font-bold tracking-[-0.04em] text-[var(--ink-navy)]">
            keel<span className="text-[var(--accent)]">.</span>
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 text-[15px] text-[#3b4356] lg:flex">
            {MENUS.map((m) => (
              <button
                key={m.key}
                type="button"
                aria-expanded={open === m.key}
                onMouseEnter={(e) => enter(m.key, e.timeStamp)}
                onMouseLeave={leave}
                onClick={(e) => toggle(m.key, e.timeStamp)}
                className={`inline-flex items-center gap-1 rounded-lg px-3.5 py-2 transition ${open === m.key ? "bg-[var(--accent-tint)] text-[var(--accent)]" : "hover:text-[var(--accent)]"}`}
              >
                {m.label} <ChevronDown className={`size-3.5 transition ${open === m.key ? "rotate-180" : ""}`} />
              </button>
            ))}
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3.5 py-2 transition hover:text-[var(--accent)]">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2 sm:gap-6">
          {signedIn ? (
            <Link href="/app" className="inline-flex items-center rounded-full bg-[var(--accent)] px-5 py-2 text-[13px] font-medium text-white hover:brightness-110">
              Open your dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden text-[14px] text-[#3b4356] hover:text-[var(--accent)] sm:inline">
                Log in
              </Link>
              <Link href="/signup" className="inline-flex items-center rounded-full bg-[var(--accent)] px-5 py-2 text-[13px] font-medium text-white hover:brightness-110">
                Get started
              </Link>
            </>
          )}
          <button type="button" onClick={() => setMobile((m) => !m)} aria-expanded={mobile} aria-label={mobile ? "Close the menu" : "Open the menu"} className="inline-flex size-10 items-center justify-center rounded-full text-[var(--ink-navy)] hover:bg-[var(--accent-tint)] lg:hidden">
            {mobile ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full hidden border-b border-[#e3e9f4] bg-[var(--accent-wash)] shadow-[0_24px_48px_-24px_rgba(11,21,48,0.3)] lg:block" onMouseEnter={stay} onMouseLeave={leave}>
          <div className="mx-auto w-full max-w-[1200px] px-5 py-5 sm:px-8">
            <Panel menu={open} />
          </div>
        </div>
      )}

      {mobile && (
        <div className="max-h-[calc(100dvh-72px)] overflow-y-auto border-t border-[#f0f1f3] bg-white px-5 pb-8 pt-2 sm:px-8 lg:hidden">
          <MobileGroup title="Product">
            <MobileLink href="/product" icon={<Rocket className="size-4" />}>
              Product overview
            </MobileLink>
            {FEATURES.map(({ icon: Icon, ...f }) => (
              <MobileLink key={f.slug} href={`/features/${f.slug}`} icon={<Icon className="size-4" />}>
                {f.name}
              </MobileLink>
            ))}
          </MobileGroup>
          <MobileGroup title="Industries">
            {SITE_INDUSTRIES.map((slug) => {
              const { icon: Icon, short } = INDUSTRY_PAGES[slug];
              return (
                <MobileLink key={slug} href={`/industries/${slug}`} icon={<Icon className="size-4" />}>
                  {short}
                </MobileLink>
              );
            })}
          </MobileGroup>
          <MobileGroup title="Use cases">
            {USE_CASES.map(({ icon: Icon, ...u }) => (
              <MobileLink key={u.slug} href={`/use-cases/${u.slug}`} icon={<Icon className="size-4" />}>
                {u.name}
              </MobileLink>
            ))}
          </MobileGroup>
          <div className="space-y-1 pt-4">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="flex items-center justify-between py-2 text-[16px] text-[#111214]">
                {l.label} <ArrowRight className="size-4 text-[#8a8f98]" />
              </Link>
            ))}
            {!signedIn && (
              <Link href="/login" className="flex items-center justify-between py-2 text-[16px] text-[#111214]">
                Log in <ArrowRight className="size-4 text-[#8a8f98]" />
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

function MobileGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-[#f0f1f3] py-5">
      <p className="mb-3 text-[12px] font-medium uppercase tracking-[0.14em] text-[#6b6f76]">{title}</p>
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function MobileLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-3 py-1 text-[15px] text-[#111214]">
      <Tile size="sm">
        {icon}
      </Tile>
      {children}
    </Link>
  );
}
