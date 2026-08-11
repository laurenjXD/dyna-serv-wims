// Item list page — searchable, paginated.

import Link from "next/link";
import { db } from "@/lib/db/client";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { listItems } from "@/lib/db/queries/items";

const PAGE_SIZE = 25;

interface PageProps {
  searchParams: Promise<{ search?: string; page?: string }>;
}

export default async function ItemsPage({ searchParams }: PageProps) {
  const { search, page } = await searchParams;
  const resolver = await createPageResolver();

  const currentPage = Math.max(1, parseInt(page ?? "1", 10));
  const offset = (currentPage - 1) * PAGE_SIZE;

  // Gate on items.read before any DB call — no RLS yet (cycle 2.4).
  const readResult = await requirePermission(resolver, "items.read");
  if (readResult.kind !== "authorized") {
    return (
      <div className="mx-auto max-w-container px-4 py-12 text-center">
        <p className="font-body text-body-md text-on-surface-variant">
          You do not have permission to view items.
        </p>
      </div>
    );
  }

  const [canManage, { rows, total }] = await Promise.all([
    requirePermission(resolver, "items.manage").then(
      (r) => r.kind === "authorized",
    ),
    listItems(db, { search, limit: PAGE_SIZE, offset }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const searchParams_ = new URLSearchParams();
  if (search) searchParams_.set("search", search);

  return (
    <div className="mx-auto max-w-container">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
            Items
          </h1>
          <p className="mt-1 font-body text-body-md text-on-surface-variant">
            Shared item master catalog — referenced by VMI, Trading, and
            Supplies workflows.
          </p>
        </div>
        {canManage && (
          <Link
            href="/master-data/items/new"
            className="flex h-11 items-center justify-center rounded bg-action-blue px-6 font-label text-label text-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-primary"
          >
            New Item
          </Link>
        )}
      </div>

      <div className="mt-6">
        <form method="GET" className="flex gap-2">
          <label htmlFor="search" className="sr-only">
            Search items
          </label>
          <input
            id="search"
            name="search"
            type="search"
            defaultValue={search ?? ""}
            placeholder="Search by code, name, or barcode…"
            className="flex-1 rounded border border-outline-variant/30 bg-white px-3 py-2 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded bg-primary px-4 font-label text-label text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-action-blue"
          >
            Search
          </button>
          {search && (
            <Link
              href="/master-data/items"
              className="flex h-11 items-center justify-center rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-dim focus:outline-none focus:ring-2 focus:ring-primary"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      <div className="mt-4 overflow-hidden rounded-md bg-white shadow-elevation-1">
        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="font-body text-body-md text-on-surface-variant">
              {search
                ? `No items found for "${search}".`
                : "No items enrolled yet."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-dim">
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                    Code
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                    Barcode
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                    UOM
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-on-surface-variant">
                    Status
                  </th>
                  <th className="sr-only px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {rows.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-dim/50">
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {item.code}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface">
                      {item.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface-variant">
                      {item.barcode}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface-variant uppercase">
                      {item.uom}
                    </td>
                    <td className="px-4 py-3">
                      {item.isActive ? (
                        <span className="inline-flex items-center rounded-full bg-status-success/10 px-2 py-0.5 font-label text-label text-status-success">
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
                        className="inline-flex h-11 items-center font-label text-label text-primary underline hover:text-secondary focus:outline-none focus:ring-2 focus:ring-primary"
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
          aria-label="Items pagination"
          className="mt-4 flex items-center justify-between"
        >
          <p className="font-body text-body-md text-on-surface-variant">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex gap-2">
            {currentPage > 1 && (
              <Link
                href={`/master-data/items?${new URLSearchParams({ ...Object.fromEntries(searchParams_), page: String(currentPage - 1) }).toString()}`}
                className="flex h-11 items-center rounded border border-outline-variant/30 px-3 font-label text-label text-on-surface hover:bg-surface-dim focus:outline-none focus:ring-2 focus:ring-primary"
              >
                Previous
              </Link>
            )}
            {currentPage < totalPages && (
              <Link
                href={`/master-data/items?${new URLSearchParams({ ...Object.fromEntries(searchParams_), page: String(currentPage + 1) }).toString()}`}
                className="flex h-11 items-center rounded border border-outline-variant/30 px-3 font-label text-label text-on-surface hover:bg-surface-dim focus:outline-none focus:ring-2 focus:ring-primary"
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
