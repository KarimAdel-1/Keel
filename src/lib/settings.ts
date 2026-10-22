// Every setting Keel reads from the environment, in one place: its type, default and meaning. A value that
// can't be read (a word where a number goes, "enabled" where a switch expects 1, a malformed key) stops the server
// and the command line at startup with a message naming it, instead of being ignored. A name that looks like a
// misspelt setting gets a warning. Values are read when asked for, not once at startup, because the command line and
// the tests change some of them while running. No Node-only imports: the request proxy reads settings too.

import { z } from "zod";

const ON = ["1", "true", "yes", "on"];
const OFF = ["0", "false", "no", "off"];

/** A switch: 1, true, yes or on; 0, false, no or off. */
const flag = z
  .string()
  .transform((v) => v.toLowerCase())
  .pipe(z.enum([...ON, ...OFF]))
  .transform((v) => ON.includes(v));
const count = z.coerce.number().int().positive();
const postgres = z.string().regex(/^postgres(ql)?:\/\/.+/);
const url = z
  .url({ protocol: /^https?$/ })
  .transform((v) => v.replace(/\/+$/, ""));
const text = z.string().min(1);
/** 32 bytes as 64 hex characters or base64 (standard or URL-safe, padding optional). */
const key32 = z.string().refine((v) => {
  if (/^[0-9a-f]{64}$/i.test(v)) return true;
  if (!/^[A-Za-z0-9+/_-]{43}={0,1}$/.test(v)) return false;
  try {
    return atob(v.replace(/-/g, "+").replace(/_/g, "/").replace(/=*$/, "=")).length === 32;
  } catch {
    return false;
  }
});

type Group = "Database" | "Models" | "Security" | "Email" | "Deployment" | "Development";

interface Setting<T> {
  schema: z.ZodType<T>;
  /** What a valid value looks like, for error messages. */
  expects: string;
  group: Group;
  /** What it does. */
  doc: string;
  default?: T;
  /** Never shown: only whether it's set. */
  secret?: boolean;
  /** Set by Keel itself (the command line), not by people. */
  internal?: boolean;
}

const s = <T>(setting: Setting<T>) => setting;
const withDefault = <T>(setting: Setting<T> & { default: T }) => setting;

