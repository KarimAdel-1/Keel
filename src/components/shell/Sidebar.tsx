"use client";

import { BarChart3, BookOpen, Bot, Check, ChevronDown, ChevronRight, ChevronsUpDown, Contact, ExternalLink, Gauge, House, Inbox, LifeBuoy, LogOut, Menu, MessageSquarePlus, MoreHorizontal, PanelLeft, Play, Plus, Radio, Search, Settings, ShieldCheck, Sparkles, TestTubes, Users, Wrench, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AgentAvatar } from "../ui";
import { Wordmark } from "../Wordmark";

export interface SidebarAgent {
  id: string;
  name: string;
  displayName: string;
  color: string;
  avatar?: string;
  /** Getting-started steps for this agent. */
  steps: { title: string; done: boolean; href: string }[];
}

/** `forAgent`: a workspace page (`href`) opened on the agent being worked on, as `?agent=` */
type NavItem = { label: string; icon: typeof Play; path?: string; href?: string; children?: { label: string; path: string }[]; external?: boolean; forAgent?: boolean };

/** What pages were called before they had plain names: search still finds them by those. */
const OLD_NAMES: Record<string, string> = {
  "": "Playground",
  "/getting-started": "Getting started",
  "/sources": "Knowledge",
  "/instructions": "Instructions",
  "/channels": "Channels",
  "/integrations": "Integrations, WhatsApp, Telegram",
  "/procedures": "Procedures",
  "/widgets": "Widgets",
  "/suggestions": "Suggestions",
  "/guardrails": "Guardrails",
};

/** What an owner uses every day, in their own words. */
const AGENT_NAV: NavItem[] = [
  { label: "Home", icon: House, path: "/getting-started" },
  { label: "Try it", icon: Play, path: "" },
  {
    label: "Knowledge",
    icon: BookOpen,
    children: [
      { label: "What it knows", path: "/sources" },
      { label: "How it behaves", path: "/instructions" },
    ],
  },
  {
    label: "Tests & quality",
    icon: TestTubes,
    children: [
      { label: "Tests", path: "/tests" },
      { label: "Quality", path: "/quality" },
      { label: "Improve", path: "/improve" },
    ],
  },
  {
    label: "Publish",
    icon: Radio,
    children: [
      { label: "On your website", path: "/channels" },
      { label: "Messaging apps and tools", path: "/integrations" },
    ],
  },
  { label: "Conversations", icon: Inbox, path: "/activity" },
  { label: "Helpdesk inbox", icon: LifeBuoy, href: "/app/helpdesk", external: true, forAgent: true },
];

/** Everything else, under the "More tools" heading, always in view. */
const MORE_NAV: NavItem[] = [
  {
    label: "Actions & widgets",
    icon: Wrench,
    children: [
      { label: "Actions", path: "/actions" },
      { label: "Step-by-step guides", path: "/procedures" },
      { label: "Widgets", path: "/widgets" },
    ],
  },
  { label: "Answers to add", icon: MessageSquarePlus, path: "/suggestions" },
  { label: "Safety and limits", icon: ShieldCheck, path: "/guardrails" },
  {
    label: "Customers",
    icon: Contact,
    children: [
      { label: "Contacts", path: "/contacts" },
      { label: "Leads", path: "/leads" },
      { label: "Collected data", path: "/collected" },
    ],
  },
  {
    label: "Analytics",
    icon: BarChart3,
    children: [
      { label: "Chats", path: "/analytics" },
      { label: "Topics", path: "/analytics/topics" },
      { label: "Sentiment", path: "/analytics/sentiment" },
    ],
  },
  { label: "Settings", icon: Settings, path: "/settings" },
];

/**
 * The dashboard's navigation: the agent being worked on (and its workspace), search, the agent's sections, how far
 * its setup has come, and the account. Collapses to icons; on a phone it's a drawer.
 */
