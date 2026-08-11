// Open / Resolve Inspection — transfer inspection case management.
//
// Traceability:
//   specs/11-transfer-and-inspection/design.md §6 (inspection design), §6.1 (contexts),
//     §6.3 (disposition table with balance effects)
//   specs/11-transfer-and-inspection/requirements.md R3.1, R3.4
//   specs/00-steering/brand-design-system.md §6 (office surface, Level 1 elevation),
//     §3 (touch targets h-11), §9 (primary CTA bg-action-blue)
//
// Surface: Office. Permission gate: inspection.perform.
//
// Two inline server actions:
//   handleOpenCase  — calls openInspectionCase with sourceRefType='transfer_line',
//                     contextType='transfer', flowType from the transfer.
//   handleResolve   — calls resolveInspectionCase with disposition fields.
//
// Feedback via searchParams (redirect-with-result pattern):
//   result=opened&caseId=...   — inspection case opened successfully
//   result=resolved            — inspection case resolved successfully
//   result=error&reason=...    — action failed

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createPageResolver } from "@/lib/auth/page-resolver";
import { requirePermission } from "@/lib/rbac/guard";
import { db } from "@/lib/db/client";
import { getTransferRequest } from "@/lib/db/queries/transfers";
import {
  openInspectionCase,
  resolveInspectionCase,
} from "@/lib/actions/transfers";
import type { TransferLineRow } from "@/lib/db/queries/transfers";

// ─── Constants ────────────────────────────────────────────────────────────────

// Transfer context dispositions per design.md §6.1 and §6.3.
// Inbound-only dispositions (return_to_party) are excluded; transfer context
// may use: store, quarantine, hold, write_off, return_to_stock, reject,
// return_to_origin. Design.md §6.1 states transfer dispositions are:
// return_to_stock, reject, return_to_origin, hold. Full set from §6.3 table:
const TRANSFER_DISPOSITIONS = [
  { value: "store", label: "Store" },
  { value: "quarantine", label: "Quarantine" },
  { value: "return_to_stock", label: "Return to Stock" },
  { value: "return_to_origin", label: "Return to Origin" },
  { value: "hold", label: "Hold" },
  { value: "write_off", label: "Write Off" },
  { value: "reject", label: "Reject" },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ transferId: string }>;
  searchParams: Promise<{
    result?: string;
    caseId?: string;
    reason?: string;
  }>;
}