export const SETTINGS = {
  DATABASE_URL: s({
    schema: postgres,
    expects: "a postgres:// address, such as postgres://keel_app:password@localhost:5432/keel",
    group: "Database",
    doc: "Postgres, as Keel's own login: row-level security keeps each business to its own data (npm run db:setup makes it)",
    secret: true,
  }),
  DATABASE_ADMIN_URL: s({
    schema: postgres,
    expects: "a postgres:// address, such as postgres://keel_owner:password@localhost:5432/keel",
    group: "Database",
    doc: "Postgres, as the owner of Keel's tables: for migrations and lookups across businesses only",
    secret: true,
  }),
  NEBIUS_API_KEY: s({ schema: text, expects: "your Token Factory API key", group: "Models", doc: "Nebius Token Factory API key", secret: true }),
  NEBIUS_BASE_URL: withDefault({ schema: url, expects: "an http(s) address", group: "Models", doc: "Token Factory's API address", default: "https://api.tokenfactory.nebius.com/v1" }),
  MODEL_CONCURRENCY: withDefault({ schema: count, expects: "a whole number above 0", group: "Models", doc: "Calls in flight per Token Factory model", default: 12 }),
  KEEL_CACHE: withDefault({ schema: flag, expects: "1 or 0", group: "Models", doc: "Cache analysis calls (judging, topics) for 14 days", default: false }),
  GARAK_BIN: s({ schema: text, expects: "a path", group: "Models", doc: "The NVIDIA garak command for security scans (default: the one uv installed, then the PATH)" }),
  NEMO_GUARDRAILS_PYTHON: s({ schema: text, expects: "a path to a Python", group: "Models", doc: "The Python that has NVIDIA NeMo Guardrails installed (default: the one uv installed it with)" }),
  KEEL_SECRET_KEY: s({
    schema: key32,
    expects: "32 bytes, as base64 or 64 hex characters (openssl rand -base64 32)",
    group: "Security",
    doc: "Encrypts saved secrets, such as the keys of the APIs agents' actions call",
    secret: true,
  }),
  TRUST_PROXY: withDefault({ schema: flag, expects: "1 or 0", group: "Security", doc: "Trust X-Forwarded-For from a proxy in front", default: false }),
  ALLOW_PRIVATE_NETWORK: withDefault({ schema: flag, expects: "1 or 0", group: "Security", doc: "Let actions and website imports reach private networks (development only)", default: false }),
  KEEL_RAILS: withDefault({ schema: flag, expects: "1 or 0", group: "Security", doc: "Run agents' NVIDIA NeMo Guardrails (0: off on this server)", default: true }),
  KEEL_SIGNUPS: withDefault({ schema: flag, expects: "1 or 0", group: "Security", doc: "Anyone can create an account (0: only invited people)", default: true }),
  KEEL_PRIVATE: withDefault({
    schema: flag,
    expects: "1 or 0",
    group: "Security",
    doc: "A private server, such as one for judges: only accounts made with `npm run create-account` can use it; no sign-ups or invitations, and the agents' chat answers only people signed in to their workspace",
    default: false,
  }),
  KEEL_ACCOUNT_LIMIT_USD: s({
    schema: z.coerce.number().positive(),
    expects: "an amount in US dollars above 0, such as 1.5",
    group: "Security",
    doc: "What each workspace's model use may cost in all, such as on a judges' server sharing one Token Factory balance: once it's reached, new tests, quality checks, improvements and scans are refused; the agents' chat still answers",
  }),

  SMTP_URL: s({
    schema: z.string().regex(/^smtps?:\/\/.+/),
    expects: "an smtp:// or smtps:// address, such as smtps://user:password@smtp.example.com:465",
    group: "Email",
    doc: "The mail server Keel sends from: password resets, and alerts when a customer needs a person",
    secret: true,
  }),
  MAIL_FROM: s({ schema: text, expects: "an address, such as Keel <alerts@example.com>", group: "Email", doc: "Who Keel's emails come from (default: the SMTP user)" }),

  META_GRAPH_VERSION: withDefault({ schema: z.string().regex(/^v\d+\.\d+$/), expects: "a version such as v25.0", group: "Deployment", doc: "Meta's Graph API version for WhatsApp, Messenger and Instagram", default: "v25.0" }),

  KEEL_PUBLIC_URL: s({ schema: url, expects: "an http(s) address", group: "Deployment", doc: "The public address, used in embed codes and links" }),
  KEEL_DATA_DIR: s({ schema: text, expects: "a folder", group: "Deployment", doc: "Where the database and uploads are kept (default: data/ in the app)" }),
};

export type SettingName = keyof typeof SETTINGS;
type Output<K extends SettingName> = (typeof SETTINGS)[K] extends Setting<infer T> ? T : never;
export type SettingValue<K extends SettingName> = (typeof SETTINGS)[K] extends { default: unknown } ? Output<K> : Output<K> | undefined;

export class SettingError extends Error {}

const raw = (value: string | undefined) => {
  const v = value?.trim();
  return v ? v : undefined;
};

const problem = (name: SettingName, value: string) => {
  const setting: Setting<unknown> = SETTINGS[name];
  const shown = setting.secret ? "" : ` (it's "${value.length > 60 ? `${value.slice(0, 57)}…` : value}")`;
  return `${name} should be ${setting.expects}${shown}`;
};

/** A setting's value in a given environment, checked, with its default. Throws when it can't be read. */
export function settingIn<K extends SettingName>(env: Record<string, string | undefined>, name: K): SettingValue<K> {
  const value = raw(env[name]);
  const def: Setting<unknown> = SETTINGS[name];
  if (value === undefined) return def.default as SettingValue<K>;
  const result = def.schema.safeParse(value);
  if (!result.success) throw new SettingError(problem(name, value));
  return result.data as SettingValue<K>;
}

const memo = new Map<string, { raw: string | undefined; value: unknown }>();

/** A setting's value: read from the environment now, checked, with its default. Throws when it can't be read. */
export function setting<K extends SettingName>(name: K): SettingValue<K> {
  const value = raw(process.env[name]);
  const hit = memo.get(name);
  if (hit && hit.raw === value) return hit.value as SettingValue<K>;
  const parsed = settingIn(process.env, name);
  memo.set(name, { raw: value, value: parsed });
  return parsed;
}


