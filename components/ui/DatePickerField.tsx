"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "@/components/ui/icons";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDate(value: string): string {
  const parsed = parseIsoDate(value);
  return parsed
    ? `${String(parsed.month).padStart(2, "0")}/${String(parsed.day).padStart(2, "0")}/${parsed.year}`
    : "";
}

function monthStart(year: number, month: number): Date {
  return new Date(year, month - 1, 1);
}

export function DatePickerField({
  id,
  name,
  value,
  onChange,
  required = false,
  disabled = false,
  placeholder = "MM/DD/YYYY",
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedDate = parseIsoDate(value);
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() =>
    selectedDate ? monthStart(selectedDate.year, selectedDate.month) : monthStart(today.getFullYear(), today.getMonth() + 1),
  );

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const days = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const leadingBlankDays = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: leadingBlankDays }, () => null as number | null),
      ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
    ];
  }, [viewMonth]);

  function openPicker() {
    if (disabled) return;
    setViewMonth(
      selectedDate
        ? monthStart(selectedDate.year, selectedDate.month)
        : monthStart(today.getFullYear(), today.getMonth() + 1),
    );
    setOpen(true);
  }

  function shiftMonth(offset: number) {
    setViewMonth((current) => new Date(current.getFullYear(), current.getMonth() + offset, 1));
  }

  function chooseDay(day: number) {
    onChange(toIsoDate(viewMonth.getFullYear(), viewMonth.getMonth() + 1, day));
    setOpen(false);
  }

  const displayValue = formatDate(value);
  const viewYear = viewMonth.getFullYear();
  const viewMonthIndex = viewMonth.getMonth();

  return (
    <div ref={rootRef} className="relative">
      <input type="hidden" name={name} value={value} />
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-label={displayValue || "Select date"}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-required={required || undefined}
        onClick={openPicker}
        className="mt-1 flex h-11 w-full items-center justify-between rounded-lg border border-slate-200 bg-surface-white px-3 text-left font-body text-body-md text-on-surface focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20 disabled:cursor-not-allowed disabled:bg-surface-light-grey"
      >
        <span className={displayValue ? "text-on-surface" : "text-status-neutral"}>
          {displayValue || placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-text-grey transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose date"
          className="absolute left-0 top-full z-50 mt-1 w-[18rem] rounded-xl border border-slate-200 bg-surface-white p-3 shadow-elevation-4"
        >
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => shiftMonth(-1)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-text-grey hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <div className="grid min-w-0 flex-1 grid-cols-[1fr_5.5rem] gap-1.5">
              <label className="relative">
                <span className="sr-only">Month</span>
                <select
                  aria-label="Month"
                  value={viewMonthIndex}
                  onChange={(event) => setViewMonth(monthStart(viewYear, Number(event.target.value) + 1))}
                  className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-surface-white px-2 pr-7 font-label text-sm font-bold text-on-surface focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
                >
                  {MONTHS.map((month, index) => <option key={month} value={index}>{month}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-grey" aria-hidden="true" />
              </label>
              <label className="relative">
                <span className="sr-only">Year</span>
                <select
                  aria-label="Year"
                  value={viewYear}
                  onChange={(event) => setViewMonth(monthStart(Number(event.target.value), viewMonthIndex + 1))}
                  className="h-9 w-full appearance-none rounded-lg border border-slate-200 bg-surface-white px-2 pr-7 font-label text-sm font-bold text-on-surface focus:border-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
                >
                  {Array.from({ length: MAX_YEAR - MIN_YEAR + 1 }, (_, index) => {
                    const year = MIN_YEAR + index;
                    return <option key={year} value={year}>{year}</option>;
                  })}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-grey" aria-hidden="true" />
              </label>
            </div>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => shiftMonth(1)}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-text-grey hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 text-center font-label text-xs font-bold text-text-grey" role="row">
            {WEEKDAYS.map((day) => <span key={day} role="columnheader" className="py-1">{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1" role="grid">
            {days.map((day, index) => {
              if (day === null) return <span key={`blank-${index}`} aria-hidden="true" className="h-9" />;
              const dateValue = toIsoDate(viewYear, viewMonthIndex + 1, day);
              const isSelected = value === dateValue;
              return (
                <button
                  key={dateValue}
                  type="button"
                  role="gridcell"
                  aria-selected={isSelected}
                  onClick={() => chooseDay(day)}
                  className={`h-9 rounded-lg font-body text-sm focus:outline-none focus:ring-2 focus:ring-brand-navy ${isSelected ? "bg-brand-navy font-bold text-surface-white" : "text-on-surface hover:bg-blue-50"}`}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