export default async function InspectTransferPage({
  params,
  searchParams,
}: PageProps) {
  const { transferId } = await params;
  const {
    result,
    caseId: openedCaseId,
    reason: reasonParam,
  } = await searchParams;

  const resolver = await createPageResolver();

  // Gate: inspection.perform required.
  const permResult = await requirePermission(resolver, "inspection.perform");
  if (permResult.kind !== "authorized") {
    notFound();
  }

  const transfer = await getTransferRequest(db, transferId);
  if (!transfer) {
    notFound();
  }

  // Capture flowType as a local — server action closures cannot rely on
  // TypeScript's narrowing of the outer `transfer` variable from notFound().
  const transferFlowType = transfer.flowType;

  // ─── Inline server action: open inspection case ─────────────────────────────
  async function handleOpenCase(formData: FormData): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();

    // Resolve the source ref — the selected transfer line ID.
    const sourceRefId =
      (formData.get("sourceRefId") as string | null) ?? "";
    const lotId = (formData.get("lotId") as string | null) ?? "";
    const itemId = (formData.get("itemId") as string | null) ?? "";
    const partyId = (formData.get("partyId") as string | null) ?? "";

    const caseResult = await openInspectionCase(actionResolver, {
      sourceRefType: "transfer_line",
      sourceRefId,
      lotId,
      itemId,
      partyId,
      flowType: transferFlowType,
      contextType: "transfer",
    });

    if (caseResult.ok) {
      redirect(
        `/transfers/${transferId}/inspect?result=opened&caseId=${encodeURIComponent(caseResult.caseId)}`
      );
    }
    redirect(
      `/transfers/${transferId}/inspect?result=error&reason=${encodeURIComponent(caseResult.reason)}`
    );
  }

  // ─── Inline server action: resolve inspection case ──────────────────────────
  async function handleResolve(formData: FormData): Promise<void> {
    "use server";
    const actionResolver = await createPageResolver();

    const caseIdToResolve =
      (formData.get("caseId") as string | null) ?? "";
    const dispositionType =
      (formData.get("dispositionType") as string | null) ?? "";
    const rawQty = formData.get("quantityAffected") as string | null;
    const quantityAffected = rawQty ? parseFloat(rawQty) : NaN;
    const notes =
      (formData.get("notes") as string | null) || undefined;

    const resolveResult = await resolveInspectionCase(
      actionResolver,
      caseIdToResolve,
      { dispositionType, quantityAffected, notes }
    );

    if (resolveResult.ok) {
      redirect(`/transfers/${transferId}/inspect?result=resolved`);
    }
    const encodedErrors = encodeURIComponent(
      resolveResult.errors.join("|")
    );
    redirect(
      `/transfers/${transferId}/inspect?result=error&reason=${encodedErrors}`
    );
  }

  // Parse feedback state.
  const caseOpened = result === "opened";
  const caseResolved = result === "resolved";
  const actionFailed = result === "error";
  const errorMessages = reasonParam
    ? decodeURIComponent(reasonParam).split("|").filter(Boolean)
    : [];

  return (
    <div className="mx-auto max-w-container">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex items-center gap-1 font-body text-body-sm text-on-surface-variant">
          <li>
            <Link
              href="/transfers"
              className="inline-flex h-11 items-center rounded hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            >
              Transfer Queue
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link
              href={`/transfers/${transferId}`}
              className="inline-flex h-11 items-center rounded hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary font-mono text-mono-md"
            >
              {transferId}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-body text-body-sm text-on-surface">
            Inspect
          </li>
        </ol>
      </nav>

      <h1 className="font-heading font-extrabold text-headline-md text-on-surface">
        Transfer Inspection
      </h1>
      <p className="mt-1 font-body text-body-md text-on-surface-variant">
        Open or resolve an inspection case for a transfer line.
      </p>

      {/* Success banner — case opened */}
      {caseOpened && openedCaseId && (
        <div
          role="status"
          className="mt-4 rounded-md bg-status-success/10 px-4 py-3"
        >
          <p className="font-label text-label uppercase text-status-success">
            Inspection Case Opened
          </p>
          <p className="mt-1 font-body text-body-md text-on-surface">
            Case ID:{" "}
            <span className="font-mono text-mono-md">{openedCaseId}</span>
          </p>
        </div>
      )}

      {/* Success banner — case resolved */}
      {caseResolved && (
        <div
          role="status"
          className="mt-4 rounded-md bg-status-success/10 px-4 py-3"
        >
          <p className="font-label text-label uppercase text-status-success">
            Inspection Case Resolved
          </p>
          <p className="mt-1 font-body text-body-md text-on-surface">
            The disposition has been recorded and the case is now closed.
          </p>
        </div>
      )}

      {/* Error banner */}
      {actionFailed && errorMessages.length > 0 && (
        <div
          role="alert"
          className="mt-4 rounded-md bg-status-error/10 px-4 py-3"
        >
          <p className="font-label text-label uppercase text-status-error">
            Action Failed
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            {errorMessages.map((msg) => (
              <li key={msg} className="font-body text-body-md text-status-error">
                {msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Transfer context card — Level 1 office elevation */}
      <div className="mt-6 rounded-md bg-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
          Transfer Context
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="font-label text-label text-on-surface-variant">Transfer ID</dt>
            <dd className="mt-1 font-mono text-mono-md text-on-surface">
              {transferId}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-on-surface-variant">Flow Type</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {transfer.flowType.toUpperCase()}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-on-surface-variant">Status</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {transfer.status}
            </dd>
          </div>
          <div>
            <dt className="font-label text-label text-on-surface-variant">Lines</dt>
            <dd className="mt-1 font-body text-body-md text-on-surface">
              {transfer.lines.length}
            </dd>
          </div>
        </dl>
      </div>

      {/* Open Inspection Case form — Level 1 office elevation */}
      <div className="mt-6 rounded-md bg-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
          Open Inspection Case
        </h2>
        <p className="mt-1 font-body text-body-sm text-on-surface-variant">
          Select a transfer line and provide party context to open a new
          inspection case. Context type is always{" "}
          <span className="font-mono text-mono-md">transfer</span>.
        </p>

        <form action={handleOpenCase} className="mt-4 space-y-4">
          {/* Source line selection — maps to sourceRefId (transfer line UUID) */}
          <div>
            <label
              htmlFor="sourceRefId"
              className="block font-label text-label text-on-surface-variant"
            >
              Transfer Line{" "}
              <span aria-hidden="true" className="text-action-blue">
                *
              </span>
              <span className="sr-only">(required)</span>
            </label>
            {transfer.lines.length === 0 ? (
              <p className="mt-1 font-body text-body-md text-status-neutral">
                No lines available on this transfer.
              </p>
            ) : (
              <select
                id="sourceRefId"
                name="sourceRefId"
                required
                className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-white px-3 font-mono text-mono-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select a transfer line…</option>
                {transfer.lines.map((line: TransferLineRow) => (
                  <option key={line.id} value={line.id}>
                    {line.id} — Lot: {line.lotId} / Item: {line.itemId}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Lot ID — pre-populate hint text, user must enter for validation */}
          <div>
            <label
              htmlFor="open-lotId"
              className="block font-label text-label text-on-surface-variant"
            >
              Lot ID{" "}
              <span aria-hidden="true" className="text-action-blue">
                *
              </span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="open-lotId"
              name="lotId"
              type="text"
              required
              placeholder="UUID of the lot being inspected"
              className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-white px-3 font-mono text-mono-md text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Item ID */}
          <div>
            <label
              htmlFor="open-itemId"
              className="block font-label text-label text-on-surface-variant"
            >
              Item ID{" "}
              <span aria-hidden="true" className="text-action-blue">
                *
              </span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="open-itemId"
              name="itemId"
              type="text"
              required
              placeholder="UUID of the item being inspected"
              className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-white px-3 font-mono text-mono-md text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Party ID */}
          <div>
            <label
              htmlFor="open-partyId"
              className="block font-label text-label text-on-surface-variant"
            >
              Party ID{" "}
              <span aria-hidden="true" className="text-action-blue">
                *
              </span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="open-partyId"
              name="partyId"
              type="text"
              required
              placeholder="UUID of the associated party"
              className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-white px-3 font-mono text-mono-md text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Hidden contextType — always 'transfer' for this page */}
          <input type="hidden" name="contextType" value="transfer" />

          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded bg-action-blue px-6 font-label text-label text-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Open Inspection Case
          </button>
        </form>
      </div>

      {/* Resolve Inspection Case form — Level 1 office elevation */}
      <div className="mt-6 rounded-md bg-white shadow-elevation-1 p-6">
        <h2 className="font-heading font-semibold text-data-display text-on-surface">
          Resolve Inspection Case
        </h2>
        <p className="mt-1 font-body text-body-sm text-on-surface-variant">
          Enter an existing open inspection case ID and apply a disposition to
          close it.
        </p>

        <form action={handleResolve} className="mt-4 space-y-4">
          {/* Inspection Case ID — the UUID of the open inspection_cases row */}
          <div>
            <label
              htmlFor="resolve-caseId"
              className="block font-label text-label text-on-surface-variant"
            >
              Inspection Case ID{" "}
              <span aria-hidden="true" className="text-action-blue">
                *
              </span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="resolve-caseId"
              name="caseId"
              type="text"
              required
              // Pre-fill with just-opened case ID if available from searchParams.
              defaultValue={openedCaseId ?? ""}
              placeholder="UUID of the open inspection case"
              className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-white px-3 font-mono text-mono-md text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Disposition Type — transfer-applicable values per design.md §6.1 §6.3 */}
          <div>
            <label
              htmlFor="dispositionType"
              className="block font-label text-label text-on-surface-variant"
            >
              Disposition Type{" "}
              <span aria-hidden="true" className="text-action-blue">
                *
              </span>
              <span className="sr-only">(required)</span>
            </label>
            <select
              id="dispositionType"
              name="dispositionType"
              required
              className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-white px-3 font-body text-body-md text-on-surface focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Select disposition…</option>
              {TRANSFER_DISPOSITIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity Affected */}
          <div>
            <label
              htmlFor="quantityAffected"
              className="block font-label text-label text-on-surface-variant"
            >
              Quantity Affected{" "}
              <span aria-hidden="true" className="text-action-blue">
                *
              </span>
              <span className="sr-only">(required)</span>
            </label>
            <input
              id="quantityAffected"
              name="quantityAffected"
              type="number"
              required
              min="0.0001"
              step="0.0001"
              placeholder="Quantity subject to this disposition"
              className="mt-1 h-11 w-full rounded border border-outline-variant/30 bg-white px-3 font-mono text-mono-md text-on-surface placeholder:font-body placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Notes — optional */}
          <div>
            <label
              htmlFor="notes"
              className="block font-label text-label text-on-surface-variant"
            >
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Optional notes or reason for this disposition"
              className="mt-1 w-full rounded border border-outline-variant/30 bg-white px-3 py-2 font-body text-body-md text-on-surface placeholder:text-status-neutral focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          <button
            type="submit"
            className="flex h-11 items-center justify-center rounded bg-action-blue px-6 font-label text-label text-white hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Resolve Inspection Case
          </button>
        </form>
      </div>
    </div>
  );
}
