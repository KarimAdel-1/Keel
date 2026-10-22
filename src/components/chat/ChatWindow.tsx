"use client";

import { ExternalLink, ImagePlus, Square, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { ChatWidget as Widget } from "@/core/widgets";
import { tokenCount } from "@/lib/models";
import type { Citation } from "@/platform/chat/answer";
import { ChatWidget } from "./ChatWidget";
import { AgentBubble, ChatFrame, InputShell, PoweredBy, SendButton, SuggestionChips, UserBubble, type ChatLook } from "./parts";
import { RichText } from "./RichText";
import { readEvents } from "./stream";

/** A photo the visitor attached: shown in their bubble, and sent as base64. */
type Photo = { url: string; data: string };

type Msg = {
  id: number;
  role: "user" | "assistant" | "team" | "note";
  text: string;
  photo?: Photo;
  /** The model that read the visitor's photo, for the builder. */
  pictureModel?: string;
  state: "streaming" | "done" | "error";
  citations?: Citation[];
  model?: string;
  tokens?: number;
  kept?: boolean;
  confidence?: number;
  actions?: { name: string; error?: string }[];
  widgets?: Widget[];
  followups?: string[];
  procedure?: string;
  author?: string;
  error?: string;
};

let nextId = 1;

/** The largest side of a photo as it's sent: enough to read a label, and quick to send from a phone. */
const PHOTO_SIDE = 1600;

/** A photo shrunk in the browser before it's sent, as a JPEG. */
async function shrinkPhoto(file: File): Promise<Photo> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const url = canvas.toDataURL("image/jpeg", 0.85);
  return { url, data: url.slice(url.indexOf(",") + 1) };
}

/** How often the chat checks for a team member's reply while a person has the conversation. */
const TEAM_POLL_MS = 4000;
/** Where a visitor's conversation is remembered in their browser, so it carries on on the website's next page. */
const rememberKey = (agentId: string) => `keel-chat:${agentId}`;

/**
 * A live chat with an agent, in the agent's own look: the same window the builder tests and visitors use. Replies
 * stream in, each with the sources it came from, any widgets (forms, cards…) and suggested next questions. When a
 * person from the team takes over, their replies appear here as they're sent. `endpoint` is where messages go (the
 * builder's test chat or the public one); `extra` is sent with each message. `details` adds, for the builder, the
 * model, the tokens it used, confidence, actions called and the procedure followed.
 */