export function Sidebar({
  user,
  workspace,
  agents,
  workspaces = [],
}: {
  user: { name: string; email: string };
  workspace: string;
  agents: SidebarAgent[];
  /** All the person's workspaces, when they belong to more than one. */
  workspaces?: { id: string; name: string; current: boolean }[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searching, setSearching] = useState(false);
  const agentId = pathname.match(/^\/app\/agents\/(?!new(?:\/|$))([^/]+)/)?.[1];
  const agent = agents.find((a) => a.id === agentId);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const nav = (mini: boolean) => (
    // Choosing a page closes the menu on a phone.
    <div className="flex h-full flex-col" onClick={(e) => (e.target as HTMLElement).closest("a") && setOpen(false)}>
      <div className={`flex h-16 items-center ${mini ? "justify-center" : "justify-between px-4"}`}>
        {!mini && <Wordmark href="/app" />}
        <button type="button" onClick={() => (open ? setOpen(false) : setCollapsed(!collapsed))} className="rounded-md p-1.5 text-muted transition hover:bg-panel-2 hover:text-text" title={open ? "Close menu" : collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {open ? <X className="size-5" /> : <PanelLeft className="size-[18px]" />}
        </button>
      </div>

      <div className={mini ? "px-2" : "px-3"}>
        <Switcher agents={agents} current={agent} workspace={workspace} mini={mini} workspaces={workspaces} />
        {mini ? (
          <button type="button" onClick={() => setSearching(true)} className="mt-2 flex w-full justify-center rounded-lg p-2 text-muted hover:bg-panel-2" title="Search">
            <Search className="size-4" />
          </button>
        ) : (
          <button type="button" onClick={() => setSearching(true)} className="mt-2 flex w-full items-center gap-2 rounded-lg border border-line bg-panel px-2.5 py-2 text-sm text-subtle transition hover:border-line-strong">
            <Search className="size-4" /> <span className="flex-1 text-left">Search…</span>
            <kbd className="rounded border border-line bg-panel-2 px-1.5 text-[10px] font-medium text-muted">⌘K</kbd>
          </button>
        )}
      </div>

      <nav className={`mt-3 flex-1 overflow-y-auto pb-4 ${mini ? "px-2" : "px-3"}`} aria-label="Main">
        {agent ? (
          <>
          <div className="mb-2 border-b border-line pb-2">
            <SideLink href={`/app/agents/${agent.id}/backstage`} active={pathname.startsWith(`/app/agents/${agent.id}/backstage`)} icon={<Sparkles className="size-[18px]" />} label="Ask Copilot" mini={mini} />
          </div>
          <ul className="space-y-0.5">
            {AGENT_NAV.map((item) => (
              <NavRow key={item.label} item={item} base={`/app/agents/${agent.id}`} pathname={pathname} mini={mini} />
            ))}
          </ul>
          <MoreTools base={`/app/agents/${agent.id}`} pathname={pathname} mini={mini} />
          </>
        ) : (
          <ul className="space-y-0.5">
            <li>
              <SideLink href="/app" active={pathname === "/app"} icon={<Bot className="size-[18px]" />} label="Agents" mini={mini} />
            </li>
            <li>
              <SideLink href="/app/agents/new" active={pathname === "/app/agents/new"} icon={<Plus className="size-[18px]" />} label="New agent" mini={mini} />
            </li>
            <li>
              <SideLink href="/app/helpdesk" active={pathname.startsWith("/app/helpdesk")} icon={<LifeBuoy className="size-[18px]" />} label="Helpdesk inbox" mini={mini} />
            </li>
            <li>
              <SideLink href="/app/usage" active={pathname === "/app/usage"} icon={<Gauge className="size-[18px]" />} label="Usage" mini={mini} />
            </li>
            <li>
              <SideLink href="/app/workspace" active={pathname === "/app/workspace"} icon={<Users className="size-[18px]" />} label="Workspace settings" mini={mini} />
            </li>
          </ul>
        )}
      </nav>

      {!mini && agent && <GettingStarted steps={agent.steps} href={`/app/agents/${agent.id}/getting-started`} />}
      <Account user={user} mini={mini} />
    </div>
  );

  return (
    <>
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-panel px-4 lg:hidden">
        <Wordmark href="/app" />
        <button type="button" onClick={() => setOpen(true)} className="rounded-md p-1.5 text-muted hover:bg-panel-2" title="Open menu">
          <Menu className="size-5" />
        </button>
      </div>
      <aside className={`sticky top-0 hidden h-dvh shrink-0 dashboard-sidebar border-r border-line bg-panel transition-[width] lg:block ${collapsed ? "w-[68px]" : "w-[236px]"}`}>{nav(collapsed)}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 dashboard-sidebar w-[280px] max-w-[85vw] bg-panel shadow-raised">{nav(false)}</aside>
        </div>
      )}
      {searching && <CommandMenu agents={agents} current={agent} onClose={() => setSearching(false)} />}
    </>
  );
}

