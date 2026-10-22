// NVIDIA NeMo Guardrails, running beside Keel. Each agent's guardrails are a NeMo Guardrails configuration written
// from its settings: a self check of each customer message (input rail) and of each reply (output rail), with the
// agent's own rules in the prompts, run by Nemotron 3.5 Lightning on Token Factory through LangChain (NeMo
// Guardrails' LangChain mode). Keel starts NeMo Guardrails' server on demand (scripts/rails-server.py: this machine
// only, no usage statistics) and asks it to check messages through its /v1/checks API.
//
// Each version of an agent's rules gets its own configuration id (its content's hash), so a change applies at once.
// When NeMo Guardrails isn't installed or doesn't answer, chats go on and the Guardrails page says why.

import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { Agent } from "@/core/agents";
import { reportModelCall } from "./llm";
import { ROLE_MODEL, costOf, modelFor } from "./models";
import { userDataDir } from "./paths";
import { setting } from "./settings";

export type RailType = "input" | "output";

export interface RailCheck {
  status: "passed" | "modified" | "blocked";
  /** The rail that blocked it. */
  rail?: string;
  /** About what the check cost on Token Factory (estimated from its prompt). */
  costUsd: number;
}

export class RailsUnavailable extends Error {}

const RAILS_MODEL = ROLE_MODEL.quickCheck; // Nemotron 3.5 Lightning: a fast yes/no check.
const START_TIMEOUT_MS = 90_000;
const CHECK_TIMEOUT_MS = 20_000;

interface RailsState {
  child?: ChildProcess;
  ready?: Promise<string>;
  lastError?: string;
  log: string[];
}

const state = ((globalThis as unknown as { __keelRails?: RailsState }).__keelRails ??= { log: [] });

const railsRoot = () => userDataDir("guardrails");

/** The Python that has NeMo Guardrails installed. */
function railsPython(): string | undefined {
  const configured = setting("NEMO_GUARDRAILS_PYTHON");
  if (configured) return configured;
  // Where `uv tool install` puts it: ~/.local/share/uv/tools on a Mac or Linux, %APPDATA%\uv\tools on Windows.
  const uv =
    process.platform === "win32"
      ? path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "uv", "tools", "nemoguardrails", "Scripts", "python.exe")
      : path.join(os.homedir(), ".local", "share", "uv", "tools", "nemoguardrails", "bin", "python");
  return existsSync(uv) ? uv : undefined;
}

/** Whether NeMo Guardrails is installed here, and why not. */
export function railsInstalled(): { ok: boolean; reason?: string } {
  if (!railsPython()) return { ok: false, reason: "NVIDIA NeMo Guardrails isn't installed on this server (uv tool install 'nemoguardrails[server]' --with langchain --with langchain-openai), or set NEMO_GUARDRAILS_PYTHON." };
  if (!existsSync(launcher())) return { ok: false, reason: "scripts/rails-server.py is missing." };
  return { ok: true };
}

const launcher = () => path.join(process.cwd(), "scripts", "rails-server.py");

export function railsStatus(): { installed: boolean; running: boolean; reason?: string; lastError?: string } {
  const installed = railsInstalled();
  return { installed: installed.ok, running: Boolean(state.child && !state.child.killed && state.child.exitCode === null), ...(installed.reason ? { reason: installed.reason } : {}), ...(state.lastError ? { lastError: state.lastError } : {}) };
}

// ── The configuration ───────────────────────────────────────────────────────────────────────────────────────────

const yamlString = (s: string) => JSON.stringify(s);
const indent = (text: string, spaces: number) => text.split("\n").map((l) => " ".repeat(spaces) + l).join("\n");
const lines = (text: string) => text.split("\n").map((l) => l.trim().replace(/^[-•]\s*/, "")).filter(Boolean);

