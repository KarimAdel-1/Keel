// What an action returns, as the model reads it: compact instead of raw JSON. Lists of records become small tables
// (the field names once, then one line per record), empty fields are left out, nested objects are indented, and long
// lists and texts are cut with a note saying so. Every value that stays is the original, word for word, so no fact is
// lost or reworded; only the punctuation and repetition of JSON go, which saves the most on lists of records (the
// same idea as token-oriented notations for LLM input).

const MAX_ROWS = 20;
const MAX_TEXT = 500;

const empty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length) || (typeof v === "object" && v !== null && !Array.isArray(v) && !Object.keys(v).length);

const scalar = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);

/** A value on one line: text cut at MAX_TEXT, and quoted when it holds a separator. */
function cell(v: unknown, separator = ","): string {
  if (typeof v !== "string") return String(v);
  const text = v.length > MAX_TEXT ? `${v.slice(0, MAX_TEXT)}…` : v;
  const flat = text.replace(/\s*\n\s*/g, " ");
  return flat.includes(separator) || flat.includes('"') ? JSON.stringify(flat) : flat;
}

/** A list of records that share their fields, with only scalar values: it can be a table. */
function tableFields(list: unknown[]): string[] | undefined {
  if (list.length < 2 || !list.every((r) => r && typeof r === "object" && !Array.isArray(r))) return undefined;
  const fields: string[] = [];
  for (const r of list as Record<string, unknown>[]) {
    for (const [k, v] of Object.entries(r)) {
      if (!scalar(v)) return undefined;
      if (!empty(v) && !fields.includes(k)) fields.push(k);
    }
  }
  return fields.length ? fields : undefined;
}

function lines(value: unknown, indent: string, key?: string): string[] {
  const label = key === undefined ? "" : `${key}: `;
  if (scalar(value)) return [`${indent}${label}${cell(value, "\n")}`];
  if (Array.isArray(value)) {
    const items = value.filter((v) => !empty(v));
    const shown = items.slice(0, MAX_ROWS);
    const more = items.length > shown.length ? [`${indent}  … ${items.length - shown.length} more`] : [];
    const name = key ?? "items";
    const fields = tableFields(shown);
    if (fields) {
      return [`${indent}${name}[${items.length}] (${fields.join(", ")}):`, ...shown.map((r) => `${indent}  ${fields.map((f) => (empty((r as Record<string, unknown>)[f]) ? "" : cell((r as Record<string, unknown>)[f]))).join(", ")}`), ...more];
    }
    if (shown.every(scalar)) return [`${indent}${name}[${items.length}]: ${shown.map((v) => cell(v)).join(", ")}${more.length ? ", …" : ""}`];
    return [
      `${indent}${name}[${items.length}]:`,
      ...shown.flatMap((v) => {
        const item = lines(v, `${indent}    `);
        return item.length ? [`${indent}  - ${item[0].trimStart()}`, ...item.slice(1)] : [];
      }),
      ...more,
    ];
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => !empty(v));
  const head = key === undefined ? [] : [`${indent}${key}:`];
  const inner = key === undefined ? indent : `${indent}  `;
  return [...head, ...entries.flatMap(([k, v]) => lines(v, inner, k))];
}

/** An action's result, compact, within `maxChars`. Text that isn't JSON is only cut to length. */
export function compactResult(result: unknown, maxChars = 3000): string {
  let value = result;
  if (typeof result === "string") {
    try {
      value = JSON.parse(result);
    } catch {
      return result.length > maxChars ? `${result.slice(0, maxChars)}… (cut: ${result.length - maxChars} more characters)` : result;
    }
  }
  const text = scalar(value) ? cell(value, "\n") : lines(value, "").join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n… (cut: ${text.length - maxChars} more characters)` : text;
}