export function ChatWindow({
  agentId,
  look,
  endpoint,
  extra,
  details = false,
  subtitle,
  emptyHint,
  footer,
  onClose,
  branding = true,
  className = "rounded-2xl",
  remember,
}: {
  agentId: string;
  look: ChatLook;
  endpoint: string;
  extra?: Record<string, unknown>;
  details?: boolean;
  subtitle?: string;
  emptyHint?: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  /** "Powered by Keel" above the message box. */
  branding?: boolean;
  className?: string;
  /** The public chat: the conversation carries on when the visitor opens another page (by their browser's visitor id). */
  remember?: { visitor?: string };
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoProblem, setPhotoProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<{ id: number; n: number } | null>(null);
  const [withTeam, setWithTeam] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const lastTeamId = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => () => abort.current?.abort(), []);

  // The visitor's conversation from an earlier page, if it's still recent: its messages, and the team if it has it.
  const visitor = remember?.visitor;
  useEffect(() => {
    if (!visitor) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(rememberKey(agentId));
    } catch {}
    if (!saved) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/chat/${agentId}/history?conversationId=${encodeURIComponent(saved)}&visitor=${encodeURIComponent(visitor)}`).catch(() => undefined);
      if (cancelled) return;
      if (!res?.ok) {
        try {
          localStorage.removeItem(rememberKey(agentId));
        } catch {}
        return;
      }
      const body = (await res.json()) as { messages: { id: number; role: "user" | "assistant" | "human"; text: string; author?: string }[]; withTeam: boolean; ticketOpen: boolean };
      if (cancelled || !body.messages.length) return;
      lastTeamId.current = Math.max(0, ...body.messages.filter((m) => m.role === "human").map((m) => m.id));
      setMessages(body.messages.map((m) => ({ id: nextId++, role: m.role === "human" ? "team" : m.role, text: m.text, state: "done", ...(m.author ? { author: m.author } : {}) })));
      setConversationId(saved);
      setWithTeam(body.withTeam);
      setTicketOpen(body.ticketOpen);
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, visitor]);

  // While the team has the conversation, or a ticket is open for it, their replies are fetched as they come: the first
  // reply on a ticket turns the chat into a live chat with the team.
  useEffect(() => {
    if ((!withTeam && !ticketOpen) || !conversationId) return;
    const timer = setInterval(async () => {
      const res = await fetch(`/api/chat/${agentId}/messages?conversationId=${encodeURIComponent(conversationId)}&after=${lastTeamId.current}`).catch(() => undefined);
      if (!res?.ok) return;
      const body = (await res.json()) as { messages: { id: number; content: string; author?: string }[]; withTeam: boolean; ticketOpen: boolean };
      if (body.messages.length) {
        lastTeamId.current = body.messages.at(-1)!.id;
        setMessages((m) => [...m, ...body.messages.map((x) => ({ id: nextId++, role: "team" as const, text: x.content, author: x.author, state: "done" as const }))]);
      }
      setWithTeam(body.withTeam);
      setTicketOpen(body.ticketOpen);
    }, TEAM_POLL_MS);
    return () => clearInterval(timer);
  }, [withTeam, ticketOpen, conversationId, agentId]);

  async function send(text: string, attached: Photo | null = photo) {
    const message = text.trim();
    if ((!message && !attached) || busy) return;
    const reply: Msg = { id: nextId++, role: "assistant", text: "", state: "streaming" };
    setMessages((m) => [...m, { id: nextId++, role: "user", text: message, ...(attached ? { photo: attached } : {}), state: "done" }, ...(withTeam ? [] : [reply])]);
    setDraft("");
    setPhoto(null);
    setPhotoProblem(null);
    setOpened(null);
    if (input.current) input.current.style.height = "";
    setBusy(true);
    const controller = new AbortController();
    abort.current = controller;
    const update = (patch: Partial<Msg> | ((m: Msg) => Partial<Msg>)) =>
      setMessages((all) => all.map((m) => (m.id === reply.id ? { ...m, ...(typeof patch === "function" ? patch(m) : patch) } : m)));
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...extra, message, conversationId, ...(attached ? { picture: attached.data } : {}) }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        update({ state: "error", error: body.error ?? "The agent couldn't answer. Please try again." });
        return;
      }
      await readEvents(res, (event, data) => {
        const d = data as Record<string, unknown>;
        if (event === "start") {
          setConversationId(d.conversationId as string);
          if (visitor) {
            try {
              localStorage.setItem(rememberKey(agentId), d.conversationId as string);
            } catch {}
          }
        }
        else if (event === "text") update((m) => ({ text: m.text + (d.t as string) }));
        else if (event === "done") {
          const status = d.status as string | undefined;
          if (status === "with_team") {
            setMessages((all) => all.filter((m) => m.id !== reply.id));
            setWithTeam(true);
            return;
          }
          update({
            text: d.text as string,
            citations: d.citations as Citation[],
            model: d.model as string | undefined,
            tokens: d.tokens as number | undefined,
            kept: d.kept === true,
            confidence: d.confidence as number | undefined,
            actions: d.actions as Msg["actions"],
            widgets: d.widgets as Widget[] | undefined,
            followups: d.followups as string[] | undefined,
            procedure: d.procedure as string | undefined,
            pictureModel: d.pictureModel as string | undefined,
            state: "done",
          });
          if ((d.actions as Msg["actions"])?.some((a) => a.name.includes("hand_over")) || d.handedOver) setWithTeam(true);
          if (d.ticketOpen === true) setTicketOpen(true);
        } else if (event === "error") update({ state: "error", error: d.message as string });
      });
      update((m) => (m.state === "streaming" ? { state: "done" } : {}));
    } catch {
      if (controller.signal.aborted) update((m) => ({ state: "done", text: m.text || "(Stopped)" }));
      else update({ state: "error", error: "The connection dropped. Check your internet connection and try again." });
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  function retry(failed: Msg) {
    const index = messages.findIndex((m) => m.id === failed.id);
    const question = messages[index - 1];
    if (!question || question.role !== "user") return;
    setMessages((all) => all.filter((m) => m.id !== failed.id && m.id !== question.id));
    void send(question.text, question.photo ?? null);
  }

  function reset() {
    abort.current?.abort();
    try {
      localStorage.removeItem(rememberKey(agentId));
    } catch {}
    setConversationId(undefined);
    setWithTeam(false);
    setTicketOpen(false);
    lastTeamId.current = 0;
    setMessages([]);
    setOpened(null);
    input.current?.focus();
  }

  async function attach(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setPhotoProblem("Choose a photo or a picture.");
    try {
      setPhoto(await shrinkPhoto(file));
      setPhotoProblem(null);
    } catch {
      setPhotoProblem("That photo couldn't be opened. Try a JPEG or PNG.");
    }
    input.current?.focus();
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  }

  const toggle = (id: number, n: number) => setOpened(opened?.id === id && opened.n === n ? null : { id, n });
  const started = messages.length > 0;
  const last = messages.at(-1);
  const followups = last?.role === "assistant" && last.state === "done" && !busy ? (last.followups ?? []) : [];
  return (
    <ChatFrame look={look} subtitle={subtitle} onClose={onClose} onRestart={started ? reset : undefined} className={className}>
      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-5 py-5" aria-live="polite">
        {look.welcome.filter(Boolean).map((w, i) => (
          <AgentBubble key={`w${i}`} look={look}>{w}</AgentBubble>
        ))}
        {!started && emptyHint}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex flex-col items-end gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- the visitor's own photo, from their device */}
              {m.photo && <img src={m.photo.url} alt="Your photo" className="max-h-44 max-w-[70%] rounded-xl border border-[var(--c-line)] object-cover" />}
              {m.text && <UserBubble>{m.text}</UserBubble>}
            </div>
          ) : m.role === "team" ? (
            <div key={m.id} className="space-y-1">
              <p className="flex items-center gap-1.5 pl-1 text-[11px] text-[var(--c-muted)]">
                <UserRound className="size-3" /> {m.author ?? "Team"}
              </p>
              <AgentBubble look={look}>
                <p className="whitespace-pre-wrap">{m.text}</p>
              </AgentBubble>
            </div>
          ) : (
            <div key={m.id} className="space-y-1.5">
              {m.state === "error" ? (
                <div className="max-w-[88%] rounded-2xl bg-[#fdeeed] px-3.5 py-2.5 text-sm text-[#b42318]">
                  {m.error}{" "}
                  <button type="button" onClick={() => retry(m)} className="font-medium underline underline-offset-2">Try again</button>
                </div>
              ) : (
                (m.text || m.state === "streaming") && (
                  <AgentBubble look={look}>
                    {m.text ? (
                      <RichText text={m.text} onCite={look.showSources || details ? (n) => toggle(m.id, n) : undefined} />
                    ) : (
                      <span className="inline-flex gap-1 py-1" aria-label="Writing">
                        {[0, 1, 2].map((i) => (
                          <span key={i} className="size-1.5 animate-bounce rounded-full bg-[var(--c-muted)]" style={{ animationDelay: `${i * 120}ms` }} />
                        ))}
                      </span>
                    )}
                  </AgentBubble>
                )
              )}
              {m.widgets?.map((w, i) => (
                <div key={i} className="max-w-[92%]">
                  <ChatWidget widget={w} agentId={agentId} conversationId={conversationId} onSend={(t) => void send(t)} />
                </div>
              ))}
              {m.state === "done" && (look.showSources || details) && <Sources message={m} opened={opened?.id === m.id ? opened.n : undefined} onOpen={(n) => toggle(m.id, n)} details={details} />}
            </div>
          ),
        )}
        {withTeam && (
          <p className="rounded-xl border border-dashed border-[var(--c-line)] px-3 py-2 text-center text-xs text-[var(--c-muted)]">Someone from the team has this conversation and will reply here.</p>
        )}
      </div>
      {!started && look.suggestions.length > 0 && (
        <div className="px-4 pb-3">
          <SuggestionChips suggestions={look.suggestions} onPick={(s) => void send(s)} disabled={busy} />
        </div>
      )}
      {followups.length > 0 && (
        <div className="px-4 pb-3">
          <SuggestionChips suggestions={followups} onPick={(s) => void send(s)} disabled={busy} />
        </div>
      )}
      <form onSubmit={submit} className="px-4 pb-4">
        {branding && <PoweredBy />}
        {photo && (
          <div className="mb-2 flex items-center gap-2">
            <span className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- the visitor's own photo, from their device */}
              <img src={photo.url} alt="Photo to send" className="size-14 rounded-lg border border-[var(--c-line)] object-cover" />
              <button type="button" onClick={() => setPhoto(null)} aria-label="Remove the photo" className="absolute -right-1.5 -top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-[var(--c-text)] text-[var(--c-bg,#fff)]">
                <X className="size-3" />
              </button>
            </span>
            <span className="text-xs text-[var(--c-muted)]">Add a message, or just send the photo.</span>
          </div>
        )}
        {photoProblem && <p className="mb-2 text-xs text-[#b42318]">{photoProblem}</p>}
        <InputShell>
          <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/*" className="sr-only" tabIndex={-1} onChange={(e) => {
            void attach(e.target.files?.[0]);
            e.target.value = "";
          }} />
          <button type="button" onClick={() => picker.current?.click()} disabled={busy} aria-label="Send a photo" title="Send a photo" className="-ml-2 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[var(--c-muted)] transition hover:text-[var(--c-text)] disabled:opacity-50">
            <ImagePlus className="size-[18px]" />
          </button>
          <textarea
            ref={input}
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={onKey}
            placeholder={look.placeholder || "Write a message…"}
            aria-label="Your message"
            className="max-h-36 flex-1 resize-none bg-transparent py-2 text-sm text-[var(--c-text)] outline-none placeholder:text-[var(--c-muted)]"
          />
          {busy ? (
            <button type="button" onClick={() => abort.current?.abort()} className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--c-line)] text-[var(--c-text)]" title="Stop" aria-label="Stop the answer">
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <SendButton disabled={!draft.trim() && !photo} />
          )}
        </InputShell>
        {footer}
      </form>
    </ChatFrame>
  );
}

/** Where an answer came from, and for the builder what it cost, how sure it was and what it did. */
function Sources({ message, opened, onOpen, details }: { message: Msg; opened?: number; onOpen: (n: number) => void; details: boolean }) {
  const citations = message.citations ?? [];
  const open = citations.find((c) => c.n === opened);
  if (!citations.length && !details) return null;
  const confidence = message.confidence;
  return (
    <div className="max-w-[88%] space-y-1.5 pl-1">
      {citations.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-[var(--c-muted)]">From</span>
          {citations.map((c) => (
            <button
              key={c.n}
              type="button"
              onClick={() => onOpen(c.n)}
              className={`inline-flex max-w-[240px] items-center gap-1 rounded-md border bg-[var(--c-chip-bg)] px-1.5 py-0.5 transition ${opened === c.n ? "border-[var(--c-accent)]" : "border-[var(--c-line)] hover:border-[var(--c-muted)]"}`}
            >
              <span className="font-semibold text-[var(--c-muted)]">{c.n}</span>
              <span className="truncate">{[c.title, c.section].filter(Boolean).join(" › ")}</span>
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="rounded-lg border border-[var(--c-line)] bg-[var(--c-chip-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--c-muted)]">
          <p className="mb-1 font-medium text-[var(--c-text)]">{[open.title, open.section].filter(Boolean).join(" › ")}</p>
          <p className="whitespace-pre-wrap">{open.excerpt}{open.excerpt.length >= 280 ? "…" : ""}</p>
          {open.url && (
            <a href={open.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[var(--c-accent)] hover:underline">
              Open the page <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      )}
      {details && message.model && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--c-muted)]">
          {confidence !== undefined && (
            <span className={`rounded-full px-1.5 py-px font-medium text-white ${confidence >= 0.7 ? "bg-[#087443]" : confidence >= 0.4 ? "bg-[#b54708]" : "bg-[#c0261b]"}`} title="Confidence">
              {confidence.toFixed(2)}
            </span>
          )}
          <span>
            {message.model} · {message.kept ? "answered from memory" : tokenCount(message.tokens ?? 0)}
          </span>
          {message.procedure && <span>· following “{message.procedure}”</span>}
          {message.pictureModel && <span>· photo read by {message.pictureModel}</span>}
          {message.actions?.map((a, i) => (
            <span key={i} className={`rounded-md border px-1.5 py-px font-mono ${a.error ? "border-[#c0261b]/40 text-[#c0261b]" : "border-[var(--c-line)]"}`}>
              {a.name}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
