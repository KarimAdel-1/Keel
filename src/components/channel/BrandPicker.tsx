"use client";

import { Check, ImageUp, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { inkFor, type Brand } from "@/core/agents";
import { AgentAvatar } from "../ui";

const MAX_PICTURE_BYTES = 300 * 1024;
const PICTURE_TYPES = "image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/x-icon";

/**
 * The agent's picture and the colours found on the business's website: use the site's logo or upload another, and
 * pick the chat's colour from the site's palette in one tap.
 */
export function BrandPicker({
  brand,
  name,
  color,
  avatar,
  onColor,
  onAvatar,
}: {
  brand: Brand;
  name: string;
  color: string;
  avatar?: string;
  onColor: (color: string) => void;
  onAvatar: (avatar: string) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_PICTURE_BYTES) return setError("That picture is too large. Use one under 300 KB.");
    if (!PICTURE_TYPES.split(",").includes(file.type)) return setError("Use a PNG, JPEG, GIF, WebP, SVG or icon image.");
    const reader = new FileReader();
    reader.onload = () => {
      setError(null);
      onAvatar(String(reader.result));
    };
    reader.readAsDataURL(file);
    if (picker.current) picker.current.value = "";
  }

  return (
    <div className="space-y-4">
      <div>
        <span className="label">Picture</span>
        <div className="flex flex-wrap items-center gap-3">
          <AgentAvatar name={name} color={color} src={avatar || undefined} size={44} />
          <div className="flex flex-wrap gap-2">
            {brand.logo && avatar !== brand.logo && (
              <button type="button" onClick={() => onAvatar(brand.logo!)} className="btn btn-secondary px-3 py-1.5 text-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={brand.logo} alt="" className="size-4 object-contain" /> Use your logo
              </button>
            )}
            <button type="button" onClick={() => picker.current?.click()} className="btn btn-secondary px-3 py-1.5 text-xs">
              <ImageUp className="size-3.5" /> Upload
            </button>
            {avatar && (
              <button type="button" onClick={() => onAvatar("")} className="btn btn-ghost px-3 py-1.5 text-xs">
                <Trash2 className="size-3.5" /> Use the first letter
              </button>
            )}
          </div>
          <input ref={picker} type="file" accept={PICTURE_TYPES} className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
        </div>
        {error && <p className="mt-2 text-xs text-bad">{error}</p>}
      </div>
      {brand.colors.length > 0 && (
        <div>
          <span className="label">Colours from your website</span>
          <div className="flex flex-wrap gap-2">
            {brand.colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => onColor(c)}
                className="group inline-flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-xs font-medium transition hover:border-line-strong"
                aria-pressed={color.toLowerCase() === c}
                title={`Use ${c}`}
              >
                <span className="inline-flex size-6 items-center justify-center rounded-full" style={{ background: c }}>
                  {color.toLowerCase() === c && <Check className="size-3.5" style={{ color: inkFor(c) }} />}
                </span>
                <span className="font-mono text-[11px] uppercase text-muted">{c}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
