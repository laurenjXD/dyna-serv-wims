"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "@/components/ui/icons";
import { useCallback, useTransition } from "react";
import { FilterDateInput, FilterSearchInput, FilterSelect } from "@/components/ui";

export interface FilterPartyOption {
  id: string;
  name: string;
  code: string;
}

interface DocumentsFilterBarProps {
  organizations: FilterPartyOption[];
  activeTab: string;
  organizationLabel: string;
  showOrganizationFilter: boolean;
}

export function DocumentsFilterBar({
  organizations,
  activeTab,
  organizationLabel,
  showOrganizationFilter,
}: DocumentsFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const currentSearch = searchParams.get("q") ?? "";
  const currentParty = searchParams.get("partyId") ?? "";
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
    currentSearch || currentParty || currentFrom || currentTo,
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

        {/* Organization dropdown — only where the active document type has
            a meaningful organization relationship and the user is not
            already restricted to one organization by RBAC. */}
        {showOrganizationFilter && (
          <div className="w-full lg:w-auto">
            <FilterSelect
              label={organizationLabel}
              value={currentParty}
              onChange={(value) => updateParam("partyId", value)}
              options={[
                { value: "", label: "All Organizations" },
                ...organizations.map((org) => ({ value: org.id, label: `${org.name} (${org.code})` })),
              ]}
              className="w-full lg:min-w-[250px]"
            />
          </div>
        )}

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

    </div>
  );
}
