"use client";

import { ChevronDown } from "@/components/ui/icons";
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
    <label className={`group inline-flex h-12 w-full min-w-0 max-w-full items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 sm:w-auto sm:min-w-[220px] ${className}`}>
      <span className={`shrink-0 font-label text-xs font-bold uppercase tracking-[0.08em] text-text-secondary ${labelClassName}`}>{label}:</span>
      <span className="relative min-w-0 flex-1 overflow-hidden">
        <select
          {...props}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={props["aria-label"] ?? label}
          className="h-10 w-full min-w-0 appearance-none truncate rounded-xl border-0 bg-transparent px-0 pr-8 font-body text-base font-semibold leading-5 text-text-primary outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={20} strokeWidth={2.5} className="pointer-events-none absolute right-0.5 top-1/2 -translate-y-1/2 text-text-primary" aria-hidden="true" />
      </span>
    </label>
  );
}
