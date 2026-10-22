// An account made by whoever runs the server, with its own workspace: how accounts are made on a private server
// (KEEL_PRIVATE=1), where nobody can sign up on the site. A strong password is made for it and shown once.
//   npm run create-account -- judges@yourdomain.com "Hackathon judges"

import { randomBytes } from "node:crypto";

const [email, ...nameParts] = process.argv.slice(2);
if (!email?.includes("@")) {
  console.error('Give the email, and a name if you like: npm run create-account -- judges@yourdomain.com "Hackathon judges"');
  process.exit(1);
}
process.loadEnvFile(".env.local");
const { AccountError, signUp } = await import("../src/platform/accounts");
const { closeDb } = await import("../src/lib/db");
// Easy to type from the Devpost form: letters and digits only, in four groups.
const password = Array.from({ length: 4 }, () => randomBytes(6).toString("base64url").replace(/[-_]/g, "x").slice(0, 5)).join("-");
try {
  const { user, workspace } = await signUp({ email, name: nameParts.join(" "), password });
  console.log(`Made ${user.name} (${user.email}), with the workspace "${workspace.name}".\n\nPassword (shown only now): ${password}\n`);
} catch (error) {
  console.error(error instanceof AccountError ? error.message : (error as Error).message);
  process.exitCode = 1;
}
await closeDb();
