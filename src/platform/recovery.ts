// What a restart interrupts: background work lives in the server process, so when the server stops, the work stops
// with it. On start it's picked up again: sources still waiting or learning are queued again, and test runs and
// improvement sessions start again, once (a second interruption stops them, so a crash can't loop; an improvement
// starts over cheaply, its memory skipping what it already ruled out). Security scans can't resume halfway (the
// scanner is a separate program), and neither can quality checks, so both are marked as stopped, with the reason.

import { system } from "@/lib/db";
import { now } from "@/lib/rows";
import { resumeImprovements } from "./improve";
import { queueTraining } from "./knowledge/jobs";
import { resumeTestRuns } from "./tests";

// It runs before any request, across every business (through system()); each piece of work is then picked up for its own.
export async function recoverInterruptedWork(): Promise<{ sources: number; runs: { resumed: number; stopped: number }; sessions: { resumed: number; stopped: number }; scans: number }> {
  const sources = await system().prepare("SELECT id, workspace_id FROM sources WHERE status IN ('pending', 'training')").all<{ id: string; workspace_id: string }>();
  for (const s of sources) await queueTraining(s.id, s.workspace_id);
  const runs = await resumeTestRuns();
  const sessions = await resumeImprovements();
  const restarted = "The server restarted while it ran. Start it again.";
  const scans = await system().prepare("UPDATE security_scans SET status = 'failed', stage = 'Stopped', error = ?, finished_at = ? WHERE status = 'running'").run(restarted, now());
  const checks = await system().prepare("UPDATE quality_checks SET status = 'failed', stage = 'Stopped', error = ?, finished_at = ? WHERE status = 'running'").run(restarted, now());
  return { sources: sources.length, runs, sessions, scans: scans.changes + checks.changes };
}
