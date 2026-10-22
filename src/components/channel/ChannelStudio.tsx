"use client";

import {
  AppWindow,
  Bold,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Copy,
  Cpu,
  ExternalLink,
  Focus,
  FileText,
  Globe,
  Italic,
  List,
  ListOrdered,
  Maximize2,
  MessageCircle,
  MessageCircleQuestion,
  Monitor,
  Moon,
  PanelRight,
  Plus,
  Rocket,
  Smartphone,
  Sun,
  Type,
  User,
  X,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AGENT_COLORS, CHAT_LAYOUTS, CHAT_STYLES, COLOR_NAME, LAYOUT_INFO, STYLE_INFO, inkFor, type Agent, type AgentModel, type Brand, type ChannelSettings, type ChatLayout, type SourceKind } from "@/core/agents";
import { AUTO_BLURB, MODEL_KEYS, MODELS } from "@/lib/models";
import { useDraft } from "../agent/useDraft";
import { ChatWindow } from "../chat/ChatWindow";
import { chatVars } from "../chat/look";
import { PageBar } from "../shell/PageBar";
import { StartHere } from "./StartHere";
import { BrandPicker } from "./BrandPicker";
import { Toggle } from "../ui";
import { ChannelPreview } from "./ChannelPreview";

export interface SourceSummary {
  total: number;
  ready: number;
  learning: number;
  chars: number;
  byKind: Record<SourceKind, number>;
}

export const LAYOUT_ICON: Record<ChatLayout, typeof MessageCircle> = { bubble: MessageCircle, panel: PanelRight, focus: Focus, inline: AppWindow, page: Maximize2 };
const TABS = ["Overview", "Display", "Rules", "Actions"] as const;

export interface StudioAction {
  id: string;
  title: string;
  name: string;
  kind: string;
  enabled: boolean;
}
const MAX_SUGGESTIONS = 4;
const creativityWord = (t: number) => (t <= 0.2 ? "Steady" : t <= 0.6 ? "Balanced" : "Varied");
const splitWelcome = (text: string) => text.split(/\n\s*\n/).map((w) => w.trim()).filter(Boolean).slice(0, 4);

/**
 * The playground: the agent's chat channel as visitors will see it, live, beside everything that shapes it. The
 * title switches between the four layouts; Overview holds the model, knowledge and instructions; Display the look;
 * Rules what it must always do. Every change shows in the chat straight away and is kept only when saved.
 */
