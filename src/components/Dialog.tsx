"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/** A window over the page: a title, its content, and optional buttons at the bottom. Escape or ✕ closes it. */
export function Dialog({ title, subtitle, onClose, children, footer, wide = false }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className={`m-auto rounded-2xl border border-line bg-panel p-0 text-text shadow-raised backdrop:bg-black/35 ${wide ? "w-[min(960px,calc(100vw-2rem))]" : "w-[min(620px,calc(100vw-2rem))]"}`}
    >
      <div className="flex max-h-[88dvh] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
          </div>
          <button type="button" onClick={() => ref.current?.close()} className="rounded-md p-1.5 text-muted hover:bg-panel-2 hover:text-text" title="Close">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </dialog>
  );
}
