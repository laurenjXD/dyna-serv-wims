"use client";

import type { InputHTMLAttributes } from "react";
import { Search, X } from "@/components/ui/icons";

export interface FilterSearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type"> {
  onClear?: () => void;
}

/** Canonical 48px search control for office filter bars. */
export function FilterSearchInput({ onClear, className = "", value, ...props }: FilterSearchInputProps) {
  const hasValue = value !== undefined && String(value).length > 0;

  return (
    <div className="relative w-full">
      <Search
        size={18}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-secondary"
        aria-hidden="true"
      />
      <input
        {...props}
        type="search"
        value={value}
        className={`h-12 w-full rounded-xl border border-border bg-surface px-10 pr-10 font-body text-base text-text-primary shadow-none outline-none transition-colors placeholder:text-text-secondary/70 focus:border-primary focus:ring-2 focus:ring-primary/20 ${className}`}
      />
      {hasValue && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-text-secondary transition-colors hover:bg-background hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Clear search"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
