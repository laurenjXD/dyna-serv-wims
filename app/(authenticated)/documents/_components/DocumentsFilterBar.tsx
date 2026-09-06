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
    <div className="mb-6 space-y-3 rounded-2xl border border-outline-variant/30 bg-surface-white p-4 shadow-elevation-1">
      <div className="flex flex-wrap items-center gap-3">
        {/* Search input */}
        <div className="relative min-w-[240px] flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-grey"
            aria-hidden="true"
          />
          <input
            type="text"
            placeholder="Search document #, reference, lot, organization..."
            value={currentSearch}
            onChange={(e) => updateParam("q", e.target.value)}
            className="h-11 w-full rounded-xl border border-outline-variant/40 bg-surface-white pl-10 pr-9 font-body text-body-md text-on-surface placeholder:text-text-grey/60 focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
          />
          {currentSearch && (
            <button
              type="button"
              onClick={() => updateParam("q", null)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-grey hover:text-on-surface"
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Organization dropdown */}
        <div className="relative min-w-[200px]">
          <Building2
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-grey"
            aria-hidden="true"
          />
          <select
            value={currentParty}
            onChange={(e) => updateParam("partyId", e.target.value)}
            className="h-11 w-full appearance-none rounded-xl border border-outline-variant/40 bg-surface-white pl-10 pr-8 font-body text-body-md text-on-surface focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
          >
            <option value="">All Organizations</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name} ({org.code})
              </option>
            ))}
          </select>
        </div>

        {/* Date From */}
        <div className="relative min-w-[150px]">
          <Calendar
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-grey"
            aria-hidden="true"
          />
          <input
            type="date"
            value={currentFrom}
            onChange={(e) => updateParam("from", e.target.value)}
            className="h-11 w-full rounded-xl border border-outline-variant/40 bg-surface-white pl-9 pr-3 font-body text-body-md text-on-surface focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
            aria-label="Filter from date"
          />
        </div>

        {/* Date To */}
        <div className="relative min-w-[150px]">
          <Calendar
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-grey"
            aria-hidden="true"
          />
          <input
            type="date"
            value={currentTo}
            onChange={(e) => updateParam("to", e.target.value)}
            className="h-11 w-full rounded-xl border border-outline-variant/40 bg-surface-white pl-9 pr-3 font-body text-body-md text-on-surface focus:border-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-navy"
            aria-label="Filter to date"
          />
        </div>

        {/* Clear Filters CTA */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearAllFilters}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-outline-variant/40 px-3 font-label text-label text-text-grey hover:bg-surface-light-grey hover:text-on-surface focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            <X size={16} />
            Reset Filters
          </button>
        )}
      </div>

      {/* Status filter pills */}
      {statusOptions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="mr-1 inline-flex items-center gap-1 font-label text-label uppercase tracking-wider text-text-grey">
            <Filter size={14} /> Status:
          </span>
          <button
            type="button"
            onClick={() => updateParam("status", null)}
            className={`h-8 rounded-full px-3 font-label text-label transition-colors ${
              !currentStatus
                ? "bg-on-surface text-surface-white font-bold"
                : "border border-outline-variant/40 bg-surface-white text-text-grey hover:bg-surface-light-grey"
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
                className={`h-8 rounded-full px-3 font-label text-label transition-colors ${
                  isSelected
                    ? "bg-brand-navy text-surface-white font-bold"
                    : "border border-outline-variant/40 bg-surface-white text-text-grey hover:bg-surface-light-grey"
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
