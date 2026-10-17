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
import { UrlTablePagination } from "@/components/ui/UrlTablePagination";
import { PageBreadcrumb } from "@/components/global/PageBreadcrumb";

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
  const [readPerm, inventoryPerm, financialPerm] = await Promise.all([
    requirePermission(resolver, "parties.read"),
    requirePermission(resolver, "inventory.read"),
    requirePermission(resolver, "reporting.financial_read"),
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

  const canViewFinancials = financialPerm.kind === "authorized";

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
    <div className="mx-auto max-w-container space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-5 rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div>
          <PageBreadcrumb
            backHref="/enrollment?tab=parties"
            backLabel="Organizations"
            currentLabel={party.name}
          />
          <h1 className="font-heading text-2xl font-extrabold text-on-surface sm:text-3xl">
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
            className="inline-flex h-10 items-center justify-center rounded-xl bg-brand-navy px-5 font-body text-sm font-semibold text-surface-white hover:bg-brand-navy/90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-brand-red"
            >
              Edit
            </Link>
          </div>
        )}
      </div>

      {/* Status & RBE Classification badges */}
      <div className="flex flex-wrap items-center gap-2">
        {party.isActive ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-status-available/10 px-3 py-1 font-label text-label text-status-available">
            Active
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-status-neutral/10 px-3 py-1 font-label text-label text-status-neutral">
            Inactive
          </span>
        )}

        {(() => {
          const rbeMatch = party.notes?.match(/^\[RBE:\s*([^\]]+)\]/i);
          if (!rbeMatch) return null;
          const tags = rbeMatch[1].split(",").map((s) => s.trim().toUpperCase());
          return tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800"
            >
              PEZA RBE: {tag}
            </span>
          ));
        })()}
      </div>

      {/* Master data */}
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 sm:p-6">
        <h2 className="font-heading text-xl font-bold text-on-surface">
          Organization Information
        </h2>
        <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="sm:col-span-2 lg:col-span-3">
            <dt className="font-label text-label text-text-grey">Address</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface whitespace-pre-line">
              {[party.address1, party.address2].filter(Boolean).join("\n") || "—"}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-text-grey">
              Payment Terms
            </dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {party.paymentTerms ?? "—"}
            </dd>
          </div>
          {(() => {
            const clean = party.notes ? party.notes.replace(/^\[RBE:\s*[^\]]+\]\s*\n?/i, "").trim() : "";
            if (!clean) return null;
            return (
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="font-label text-label text-text-grey">Notes</dt>
                <dd className="mt-1 font-body text-body-md text-on-surface">
                  {clean}
                </dd>
              </div>
            );
          })()}
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
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 sm:p-6">
        <PartyDetailActions
          partyId={partyId}
          partyName={party.name}
          partyEmail={party.email ?? undefined}
          contactPerson={party.contactPerson ?? undefined}
          roles={party.roles}
          canManage={canManage}
          hasEmail={!!party.email}
        />
      </div>

      {/* Billing & Financial Overview Card — Contextual shortcut to Central Billing Hub (Design System Level 1 Elevation) */}
      {canViewFinancials && (() => {
        const isEndCustomerOnly =
          party.roles.length > 0 &&
          party.roles.every((r) => r.role === "end_customer");

        if (isEndCustomerOnly) {
          return (
            <div className="rounded-2xl border border-outline-variant/30 bg-surface-light-grey/40 p-5 shadow-elevation-1 sm:p-6">
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-xl font-bold text-text-grey">
                  Billing &amp; Statements of Account
                </h2>
                <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 font-mono text-body-xs font-semibold text-slate-700">
                  No Billing Applies
                </span>
              </div>
              <p className="mt-2 font-body text-body-sm text-text-grey">
                End-customers do not receive billings (no billing applies to them). No commercial contracts, storage fees, or Statements of Account (SOA) are generated for this organization.
              </p>
            </div>
          );
        }

        return (
          <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-heading text-xl font-bold text-on-surface">
                    Billing &amp; Statements of Account
                  </h2>
                  <span className="inline-flex items-center rounded-full bg-brand-navy/10 px-2.5 py-0.5 font-mono text-body-xs font-semibold text-brand-navy">
                    Permanent Tiered Retention
                  </span>
                </div>
                <p className="mt-1 font-body text-body-sm text-text-grey">
                  Access daily storage CBM balance ledgers, commercial rate cards, and monthly Statements of Account (SOA) for {party.name}.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/billing-pricing?partyId=${partyId}`}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-outline-variant/30 bg-surface-white px-4 font-label text-label font-bold text-on-surface hover:bg-surface-light-grey transition-colors focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  View Billing Ledger
                </Link>
                <Link
                  href={`/billing-pricing/soa?partyId=${partyId}`}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-brand-navy px-4 font-label text-label font-bold text-surface-white hover:bg-brand-navy/90 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-navy"
                >
                  View Statements of Account &rarr;
                </Link>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Deactivation zone — only for active parties that the user can manage */}
      {canManage && party.isActive && (
        <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 sm:p-6">
          <h2 className="font-heading text-xl font-bold text-on-surface">
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
      <div className="rounded-2xl border border-outline-variant/30 bg-surface-white p-5 shadow-elevation-1 sm:p-6">
        <h2 className="font-heading text-xl font-bold text-on-surface">
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
          <UrlTablePagination
            currentPage={currentLedgerPage}
            totalPages={totalLedgerPages}
            totalItems={ledger.total}
            pageSize={LEDGER_PAGE_SIZE}
            pageParamName="ledgerPage"
            className="mt-4 border-t border-outline-variant/30 pt-4"
          />
        )}
      </div>
    </div>
  );
}
