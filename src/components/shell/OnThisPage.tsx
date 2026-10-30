"use client";

import { useEffect, useState } from "react";

/** Where a section counts as being read: from just under the page bar to a little under half the screen. */
const READING = "-80px 0px -55% 0px";

/**
 * A page's sections listed beside it, "On this page": each a link down to its section, along a thin line, with the
 * section being read marked in Keel blue as the reader scrolls (the last one once the page is scrolled to its end).
 */
export function OnThisPage({ sections }: { sections: { id: string; title: string }[] }) {
  const [current, setCurrent] = useState(sections[0]?.id);
  const ids = sections.map((s) => s.id).join(" ");

  useEffect(() => {
    const order = ids.split(" ");
    const reading = new Map<string, boolean>();
    const atEnd = () => window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) reading.set(e.target.id, e.isIntersecting);
        const first = order.find((id) => reading.get(id));
        if (atEnd()) setCurrent(order[order.length - 1]);
        else if (first) setCurrent(first);
      },
      { rootMargin: READING },
    );
    for (const id of order) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    const onScroll = () => atEnd() && setCurrent(order[order.length - 1]);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [ids]);

  return (
    <nav aria-label="On this page" className="text-sm">
      <p className="mb-3 font-medium text-text">On this page</p>
      <ul className="border-l border-line">
        {sections.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              onClick={(e) => {
                const target = document.getElementById(s.id);
                if (!target) return;
                e.preventDefault();
                setCurrent(s.id);
                target.scrollIntoView({ behavior: "smooth", block: "start" });
                history.replaceState(null, "", `#${s.id}`);
              }}
              aria-current={current === s.id ? "location" : undefined}
              className={`-ml-px block border-l-2 py-1.5 pl-4 transition-colors ${current === s.id ? "border-brand font-medium text-text" : "border-transparent text-muted hover:text-text"}`}
            >
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
