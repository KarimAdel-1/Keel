// Keel's tests run on the real models: NVIDIA Nemotron on Nebius Token Factory. A test file that needs them calls
// live() first: it gets its own data folder, the API key is loaded from .env.local (never printed), every model call
// is metered, the file stops the moment it passes its token budget, and on exit it prints what it used, by task.
// Without a key (or with KEEL_LIVE_TESTS=0, as `npm run test:free` sets), the tests that need the models are skipped
// with the reason. Nothing is faked.

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after } from "node:test";
import { closeDb } from "@/lib/db";
import { settled } from "@/platform/knowledge/jobs";
import { observeModelCalls, type ModelCall } from "@/lib/llm";
import { stopRails } from "@/lib/rails";
import { closeBrowser } from "@/lib/render";

export interface Live {
  /** Pass as the test's skip option: false when the models can be called, else why not. */
  skip: string | false;
}

/**
 * A data folder and a Postgres database of its own (made on first use from DATABASE_ADMIN_URL in .env.local), both
 * removed when the test file is done.
 */
function fresh(name: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), `keel-${name}-`));
  process.once("exit", () => rmSync(dir, { recursive: true, force: true }));
  const env = path.join(process.cwd(), ".env.local");
  if (!process.env.DATABASE_URL && existsSync(env)) process.loadEnvFile(env);
  process.env.KEEL_TEST_DATABASE = `keel_test_${name.replace(/\W+/g, "_")}_${process.pid}`;
  // Background work a test started (training, test runs) finishes before the database goes.
  after(async () => {
    await settled();
    await closeDb();
  });
  return dir;
}

/** A data folder and database of its own for a test file that calls no model. */
export function offline(name: string): void {
  process.env.KEEL_DATA_DIR = fresh(name);
}

/**
 * Prepares a test file for the real models, with a hard cap on what it may use: past `budgetTokens` tokens, the file
 * stops at once, so a test that goes wrong can't run up the bill.
 */
export function live(name: string, budgetTokens: number): Live {
  process.env.KEEL_DATA_DIR = fresh(name);
  // NeMo Guardrails' server and the headless browser start on first use; they're stopped when the file is done, or
  // they'd keep it running.
  after(async () => {
    await stopRails();
    await closeBrowser();
  });
  if (process.env.KEEL_LIVE_TESTS === "0") return { skip: "live tests are off (KEEL_LIVE_TESTS=0): only the tests that call no model run" };
  const env = path.join(process.cwd(), ".env.local");
  if (!process.env.NEBIUS_API_KEY && existsSync(env)) process.loadEnvFile(env);
  if (!process.env.NEBIUS_API_KEY) return { skip: "NEBIUS_API_KEY isn't set in .env.local: tests that call the models are skipped" };

  const calls: ModelCall[] = [];
  let tokens = 0;
  let reported = false;
  const report = () => {
    if (!calls.length || reported) return;
    reported = true;
    const byTask = new Map<string, { calls: number; tokens: number; costUsd: number }>();
    for (const c of calls) {
      const row = byTask.get(c.task) ?? { calls: 0, tokens: 0, costUsd: 0 };
      byTask.set(c.task, { calls: row.calls + 1, tokens: row.tokens + c.inputTokens + c.outputTokens, costUsd: row.costUsd + c.costUsd });
    }
    const cost = calls.reduce((n, c) => n + c.costUsd, 0);
    const lines = [...byTask].sort((a, b) => b[1].tokens - a[1].tokens).map(([task, r]) => `    ${task.padEnd(28)} ${String(r.calls).padStart(4)} calls ${String(r.tokens).padStart(8)} tokens  $${r.costUsd.toFixed(5)}`);
    console.log(`\n  ${name}: ${calls.length} model calls, ${tokens} tokens (budget ${budgetTokens}), about $${cost.toFixed(4)}\n${lines.join("\n")}`);
  };
  observeModelCalls((call) => {
    calls.push(call);
    tokens += call.inputTokens + call.outputTokens;
    if (tokens > budgetTokens) {
      console.error(`\n  ${name}: STOPPED at ${tokens} tokens, over its budget of ${budgetTokens}.`);
      report();
      process.exit(1);
    }
  });
  process.once("exit", report);
  return { skip: false };
}