/** The agent's guardrails as NeMo Guardrails files: config.yml and prompts.yml. */
export function railsFiles(agent: Agent, model: { baseUrl: string }): { "config.yml": string; "prompts.yml": string } {
  const nemo = agent.config.protection.nemo;
  const business = agent.config.profile.website ? `${agent.name} (${agent.config.profile.website})` : agent.name;
  const rules = lines(agent.config.guardrails);
  const spec = modelFor(RAILS_MODEL);
  const config = [
    "# NVIDIA NeMo Guardrails configuration, written by Keel from the agent's settings.",
    "models:",
    "  - type: main",
    "    engine: openai",
    `    model: ${yamlString(spec.id)}`,
    "    api_key_env_var: KEEL_RAILS_KEY",
    "    parameters:",
    `      base_url: ${yamlString(model.baseUrl)}`,
    "      temperature: 0",
    ...(spec.reasoning ? [`      reasoning_effort: ${yamlString(spec.reasoning)}`] : []),
    "rails:",
    ...(nemo.input ? ["  input:", "    flows:", "      - self check input"] : []),
    ...(nemo.output ? ["  output:", "    flows:", "      - self check output"] : []),
  ].join("\n");
  const inputPrompt = [
    `You check messages sent to the customer-service assistant of ${business} before it answers them.`,
    "Block the message if it:",
    ...lines(nemo.blockInput).map((l) => `- ${l}`),
    "Never block ordinary questions, complaints or requests, even angry or rude-sounding ones, or questions about things the business doesn't do.",
    "",
    "<message>",
    "{{ user_input }}",
    "</message>",
    "",
    "Should this message be blocked? Answer only Yes or No.",
    "Answer:",
  ].join("\n");
  const outputPrompt = [
    `You check replies from the customer-service assistant of ${business} before the customer sees them.`,
    "Block the reply if it:",
    ...lines(nemo.blockOutput).map((l) => `- ${l}`),
    ...(rules.length ? ["- breaks one of the business's rules:", ...rules.map((r) => `  - ${r}`)] : []),
    "Never block a helpful, polite reply that sticks to the business's information.",
    "",
    "<customer>",
    "{{ user_input }}",
    "</customer>",
    "<reply>",
    "{{ bot_response }}",
    "</reply>",
    "",
    "Should this reply be blocked? Answer only Yes or No.",
    "Answer:",
  ].join("\n");
  const prompts = ["prompts:", "  - task: self_check_input", "    content: |", indent(inputPrompt, 6), "  - task: self_check_output", "    content: |", indent(outputPrompt, 6)].join("\n");
  return { "config.yml": `${config}\n`, "prompts.yml": `${prompts}\n` };
}

/** Writes the agent's configuration (if this version isn't there yet) and returns its id. */
function writeConfig(agent: Agent, baseUrl: string): string {
  const files = railsFiles(agent, { baseUrl });
  const hash = createHash("sha256").update(files["config.yml"] + files["prompts.yml"]).digest("hex").slice(0, 12);
  const prefix = agent.id.replace(/[^\w]/g, "_");
  const id = `${prefix}_${hash}`;
  const root = railsRoot();
  const dir = path.join(root, id);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    for (const [name, text] of Object.entries(files)) writeFileSync(path.join(dir, name), text);
    // Older versions of this agent's configuration are no longer used.
    for (const other of readdirSync(root)) if (other !== id && other.startsWith(`${prefix}_`)) rmSync(path.join(root, other), { recursive: true, force: true });
  }
  return id;
}

// ── The server ──────────────────────────────────────────────────────────────────────────────────────────────────

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const port = (probe.address() as net.AddressInfo).port;
      probe.close(() => resolve(port));
    });
  });
}

