// The demo business, ready for the judges: Harbor Goods (made up, scripts/demo/harbor-goods.ts) in an account's
// workspace, with its knowledge, goals, order lookup and tests, its tests run once, sample chats and a quality check,
// so every page has results to show from the first minute (scripts/demo/build.ts).
//   npm run demo -- judges@yourdomain.com
// The account must exist (npm run create-account). It takes about 10 minutes and about 15 cents on Token Factory.

const email = process.argv.slice(2).find((a) => a.includes("@"));
if (!email) {
  console.error("Give the account's email: npm run demo -- someone@company.com");
  process.exit(1);
}
process.loadEnvFile(".env.local");
// Building the demo never emails anyone: its sample handover would otherwise alert the team.
delete process.env.SMTP_URL;
const { buildDemo } = await import("./demo/build");
const { stopRails } = await import("../src/lib/rails");
const { closeDb } = await import("../src/lib/db");

const ready = await buildDemo(email, (line) => console.log(line ? `  ${line}` : ""));
if (ready) console.log(`\nHarbor Goods is ready: ${ready}`);
else process.exitCode = 1;
// The NeMo Guardrails server Keel started for the chats would keep this script running.
await stopRails();
await closeDb();
process.exit(process.exitCode ?? 0);
