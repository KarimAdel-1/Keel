// Runs once when the server starts: work a restart interrupted is picked up again, and the schedule that reads
// websites again for agents set to resync starts.

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recoverInterruptedWork } = await import("./platform/recovery");
  const recovered = await recoverInterruptedWork();
  const { sources, runs, sessions, scans } = recovered;
  if (sources || runs.resumed || runs.stopped || sessions.resumed || sessions.stopped || scans) {
    console.log(`Keel: after the restart, learning ${sources} sources again; ${runs.resumed} test runs and ${sessions.resumed} improvement sessions picked up again; ${runs.stopped + sessions.stopped} interrupted twice and ${scans} security scans or quality checks stopped.`);
  }
  const { setting } = await import("./lib/settings");
  if (setting("KEEL_RAILS")) (await import("./lib/rails")).warmRails();
  const { startResyncTimer } = await import("./platform/knowledge/resync");
  startResyncTimer();
}
