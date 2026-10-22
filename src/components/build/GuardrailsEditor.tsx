"use client";

import { Shield, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DEFAULT_BLOCK_INPUT, DEFAULT_BLOCK_OUTPUT, DEFAULT_SPAM_DEFINITION, type Agent } from "@/core/agents";
import { useDraft } from "../agent/useDraft";
import { TestChange } from "../improve/TestChange";
import { PageBar, PageBody } from "../shell/PageBar";
import { Notice, Pill, Spinner, Toggle } from "../ui";

type Fields = {
  messages: number;
  seconds: number;
  limitMessage: string;
  spamOn: boolean;
  spamDefinition: string;
  domains: string;
  nemoOn: boolean;
  nemoInput: boolean;
  nemoOutput: boolean;
  blockInput: string;
  blockOutput: string;
  blockedMessage: string;
};

export interface RailsInfo {
  installed: boolean;
  running: boolean;
  reason?: string;
  lastError?: string;
}

const WINDOWS = [
  [60, "minute"],
  [300, "5 minutes"],
  [900, "15 minutes"],
  [3600, "hour"],
  [86_400, "day"],
] as const;

function Block({ title, text, aside, children }: { title: string; text: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <p className="mt-0.5 text-sm text-muted">{text}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/**
 * Build › Guardrails: what keeps the agent safe to leave on a public website. How many messages one visitor can send,
 * a check for spam that pauses the conversation, and the websites allowed to show it.
 */
export function GuardrailsEditor({ agent, rails }: { agent: Agent; rails: RailsInfo }) {
  const p = agent.config.protection;
  const saved: Fields = {
    messages: p.rateLimit.messages,
    seconds: p.rateLimit.seconds,
    limitMessage: p.rateLimit.message,
    spamOn: p.spam.enabled,
    spamDefinition: p.spam.definition,
    domains: p.allowedDomains.join("\n"),
    nemoOn: p.nemo.enabled,
    nemoInput: p.nemo.input,
    nemoOutput: p.nemo.output,
    blockInput: p.nemo.blockInput,
    blockOutput: p.nemo.blockOutput,
    blockedMessage: p.nemo.blockedMessage,
  };
  const toChange = (d: Fields) => ({
    config: {
      protection: {
        rateLimit: { messages: d.messages, seconds: d.seconds, message: d.limitMessage },
        spam: { enabled: d.spamOn, definition: d.spamDefinition },
        allowedDomains: d.domains
          .split(/[\n,]/)
          .map((x) => x.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
          .filter(Boolean),
        nemo: { enabled: d.nemoOn, input: d.nemoInput, output: d.nemoOutput, blockInput: d.blockInput, blockOutput: d.blockOutput, blockedMessage: d.blockedMessage },
      },
    },
  });
  const { draft, set, dirty, saving, error, save, discard } = useDraft(agent.id, saved, toChange);

  return (
    <>
      <PageBar
        icon={<Shield className="size-[18px]" />}
        title="Safety and limits"
        actions={
          <>
            {dirty && (
              <button type="button" onClick={discard} disabled={saving} className="btn btn-ghost">
                Discard
              </button>
            )}
            <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="btn btn-primary">
              {saving ? "Saving…" : "Save changes"}
            </button>
          </>
        }
      />
      <PageBody>
        {error && <Notice>{error}</Notice>}
        <NemoBlock agentId={agent.id} rails={rails} draft={draft} set={set} change={toChange(draft).config} />
        {dirty && (draft.nemoOn !== saved.nemoOn || draft.nemoInput !== saved.nemoInput || draft.nemoOutput !== saved.nemoOutput || draft.blockInput !== saved.blockInput || draft.blockOutput !== saved.blockOutput) && (
          <TestChange agentId={agent.id} change={toChange(draft).config} />
        )}
        <Block title="Message limit" text="How many messages one visitor can send in a while. It stops people and scripts from flooding the agent.">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Up to</span>
            <input type="number" min={1} max={1000} value={draft.messages} onChange={(e) => set({ messages: Number(e.target.value) || 1 })} className="field w-24" />
            <span>messages every</span>
            <select value={draft.seconds} onChange={(e) => set({ seconds: Number(e.target.value) })} className="field w-auto">
              {WINDOWS.map(([s, label]) => (
                <option key={s} value={s}>
                  {label}
                </option>
              ))}
              {!WINDOWS.some(([s]) => s === draft.seconds) && <option value={draft.seconds}>{draft.seconds} seconds</option>}
            </select>
          </div>
          <label className="mt-4 block">
            <span className="label">What visitors see when they reach it</span>
            <input value={draft.limitMessage} onChange={(e) => set({ limitMessage: e.target.value })} className="field" maxLength={300} />
          </label>
        </Block>

        <Block
          title="Spam check"
          text="After a visitor's 2nd, 4th, 8th and 16th message, a fast model reads the conversation. If it's spam, the conversation is paused and the agent stops replying."
          aside={<Toggle checked={draft.spamOn} onChange={(spamOn) => set({ spamOn })} label="Check for spam" />}
        >
          <label className="block">
            <span className="label">What counts as spam</span>
            <textarea value={draft.spamDefinition} onChange={(e) => set({ spamDefinition: e.target.value })} rows={4} disabled={!draft.spamOn} className="field resize-y disabled:opacity-60" maxLength={2000} />
          </label>
          {draft.spamDefinition !== DEFAULT_SPAM_DEFINITION && (
            <button type="button" onClick={() => set({ spamDefinition: DEFAULT_SPAM_DEFINITION })} className="btn btn-ghost mt-2 px-2 py-1 text-xs">
              Use the default
            </button>
          )}
          <p className="hint mt-2">Paused conversations are marked in Activity; you can resume them there.</p>
        </Block>

        <Block title="Allowed websites" text="Only these websites can show the chat. Leave it empty to allow any website.">
          <textarea value={draft.domains} onChange={(e) => set({ domains: e.target.value })} rows={4} className="field resize-y font-mono text-[13px]" placeholder={"yourbusiness.com\n*.yourbusiness.com"} />
          <p className="hint mt-1">One per line. *.yourbusiness.com allows every subdomain. Keel&apos;s own chat page always works.</p>
        </Block>

        <p className="text-sm text-muted">
          Rules about what the agent says (topics to avoid, what never to promise) are in{" "}
          <Link href={`/app/agents/${agent.id}/instructions`} className="font-medium text-ink underline underline-offset-2">
            Instructions
          </Link>
          .
        </p>
      </PageBody>
    </>
  );
}

/** NVIDIA NeMo Guardrails: on or off, what each check blocks, what customers see, and a box to try it. */
function NemoBlock({ agentId, rails, draft, set, change }: { agentId: string; rails: RailsInfo; draft: Fields; set: (patch: Partial<Fields>) => void; change: object }) {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState("");
  const [result, setResult] = useState<{ status?: string; rail?: string; error?: string } | null>(null);
  const [checking, setChecking] = useState(false);

  async function tryIt(type: "input" | "output") {
    setChecking(true);
    setResult(null);
    const res = await fetch(`/api/agents/${agentId}/guardrails/check`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, message, ...(type === "output" ? { reply } : {}), change }) });
    setResult((await res.json().catch(() => ({ error: "No answer." }))) as { status?: string; rail?: string; error?: string });
    setChecking(false);
  }

  const status = !rails.installed ? (
    <Pill tone="bad">Not installed</Pill>
  ) : rails.lastError ? (
    <Pill tone="warn">Not answering</Pill>
  ) : rails.running ? (
    <Pill tone="good">Running</Pill>
  ) : (
    <Pill>Starts with the first message</Pill>
  );

  return (
    <Block
      title="NVIDIA NeMo Guardrails"
      text="NVIDIA's guardrails check each customer message before the agent answers, with a fast Nemotron model and your rules. Turn on the reply check to also check each reply before the customer sees it (replies then arrive whole, not word by word)."
      aside={<Toggle checked={draft.nemoOn} onChange={(nemoOn) => set({ nemoOn })} label="NVIDIA NeMo Guardrails" />}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted">
        <ShieldCheck className="size-4" /> {status}
        {!rails.installed && rails.reason && <span>{rails.reason}</span>}
        {rails.installed && rails.lastError && <span>{rails.lastError}. Chats go on without it until it answers again.</span>}
      </div>
      <fieldset disabled={!draft.nemoOn} className="space-y-4 disabled:opacity-60">
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={draft.nemoInput} onChange={(e) => set({ nemoInput: e.target.checked })} className="accent-[var(--ink)]" />
              Check customers&apos; messages
            </label>
            <textarea value={draft.blockInput} onChange={(e) => set({ blockInput: e.target.value })} rows={5} className="field mt-2 resize-y text-[13px]" aria-label="Block a message that" />
            <p className="hint mt-1">
              Block a message that… (one per line)
              {draft.blockInput !== DEFAULT_BLOCK_INPUT && (
                <button type="button" onClick={() => set({ blockInput: DEFAULT_BLOCK_INPUT })} className="ml-2 underline">
                  Use the default
                </button>
              )}
            </p>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={draft.nemoOutput} onChange={(e) => set({ nemoOutput: e.target.checked })} className="accent-[var(--ink)]" />
              Check the agent&apos;s replies
            </label>
            <textarea value={draft.blockOutput} onChange={(e) => set({ blockOutput: e.target.value })} rows={5} className="field mt-2 resize-y text-[13px]" aria-label="Block a reply that" />
            <p className="hint mt-1">
              Block a reply that… (one per line; your rules from Instructions are added)
              {draft.blockOutput !== DEFAULT_BLOCK_OUTPUT && (
                <button type="button" onClick={() => set({ blockOutput: DEFAULT_BLOCK_OUTPUT })} className="ml-2 underline">
                  Use the default
                </button>
              )}
            </p>
          </div>
        </div>
        <label className="block">
          <span className="label">What customers see instead</span>
          <input value={draft.blockedMessage} onChange={(e) => set({ blockedMessage: e.target.value })} className="field" maxLength={300} />
        </label>
        <div className="rounded-xl border border-line bg-panel-2/40 p-4">
          <p className="text-sm font-semibold">Try it</p>
          <p className="mb-3 text-xs text-muted">Runs NeMo Guardrails with the settings above, saved or not.</p>
          <div className="grid gap-2 lg:grid-cols-2">
            <input value={message} onChange={(e) => setMessage(e.target.value)} className="field" placeholder="A customer's message" />
            <input value={reply} onChange={(e) => setReply(e.target.value)} className="field" placeholder="A reply (for the reply check)" />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void tryIt("input")} disabled={checking || !message.trim()} className="btn btn-secondary px-3 py-1.5 text-xs">
              Check the message
            </button>
            <button type="button" onClick={() => void tryIt("output")} disabled={checking || !message.trim() || !reply.trim()} className="btn btn-secondary px-3 py-1.5 text-xs">
              Check the reply
            </button>
            {checking && <Spinner className="size-4" />}
            {result?.status && <Pill tone={result.status === "blocked" ? "bad" : "good"}>{result.status === "blocked" ? `Blocked by ${result.rail ?? "a rail"}` : "Allowed"}</Pill>}
            {result?.error && <span className="text-xs text-bad">{result.error}</span>}
          </div>
        </div>
      </fieldset>
    </Block>
  );
}
