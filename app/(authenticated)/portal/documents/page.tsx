// `/portal/documents` — Party Portal: My Documents (read-only).
//
// Traceability:
//   specs/22-parties-portal/design.md §7 (documents view: pick lists +
//     acknowledgement receipts), §4 (authorization: documents.read, assigned_party
//     scope), §8 (no offline, every load is a fresh authoritative read).
//   specs/22-parties-portal/requirements.md R4 (pick list + AR list and
//     open flow), R4.7 (VMI billing statements: PDF artifact only — no
//     structured line-item breakdown — that sub-task is blocked on Task 1's
//     vmi_statements.read gate and is NOT rendered here).
//   specs/22-parties-portal/tasks.md Task 5 (documents view — pick list /
//     AR sub-tasks; VMI statements sub-task remains blocked).
//   specs/00-steering/brand-design-system.md §6 (office Level 1 elevation),
//     §2 (typography), §9 (office table pattern), CLAUDE.md ("VMI prices shown
//     on any document are a per-release reference only").
//
// Surface: Party (office-style glassmorphism per design.md §3.3).
// Capability gate: documents.read, scoped to the caller's own party. This
//   view spans both VMI and Trading flows (both use pick_list/
//   acknowledgement_receipt documents), so no single flowType is required —
//   the party scope itself is enough once matched against the caller's own
//   partyId.
// Offline: no offline caching (Task 8, requirements.md R8).
// VMI disclaimer: acknowledgement receipt artifact rendered unmodified with
//   disclaimer text present — requirements.md R4.3.
//
// generated_documents scoping is resolved via lib/db/queries/documents.ts's
// source-chain join (the table itself carries no party_id column — see that
// file's header comment). Party scope is resolved from lib/rbac/session.ts's
// AuthorizationContext.partyScopes via lib/portal/resolve-party-scope.ts —
// never from a client-supplied party_id.
//
// Download button: no signed-URL request infrastructure exists yet in this
// codebase for generated_documents artifacts. Wiring "Download PDF" to a
// real ≤60-minute signed URL remains a follow-up (tasks.md Task 5), same
// category of deliberate, named, out-of-scope limitation as the VMI
// billing-statement gate below — not something silently faked here.

import Link from "next/link";
import { FileText, Download, CheckCircle2, Package } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { resolveActivePartyScope } from "@/lib/portal/resolve-party-scope";
import { db } from "@/lib/db/client";
import {
  listPartyPickListDocuments,
  listPartyAcknowledgementReceiptDocuments,
  type PartyDocumentRow,
} from "@/lib/db/queries/documents";

// ─── Types ────────────────────────────────────────────────────────────────────
// Status values mirror generated_documents.status exactly (lib/db/schema/documents.ts):
// 'pending' | 'generating' | 'ready' | 'failed' | 'voided'.

type DocStatus = "pending" | "generating" | "ready" | "failed" | "voided";

interface DocRow {
  id: string;
  docNumber: string;
  date: string;
  status: DocStatus;
}

// ─── Status helpers — tokens from tailwind.config.ts, no raw hex ──────────────

const DOC_STATUS_CLASSES: Record<DocStatus, string> = {
  pending: "bg-status-pending/10 text-status-pending",
  generating: "bg-status-pending/10 text-status-pending",
  ready: "bg-status-available/10 text-status-available",
  failed: "bg-status-held/10 text-status-held",
  voided: "bg-status-neutral/10 text-status-neutral",
};

const DOC_STATUS_LABELS: Record<DocStatus, string> = {
  pending: "PENDING",
  generating: "GENERATING",
  ready: "READY",
  failed: "FAILED",
  voided: "VOIDED",
};

function toDocRow(row: PartyDocumentRow): DocRow {
  return {
    id: row.id,
    docNumber: row.documentNumber,
    date: (row.generatedAt ?? row.createdAt).toISOString().slice(0, 10),
    status: (row.status as DocStatus) ?? "pending",
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ tab?: string; ref?: string }>;
}

