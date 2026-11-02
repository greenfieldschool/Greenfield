"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

// Filters the guides on the page as you type (every word must appear in the guide). Works on the rendered guides
// (data-learn-guide / data-learn-section), so the guide text stays in the server component.
export function LearnSearch({ total }: { total: number }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(total);

  useEffect(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    let count = 0;
    document.querySelectorAll<HTMLElement>("[data-learn-section]").forEach((section) => {
      let visible = 0;
      section.querySelectorAll<HTMLElement>("[data-learn-guide]").forEach((guide) => {
        const text = (guide.textContent ?? "").toLowerCase();
        const match = words.every((w) => text.includes(w));
        guide.hidden = !match;
        if (match) visible += 1;
      });
      section.hidden = visible === 0;
      count += visible;
    });
    // style, not `hidden`: the category grid's own display: grid would win over the hidden attribute.
    document.querySelectorAll<HTMLElement>("[data-learn-hide-when-searching]").forEach((el) => {
      el.style.display = words.length ? "none" : "";
    });
    setShown(count);
  }, [query]);

  return (
    <div>
      <label htmlFor="learn-search" className="sr-only">
        Search the guides
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          id="learn-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the guides, e.g. payment ID, welfare, certificates"
          className="gf-input !pl-10 !pr-10"
          autoComplete="off"
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Clear the search"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-slate-500" aria-live="polite">
        {query
          ? shown
            ? `${shown} guide${shown === 1 ? "" : "s"} found.`
            : "No guide matches that. Try fewer or different words."
          : `${total} guides.`}
      </p>
    </div>
  );
}
