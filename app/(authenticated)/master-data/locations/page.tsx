// Location list page — searchable, paginated.
// Gated by locations.read; New Location button gated by locations.manage.
//
// Traceability: specs/06-party-and-item-enrollment/design.md §6a, §7

import Link from "next/link";
import { db } from "@/lib/db/client";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { listLocations } from "@/lib/db/queries/locations";

const PAGE_SIZE = 25;

interface PageProps {
  searchParams: Promise<{ search?: string; page?: string }>;
}

export default async function LocationsPage({ searchParams }: PageProps) {
  const { search, page } = await searchParams;
  const resolver = await createPageResolver();

  // Require locations.read minimum
  const readPerm = await requirePermission(resolver, "locations.read");
  if (readPerm.kind !== "authorized") {
    // Graceful: show empty list-like page rather than 404 — the route itself
    // is not sensitive to disclose (not existence-leaking per design.md §8).
    return (
      <div className="mx-auto max-w-container">
        <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
          Locations
        </h1>
        <p className="mt-4 font-body text-body-md text-text-grey">
          You do not have access to view locations.
        </p>
      </div>
    );
  }

  const currentPage = Math.max(1, parseInt(page ?? "1", 10));
  const offset = (currentPage - 1) * PAGE_SIZE;

  const [canManage, { rows, total }] = await Promise.all([
    requirePermission(resolver, "locations.manage").then(
      (r) => r.kind === "authorized",
    ),
    listLocations(db, { search, limit: PAGE_SIZE, offset }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const searchParams_ = new URLSearchParams();
  if (search) searchParams_.set("search", search);

  return (
    <div className="mx-auto max-w-container">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
            Locations
          </h1>
          <p className="mt-1 font-body text-body-md text-text-grey">
            Physical storage and staging locations in the warehouse.
          </p>
        </div>
        {canManage && (
          <Link
            href="/master-data/locations/new"
            className="flex h-11 items-center justify-center rounded bg-brand-red px-6 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            New Location
          </Link>
        )}
      </div>

      <div className="mt-6">
        <form method="GET" className="flex gap-2">
          <label htmlFor="search" className="sr-only">
            Search locations
          </label>
          <input
            id="search"
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
              href="/master-data/locations"
              className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

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
                {rows.map((loc) => (
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
                href={`/master-data/locations?${new URLSearchParams({ ...Object.fromEntries(searchParams_), page: String(currentPage - 1) }).toString()}`}
                className="flex h-11 items-center rounded border border-outline-variant/30 px-3 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Previous
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/master-data/locations?${new URLSearchParams({ ...Object.fromEntries(searchParams_), page: String(currentPage + 1) }).toString()}`}
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
