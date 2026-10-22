// What a builder may send to change an agent, checked before it's saved (or used for a preview reply). Limits keep
// a prompt from growing past what a model reads well.

import { z } from "zod";
import { AGENT_COLORS, CHAT_LAYOUTS, CHAT_STYLES, INDUSTRIES, mergeConfig, type AgentConfig } from "@/core/agents";
import { MODEL_KEYS } from "@/lib/models";

/** A small image stored inline: the only kind of picture an agent can have, so nothing is loaded from elsewhere. */
const imageData = z
  .string()
  .max(400_000, "That picture is too large. Use one under 300 KB.")
  .regex(/^data:image\/(png|jpeg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]+$/, "Use a PNG, JPEG, GIF, WebP, SVG or icon image.");

const appearance = z
  .object({
    displayName: z.string().trim().min(1, "Give your agent a name people will see.").max(60),
    welcome: z.array(z.string().trim().min(1).max(500)).max(4),
    suggestions: z.array(z.string().trim().min(1).max(120)).max(6),
    placeholder: z.string().trim().max(80),
    color: z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a colour."),
    theme: z.enum(["light", "dark"]),
    position: z.enum(["right", "left"]),
    style: z.enum(CHAT_STYLES),
    layout: z.enum(CHAT_LAYOUTS),
    showSources: z.boolean(),
    avatar: z.union([imageData, z.literal("")]),
  })
  .partial();

const profile = z
  .object({
    website: z.string().max(2000),
    summary: z.string().trim().max(1500),
    offerings: z.array(z.string().trim().min(1).max(200)).max(12),
    audience: z.string().trim().max(500),
    tone: z.string().trim().max(300),
  })
  .partial();

export const configChange = z
  .object({
    instructions: z.string().trim().min(1, "Describe what your agent does.").max(8000),
    guardrails: z.string().trim().max(4000),
    model: z.enum([...MODEL_KEYS, "auto"]),
    temperature: z.number().min(0).max(1),
    knowledgeOnly: z.boolean(),
    fallback: z.string().trim().min(1, "Write what it says when it doesn't know.").max(500),
    industry: z.enum(INDUSTRIES),
    appearance,
    profile,
    brand: z.object({
      siteName: z.string().max(200).optional(),
      colors: z.array(z.string().regex(/^#[0-9a-f]{6}$/i)).max(8),
      logo: imageData.optional(),
      website: z.string().max(2000).optional(),
    }),
    protection: z
      .object({
        rateLimit: z.object({
          messages: z.number().int().min(1, "Allow at least one message.").max(1000),
          seconds: z.number().int().min(10, "Use a window of at least 10 seconds.").max(86_400),
          message: z.string().trim().min(1, "Write what visitors see when they reach the limit.").max(300),
        }),
        spam: z.object({ enabled: z.boolean(), definition: z.string().trim().min(10, "Describe what counts as spam.").max(2000) }),
        allowedDomains: z.array(z.string().trim().toLowerCase().regex(/^(\*\.)?[a-z0-9.-]+\.[a-z]{2,}$|^localhost$/, "Write domains like yourbusiness.com, one per line.")).max(50),
        nemo: z
          .object({
            enabled: z.boolean(),
            input: z.boolean(),
            output: z.boolean(),
            blockInput: z.string().trim().max(3000),
            blockOutput: z.string().trim().max(3000),
            blockedMessage: z.string().trim().min(1, "Write what customers see when a message is blocked.").max(300),
          })
          .partial(),
      })
      .partial(),
    resync: z.object({ every: z.enum(["off", "daily", "weekly"]) }),
    channels: z.partialRecord(z.enum(CHAT_LAYOUTS), z.object({ syncInstructions: z.boolean(), instructions: z.string().trim().max(8000) })),
    setupSkipped: z.array(z.string().max(40)).max(30),
  })
  .partial();

export const agentChange = z.object({
  name: z.string().trim().min(1, "Give your agent a name.").max(80).optional(),
  enabled: z.boolean().optional(),
  config: configChange.optional(),
});

/** A new agent starts from the business's website, or from its name when it has none. */
export const newAgent = z
  .object({
    website: z.string().trim().max(2000).optional(),
    name: z.string().trim().max(80).optional(),
    industry: z.enum(INDUSTRIES).optional(),
    color: z.enum(AGENT_COLORS).optional(),
  })
  .refine((v) => v.website || v.name, "Add your website address, or your business's name.");

/** The agent's settings with unsaved changes applied, for a preview reply. */
export const withChanges = (config: AgentConfig, change: z.infer<typeof configChange> | undefined): AgentConfig => mergeConfig(config, change);

/** The first problem in a request, in plain words. */
export const firstProblem = (error: z.ZodError) => error.issues[0]?.message ?? "Something in that request isn't right.";

/** Where a widget's parts come from in a response (dot paths). */
export const widgetMapping = z.object({
  items: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  subtitle: z.string().max(200).optional(),
  image: z.string().max(200).optional(),
  price: z.string().max(200).optional(),
  link: z.string().max(200).optional(),
  steps: z.string().max(200).optional(),
  current: z.string().max(200).optional(),
  columns: z.array(z.object({ label: z.string().trim().min(1).max(60), path: z.string().trim().min(1).max(200) })).max(8).optional(),
});
