import type { ReactNode } from "react";

/** The bar at the top of a dashboard page: its icon and title (or a switcher), and its actions on the right. */
export function PageBar({ icon, title, actions }: { icon?: ReactNode; title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="sticky top-14 z-20 border-b border-line bg-panel lg:top-0">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {icon && <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">{icon}</span>}
          <div className="min-w-0 truncate text-[19px] font-semibold tracking-[-0.01em]">{title}</div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** The content under a page bar. */
export function PageBody({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={`mx-auto w-full space-y-6 px-4 py-6 sm:px-6 ${wide ? "max-w-[1500px]" : "max-w-[1200px]"}`}>{children}</div>;
}
