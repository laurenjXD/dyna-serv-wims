"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X, Calendar, Filter } from "lucide-react";
import { useCallback, useTransition } from "react";
import { FilterSelect } from "@/components/ui/FilterSelect";

export interface FilterPartyOption {
  id: string;
  name: string;
  code: string;
}

interface DocumentsFilterBarProps {
  organizations: FilterPartyOption[];
  statusOptions: { label: string; value: string }[];
  activeTab: string;
}

export function DocumentsFilterBar({
  organizations,
  statusOptions,
  activeTab,
}: DocumentsFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentSearch = searchParams.get("q") ?? "";
  const currentParty = searchParams.get("partyId") ?? "";
  const currentStatus = searchParams.get("status") ?? "";
  const currentFrom = searchParams.get("from") ?? "";
  const currentTo = searchParams.get("to") ?? "";

  const updateParam = useCallback(
    (name: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value.trim().length > 0) {
        params.set(name, value);
      } else {
        params.delete(name);
      }
      params.delete("page"); // reset pagination on filter change
      startTransition(() => {
        router.push(`${pathname}?${params.toString()}`);
      });
    },
    [pathname, router, searchParams],
  );

  const clearAllFilters = useCallback(() => {
    const params = new URLSearchParams();
    params.set("tab", activeTab);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }, [activeTab, pathname, router]);

  const hasActiveFilters = Boolean(
    currentSearch || currentParty || currentStatus || currentFrom || currentTo,
  );

  return (
    <div className="mb-4 space-y-2.5 rounded-2xl border border-slate-200/80 bg-surface-white p-3 shadow-2xs">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {/* Search input */}
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-grey"
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="Search document #, reference, lot, organization..."
            value={currentSearch}
            onChange={(e) => updateParam("q", e.target.value)}
            className="h-10 w-full min-w-0 rounded-xl border border-border bg-surface-white pl-9 pr-8 font-body text-sm font-medium text-on-surface placeholder:text-text-grey/60 shadow-2xs focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy transition-colors"
          />
          {currentSearch && (
            <button
              type="button"
              onClick={() => updateParam("q", null)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-grey hover:text-on-surface p-0.5 rounded-full hover:bg-slate-100 transition-colors"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Organization dropdown */}
        <div className="w-full sm:w-[280px]">
          <FilterSelect
            label="Organization"
            value={currentParty}
            onChange={(value) => updateParam("partyId", value)}
            options={[
              { value: "", label: "All Organizations" },
              ...organizations.map((org) => ({ value: org.id, label: `${org.name} (${org.code})` })),
            ]}
            className="w-full"
          />
        </div>

        {/* Date Range Inputs & Reset Action */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="grid grid-cols-2 gap-2 flex-1 sm:flex sm:items-center">
            {/* From date */}
            <label className="relative inline-flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-border bg-surface-white px-2.5 shadow-2xs focus-within:border-brand-navy focus-within:ring-1 focus-within:ring-brand-navy transition-colors sm:w-[140px] sm:flex-none">
              <Calendar
                size={13}
                className="pointer-events-none shrink-0 text-text-grey"
                aria-hidden="true"
              />
              <span className="shrink-0 font-body text-[11px] font-semibold uppercase leading-4 text-text-grey">
                From:
              </span>
              <input
                type="date"
                value={currentFrom}
                onChange={(e) => updateParam("from", e.target.value)}
                className="h-8 w-full min-w-0 bg-transparent font-body text-xs sm:text-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
                aria-label="Filter from date"
              />
            </label>

            {/* To date */}
            <label className="relative inline-flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-border bg-surface-white px-2.5 shadow-2xs focus-within:border-brand-navy focus-within:ring-1 focus-within:ring-brand-navy transition-colors sm:w-[140px] sm:flex-none">
              <Calendar
                size={13}
                className="pointer-events-none shrink-0 text-text-grey"
                aria-hidden="true"
              />
              <span className="shrink-0 font-body text-[11px] font-semibold uppercase leading-4 text-text-grey">
                To:
              </span>
              <input
                type="date"
                value={currentTo}
                onChange={(e) => updateParam("to", e.target.value)}
                className="h-8 w-full min-w-0 bg-transparent font-body text-xs sm:text-sm font-semibold text-on-surface focus:outline-none cursor-pointer"
                aria-label="Filter to date"
              />
            </label>
          </div>

          {/* Reset button: aligned with dates on mobile, and at end on desktop */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/70 px-3 font-body text-xs font-bold text-rose-700 hover:bg-rose-100 hover:border-rose-300 transition-colors shadow-2xs cursor-pointer active:scale-95"
              title="Reset all filters"
            >
              <X size={14} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Status filter pills */}
      {statusOptions.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-2 border-t border-slate-100 pb-0.5 sm:flex-wrap">
          <span className="shrink-0 mr-1 inline-flex items-center gap-1 font-body text-xs font-bold uppercase tracking-wider text-text-grey">
            <Filter size={12} className="text-text-grey" /> Status:
          </span>
          <button
            type="button"
            onClick={() => updateParam("status", null)}
            className={`h-8 shrink-0 rounded-full px-3 font-body text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              !currentStatus
                ? "bg-slate-900 text-surface-white font-bold shadow-2xs"
                : "border border-slate-200 bg-surface-white text-text-grey hover:bg-slate-50 hover:text-on-surface"
            }`}
          >
            All
          </button>
          {statusOptions.map((opt) => {
            const isSelected = currentStatus === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => updateParam("status", isSelected ? null : opt.value)}
                className={`h-8 shrink-0 rounded-full px-3 font-body text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? "bg-brand-navy text-surface-white font-bold shadow-2xs"
                    : "border border-slate-200 bg-surface-white text-text-grey hover:bg-slate-50 hover:text-on-surface"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
