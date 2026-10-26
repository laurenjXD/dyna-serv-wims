"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X, Filter } from "@/components/ui/icons";
import { useCallback, useTransition } from "react";
import { FilterDateInput, FilterSearchInput, FilterSelect } from "@/components/ui";

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
    <div className="mb-4 space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-elevation-1">
      <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_minmax(220px,auto)_minmax(200px,auto)_minmax(200px,auto)_auto] lg:items-center">
        {/* Search input */}
        <div className="relative min-w-0">
          <label htmlFor="document-filter-search" className="sr-only">Search documents</label>
          <FilterSearchInput
            id="document-filter-search"
            placeholder="Search documents, references, lots, or organizations"
            value={currentSearch}
            onChange={(e) => updateParam("q", e.target.value)}
            onClear={() => updateParam("q", null)}
          />
        </div>

        {/* Organization dropdown */}
        <div className="w-full lg:w-auto">
          <FilterSelect
            label="Organization"
            value={currentParty}
            onChange={(value) => updateParam("partyId", value)}
            options={[
              { value: "", label: "All Organizations" },
              ...organizations.map((org) => ({ value: org.id, label: `${org.name} (${org.code})` })),
            ]}
            className="w-full lg:min-w-[250px]"
          />
        </div>

        {/* Date Range Inputs & Reset Action */}
        <div className="contents">
          <div className="grid grid-cols-2 gap-3 lg:contents">
            {/* From date */}
            <FilterDateInput
              label="From"
              value={currentFrom}
              onChange={(e) => updateParam("from", e.target.value)}
              aria-label="Filter from date"
              className="w-full"
            />

            {/* To date */}
            <FilterDateInput
              label="To"
              value={currentTo}
              onChange={(e) => updateParam("to", e.target.value)}
              aria-label="Filter to date"
              className="w-full"
            />
          </div>

          {/* Reset button: aligned with dates on mobile, and at end on desktop */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex h-12 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 font-body text-sm font-semibold text-text-secondary hover:border-primary hover:text-text-primary transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
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
