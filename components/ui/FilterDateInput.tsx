import { CalendarDays } from "@/components/ui/icons";
import type { InputHTMLAttributes } from "react";

export interface FilterDateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label: string;
}

export function FilterDateInput({ label, className = "", ...props }: FilterDateInputProps) {
  return (
    <label className={`group inline-flex h-20 w-full min-w-0 max-w-full items-center gap-3 rounded-2xl border border-border bg-surface px-5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 sm:w-[280px] ${className}`}>
      <CalendarDays size={24} strokeWidth={2.25} className="shrink-0 text-text-secondary" aria-hidden="true" />
      <span className="shrink-0 font-label text-label font-bold uppercase tracking-[0.12em] text-text-secondary">{label}:</span>
      <span className="relative min-w-0 flex-1">
        <input
          {...props}
          type="date"
          aria-label={props["aria-label"] ?? label}
          className="h-12 w-full min-w-0 rounded-xl border border-border bg-surface px-3 font-heading text-[27px] font-semibold leading-none text-text-primary outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </span>
    </label>
  );
}
