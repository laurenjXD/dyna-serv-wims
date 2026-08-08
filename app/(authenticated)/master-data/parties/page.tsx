// Party list page — searchable, paginated.
//
// Traceability:
//   specs/06-party-and-item-enrollment/design.md §7
//   specs/00-steering/brand-design-system.md (office surface, WCAG AA)

import Link from "next/link";
import { db } from "@/lib/db/client";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { listParties } from "@/lib/db/queries/parties";

const PAGE_SIZE = 25;

interface PageProps {
  searchParams: Promise<{ search?: string; page?: string }>;
}

export default async function PartiesPage({ searchParams }: PageProps) {
  const { search, page } = await searchParams;
  const resolver = await createPageResolver();

  const currentPage = Math.max(1, parseInt(page ?? "1", 10));
  const offset = (currentPage - 1) * PAGE_SIZE;

  // Gate on parties.read before any DB call — no RLS yet (cycle 2.4).
  const readResult = await requirePermission(resolver, "parties.read");
  if (readResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-4 py-12 text-center">
        <p className="font-body text-body-md text-text-grey">
          You do not have permission to view parties.
        </p>
      </div>
    );
  }

  const [canManage, { rows, total }] = await Promise.all([
    requirePermission(resolver, "parties.manage").then(
      (r) => r.kind === "authorized",
    ),
    listParties(db, { search, limit: PAGE_SIZE, offset }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const searchParams_ = new URLSearchParams();
  if (search) searchParams_.set("search", search);

  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading font-semibold text-headline-md text-brand-navy">
            Parties
          </h1>
          <p className="mt-1 font-body text-body-md text-text-grey">
            Vendors, suppliers, customers, and other business parties.
          </p>
        </div>
        {canManage && (
          <Link
            href="/master-data/parties/new"
            className="btn-diagonal-cut flex h-11 items-center justify-center rounded bg-brand-red px-6 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-navy"
          >
            New Party
          </Link>
        )}
      </div>

      {/* Search */}
      <div className="mt-6">
        <form method="GET" className="flex gap-2">
          <label htmlFor="search" className="sr-only">
            Search parties
          </label>
          <input
            id="search"
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
              href="/master-data/parties"
              className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-hidden rounded-md bg-white/75 backdrop-blur-md shadow-elevation-1">
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
                {rows.map((party) => (
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
                href={`/master-data/parties?${new URLSearchParams({ ...Object.fromEntries(searchParams_), page: String(currentPage - 1) }).toString()}`}
                className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-3 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
              >
                Previous
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/master-data/parties?${new URLSearchParams({ ...Object.fromEntries(searchParams_), page: String(currentPage + 1) }).toString()}`}
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
