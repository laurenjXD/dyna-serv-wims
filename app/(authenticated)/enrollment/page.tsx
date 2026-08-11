// Enrollment — tabbed master-data hub: Parties | Items | Locations.
//
// Traceability:
//   specs/06-party-and-item-enrollment/design.md §7 (list, search, pagination)
//   specs/00-steering/brand-design-system.md §3 (office tab pattern), §6
//     (office surface, Level 1 elevation)
//   lib/shell/registry.ts — id: "enrollment", surface: "office",
//     capability: "parties.read"
//   specs/00-steering/revision-log.md (2026-08-09 PO restructuring — new
//     /enrollment hub aggregates Parties / Items / Locations into one page)
//
// Surface: Office — desktop-first.
// Permission gate: parties.read — forbidden message (not notFound) if denied.
// Per-tab "New [Entity]" buttons are gated by the appropriate manage capability.

import Link from "next/link";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { listParties } from "@/lib/db/queries/parties";
import type { PartyListRow } from "@/lib/db/queries/parties";
import { listItems } from "@/lib/db/queries/items";
import type { ItemListRow } from "@/lib/db/queries/items";
import { listLocations } from "@/lib/db/queries/locations";
import type { LocationListRow } from "@/lib/db/queries/locations";

const PAGE_SIZE = 25;

type TabKey = "parties" | "items" | "locations";

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "parties", label: "Parties" },
  { key: "items", label: "Items" },
  { key: "locations", label: "Locations" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    search?: string;
    page?: string;
  }>;
}