/** "More tools": the rest of the agent's pages, always in view under their own heading. */
function MoreTools({ base, pathname, mini }: { base: string; pathname: string; mini: boolean }) {
  return (
    <div className="mt-2 border-t border-line pt-2">
      {!mini && <p className="eyebrow px-2.5 pb-1 pt-2">Manage</p>}
      <ul className="space-y-0.5">
        {MORE_NAV.map((item) => (
          <NavRow key={item.label} item={item} base={base} pathname={pathname} mini={mini} />
        ))}
      </ul>
    </div>
  );
}

function SideLink({ href, active, icon, label, mini, trailing }: { href: string; active: boolean; icon: ReactNode; label: string; mini: boolean; trailing?: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      title={mini ? label : undefined}
      className={`flex items-center gap-3 rounded-lg py-2 text-[14px] transition ${mini ? "justify-center px-2" : "px-2.5"} ${active ? "bg-[var(--nav-active)] font-medium text-brand" : "text-[#26282d] hover:bg-panel-2"}`}
    >
      {icon}
      {!mini && <span className="flex-1 truncate">{label}</span>}
      {!mini && trailing}
    </Link>
  );
}

function NavRow({ item, base, pathname, mini }: { item: NavItem; base: string; pathname: string; mini: boolean }) {
  const Icon = item.icon;
  const isActive = (path: string) => (path === "/analytics" ? pathname === `${base}${path}` : pathname.startsWith(`${base}${path}`));
  const childActive = item.children?.some((c) => isActive(c.path)) ?? false;
  const [expanded, setExpanded] = useState(childActive);
  const show = expanded || childActive;

  if (!item.children) {
    const href = item.href ? (item.forAgent ? `${item.href}?agent=${base.split("/").at(-1)}` : item.href) : `${base}${item.path}`;
    const active = item.href ? pathname.startsWith(item.href) : item.path ? pathname.startsWith(href) : pathname === href;
    return (
      <li>
        <SideLink
          href={href}
          active={active}
          mini={mini}
          label={item.label}
          icon={<Icon className={`size-[18px] ${item.label === "Try it" ? "fill-current" : ""}`} />}
          trailing={item.external ? <ExternalLink className="size-3.5 text-subtle" /> : undefined}
        />
      </li>
    );
  }
  if (mini) {
    return (
      <li>
        <SideLink href={`${base}${item.children[0].path}`} active={childActive} mini label={item.label} icon={<Icon className="size-[18px]" />} />
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={() => setExpanded(!show)}
        aria-expanded={show}
        className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-[14px] transition hover:bg-panel-2 ${childActive ? "font-semibold text-text" : "text-[#26282d]"}`}
      >
        <Icon className="size-[18px]" />
        <span className="flex-1 text-left">{item.label}</span>
        {show ? <ChevronDown className="size-4 text-muted" /> : <ChevronRight className="size-4 text-muted" />}
      </button>
      {show && (
        <ul className="ml-[21px] mt-0.5 space-y-0.5 border-l border-line pl-3">
          {item.children.map((c) => {
            const href = `${base}${c.path}`;
            const active = isActive(c.path);
            return (
              <li key={c.path}>
                <Link href={href} aria-current={active ? "page" : undefined} className={`block rounded-md px-2.5 py-1.5 text-[13px] transition ${active ? "bg-[var(--nav-active)] font-medium text-brand" : "text-muted hover:bg-panel-2 hover:text-text"}`}>
                  {c.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/** The agent being worked on and its workspace, and a quick way to switch agents or start a new one. */
function Switcher({ agents, current, workspace, mini, workspaces }: { agents: SidebarAgent[]; current?: SidebarAgent; workspace: string; mini: boolean; workspaces: { id: string; name: string; current: boolean }[] }) {
  const router = useRouter();
  const switchTo = async (id: string) => {
    await fetch("/api/workspace/switch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId: id }) });
    router.push("/app");
    router.refresh();
  };
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={mini ? current?.name ?? "Agents" : undefined}
        className={`flex w-full items-center gap-2.5 rounded-xl border border-line bg-panel-2/60 text-left transition hover:border-line-strong ${mini ? "justify-center p-2" : "px-3 py-2.5"}`}
      >
        {mini ? (
          current ? <AgentAvatar name={current.displayName} color={current.color} src={current.avatar} size={26} /> : <Bot className="size-5 text-muted" />
        ) : (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold">{current?.name ?? "All agents"}</span>
              <span className="mt-0.5 block truncate text-xs text-muted">{workspace}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted" />
          </>
        )}
      </button>
      {open && (
        <div className={`absolute top-full z-30 mt-1 w-64 overflow-hidden rounded-xl border border-line bg-panel p-1 shadow-raised ${mini ? "left-0" : "inset-x-0 w-auto"}`}>
          <Link href="/app/usage" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-panel-2">
            <Gauge className="size-4 text-muted" /> Usage
          </Link>
          <Link href="/app/workspace" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-panel-2">
            <Users className="size-4 text-muted" /> Workspace settings
          </Link>
          {workspaces.length > 1 && (
            <>
              <div className="my-1 h-px bg-line" />
              <p className="eyebrow px-2.5 pb-1 pt-2">Workspaces</p>
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (!w.current) void switchTo(w.id);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-panel-2"
                >
                  <Users className="size-4 text-muted" />
                  <span className="flex-1 truncate">{w.name}</span>
                  {w.current && <Check className="size-4 text-brand" />}
                </button>
              ))}
            </>
          )}
          <div className="my-1 h-px bg-line" />
          <p className="eyebrow px-2.5 pb-1 pt-2">Agents</p>
          <div className="max-h-64 overflow-y-auto">
            {agents.map((a) => (
              <Link key={a.id} href={`/app/agents/${a.id}`} onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-panel-2">
                <AgentAvatar name={a.displayName} color={a.color} src={a.avatar} size={22} />
                <span className="flex-1 truncate">{a.name}</span>
                {a.id === current?.id && <Check className="size-4 text-brand" />}
              </Link>
            ))}
          </div>
          <div className="my-1 h-px bg-line" />
          <Link href="/app" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-panel-2">
            <Bot className="size-4 text-muted" /> All agents
          </Link>
          <Link href="/app/agents/new" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium hover:bg-panel-2">
            <Plus className="size-4" /> New agent
          </Link>
        </div>
      )}
    </div>
  );
}

/** How much of the agent's setup is done, as a dark card that opens the Getting started page. */
function GettingStarted({ steps, href }: { steps: SidebarAgent["steps"]; href: string }) {
  const done = steps.filter((s) => s.done).length;
  if (!steps.length) return null;
  return (
    <Link href={href} className="mx-3 mb-3 block rounded-xl border border-line bg-white/75 px-3.5 py-3 text-left text-text transition hover:bg-white">
      <span className="block text-sm font-semibold">Getting started</span>
      <span className="block text-xs text-muted">
        {done} / {steps.length} completed
      </span>
      <span className="mt-2.5 flex gap-1">
        {steps.map((s) => (
          <span key={s.title} className={`h-1 flex-1 rounded-full ${s.done ? "bg-brand" : "bg-panel-3"}`} />
        ))}
      </span>
    </Link>
  );
}

function Account({ user, mini }: { user: { name: string; email: string }; mini: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`relative flex items-center gap-2.5 border-t border-line py-3 ${mini ? "justify-center px-2" : "px-4"}`}>
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-panel-3 text-sm font-semibold text-[#1f2937]" aria-hidden>
        {(user.name[0] ?? "?").toUpperCase()}
      </span>
      {!mini && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-muted">{user.email}</span>
          </span>
          <button type="button" onClick={() => setOpen(!open)} className="rounded-md p-1.5 text-muted hover:bg-panel-2" title="Account">
            <MoreHorizontal className="size-4" />
          </button>
        </>
      )}
      {open && (
        <div className="absolute bottom-full right-3 mb-1 w-44 rounded-xl border border-line bg-panel p-1 shadow-raised">
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-panel-2">
              <LogOut className="size-4" /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

/** ⌘K: jump to any page of the agent, or to another agent. */
function CommandMenu({ agents, current, onClose }: { agents: SidebarAgent[]; current?: SidebarAgent; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const items = useMemo(() => {
    const pages: { label: string; hint: string; href: string; icon: typeof Play }[] = current
      ? [
          { label: "Ask Copilot", hint: current.name, href: `/app/agents/${current.id}/backstage`, icon: Sparkles },
          ...[...AGENT_NAV, ...MORE_NAV].flatMap((item) =>
            item.children
              ? item.children.map((c) => ({ label: c.label, hint: [item.label, OLD_NAMES[c.path]].filter(Boolean).join(" · "), href: `/app/agents/${current.id}${c.path}`, icon: item.icon }))
              : [{ label: item.label, hint: [current.name, item.path !== undefined ? OLD_NAMES[item.path] : undefined].filter(Boolean).join(" · "), href: item.href ?? `/app/agents/${current.id}${item.path}`, icon: item.icon }],
          ),
        ]
      : [];
    const all = [
      ...pages,
      ...agents.map((a) => ({ label: a.name, hint: "Agent", href: `/app/agents/${a.id}`, icon: Bot })),
      { label: "New agent", hint: "Create", href: "/app/agents/new", icon: Plus },
      { label: "Usage", hint: "Workspace", href: "/app/usage", icon: Gauge },
      { label: "Workspace settings", hint: "Workspace", href: "/app/workspace", icon: Users },
    ];
    const q = query.trim().toLowerCase();
    return q ? all.filter((i) => `${i.label} ${i.hint}`.toLowerCase().includes(q)) : all;
  }, [agents, current, query]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-[15vh]" onMouseDown={onClose}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-panel shadow-raised" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="size-4 text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") setIndex((i) => Math.min(i + 1, items.length - 1));
              else if (e.key === "ArrowUp") setIndex((i) => Math.max(i - 1, 0));
              else if (e.key === "Enter" && items[index]) go(items[index].href);
            }}
            placeholder="Search pages and agents…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
          />
          <kbd className="rounded border border-line bg-panel-2 px-1.5 text-[10px] text-muted">Esc</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-1.5">
          {items.map((item, i) => (
            <li key={item.href + item.label}>
              <button type="button" onMouseEnter={() => setIndex(i)} onClick={() => go(item.href)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === index ? "bg-panel-2" : ""}`}>
                <item.icon className="size-4 text-muted" />
                <span className="flex-1">{item.label}</span>
                <span className="text-xs text-subtle">{item.hint}</span>
              </button>
            </li>
          ))}
          {!items.length && <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches “{query}”.</li>}
        </ul>
      </div>
    </div>
  );
}
