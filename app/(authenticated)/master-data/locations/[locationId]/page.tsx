// Location detail page + Movement Ledger.
//
// Traceability: specs/06-party-and-item-enrollment/design.md §6a, §6a Movement Ledger

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { getLocation } from "@/lib/db/queries/locations";
import { getLocationTransactionLedger } from "@/lib/db/queries/ledgers";
import { DeactivateLocationSection } from "../_components/location-deactivate";

const LEDGER_PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ locationId: string }>;
  searchParams: Promise<{ ledgerPage?: string }>;
}

export default async function LocationDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { locationId } = await params;
  const { ledgerPage } = await searchParams;

  const resolver = await createPageResolver();

  // Require locations.read for the page and inventory.read for the Movement Ledger
  // (inventory_transactions RLS policy gates on inventory.read, not locations.read)
  const [readPerm, inventoryPerm] = await Promise.all([
    requirePermission(resolver, "locations.read"),
    requirePermission(resolver, "inventory.read"),
  ]);
  if (readPerm.kind !== "authorized" || inventoryPerm.kind !== "authorized") {
    notFound();
  }

  const [location, canManage] = await Promise.all([
    getLocation(db, locationId),
    requirePermission(resolver, "locations.manage").then(
      (r) => r.kind === "authorized",
    ),
  ]);

  if (!location) notFound();

  const currentLedgerPage = Math.max(1, parseInt(ledgerPage ?? "1", 10));
  const ledgerOffset = (currentLedgerPage - 1) * LEDGER_PAGE_SIZE;

  const ledger = await getLocationTransactionLedger(db, locationId, {
    limit: LEDGER_PAGE_SIZE,
    offset: ledgerOffset,
  });

  const totalLedgerPages = Math.max(
    1,
    Math.ceil(ledger.total / LEDGER_PAGE_SIZE),
  );

  return (
    <div className="mx-auto max-w-container">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <nav className="mb-2" aria-label="Breadcrumb">
            <ol className="flex items-center gap-1 font-body text-body-sm text-text-grey">
              <li>
                <Link
                  href="/enrollment?tab=locations"
                  className="inline-flex h-11 items-center rounded hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  Locations
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-on-surface">
                {location.label}
              </li>
            </ol>
          </nav>
          <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
            {location.label}
          </h1>
          <p className="mt-1 font-body text-body-md text-text-grey capitalize">
            {location.locationType.replace(/_/g, " ")} — Zone {location.zone}
          </p>
        </div>
        {canManage && (
          <Link
            href={`/master-data/locations/${locationId}/edit`}
            className="flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-red"
          >
            Edit
          </Link>
        )}
      </div>

      <div className="mt-4">
        {location.isActive ? (
          <span className="inline-flex items-center rounded-full bg-status-available/10 px-3 py-1 font-label text-label text-status-available">
            Active
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-status-neutral/10 px-3 py-1 font-label text-label text-status-neutral">
            Inactive
          </span>
        )}
      </div>

      {/* Location details */}
      <div className="mt-6 rounded-md bg-surface-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
          Location Information
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="font-label text-label text-text-grey">Zone</dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {location.zone}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Rack</dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {location.rack}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Level</dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {location.level}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Position</dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {location.position}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">
              Location Type
            </dt>
            <dd className="mt-1 font-body text-body-md text-on-surface capitalize">
              {location.locationType.replace(/_/g, " ")}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">
              Max CBM Capacity
            </dt>
            <dd className="mt-1 font-mono text-mono-md font-bold text-on-surface">
              {location.maxCbmCapacity} m³
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Enrolled</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {location.createdAt.toLocaleDateString()}
            </dd>
          </div>
        </dl>
      </div>

      {/* Deactivation zone */}
      {canManage && location.isActive && (
        <div className="mt-6 rounded-md bg-surface-white shadow-elevation-1 p-6">
          <h2 className="font-heading font-semibold text-data-display text-on-surface">
            Danger Zone
          </h2>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            Deactivating a location prevents it from being used in new put-away
            or pick operations. Existing stock assignments are not affected.
          </p>
          <div className="mt-4">
            <DeactivateLocationSection locationId={locationId} />
          </div>
        </div>
      )}

      {/* Movement Ledger — design.md §6a Movement Ledger */}
      <div className="mt-6 rounded-md bg-surface-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
          Movement Ledger
        </h2>
        <p className="mt-1 font-body text-body-sm text-text-grey">
          All inventory movements in or out of this location.
        </p>

        <div className="mt-4 overflow-x-auto">
          {ledger.rows.length === 0 ? (
            <p className="py-8 text-center font-body text-body-md text-text-grey">
              No movements recorded yet.
            </p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Direction
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Reference
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Type
                  </th>
                  <th className="px-4 py-3 text-right font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Qty
                  </th>
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Timestamp
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {ledger.rows.map((row) => (
                  <tr key={row.id} className="hover:bg-surface-light-grey/50">
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label ${
                          row.direction === "in"
                            ? "bg-status-available/10 text-status-available"
                            : "bg-status-pending/10 text-status-pending"
                        }`}
                      >
                        {row.direction === "in" ? "▼ In" : "▲ Out"}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                      {row.reference ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-on-surface capitalize">
                      {row.movementType.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-mono-md text-on-surface">
                      {row.quantity}
                    </td>
                    <td className="px-4 py-3 font-body text-body-md text-text-grey">
                      {row.createdAt.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalLedgerPages > 1 && (
          <nav
            aria-label="Movement ledger pagination"
            className="mt-4 flex items-center justify-between"
          >
            <p className="font-body text-body-md text-text-grey">
              Page {currentLedgerPage} of {totalLedgerPages}
            </p>
            <div className="flex gap-2">
              {currentLedgerPage > 1 && (
                <Link
                  href={`/master-data/locations/${locationId}?ledgerPage=${currentLedgerPage - 1}`}
                  className="flex h-11 items-center rounded border border-outline-variant/30 px-3 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  Previous
                </Link>
              )}
              {currentLedgerPage < totalLedgerPages && (
                <Link
                  href={`/master-data/locations/${locationId}?ledgerPage=${currentLedgerPage + 1}`}
                  className="flex h-11 items-center rounded border border-outline-variant/30 px-3 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  Next
                </Link>
              )}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
