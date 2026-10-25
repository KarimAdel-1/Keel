import type { ReactNode } from "react";

/** The bar at the top of a dashboard page: its icon and title (or a switcher), and its actions on the right. */
export function PageBar({ icon, title, actions }: { icon?: ReactNode; title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="dashboard-pagebar sticky top-14 z-20 border-b border-line bg-panel lg:top-0">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          {icon && <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-panel-2 text-muted">{icon}</span>}
          <div className="min-w-0 truncate text-[16px] font-semibold tracking-[-0.01em]">{title}</div>
        </div>
        {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** The content under a page bar. */
export function PageBody({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return <div className={`dashboard-pagebody mx-auto w-full space-y-6 px-4 py-7 sm:px-7 ${wide ? "max-w-[1500px]" : "max-w-[1200px]"}`}>{children}</div>;
}
