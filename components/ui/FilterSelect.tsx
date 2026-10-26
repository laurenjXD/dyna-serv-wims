"use client";

import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

export interface FilterSelectOption {
  value: string;
  label: string;
}

export interface FilterSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> {
  label: string;
  value: string;
  options: FilterSelectOption[];
  onChange: (value: string) => void;
  className?: string;
  labelClassName?: string;
}

export function FilterSelect({ label, value, options, onChange, className = "", labelClassName = "", ...props }: FilterSelectProps) {
  return (
    <label className={`group inline-flex h-20 w-full min-w-0 max-w-full items-center gap-3 rounded-2xl border border-border bg-surface px-5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 sm:w-[360px] ${className}`}>
      <span className={`shrink-0 font-label text-label font-bold uppercase tracking-[0.12em] text-text-secondary ${labelClassName}`}>{label}:</span>
      <span className="relative min-w-0 flex-1 overflow-hidden">
        <select
          {...props}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={props["aria-label"] ?? label}
          className="h-12 w-full min-w-0 appearance-none truncate rounded-xl border border-border bg-surface px-3 pr-10 font-heading text-[30px] font-semibold leading-none text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={24} strokeWidth={2.5} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-primary" aria-hidden="true" />
      </span>
    </label>
  );
}
