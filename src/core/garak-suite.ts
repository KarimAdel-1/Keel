// The NVIDIA garak probes Keel runs against an agent: attacks that matter for customer-service assistants, whose
// detectors are rule based (no extra model downloads). Probe names are garak's own modules.

export interface SuiteProbe {
  probe: string;
  category: string;
  label: string;
}

export const GARAK_SUITE: SuiteProbe[] = [
  { probe: "promptinject.HijackHateHumans", category: "Prompt injection", label: "Hijacking the agent's goal" },
  { probe: "latentinjection.LatentInjectionReport", category: "Prompt injection", label: "Instructions hidden in a pasted report" },
  { probe: "latentinjection.LatentInjectionFactSnippetLegal", category: "Prompt injection", label: "Instructions hidden in a legal snippet" },
  { probe: "dan.DanInTheWild", category: "Jailbreak", label: "Jailbreak prompts seen in the wild" },
  { probe: "dan.AutoDANCached", category: "Jailbreak", label: "Automatically written jailbreaks" },
  { probe: "tap.TAPCached", category: "Jailbreak", label: "Tree-of-attacks jailbreaks" },
  { probe: "phrasing.PastTense", category: "Jailbreak", label: "Harmful requests asked in the past tense" },
  { probe: "encoding.InjectBase64", category: "Encoding tricks", label: "Instructions encoded in Base64" },
  { probe: "encoding.InjectROT13", category: "Encoding tricks", label: "Instructions encoded in ROT13" },
  { probe: "web_injection.MarkdownImageExfil", category: "Data leaks", label: "Data smuggled out in a markdown image" },
  { probe: "web_injection.StringAssemblyDataExfil", category: "Data leaks", label: "Data smuggled out in an assembled link" },
  { probe: "apikey.GetKey", category: "Data leaks", label: "Asking for secret keys" },
  { probe: "exploitation.SQLInjectionEcho", category: "Code injection", label: "SQL injection repeated back" },
  { probe: "exploitation.JinjaTemplatePythonInjection", category: "Code injection", label: "Template code injection" },
];

export const suiteEntry = (probe: string): SuiteProbe => GARAK_SUITE.find((p) => p.probe === probe) ?? { probe, category: "Other", label: probe };

/** What a scan found, by kind of attack: how many were tried, got through, and were stopped by NeMo Guardrails. */
export function summarizeAttempts(attempts: { probe: string; hit: boolean; blocked: boolean }[]) {
  const byProbe = new Map<string, SuiteProbe & { attempts: number; through: number; blocked: number }>();
  for (const a of attempts) {
    const entry = suiteEntry(a.probe.replace(/^probes\./, ""));
    const row = byProbe.get(entry.probe) ?? { ...entry, attempts: 0, through: 0, blocked: 0 };
    row.attempts++;
    if (a.hit) row.through++;
    if (a.blocked) row.blocked++;
    byProbe.set(entry.probe, row);
  }
  const rows = [...byProbe.values()].sort((a, b) => b.through - a.through || a.category.localeCompare(b.category));
  return { rows, attempts: attempts.length, through: attempts.filter((a) => a.hit).length, blocked: attempts.filter((a) => a.blocked).length };
}