/** NeMo Guardrails' server, started on first use; resolves to its address. */
async function server(): Promise<string> {
  if (state.ready) return state.ready;
  state.ready = (async () => {
    const installed = railsInstalled();
    if (!installed.ok) throw new RailsUnavailable(installed.reason);
    const port = await freePort();
    mkdirSync(railsRoot(), { recursive: true });
    const key = setting("NEBIUS_API_KEY");
    if (!key) throw new RailsUnavailable("NEBIUS_API_KEY is not set, so NeMo Guardrails can't reach its model.");
    const child = spawn(railsPython()!, [launcher(), railsRoot(), String(port)], {
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", KEEL_RAILS_KEY: key, NEMOGUARDRAILS_LLM_FRAMEWORK: "langchain", NEMO_GUARDRAILS_NO_USAGE_STATS: "1", DO_NOT_TRACK: "1", PYTHONUNBUFFERED: "1" } as unknown as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
    }) as ChildProcess;
    state.child = child;
    const remember = (chunk: Buffer) => {
      state.log.push(...chunk.toString().split("\n").filter(Boolean));
      state.log.splice(0, Math.max(0, state.log.length - 50));
    };
    child.stdout?.on("data", remember);
    child.stderr?.on("data", remember);
    child.on("exit", (code: number | null) => {
      if (state.child === child) {
        state.child = undefined;
        state.ready = undefined;
        if (code) state.lastError = `NeMo Guardrails stopped (code ${code}): ${state.log.slice(-3).join(" ").slice(0, 300)}`;
      }
    });
    process.once("exit", () => child.kill());
    const url = `http://127.0.0.1:${port}`;
    const started = Date.now();
    while (Date.now() - started < START_TIMEOUT_MS) {
      if (child.exitCode !== null) throw new RailsUnavailable(`NeMo Guardrails didn't start: ${state.log.slice(-3).join(" ").slice(0, 300)}`);
      const ok = await fetch(`${url}/v1/rails/configs`, { signal: AbortSignal.timeout(2000) }).then((r) => r.ok).catch(() => false);
      if (ok) {
        state.lastError = undefined;
        return url;
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    child.kill();
    throw new RailsUnavailable("NeMo Guardrails took too long to start.");
  })();
  state.ready.catch((error) => {
    state.ready = undefined;
    state.lastError = (error as Error).message;
  });
  return state.ready;
}

/** Stops NeMo Guardrails' server (tests, shutdown). */
export async function stopRails(): Promise<void> {
  const child = state.child;
  state.child = undefined;
  state.ready = undefined;
  child?.kill();
}

/**
 * Checks a customer's message (input) or the agent's reply to it (output) with the agent's NeMo Guardrails.
 * Throws RailsUnavailable when NeMo Guardrails can't run here.
 */
export async function checkRails(agent: Agent, type: RailType, message: string, reply?: string): Promise<RailCheck> {
  try {
    const result = await runCheck(agent, type, message, reply);
    state.lastError = undefined;
    return result;
  } catch (error) {
    state.lastError = (error as Error).message;
    throw error instanceof RailsUnavailable ? error : new RailsUnavailable((error as Error).message);
  }
}

/** Starts NeMo Guardrails now, so the first customer doesn't wait for it (when the server starts). */
export function warmRails(): void {
  if (railsInstalled().ok) void server().catch(() => {});
}

/** Verdicts on customers' messages, by configuration and message: the same message gets the same verdict free. */
const verdicts = ((globalThis as unknown as { __keelRailVerdicts?: Map<string, RailCheck> }).__keelRailVerdicts ??= new Map());
const VERDICTS_MAX = 2000;

async function runCheck(agent: Agent, type: RailType, message: string, reply?: string): Promise<RailCheck> {
  const url = await server();
  const baseUrl = setting("NEBIUS_BASE_URL");
  const configId = writeConfig(agent, baseUrl);
  const remembered = type === "input" ? `${configId}|${message}` : undefined;
  const known = remembered ? verdicts.get(remembered) : undefined;
  if (known) return { ...known, costUsd: 0 };
  const result = await askRails(url, configId, type, message, reply);
  if (remembered) {
    verdicts.set(remembered, result);
    if (verdicts.size > VERDICTS_MAX) verdicts.delete(verdicts.keys().next().value!);
  }
  return result;
}

async function askRails(url: string, configId: string, type: RailType, message: string, reply?: string): Promise<RailCheck> {
  const messages = [{ role: "user", content: message }, ...(type === "output" ? [{ role: "assistant", content: reply ?? "" }] : [])];
  const res = await fetch(`${url}/v1/checks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // The model named here is the configuration's own: NeMo Guardrails requires it and lets it override the config's.
    body: JSON.stringify({ model: modelFor(RAILS_MODEL).id, messages, guardrails: { config_id: configId, rail_types: [type] } }),
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  }).catch((error: Error) => {
    throw new RailsUnavailable(`NeMo Guardrails didn't answer: ${error.message}`);
  });
  if (!res.ok) throw new RailsUnavailable(`NeMo Guardrails answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { status: RailCheck["status"]; rail?: string };
  // NeMo Guardrails calls the model itself, so its call is metered here, as an estimate of its prompt and verdict.
  const spec = modelFor(RAILS_MODEL);
  const promptTokens = Math.ceil((message.length + (reply?.length ?? 0) + 900) / 4);
  const costUsd = costOf(spec, promptTokens, 2);
  reportModelCall({ task: `guardrails ${type}`, model: spec.id, inputTokens: promptTokens, outputTokens: 2, costUsd });
  return { status: body.status, ...(body.rail ? { rail: body.rail } : {}), costUsd };
}
