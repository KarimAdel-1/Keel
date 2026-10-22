// The NVIDIA Nemotron models Keel uses, all served by Nebius Token Factory, with Token Factory's prices (its model
// list, 1 Oct 2026). Businesses pick one for each agent; Keel's own jobs (AI customers, judging, analytics)
// each have a fixed one.

export const MODEL_KEYS = ["nano", "lightning", "super", "ultra"] as const;
export type ModelKey = (typeof MODEL_KEYS)[number];

export interface ModelSpec {
  key: ModelKey;
  id: string;
  name: string;
  /** USD per million input tokens. */
  inputPrice: number;
  /** USD per million output tokens. */
  outputPrice: number;
  /**
   * How much the model thinks before answering, sent as `reasoning_effort`. Lightning (and Nano) write their thinking
   * into the reply itself unless it's off; Super and Ultra keep it in a separate field.
   */
  reasoning?: "none" | "minimal" | "low" | "medium" | "high";
  /** What it means for the owner, in a word or two. */
  plain: string;
  blurb: string;
}

export const MODELS: Record<ModelKey, ModelSpec> = {
  nano: {
    key: "nano",
    plain: "Quickest",
    id: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
    name: "Nemotron 3 Nano",
    inputPrice: 0.06,
    outputPrice: 0.24,
    reasoning: "none",
    blurb: "Small and quick, for short, simple answers.",
  },
  lightning: {
    key: "lightning",
    plain: "Fast",
    id: "nvidia/Nemotron-3_5-Lightning",
    name: "Nemotron 3.5 Lightning",
    inputPrice: 0.06,
    outputPrice: 0.24,
    reasoning: "none",
    blurb: "Fast and inexpensive. Good for everyday questions.",
  },
  super: {
    key: "super",
    plain: "Balanced (recommended)",
    id: "nvidia/nemotron-3-super-120b-a12b",
    name: "Nemotron 3 Super",
    inputPrice: 0.3,
    outputPrice: 0.9,
    blurb: "Recommended. The best answers for the cost: complete and careful on every message.",
  },
  ultra: {
    key: "ultra",
    plain: "Most careful",
    id: "nvidia/Nemotron-3-Ultra-550b-a55b",
    name: "Nemotron 3 Ultra",
    inputPrice: 1,
    outputPrice: 3,
    blurb: "The most careful reasoning, for complex policies. Slower.",
  },
};

/**
 * The NVIDIA model that reads pictures: what a customer's photo shows, the text in a picture of a document. It isn't
 * one a business picks for answers; Token Factory prices it like Super, and a picture costs only its tokens (about 500).
 */
export const VISION_MODEL: ModelSpec = {
  key: "super",
  plain: "Reads pictures",
  id: "nvidia/Nemotron-3.5-Super-VL",
  name: "Nemotron 3.5 Super VL",
  inputPrice: 0.3,
  outputPrice: 0.9,
  blurb: "NVIDIA's model for pictures: reads a customer's photo, or the text in a picture of a document.",
};

/** What "Automatic" means, for the model pickers. */
export const AUTO_BLURB = "Lower cost. Keel picks for each message: Nemotron 3.5 Lightning for a simple question its knowledge clearly answers, Nemotron 3 Super when it takes more. About half the cost of Super, but in a blind graded check Lightning's answers sometimes left out useful details (9.1 against 9.6 out of 10).";

/** The model behind each of Keel's own jobs. */
export const ROLE_MODEL = {
  /**
   * The customers played in tests. Super: on the real models Lightning wrote confused customer lines (asking the
   * assistant what it wanted to buy) and never ended a finished conversation; Super stayed a believable customer.
   */
  testCustomer: "super",
  /** Quick yes/no checks: NeMo Guardrails' rails. */
  quickCheck: "lightning",
  /** Grading test conversations against their criteria: first, and for every verdict that isn't clear. */
  firstJudge: "super",
  judge: "ultra",
  /** Topics, sentiment, knowledge gaps and Backstage. */
  analyst: "ultra",
  /** Drafting instructions, procedures and answers for a person to approve. */
  writer: "super",
} as const satisfies Record<string, ModelKey>;

export const modelFor = (key: ModelKey): ModelSpec => MODELS[key];

export const costOf = (spec: ModelSpec, inputTokens: number, outputTokens: number) =>
  (inputTokens * spec.inputPrice + outputTokens * spec.outputPrice) / 1_000_000;

/** A number of tokens as people read it: "840 tokens", "12.4k tokens", "3.1M tokens". */
export function tokenCount(n: number): string {
  if (n < 1000) return `${Math.round(n)} tokens`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k tokens`;
  return `${(n / 1_000_000).toFixed(1)}M tokens`;
}
