// Sets up Keel's Postgres once: a database and two logins.
//   keel_owner  owns the tables and runs migrations (DATABASE_ADMIN_URL)
//   keel_app    Keel's own login: reads and writes, held to row-level security, so each business sees only its data (DATABASE_URL)
//
//   npm run db:setup                                        # this machine's Postgres, as your own user (Homebrew)
//   npm run db:setup -- postgres://postgres:PASSWORD@localhost:5432/postgres   # as Postgres's superuser (Windows installer)
//   add --write to put the two addresses in .env.local
//
// Running it again keeps the database and gives both logins new passwords.

import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const args = process.argv.slice(2);
const write = args.includes("--write");
const superuser = args.find((a) => /^postgres(ql)?:\/\//.test(a)) ?? "postgres://localhost:5432/postgres";
const database = process.env.KEEL_DATABASE_NAME ?? "keel";

const password = () => randomBytes(18).toString("base64url");
const owner = { name: "keel_owner", password: password() };
const app = { name: "keel_app", password: password() };

const client = new pg.Client({ connectionString: superuser });
await client.connect().catch((error: Error) => {
  console.error(`Couldn't reach Postgres at ${new URL(superuser).host}: ${error.message}\nIs it running? Give a superuser's address as the first argument.`);
  process.exit(1);
});

const exists = async (sql: string, value: string) => ((await client.query(sql, [value])).rowCount ?? 0) > 0;
const lit = (s: string) => pg.escapeLiteral(s);

for (const role of [owner, app]) {
  const id = pg.escapeIdentifier(role.name);
  if (await exists("SELECT 1 FROM pg_roles WHERE rolname = $1", role.name)) await client.query(`ALTER ROLE ${id} WITH LOGIN PASSWORD ${lit(role.password)}`);
  else await client.query(`CREATE ROLE ${id} WITH LOGIN PASSWORD ${lit(role.password)}`);
}
// The owner can make a test database for each test file; Keel's own login can't get around row-level security.
await client.query(`ALTER ROLE ${pg.escapeIdentifier(owner.name)} CREATEDB NOBYPASSRLS NOSUPERUSER`);
await client.query(`ALTER ROLE ${pg.escapeIdentifier(app.name)} NOCREATEDB NOBYPASSRLS NOSUPERUSER NOCREATEROLE`);
if (!(await exists("SELECT 1 FROM pg_database WHERE datname = $1", database))) {
  await client.query(`CREATE DATABASE ${pg.escapeIdentifier(database)} OWNER ${pg.escapeIdentifier(owner.name)}`);
}
await client.end();

const base = new URL(superuser);
const address = (role: { name: string; password: string }) => `postgres://${role.name}:${role.password}@${base.hostname}:${base.port || 5432}/${database}`;
const lines = [`DATABASE_URL=${address(app)}`, `DATABASE_ADMIN_URL=${address(owner)}`];

if (write) {
  const env = path.join(process.cwd(), ".env.local");
  const kept = existsSync(env) ? readFileSync(env, "utf8").split("\n").filter((l) => !/^DATABASE(_ADMIN)?_URL=/.test(l)) : [];
  writeFileSync(env, kept.join("\n").replace(/\n*$/, "\n"));
  appendFileSync(env, `\n# Postgres (npm run db:setup)\n${lines.join("\n")}\n`);
  console.log(`Database "${database}" is ready. The two addresses are in .env.local.`);
} else {
  console.log(`Database "${database}" is ready. Add these two lines to .env.local:\n\n${lines.join("\n")}\n`);
}