export default async function EnrollmentPage({ searchParams }: PageProps) {
  const {
    tab: tabParam,
    search,
    page: pageParam,
  } = await searchParams;

  const activeTab: TabKey =
    tabParam === "items" ? "items" :
    tabParam === "locations" ? "locations" :
    "parties";

  const resolver = await createPageResolver();

  // Gate: parties.read required — show forbidden message (not 404) so the
  // route existence isn't hidden from users who simply lack the capability.
  const readResult = await requirePermission(resolver, "parties.read");
  if (readResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-4 py-12 text-center">
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to access the Enrollment hub.
        </p>
        <p className="mt-2 font-body text-body-sm text-text-grey">
          This page requires the{" "}
          <span className="font-mono text-mono-md">parties.read</span>{" "}
          capability.
        </p>
      </div>
    );
  }

  const currentPage = Math.max(1, parseInt(pageParam ?? "1", 10));
  const offset = (currentPage - 1) * PAGE_SIZE;

  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div>
        <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
          Master Data Management
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Configure and manage core system entities.
        </p>
      </div>

      {/* Tab switcher — office pattern per brand-design-system.md §3 */}
      <div
        role="tablist"
        aria-label="Enrollment sections"
        className="mt-6 flex gap-2 border-b border-outline-variant/30"
      >
        {TABS.map((tab) => {
          const isActive = tab.key === activeTab;
          const href =
            tab.key === "parties"
              ? "/enrollment"
              : tab.key === "items"
              ? "/enrollment?tab=items"
              : "/enrollment?tab=locations";
          return (
            <Link
              key={tab.key}
              href={href}
              role="tab"
              aria-selected={isActive}
              className={`flex h-11 items-center border-b-2 px-4 font-label text-label uppercase tracking-[0.05em] focus:outline-none focus:ring-2 focus:ring-brand-navy ${
                isActive
                  ? "border-brand-red text-brand-navy"
                  : "border-transparent text-text-grey hover:text-brand-navy"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {activeTab === "parties" ? (
        <PartiesTab
          resolver={resolver}
          search={search}
          currentPage={currentPage}
          offset={offset}
        />
      ) : activeTab === "items" ? (
        <ItemsTab
          resolver={resolver}
          search={search}
          currentPage={currentPage}
          offset={offset}
        />
      ) : (
        <LocationsTab
          resolver={resolver}
          search={search}
          currentPage={currentPage}
          offset={offset}
        />
      )}
    </div>
  );
}

// ─── Parties tab ──────────────────────────────────────────────────────────────

async function PartiesTab({
  resolver,
  search,
  currentPage,
  offset,
}: {
  resolver: Awaited<ReturnType<typeof createPageResolver>>;
  search?: string;
  currentPage: number;
  offset: number;
}) {
  const [canManage, { rows, total }] = await Promise.all([
    requirePermission(resolver, "parties.manage").then(
      (r) => r.kind === "authorized",
    ),
    listParties(db, { search, limit: PAGE_SIZE, offset }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const searchParams_ = new URLSearchParams({ tab: "parties" });
  if (search) searchParams_.set("search", search);

  return (
    <div>
      {/* Tab action bar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <form method="GET" className="flex gap-2">
          <input type="hidden" name="tab" value="parties" />
          <label htmlFor="parties-search" className="sr-only">
            Search parties
          </label>
          <input
            id="parties-search"
            name="search"
            type="search"
            defaultValue={search ?? ""}
            placeholder="Search by code or name…"
            className="flex-1 rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
          />
          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-red"
          >
            Search
          </button>
          {search && (
            <Link
              href="/enrollment?tab=parties"
              className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Clear
            </Link>
          )}
        </form>
        {canManage && (
          <Link
            href="/master-data/parties/new"
            className="flex h-11 items-center justify-center rounded bg-brand-red px-6 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            New Party
          </Link>
        )}
      </div>

      {/* Table */}
      <div className="mt-4 overflow-hidden rounded-md bg-surface-white shadow-elevation-1">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md text-text-grey">
              {search
                ? `No parties found for "${search}".`
                : "No parties enrolled yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Code
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Created
                  </th>
                  <th className="sr-only px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {rows.map((party: PartyListRow) => (
                  <tr key={party.id} className="hover:bg-surface-light-grey/50">
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {party.code}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {party.name}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-text-grey">
                      {party.contactPerson ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {party.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-status-available/10 px-2 py-0.5 font-label text-label text-status-available">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-status-neutral/10 px-2 py-0.5 font-label text-label text-status-neutral">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-text-grey">
                      {party.createdAt.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/master-data/parties/${party.id}`}
                        className="inline-flex h-11 items-center font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav
          aria-label="Parties pagination"
          className="mt-4 flex items-center justify-between"
        >
          <p className="font-body text-body-md text-text-grey">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Link
                href={`/enrollment?${new URLSearchParams({ ...Object.fromEntries(searchParams_), page: String(currentPage - 1) })}`}
                className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-3 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Previous
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/enrollment?${new URLSearchParams({ ...Object.fromEntries(searchParams_), page: String(currentPage + 1) })}`}
                className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-3 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

// ─── Items tab ────────────────────────────────────────────────────────────────

async function ItemsTab({
  resolver,
  search,
  currentPage,
  offset,
}: {
  resolver: Awaited<ReturnType<typeof createPageResolver>>;
  search?: string;
  currentPage: number;
  offset: number;
}) {
  const [canManage, itemsReadResult] = await Promise.all([
    requirePermission(resolver, "items.manage").then(
      (r) => r.kind === "authorized",
    ),
    requirePermission(resolver, "items.read"),
  ]);

  if (itemsReadResult.kind !== "authorized") {
    return (
      <div className="mt-6 rounded-md bg-surface-white shadow-elevation-1 px-6 py-12 text-center">
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view items.
        </p>
      </div>
    );
  }

  const { rows, total } = await listItems(db, { search, limit: PAGE_SIZE, offset });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const searchParams_ = new URLSearchParams({ tab: "items" });
  if (search) searchParams_.set("search", search);

  return (
    <div>
      {/* Tab action bar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <form method="GET" className="flex gap-2">
          <input type="hidden" name="tab" value="items" />
          <label htmlFor="items-search" className="sr-only">
            Search items
          </label>
          <input
            id="items-search"
            name="search"
            type="search"
            defaultValue={search ?? ""}
            placeholder="Search by code, name, or barcode…"
            className="flex-1 rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
          />
          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-red"
          >
            Search
          </button>
          {search && (
            <Link
              href="/enrollment?tab=items"
              className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Clear
            </Link>
          )}
        </form>
        {canManage && (
          <Link
            href="/master-data/items/new"
            className="flex h-11 items-center justify-center rounded bg-brand-red px-6 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            New Item
          </Link>
        )}
      </div>

      {/* Table */}
      <div className="mt-4 overflow-hidden rounded-md bg-surface-white shadow-elevation-1">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md text-text-grey">
              {search
                ? `No items found for "${search}".`
                : "No items enrolled yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Code
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Barcode
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    UOM
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Status
                  </th>
                  <th className="sr-only px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {rows.map((item: ItemListRow) => (
                  <tr key={item.id} className="hover:bg-surface-light-grey/50">
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {item.code}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {item.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-text-grey">
                      {item.barcode}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-text-grey uppercase">
                      {item.uom}
                    </td>
                    <td className="px-4 py-3">
                      {item.isActive ? (
                        <span className="inline-flex items-center rounded-full bg-status-available/10 px-2 py-0.5 font-label text-label text-status-available">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-status-neutral/10 px-2 py-0.5 font-label text-label text-status-neutral">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/master-data/items/${item.id}`}
                        className="inline-flex h-11 items-center font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav
          aria-label="Items pagination"
          className="mt-4 flex items-center justify-between"
        >
          <p className="font-body text-body-md text-text-grey">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Link
                href={`/enrollment?${new URLSearchParams({ ...Object.fromEntries(searchParams_), page: String(currentPage - 1) })}`}
                className="flex h-11 items-center rounded border border-outline-variant/30 px-3 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Previous
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/enrollment?${new URLSearchParams({ ...Object.fromEntries(searchParams_), page: String(currentPage + 1) })}`}
                className="flex h-11 items-center rounded border border-outline-variant/30 px-3 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

// ─── Locations tab ────────────────────────────────────────────────────────────

async function LocationsTab({
  resolver,
  search,
  currentPage,
  offset,
}: {
  resolver: Awaited<ReturnType<typeof createPageResolver>>;
  search?: string;
  currentPage: number;
  offset: number;
}) {
  const [canManage, locReadResult] = await Promise.all([
    requirePermission(resolver, "locations.manage").then(
      (r) => r.kind === "authorized",
    ),
    requirePermission(resolver, "locations.read"),
  ]);

  if (locReadResult.kind !== "authorized") {
    return (
      <div className="mt-6 rounded-md bg-surface-white shadow-elevation-1 px-6 py-12 text-center">
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view locations.
        </p>
      </div>
    );
  }

  const { rows, total } = await listLocations(db, { search, limit: PAGE_SIZE, offset });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const searchParams_ = new URLSearchParams({ tab: "locations" });
  if (search) searchParams_.set("search", search);

  return (
    <div>
      {/* Tab action bar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <form method="GET" className="flex gap-2">
          <input type="hidden" name="tab" value="locations" />
          <label htmlFor="locations-search" className="sr-only">
            Search locations
          </label>
          <input
            id="locations-search"
            name="search"
            type="search"
            defaultValue={search ?? ""}
            placeholder="Search by label, zone, or type…"
            className="flex-1 rounded border border-outline-variant/30 bg-surface-white px-3 py-2 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-brand-navy"
          />
          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-brand-red"
          >
            Search
          </button>
          {search && (
            <Link
              href="/enrollment?tab=locations"
              className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Clear
            </Link>
          )}
        </form>
        {canManage && (
          <Link
            href="/master-data/locations/new"
            className="flex h-11 items-center justify-center rounded bg-brand-red px-6 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            New Location
          </Link>
        )}
      </div>

      {/* Table */}
      <div className="mt-4 overflow-hidden rounded-md bg-surface-white shadow-elevation-1">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md text-text-grey">
              {search
                ? `No locations found for "${search}".`
                : "No locations enrolled yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Label
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Zone
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Type
                  </th>
                  <th className="px-4 py-3 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Max CBM
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Status
                  </th>
                  <th className="sr-only px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {rows.map((loc: LocationListRow) => (
                  <tr key={loc.id} className="hover:bg-surface-light-grey/50">
                    <td className="px-4 py-3 font-mono text-mono-md font-bold text-on-surface">
                      {loc.label}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {loc.zone}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-text-grey capitalize">
                      {loc.locationType.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-mono-md text-on-surface">
                      {loc.maxCbmCapacity}
                    </td>
                    <td className="px-4 py-3">
                      {loc.isActive ? (
                        <span className="inline-flex items-center rounded-full bg-status-available/10 px-2 py-0.5 font-label text-label text-status-available">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-status-neutral/10 px-2 py-0.5 font-label text-label text-status-neutral">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/master-data/locations/${loc.id}`}
                        className="inline-flex h-11 items-center font-label text-label text-brand-navy underline hover:text-brand-royal-blue focus:outline-none focus:ring-2 focus:ring-brand-navy"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav
          aria-label="Locations pagination"
          className="mt-4 flex items-center justify-between"
        >
          <p className="font-body text-body-md text-text-grey">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Link
                href={`/enrollment?${new URLSearchParams({ ...Object.fromEntries(searchParams_), page: String(currentPage - 1) })}`}
                className="flex h-11 items-center rounded border border-outline-variant/30 px-3 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Previous
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/enrollment?${new URLSearchParams({ ...Object.fromEntries(searchParams_), page: String(currentPage + 1) })}`}
                className="flex h-11 items-center rounded border border-outline-variant/30 px-3 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
