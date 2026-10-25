"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { RichText } from "../chat/RichText";

/** Long reports retain every word, with an explicit disclosure instead of a wall of text. */
export function ReadableOutput({ text, label = "Full response", onCite }: { text: string; label?: string; onCite?: (n: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  if (text.length <= 420) return <RichText text={text} onCite={onCite} />;
  const first = text.split(/\n\s*\n/)[0];
  const excerpt = first.length > 320 ? `${first.slice(0, 320).replace(/\s+\S*$/, "")}…` : first;
  return (
    <div className="space-y-3">
      <div className="break-words leading-relaxed">{expanded ? <RichText text={text} onCite={onCite} /> : <p>{excerpt}</p>}</div>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand"
      >
        <ChevronDown className={`size-3.5 ${expanded ? "rotate-180" : ""}`} />
        {expanded ? "Show less" : `Read ${label.toLowerCase()}`}
      </button>
    </div>
  );
}
