"use client";

import { FormEvent, KeyboardEvent, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

type SearchContext = {
  label: string;
  suggestions: string[];
  parameter: string;
};

const DEFAULT_CONTEXT: SearchContext = {
  label: "this page",
  suggestions: ["status", "item", "lot", "organization", "location"],
  parameter: "q",
};

function getSearchContext(pathname: string): SearchContext {
  if (pathname.startsWith("/inventory")) {
    return {
      label: "Inventory",
      suggestions: ["item code", "item name", "lot number", "location", "organization"],
      parameter: "q",
    };
  }
  if (pathname.startsWith("/approvals")) {
    return {
      label: "Approvals",
      suggestions: ["pending", "expired", "approved", "item", "lot"],
      parameter: "q",
    };
  }
  if (pathname.startsWith("/documents")) {
    return {
      label: "Documents",
      suggestions: ["pick list", "acknowledgement receipt", "organization", "signed", "pending"],
      parameter: "q",
    };
  }
  if (pathname.startsWith("/receiving")) {
    return {
      label: "Receiving",
      suggestions: ["WRR number", "party", "pending", "received", "lot"],
      parameter: "q",
    };
  }
  if (pathname.startsWith("/outgoing") || pathname.startsWith("/pick-lists")) {
    return {
      label: "Picking & Dispatch",
      suggestions: ["pick list", "organization", "lot", "location", "dispatched"],
      parameter: "q",
    };
  }
  if (pathname.startsWith("/transfers")) {
    return {
      label: "Transfers",
      suggestions: ["transfer number", "pending", "inspection", "approved", "rejected"],
      parameter: "q",
    };
  }
  return DEFAULT_CONTEXT;
}

export function GlobalSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const context = getSearchContext(pathname);

  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return context.suggestions;
    return context.suggestions.filter((suggestion) =>
      suggestion.toLowerCase().includes(normalized),
    );
  }, [context.suggestions, query]);

  function submitSearch(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(context.parameter, trimmed);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
    setFocused(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitSearch(query);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setFocused(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div className="relative mx-auto min-w-0 flex-1 max-w-[570px]">
      <form
        role="search"
        onSubmit={handleSubmit}
        className="flex h-10 w-full items-center gap-2.5 rounded-full border border-brand-royal-blue/10 bg-background/70 px-3.5 shadow-[inset_0_1px_2px_rgba(15,23,42,0.04)] focus-within:border-brand-royal-blue/40 focus-within:ring-2 focus-within:ring-brand-royal-blue/20"
      >
        <Search size={18} aria-hidden="true" className="shrink-0 text-text-secondary" />
        <input
          ref={inputRef}
          type="search"
          aria-label={`Search ${context.label}`}
          aria-autocomplete="list"
          aria-controls="global-search-suggestions"
          aria-expanded={focused && suggestions.length > 0}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={handleKeyDown}
          placeholder={`Search ${context.label.toLowerCase()}…`}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 font-body text-body-sm text-text-primary outline-none placeholder:text-text-secondary"
        />
        <kbd className="hidden items-center gap-1 rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-mono-xs font-semibold text-text-secondary shadow-sm xl:inline-flex">
          <span aria-hidden="true">⌘</span>K
        </kbd>
      </form>

      {focused && suggestions.length > 0 && (
        <div
          id="global-search-suggestions"
          role="listbox"
          aria-label={`${context.label} search suggestions`}
          className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-elevation-2"
        >
          <p className="px-3 py-1.5 font-label text-label uppercase tracking-[0.05em] text-text-secondary">
            Search {context.label}
          </p>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              role="option"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setQuery(suggestion);
                submitSearch(suggestion);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-body text-body-sm text-text-primary hover:bg-background focus:bg-background focus:outline-none"
            >
              <Search size={15} aria-hidden="true" className="text-text-secondary" />
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