export default async function PortalDocumentsPage({
  searchParams,
}: PageProps) {
  const { tab: tabParam } = await searchParams;

  const resolver = await createPageResolver();
  const resolution = await resolver.getContext();

  if (resolution.kind !== "authorized") {
    return <PermissionDenied />;
  }

  const partyScope = resolveActivePartyScope(resolution.context);
  if (!partyScope) {
    return <NoPartyScope />;
  }

  // Documents span both VMI and Trading flows for the same party; a null
  // scope flowType matches either (session.ts partyScopeMatchesFlow), and a
  // narrowed scope's own flowType is passed straight through so a
  // VMI-only or Trading-only assignment is still validated correctly.
  const permResult = await requirePermission(resolver, "documents.read", {
    partyId: partyScope.partyId,
    flowType: partyScope.flowType ?? "vmi",
  });

  if (permResult.kind !== "authorized") {
    return <PermissionDenied />;
  }

  const activeTab = tabParam === "acknowledgement-receipts" ? "ar" : "pick-lists";

  const [pickListDocs, arDocs] = await Promise.all([
    listPartyPickListDocuments(db, partyScope.partyId),
    listPartyAcknowledgementReceiptDocuments(db, partyScope.partyId),
  ]);

  return (
    <div className="mx-auto max-w-container">
      {/* Page header */}
      <div>
        <h1 className="font-heading font-extrabold text-headline-xl text-on-surface">
          My Documents
        </h1>
        <p className="mt-1 font-body text-body-md text-text-grey">
          Your pick lists and acknowledgement receipts.
        </p>
      </div>

      {/* ── Tab navigation ─────────────────────────────────────────────────── */}
      <div role="tablist" aria-label="Documents sections" className="mt-6 flex gap-1 border-b border-outline-variant/30">
        <Link
          href="/portal/documents?tab=pick-lists"
          role="tab"
          aria-selected={activeTab === "pick-lists"}
          className={`flex h-11 items-center px-4 font-label text-label motion-safe:transition-colors motion-safe:duration-150 focus:outline-none focus:ring-2 focus:ring-brand-navy ${
            activeTab === "pick-lists"
              ? "border-b-2 border-on-surface text-on-surface"
              : "text-text-grey hover:text-on-surface"
          }`}
        >
          Pick Lists
        </Link>
        <Link
          href="/portal/documents?tab=acknowledgement-receipts"
          role="tab"
          aria-selected={activeTab === "ar"}
          className={`flex h-11 items-center px-4 font-label text-label motion-safe:transition-colors motion-safe:duration-150 focus:outline-none focus:ring-2 focus:ring-brand-navy ${
            activeTab === "ar"
              ? "border-b-2 border-on-surface text-on-surface"
              : "text-text-grey hover:text-on-surface"
          }`}
        >
          Acknowledgement Receipts
        </Link>
      </div>

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      <div className="mt-4">
        {activeTab === "pick-lists" ? (
          <PickListsTab docs={pickListDocs.map(toDocRow)} />
        ) : (
          <AcknowledgementReceiptsTab docs={arDocs.map(toDocRow)} />
        )}
      </div>
    </div>
  );
}

// ─── Denial states ──────────────────────────────────────────────────────────

function PermissionDenied() {
  return (
    <div className="mx-auto max-w-container px-8 py-12 text-center">
      <FileText
        size={40}
        className="mx-auto mb-3 text-text-grey"
        aria-hidden="true"
      />
      <p className="font-body text-body-md text-text-grey">
        You do not have permission to view documents.
      </p>
      <p className="mt-2 font-body text-body-sm text-text-grey">
        This page requires the{" "}
        <span className="font-mono text-mono-md">documents.read</span>{" "}
        capability.
      </p>
    </div>
  );
}

// Fail-safe empty state: no active party scope resolved for this session —
// never falls through to an unscoped query (see resolve-party-scope.ts).
function NoPartyScope() {
  return (
    <div className="mx-auto max-w-container px-8 py-12 text-center">
      <FileText
        size={40}
        className="mx-auto mb-3 text-text-grey"
        aria-hidden="true"
      />
      <p className="font-body text-body-md text-text-grey">
        No party assignment is linked to your account.
      </p>
      <p className="mt-2 font-body text-body-sm text-text-grey">
        Contact your administrator to request portal access.
      </p>
    </div>
  );
}