export function ChannelStudio({ agent, sources, pageUrl, actions, initialChannel }: { agent: Agent; sources: SourceSummary; pageUrl: string; actions: StudioAction[]; initialChannel: ChatLayout }) {
  const c = agent.config;
  const a = c.appearance;
  const [channel, setChannel] = useState<ChatLayout>(initialChannel);
  const { draft, set, dirty, saving, error, save, discard } = useDraft(
    agent.id,
    {
      model: c.model as AgentModel,
      temperature: c.temperature,
      knowledgeOnly: c.knowledgeOnly,
      instructions: c.instructions,
      guardrails: c.guardrails,
      fallback: c.fallback,
      layout: a.layout,
      style: a.style,
      theme: a.theme,
      position: a.position,
      displayName: a.displayName,
      color: a.color,
      welcome: a.welcome.join("\n\n"),
      suggestions: a.suggestions,
      placeholder: a.placeholder,
      showSources: a.showSources,
      avatar: a.avatar ?? "",
      channels: c.channels as Partial<Record<ChatLayout, ChannelSettings>>,
    },
    (d) => ({
      config: {
        model: d.model,
        temperature: d.temperature,
        knowledgeOnly: d.knowledgeOnly,
        instructions: d.instructions,
        guardrails: d.guardrails,
        fallback: d.fallback,
        channels: d.channels,
        appearance: {
          layout: d.layout,
          style: d.style,
          theme: d.theme,
          position: d.position,
          displayName: d.displayName,
          color: d.color,
          welcome: splitWelcome(d.welcome),
          suggestions: d.suggestions.map((s) => s.trim()).filter(Boolean),
          placeholder: d.placeholder,
          showSources: d.showSources,
          avatar: d.avatar,
        },
      },
    }),
  );
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [previewing, setPreviewing] = useState(false);
  const look = {
    displayName: draft.displayName || agent.name,
    color: draft.color,
    welcome: splitWelcome(draft.welcome),
    suggestions: draft.suggestions.map((s) => s.trim()).filter(Boolean),
    placeholder: draft.placeholder,
    theme: draft.theme,
    style: draft.style,
    showSources: draft.showSources,
    ...(draft.avatar ? { avatar: draft.avatar } : {}),
  };
  const extra = dirty
    ? {
        preview: {
          model: draft.model,
          temperature: draft.temperature,
          knowledgeOnly: draft.knowledgeOnly,
          instructions: draft.instructions,
          guardrails: draft.guardrails,
          fallback: draft.fallback,
          channels: draft.channels,
          appearance: { displayName: look.displayName },
        },
        layout: channel,
      }
    : { layout: channel };
  const LayoutIcon = LAYOUT_ICON[channel];

  return (
    <>
      <PageBar
        title={
          <LayoutSwitcher
            value={channel}
            onChange={(next) => {
              setChannel(next);
              window.history.replaceState(null, "", `?channel=${next}`);
            }}
            icon={<LayoutIcon className="size-[18px]" />}
          />
        }
        actions={
          <>
            <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary hidden md:inline-flex" title={agent.enabled ? "Open the public chat page" : "Turn the agent on in Settings to open its public page"}>
              <User className="size-4" /> Chat as user
            </a>
            <button type="button" onClick={() => setPreviewing(true)} className="btn btn-secondary">
              <Monitor className="size-4" /> <span className="hidden sm:inline">Preview</span>
            </button>
            <DeployMenu agentId={agent.id} pageUrl={pageUrl} />
          </>
        }
      />
      <div className="flex flex-col lg:h-[calc(100dvh-4rem)] lg:flex-row">
        <aside className="flex w-full flex-col border-b border-line bg-panel lg:w-[440px] lg:shrink-0 lg:border-b-0 lg:border-r">
          <StartHere agentId={agent.id} />
          <div className="px-5 pt-5">
            <div className="grid grid-cols-4 rounded-xl bg-panel-2 p-1" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`rounded-lg py-2 text-sm font-medium transition ${tab === t ? "bg-panel text-text shadow-sm ring-1 ring-line" : "text-muted hover:text-text"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 pb-6 pt-5">
            {tab === "Overview" && <OverviewTab agentId={agent.id} draft={draft} set={set} sources={sources} channel={channel} />}
            {tab === "Display" && <DisplayTab draft={draft} set={set} agentName={agent.name} brand={c.brand} channel={channel} />}
            {tab === "Rules" && <RulesTab agentId={agent.id} draft={draft} set={set} />}
            {tab === "Actions" && <ActionsTab agentId={agent.id} actions={actions} />}
          </div>
          {dirty && (
            <div className="flex items-center justify-between gap-3 border-t border-line bg-panel px-5 py-3">
              <p className={`text-xs ${error ? "text-bad" : "text-muted"}`}>{error ?? "Unsaved changes, live in the chat."}</p>
              <div className="flex gap-2">
                <button type="button" onClick={discard} disabled={saving} className="btn btn-secondary px-3">Discard</button>
                <button type="button" onClick={() => void save()} disabled={saving} className="btn btn-primary px-3">{saving ? "Saving…" : "Save"}</button>
              </div>
            </div>
          )}
        </aside>
        <Canvas agentId={agent.id} look={look} layout={channel} position={draft.position} extra={extra} />
      </div>
      {previewing && (
        <PreviewDialog
          onClose={() => setPreviewing(false)}
          render={(device) => (
            <ChannelPreview agentId={agent.id} businessName={agent.name} look={look} layout={channel} position={draft.position} device={device} pageUrl={pageUrl} extra={extra} />
          )}
        />
      )}
    </>
  );
}

// ── The title: which of the four layouts ─────────────────────────────────────────────────────────────────────────

function LayoutSwitcher({ value, onChange, icon }: { value: ChatLayout; onChange: (l: ChatLayout) => void; icon: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useOutside<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div ref={box} className="relative flex items-center gap-3">
      <span className="inline-flex size-8 items-center justify-center rounded-lg bg-brand-tint text-brand">{icon}</span>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex items-center gap-1.5 rounded-lg px-1 py-1 hover:bg-panel-2">
        {LAYOUT_INFO[value].name} <ChevronsUpDown className="size-4 text-muted" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-80 rounded-xl border border-line bg-panel p-1.5 text-sm font-normal shadow-raised">
          <p className="eyebrow px-2.5 pb-1 pt-1.5">Chat channel layout</p>
          {CHAT_LAYOUTS.map((l) => {
            const Icon = LAYOUT_ICON[l];
            return (
              <button
                key={l}
                type="button"
                onClick={() => {
                  onChange(l);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-panel-2 ${l === value ? "bg-panel-2" : ""}`}
              >
                <Icon className="mt-0.5 size-4 text-muted" />
                <span className="flex-1">
                  <span className="block font-medium">{LAYOUT_INFO[l].name}</span>
                  <span className="block text-xs text-muted">{LAYOUT_INFO[l].text}</span>
                </span>
                {l === value && <Check className="mt-0.5 size-4 text-brand" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DeployMenu({ agentId, pageUrl }: { agentId: string; pageUrl: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useOutside<HTMLDivElement>(open, () => setOpen(false));
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="btn btn-primary">
        <span className="hidden sm:inline">Put it live</span> <Rocket className="size-4 sm:hidden" /> <ChevronDown className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-line bg-panel p-1.5 text-sm shadow-raised">
          <Link href={`/app/agents/${agentId}/channels`} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-panel-2">
            <Rocket className="size-4 text-muted" /> Add to your website
          </Link>
          <Link href={`/app/agents/${agentId}/integrations`} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-panel-2">
            <MessageCircle className="size-4 text-muted" /> Connect a messaging app
          </Link>
          <a href={pageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-panel-2">
            <ExternalLink className="size-4 text-muted" /> Open the chat page
          </a>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(pageUrl).then(() => setCopied(true));
              setTimeout(() => setCopied(false), 1500);
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-panel-2"
          >
            {copied ? <Check className="size-4 text-good" /> : <Copy className="size-4 text-muted" />} {copied ? "Link copied" : "Copy the chat page link"}
          </button>
        </div>
      )}
    </div>
  );
}

function useOutside<T extends HTMLElement>(active: boolean, onOutside: () => void) {
  const ref = useRef<T>(null);
  const handler = useRef(onOutside);
  useEffect(() => {
    handler.current = onOutside;
  });
  useEffect(() => {
    if (!active) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && handler.current();
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [active]);
  return ref;
}

// ── The canvas: the chat as visitors see it ──────────────────────────────────────────────────────────────────────

function Canvas({ agentId, look, layout, position, extra }: { agentId: string; look: Parameters<typeof ChatWindow>[0]["look"]; layout: ChatLayout; position: "left" | "right"; extra?: Record<string, unknown> }) {
  const [open, setOpen] = useState(true);
  const launcher = layout === "bubble" || layout === "panel" || layout === "focus";
  const width = layout === "page" ? "max-w-[760px]" : layout === "inline" || layout === "focus" ? "max-w-[640px]" : "max-w-[420px]";
  return (
    <div className="relative flex min-h-[640px] flex-1 flex-col items-center bg-[#fafafa] bg-[radial-gradient(#d7d9de_1px,transparent_1px)] px-4 py-6 [background-size:18px_18px] sm:px-8">
      <div className={`flex w-full flex-1 flex-col ${width} ${launcher && position === "left" ? "self-start" : ""} ${launcher && position === "right" ? "sm:self-end lg:self-center" : ""}`}>
        {open || !launcher ? (
          <ChatWindow
            agentId={agentId}
            key={layout}
            look={look}
            endpoint={`/api/agents/${agentId}/chat`}
            extra={extra}
            details
            onClose={launcher ? () => setOpen(false) : undefined}
            className="h-[min(680px,calc(100dvh-13rem))] min-h-[480px] w-full rounded-2xl"
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted">The chat is closed. Click the {layout === "panel" ? "tab" : "button"} to open it, as a visitor would.</div>
        )}
        {launcher && (
          <div className={`mt-4 flex ${position === "left" ? "justify-start" : "justify-end"}`}>
            {layout === "bubble" ? (
              <button
                type="button"
                onClick={() => setOpen(!open)}
                className="inline-flex size-14 items-center justify-center rounded-full shadow-raised transition hover:scale-105"
                style={{ background: look.color, color: inkFor(look.color) }}
                aria-label={open ? "Close the chat" : "Open the chat"}
              >
                {open ? <ChevronDown className="size-6" /> : <MessageCircle className="size-6" />}
              </button>
            ) : (
              <button type="button" onClick={() => setOpen(!open)} className={`px-4 py-2 text-sm font-semibold shadow-raised ${layout === "focus" ? "rounded-full" : "rounded-lg"}`} style={{ background: look.color, color: inkFor(look.color) }}>
                {open ? (layout === "focus" ? "Close" : "Close the panel") : layout === "focus" ? "Ask a question" : "Chat with us"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PreviewDialog({ onClose, render }: { onClose: () => void; render: (device: "desktop" | "mobile") => ReactNode }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4 sm:p-8" onMouseDown={onClose}>
      <div className="mx-auto max-w-[1200px]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="inline-flex rounded-lg bg-panel p-0.5 shadow-sm">
            {(["desktop", "mobile"] as const).map((d) => (
              <button key={d} type="button" onClick={() => setDevice(d)} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium ${device === d ? "bg-ink text-white" : "text-muted"}`}>
                {d === "desktop" ? <Monitor className="size-3.5" /> : <Smartphone className="size-3.5" />} {d === "desktop" ? "Desktop" : "Phone"}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg bg-panel px-3 py-1.5 text-xs font-medium shadow-sm">
            <X className="size-3.5" /> Close preview
          </button>
        </div>
        <div key={device}>{render(device)}</div>
      </div>
    </div>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────────────────────────────────────────

type Draft = ReturnType<typeof useDraft<{
  model: AgentModel;
  temperature: number;
  knowledgeOnly: boolean;
  instructions: string;
  guardrails: string;
  fallback: string;
  layout: ChatLayout;
  style: (typeof CHAT_STYLES)[number];
  theme: "light" | "dark";
  position: "left" | "right";
  displayName: string;
  color: string;
  welcome: string;
  suggestions: string[];
  placeholder: string;
  showSources: boolean;
  avatar: string;
  channels: Partial<Record<ChatLayout, ChannelSettings>>;
}>>;

function Heading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <h3 className="text-[15px] font-semibold">{children}</h3>
      {aside}
    </div>
  );
}


function OverviewTab({ agentId, draft, set, sources, channel }: { agentId: string; draft: Draft["draft"]; set: Draft["set"]; sources: SourceSummary; channel: ChatLayout }) {
  const own = draft.channels[channel];
  const synced = own?.syncInstructions ?? true;
  const setOwn = (patch: Partial<ChannelSettings>) =>
    set({ channels: { ...draft.channels, [channel]: { syncInstructions: synced, instructions: own?.instructions ?? draft.instructions, ...patch } } });
  const editor = useRef<HTMLTextAreaElement>(null);
  const kb = Math.max(sources.chars ? 1 : 0, Math.round(sources.chars / 1024));
  const status = !sources.total ? { label: "Nothing yet", tone: "text-muted", dot: "bg-subtle" } : sources.learning ? { label: "Learning", tone: "text-warn", dot: "bg-warn" } : { label: "Ready", tone: "text-good", dot: "bg-good" };

  const value = synced ? draft.instructions : (own?.instructions ?? draft.instructions);
  const setValue = (text: string) => (synced ? set({ instructions: text }) : setOwn({ instructions: text }));

  function wrap(before: string, after = before) {
    const el = editor.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    setValue(`${value.slice(0, s)}${before}${value.slice(s, e) || "text"}${after}${value.slice(e)}`);
    requestAnimationFrame(() => el.focus());
  }
  function list(numbered: boolean) {
    const el = editor.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const start = value.lastIndexOf("\n", s - 1) + 1;
    const lines = value.slice(start, e).split("\n").map((line, i) => `${numbered ? `${i + 1}. ` : "- "}${line.replace(/^(\d+\.|-)\s+/, "")}`);
    setValue(`${value.slice(0, start)}${lines.join("\n")}${value.slice(e)}`);
    requestAnimationFrame(() => el.focus());
  }

  const kinds: { kind: SourceKind; label: string; icon: typeof Globe }[] = [
    { kind: "website", label: "Website pages", icon: Globe },
    { kind: "file", label: "Files", icon: FileText },
    { kind: "text", label: "Text", icon: Type },
    { kind: "qa", label: "Q&A", icon: MessageCircleQuestion },
  ];

  return (
    <div className="space-y-7">
      <section>
        <Heading>Speed and care</Heading>
        <div className="relative">
          <Cpu className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <select value={draft.model} onChange={(e) => set({ model: e.target.value as AgentModel })} className="field appearance-none py-2.5 pl-9 pr-9" aria-label="Speed and care">
            {MODEL_KEYS.map((k) => (
              <option key={k} value={k}>
                {MODELS[k].plain} · {MODELS[k].name}
              </option>
            ))}
            <option value="auto">Automatic: fast when it can be (lower cost)</option>
          </select>
          <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        </div>
        <p className="mt-2 rounded-lg bg-brand-tint/60 px-3 py-2 text-xs text-[#2b3a8c]">
          {draft.model === "auto" ? AUTO_BLURB : MODELS[draft.model].blurb}
        </p>
      </section>

      <section>
        <Heading
          aside={
            <Link href={`/app/agents/${agentId}/sources`} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
              <Plus className="size-3.5" /> Add
            </Link>
          }
        >
          Knowledge
        </Heading>
        <div className="rounded-xl bg-panel-2/70 p-4">
          <div className="flex items-center justify-between">
            <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${status.tone}`}>
              <span className={`size-1.5 rounded-full ${status.dot}`} /> {status.label}
            </span>
            <span className="rounded-md border border-line bg-panel px-2 py-0.5 text-xs font-medium">{kb} KB</span>
          </div>
          <p className="mt-2 text-xs text-muted">
            {sources.total ? `${sources.ready} of ${sources.total} source${sources.total === 1 ? "" : "s"} ready` : "Add your website or documents so it can answer."}
          </p>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-panel-3">
            <div className="h-full rounded-full bg-text/70" style={{ width: `${sources.total ? (sources.ready / sources.total) * 100 : 0}%` }} />
          </div>
        </div>
        <div className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line">
          {kinds
            .filter((k) => sources.byKind[k.kind] || k.kind === "website")
            .map(({ kind, label, icon: Icon }) => (
              <Link key={kind} href={`/app/agents/${agentId}/sources`} className="flex items-center gap-3 px-4 py-3 text-sm transition hover:bg-panel-2">
                <Icon className="size-4 text-muted" /> <span className="flex-1">{label}</span> <span className="text-muted">{sources.byKind[kind]}</span>
              </Link>
            ))}
        </div>
      </section>

      <section>
        <Heading>Instructions</Heading>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">Sync with the agent&apos;s instructions</span>
          <Toggle checked={synced} onChange={(on) => setOwn({ syncInstructions: on })} label="Sync with the agent's instructions" />
        </div>
        <p className="mt-1 text-xs text-muted">
          {synced
            ? `You're editing the agent's instructions: changes apply to every channel that follows them.`
            : `This ${LAYOUT_INFO[channel].name.toLowerCase()} has its own instructions, used only here.`}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm">Answer only from what it knows</span>
          <Toggle checked={draft.knowledgeOnly} onChange={(knowledgeOnly) => set({ knowledgeOnly })} label="Answer only from what it knows" />
        </div>
        <div className="mt-3 overflow-hidden rounded-xl border border-line-strong focus-within:border-brand">
          <div className="flex items-center gap-0.5 border-b border-line bg-panel-2/50 px-2 py-1.5">
            <button type="button" onClick={() => wrap("**")} title="Bold" className="rounded-md p-1.5 text-muted hover:bg-panel hover:text-text">
              <Bold className="size-4" />
            </button>
            <button type="button" onClick={() => wrap("*")} title="Italic" className="rounded-md p-1.5 text-muted hover:bg-panel hover:text-text">
              <Italic className="size-4" />
            </button>
            <span className="mx-1 h-4 w-px bg-line-strong" />
            <button type="button" onClick={() => list(false)} title="Bulleted list" className="rounded-md p-1.5 text-muted hover:bg-panel hover:text-text">
              <List className="size-4" />
            </button>
            <button type="button" onClick={() => list(true)} title="Numbered list" className="rounded-md p-1.5 text-muted hover:bg-panel hover:text-text">
              <ListOrdered className="size-4" />
            </button>
            <Link href={`/app/agents/${agentId}/instructions`} title="Open all behaviour settings" className="ml-auto rounded-md p-1.5 text-muted hover:bg-panel hover:text-text">
              <Maximize2 className="size-4" />
            </Link>
          </div>
          <textarea ref={editor} value={value} onChange={(e) => setValue(e.target.value)} rows={11} className="block w-full resize-y bg-panel px-4 py-3 text-sm leading-relaxed outline-none" maxLength={8000} aria-label="Instructions" />
        </div>
      </section>

      <section>
        <Heading aside={<span className="text-xs font-medium text-muted">{creativityWord(draft.temperature)}</span>}>Wording</Heading>
        <input type="range" min={0} max={1} step={0.1} value={draft.temperature} onChange={(e) => set({ temperature: Number(e.target.value) })} className="w-full accent-[var(--ink)]" aria-label="Wording" />
        <div className="mt-1 flex justify-between text-[11px] text-subtle">
          <span>Same careful answer</span>
          <span>More varied wording</span>
        </div>
      </section>
    </div>
  );
}

function Disclosure({ title, open: initial = false, children }: { title: string; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="border-b border-line">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between py-4 text-left text-[15px] font-semibold">
        {title}
        <ChevronDown className={`size-4 text-muted transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="space-y-4 pb-5">{children}</div>}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg bg-panel-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${value === o.value ? "bg-panel text-text shadow-sm" : "text-muted hover:text-text"}`}
        >
          {o.icon} {o.label}
        </button>
      ))}
    </div>
  );
}

function StyleSketch({ style, color, theme }: { style: (typeof CHAT_STYLES)[number]; color: string; theme: "light" | "dark" }) {
  return (
    <div className="h-14 w-full overflow-hidden rounded-md border border-line bg-[var(--c-bg)]" style={chatVars({ color, theme, style })}>
      <div className="h-3 bg-[var(--c-header-bg)]" style={style === "bold" ? undefined : { borderBottom: "1px solid var(--c-line)" }} />
      <div className="space-y-1 p-1.5">
        <div className="h-2 w-3/5 rounded-full" style={{ background: style === "minimal" ? "var(--c-line)" : "var(--c-agent-bg)" }} />
        <div className="ml-auto h-2 w-2/5 rounded-full bg-[var(--c-user-bg)]" />
      </div>
    </div>
  );
}

function DisplayTab({ draft, set, agentName, brand, channel }: { draft: Draft["draft"]; set: Draft["set"]; agentName: string; brand: Brand; channel: ChatLayout }) {
  const custom = !(AGENT_COLORS as readonly string[]).includes(draft.color);
  return (
    <div className="-mt-2">
      <Disclosure title="Brand" open>
        <BrandPicker brand={brand} name={draft.displayName || agentName} color={draft.color} avatar={draft.avatar} onColor={(color) => set({ color })} onAvatar={(avatar) => set({ avatar })} />
        {!brand.colors.length && !brand.logo && <p className="text-xs text-muted">Read your website in What it knows, and Keel picks up your logo and colours too.</p>}
      </Disclosure>
      <Disclosure title="Content">
        <label className="block">
          <span className="label">Name visitors see</span>
          <input value={draft.displayName} onChange={(e) => set({ displayName: e.target.value })} className="field" maxLength={60} placeholder={agentName} />
        </label>
        <label className="block">
          <span className="label">First message</span>
          <textarea value={draft.welcome} onChange={(e) => set({ welcome: e.target.value })} rows={3} className="field resize-y" maxLength={1200} />
          <span className="hint block">Leave a blank line between two messages to send both.</span>
        </label>
        <div>
          <span className="label">Suggested questions</span>
          <div className="space-y-2">
            {draft.suggestions.map((s, i) => (
              <div key={i} className="flex gap-2">
                <input value={s} onChange={(e) => set({ suggestions: draft.suggestions.map((x, j) => (j === i ? e.target.value : x)) })} className="field" maxLength={120} aria-label={`Suggested question ${i + 1}`} />
                <button type="button" onClick={() => set({ suggestions: draft.suggestions.filter((_, j) => j !== i) })} className="btn btn-ghost px-2" title="Remove">
                  <X className="size-4" />
                </button>
              </div>
            ))}
            {draft.suggestions.length < MAX_SUGGESTIONS && (
              <button type="button" onClick={() => set({ suggestions: [...draft.suggestions, ""] })} className="btn btn-secondary w-full">
                <Plus className="size-4" /> Add a question
              </button>
            )}
          </div>
        </div>
        <label className="block">
          <span className="label">Message box hint</span>
          <input value={draft.placeholder} onChange={(e) => set({ placeholder: e.target.value })} className="field" maxLength={80} />
        </label>
      </Disclosure>

      <Disclosure title="Style">
        <div className="grid grid-cols-2 gap-2">
          {CHAT_STYLES.map((s) => (
            <button key={s} type="button" onClick={() => set({ style: s })} aria-pressed={draft.style === s} className={`relative rounded-xl border p-2 text-left transition ${draft.style === s ? "border-ink ring-1 ring-ink" : "border-line hover:border-line-strong"}`}>
              <StyleSketch style={s} color={draft.color} theme={draft.theme} />
              <span className="mt-1.5 block text-xs font-semibold">{STYLE_INFO[s].name}</span>
              <span className="block text-[11px] leading-snug text-muted">{STYLE_INFO[s].text}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Theme</span>
          <Segmented value={draft.theme} onChange={(theme) => set({ theme })} options={[{ value: "light", label: "Light", icon: <Sun className="size-3.5" /> }, { value: "dark", label: "Dark", icon: <Moon className="size-3.5" /> }]} />
        </div>
        <div>
          <span className="label">Colour</span>
          <div className="flex flex-wrap items-center gap-2">
            {AGENT_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => set({ color })}
                className="inline-flex size-7 items-center justify-center rounded-full"
                style={{ background: color, boxShadow: draft.color === color ? `0 0 0 2px var(--panel), 0 0 0 4px ${color}` : undefined }}
                aria-label={COLOR_NAME[color]}
                aria-pressed={draft.color === color}
              >
                {draft.color === color && <Check className="size-3.5" style={{ color: inkFor(color) }} />}
              </button>
            ))}
            <label className={`relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${custom ? "border-text" : "border-line-strong"}`}>
              <span className="size-3 rounded-full border border-line" style={{ background: draft.color }} /> Your own
              <input type="color" value={draft.color} onChange={(e) => set({ color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Choose your own colour" />
            </label>
          </div>
        </div>
      </Disclosure>

      <Disclosure title={`${LAYOUT_INFO[channel].name} on your website`}>
        <p className="text-xs text-muted">{LAYOUT_INFO[channel].text} Switch channel with the title above.</p>
        {(channel === "bubble" || channel === "panel" || channel === "focus") && (
          <div className="flex items-center justify-between">
            <span className="text-sm">Side of the page</span>
            <Segmented value={draft.position} onChange={(position) => set({ position })} options={[{ value: "left", label: "Left" }, { value: "right", label: "Right" }]} />
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm">Main layout for the embed code</span>
          <button type="button" onClick={() => set({ layout: channel })} disabled={draft.layout === channel} className="btn btn-secondary px-3 py-1.5 text-xs">
            {draft.layout === channel ? "This is the main one" : "Make it the main one"}
          </button>
        </div>
      </Disclosure>

      <Disclosure title="Sources">
        <div className="flex items-start justify-between gap-4">
          <span>
            <span className="block text-sm">Show visitors where answers come from</span>
            <span className="text-xs text-muted">Each answer lists the pages or documents it used.</span>
          </span>
          <Toggle checked={draft.showSources} onChange={(showSources) => set({ showSources })} label="Show sources" />
        </div>
      </Disclosure>
    </div>
  );
}

/** The agent's actions, on or off for its chat; the full settings are in Build › Actions. */
function ActionsTab({ agentId, actions }: { agentId: string; actions: StudioAction[] }) {
  const [list, setList] = useState(actions);
  async function toggle(id: string, enabled: boolean) {
    setList((l) => l.map((a) => (a.id === id ? { ...a, enabled } : a)));
    await fetch(`/api/agents/${agentId}/actions/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
  }
  if (!list.length)
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-panel-2 text-muted">
          <Zap className="size-5" />
        </span>
        <p className="mt-3 font-semibold">No actions yet</p>
        <p className="mt-1 max-w-xs text-sm text-muted">Actions let the agent do things in the chat: open a ticket, collect leads, look up an order.</p>
        <Link href={`/app/agents/${agentId}/actions`} className="btn btn-primary mt-4">
          <Plus className="size-4" /> Add an action
        </Link>
      </div>
    );
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line">
        {list.map((a) => (
          <li key={a.id} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{a.title}</span>
              <span className="block truncate font-mono text-[11px] text-muted">{a.name}</span>
            </span>
            <Toggle checked={a.enabled} onChange={(on) => void toggle(a.id, on)} label={`Turn ${a.title} on or off`} />
          </li>
        ))}
      </ul>
      <Link href={`/app/agents/${agentId}/actions`} className="link text-sm">
        All action settings
      </Link>
    </div>
  );
}

function RulesTab({ agentId, draft, set }: { agentId: string; draft: Draft["draft"]; set: Draft["set"] }) {
  return (
    <div className="space-y-7">
      <section>
        <Heading>Rules it always follows</Heading>
        <p className="mb-2.5 text-xs text-muted">Whatever anyone asks. For example: topics to stay away from, or things it must never promise.</p>
        <textarea value={draft.guardrails} onChange={(e) => set({ guardrails: e.target.value })} rows={7} className="field resize-y leading-relaxed" maxLength={4000} aria-label="Rules it always follows" />
      </section>
      <section>
        <Heading>When it doesn&apos;t know</Heading>
        <p className="mb-2.5 text-xs text-muted">{draft.knowledgeOnly ? "What it says when your information doesn't answer the question." : "Turn on “Answer only from what it knows” in Overview to use this."}</p>
        <textarea value={draft.fallback} onChange={(e) => set({ fallback: e.target.value })} rows={3} className="field resize-y" maxLength={500} disabled={!draft.knowledgeOnly} aria-label="What it says when it doesn't know" />
      </section>
      <Link href={`/app/agents/${agentId}/instructions`} className="flex items-center justify-between rounded-xl border border-line px-4 py-3 text-sm transition hover:bg-panel-2">
        <span>
          <span className="block font-medium">Business profile and all behaviour settings</span>
          <span className="text-xs text-muted">What it knows about your business as a whole</span>
        </span>
        <ExternalLink className="size-4 text-muted" />
      </Link>
    </div>
  );
}
