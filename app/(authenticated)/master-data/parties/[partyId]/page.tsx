// Party detail page — shows master data, roles, contact action, and
// Transaction Ledger.
//
// Traceability:
//   specs/06-party-and-item-enrollment/design.md §5, §5a, §5b

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { getPartyWithRoles } from "@/lib/db/queries/parties";
import { getPartyTransactionLedger } from "@/lib/db/queries/ledgers";
import {
  PartyDetailActions,
  DeactivatePartySection,
} from "../_components/party-detail-actions";

const LEDGER_PAGE_SIZE = 20;

interface PageProps {
  params: Promise<{ partyId: string }>;
  searchParams: Promise<{ ledgerPage?: string }>;
}

export default async function PartyDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { partyId } = await params;
  const { ledgerPage } = await searchParams;

  const resolver = await createPageResolver();

  // Require parties.read for the page and inventory.read for the Transaction Ledger
  // (inventory_transactions RLS policy gates on inventory.read, not parties.read)
  const [readPerm, inventoryPerm] = await Promise.all([
    requirePermission(resolver, "parties.read"),
    requirePermission(resolver, "inventory.read"),
  ]);
  if (readPerm.kind !== "authorized" || inventoryPerm.kind !== "authorized") {
    notFound();
  }

  const [party, canManage] = await Promise.all([
    getPartyWithRoles(db, partyId),
    requirePermission(resolver, "parties.manage").then(
      (r) => r.kind === "authorized",
    ),
  ]);

  if (!party) notFound();

  // Transaction Ledger pagination
  const currentLedgerPage = Math.max(
    1,
    parseInt(ledgerPage ?? "1", 10),
  );
  const ledgerOffset = (currentLedgerPage - 1) * LEDGER_PAGE_SIZE;

  const ledger = await getPartyTransactionLedger(db, partyId, {
    limit: LEDGER_PAGE_SIZE,
    offset: ledgerOffset,
  });

  const totalLedgerPages = Math.max(
    1,
    Math.ceil(ledger.total / LEDGER_PAGE_SIZE),
  );

  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <nav className="mb-2" aria-label="Breadcrumb">
            <ol className="flex items-center gap-1 font-body text-body-sm text-text-grey">
              <li>
                <Link
                  href="/enrollment?tab=parties"
                  className="inline-flex h-11 items-center rounded hover:text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  Parties
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="text-on-surface">
                {party.name}
              </li>
            </ol>
          </nav>
          <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
            {party.name}
          </h1>
          <p className="mt-1 font-mono text-mono-md text-text-grey">
            {party.code}
          </p>
        </div>
        {canManage && (
          <div className="flex gap-3">
            <Link
              href={`/master-data/parties/${partyId}/edit`}
              className="flex h-11 items-center justify-center rounded bg-brand-navy px-4 font-label text-label text-surface-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-red"
            >
              Edit
            </Link>
          </div>
        )}
      </div>

      {/* Status badge */}
      <div className="mt-4">
        {party.isActive ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-status-available/10 px-3 py-1 font-label text-label text-status-available">
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-status-neutral/10 px-3 py-1 font-label text-label text-status-neutral">
            Inactive
          </span>
        )}
      </div>

      {/* Master data */}
      <div className="mt-6 rounded-md bg-surface-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
          Party Information
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="font-label text-label text-text-grey">
              Contact Person
            </dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {party.contactPerson ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Email</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {party.email ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Phone</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {party.phone ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">Tax ID / TIN</dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {party.taxId ?? "—"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-label text-label text-text-grey">Address</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface whitespace-pre-line">
              {party.address ?? "—"}
            </dd>
          </div>
          {party.notes && (
            <div className="sm:col-span-2">
              <dt className="font-label text-label text-text-grey">Notes</dt>
              <dd className="mt-1 font-body text-body-md text-on-surface">
                {party.notes}
              </dd>
            </div>
          )}
          <div>
            <dt className="font-label text-label text-text-grey">Created</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {party.createdAt.toLocaleDateString()}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">
              Last Updated
            </dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {party.updatedAt.toLocaleDateString()}
            </dd>
          </div>
        </dl>
      </div>

      {/* Business roles + Contact Party action (interactive, client component) */}
      <div className="mt-6 rounded-md bg-surface-white shadow-elevation-1 p-6">
        <PartyDetailActions
          partyId={partyId}
          roles={party.roles}
          canManage={canManage}
          hasEmail={!!party.email}
        />
      </div>

      {/* Deactivation zone — only for active parties that the user can manage */}
      {canManage && party.isActive && (
        <div className="mt-6 rounded-md bg-surface-white shadow-elevation-1 p-6">
          <h2 className="font-heading font-semibold text-data-display text-on-surface">
            Danger Zone
          </h2>
          <p className="mt-1 font-body text-body-sm text-text-grey">
            Deactivating a party prevents it from being selected in new
            transactions. Existing linked records are not deleted.
          </p>
          <div className="mt-4">
            <DeactivatePartySection partyId={partyId} />
          </div>
        </div>
      )}

      {/* Transaction Ledger — design.md §5b */}
      <div className="mt-6 rounded-md bg-surface-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
          Transaction Ledger
        </h2>
        <p className="mt-1 font-body text-body-sm text-text-grey">
          All inventory transactions where this party is the vendor, customer, or
          VMI owner.
        </p>

        <div className="mt-4 overflow-x-auto">
          {ledger.rows.length === 0 ? (
            <p className="py-8 text-center font-body text-body-md text-text-grey">
              No transactions recorded yet.
            </p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                  <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                    Role
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
                    <td className="px-4 py-3 font-label text-label text-on-surface capitalize">
                      {row.partyRole.replace(/_/g, " ")}
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

        {/* Ledger pagination */}
        {totalLedgerPages > 1 && (
          <nav
            aria-label="Transaction ledger pagination"
            className="mt-4 flex items-center justify-between"
          >
            <p className="font-body text-body-md text-text-grey">
              Page {currentLedgerPage} of {totalLedgerPages}
            </p>
            <div className="flex gap-2">
              {currentLedgerPage > 1 && (
                <Link
                  href={`/master-data/parties/${partyId}?ledgerPage=${currentLedgerPage - 1}`}
                  className="flex h-11 items-center rounded border border-outline-variant/30 px-3 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  Previous
                </Link>
              )}
              {currentLedgerPage < totalLedgerPages && (
                <Link
                  href={`/master-data/parties/${partyId}?ledgerPage=${currentLedgerPage + 1}`}
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
