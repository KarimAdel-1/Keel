"use client";
import type { Industry } from "@/core/agents";
import { INDUSTRY_PRESETS } from "@/core/industries";

export function BusinessFilter({ value, onChange }: { value: Industry; onChange: (value: Industry) => void }) {
  return (
    <label className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-muted">Business type</span>
      <select aria-label="Business type" className="field w-full sm:w-64" value={value} onChange={(e) => onChange(e.target.value as Industry)}>
        {Object.entries(INDUSTRY_PRESETS).map(([key, preset]) => (
          <option key={key} value={key}>
            {preset.label}
          </option>
        ))}
      </select>
    </label>
  );
}
