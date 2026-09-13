"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X, Calendar, Building2, Filter } from "lucide-react";
import { useCallback, useTransition } from "react";

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
    <div className="mb-4 space-y-2.5 rounded-xl border border-slate-200/80 bg-surface-white p-3 shadow-2xs">
      <div className="flex flex-wrap items-center gap-2">
        {/* Search input */}
        <div className="relative min-w-[200px] flex-1">
          <Search
            size={15}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-grey"
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="Search document #, reference, lot, organization..."
            value={currentSearch}
            onChange={(e) => updateParam("q", e.target.value)}
            className="h-8 w-full rounded-lg border border-slate-200 bg-surface-white pl-8 pr-7 font-body text-xs text-on-surface placeholder:text-text-grey/60 focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
          />
          {currentSearch && (
            <button
              type="button"
              onClick={() => updateParam("q", null)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-grey hover:text-on-surface"
              aria-label="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Organization dropdown */}
        <div className="relative min-w-[160px] max-w-[220px]">
          <Building2
            size={15}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-grey"
            aria-hidden="true"
          />
          <select
            value={currentParty}
            onChange={(e) => updateParam("partyId", e.target.value)}
            className="h-8 w-full appearance-none rounded-lg border border-slate-200 bg-surface-white pl-8 pr-7 font-body text-xs text-on-surface focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy truncate"
          >
            <option value="">All Organizations</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} ({org.code})
              </option>
            ))}
          </select>
        </div>

        {/* Date Range Inputs */}
        <div className="flex items-center gap-1.5">
          <div className="relative w-[130px]">
            <Calendar
              size={13}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-grey"
              aria-hidden="true"
            />
            <input
              type="date"
              value={currentFrom}
              onChange={(e) => updateParam("from", e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 bg-surface-white pl-6 pr-2 font-mono text-[11px] text-on-surface focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
              aria-label="Filter from date"
            />
          </div>
          <span className="text-xs text-text-grey font-mono">-</span>
          <div className="relative w-[130px]">
            <Calendar
              size={13}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-grey"
              aria-hidden="true"
            />
            <input
              type="date"
              value={currentTo}
              onChange={(e) => updateParam("to", e.target.value)}
              className="h-8 w-full rounded-lg border border-slate-200 bg-surface-white pl-6 pr-2 font-mono text-[11px] text-on-surface focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
              aria-label="Filter to date"
            />
          </div>
        </div>

        {/* Clear Filters CTA */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 px-2.5 font-label text-xs text-text-grey hover:bg-slate-50 hover:text-on-surface focus:outline-none focus:ring-1 focus:ring-brand-navy cursor-pointer transition-colors"
          >
            <X size={13} />
            Reset
          </button>
        )}
      </div>

      {/* Status filter pills */}
      {statusOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-100">
          <span className="mr-1 inline-flex items-center gap-1 font-label text-[10px] font-bold uppercase tracking-wider text-text-grey">
            <Filter size={11} /> STATUS:
          </span>
          <button
            type="button"
            onClick={() => updateParam("status", null)}
            className={`h-6 rounded-full px-2.5 font-label text-[11px] transition-colors cursor-pointer ${
              !currentStatus
                ? "bg-slate-900 text-surface-white font-bold"
                : "border border-slate-200 bg-surface-white text-text-grey hover:bg-slate-50"
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
                className={`h-6 rounded-full px-2.5 font-label text-[11px] transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-brand-navy text-surface-white font-bold"
                    : "border border-slate-200 bg-surface-white text-text-grey hover:bg-slate-50"
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
