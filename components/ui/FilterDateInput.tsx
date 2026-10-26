import { CalendarDays } from "@/components/ui/icons";
import type { InputHTMLAttributes } from "react";

export interface FilterDateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label: string;
}

export function FilterDateInput({ label, className = "", ...props }: FilterDateInputProps) {
  return (
    <label data-ui="filter-date-input" className={`group inline-flex h-12 w-full min-w-0 max-w-full items-center gap-2 rounded-xl border border-border bg-surface px-3.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 sm:w-auto sm:min-w-[210px] ${className}`}>
      <CalendarDays size={19} strokeWidth={2.25} className="shrink-0 text-text-secondary" aria-hidden="true" />
      <span className="shrink-0 font-label text-xs font-bold uppercase tracking-[0.08em] text-text-secondary">{label}:</span>
      <span className="relative min-w-0 flex-1">
        <input
          {...props}
          type="date"
          aria-label={props["aria-label"] ?? label}
          className="h-10 w-full min-w-0 !rounded-none !border-0 !bg-transparent !px-0 !shadow-none font-body text-base font-semibold leading-5 text-text-primary outline-none focus:!border-0 focus:!ring-0 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </span>
    </label>
  );
}
