// A fixed set of values that also reads the words a model uses for them. Models answering in JSON sometimes write
// "Approved" for "granted" or "privacy" for "security"; a word that clearly means one value is read as that value,
// anything else is still refused (and the repair request names it).

import { z } from "zod";

const key = (value: string) => value.trim().toLowerCase().replace(/[\s-]+/g, "_");

/** `z.enum(values)` that first reads case, spacing and the given synonyms. The JSON schema it gives is the plain enum. */
export function lenientEnum<const T extends readonly [string, ...string[]]>(values: T, synonyms: Record<string, T[number]> = {}) {
  const exact = new Map(values.map((v) => [key(v), v]));
  return z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const k = key(value);
    return exact.get(k) ?? synonyms[k] ?? value;
  }, z.enum(values));
}
