// A link to choose a new password, for someone who can't get the email (or when this server sends none):
//   npm run reset-password -- someone@company.com
// The link works once, for an hour. Give it to them directly.

const email = process.argv.slice(2).find((a) => a.includes("@"));
if (!email) {
  console.error("Give the account's email: npm run reset-password -- someone@company.com");
  process.exit(1);
}
process.loadEnvFile(".env.local");
const { startPasswordReset } = await import("../src/platform/accounts");
const { closeDb } = await import("../src/lib/db");
const reset = await startPasswordReset(email);
await closeDb();
if (!reset) {
  console.error(`There's no account for ${email}.`);
  process.exit(1);
}
const base = process.env.KEEL_PUBLIC_URL ?? "http://localhost:3000";
console.log(`A link for ${reset.name} (${reset.email}), valid for an hour:\n\n${base}/reset?token=${encodeURIComponent(reset.token)}\n`);
