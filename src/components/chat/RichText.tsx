import { Fragment, type ReactNode } from "react";

// An agent's reply as formatted text: paragraphs, lists, bold, links, and its citations ([2]) as small numbered
// markers. Built as React elements, never as HTML, so nothing in a reply can run in the page.

const INLINE = /(\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<]+[^\s<.,;:!?)\]]|\[\d{1,2}\])/g;

function inline(text: string, onCite?: (n: number) => void): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (i % 2 === 0) return part;
    if (part.startsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    const cite = part.match(/^\[(\d{1,2})\]$/);
    if (cite) {
      const n = Number(cite[1]);
      return (
        <button
          key={i}
          type="button"
          onClick={() => onCite?.(n)}
          className="mx-0.5 inline-flex h-4 min-w-4 -translate-y-px items-center justify-center rounded bg-black/[0.07] px-1 align-middle text-[10px] font-semibold text-muted hover:bg-black/[0.12]"
          aria-label={`Source ${n}`}
        >
          {n}
        </button>
      );
    }
    const link = part.match(/^\[([^\]]+)\]\((.+)\)$/);
    const [label, href] = link ? [link[1], link[2]] : [part, part];
    return (
      <a key={i} href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
        {label}
      </a>
    );
  });
}

type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };

function blocks(text: string): Block[] {
  const out: Block[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d{1,2}[.)]\s+(.*)$/);
    const last = out.at(-1);
    if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      const item = (bullet ?? numbered)![1];
      if (last?.kind === kind) last.items.push(item);
      else out.push({ kind, items: [item] });
    } else if (!line.trim()) {
      if (last && !(last.kind === "p" && !last.lines.length)) out.push({ kind: "p", lines: [] });
    } else {
      const heading = line.replace(/^#{1,6}\s+/, "");
      if (last?.kind === "p") last.lines.push(heading === line ? line : `**${heading}**`);
      else out.push({ kind: "p", lines: [heading === line ? line : `**${heading}**`] });
    }
  }
  return out.filter((b) => (b.kind === "p" ? b.lines.length : b.items.length));
}

export function RichText({ text, onCite }: { text: string; onCite?: (n: number) => void }) {
  return (
    <div className="space-y-2">
      {blocks(text).map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>
            {b.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(line, onCite)}
              </Fragment>
            ))}
          </p>
        ) : b.kind === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((item, j) => <li key={j}>{inline(item, onCite)}</li>)}
          </ul>
        ) : (
          <ol key={i} className="list-decimal space-y-1 pl-5">
            {b.items.map((item, j) => <li key={j}>{inline(item, onCite)}</li>)}
          </ol>
        ),
      )}
    </div>
  );
}
