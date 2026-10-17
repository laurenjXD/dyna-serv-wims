"use client";

import { ChevronDown } from "lucide-react";

export interface FilterSelectOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  label: string;
  value: string;
  options: FilterSelectOption[];
  onChange: (value: string) => void;
  className?: string;
}

export function FilterSelect({ label, value, options, onChange, className = "" }: FilterSelectProps) {
  return (
    <label className={`inline-flex h-10 min-w-0 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 shadow-2xs ${className}`}>
      <span className="shrink-0 font-body text-[14px] font-bold uppercase leading-5 text-text-grey">{label}:</span>
      <span className="relative min-w-0 flex-1">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-full min-w-0 appearance-none bg-transparent pr-5 font-body text-[14px] font-semibold leading-5 text-on-surface focus:outline-none"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={15} className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-on-surface" aria-hidden="true" />
      </span>
    </label>
  );
}
