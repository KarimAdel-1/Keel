// Logins for the hackathon's judges, one each, so they never share anything. Given a list of their names (a text file,
// one name per line), each login is the judge's own name, firstname.lastname@yourdomain.com; without one, judge1@… to
// judgeN@…. One password for all (easy to give in one line of the Devpost form), and each with its own Harbor Goods
// (scripts/demo/build.ts), built a few at a time. Accounts that already exist keep their password and get a Harbor
// Goods only if they lack one.
//   npm run judge-accounts -- yourdomain.com --names judges.txt
//   npm run judge-accounts -- 23 yourdomain.com
//   add --password <the same password> to add a judge later (a new name in the list, or a bigger number)
// About 10 minutes for each three (23 take a little over an hour), and about 15 cents for each Harbor Goods.

import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const valueOf = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
process.loadEnvFile(".env.local");
// Building the demos never emails anyone.
delete process.env.SMTP_URL;
const domain = args.find((a, i) => a.includes(".") && !/^\d+$/.test(a) && !["--password", "--names"].includes(args[i - 1])) ?? (process.env.KEEL_PUBLIC_URL ? new URL(process.env.KEEL_PUBLIC_URL).hostname : "keel.demo");

/** firstname.lastname, in plain lowercase letters: "Ana María de la Cruz" is ana.cruz. */
function loginOf(name: string): string {
  const words = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9]/g, "")).filter(Boolean);
  return words.length > 1 ? `${words[0]}.${words.at(-1)}` : (words[0] ?? "judge");
}

// The judges: from the list of names (blank lines, lines starting with # and anything after a comma are ignored), or
// numbered.
const namesFile = valueOf("--names");
const names = namesFile
  ? readFileSync(namesFile, "utf8").split(/\r?\n/).map((line) => line.split(",")[0].trim()).filter((line) => line && !line.startsWith("#"))
  : Array.from({ length: Math.min(40, Math.max(1, Number(args.find((a) => /^\d+$/.test(a)) ?? 23))) }, (_, i) => `Judge ${i + 1}`);
if (!names.length) {
  console.error(`There are no names in ${namesFile}: put one judge's name on each line.`);
  process.exit(1);
}
const taken = new Map<string, number>();
const judges = names.map((name, i) => {
  const login = namesFile ? loginOf(name) : `judge${i + 1}`;
  const seen = (taken.get(login) ?? 0) + 1;
  taken.set(login, seen);
  return { name, email: `${seen > 1 ? `${login}${seen}` : login}@${domain}` };
});

const { AccountError, signUp } = await import("../src/platform/accounts");
const { buildDemo } = await import("./demo/build");
const { stopRails } = await import("../src/lib/rails");
const { closeDb } = await import("../src/lib/db");

// Given (to add a judge later with the same password as the others), or made: easy to type from the Devpost form,
// letters and digits only, in four groups.
const given = valueOf("--password");
const password = given || Array.from({ length: 4 }, () => randomBytes(6).toString("base64url").replace(/[-_]/g, "x").slice(0, 5)).join("-");
if (password.length < 8) {
  console.error("Use a password of at least 8 characters.");
  process.exit(1);
}
let made = 0;
for (const { name, email } of judges) {
  try {
    await signUp({ email, name, password });
    made++;
  } catch (error) {
    if (!(error instanceof AccountError)) throw error;
    console.log(`${email} already exists: its password stays as it was.`);
  }
}

// A few at a time: each build runs AI customers and a quality check, and Token Factory serves them all.
const AT_ONCE = 3;
const ready: string[] = [];
for (let i = 0; i < judges.length; i += AT_ONCE) {
  await Promise.all(
    judges.slice(i, i + AT_ONCE).map(async ({ email }) => {
      const url = await buildDemo(email, (line) => console.log(`${email.split("@")[0]}: ${line.trim()}`));
      if (url) ready.push(email);
    }),
  );
}

console.log(`\n${made} login${made === 1 ? "" : "s"} made, ${ready.length} Harbor Goods built.`);
if (made && made < judges.length && !given) {
  console.log(`\nThe new logins have a new password, ${password}; the others keep theirs. To give every judge the same one, add --password next time.`);
} else if (made) {
  console.log(`\nFor the Devpost form's private field:\n`);
  if (namesFile) {
    console.log(`  Sign in with your own name, firstname.lastname@${domain} (for example ${judges[0].email}), password ${password}`);
    console.log(`  Each of you has your own copy of the demo, so nothing you do changes anyone else's. All the logins:`);
    for (const { name, email } of judges) console.log(`    ${name}: ${email}`);
  } else {
    console.log(`  Sign in with any of ${judges[0].email} to ${judges.at(-1)!.email}, password ${password}`);
    console.log(`  Each has its own copy of the demo, so nothing you do changes anyone else's.`);
  }
  console.log("\nThe password is shown only now.");
}
await stopRails();
await closeDb();
process.exit(0);