// ─── Pick Lists tab ───────────────────────────────────────────────────────────

function PickListsTab({ docs }: { docs: DocRow[] }) {
  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white px-6 py-12 text-center shadow-elevation-1">
        <Package size={40} className="text-text-grey" aria-hidden="true" />
        <p className="font-body text-body-md text-text-grey">
          No pick lists yet.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Doc #
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Date
              </th>
              <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                Status
              </th>
              <th className="sr-only px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30">
            {docs.map((doc) => (
              <tr key={doc.id} className="hover:bg-surface-light-grey/50">
                <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                  {doc.docNumber}
                </td>
                <td className="px-4 py-3 font-body text-body-md text-text-grey">
                  {doc.date}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${DOC_STATUS_CLASSES[doc.status]}`}
                  >
                    {DOC_STATUS_LABELS[doc.status]}
                  </span>
                </td>
                {/* Download PDF — h-11 (44px) office touch target.
                    TODO: wire to signed URL request (≤60-min TTL) per Task 5 —
                    no signed-URL infra exists in this codebase yet. */}
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    disabled={doc.status !== "ready"}
                    className="inline-flex h-11 items-center gap-2 rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:transition-transform motion-safe:duration-100 motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download size={16} aria-hidden="true" />
                    Download PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Acknowledgement Receipts tab ─────────────────────────────────────────────
// requirements.md R4.3: VMI acknowledgement-receipt artifact rendered
// unmodified, with disclaimer text present and unedited.
// CLAUDE.md: "VMI prices shown on any document are a per-release reference
// only — if you're building a VMI-flow document view, it needs the
// 'reference amount, not your final bill' distinction visible."

function AcknowledgementReceiptsTab({ docs }: { docs: DocRow[] }) {
  if (docs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-outline-variant/30 bg-surface-white px-6 py-12 text-center shadow-elevation-1">
        <CheckCircle2
          size={40}
          className="text-text-grey"
          aria-hidden="true"
        />
        <p className="font-body text-body-md text-text-grey">
          No acknowledgement receipts yet.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* VMI reference disclaimer — visible before the table.
          requirements.md R4.3 + CLAUDE.md: must not imply the price is
          the authoritative VMI bill. */}
      <div className="mb-4 rounded-lg border border-status-pending/30 bg-status-pending/10 px-4 py-3">
        <p className="font-body text-body-sm text-on-surface">
          <strong>VMI reference note:</strong> prices shown on VMI
          acknowledgement receipts are a per-release reference amount only
          and are not your final bill. Your actual VMI invoice is based on the
          period-average consumption rate — contact your account manager for
          billing statements.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-white shadow-elevation-1">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-light-grey">
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Doc #
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Date
                </th>
                <th className="px-4 py-3 text-left font-label text-label uppercase tracking-[0.05em] text-text-grey">
                  Status
                </th>
                <th className="sr-only px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-surface-light-grey/50">
                  <td className="px-4 py-3 font-mono text-mono-md text-on-surface">
                    {doc.docNumber}
                  </td>
                  <td className="px-4 py-3 font-body text-body-md text-text-grey">
                    {doc.date}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${DOC_STATUS_CLASSES[doc.status]}`}
                    >
                      {DOC_STATUS_LABELS[doc.status]}
                    </span>
                  </td>
                  {/* Download PDF — h-11 (44px) office touch target.
                      TODO: wire to signed URL request (≤60-min TTL) per Task 5.
                      requirements.md R4.3: document artifact rendered unmodified
                      with VMI disclaimer text present. */}
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={doc.status !== "ready"}
                      className="inline-flex h-11 items-center gap-2 rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:transition-transform motion-safe:duration-100 motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Download size={16} aria-hidden="true" />
                      Download PDF
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
