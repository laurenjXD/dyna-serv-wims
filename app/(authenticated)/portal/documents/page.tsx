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
// Capability gate: documents.read.
//   NOTE: party users hold documents.read with assigned_party scope; full scope
//   resolution (Task 2) pending — requirePermission called without scope.
// Offline: no offline caching (Task 8, requirements.md R8).
// VMI disclaimer: acknowledgement receipt artifact rendered unmodified with
//   disclaimer text present — requirements.md R4.3.
//
// TODO: wire to generated_documents scoped to session party via
//   documents.read (assigned_party) RLS pattern (Task 5).
// TODO: download button to request a fresh ≤60-minute signed URL per Task 5.

import Link from "next/link";
import { FileText, Download, CheckCircle2, Package } from "lucide-react";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";

// ─── Types ────────────────────────────────────────────────────────────────────

type PickListDocStatus = "committed" | "dispatched";
type ARDocStatus = "pending_signature" | "signed" | "disputed";

interface PickListDoc {
  id: string;
  docNumber: string;
  date: string;
  status: PickListDocStatus;
}

interface ARDoc {
  id: string;
  docNumber: string;
  date: string;
  status: ARDocStatus;
}

// ─── Status helpers — tokens from tailwind.config.ts, no raw hex ──────────────

const PL_STATUS_CLASSES: Record<PickListDocStatus, string> = {
  committed: "bg-status-pending/10 text-status-pending",
  dispatched: "bg-status-available/10 text-status-available",
};

const PL_STATUS_LABELS: Record<PickListDocStatus, string> = {
  committed: "COMMITTED",
  dispatched: "DISPATCHED",
};

const AR_STATUS_CLASSES: Record<ARDocStatus, string> = {
  pending_signature: "bg-status-pending/10 text-status-pending",
  signed: "bg-status-available/10 text-status-available",
  disputed: "bg-status-held/10 text-status-held",
};

const AR_STATUS_LABELS: Record<ARDocStatus, string> = {
  pending_signature: "PENDING SIGNATURE",
  signed: "SIGNED",
  disputed: "DISPUTED",
};

// ─── Mock data ────────────────────────────────────────────────────────────────
// TODO: replace with real generated_documents query scoped to session party.

const MOCK_PICK_LIST_DOCS: PickListDoc[] = [
  {
    id: "pld-001",
    docNumber: "PL-2026-011",
    date: "2026-08-07",
    status: "dispatched",
  },
  {
    id: "pld-002",
    docNumber: "PL-2026-019",
    date: "2026-08-08",
    status: "committed",
  },
];

const MOCK_AR_DOCS: ARDoc[] = [
  {
    id: "ard-001",
    docNumber: "AR-2026-008",
    date: "2026-08-07",
    status: "signed",
  },
  {
    id: "ard-002",
    docNumber: "AR-2026-011",
    date: "2026-08-08",
    status: "pending_signature",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ tab?: string; ref?: string }>;
}

export default async function PortalDocumentsPage({
  searchParams,
}: PageProps) {
  const { tab: tabParam } = await searchParams;

  const resolver = await createPageResolver();
  // TODO: once Task 2 party-scope resolution is built, pass scope:
  //   { partyId: sessionPartyId, flowType: sessionFlowType }
  const permResult = await requirePermission(resolver, "documents.read");

  if (permResult.kind !== "authorized") {
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

  const activeTab = tabParam === "acknowledgement-receipts" ? "ar" : "pick-lists";

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
      <div className="mt-6 flex gap-1 border-b border-outline-variant/30">
        <Link
          href="/portal/documents?tab=pick-lists"
          className={`flex h-11 items-center px-4 font-label text-label motion-safe:transition-colors motion-safe:duration-150 focus:outline-none focus:ring-2 focus:ring-brand-navy ${
            activeTab === "pick-lists"
              ? "border-b-2 border-brand-navy text-brand-navy"
              : "text-text-grey hover:text-on-surface"
          }`}
          aria-current={activeTab === "pick-lists" ? "page" : undefined}
        >
          Pick Lists
        </Link>
        <Link
          href="/portal/documents?tab=acknowledgement-receipts"
          className={`flex h-11 items-center px-4 font-label text-label motion-safe:transition-colors motion-safe:duration-150 focus:outline-none focus:ring-2 focus:ring-brand-navy ${
            activeTab === "ar"
              ? "border-b-2 border-brand-navy text-brand-navy"
              : "text-text-grey hover:text-on-surface"
          }`}
          aria-current={activeTab === "ar" ? "page" : undefined}
        >
          Acknowledgement Receipts
        </Link>
      </div>

      {/* ── Tab content ────────────────────────────────────────────────────── */}
      <div className="mt-4">
        {activeTab === "pick-lists" ? (
          <PickListsTab docs={MOCK_PICK_LIST_DOCS} />
        ) : (
          <AcknowledgementReceiptsTab docs={MOCK_AR_DOCS} />
        )}
      </div>
    </div>
  );
}

// ─── Pick Lists tab ───────────────────────────────────────────────────────────

function PickListsTab({ docs }: { docs: PickListDoc[] }) {
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
                    className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${PL_STATUS_CLASSES[doc.status]}`}
                  >
                    {PL_STATUS_LABELS[doc.status]}
                  </span>
                </td>
                {/* Download PDF — h-11 (44px) office touch target.
                    TODO: wire to signed URL request (≤60-min TTL) per Task 5. */}
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className="inline-flex h-11 items-center gap-2 rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:transition-transform motion-safe:duration-100 motion-safe:active:scale-[0.97]"
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

function AcknowledgementReceiptsTab({ docs }: { docs: ARDoc[] }) {
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
                      className={`inline-flex items-center rounded-full px-2 py-0.5 font-label text-label uppercase tracking-[0.05em] ${AR_STATUS_CLASSES[doc.status]}`}
                    >
                      {AR_STATUS_LABELS[doc.status]}
                    </span>
                  </td>
                  {/* Download PDF — h-11 (44px) office touch target.
                      TODO: wire to signed URL request (≤60-min TTL) per Task 5.
                      requirements.md R4.3: document artifact rendered unmodified
                      with VMI disclaimer text present. */}
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="inline-flex h-11 items-center gap-2 rounded border border-outline-variant/30 px-4 font-label text-label text-on-surface hover:bg-surface-light-grey focus:outline-none focus:ring-2 focus:ring-brand-navy motion-safe:transition-transform motion-safe:duration-100 motion-safe:active:scale-[0.97]"
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
